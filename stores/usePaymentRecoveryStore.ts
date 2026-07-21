import { create } from "zustand";
import type { PaymentJournalEntry } from "@/services/paymentJournal";

interface PaymentRecoveryState {
  pendingJournals: PaymentJournalEntry[];
  hydrate: (journals: PaymentJournalEntry[]) => void;
  add: (journal: PaymentJournalEntry) => void;
  consume: (journalId: string) => void;
  clear: () => void;
}

export const usePaymentRecoveryStore = create<PaymentRecoveryState>((set) => ({
  pendingJournals: [],
  hydrate: (journals) => set({ pendingJournals: journals }),
  add: (journal) =>
    set((s) => {
      // Dedupe by id (re-entering verifying for the same journal is a no-op)
      if (s.pendingJournals.some((j) => j.id === journal.id)) return s;
      return { pendingJournals: [...s.pendingJournals, journal] };
    }),
  consume: (journalId) =>
    set((s) => ({
      pendingJournals: s.pendingJournals.filter((j) => j.id !== journalId),
    })),
  clear: () => set({ pendingJournals: [] }),
}));
