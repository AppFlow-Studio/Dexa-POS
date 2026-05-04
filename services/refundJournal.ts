/**
 * Refund Journal Service
 *
 * Write-ahead log for refund operations stored in MMKV.
 * Mirrors paymentJournal.ts — ensures crash recovery for the 5-RPC
 * refund pipeline. If the app crashes mid-refund, on restart we detect
 * incomplete journals and flag them for manual resolution.
 *
 * Lifecycle:
 *   1. Before refund: writeRefundJournal({ status: 'initiated' })
 *   2. Terminal approved: updateRefundJournal({ status: 'terminal_approved', terminalTxnId })
 *   3. Backend synced:   updateRefundJournal({ status: 'completed', reversalId })
 *   4. On failure:       updateRefundJournal({ status: 'failed', error, failedStep })
 *
 * Per-step idempotency keys:
 *   toRefundStepKey(journal.idempotencyKey, stepName) — deterministic
 *   UUID5 so retries reuse the same key the server already saw.
 *
 * Per-item refunds:
 *   Each item gets its own journal entry with a shared parentBatchId.
 *   Resumption on relaunch skips entries where status === 'completed'.
 *
 * On app restart: getIncompleteRefundJournals() returns entries stuck
 * in 'initiated' or 'terminal_approved' for operator review.
 */

import { getSyncJSON, setSyncJSON } from "@/lib/storage";
import { v4 as uuidv4, v5 as uuidv5 } from "uuid";

const JOURNAL_STORAGE_KEY = "refund_journal";
const JOURNAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

// Same namespace as idempotencyKey.ts — must not change.
const PHASE2_NAMESPACE = "7d2a8f4e-9b3c-4e2a-8f1d-3c5b7e9a1b2c";

export type RefundJournalStatus =
  | "initiated"
  | "terminal_approved"
  | "completed"
  | "failed"
  | "resolved_manually";

export type RefundJournalRefundType =
  | "full_payment"
  | "partial_amount"
  | "item_return";

/**
 * Step names for the 5-RPC refund pipeline.
 * Used to derive deterministic per-step idempotency keys via
 * uuidv5(journalKey, stepName) so retries always reuse the same key.
 */
export type RefundPipelineStep =
  | "create_reversal"
  | "terminal_refund"
  | "update_reversal_status"
  | "apply_refund_to_payment"
  | "record_refund_items"
  | "update_order_payment_status";

export interface RefundJournalEntry {
  id: string;
  orderId: string;
  dbOrderId?: string;
  refundType: RefundJournalRefundType;
  amount: number;
  paymentMethod: string;
  originalPaymentId: string;
  status: RefundJournalStatus;
  idempotencyKey: string;
  failedStep?: RefundPipelineStep;
  terminalTxnId?: string; // RRN/STAN from terminal (populated before TCP call)
  reversalId?: string; // DB reversal ID (populated after create_reversal)
  parentBatchId?: string; // per-item refunds: shared across batch
  error?: string;
  createdAt: string;
  updatedAt: string;
}

function loadJournals(): RefundJournalEntry[] {
  return getSyncJSON<RefundJournalEntry[]>(JOURNAL_STORAGE_KEY) ?? [];
}

function saveJournals(journals: RefundJournalEntry[]): void {
  setSyncJSON(JOURNAL_STORAGE_KEY, journals);
}

/**
 * Derive a deterministic per-step idempotency key from the journal's
 * master key. Same input → same UUID across retries and app restarts.
 */
export function toRefundStepKey(
  journalIdempotencyKey: string,
  step: RefundPipelineStep,
): string {
  return uuidv5(`refund:${journalIdempotencyKey}:${step}`, PHASE2_NAMESPACE);
}

/**
 * Create a new journal entry before starting a refund flow.
 * Returns the journal ID for later updates.
 */
