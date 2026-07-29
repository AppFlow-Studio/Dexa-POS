// ============================================================
// Valor Transaction Counter
// File: services/terminals/valor-txn-counter.ts
// ============================================================
// 3-layer counter: MMKV (fast) → Supabase (recovery) → payment_terminals (cold boot).
// Produces REQ_TXN_ID — the per-terminal client transaction id echoed back by
// the terminal as MER_TXN_ID (used for response correlation). Mirrors the
// Castles counter; separate MMKV prefix + DB column so the two never collide.
// ============================================================

import { storage } from "@/lib/storage";
import { SupabaseClient } from "@supabase/supabase-js";

const STORAGE_PREFIX = "valor_counter:";
const SYNC_KEY_SUFFIX = ":last_sync";
const MIN_COUNTER = 1;
const MAX_COUNTER = 999999;
const DEFAULT_SYNC_EVERY_N = 10;

export interface ValorTxnCounterConfig {
  terminalId: string;
  supabaseClient: SupabaseClient;
  syncEveryN?: number;
}

export class ValorTxnCounter {
  private counter = 0;
  private sinceLastSync = 0;
  private _initialized = false;

  private readonly terminalId: string;
  private readonly supabase: SupabaseClient;
  private readonly syncEveryN: number;
  private readonly storageKey: string;
  private readonly syncKey: string;

  constructor(config: ValorTxnCounterConfig) {
    this.terminalId = config.terminalId;
    this.supabase = config.supabaseClient;
    this.syncEveryN = config.syncEveryN ?? DEFAULT_SYNC_EVERY_N;
    this.storageKey = STORAGE_PREFIX + this.terminalId;
    this.syncKey = STORAGE_PREFIX + this.terminalId + SYNC_KEY_SUFFIX;
  }

  get isInitialized(): boolean {
    return this._initialized;
  }

  async initialize(): Promise<void> {
    if (this._initialized) return;

    const mmkvValue = storage.getNumber(this.storageKey);
    if (mmkvValue != null && mmkvValue > 0) {
      this.counter = mmkvValue;
      this._initialized = true;
      this.reconcileWithDb().catch((err) => {
        console.warn("[ValorTxnCounter] Background reconcile failed:", err);
      });
      return;
    }

    try {
      const { data, error } = await this.supabase
        .from("payment_terminals")
        .select("valor_txn_counter")
        .eq("id", this.terminalId)
        .single();

      if (!error && (data as any)?.valor_txn_counter != null) {
        this.counter = (data as any).valor_txn_counter as number;
        storage.set(this.storageKey, this.counter);
      } else {
        this.counter = 0;
        if (error) {
          console.warn("[ValorTxnCounter] DB fetch failed, starting at 0:", error.message);
        }
      }
    } catch {
      this.counter = 0;
      console.warn("[ValorTxnCounter] Offline on cold boot, starting at 0");
    }

    this._initialized = true;
  }

  /** Increment, persist to MMKV, return a 6-digit REQ_TXN_ID. Wraps 999999 → 000001. */
  next(): string {
    if (!this._initialized) {
      throw new Error("[ValorTxnCounter] Not initialized. Call await initialize() first.");
    }
    this.counter += 1;
    if (this.counter > MAX_COUNTER) this.counter = MIN_COUNTER;
    storage.set(this.storageKey, this.counter);

    this.sinceLastSync += 1;
    if (this.sinceLastSync >= this.syncEveryN) {
      this.sinceLastSync = 0;
      this.syncToDb().catch((err) => {
        console.warn("[ValorTxnCounter] Periodic sync failed:", err);
      });
    }

    return this.counter.toString().padStart(6, "0");
  }

  current(): string {
    if (!this._initialized) {
      throw new Error("[ValorTxnCounter] Not initialized. Call await initialize() first.");
    }
    return this.counter.toString().padStart(6, "0");
  }

  async syncToDb(): Promise<void> {
    try {
      const { error } = await this.supabase
        .from("payment_terminals")
        .update({
          valor_txn_counter: this.counter,
          valor_counter_updated_at: new Date().toISOString(),
        } as any)
        .eq("id", this.terminalId);

      if (error) console.warn("[ValorTxnCounter] syncToDb failed:", error.message);
      else storage.set(this.syncKey, this.counter);
    } catch (err) {
      console.warn("[ValorTxnCounter] syncToDb error:", err);
    }
  }

  private async reconcileWithDb(): Promise<void> {
    try {
      const { data, error } = await this.supabase
        .from("payment_terminals")
        .select("valor_txn_counter")
        .eq("id", this.terminalId)
        .single();

      if (error || (data as any)?.valor_txn_counter == null) return;
      const dbCounter = (data as any).valor_txn_counter as number;

      if (dbCounter > this.counter) {
        this.counter = dbCounter;
        storage.set(this.storageKey, this.counter);
      } else if (this.counter > dbCounter) {
        this.syncToDb().catch(() => {});
      }
    } catch {
      // best-effort
    }
  }
}

const counterCache = new Map<string, ValorTxnCounter>();

export function getOrCreateValorCounter(config: ValorTxnCounterConfig): ValorTxnCounter {
  const existing = counterCache.get(config.terminalId);
  if (existing) return existing;
  const counter = new ValorTxnCounter(config);
  counterCache.set(config.terminalId, counter);
  return counter;
}

export function clearValorCounterCache(terminalId?: string): void {
  if (terminalId) counterCache.delete(terminalId);
  else counterCache.clear();
}
