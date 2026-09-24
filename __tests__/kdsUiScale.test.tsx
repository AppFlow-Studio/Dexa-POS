import {
  KDSScaleProvider,
  MAX_KDS_UI_SCALE,
  MIN_KDS_UI_SCALE,
  computeUiScale,
  useUiScale,
} from "@/lib/uiScale";
import { renderHook } from "@testing-library/react-native";
import * as React from "react";

/**
 * The KDS board scale travels kds_displays.font_scale → KDS store →
 * KDSScaleProvider (wrapping the board) → useUiScale(). These tests pin the
 * hook honouring the context, which is what lets every board component that
 * already calls useUiScale() pick the setting up, and the `null` opt-out the
 * settings panel over the board relies on.
 */

const WINDOW = { width: 1333, height: 752 };

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => WINDOW,
}));

// `mock`-prefixed so Babel's jest.mock hoisting allows the factory to close
// over it.
const mockPos: { override: number | null } = { override: null };
jest.mock("@/stores/useSettingsStore", () => ({
  useSettingsStore: (selector: (s: unknown) => unknown) =>
    selector({ uiScaleOverride: mockPos.override }),
}));

beforeEach(() => {
  mockPos.override = null;
});

const wrapperFor = (override: number | null) => {
  const Wrapper = ({ children }: { children: React.ReactNode }) => (
    <KDSScaleProvider override={override}>{children}</KDSScaleProvider>
  );
  Wrapper.displayName = "KDSScaleTestWrapper";
  return Wrapper;
};

describe("useUiScale inside a KDS board tree", () => {
  const base = computeUiScale(WINDOW.width, WINDOW.height);

  it("applies the display's font scale on top of the automatic scale", () => {
    const { result } = renderHook(() => useUiScale(), {
      wrapper: wrapperFor(1.5),
    });
    expect(result.current).toBeCloseTo(base * 1.5, 5);
  });

  it("ignores the POS override so the board and POS size independently", () => {
    mockPos.override = 0.85;
    const { result } = renderHook(() => useUiScale(), {
      wrapper: wrapperFor(1.25),
    });
    expect(result.current).toBeCloseTo(base * 1.25, 5);
  });

  it("clamps to the KDS range rather than the narrower POS range", () => {
    const high = renderHook(() => useUiScale(), { wrapper: wrapperFor(99) });
    expect(high.result.current).toBe(MAX_KDS_UI_SCALE);

    const low = renderHook(() => useUiScale(), { wrapper: wrapperFor(0.001) });
    expect(low.result.current).toBe(MIN_KDS_UI_SCALE);
  });

  it("lets a nested null provider take a subtree back to the normal scale", () => {
    // The settings panel shown over the board opts out this way.
    mockPos.override = 0.85;
    const Nested = ({ children }: { children: React.ReactNode }) => (
      <KDSScaleProvider override={1.5}>
        <KDSScaleProvider override={null}>{children}</KDSScaleProvider>
      </KDSScaleProvider>
    );
    const { result } = renderHook(() => useUiScale(), { wrapper: Nested });
    expect(result.current).toBeCloseTo(base * 0.85, 5);
  });
});
