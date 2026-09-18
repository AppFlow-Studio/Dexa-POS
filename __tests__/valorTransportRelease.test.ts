import { createValorTransport } from "@/services/terminals/valor-transport-factory";
const mockEnabled = { enabled: true, scenario: "healthy" };
jest.mock("@/stores/useValorMockStore", () => ({ useValorMockStore: { getState: () => mockEnabled } }));
jest.mock("@/services/terminals/valor-transport-tcp", () => ({ ValorTcpTransport: class { kind = "tcp"; } }));
jest.mock("@/services/terminals/valor-transport-usb", () => ({ ValorUsbTransport: class { kind = "usb"; } }));
jest.mock("@/services/terminals/valor-transport-mock", () => ({ ValorMockTransport: class { kind = "mock"; }, getValorMockScenario: () => "healthy", setValorMockScenario: jest.fn() }));
const originalDev = __DEV__;
const originalFlag = process.env.EXPO_PUBLIC_VALOR_MOCK;
afterEach(() => {
  (global as any).__DEV__ = originalDev;
  if (originalFlag === undefined) delete process.env.EXPO_PUBLIC_VALOR_MOCK;
  else process.env.EXPO_PUBLIC_VALOR_MOCK = originalFlag;
});
it.each(["usb", "local_socket"] as const)("release ignores persisted/env mocks for %s", (connectionType) => {
  (global as any).__DEV__ = false;
  process.env.EXPO_PUBLIC_VALOR_MOCK = "1";
  expect(createValorTransport({ connectionType, host: "192.0.2.1" })).toMatchObject({ kind: connectionType === "usb" ? "usb" : "tcp" });
});
it("development simulation remains available", () => {
  (global as any).__DEV__ = true;
  expect(createValorTransport({ connectionType: "usb" })).toMatchObject({ kind: "mock" });
});
