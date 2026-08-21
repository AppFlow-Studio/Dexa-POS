import { usePinOverrideStore } from "@/stores/usePinOverrideStore";

describe("usePinOverrideStore manager access lifetime", () => {
  beforeEach(() => {
    usePinOverrideStore.setState({
      isPinModalOpen: false,
      actionToPerform: null,
      unlockedUntil: null,
      pendingGrant: null,
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("does not create a reusable session for Always Require PIN", () => {
    usePinOverrideStore.getState().setUnlocked(0);

    expect(usePinOverrideStore.getState().unlockedUntil).toBeNull();
    expect(usePinOverrideStore.getState().isUnlocked()).toBe(false);
  });

  it("expires a timed manager session at its configured boundary", () => {
    const now = 1_800_000_000_000;
    const dateNow = jest.spyOn(Date, "now").mockReturnValue(now);

    usePinOverrideStore.getState().setUnlocked(5);
    expect(usePinOverrideStore.getState().unlockedUntil).toBe(now + 300_000);
    expect(usePinOverrideStore.getState().isUnlocked()).toBe(true);

    dateNow.mockReturnValue(now + 300_000);
    expect(usePinOverrideStore.getState().isUnlocked()).toBe(false);
  });

  it("keeps the blocked navigation only until the PIN request closes", () => {
    const onGranted = jest.fn();

    usePinOverrideStore.getState().requestPinOverride(
      { type: "select_menu", payload: { menuName: "Dinner" } },
      onGranted,
    );

    expect(usePinOverrideStore.getState().isPinModalOpen).toBe(true);
    expect(usePinOverrideStore.getState().pendingGrant).toBe(onGranted);

    usePinOverrideStore.getState().closePinModal();
    expect(usePinOverrideStore.getState().isPinModalOpen).toBe(false);
    expect(usePinOverrideStore.getState().pendingGrant).toBeNull();
  });
});
