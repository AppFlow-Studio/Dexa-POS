// Valor path of the settlement dispatcher (runSettlement -> runValorSettlement).
// Verifies: prepare->settle->finalize wiring, single-attempt (no retry loop),
// pendingFinalize on finalize failure, indeterminate routing, and the
// "RPC not deployed" graceful message.

jest.mock("@/services/terminals/castles-service", () => ({
  getSharedCastlesService: jest.fn(() => ({})),
}));
jest.mock("@/lib/supabase", () => ({ captureRpcError: jest.fn() }));

const mockConnect = jest.fn().mockResolvedValue(undefined);
const mockSettle = jest.fn();
jest.mock("@/services/terminals/valor-service", () => ({
  getSharedValorService: () => ({ connect: mockConnect, settleBatch: mockSettle }),
}));

const mockAddPending = jest.fn().mockResolvedValue(undefined);
jest.mock("@/services/pendingFinalize", () => ({
  addPendingFinalize: (...args: any[]) => mockAddPending(...args),
}));

import { runSettlement, type SettlementInput } from "@/services/settlementService";

function makeSupabase(
  handlers: Record<string, { data?: any; error?: any }>,
): any {
  const rpc = jest.fn((name: string) =>
    Promise.resolve(handlers[name] ?? { data: null, error: { message: `no handler for ${name}` } }),
  );
  return { rpc };
}

const BASE: Omit<SettlementInput, "supabase"> = {
  terminalId: "term-uuid",
  merchantId: "merch-uuid",
  initiatedBy: "user-1",
  terminalType: "valor",
  connectionType: "usb",
  locationId: "loc-uuid",
};

beforeEach(() => {
  mockConnect.mockClear();
  mockSettle.mockClear();
  mockAddPending.mockClear();
});

describe("runValorSettlement", () => {
  it("happy path: prepare -> settle -> finalize marks settled", async () => {
    mockSettle.mockResolvedValue({
      outcome: "settled",
      raw: { STATE: "0", BATCH_NO: 3, TOTAL_TRAN_COUNT: "1", EPI: "2319984097" },
    });
    const supabase = makeSupabase({
      prepare_valor_settlement: { data: { batch_uuid: "b1", batch_id: "VLR-1", payment_count: 1 } },
      finalize_valor_settlement: { data: { success: true, status: "settled", batch_id: "VLR-1", batch_number: "3" } },
    });

    const out = await runSettlement({ ...BASE, supabase });

    expect(mockConnect).toHaveBeenCalledTimes(1);
    expect(mockSettle).toHaveBeenCalledTimes(1); // single attempt, no retry loop
    expect(out.success).toBe(true);
    expect(out.processor).toBe("valor");
    expect(out.batchNumber).toBe("3");
    expect(out.paymentsUpdated).toBe(1);
    expect(out.batchUuid).toBe("b1");
    // finalize got the real terminal response
    const finalizeCall = supabase.rpc.mock.calls.find((c: any[]) => c[0] === "finalize_valor_settlement");
    expect(finalizeCall[1].p_valor_response.STATE).toBe("0");
  });

  it("journals a pending finalize when the finalize RPC fails after a settled close", async () => {
    mockSettle.mockResolvedValue({ outcome: "settled", raw: { STATE: "0", BATCH_NO: 4 } });
    const supabase = makeSupabase({
      prepare_valor_settlement: { data: { batch_uuid: "b2", batch_id: "VLR-2", payment_count: 2 } },
      finalize_valor_settlement: { error: { message: "network down" } },
    });

    const out = await runSettlement({ ...BASE, supabase });

    expect(out.success).toBe(false);
    expect(out.dbWriteFailed).toBe(true);
    expect(mockAddPending).toHaveBeenCalledTimes(1);
    expect(mockAddPending.mock.calls[0][0].processor).toBe("valor");
    expect(mockAddPending.mock.calls[0][0].batchUuid).toBe("b2");
  });

  it("routes an indeterminate settle to finalize with a STATE-less marker (no double settle, no pending journal)", async () => {
    mockSettle.mockResolvedValue({ outcome: "indeterminate", error: "socket closed" });
    const supabase = makeSupabase({
      prepare_valor_settlement: { data: { batch_uuid: "b3", batch_id: "VLR-3", payment_count: 1 } },
      finalize_valor_settlement: { data: { success: false, status: "needs_review", batch_id: "VLR-3" } },
    });

    const out = await runSettlement({ ...BASE, supabase });

    expect(mockSettle).toHaveBeenCalledTimes(1); // never re-fired
    expect(out.success).toBe(false);
    expect(out.status).toBe("needs_review");
    expect(mockAddPending).not.toHaveBeenCalled();
    const finalizeCall = supabase.rpc.mock.calls.find((c: any[]) => c[0] === "finalize_valor_settlement");
    expect(finalizeCall[1].p_valor_response.STATE).toBeNull();
  });

  it("surfaces a clean message when the Valor RPCs are not deployed", async () => {
    const supabase = makeSupabase({
      prepare_valor_settlement: { error: { message: 'function public.prepare_valor_settlement(uuid, uuid, text) does not exist' } },
    });
    const out = await runSettlement({ ...BASE, supabase });
    expect(out.success).toBe(false);
    expect(out.error).toMatch(/not deployed/i);
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it("adopt-aware prepare with nothing_to_settle skips the terminal and reads as reassurance (not an error)", async () => {
    const supabase = makeSupabase({
      prepare_valor_settlement: { data: { branch: "nothing_to_settle", nothing_to_settle: true, payment_count: 0 } },
    });
    const out = await runSettlement({ ...BASE, supabase });
    expect(out.status).toBe("nothing_to_settle");
    expect(out.success).toBe(false);
    expect(out.error).toBeFalsy(); // no error surface -> panel shows reassurance, not "Batchout Failed"
    expect(mockSettle).not.toHaveBeenCalled();
    expect(mockAddPending).not.toHaveBeenCalled();
  });

  it("treats the legacy prepare RAISE as nothing_to_settle (prod still on the old RPC)", async () => {
    const supabase = makeSupabase({
      prepare_valor_settlement: { error: { message: "No unsettled captured Valor payments found for terminal term-uuid." } },
    });
    const out = await runSettlement({ ...BASE, supabase });
    expect(out.status).toBe("nothing_to_settle");
    expect(out.success).toBe(false);
    expect(out.error).toBeFalsy();
    expect(mockSettle).not.toHaveBeenCalled();
  });

  it("routes >1 open Valor batch to a manual reconcile without touching the terminal", async () => {
    const supabase = makeSupabase({
      prepare_valor_settlement: {
        data: {
          branch: "needs_manual",
          payment_count: 0,
          message: "Multiple open Valor batches (2) for this terminal. Reconcile manually.",
        },
      },
    });
    const out = await runSettlement({ ...BASE, supabase });
    expect(out.status).toBe("needs_manual");
    expect(out.requiresSupport).toBe(true);
    expect(out.error).toMatch(/reconcile manually/i);
    expect(mockSettle).not.toHaveBeenCalled();
  });
});
