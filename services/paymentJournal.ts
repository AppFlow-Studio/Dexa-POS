/**
 * Payment Journal Service
 *
 * Write-ahead log for payment operations stored in MMKV.
 * Ensures crash recovery: if the app crashes mid-payment, on restart
 * we detect incomplete journals and flag them for manual resolution.
 *
 * Lifecycle:
 *   1. Before payment: writeJournal({ status: 'initiated' })
 *   2. Terminal approved: updateJournal({ status: 'terminal_approved', terminalTxnId })
 *   3. Backend synced:   updateJournal({ status: 'completed', backendPaymentId })
 *   4. On failure:       updateJournal({ status: 'failed', error })
 *
 * On app restart: getIncompleteJournals() returns entries stuck in
 * 'initiated' or 'terminal_approved' for operator review.
 */

import { getSyncJSON, setSyncJSON } from "@/lib/storage";
import { v4 as uuidv4 } from "uuid";

const JOURNAL_STORAGE_KEY = "payment_journal";
const JOURNAL_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export type PaymentJournalStatus =
  | "initiated"
  | "terminal_approved"
  | "completed"
  | "failed"
  | "resolved_manually";

export interface PaymentJournalEntry {
  id: string;
  orderId: string;
  dbOrderId?: string;
  amount: number;
  tipAmount?: number;
  paymentMethod: string;
  status: PaymentJournalStatus;
  idempotencyKey: string;
  terminalTxnId?: string;
  backendPaymentId?: string;
  error?: string;
  createdAt: string;
  updatedAt: string;
  splitGroupId?: string;
}

function loadJournals(): PaymentJournalEntry[] {
  return getSyncJSON<PaymentJournalEntry[]>(JOURNAL_STORAGE_KEY) ?? [];
}

function saveJournals(journals: PaymentJournalEntry[]): void {
  setSyncJSON(JOURNAL_STORAGE_KEY, journals);
}

/**
 * Create a new journal entry before starting a payment flow.
 * Returns the journal ID for later updates.
 */
export function writePaymentJournal(params: {
  orderId: string;
  dbOrderId?: string;
  amount: number;
  tipAmount?: number;
  paymentMethod: string;
  idempotencyKey?: string;
  splitGroupId?: string;
}): string {
  const journals = loadJournals();
  const now = new Date().toISOString();
  const entry: PaymentJournalEntry = {
    id: uuidv4(),
    orderId: params.orderId,
    dbOrderId: params.dbOrderId,
    amount: params.amount,
    tipAmount: params.tipAmount,
    paymentMethod: params.paymentMethod,
    status: "initiated",
    idempotencyKey: params.idempotencyKey || uuidv4(),
    splitGroupId: params.splitGroupId,
    createdAt: now,
    updatedAt: now,
  };
  journals.push(entry);
  saveJournals(journals);
  return entry.id;
}

/**
 * Update an existing journal entry as the payment progresses.
 */
export function updatePaymentJournal(
  journalId: string,
  updates: Partial<Pick<
    PaymentJournalEntry,
    "status" | "terminalTxnId" | "backendPaymentId" | "error" | "dbOrderId"
  >>
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
 * Mark a journal as completed after successful backend sync.
 */
export function completePaymentJournal(
  journalId: string,
  backendPaymentId: string,
): void {
  updatePaymentJournal(journalId, {
    status: "completed",
    backendPaymentId,
  });
}

/**
 * Mark a journal as failed.
 */
export function failPaymentJournal(journalId: string, error: string): void {
  updatePaymentJournal(journalId, { status: "failed", error });
}

/**
 * Get journals that are incomplete (stuck in initiated or terminal_approved).
 * Called on app restart to detect payments that crashed mid-flow.
 */
export function getIncompleteJournals(): PaymentJournalEntry[] {
  const journals = loadJournals();
  return journals.filter(
    (j) => j.status === "initiated" || j.status === "terminal_approved"
  );
}

/**
 * Get all journals for a specific order.
 */
export function getJournalsForOrder(orderId: string): PaymentJournalEntry[] {
  return loadJournals().filter((j) => j.orderId === orderId);
}

/**
 * Resolve an incomplete journal manually (operator decided it's handled).
 */
export function resolveJournalManually(journalId: string): void {
  updatePaymentJournal(journalId, { status: "resolved_manually" });
}

/**
 * Prune old completed/failed/resolved journals beyond max age.
 */
export function pruneOldJournals(): number {
  const journals = loadJournals();
  const cutoff = Date.now() - JOURNAL_MAX_AGE_MS;
  const terminalStatuses: PaymentJournalStatus[] = [
    "completed",
    "failed",
    "resolved_manually",
  ];
  const kept = journals.filter(
    (j) =>
      !terminalStatuses.includes(j.status) ||
      new Date(j.createdAt).getTime() > cutoff
  );
  const pruned = journals.length - kept.length;
  if (pruned > 0) saveJournals(kept);
  return pruned;
}

/**
 * Get count of incomplete journals (for UI badge).
 */
export function getIncompleteJournalCount(): number {
  return getIncompleteJournals().length;
}
