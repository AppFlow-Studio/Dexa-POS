/**
 * Telemetry export tests: dump schema shape, decoded ring entries, file
 * write + share-sheet flow (mocked expo modules), offline-safe behavior
 * (share unavailable still produces the file).
 */
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import { buildTelemetryDump, exportTelemetry } from "@/lib/telemetry/export";
import {
  internKey,
  noteStringifyEnd,
  recordSample,
  resetSessionForTests,
  setCurrentRoute,
  setTelemetryEnabled,
  setTelemetryHooksMuted,
} from "@/lib/telemetry/registry";

// jest.mock calls are hoisted above the imports at runtime.
jest.mock("expo-file-system", () => ({
  cacheDirectory: "file:///cache/",
  writeAsStringAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-sharing", () => ({
  isAvailableAsync: jest.fn(() => Promise.resolve(true)),
  shareAsync: jest.fn(() => Promise.resolve()),
}));

jest.mock("expo-constants", () => ({
  __esModule: true,
  default: { expoConfig: { version: "9.9.9-test" } },
}));

jest.mock("expo-device", () => ({
  modelName: "Landi C20 Pro (test)",
}));

beforeEach(() => {
  jest.clearAllMocks();
  setTelemetryEnabled(true);
  setTelemetryHooksMuted(false);
  resetSessionForTests();
});

describe("buildTelemetryDump", () => {
  it("produces the versioned schema with device/config/session", () => {
    setCurrentRoute("/order-processing");
    noteStringifyEnd();
    recordSample(internKey("test.export"), 55);

    const dump = buildTelemetryDump();
    expect(dump.schema).toBe(1);
    expect(dump.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    expect(dump.device.appVersion).toBe("9.9.9-test");
    expect(dump.device.model).toBe("Landi C20 Pro (test)");
    expect(dump.config.tickMs).toBe(50);
    expect(dump.config.driftThresholdMs).toBe(100);

    expect(dump.session.schema).toBe(1);
    expect(dump.session.dict).toContain("test.export");
    expect(dump.session.config.slots).toBeGreaterThan(0);
    const entry = dump.session.ring.entries.find((e) => e.k === "test.export");
    expect(entry?.v).toBe(55);
    expect(entry?.route).toBe("/order-processing");
    expect(typeof entry?.stringifyOverlap).toBe("boolean");
    // Round-trips through JSON cleanly.
    expect(() => JSON.parse(JSON.stringify(dump))).not.toThrow();
  });
});

describe("exportTelemetry", () => {
  it("writes the JSON file and opens the share sheet", async () => {
    recordSample(internKey("test.export2"), 7);
    const uri = await exportTelemetry();

    expect(uri).toMatch(/^file:\/\/\/cache\/telemetry-\d+\.json$/);
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
    const [writtenUri, written] = (FileSystem.writeAsStringAsync as jest.Mock)
      .mock.calls[0];
    expect(writtenUri).toBe(uri);
    const parsed = JSON.parse(written);
    expect(parsed.schema).toBe(1);

    expect(Sharing.shareAsync).toHaveBeenCalledWith(uri, {
      mimeType: "application/json",
      dialogTitle: "Dexa POS Telemetry Export",
    });
  });

  it("still writes the file when no share target is available (offline/kiosk)", async () => {
    (Sharing.isAvailableAsync as jest.Mock).mockResolvedValueOnce(false);
    const uri = await exportTelemetry();
    expect(FileSystem.writeAsStringAsync).toHaveBeenCalledTimes(1);
    expect(Sharing.shareAsync).not.toHaveBeenCalled();
    expect(uri).toContain("telemetry-");
  });
});
