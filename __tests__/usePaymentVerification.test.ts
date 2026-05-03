/**
 * Wave Cat-B (C4): usePaymentVerification hook polling state machine.
 *
 * Locks in:
 * - matched response transitions matchedPayment + halts polling
 * - unmatched response unlocks Try Again (canRetryNow=true)
 * - all-polls-timed-out leaves canRetryNow=false (fail-conservative)
 * - markComplete completes journal + consumes from recovery store + setView('success')
 * - retryWithNewCharge fails journal + consumes + setView('card')
 */

// uuid is ESM-only; jest-expo doesn't transform it
jest.mock("uuid", () => ({
  v4: () => "00000000-0000-4000-8000-000000000000",
  v5: (n: string, ns: string) => `${ns}:${n}`,
}));

const mockSubscribers: Array<() => void> = [];
const mockQuality = { current: "fast" as "fast" | "degraded" | "slow" | "probing" };

jest.mock("@/lib/network/connectionQuality", () => ({
  connectionQuality: {
    get: () => mockQuality.current,
    subscribe: (l: () => void) => {
      mockSubscribers.push(l);
      return () => {
        const i = mockSubscribers.indexOf(l);
        if (i !== -1) mockSubscribers.splice(i, 1);
      };
    },
  },
}));

const mockRunWithDeadline = jest.fn();
jest.mock("@/lib/network/runWithDeadline", () => ({
  runWithDeadline: (...args: unknown[]) => mockRunWithDeadline(...args),
}));

const mockSupabaseClient = {
  rpc: jest.fn(() => ({
    abortSignal: jest.fn(() =>
      Promise.resolve({ data: { matched: false }, error: null }),
    ),
  })),
};

const mockOrderState = {
  dbOrderIdIndex: {} as Record<string, string>,
  syncOrderFromBackendComplete: jest.fn(),
};

jest.mock("@/stores/useOrderStore", () => ({
  getOrderStoreSupabaseClient: () => mockSupabaseClient,
  useOrderStore: { getState: () => mockOrderState },
}));

const mockJournalCalls = {
  complete: jest.fn(),
  fail: jest.fn(),
};
jest.mock("@/services/paymentJournal", () => ({
  completePaymentJournal: (...args: unknown[]) => mockJournalCalls.complete(...args),
  failPaymentJournal: (...args: unknown[]) => mockJournalCalls.fail(...args),
}));

import { renderHook, act } from "@testing-library/react-native";
import { usePaymentVerification } from "@/hooks/usePaymentVerification";
import { usePaymentRecoveryStore } from "@/stores/usePaymentRecoveryStore";
import { usePaymentStore, type PaymentVerificationState } from "@/stores/usePaymentStore";

const KEY = "11111111-1111-4111-8111-111111111111";
const JOURNAL_ID = "j-1";

function makeVerification(
  overrides?: Partial<PaymentVerificationState>,
): PaymentVerificationState {
  return {
    journalId: JOURNAL_ID,
    idempotencyKey: KEY,
    orderDbId: "db-order-1",
    amountCents: 1234,
    startedAt: Date.now(),
    reason: "deadline_exceeded",
    ...overrides,
  };
}

function setVerification(v: PaymentVerificationState | null) {
  usePaymentStore.getState().setVerification(v);
}

beforeEach(() => {
  mockRunWithDeadline.mockReset();
  mockJournalCalls.complete.mockReset();
  mockJournalCalls.fail.mockReset();
  mockOrderState.syncOrderFromBackendComplete.mockReset();
  mockOrderState.dbOrderIdIndex = {};
  mockSubscribers.length = 0;
  mockQuality.current = "fast";
  // Reset payment + recovery stores
  usePaymentStore.getState().setVerification(null);
  usePaymentStore.getState().setView("review");
  usePaymentRecoveryStore.getState().clear();
});

describe("usePaymentVerification — basic state", () => {
  it("isVerifying is false when no verification entry is set", () => {
    const { result } = renderHook(() => usePaymentVerification());
    expect(result.current.isVerifying).toBe(false);
  });

  it("isVerifying becomes true when a verification entry is set", () => {
    mockRunWithDeadline.mockResolvedValue({ data: { matched: false }, error: null });
    setVerification(makeVerification());
    const { result } = renderHook(() => usePaymentVerification());
    expect(result.current.isVerifying).toBe(true);
    expect(result.current.totalMs).toBeGreaterThan(0);
  });
});

