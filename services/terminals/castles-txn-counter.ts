// ============================================================
// Castles Transaction Counter
// File: services/terminals/castles-txn-counter.ts
// ============================================================
// 3-layer counter: MMKV (fast path) → Supabase (recovery) → payment_terminals (cold boot).
// Manages a 6-digit sequential counter per terminal, scoped per batch.
// txnPosTxnId must be unique per request ("000001"–"999999").
// ============================================================

import { storage } from '@/lib/storage';
import { SupabaseClient } from '@supabase/supabase-js';

const STORAGE_PREFIX = 'castles_counter:';
const SYNC_KEY_SUFFIX = ':last_sync';
const MIN_COUNTER = 1;
const MAX_COUNTER = 999999;
const DEFAULT_SYNC_EVERY_N = 10;

// ============================================================
// Types
// ============================================================

export interface CastlesTxnCounterConfig {
  terminalId: string;
  supabaseClient: SupabaseClient;
  syncEveryN?: number;
}

// ============================================================
// CastlesTxnCounter
// ============================================================

export class CastlesTxnCounter {
  private counter = 0;
  private sinceLastSync = 0;
  private _initialized = false;

  private readonly terminalId: string;
  private readonly supabase: SupabaseClient;
  private readonly syncEveryN: number;
  private readonly storageKey: string;
  private readonly syncKey: string;

