/**
 * Cart hygiene after a snapshot hides a menu from this station.
 *
 * The plan is pure and structural, so it is tested without the stores: given
 * the full tree, the station-visible subset, the active order's lines and the
 * kiosk lines, which ids come out.
 */
import { planStationScopePrune } from "@/services/stationMenuScopePrune";

const menu = (id: string, itemIds: string[]) => ({
  id,
  categories: [{ items: itemIds.map((itemId) => ({ id: itemId })) }],
});

const sushi = menu("sushi", ["nigiri", "shared-water"]);
const drinks = menu("drinks", ["cola", "shared-water"]);
const allMenus = [sushi, drinks];

const line = (
  id: string,
  addedFromMenuId: string | null,
  overrides: Partial<{
    is_voided: boolean;
    kitchen_status: "new" | "sent" | "preparing" | "ready" | "served";
    paidQuantity: number;
  }> = {},
) => ({
  id,
  addedFromMenuId,
  is_voided: false,
  kitchen_status: "new" as const,
  paidQuantity: 0,
  ...overrides,
});

describe("planStationScopePrune — POS cart", () => {
  it("removes an unsent, unpaid line from a menu the station no longer shows", () => {
    const plan = planStationScopePrune({
      menus: allMenus,
      visibleMenus: [drinks],
      posItems: [line("l1", "sushi"), line("l2", "drinks")],
      kioskLines: [],
    });
    expect(plan.posItemIds).toEqual(["l1"]);
  });

  it("leaves lines the kitchen has already seen or that are paid or voided", () => {
    const plan = planStationScopePrune({
      menus: allMenus,
      visibleMenus: [drinks],
      posItems: [
        line("sent", "sushi", { kitchen_status: "sent" }),
        line("preparing", "sushi", { kitchen_status: "preparing" }),
        line("paid", "sushi", { paidQuantity: 1 }),
        line("voided", "sushi", { is_voided: true }),
        line("fresh", "sushi"),
      ],
      kioskLines: [],
    });
    expect(plan.posItemIds).toEqual(["fresh"]);
  });

  it("does not touch lines without an origin menu, or from a menu that vanished entirely", () => {
    const plan = planStationScopePrune({
      menus: [drinks], // sushi is no longer in the payload at all
      visibleMenus: [drinks],
      posItems: [
        line("open-item", null),
        line("legacy", undefined as unknown as null),
        line("from-deleted-menu", "sushi"),
      ],
      kioskLines: [],
    });
    expect(plan.posItemIds).toEqual([]);
  });

  it("removes nothing when the scope is all (visible == all)", () => {
    const plan = planStationScopePrune({
      menus: allMenus,
      visibleMenus: allMenus,
      posItems: [line("a", "sushi"), line("b", "drinks")],
      kioskLines: [],
    });
    expect(plan.posItemIds).toEqual([]);
  });
});

describe("planStationScopePrune — kiosk cart", () => {
  const kioskLine = (lineId: string, menuItemId: string) => ({
    lineId,
    menuItemId,
  });

  it("drops a line whose item exists only in hidden menus", () => {
    const plan = planStationScopePrune({
      menus: allMenus,
      visibleMenus: [drinks],
      posItems: [],
      kioskLines: [kioskLine("k1", "nigiri"), kioskLine("k2", "cola")],
    });
    expect(plan.kioskLineIds).toEqual(["k1"]);
  });

  it("keeps a line whose item is also on a visible menu", () => {
    const plan = planStationScopePrune({
      menus: allMenus,
      visibleMenus: [drinks],
      posItems: [],
      kioskLines: [kioskLine("k1", "shared-water")],
    });
    expect(plan.kioskLineIds).toEqual([]);
  });

  it("leaves a line whose item is not in the tree at all", () => {
    const plan = planStationScopePrune({
      menus: allMenus,
      visibleMenus: [drinks],
      posItems: [],
      kioskLines: [kioskLine("k1", "ghost-item")],
    });
    expect(plan.kioskLineIds).toEqual([]);
  });
});
