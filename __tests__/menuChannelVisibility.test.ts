import { isMenuVisibleOnChannel } from "@/lib/menu/menuChannelVisibility";

describe("menu channel visibility", () => {
  it("defaults legacy menu payloads to visible on every channel", () => {
    expect(isMenuVisibleOnChannel({}, "pos")).toBe(true);
    expect(isMenuVisibleOnChannel({}, "kiosk")).toBe(true);
    expect(isMenuVisibleOnChannel({}, "online")).toBe(true);
  });

  it("keeps channel visibility independent", () => {
    const menu = {
      channelVisibility: { pos: false, kiosk: true, online: false },
    };

    expect(isMenuVisibleOnChannel(menu, "pos")).toBe(false);
    expect(isMenuVisibleOnChannel(menu, "kiosk")).toBe(true);
    expect(isMenuVisibleOnChannel(menu, "online")).toBe(false);
  });
});
