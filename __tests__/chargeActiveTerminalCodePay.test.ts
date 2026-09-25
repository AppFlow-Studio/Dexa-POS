/**
 * Kiosk CodePay charge — a bridge rejection happens BEFORE CodePay Register is
 * launched (NO_ACTIVITY / BUSY / NO_CODEPAY_REGISTER / LAUNCH_FAILED), so no
 * card was read. It must come back as a clean failure (kiosk voids + lets the
 * customer retry), NOT throw — a throw lands in payOrder's catch as
 * `payorder_exception` and locks the kiosk behind a staff review.
 */
import { chargeActiveTerminal } from "@/services/terminals/chargeActiveTerminal";
import { resolveKioskChargeOutcome } from "@/components/kiosk/shared/chargeOutcome";

jest.mock("@/hooks/useActiveProcessor", () => ({
  resolveActiveProcessor: () => ({
    activeTerminal: { id: "term-cp", terminal_type: "codepay", app_id: "app_1" },
  }),
}));
jest.mock("@/native/AtomBridge", () => ({
  atomBringPosToForeground: jest.fn(),
}));

const mockTransact = jest.fn();
jest.mock("@/native/CodePayBridge", () => ({
  codepayTransact: (...args: unknown[]) => mockTransact(...args),
  isCodePayBridgeAvailable: () => true,
}));

const mockFailJournal = jest.fn();
jest.mock("@/services/paymentJournal", () => ({
  writePaymentJournal: () => "journal-1",
  updatePaymentJournal: jest.fn(),
  failPaymentJournal: (...args: unknown[]) => mockFailJournal(...args),
}));

const baseArgs = {
  amount: 25,
  tipAmount: 0,
  orderId: "local-1",
  dbOrderId: "db-1",
  supabase: {} as any,
};

beforeEach(() => {
  mockTransact.mockReset();
  mockFailJournal.mockReset();
});

describe("chargeActiveTerminal — CodePay launch failure", () => {
  it("bridge rejection → clean ok:false (declined), never a staff hold", async () => {
    mockTransact.mockRejectedValue(new Error("No foreground activity"));
    const res = await chargeActiveTerminal(baseArgs);
    expect(res.ok).toBe(false);
    expect(res.indeterminate).toBeFalsy();
    expect(mockFailJournal).toHaveBeenCalledWith(
      "journal-1",
      expect.stringContaining("terminal_launch_failed"),
    );
    const outcome = resolveKioskChargeOutcome({
      ok: res.ok,
      indeterminate: res.indeterminate,
      message: res.message,
      userCancelled: false,
      terminalType: "codepay",
    });
    expect(outcome.kind).toBe("declined");
  });

  it("timeout with no recoverable query → still indeterminate (staff hold)", async () => {
    mockTransact.mockResolvedValue({
      resultCode: 0,
      responseCode: null,
      responseMsg: "timeout",
      bizData: null,
      timedOut: true,
      canceled: false,
    });
    const res = await chargeActiveTerminal(baseArgs);
    expect(res.ok).toBe(false);
    expect(res.indeterminate).toBe(true);
  });
});
