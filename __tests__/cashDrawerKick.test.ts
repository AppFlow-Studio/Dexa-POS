// Unit tests for the P0 cash-drawer kick fix:
//   - structured CashDrawerKickResult (no_candidate / ok / all_failed)
//   - Star-first, sense-evidenced selection under drawerRoutingV2
//   - explicit binding precedence, Landi last-resort, candidate fallback
//   - strict-confirm sense plumbed through to the result
//   - operator-facing outcome helpers (lib/cashDrawerKick)
//
// Native printer drivers pull react-native-star-io10 / @/native/LandiPrinter,
// unavailable under jest. Stub DriverFactory so the kick loop hits fake drivers
// and the import graph stays load-safe (same pattern as the receipt suites).

jest.mock("uuid", () => ({
  v4: () => "00000000-0000-4000-8000-000000000000",
  v5: () => "00000000-0000-5000-8000-000000000000",
}));

const drivers: Record<string, any> = {};
jest.mock("@/services/printing/DriverFactory", () => ({
  getDriver: (p: any) => drivers[p.id],
}));

import { PrinterService } from "@/services/printing/PrinterService";
import {
  isDrawerRoutingV2Enabled,
  setDrawerRoutingV2Enabled,
} from "@/lib/network/featureFlags";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useCashDrawerStore } from "@/stores/useCashDrawerStore";
import {
  classifyKickOutcome,
  describeCashDrawerKickError,
} from "@/lib/cashDrawerKick";
import { CashDrawerKickResult, DrawerKickSense } from "@/types/printer";

function star(id: string, extra: Record<string, any> = {}) {
  return {
    id,
    printerName: id,
    printerType: "star_micronics",
    connectionType: "network",
    networkAddress: "10.0.0." + id.length,
    isActive: true,
    isConnected: true,
    isDefaultReceipt: false,
    supportsCashDrawerKick: false,
    metadata: null,
    ...extra,
  };
}

function landi(id: string, extra: Record<string, any> = {}) {
  return {
    id,
    printerName: id,
    printerType: "landi",
    connectionType: "builtin",
    networkAddress: null,
    isActive: true,
    isConnected: true,
    isDefaultReceipt: false,
    supportsCashDrawerKick: true,
    metadata: null,
    ...extra,
  };
}

function fakeDriver(behavior: { ack?: boolean; sense?: DrawerKickSense } = {}) {
  const openCashDrawer = jest.fn(async () => {
    if (behavior.ack === false) throw new Error("Star printer unreachable");
  });
  const d: any = {
    isConnected: () => true,
    initialize: jest.fn(async () => {}),
    openCashDrawer,
  };
  if (behavior.sense !== undefined) {
    d.openCashDrawerConfirmed = jest.fn(async () => {
      if (behavior.ack === false) throw new Error("Star printer unreachable");
      return behavior.sense;
    });
  }
  return d;
}

function setPrinters(printers: any[]) {
  usePrinterStore.setState({ printers } as any);
}

beforeEach(() => {
  for (const k of Object.keys(drivers)) delete drivers[k];
  setPrinters([]);
  setDrawerRoutingV2Enabled(false);
  useStoreSettingsStore.setState({
    selectedStation: { id: "station-1" },
    selectedStore: { id: "loc-1" },
  } as any);
  useCashDrawerStore.setState({ hostPrinterId: null } as any);
});

describe("PrinterService.openCashDrawer — result contract", () => {
  it("returns no_candidate when nothing is drawer-capable", async () => {
    setPrinters([]);
    const r = await PrinterService.openCashDrawer();
    expect(r.ok).toBe(false);
    expect(r.error).toBe("no_candidate");
    expect(r.candidatesTried).toEqual([]);
  });

  it("returns ok naming the chosen printer on ACK (legacy ranking)", async () => {
    setPrinters([star("s1")]);
    drivers["s1"] = fakeDriver({ ack: true });
    const r = await PrinterService.openCashDrawer();
    expect(r.ok).toBe(true);
    expect(r.printerId).toBe("s1");
    expect(r.printerName).toBe("s1");
  });

  it("fails (surfacing the last cause) when every candidate throws", async () => {
    setPrinters([star("s1")]);
    drivers["s1"] = fakeDriver({ ack: false });
    const r = await PrinterService.openCashDrawer();
    expect(r.ok).toBe(false);
    // The terminal error reflects the last candidate's classified cause
    // ("Star printer unreachable" → unreachable); all_failed is the fallback
    // only when no candidate recorded a cause.
    expect(["unreachable", "all_failed"]).toContain(r.error);
    expect(r.candidatesTried).toEqual(["s1"]);
  });
});

