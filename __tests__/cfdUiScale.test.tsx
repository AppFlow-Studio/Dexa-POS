import { CFDScaleProvider, MAX_CFD_UI_SCALE, MIN_CFD_UI_SCALE, computeUiScale, useUiScale } from "@/lib/uiScale";
import { renderHook } from "@testing-library/react-native";
import * as React from "react";

/**
 * The CFD scale override travels POS settings → CFD payload → display store →
 * CFDScaleProvider → useUiScale(). These tests pin the two ends that are easy
 * to break: the hook honouring the context (which is what lets ~12 unmodified
 * CFD screens pick the setting up), and the `null`-means-"no override"
 * semantics that let an operator clear the setting back to automatic.
 */

const WINDOW = { width: 1333, height: 752 };

jest.mock("react-native/Libraries/Utilities/useWindowDimensions", () => ({
  __esModule: true,
  default: () => WINDOW,
}));

// POS-side override — kept at null so these tests isolate the CFD path.
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
    <CFDScaleProvider override={override}>{children}</CFDScaleProvider>
  );
  Wrapper.displayName = "CFDScaleTestWrapper";
  return Wrapper;
};

describe("useUiScale inside a CFD tree", () => {
  const base = computeUiScale(WINDOW.width, WINDOW.height);

  it("applies the CFD override on top of the automatic scale", () => {
    const { result } = renderHook(() => useUiScale(), {
      wrapper: wrapperFor(1.35),
    });
    expect(result.current).toBeCloseTo(base * 1.35, 5);
  });

  it("falls back to the automatic scale when the override is null", () => {
    const { result } = renderHook(() => useUiScale(), {
      wrapper: wrapperFor(null),
    });
    expect(result.current).toBeCloseTo(base, 5);
  });

  it("ignores the POS override so the two screens scale independently", () => {
    // The whole point of the setting: a POS sized down must not drag the
    // customer display down with it.
    mockPos.override = 0.85;
    const { result } = renderHook(() => useUiScale(), {
      wrapper: wrapperFor(1.35),
    });
    expect(result.current).toBeCloseTo(base * 1.35, 5);
  });

  it("clamps to the CFD range rather than the narrower POS range", () => {
    const high = renderHook(() => useUiScale(), { wrapper: wrapperFor(99) });
    expect(high.result.current).toBe(MAX_CFD_UI_SCALE);

    const low = renderHook(() => useUiScale(), { wrapper: wrapperFor(0.001) });
    expect(low.result.current).toBe(MIN_CFD_UI_SCALE);
  });

  it("leaves non-CFD trees on the POS override", () => {
    mockPos.override = 0.85;
    const { result } = renderHook(() => useUiScale());
    expect(result.current).toBeCloseTo(base * 0.85, 5);
  });
});

describe("payload carry-forward semantics", () => {
  // `null` is a real value here ("no override"), so the stores must test key
  // presence rather than `??` — otherwise clearing the setting back to
  // Default could never reach the display.
  const apply = (
    payload: { cfdUiScaleOverride?: number | null },
    current: number | null,
  ) =>
    "cfdUiScaleOverride" in payload
      ? (payload.cfdUiScaleOverride ?? null)
      : current;

  it("applies an explicit null, clearing a previous override", () => {
    expect(apply({ cfdUiScaleOverride: null }, 1.35)).toBeNull();
  });

  it("carries the current value forward when the key is absent", () => {
    expect(apply({}, 1.35)).toBe(1.35);
  });

  it("applies a new numeric override", () => {
    expect(apply({ cfdUiScaleOverride: 0.85 }, null)).toBe(0.85);
  });
});