  constructor(config: CastlesTxnCounterConfig) {
    this.terminalId = config.terminalId;
    this.supabase = config.supabaseClient;
    this.syncEveryN = config.syncEveryN ?? DEFAULT_SYNC_EVERY_N;
    this.storageKey = STORAGE_PREFIX + this.terminalId;
    this.syncKey = STORAGE_PREFIX + this.terminalId + SYNC_KEY_SUFFIX;
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  /**
   * Load counter value using 3-layer strategy:
   * 1. MMKV (fast, works offline — warm boot)
   * 2. If MMKV has value, background-reconcile with DB
   * 3. If MMKV empty (cold boot / reinstall), fetch from payment_terminals
   * 4. Fallback to 0 if offline on first boot
   */
  async initialize(): Promise<void> {
    if (this._initialized) return;

    const mmkvValue = storage.getNumber(this.storageKey);

    if (mmkvValue != null && mmkvValue > 0) {
      // Warm boot — MMKV has a value, use it immediately
      this.counter = mmkvValue;
      this._initialized = true;

      // Background-reconcile with DB (non-blocking)
      this.reconcileWithDb().catch((err) => {
        console.warn('[CastlesTxnCounter] Background reconcile failed:', err);
      });
      return;
    }

    // Cold boot — MMKV empty, try fetching from payment_terminals
    try {
      const { data, error } = await this.supabase
        .from('payment_terminals')
        .select('castles_txn_counter')
        .eq('id', this.terminalId)
        .single();

      if (!error && data?.castles_txn_counter != null) {
        this.counter = data.castles_txn_counter as number;
        storage.set(this.storageKey, this.counter);
        console.log(
          `[CastlesTxnCounter] Cold boot from DB: counter=${this.counter} for terminal=${this.terminalId}`
        );
      } else {
        // DB fetch failed or column missing — start at 0
        this.counter = 0;
        if (error) {
          console.warn('[CastlesTxnCounter] DB fetch failed, starting at 0:', error.message);
        }
      }
    } catch {
      // Offline on first boot — fallback to 0
      this.counter = 0;
      console.warn('[CastlesTxnCounter] Offline on cold boot, starting at 0');
    }

    this._initialized = true;
  }

  /**
   * Increment counter, persist to MMKV, return 6-digit zero-padded string.
   * Wraps 999999 → 000001 (skips 000000).
   * Fires non-blocking DB sync every N transactions.
   */
  next(): string {
    if (!this._initialized) {
      throw new Error('[CastlesTxnCounter] Not initialized. Call await initialize() first.');
    }

    this.counter += 1;
    if (this.counter > MAX_COUNTER) {
      this.counter = MIN_COUNTER;
    }

    // Synchronous MMKV write — atomic, flushed before returning
    storage.set(this.storageKey, this.counter);

    // Periodic non-blocking sync to DB
    this.sinceLastSync += 1;
    if (this.sinceLastSync >= this.syncEveryN) {
      this.sinceLastSync = 0;
      this.syncToDb().catch((err) => {
        console.warn('[CastlesTxnCounter] Periodic sync failed:', err);
      });
    }

    return this.counter.toString().padStart(6, '0');
  }

  /**
   * Return current counter value without incrementing.
   */
  current(): string {
    if (!this._initialized) {
      throw new Error('[CastlesTxnCounter] Not initialized. Call await initialize() first.');
    }
    return this.counter.toString().padStart(6, '0');
  }

  /**
   * Reset counter on batch settlement.
   * Persists to MMKV and calls reset_castles_txn_counter RPC.
   */
  async resetOnSettlement(batchNumber?: string): Promise<void> {
    this.counter = 0;
    this.sinceLastSync = 0;
    storage.set(this.storageKey, 0);

    try {
      const { error } = await this.supabase.rpc('reset_castles_txn_counter', {
        p_terminal_id: this.terminalId,
        p_batch_number: batchNumber ?? null,
      });

      if (error) {
        console.error('[CastlesTxnCounter] reset RPC failed:', error);
      } else {
        console.log(
          `[CastlesTxnCounter] Counter reset for terminal=${this.terminalId}` +
            (batchNumber ? ` batch=${batchNumber}` : '')
        );
      }
    } catch (err) {
      console.error('[CastlesTxnCounter] resetOnSettlement failed:', err);
    }
  }

  /**
   * Sync current counter value to payment_terminals table.
   */
  async syncToDb(): Promise<void> {
    try {
      const { error } = await this.supabase
        .from('payment_terminals')
        .update({
          castles_txn_counter: this.counter,
          castles_counter_updated_at: new Date().toISOString(),
        } as any)
        .eq('id', this.terminalId);

      if (error) {
        console.warn('[CastlesTxnCounter] syncToDb failed:', error.message);
      } else {
        storage.set(this.syncKey, this.counter);
      }
    } catch (err) {
      console.warn('[CastlesTxnCounter] syncToDb error:', err);
    }
  }

  /**
   * Reconcile local counter with DB value.
   * If DB counter is higher (another device used this terminal), jump ahead.
   */
  private async reconcileWithDb(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from('payment_terminals')
        .select('castles_txn_counter')
        .eq('id', this.terminalId)
        .single();

      if (error || data?.castles_txn_counter == null) return;

      const dbCounter = data.castles_txn_counter as number;

      if (dbCounter > this.counter) {
        const prev = this.counter;
        this.counter = dbCounter;
        storage.set(this.storageKey, this.counter);
        console.log(
          `[CastlesTxnCounter] Reconciled: ${prev} → ${dbCounter} (another device ahead)`
        );
      } else if (this.counter > dbCounter) {
        // Local is ahead — push to DB
        this.syncToDb().catch(() => {});
      }
    } catch {
      // Silently fail — reconciliation is best-effort
    }
  }
}

// ============================================================
// Factory / Cache
// ============================================================

const counterCache = new Map<string, CastlesTxnCounter>();

/**
 * Get or create a CastlesTxnCounter for the given terminal.
 * Cached by terminalId — subsequent calls with the same terminalId return the same instance.
 */
export function getOrCreateCounter(config: CastlesTxnCounterConfig): CastlesTxnCounter {
  const existing = counterCache.get(config.terminalId);
  if (existing) return existing;

  const counter = new CastlesTxnCounter(config);
  counterCache.set(config.terminalId, counter);
  return counter;
}

/**
 * Clear a specific counter from the cache (e.g., on terminal removal).
 */
export function clearCounterCache(terminalId?: string): void {
  if (terminalId) {
    counterCache.delete(terminalId);
  } else {
    counterCache.clear();
  }
}
