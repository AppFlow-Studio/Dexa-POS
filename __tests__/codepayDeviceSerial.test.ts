// Unit tests for CodePay device-identity resolution — the stable per-device key
// used to auto-provision (find-or-create) a payment_terminals row.
//
// Priority: native hardware serial (Build.getSerial) → prefixed ANDROID_ID
// fallback (so provisioning still works on ROMs that block getSerial).

const mockGetDeviceSerial = jest.fn<Promise<string | null>, []>();
const mockGetAndroidId = jest.fn<string | null, []>();

jest.mock("react-native", () => ({
  Platform: { OS: "android" },
  NativeModules: {},
}));

jest.mock("@/native/CodePayBridge", () => ({
  codepayGetDeviceSerial: () => mockGetDeviceSerial(),
}));

jest.mock("expo-application", () => ({
  getAndroidId: () => mockGetAndroidId(),
}));

import {
  resolveCodePayDeviceIdentity,
  resolveCodePayDeviceSerial,
} from "@/services/terminals/codepayDeviceIdentity";

beforeEach(() => {
  mockGetDeviceSerial.mockReset();
  mockGetAndroidId.mockReset();
});

test("prefers the native hardware serial when available", async () => {
  mockGetDeviceSerial.mockResolvedValue("SN12345");
  mockGetAndroidId.mockReturnValue("9774d56d682e549c");
  const id = await resolveCodePayDeviceIdentity();
  expect(id).toEqual({ serial: "SN12345", source: "hardware" });
  // ANDROID_ID is not consulted when the hardware serial resolves.
  expect(mockGetAndroidId).not.toHaveBeenCalled();
});

test("falls back to a prefixed ANDROID_ID when no hardware serial", async () => {
  mockGetDeviceSerial.mockResolvedValue(null);
  mockGetAndroidId.mockReturnValue("9774d56d682e549c");
  const id = await resolveCodePayDeviceIdentity();
  expect(id).toEqual({
    serial: "ANDROIDID-9774d56d682e549c",
    source: "android_id",
  });
});

test("trims a whitespace-padded hardware serial", async () => {
  mockGetDeviceSerial.mockResolvedValue("  SN-9  ");
  const id = await resolveCodePayDeviceIdentity();
  expect(id?.serial).toBe("SN-9");
});

test("returns null when neither source yields a value", async () => {
  mockGetDeviceSerial.mockResolvedValue(null);
  mockGetAndroidId.mockReturnValue(null);
  expect(await resolveCodePayDeviceIdentity()).toBeNull();
  expect(await resolveCodePayDeviceSerial()).toBeNull();
});

test("recovers to ANDROID_ID when the native serial call throws", async () => {
  mockGetDeviceSerial.mockRejectedValue(new Error("SecurityException"));
  mockGetAndroidId.mockReturnValue("abc");
  const id = await resolveCodePayDeviceIdentity();
  expect(id).toEqual({ serial: "ANDROIDID-abc", source: "android_id" });
});
