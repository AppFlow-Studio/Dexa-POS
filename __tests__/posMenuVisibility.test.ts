import { filterPosOrderEntryMenus } from "@/lib/menu/posMenuVisibility";

describe("POS order-entry menu visibility", () => {
  const menus = [
    { id: "beverages", name: "Beverages", isActive: true },
    { id: "whole-menu", name: "Whole Menu", isActive: false },
    { id: "dessert", name: "Dessert", isActive: true },
  ];

  it("excludes menus disabled in the portal", () => {
    expect(filterPosOrderEntryMenus(menus, []).map((menu) => menu.name)).toEqual([
      "Beverages",
      "Dessert",
    ]);
  });

  it("preserves the existing per-location hidden-menu filter", () => {
    expect(
      filterPosOrderEntryMenus(menus, ["dessert"]).map((menu) => menu.name),
    ).toEqual(["Beverages"]);
  });

  it("does not hard-code the Whole Menu display name", () => {
    const activeWholeMenu = [{ ...menus[1], isActive: true }];

    expect(filterPosOrderEntryMenus(activeWholeMenu, [])).toEqual(
      activeWholeMenu,
    );
  });

  it("hides a POS-disabled menu without deactivating other channels", () => {
    const channelScoped = [
      {
        id: "whole-menu",
        name: "Whole Menu",
        isActive: true,
        channelVisibility: { pos: false, kiosk: true, online: true },
      },
    ];

    expect(filterPosOrderEntryMenus(channelScoped, [])).toEqual([]);
  });

  it("keeps legacy snapshots visible when channel metadata is absent", () => {
    expect(filterPosOrderEntryMenus([menus[0]], [])).toEqual([menus[0]]);
  });
});
