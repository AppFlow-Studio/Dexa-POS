/**
 * Per-station menu scope — the shared selector every order-entry surface
 * reads. The rule under test:
 *
 *   visible(menu) = channelFlag(menu, channel)
 *                   AND (scope = 'all' OR menu ∈ station_menus)
 *
 * Plus its two edges: fail CLOSED on an empty selection, fail OPEN only for a
 * station missing from the map (an old snapshot).
 */
import {
  channelForStationType,
  resolveStationMenuScope,
  selectVisibleMenus,
} from "@/lib/menu/stationMenuScope";
import type { StationMenuScopeMap } from "@/types/menu";

const KIOSK_1 = "station-kiosk-1";
const KIOSK_2 = "station-kiosk-2";
const REGISTER = "station-register-3";

const menus = [
  { id: "sushi", name: "Sushi" },
  { id: "drinks", name: "Drinks" },
  {
    id: "staff-only",
    name: "Staff Only",
    channelVisibility: { pos: true, kiosk: false, online: false },
  },
  {
    id: "kiosk-only",
    name: "Kiosk Only",
    channelVisibility: { pos: false, kiosk: true, online: true },
  },
];

const names = (list: readonly { name: string }[]) => list.map((m) => m.name);

const scopes: StationMenuScopeMap = {
  [KIOSK_1]: { scope: "selected", menu_ids: ["sushi"] },
  [KIOSK_2]: { scope: "all", menu_ids: [] },
  [REGISTER]: { scope: "selected", menu_ids: ["sushi", "staff-only"] },
};

describe("channelForStationType", () => {
  it("reads the kiosk flag on a self_service station and the POS flag elsewhere", () => {
    expect(channelForStationType("self_service")).toBe("kiosk");
    expect(channelForStationType("register")).toBe("pos");
    expect(channelForStationType("checkout")).toBe("pos");
    expect(channelForStationType(undefined)).toBe("pos");
  });
});

describe("selectVisibleMenus", () => {
  it("Kiosk 1 set to Selected → Sushi shows only Sushi", () => {
    expect(names(selectVisibleMenus(menus, scopes, KIOSK_1, "kiosk"))).toEqual([
      "Sushi",
    ]);
  });

  it("Kiosk 2 on All is unchanged: every kiosk-visible menu", () => {
    expect(names(selectVisibleMenus(menus, scopes, KIOSK_2, "kiosk"))).toEqual([
      "Sushi",
      "Drinks",
      "Kiosk Only",
    ]);
  });

  it("applies the same rule on a register station", () => {
    expect(names(selectVisibleMenus(menus, scopes, REGISTER, "pos"))).toEqual([
      "Sushi",
      "Staff Only",
    ]);
  });

  it("channel toggle still wins: a kiosk-hidden menu does not render even when selected", () => {
    const withHiddenSelection: StationMenuScopeMap = {
      [KIOSK_1]: { scope: "selected", menu_ids: ["sushi", "staff-only"] },
    };
    expect(
      names(selectVisibleMenus(menus, withHiddenSelection, KIOSK_1, "kiosk")),
    ).toEqual(["Sushi"]);
  });

  it("fails closed: Selected with zero menus renders nothing, never the full menu", () => {
    const empty: StationMenuScopeMap = {
      [KIOSK_1]: { scope: "selected", menu_ids: [] },
    };
    expect(selectVisibleMenus(menus, empty, KIOSK_1, "kiosk")).toEqual([]);
  });

  it("fails closed when the only selected menu has been deleted", () => {
    // The FK cascade removed the station_menus row server-side, so the map
    // says `selected` with nothing in it; the menu itself is gone too.
    const afterDelete = menus.filter((m) => m.id !== "sushi");
    const empty: StationMenuScopeMap = {
      [KIOSK_1]: { scope: "selected", menu_ids: [] },
    };
    expect(selectVisibleMenus(afterDelete, empty, KIOSK_1, "kiosk")).toEqual(
      [],
    );
  });

  it("ignores a selected id that is not in the tree (no phantom rows)", () => {
    const stale: StationMenuScopeMap = {
      [KIOSK_1]: { scope: "selected", menu_ids: ["sushi", "deleted-menu"] },
    };
    expect(names(selectVisibleMenus(menus, stale, KIOSK_1, "kiosk"))).toEqual([
      "Sushi",
    ]);
  });

  it("fails OPEN only for a station missing from the map (pre-scope snapshot)", () => {
    expect(
      names(selectVisibleMenus(menus, scopes, "unknown-station", "kiosk")),
    ).toEqual(["Sushi", "Drinks", "Kiosk Only"]);
    expect(names(selectVisibleMenus(menus, {}, KIOSK_1, "pos"))).toEqual([
      "Sushi",
      "Drinks",
      "Staff Only",
    ]);
    expect(names(selectVisibleMenus(menus, undefined, KIOSK_1, "pos"))).toEqual(
      ["Sushi", "Drinks", "Staff Only"],
    );
  });

  it("does not depend on menu_ids when the scope is all", () => {
    const allWithIds: StationMenuScopeMap = {
      [KIOSK_2]: { scope: "all", menu_ids: ["sushi"] },
    };
    expect(names(selectVisibleMenus(menus, allWithIds, KIOSK_2, "kiosk"))).toEqual(
      ["Sushi", "Drinks", "Kiosk Only"],
    );
  });

  it("preserves the incoming order", () => {
    const reversed = [...menus].reverse();
    expect(names(selectVisibleMenus(reversed, scopes, KIOSK_2, "kiosk"))).toEqual(
      ["Kiosk Only", "Drinks", "Sushi"],
    );
  });
});

describe("resolveStationMenuScope", () => {
  it("normalizes a selected scope and drops non-string ids", () => {
    const raw = {
      [KIOSK_1]: {
        scope: "selected",
        menu_ids: ["sushi", 42, null, "drinks"],
      },
    } as unknown as StationMenuScopeMap;
    expect(resolveStationMenuScope(raw, KIOSK_1)).toEqual({
      scope: "selected",
      menu_ids: ["sushi", "drinks"],
    });
  });

  it("treats a selected scope with a malformed menu_ids as selected-with-nothing", () => {
    const raw = {
      [KIOSK_1]: { scope: "selected", menu_ids: "sushi" },
    } as unknown as StationMenuScopeMap;
    expect(resolveStationMenuScope(raw, KIOSK_1)).toEqual({
      scope: "selected",
      menu_ids: [],
    });
  });

  it("resolves a missing station or a null id to all", () => {
    expect(resolveStationMenuScope(scopes, "nope").scope).toBe("all");
    expect(resolveStationMenuScope(scopes, null).scope).toBe("all");
    expect(resolveStationMenuScope(null, KIOSK_1).scope).toBe("all");
  });
});
