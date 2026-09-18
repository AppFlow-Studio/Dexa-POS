/**
 * Payment-integrity regression guard.
 *
 * `chargeActiveTerminal` falls back to a simulated approval when the kiosk has
 * no configured terminal (or an unsupported type). That fallback is a DEV-only
 * convenience for emulators — in a RELEASE build it MUST hard-fail, or an
 * unattended self-service kiosk would mark orders paid without collecting money.
 */
import { chargeActiveTerminal } from "@/services/terminals/chargeActiveTerminal";

// Force the "no terminal configured" branch.
jest.mock("@/hooks/useActiveProcessor", () => ({
  resolveActiveProcessor: () => ({ activeTerminal: null }),
}));
// Native module — stub so the module graph loads under jest.
jest.mock("@/native/AtomBridge", () => ({
  atomBringPosToForeground: jest.fn(),
}));

const baseArgs = {
  amount: 25,
  tipAmount: 0,
  orderId: "local-1",
  dbOrderId: "db-1",
  supabase: {} as any,
};

describe("chargeActiveTerminal simulated-approval guard", () => {
  const realDev = (global as any).__DEV__;
  afterEach(() => {
    (global as any).__DEV__ = realDev;
  });

  it("RELEASE build: no terminal → hard fail, never a simulated approval", async () => {
    (global as any).__DEV__ = false;
    const res = await chargeActiveTerminal(baseArgs);
    expect(res.ok).toBe(false);
    expect(res.terminalResponse).toBeUndefined();
    expect(res.message).toMatch(/no payment terminal/i);
  });

  it("DEV build: no terminal → simulated approval (emulator workflow preserved)", async () => {
    (global as any).__DEV__ = true;
    const res = await chargeActiveTerminal(baseArgs);
    expect(res.ok).toBe(true);
    expect(res.terminalResponse).toEqual({ simulated: true, amount: 25 });
  });
});
