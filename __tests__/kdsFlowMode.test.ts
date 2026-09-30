import {
  requiresManualAccept,
  resolveBumpStatus,
  shouldShowOnlineOrdersButton,
  visibleStatusTabKeys,
} from "@/lib/kds/flowMode";

describe("visibleStatusTabKeys", () => {
  it("keeps today's tabs in standard mode", () => {
    expect(visibleStatusTabKeys("3-step", "standard")).toEqual([
      "pending",
      "cooking",
      "ready",
      "done",
    ]);
    expect(visibleStatusTabKeys("2-step", "standard")).toEqual([
      "cooking",
      "ready",
      "done",
    ]);
  });

  it("drops only the Served tab in quick_done", () => {
    expect(visibleStatusTabKeys("2-step", "quick_done")).toEqual([
      "cooking",
      "done",
    ]);
    expect(visibleStatusTabKeys("3-step", "quick_done")).toEqual([
      "pending",
      "cooking",
      "done",
    ]);
  });
});

describe("resolveBumpStatus", () => {
  it("sends ready to served in quick_done", () => {
    expect(resolveBumpStatus("ready", "quick_done")).toBe("served");
  });

  it("leaves every other status alone", () => {
    expect(resolveBumpStatus("preparing", "quick_done")).toBe("preparing");
    expect(resolveBumpStatus("served", "quick_done")).toBe("served");
    expect(resolveBumpStatus("ready", "standard")).toBe("ready");
    expect(resolveBumpStatus("ready", null)).toBe("ready");
    expect(resolveBumpStatus("ready", undefined)).toBe("ready");
  });
});

describe("online orders button", () => {
  const storeOnNoOrderOut = { storeAutoAccept: true, orderoutAutoAccept: null };

  it("hides only when the setting is off and nothing needs a manual accept", () => {
    // QA 8: button off, storefront auto-accepts, no OrderOut.
    expect(shouldShowOnlineOrdersButton(false, storeOnNoOrderOut, 0)).toBe(
      false,
    );
  });

  it("stays when the setting is on", () => {
    expect(shouldShowOnlineOrdersButton(true, storeOnNoOrderOut, 0)).toBe(true);
  });

  it("stays while the storefront needs manual accepts", () => {
    // QA 9 / 10.
    expect(
      shouldShowOnlineOrdersButton(
        false,
        { storeAutoAccept: false, orderoutAutoAccept: null },
        0,
      ),
    ).toBe(true);
  });

  it("stays while OrderOut needs manual accepts", () => {
    // QA 11.
    expect(
      shouldShowOnlineOrdersButton(
        false,
        { storeAutoAccept: true, orderoutAutoAccept: false },
        0,
      ),
    ).toBe(true);
  });

  it("stays while any online order is pending, even with a stale config", () => {
    expect(shouldShowOnlineOrdersButton(false, storeOnNoOrderOut, 1)).toBe(true);
    expect(shouldShowOnlineOrdersButton(false, null, 2)).toBe(true);
  });

  it("treats an unknown config as nothing needing accepts", () => {
    expect(requiresManualAccept(null)).toBe(false);
    expect(
      requiresManualAccept({ storeAutoAccept: null, orderoutAutoAccept: null }),
    ).toBe(false);
    expect(shouldShowOnlineOrdersButton(false, null, 0)).toBe(false);
  });
});
