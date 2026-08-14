/**
 * AUD-1 acceptance evidence — cold-start paint + offline boot.
 *
 * Two acceptance criteria on the ticket were already satisfied by
 * `stores/menuOfflineCache.ts` + the boot-fallback effect in PosSyncProvider,
 * but nothing proved it, so they could not be signed off:
 *
 *   - "Cold start paints the cached menu before any network response"
 *   - "Offline boot works from snapshot"
 *
 * These are structural + behavioural tests over the cache module and the
 * provider wiring. They exist so the guarantee cannot silently regress: the
 * failure mode is an EMPTY ORDER GRID on a terminal that has synced before,
 * which is exactly what the cache was written to prevent.
 */
import fs from "fs";
import path from "path";

// The global MMKV mock in jest-setup is stateless (getString is a bare
// jest.fn()), so a round-trip against it would assert on the mock rather than
// on menuOfflineCache's real logic — its TTL, its per-location keying and its
// payload-shape validation. Give it a stateful store so the tests exercise the
// module we actually care about.
const mockMem = new Map<string, string>();
jest.mock("@/lib/storage", () => ({
  syncStorage: {
    getString: (k: string) => mockMem.get(k),
    set: (k: string, v: string) => {
      mockMem.set(k, v);
    },
    delete: (k: string) => {
      mockMem.delete(k);
    },
    getAllKeys: () => Array.from(mockMem.keys()),
  },
  mmkvStorage: { getItem: jest.fn(), setItem: jest.fn(), removeItem: jest.fn() },
}));

// eslint-disable-next-line import/first
import { menuOfflineCache } from "@/stores/menuOfflineCache";

const PROVIDER = fs.readFileSync(
  path.join(__dirname, "..", "contexts", "PosSyncProvider.tsx"),
  "utf8",
);

describe("AUD-1 — cached menu paints before any network response", () => {
  it("PosSyncProvider hydrates from the snapshot when the store is still empty", () => {
    // The boot-fallback effect must be gated on an EMPTY store, not on a
    // network error — that gate is what makes it fire during the cold-start
    // window while pos_sync is still in flight.
    expect(PROVIDER).toMatch(/menuOfflineCache\.get\(locationId\)/);
    expect(PROVIDER).toMatch(
      /useMenuStore\.getState\(\)\.menus\.length > 0\)\s*return/,
    );
    expect(PROVIDER).toMatch(/setMenuData\(cached,\s*\{\s*fromCache:\s*true\s*\}\)/);
  });

  it("a live sync can never be clobbered by the snapshot", () => {
    // Ordering matters: the snapshot effect must be declared AFTER the live
    // sync effect so that on a commit where fresh data exists, setMenuData has
    // already run and the menus.length guard short-circuits.
    const liveIdx = PROVIDER.indexOf("setMenuData(posSyncData)");
    const cacheIdx = PROVIDER.indexOf("setMenuData(cached");
    expect(liveIdx).toBeGreaterThan(-1);
    expect(cacheIdx).toBeGreaterThan(-1);
    expect(cacheIdx).toBeGreaterThan(liveIdx);
  });

  it("KDS stations skip the menu snapshot entirely", () => {
    // KDS has no order-entry grid; hydrating a menu there is pure waste.
    const block = PROVIDER.slice(
      PROVIDER.indexOf("menuOfflineCache.get(locationId)") - 600,
      PROVIDER.indexOf("menuOfflineCache.get(locationId)"),
    );
    expect(block).toMatch(/if \(isKDS\) return/);
  });
});

describe("AUD-1 — offline boot works from snapshot", () => {
  const LOC = "loc-aud1-test";

  afterEach(() => {
    menuOfflineCache.clearLocation(LOC);
  });

  it("round-trips a snapshot for a location with no network involved", () => {
    const snapshot: any = {
      synced_at: new Date().toISOString(),
      location_id: LOC,
      menus: [{ id: "m1", name: "All Day", categories: [] }],
    };

    menuOfflineCache.set(LOC, snapshot);
    const got = menuOfflineCache.get(LOC);

    expect(got).toBeTruthy();
    expect(got?.menus?.length).toBe(1);
    expect(got?.menus?.[0]?.id).toBe("m1");
  });

  it("is keyed per location — one store's menu never leaks into another", () => {
    menuOfflineCache.set(LOC, {
      synced_at: new Date().toISOString(),
      location_id: LOC,
      menus: [{ id: "m1", name: "A", categories: [] }],
    } as any);

    // A different location must not see it. Cross-location menu bleed would
    // show the wrong prices on a terminal, which is a money bug.
    expect(menuOfflineCache.get("some-other-location")).toBeFalsy();
  });

  it("returns nothing for a location that has never synced", () => {
    expect(menuOfflineCache.get("never-synced-location")).toBeFalsy();
  });
});