describe("PrinterService.openCashDrawer — drawerRoutingV2 selection", () => {
  beforeEach(() => setDrawerRoutingV2Enabled(true));

  it("prefers a sense-wired Star over an unwired one", async () => {
    setPrinters([
      star("unwired", {
        metadata: { lastDrawerExternalDevice: false, lastDrawerSignalDetail: null },
      }),
      star("wired", { metadata: { lastDrawerExternalDevice: true } }),
    ]);
    drivers["unwired"] = fakeDriver({
      ack: true,
      sense: { externalDevice: false, drawerSignalDetail: null, drawerConfirmed: null },
    });
    drivers["wired"] = fakeDriver({
      ack: true,
      sense: { externalDevice: true, drawerSignalDetail: true, drawerConfirmed: true },
    });
    const r = await PrinterService.openCashDrawer();
    expect(r.printerId).toBe("wired");
    expect(r.drawerConfirmed).toBe(true);
    expect(r.externalDevice).toBe(true);
  });

  it("honors an explicit host_printer_id binding outright", async () => {
    useCashDrawerStore.setState({ hostPrinterId: "bound" } as any);
    setPrinters([
      star("otherWired", { metadata: { lastDrawerExternalDevice: true } }),
      star("bound"),
    ]);
    drivers["otherWired"] = fakeDriver({
      ack: true,
      sense: { externalDevice: true, drawerSignalDetail: true, drawerConfirmed: true },
    });
    drivers["bound"] = fakeDriver({
      ack: true,
      sense: { externalDevice: true, drawerSignalDetail: true, drawerConfirmed: true },
    });
    const r = await PrinterService.openCashDrawer();
    expect(r.printerId).toBe("bound");
  });

  it("keeps the Landi built-in as last-resort behind a wired Star", async () => {
    setPrinters([
      landi("landi"),
      star("wired", { metadata: { lastDrawerExternalDevice: true } }),
    ]);
    drivers["landi"] = fakeDriver({ ack: true });
    drivers["wired"] = fakeDriver({
      ack: true,
      sense: { externalDevice: true, drawerSignalDetail: true, drawerConfirmed: true },
    });
    const r = await PrinterService.openCashDrawer();
    expect(r.printerId).toBe("wired");
  });

  it("falls back to the next candidate when the first fails", async () => {
    setPrinters([
      star("dead", { metadata: { lastDrawerExternalDevice: true } }),
      star("alive", { metadata: { lastDrawerExternalDevice: true } }),
    ]);
    drivers["dead"] = fakeDriver({ ack: false, sense: {} as DrawerKickSense });
    drivers["alive"] = fakeDriver({
      ack: true,
      sense: { externalDevice: true, drawerSignalDetail: true, drawerConfirmed: true },
    });
    const r = await PrinterService.openCashDrawer();
    expect(r.ok).toBe(true);
    expect(r.printerId).toBe("alive");
    expect(r.candidatesTried).toEqual(["dead", "alive"]);
  });
});

describe("cashDrawerKick outcome helpers", () => {
  const base: CashDrawerKickResult = { ok: true };

  it("classifies a plain ACK as ok", () => {
    expect(classifyKickOutcome(base)).toBe("ok");
  });

  it("classifies a wired-but-unconfirmed kick as unconfirmed", () => {
    expect(
      classifyKickOutcome({ ok: true, externalDevice: true, drawerConfirmed: false }),
    ).toBe("unconfirmed");
  });

  it("does NOT flag unconfirmed when no drawer is sensed wired", () => {
    expect(
      classifyKickOutcome({ ok: true, externalDevice: null, drawerConfirmed: null }),
    ).toBe("ok");
  });

  it("classifies a failed kick as failed", () => {
    expect(classifyKickOutcome({ ok: false, error: "all_failed" })).toBe("failed");
  });

  it("maps error codes to operator-facing text", () => {
    expect(describeCashDrawerKickError({ ok: false, error: "no_candidate" })).toMatch(
      /no cash-drawer printer/i,
    );
    expect(describeCashDrawerKickError({ ok: false, error: "in_use" })).toMatch(
      /busy/i,
    );
    expect(describeCashDrawerKickError({ ok: false, error: "unreachable" })).toMatch(
      /could not reach/i,
    );
  });
});

describe("drawerRoutingV2 flag", () => {
  it("defaults off and toggles", () => {
    setDrawerRoutingV2Enabled(false);
    expect(isDrawerRoutingV2Enabled()).toBe(false);
    setDrawerRoutingV2Enabled(true);
    expect(isDrawerRoutingV2Enabled()).toBe(true);
  });
});
