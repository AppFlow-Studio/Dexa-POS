/**
 * Regression guard for the kiosk-orientation leak shipped in PR #192.
 *
 * `useKioskOrientation` is called from the shared main/auth layouts for EVERY
 * station (hooks can't be conditional). On a non-kiosk station the profile
 * orientation is `undefined`, and `resolveKioskOrientationMode("profile",
 * undefined)` resolves to `"vertical"` — which portrait-locked the entire
 * landscape-only POS (Android FIXED_ORIENTATION letterbox: black side bars,
 * squeezed portrait column). The `active` flag gates the lock so only a real
 * kiosk context may dictate orientation.
 */
import { renderHook } from "@testing-library/react-native";
import * as ScreenOrientation from "expo-screen-orientation";
import { useKioskOrientation } from "@/hooks/kiosk/useKioskOrientation";
import { useKioskDeviceSettingsStore } from "@/stores/useKioskDeviceSettingsStore";

jest.mock("expo-screen-orientation", () => ({
  lockAsync: jest.fn(() => Promise.resolve()),
  unlockAsync: jest.fn(() => Promise.resolve()),
  OrientationLock: {
    LANDSCAPE: "LANDSCAPE",
    PORTRAIT_UP: "PORTRAIT_UP",
    DEFAULT: "DEFAULT",
  },
}));

const lockAsync = ScreenOrientation.lockAsync as jest.Mock;
const { PORTRAIT_UP, LANDSCAPE } = ScreenOrientation.OrientationLock;

describe("useKioskOrientation orientation gating", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // The device default; the bug reproduced precisely under it.
    useKioskDeviceSettingsStore.setState({ orientationMode: "profile" });
  });

  it("does NOT portrait-lock a non-kiosk station (active=false), despite the vertical profile fallback", () => {
    renderHook(() => useKioskOrientation(undefined, false));
    expect(lockAsync).not.toHaveBeenCalledWith(PORTRAIT_UP);
  });

  it("keeps the kiosk vertical default when active with no profile orientation", () => {
    renderHook(() => useKioskOrientation(undefined, true));
    expect(lockAsync).toHaveBeenCalledWith(PORTRAIT_UP);
  });

  it("locks landscape for a horizontal kiosk", () => {
    renderHook(() => useKioskOrientation("horizontal", true));
    expect(lockAsync).toHaveBeenCalledWith(LANDSCAPE);
  });

  it("restores landscape when an active kiosk unmounts (leaving for a POS station)", () => {
    const { unmount } = renderHook(() => useKioskOrientation("vertical", true));
    lockAsync.mockClear();
    unmount();
    expect(lockAsync).toHaveBeenCalledWith(LANDSCAPE);
  });
});
