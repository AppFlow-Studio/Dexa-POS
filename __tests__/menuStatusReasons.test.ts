import { getMenuStatusChips } from "@/lib/menu/menuStatusReasons";

const live = { isAvailableNow: true, isHiddenOnDevice: false };
const keys = (menu: any, ctx = live) =>
  getMenuStatusChips(menu, ctx).map((chip) => chip.key);

describe("menu status reasons", () => {
  it("reports nothing for a menu that is orderable here and now", () => {
    expect(getMenuStatusChips({ isActive: true }, live)).toEqual([]);
  });

  it("names the POS channel — the reason the old badge could not show", () => {
    // The regression this exists for: green "Available" on a menu that order
    // entry filters out.
    const menu = {
      isActive: true,
      channelVisibility: { pos: false, kiosk: true, online: true },
    };

    expect(keys(menu)).toEqual(["channel-pos"]);
    expect(getMenuStatusChips(menu, live)[0].blocking).toBe(true);
  });

  it("treats the kiosk channel as informational, not as a POS problem", () => {
    const menu = {
      isActive: true,
      channelVisibility: { pos: true, kiosk: false, online: true },
    };
    const [chip] = getMenuStatusChips(menu, live);

    expect(chip.key).toBe("channel-kiosk");
    expect(chip.blocking).toBe(false);
  });

  it("suppresses the schedule reason when the menu is inactive anyway", () => {
    expect(
      keys({ isActive: false }, { isAvailableNow: false, isHiddenOnDevice: false }),
    ).toEqual(["inactive"]);
  });

  it("reports the schedule only while the menu is active", () => {
    expect(
      keys({ isActive: true }, { isAvailableNow: false, isHiddenOnDevice: false }),
    ).toEqual(["off-schedule"]);
  });

  it("distinguishes the device-local hide from anything the dashboard set", () => {
    const chips = getMenuStatusChips(
      { isActive: true },
      { isAvailableNow: true, isHiddenOnDevice: true },
    );

    expect(chips).toHaveLength(1);
    expect(chips[0].key).toBe("hidden-here");
    expect(chips[0].label).toMatch(/here/i);
  });

  it("keeps every label short enough that the fixed-height row cannot wrap", () => {
    // MENU_DRAG_ROW_HEIGHT is a hard-coded 96 that the reorder maths depends
    // on, so a chip row that wrapped to a second line would silently drift
    // every drag target. Worst case is all four chips at once.
    const chips = getMenuStatusChips(
      {
        isActive: false,
        channelVisibility: { pos: false, kiosk: false, online: false },
      },
      { isAvailableNow: false, isHiddenOnDevice: true },
    );

    expect(chips).toHaveLength(4);
    for (const chip of chips) expect(chip.label.length).toBeLessThanOrEqual(12);
  });

  it("stacks every reason at once, most important first", () => {
    expect(
      keys(
        {
          isActive: false,
          channelVisibility: { pos: false, kiosk: false, online: true },
        },
        { isAvailableNow: false, isHiddenOnDevice: true },
      ),
    ).toEqual(["inactive", "channel-pos", "channel-kiosk", "hidden-here"]);
  });

  it("says nothing about channels a legacy snapshot never carried", () => {
    // Pre-field menus must not light up as "Off on POS".
    expect(keys({ isActive: true, channelVisibility: null })).toEqual([]);
  });
});
