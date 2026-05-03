/**
 * Wave Cat-B: payment-journal lifecycle for the adoption recovery path.
 *
 * Locks in:
 * - writePaymentJournal seeds entry as 'initiated' with a stable idempotencyKey
 * - updatePaymentJournal('terminal_approved') is what crash-recovery surfaces
 * - getIncompleteJournals returns initiated + terminal_approved (skips completed/failed)
 * - completePaymentJournal moves entry out of recovery (Mark Complete adoption path)
 * - failPaymentJournal moves entry out of recovery (Try Again gating)
 * - Adoption: matched server row + completePaymentJournal does NOT trigger any
 *   process_payment RPC (verified by mock)
 */

const mockMemStore: Record<string, unknown> = {};

jest.mock("@/lib/storage", () => ({
  getSyncJSON: jest.fn(<T,>(k: string) => mockMemStore[k] as T | undefined),
  setSyncJSON: jest.fn((k: string, v: unknown) => {
    mockMemStore[k] = v;
  }),
}));

const mockUuidState = { counter: 0 };
jest.mock("uuid", () => ({
  v4: () => {
    mockUuidState.counter += 1;
    const n = mockUuidState.counter.toString().padStart(8, "0");
    return `${n}-aaaa-4aaa-8aaa-aaaaaaaaaaaa`;
  },
}));

const mockProcessPayment = jest.fn();
jest.mock("@/services/orderService", () => ({
  OrderService: {
    processPayment: (...args: unknown[]) => mockProcessPayment(...args),
  },
}));

import {
    completePaymentJournal,
    failPaymentJournal,
    getIncompleteJournals,
    getJournalById,
    pruneOldJournals,
    updatePaymentJournal,
    writePaymentJournal,
} from "@/services/paymentJournal";

beforeEach(() => {
  for (const k of Object.keys(mockMemStore)) delete mockMemStore[k];
  mockUuidState.counter = 0;
  mockProcessPayment.mockReset();
});

describe("paymentJournal — lifecycle", () => {
  it("writePaymentJournal seeds 'initiated' and respects a caller-supplied idempotencyKey", () => {
    const key = "deadbeef-0000-4000-8000-000000000000";
    const id = writePaymentJournal({
      orderId: "order-1",
      amount: 25,
      paymentMethod: "card",
      idempotencyKey: key,
    });
    const journal = getJournalById(id);
    expect(journal?.status).toBe("initiated");
    expect(journal?.idempotencyKey).toBe(key);
    expect(journal?.amount).toBe(25);
  });

  it("updatePaymentJournal moves entry to terminal_approved with terminalTxnId", () => {
    const id = writePaymentJournal({
      orderId: "order-1",
      amount: 25,
      paymentMethod: "card",
      idempotencyKey: "k",
    });
    updatePaymentJournal(id, {
      status: "terminal_approved",
      terminalTxnId: "txn-9",
    });
    const journal = getJournalById(id);
    expect(journal?.status).toBe("terminal_approved");
    expect(journal?.terminalTxnId).toBe("txn-9");
  });

  it("getIncompleteJournals returns initiated + terminal_approved entries", () => {
    const initId = writePaymentJournal({
      orderId: "o1",
      amount: 10,
      paymentMethod: "card",
      idempotencyKey: "a",
    });
    const approvedId = writePaymentJournal({
      orderId: "o2",
      amount: 20,
      paymentMethod: "card",
      idempotencyKey: "b",
    });
    updatePaymentJournal(approvedId, { status: "terminal_approved" });
    const completedId = writePaymentJournal({
      orderId: "o3",
      amount: 30,
      paymentMethod: "card",
      idempotencyKey: "c",
    });
    completePaymentJournal(completedId, "pay-3");

    const incomplete = getIncompleteJournals();
    const incompleteIds = incomplete.map((j) => j.id).sort();
    expect(incompleteIds).toEqual([initId, approvedId].sort());
  });

  it("completePaymentJournal removes entry from incomplete list (post-adoption)", () => {
    const id = writePaymentJournal({
      orderId: "o1",
      amount: 10,
      paymentMethod: "card",
      idempotencyKey: "k",
    });
    updatePaymentJournal(id, { status: "terminal_approved" });
    expect(getIncompleteJournals()).toHaveLength(1);

    completePaymentJournal(id, "server-payment-id-99");
    expect(getIncompleteJournals()).toHaveLength(0);
    const journal = getJournalById(id);
    expect(journal?.status).toBe("completed");
    expect(journal?.backendPaymentId).toBe("server-payment-id-99");
  });

  it("failPaymentJournal removes entry from incomplete list (Try Again path)", () => {
    const id = writePaymentJournal({
      orderId: "o1",
      amount: 10,
      paymentMethod: "card",
      idempotencyKey: "k",
    });
    updatePaymentJournal(id, { status: "terminal_approved" });

    failPaymentJournal(id, "manual_retry_after_verify");
    expect(getIncompleteJournals()).toHaveLength(0);
    const journal = getJournalById(id);
    expect(journal?.status).toBe("failed");
    expect(journal?.error).toBe("manual_retry_after_verify");
  });
});

describe("paymentJournal — adoption path does NOT trigger process_payment", () => {
  it("completing a terminal_approved journal never calls OrderService.processPayment", () => {
    const id = writePaymentJournal({
      orderId: "o1",
      amount: 10,
      paymentMethod: "card",
      idempotencyKey: "k",
    });
    updatePaymentJournal(id, { status: "terminal_approved" });

    // Simulate adoption: server row matched → just complete the journal
    completePaymentJournal(id, "matched-payment-99");

    // Critical invariant: adoption path is journal-only, no second RPC
    expect(mockProcessPayment).not.toHaveBeenCalled();
  });
});

describe("paymentJournal — pruneOldJournals", () => {
  it("keeps incomplete entries regardless of age", () => {
    const id = writePaymentJournal({
      orderId: "o1",
      amount: 10,
      paymentMethod: "card",
      idempotencyKey: "k",
    });
    updatePaymentJournal(id, { status: "terminal_approved" });

    // Backdate the entry to 30 days old
    const journals = (mockMemStore["payment_journal"] as any[]) ?? [];
    journals[0].createdAt = new Date(
      Date.now() - 30 * 24 * 60 * 60 * 1000,
    ).toISOString();
    mockMemStore["payment_journal"] = journals;

    const prunedCount = pruneOldJournals();
    expect(prunedCount).toBe(0); // never prunes incomplete entries
    expect(getIncompleteJournals()).toHaveLength(1);
  });
});
