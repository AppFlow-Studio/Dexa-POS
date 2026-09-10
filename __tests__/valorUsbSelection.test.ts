import { ValorUsbTransport } from "@/services/terminals/valor-transport-usb";
const mockDevices = jest.fn();
const mockOpen = jest.fn();
jest.mock("@sentry/react-native", () => ({ addBreadcrumb: jest.fn() }));
jest.mock("@/modules/castles-usb", () => ({
  listDevices: () => mockDevices(), open: (...args: unknown[]) => mockOpen(...args),
  requestPermission: jest.fn(), close: () => Promise.resolve(), write: jest.fn(),
  addDataListener: () => ({ remove: jest.fn() }), addErrorListener: () => ({ remove: jest.fn() }), addDetachedListener: () => ({ remove: jest.fn() }),
}));
const device = { deviceId: 1, vendorId: 0x1e0e, productId: 1, productName: "VP550", hasPermission: true };
it("opens the only compatible USB terminal", async () => {
  mockDevices.mockResolvedValue([device]);
  const transport = new ValorUsbTransport();
  await transport.connect();
  expect(mockOpen).toHaveBeenCalledWith(1, expect.any(Number));
  transport.disconnect();
});
it("refuses ambiguous USB identity rather than charging the first device", async () => {
  mockDevices.mockResolvedValue([device, { ...device, deviceId: 2 }]);
  await expect(new ValorUsbTransport().connect()).rejects.toThrow(/Multiple/);
  expect(mockOpen).not.toHaveBeenCalled();
});
