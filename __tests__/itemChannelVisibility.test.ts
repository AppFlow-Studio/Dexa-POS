import { isItemOnChannel } from "@/lib/menu/itemChannelVisibility";

describe("item sales-channel visibility", () => {
  it("honours a non-empty channel list", () => {
    const item = { availableChannels: ["pos", "online"] };

    expect(isItemOnChannel(item, "pos")).toBe(true);
    expect(isItemOnChannel(item, "online")).toBe(true);
    expect(isItemOnChannel(item, "kiosk")).toBe(false);
  });

  it("keeps channels independent", () => {
    const kioskOnly = { availableChannels: ["kiosk"] };

    expect(isItemOnChannel(kioskOnly, "kiosk")).toBe(true);
    expect(isItemOnChannel(kioskOnly, "pos")).toBe(false);
  });

  it("defaults legacy item payloads to every channel", () => {
    // Snapshots cached before effective_available_channels existed, and items
    // that predate the column. Refusing to sell a real item over a data gap is
    // worse than showing one that should have been hidden.
    expect(isItemOnChannel({}, "pos")).toBe(true);
    expect(isItemOnChannel({ availableChannels: null }, "kiosk")).toBe(true);
    expect(isItemOnChannel({ availableChannels: undefined }, "pos")).toBe(true);
  });

  it("fails open on a non-array value", () => {
    // available_channels is untyped jsonb; a bad write must not empty the menu.
    const garbage = { availableChannels: "pos" as unknown as string[] };

    expect(isItemOnChannel(garbage, "pos")).toBe(true);
    expect(isItemOnChannel(garbage, "kiosk")).toBe(true);
  });

  it("fails open on an empty array rather than hiding the item everywhere", () => {
    // Sold on no channel at all means invisible on every surface, so nobody
    // can find it to fix it. Far more likely a dropped write than intent.
    const item = { availableChannels: [] };

    expect(isItemOnChannel(item, "pos")).toBe(true);
    expect(isItemOnChannel(item, "kiosk")).toBe(true);
  });

  it("ignores channel names it does not know", () => {
    const item = { availableChannels: ["delivery"] };

    expect(isItemOnChannel(item, "pos")).toBe(false);
    expect(isItemOnChannel(item, "kiosk")).toBe(false);
  });
});
