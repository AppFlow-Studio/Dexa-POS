// Unit tests for the CodePay on-terminal auto-detect coordinator.
//
// The detector surfaces a synthetic internal CodePay terminal (so the POS can
// take payments with no manual setup) ONLY when BOTH are true: the CodePay
// Register app is present (Intent resolves) AND a merchant app_id is configured.
// Otherwise it un-surfaces.

const mockIsRegisterAvailable = jest.fn<Promise<boolean>, []>();
jest.mock("@/native/CodePayBridge", () => ({
  isCodePayBridgeAvailable: () => true,
  codepayIsRegisterAvailable: () => mockIsRegisterAvailable(),
  // getSharedCodePayService (imported transitively by the detector) needs these:
  codepayTransact: jest.fn(),
}));

import { probeCodePayNow } from "@/services/terminals/codepayDetector";
import { useCodePayTerminalStore } from "@/stores/useCodePayTerminalStore";
import { CODEPAY_INTERNAL_TERMINAL_ID } from "@/types/codepay";

beforeEach(() => {
  mockIsRegisterAvailable.mockReset();
  useCodePayTerminalStore.setState({ internalTerminal: null, appId: "app_xyz" });
});

test("surfaces the internal terminal when Register present + app_id set", async () => {
  mockIsRegisterAvailable.mockResolvedValue(true);
  await probeCodePayNow();
  const t = useCodePayTerminalStore.getState().internalTerminal;
  expect(t).not.toBeNull();
  expect(t?.id).toBe(CODEPAY_INTERNAL_TERMINAL_ID);
  expect(t?.terminal_type).toBe("codepay");
  // The Intent app_id must ride on register_id (charge paths read app_id ?? register_id).
  expect(t?.register_id).toBe("app_xyz");
});

test("un-surfaces when the Register app is not present", async () => {
  useCodePayTerminalStore.setState({
    internalTerminal: { id: CODEPAY_INTERNAL_TERMINAL_ID } as any,
    appId: "app_xyz",
  });
  mockIsRegisterAvailable.mockResolvedValue(false);
  await probeCodePayNow();
  expect(useCodePayTerminalStore.getState().internalTerminal).toBeNull();
});

test("never surfaces without an app_id, even if Register is present", async () => {
  useCodePayTerminalStore.setState({ internalTerminal: null, appId: "" });
  mockIsRegisterAvailable.mockResolvedValue(true);
  await probeCodePayNow();
  expect(useCodePayTerminalStore.getState().internalTerminal).toBeNull();
  // Presence was never even consulted (short-circuits on missing app_id).
  expect(mockIsRegisterAvailable).not.toHaveBeenCalled();
});
