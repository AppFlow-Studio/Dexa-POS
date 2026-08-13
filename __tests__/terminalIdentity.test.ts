// Unit tests for the terminal serial-identity reconciler.
// Guards the invariant that a terminal's serial_number (physical-device
// identity) is FILLED when unset, left alone when unchanged, and NEVER
// overwritten by a different device's serial.

import {
  normalizeSerial,
  reconcileTerminalSerial,
  TERMINAL_IDENTITY_MISMATCH_STATUS,
} from "@/services/terminals/terminalIdentity";
import { ATOM_INTERNAL_TERMINAL_ID } from "@/stores/useAtomTerminalStore";

/**
 * Minimal chainable Supabase mock.
 * - select().eq().single()      → resolves { data: row, error: null }
 * - update().eq().or()          → resolves { error: fillError } (fill path)
 * - update().eq().then(cb)      → invokes cb({ error: null }) (stamp path)
 * Records every update() payload in `updates` for assertions.
 */
function makeSupabaseMock(opts: {
  row: { serial_number: string | null } | null;
  fillError?: { message: string } | null;
}) {
  const updates: any[] = [];
  const fillError = opts.fillError ?? null;

  const chain: any = {
    select: () => chain,
    update: (payload: any) => {
      updates.push(payload);
      return chain;
    },
    eq: () => chain,
    single: () => Promise.resolve({ data: opts.row, error: null }),
    or: () => Promise.resolve({ error: fillError }),
    // thenable so the fire-and-forget stamp path (.then(cb)) works
    then: (resolve: (v: any) => void) => {
      resolve({ error: null });
      return Promise.resolve({ error: null });
    },
  };

  return {
    supabase: { from: () => chain } as any,
    updates,
  };
}

describe("normalizeSerial", () => {
  it("trims and uppercases", () => {
    expect(normalizeSerial("  abc123 ")).toBe("ABC123");
  });
  it("returns '' for null / undefined / blank", () => {
    expect(normalizeSerial(null)).toBe("");
    expect(normalizeSerial(undefined)).toBe("");
    expect(normalizeSerial("   ")).toBe("");
  });
});

describe("reconcileTerminalSerial", () => {
  it("fills the serial when the stored value is null", async () => {
    const { supabase, updates } = makeSupabaseMock({ row: { serial_number: null } });
    const r = await reconcileTerminalSerial({
      supabase,
      terminalId: "term-1",
      discoveredSerial: "sn-abc",
    });
    expect(r.kind).toBe("filled");
    // stored the normalized (uppercase) form
    expect(updates).toHaveLength(1);
    expect(updates[0].serial_number).toBe("SN-ABC");
  });

  it("fills when the stored value is a legacy empty string", async () => {
    const { supabase, updates } = makeSupabaseMock({ row: { serial_number: "" } });
    const r = await reconcileTerminalSerial({
      supabase,
      terminalId: "term-1",
      discoveredSerial: "SN1",
    });
    expect(r.kind).toBe("filled");
    expect(updates).toHaveLength(1);
    expect(updates[0].serial_number).toBe("SN1");
  });

  it("is a no-op when the discovered serial equals the stored one (case/space-insensitive)", async () => {
    const { supabase, updates } = makeSupabaseMock({ row: { serial_number: "SN1" } });
    const r = await reconcileTerminalSerial({
      supabase,
      terminalId: "term-1",
      discoveredSerial: " sn1 ",
    });
    expect(r.kind).toBe("noop");
    expect(updates).toHaveLength(0);
  });

  it("blocks (does NOT overwrite) when a different device's serial is reported", async () => {
    const { supabase, updates } = makeSupabaseMock({ row: { serial_number: "OLD-SN" } });
    const r = await reconcileTerminalSerial({
      supabase,
      terminalId: "term-1",
      discoveredSerial: "NEW-SN",
    });
    expect(r.kind).toBe("mismatch");
    if (r.kind === "mismatch") {
      expect(r.storedSerial).toBe("OLD-SN");
      expect(r.discoveredSerial).toBe("NEW-SN");
    }
    // No serial_number was ever written; only a status stamp is allowed.
    const serialWrites = updates.filter((u) => "serial_number" in u);
    expect(serialWrites).toHaveLength(0);
    const stamp = updates.find(
      (u) => u.last_connection_status === TERMINAL_IDENTITY_MISMATCH_STATUS,
    );
    expect(stamp).toBeTruthy();
  });

  it("does not stamp status on mismatch when stampStatusOnMismatch is false", async () => {
    const { supabase, updates } = makeSupabaseMock({ row: { serial_number: "OLD-SN" } });
    const r = await reconcileTerminalSerial({
      supabase,
      terminalId: "term-1",
      discoveredSerial: "NEW-SN",
      stampStatusOnMismatch: false,
    });
    expect(r.kind).toBe("mismatch");
    expect(updates).toHaveLength(0);
  });

  it("skips the ATOM sentinel id without any DB call", async () => {
    const { supabase, updates } = makeSupabaseMock({ row: null });
    const r = await reconcileTerminalSerial({
      supabase,
      terminalId: ATOM_INTERNAL_TERMINAL_ID,
      discoveredSerial: "SN1",
    });
    expect(r).toEqual({ kind: "skipped", reason: "sentinel-id" });
    expect(updates).toHaveLength(0);
  });

  it("skips when no serial was discovered", async () => {
    const { supabase, updates } = makeSupabaseMock({ row: { serial_number: "SN1" } });
    const r = await reconcileTerminalSerial({
      supabase,
      terminalId: "term-1",
      discoveredSerial: "   ",
    });
    expect(r).toEqual({ kind: "skipped", reason: "empty-serial" });
    expect(updates).toHaveLength(0);
  });
});