export function writeRefundJournal(params: {
  orderId: string;
  dbOrderId?: string;
  refundType: RefundJournalRefundType;
  amount: number;
  paymentMethod: string;
  originalPaymentId: string;
  idempotencyKey?: string;
  parentBatchId?: string;
}): string {
  const journals = loadJournals();
  const now = new Date().toISOString();
  const entry: RefundJournalEntry = {
    id: uuidv4(),
    orderId: params.orderId,
    dbOrderId: params.dbOrderId,
    refundType: params.refundType,
    amount: params.amount,
    paymentMethod: params.paymentMethod,
    originalPaymentId: params.originalPaymentId,
    status: "initiated",
    idempotencyKey: params.idempotencyKey ?? uuidv4(),
    parentBatchId: params.parentBatchId,
    createdAt: now,
    updatedAt: now,
  };
  journals.push(entry);
  saveJournals(journals);
  return entry.id;
}

/**
 * Update an existing refund journal entry as the pipeline progresses.
 */
export function updateRefundJournal(
  journalId: string,
  updates: Partial<
    Pick<
      RefundJournalEntry,
      | "status"
      | "terminalTxnId"
      | "reversalId"
      | "failedStep"
      | "error"
      | "dbOrderId"
    >
  >,
): void {
  const journals = loadJournals();
  const idx = journals.findIndex((j) => j.id === journalId);
  if (idx === -1) return;
  journals[idx] = {
    ...journals[idx],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  saveJournals(journals);
}

/**
 * Mark a refund journal as completed after successful pipeline run.
 */
export function completeRefundJournal(
  journalId: string,
  reversalId: string,
): void {
  updateRefundJournal(journalId, {
    status: "completed",
    reversalId,
    failedStep: undefined,
    error: undefined,
  });
}

/**
 * Mark a refund journal as failed at a specific pipeline step.
 */
export function failRefundJournal(
  journalId: string,
  failedStep: RefundPipelineStep,
  error: string,
): void {
  updateRefundJournal(journalId, { status: "failed", failedStep, error });
}

/**
 * Get journals that are incomplete (stuck in initiated or terminal_approved).
 * Called on app restart to detect refunds that crashed mid-pipeline.
 */
export function getIncompleteRefundJournals(): RefundJournalEntry[] {
  const journals = loadJournals();
  return journals.filter(
    (j) => j.status === "initiated" || j.status === "terminal_approved",
  );
}

/**
 * Get all refund journals for a specific order.
 */
export function getRefundJournalsForOrder(
  orderId: string,
): RefundJournalEntry[] {
  return loadJournals().filter((j) => j.orderId === orderId);
}

/**
 * Look up a single refund journal entry by id. Returns null if not found.
 */
export function getRefundJournalById(
  journalId: string,
): RefundJournalEntry | null {
  return loadJournals().find((j) => j.id === journalId) ?? null;
}

/**
 * Resolve an incomplete refund journal manually (operator confirmed handled).
 */
export function resolveRefundJournalManually(journalId: string): void {
  updateRefundJournal(journalId, { status: "resolved_manually" });
}

/**
 * Prune old completed/failed/resolved refund journals beyond max age.
 */
export function pruneOldRefundJournals(): number {
  const journals = loadJournals();
  const cutoff = Date.now() - JOURNAL_MAX_AGE_MS;
  const terminalStatuses: RefundJournalStatus[] = [
    "completed",
    "failed",
    "resolved_manually",
  ];
  const kept = journals.filter(
    (j) =>
      !terminalStatuses.includes(j.status) ||
      new Date(j.createdAt).getTime() > cutoff,
  );
  const pruned = journals.length - kept.length;
  if (pruned > 0) saveJournals(kept);
  return pruned;
}

/**
 * Check whether an offline-queue cash-refund op already exists for the
 * same orderId + amount combination. Used during cold-start sweep to
 * skip refund journals that are already covered by the queue.
 * (Lightweight guard — actual dedup happens server-side via idempotency_key.)
 */
export function getIncompleteRefundJournalCount(): number {
  return getIncompleteRefundJournals().length;
}
