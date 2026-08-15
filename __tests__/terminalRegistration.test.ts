// Unit tests for the terminal registration duplicate-detection lookup.
// Guards that a physical device already registered at a location is found
// (serial first, then Valor EPI), location-wide, with enough context to name
// the owning station — so registration can offer reuse instead of duplicating.

import { findExistingTerminalByIdentity } from "@/services/terminals/terminalRegistration";

/**
 * Chainable Supabase mock. Every `from()` yields a fresh chain that accumulates
 * `.eq()` / `.neq()` filters, then resolves `maybeSingle()` by calling the
 * provided resolver with the captured filters. A fresh chain per `from()`
 * mirrors the helper running an independent serial lookup then an EPI lookup.
 */
function makeRegMock(resolver: (filters: Record<string, any>) => any) {
  const makeChain = () => {
    const filters: Record<string, any> = {};
    const chain: any = {
      select: () => chain,
      eq: (col: string, val: any) => {
        filters[col] = val;
        return chain;
      },
      neq: (col: string, val: any) => {
        filters[`neq_${col}`] = val;
        return chain;
      },
      order: () => chain,
      limit: () => chain,
      maybeSingle: () =>
        Promise.resolve({ data: resolver(filters) ?? null, error: null }),
    };
    return chain;
  };
  return { from: () => makeChain() } as any;
}

describe("findExistingTerminalByIdentity", () => {
  it("matches by serial (location-wide) and returns station context", async () => {
    const supabase = makeRegMock((f) =>
      f.location_id === "loc-1" && f.serial_number === "SN-ABC"
        ? {
            id: "t1",
            terminal_name: "Front",
            station_id: "st1",
            is_active: true,
            stations: { station_name: "Front Counter" },
          }
        : null,
    );
    // Passed unnormalized — the helper trims + uppercases before matching.
    const m = await findExistingTerminalByIdentity({
      supabase,
      locationId: "loc-1",
      serial: "  sn-abc ",
    });
    expect(m).toMatchObject({
      id: "t1",
      terminalName: "Front",
      stationId: "st1",
      stationName: "Front Counter",
      isActive: true,
      matchedBy: "serial",
    });
  });

  it("falls back to EPI when there is no serial match (Valor-USB)", async () => {
    const supabase = makeRegMock((f) =>
      f.valor_epi === "EPI-9"
        ? {
            id: "t2",
            terminal_name: "Bar",
            station_id: null,
            is_active: false,
            stations: null,
          }
        : null,
    );
    const m = await findExistingTerminalByIdentity({
      supabase,
      locationId: "loc-1",
      serial: null,
      epi: "EPI-9",
    });
    expect(m).toMatchObject({
      id: "t2",
      matchedBy: "epi",
      stationId: null,
      stationName: null,
    });
  });

  it("prefers a serial match over an EPI match when both would match", async () => {
    const supabase = makeRegMock((f) =>
      f.serial_number
        ? { id: "by-serial", terminal_name: null, station_id: null, is_active: true }
        : f.valor_epi
          ? { id: "by-epi", terminal_name: null, station_id: null, is_active: true }
          : null,
    );
    const m = await findExistingTerminalByIdentity({
      supabase,
      locationId: "loc-1",
      serial: "SN-1",
      epi: "E-1",
    });
    expect(m?.id).toBe("by-serial");
  });

  it("returns null when neither serial nor EPI is provided (cannot dedup)", async () => {
    const supabase = makeRegMock(() => ({ id: "should-not-be-used" }));
    const m = await findExistingTerminalByIdentity({
      supabase,
      locationId: "loc-1",
    });
    expect(m).toBeNull();
  });

  it("returns null when nothing matches", async () => {
    const supabase = makeRegMock(() => null);
    const m = await findExistingTerminalByIdentity({
      supabase,
      locationId: "loc-1",
      serial: "SN-X",
      epi: "E-X",
    });
    expect(m).toBeNull();
  });

  it("reads a station embed returned as an array", async () => {
    const supabase = makeRegMock((f) =>
      f.serial_number === "SN-ARR"
        ? {
            id: "t3",
            terminal_name: "X",
            station_id: "st3",
            is_active: true,
            stations: [{ station_name: "Patio" }],
          }
        : null,
    );
    const m = await findExistingTerminalByIdentity({
      supabase,
      locationId: "loc-1",
      serial: "SN-ARR",
    });
    expect(m?.stationName).toBe("Patio");
  });

  it("applies excludeId as a neq filter (skip the row being edited)", async () => {
    const supabase = makeRegMock((f) =>
      f.neq_id === "self-id" && f.serial_number === "SN-SELF"
        ? { id: "other", terminal_name: "Other", station_id: "st9", is_active: true }
        : null,
    );
    const m = await findExistingTerminalByIdentity({
      supabase,
      locationId: "loc-1",
      serial: "SN-SELF",
      excludeId: "self-id",
    });
    expect(m?.id).toBe("other");
  });
});
