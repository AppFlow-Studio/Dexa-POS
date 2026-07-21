import type { RefundJournalEntry } from "@/services/refundJournal";
import { create } from "zustand";

interface RefundRecoveryState {
  pendingJournals: RefundJournalEntry[];
  hydrate: (journals: RefundJournalEntry[]) => void;
  add: (journal: RefundJournalEntry) => void;
  consume: (journalId: string) => void;
  clear: () => void;
}

export const useRefundRecoveryStore = create<RefundRecoveryState>((set) => ({
  pendingJournals: [],
  hydrate: (journals) => set({ pendingJournals: journals }),
  add: (journal) =>
    set((s) => {
      // Dedupe by id — re-entering verifying for the same journal is a no-op.
      if (s.pendingJournals.some((j) => j.id === journal.id)) return s;
      return { pendingJournals: [...s.pendingJournals, journal] };
    }),
  consume: (journalId) =>
    set((s) => ({
      pendingJournals: s.pendingJournals.filter((j) => j.id !== journalId),
    })),
  clear: () => set({ pendingJournals: [] }),
}));