describe("usePaymentVerification — matched response", () => {
  it("when poll returns matched=true, matchedPayment is set", async () => {
    mockRunWithDeadline.mockResolvedValue({
      data: { matched: true, payment_id: "pay-99", idempotency_key: KEY },
      error: null,
    });
    setVerification(makeVerification());
    const { result } = renderHook(() => usePaymentVerification());

    await act(async () => {
      await result.current.manualCheckNow();
    });

    expect(result.current.matchedPayment?.matched).toBe(true);
    expect(result.current.matchedPayment?.payment_id).toBe("pay-99");
  });
});

describe("usePaymentVerification — unmatched response unlocks retry", () => {
  it("matched=false sets canRetryNow=true", async () => {
    mockRunWithDeadline.mockResolvedValue({
      data: { matched: false },
      error: null,
    });
    setVerification(makeVerification());
    const { result } = renderHook(() => usePaymentVerification());

    await act(async () => {
      await result.current.manualCheckNow();
    });

    expect(result.current.matchedPayment?.matched).toBe(false);
    expect(result.current.canRetryNow).toBe(true);
  });
});

describe("usePaymentVerification — markComplete adoption", () => {
  it("calls completePaymentJournal, consumes, and sets view=success", async () => {
    mockRunWithDeadline.mockResolvedValue({
      data: { matched: true, payment_id: "pay-99" },
      error: null,
    });
    mockOrderState.dbOrderIdIndex = { "db-order-1": "local-order-1" };

    setVerification(makeVerification());
    usePaymentRecoveryStore.getState().add({
      id: JOURNAL_ID,
      orderId: "local-order-1",
      amount: 12.34,
      paymentMethod: "card",
      status: "terminal_approved",
      idempotencyKey: KEY,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => usePaymentVerification());
    await act(async () => {
      await result.current.manualCheckNow();
    });
    act(() => {
      result.current.markComplete();
    });

    expect(mockJournalCalls.complete).toHaveBeenCalledWith(JOURNAL_ID, "pay-99");
    expect(usePaymentRecoveryStore.getState().pendingJournals).toHaveLength(0);
    expect(usePaymentStore.getState().view).toBe("success");
    expect(usePaymentStore.getState().verification).toBeNull();
  });
});

describe("usePaymentVerification — retryWithNewCharge", () => {
  it("calls failPaymentJournal, consumes, and sets view=card", () => {
    setVerification(makeVerification());
    usePaymentRecoveryStore.getState().add({
      id: JOURNAL_ID,
      orderId: "local-order-1",
      amount: 12.34,
      paymentMethod: "card",
      status: "terminal_approved",
      idempotencyKey: KEY,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const { result } = renderHook(() => usePaymentVerification());
    act(() => {
      result.current.retryWithNewCharge();
    });

    expect(mockJournalCalls.fail).toHaveBeenCalledWith(
      JOURNAL_ID,
      "manual_retry_after_verify",
    );
    expect(usePaymentRecoveryStore.getState().pendingJournals).toHaveLength(0);
    expect(usePaymentStore.getState().view).toBe("card");
    expect(usePaymentStore.getState().verification).toBeNull();
  });
});

describe("usePaymentVerification — connection-quality-aware totalMs", () => {
  it("starts with fast budget when quality=fast", () => {
    mockQuality.current = "fast";
    setVerification(makeVerification());
    const { result } = renderHook(() => usePaymentVerification());
    expect(result.current.totalMs).toBe(8000);
  });

  it("starts with slow budget when quality=slow at mount", () => {
    mockQuality.current = "slow";
    setVerification(makeVerification());
    const { result } = renderHook(() => usePaymentVerification());
    expect(result.current.totalMs).toBe(30_000);
  });
});

describe("usePaymentVerification — queue auto-promotion (Gap 1)", () => {
  it("openForVerification sets verification + view from a journal entry", () => {
    const journal = {
      id: "j-2",
      orderId: "local-order-2",
      dbOrderId: "db-order-2",
      amount: 50.0,
      paymentMethod: "card",
      status: "terminal_approved" as const,
      idempotencyKey: "key-2",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    usePaymentStore.getState().openForVerification(journal);

    const state = usePaymentStore.getState();
    expect(state.isOpen).toBe(true);
    expect(state.view).toBe("verifying");
    expect(state.verification?.journalId).toBe("j-2");
    expect(state.verification?.idempotencyKey).toBe("key-2");
    expect(state.verification?.amountCents).toBe(5000);
    expect(state.verification?.reason).toBe("crash_recovery");
  });

  it("after markComplete on the head, the next pending journal is auto-promoted", async () => {
    mockRunWithDeadline.mockResolvedValue({
      data: { matched: true, payment_id: "pay-99" },
      error: null,
    });
    mockOrderState.dbOrderIdIndex = { "db-order-1": "local-order-1" };

    // Two pending journals; verifying the first
    const j1 = {
      id: "j-1",
      orderId: "local-order-1",
      dbOrderId: "db-order-1",
      amount: 12.34,
      paymentMethod: "card",
      status: "terminal_approved" as const,
      idempotencyKey: "key-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const j2 = {
      id: "j-2",
      orderId: "local-order-2",
      dbOrderId: "db-order-2",
      amount: 25.0,
      paymentMethod: "card",
      status: "terminal_approved" as const,
      idempotencyKey: "key-2",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    usePaymentRecoveryStore.getState().add(j1);
    usePaymentRecoveryStore.getState().add(j2);
    setVerification({
      journalId: j1.id,
      idempotencyKey: j1.idempotencyKey,
      orderDbId: j1.dbOrderId,
      amountCents: 1234,
      startedAt: Date.now(),
      reason: "crash_recovery",
    });

    const { result } = renderHook(() => usePaymentVerification());
    await act(async () => {
      await result.current.manualCheckNow();
    });
    act(() => {
      result.current.markComplete();
    });

    // j1 consumed, j2 promoted into the verification slot
    expect(mockJournalCalls.complete).toHaveBeenCalledWith("j-1", "pay-99");
    expect(usePaymentRecoveryStore.getState().pendingJournals).toEqual([j2]);
    expect(usePaymentStore.getState().view).toBe("verifying");
    expect(usePaymentStore.getState().verification?.journalId).toBe("j-2");
  });

  it("after retryWithNewCharge on the head, the next pending journal is auto-promoted", () => {
    const j1 = {
      id: "j-1",
      orderId: "local-order-1",
      amount: 12.34,
      paymentMethod: "card",
      status: "terminal_approved" as const,
      idempotencyKey: "key-1",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    const j2 = {
      id: "j-2",
      orderId: "local-order-2",
      amount: 25.0,
      paymentMethod: "card",
      status: "terminal_approved" as const,
      idempotencyKey: "key-2",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    usePaymentRecoveryStore.getState().add(j1);
    usePaymentRecoveryStore.getState().add(j2);
    setVerification({
      journalId: j1.id,
      idempotencyKey: j1.idempotencyKey,
      orderDbId: null,
      amountCents: 1234,
      startedAt: Date.now(),
      reason: "deadline_exceeded",
    });

    const { result } = renderHook(() => usePaymentVerification());
    act(() => {
      result.current.retryWithNewCharge();
    });

    expect(mockJournalCalls.fail).toHaveBeenCalledWith(
      "j-1",
      "manual_retry_after_verify",
    );
    expect(usePaymentRecoveryStore.getState().pendingJournals).toEqual([j2]);
    expect(usePaymentStore.getState().view).toBe("verifying");
    expect(usePaymentStore.getState().verification?.journalId).toBe("j-2");
  });

  it("close (resetPaymentState) clears the verification slot so reopen is clean", () => {
    setVerification(makeVerification());
    expect(usePaymentStore.getState().verification).not.toBeNull();
    usePaymentStore.getState().resetPaymentState();
    expect(usePaymentStore.getState().verification).toBeNull();
  });
});
