import { act, renderHook } from "@testing-library/react-native";
import { estimateMinutesLeft, lowStep, shouldPrompt } from "@/handheld/lib/battery";
import { OFFLINE_GRACE_MS, RECONNECT_GRACE_MS, useConnectionWatcher } from "@/handheld/hooks/useConnectionWatcher";
import { useConnectionStore } from "@/handheld/lib/connectionStore";

let mockOnline = true;
let mockAllConnected = true;
const mockListeners = new Set<() => void>();

jest.mock("@/services/offlineSyncService", () => ({
  getRawIsOnline: () => mockOnline,
  subscribeOnlineStatus: (fn: () => void) => {
    mockListeners.add(fn);
    return () => mockListeners.delete(fn);
  },
}));
jest.mock("@/contexts/LocationRealtimeProvider", () => ({
  useLocationRealtime: () => ({ allConnected: mockAllConnected }),
}));

function setNetwork(next: { online?: boolean; allConnected?: boolean }, rerender: () => void) {
  if (next.online !== undefined) mockOnline = next.online;
  if (next.allConnected !== undefined) mockAllConnected = next.allConnected;
  act(() => {
    mockListeners.forEach((fn) => fn());
    rerender();
  });
}

describe("low battery rules", () => {
  it("steps at 10% and 5%", () => {
    expect(lowStep(11)).toBeNull();
    expect(lowStep(10)).toBe(10);
    expect(lowStep(4)).toBe(5);
    expect(lowStep(null)).toBeNull();
  });
  it("prompts once per step, never while charging", () => {
    expect(shouldPrompt(9, false, Infinity)).toBe(true);
    expect(shouldPrompt(9, false, 10)).toBe(false);
    expect(shouldPrompt(5, false, 10)).toBe(true);
    expect(shouldPrompt(5, true, Infinity)).toBe(false);
  });
  it("estimates only with enough history", () => {
    const t0 = 0;
    expect(estimateMinutesLeft([{ at: t0, percent: 20 }, { at: t0 + 5 * 60_000, percent: 18 }])).toBeNull();
    // 4 points in 20 minutes → 0.2%/min → 8% lasts 40 minutes.
    expect(estimateMinutesLeft([{ at: t0, percent: 12 }, { at: t0 + 20 * 60_000, percent: 8 }])).toBe(40);
  });
});

describe("connection card grace", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockOnline = true;
    mockAllConnected = true;
    useConnectionStore.setState({ state: "online" });
  });
  afterEach(() => jest.useRealTimers());

  it("ignores an access-point hand-off shorter than the grace", () => {
    const { rerender } = renderHook(() => useConnectionWatcher());
    setNetwork({ online: false }, () => rerender({}));
    act(() => jest.advanceTimersByTime(OFFLINE_GRACE_MS - 500));
    setNetwork({ online: true }, () => rerender({}));
    act(() => jest.advanceTimersByTime(OFFLINE_GRACE_MS));
    expect(useConnectionStore.getState().state).toBe("online");
  });

  it("shows offline after the grace, then reconnecting straight away when the network returns", () => {
    const { rerender } = renderHook(() => useConnectionWatcher());
    setNetwork({ online: false, allConnected: false }, () => rerender({}));
    act(() => jest.advanceTimersByTime(OFFLINE_GRACE_MS));
    expect(useConnectionStore.getState().state).toBe("offline");
    setNetwork({ online: true }, () => rerender({}));
    expect(useConnectionStore.getState().state).toBe("reconnecting");
    setNetwork({ allConnected: true }, () => rerender({}));
    expect(useConnectionStore.getState().state).toBe("online");
  });

  it("shows reconnecting when the socket stays down on a live network", () => {
    const { rerender } = renderHook(() => useConnectionWatcher());
    setNetwork({ allConnected: false }, () => rerender({}));
    act(() => jest.advanceTimersByTime(RECONNECT_GRACE_MS - 1));
    expect(useConnectionStore.getState().state).toBe("online");
    act(() => jest.advanceTimersByTime(1));
    expect(useConnectionStore.getState().state).toBe("reconnecting");
  });
});
