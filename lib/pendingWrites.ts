/**
 * Guards optimistic settings edits against server reads that race them.
 *
 * A settings change is applied locally first and written to the server after.
 * A read already in flight — one that started before the write landed —
 * returns the old value, and applying it flips the control back until the
 * next read flips it forward again. Reads lay `overlay(scope, readStartedAt)`
 * over what they fetched: an edited field stays local until the server has
 * accepted it *and* a read started after that has come back.
 *
 * `scope` separates independent records (a config namespace, a display id);
 * `field` is the key within one.
 */

interface PendingWrite {
  value: unknown;
  writeId: number;
  /** Clock tick when the server accepted the write; null while in flight. */
  confirmedAt: number | null;
}

export interface PendingWrites {
  /** Call as a read starts; pass the result to `overlay`. */
  beginRead(): number;
  /** Record a local edit. Returns its write id for `confirm` / `drop`. */
  record(scope: string, field: string, value: unknown): number;
  /** The server accepted write `writeId`. */
  confirm(scope: string, field: string, writeId: number): void;
  /**
   * The write failed; stop protecting it. Returns false when a newer edit to
   * the field has superseded this one (the caller must not revert it).
   */
  drop(scope: string, field: string, writeId: number): boolean;
  /**
   * Local values a read started at `readStartedAt` must not overwrite. Fields
   * the read already reflects are forgotten.
   */
  overlay(scope: string, readStartedAt: number): Record<string, unknown>;
  clear(): void;
}

export function createPendingWrites(): PendingWrites {
  // One clock for reads and confirmations, so "confirmed before this read
  // started" is a plain comparison.
  let clock = 0;
  let nextWriteId = 0;
  const scopes = new Map<string, Map<string, PendingWrite>>();

  return {
    beginRead: () => ++clock,

    record(scope, field, value) {
      const writeId = ++nextWriteId;
      let fields = scopes.get(scope);
      if (!fields) {
        fields = new Map();
        scopes.set(scope, fields);
      }
      fields.set(field, { value, writeId, confirmedAt: null });
      return writeId;
    },

    confirm(scope, field, writeId) {
      const entry = scopes.get(scope)?.get(field);
      if (entry?.writeId === writeId) entry.confirmedAt = ++clock;
    },

    drop(scope, field, writeId) {
      const fields = scopes.get(scope);
      if (fields?.get(field)?.writeId !== writeId) return false;
      fields.delete(field);
      return true;
    },

    overlay(scope, readStartedAt) {
      const out: Record<string, unknown> = {};
      const fields = scopes.get(scope);
      if (!fields) return out;
      for (const [field, entry] of fields) {
        if (entry.confirmedAt !== null && entry.confirmedAt < readStartedAt) {
          fields.delete(field);
        } else {
          out[field] = entry.value;
        }
      }
      return out;
    },

    clear: () => scopes.clear(),
  };
}
