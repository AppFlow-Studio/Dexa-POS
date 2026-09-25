import { act, renderHook } from "@testing-library/react-native";

// --- Mocks -----------------------------------------------------------------

type StatusCallback = (status: string) => void;

const mockSettingsState: { stationSessionId: string | null } = {
  stationSessionId: "session-1",
};

let mockSubscribeCallback: StatusCallback | null = null;
let mockRpcImpl: () => Promise<{ data: unknown; error: unknown }> = () =>
  Promise.resolve({ data: { is_valid: true, status: "active" }, error: null });

const mockRpc = jest.fn((_name: string, _args: unknown) => ({
  abortSignal: () => mockRpcImpl(),
}));
const mockChannel: { on: jest.Mock; subscribe: jest.Mock } = {
  on: jest.fn(() => mockChannel),
  subscribe: jest.fn((cb: StatusCallback) => {
    mockSubscribeCallback = cb;
    return mockChannel;
  }),
};
const mockSupabase = {
  rpc: mockRpc,
  channel: jest.fn(() => mockChannel),
  // realtime-js fires CLOSED on the subscribe callback when a channel is removed.
  removeChannel: jest.fn(() => mockSubscribeCallback?.("CLOSED")),
};

const mockRefreshStation = jest.fn();

jest.mock("@/hooks/useSupabaseClient", () => ({
  useSupabaseClient: () => mockSupabase,
}));
jest.mock("@/lib/deviceId", () => ({ getDeviceId: () => "device-1" }));
jest.mock("@/lib/rootNavigation", () => ({ replaceRoute: jest.fn() }));
jest.mock("@/lib/posAccessControl", () => ({ getPosAccessFailure: () => null }));
jest.mock("@/lib/lifecycle/appLifecycleCoordinator", () => ({
  registerResumeTask: jest.fn(() => () => {}),
}));
jest.mock("@/lib/network/runWithDeadline", () => ({
  runWithDeadline: (_op: string, _ms: number, call: (s: AbortSignal) => unknown) =>
    call(new AbortController().signal),
}));
jest.mock("@/services/posAccessService", () => ({
  refreshSelectedStationOperationalState: (...args: unknown[]) =>
    mockRefreshStation(...args),
}));
jest.mock("@/stores/useStoreSettingsStore", () => ({
  useStoreSettingsStore: Object.assign(
    (selector: (s: Record<string, unknown>) => unknown) =>
      selector({
        ...mockSettingsState,
        clearSelectedStation: jest.fn(),
        setStationSessionId: jest.fn(),
      }),
    { getState: () => mockSettingsState }
  ),
}));

import { useSessionKickListener } from "@/hooks/useSessionKickListener";

// --- Helpers -----------------------------------------------------------------

const sessionChecks = () =>
  mockRpc.mock.calls.filter(([name]) => name === "check_device_session_status")
    .length;

async function advance(ms: number) {
  await act(async () => {
    jest.advanceTimersByTime(ms);
  });
  // The poll tick awaits the session check before deciding on a refresh.
  await act(async () => {
    for (let i = 0; i < 10; i++) await Promise.resolve();
  });
}

// --- Tests -------------------------------------------------------------------

describe("useSessionKickListener polling", () => {
  let randomSpy: jest.SpyInstance;

  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    randomSpy = jest.spyOn(Math, "random").mockReturnValue(0);
    mockSettingsState.stationSessionId = "session-1";
    mockSubscribeCallback = null;
    mockRpcImpl = () =>
      Promise.resolve({ data: { is_valid: true, status: "active" }, error: null });
    mockRefreshStation.mockResolvedValue({ valid: true });
  });

  afterEach(() => {
    randomSpy.mockRestore();
    jest.useRealTimers();
  });

  it("checks only the session every 30s and refreshes station state every 5 min", async () => {
    renderHook(() => useSessionKickListener());

    await advance(30_000);
    expect(sessionChecks()).toBe(1);
    // First tick after sign-in also refreshes station + billing state.
    expect(mockRefreshStation).toHaveBeenCalledTimes(1);

    // One tick at a time: each check settles before the next tick fires.
    for (let i = 0; i < 9; i++) await advance(30_000); // 5:00 after start, 4:30 since the refresh
    expect(sessionChecks()).toBe(10);
    expect(mockRefreshStation).toHaveBeenCalledTimes(1);

    await advance(30_000); // 5:30 -> 5:00 since the refresh
    expect(sessionChecks()).toBe(11);
    expect(mockRefreshStation).toHaveBeenCalledTimes(2);
  });

  it("delays the first tick by a random 0-5s offset", async () => {
    randomSpy.mockReturnValue(0.999);
    renderHook(() => useSessionKickListener());

    await advance(30_000);
    expect(sessionChecks()).toBe(0);

    await advance(5_000);
    expect(sessionChecks()).toBe(1);
  });

  it("does not overlap session checks while one is in flight", async () => {
    mockRpcImpl = () => new Promise(() => {}); // never settles
    renderHook(() => useSessionKickListener());

    await advance(30_000);
    await advance(30_000);
    await advance(30_000);
    expect(sessionChecks()).toBe(1);
  });

  it("re-checks the session at most once per 60s on channel errors, without the station RPCs", async () => {
    renderHook(() => useSessionKickListener());
    expect(mockSubscribeCallback).not.toBeNull();

    await act(async () => {
      mockSubscribeCallback!("CHANNEL_ERROR");
      mockSubscribeCallback!("CLOSED");
      mockSubscribeCallback!("CHANNEL_ERROR");
    });
    expect(sessionChecks()).toBe(1);
    expect(mockRefreshStation).not.toHaveBeenCalled();
  });

  it("ignores the CLOSED its own cleanup causes", async () => {
    const { unmount } = renderHook(() => useSessionKickListener());
    unmount();
    await advance(0);
    expect(mockSupabase.removeChannel).toHaveBeenCalled();
    expect(sessionChecks()).toBe(0);
  });

  it("coalesces a burst of station_updated nudges into one refresh", async () => {
    const { result } = renderHook(() => useSessionKickListener());

    act(() => {
      for (let i = 0; i < 5; i++) result.current.requestStationRefresh();
    });
    await advance(1_000);
    expect(mockRefreshStation).toHaveBeenCalledTimes(1);

    // A nudge inside the 10s window is deferred, not dropped.
    act(() => result.current.requestStationRefresh());
    await advance(5_000);
    expect(mockRefreshStation).toHaveBeenCalledTimes(1);
    await advance(5_000);
    expect(mockRefreshStation).toHaveBeenCalledTimes(2);
  });

  it("does not kick when the refresh result arrives after the session changed", async () => {
    let resolveRefresh!: (v: unknown) => void;
    mockRefreshStation.mockReturnValue(
      new Promise((resolve) => {
        resolveRefresh = resolve;
      })
    );
    const { result } = renderHook(() => useSessionKickListener());

    act(() => result.current.requestStationRefresh());
    await advance(0);
    expect(mockRefreshStation).toHaveBeenCalledTimes(1);

    mockSettingsState.stationSessionId = null; // e.g. remote deactivate logged out
    await act(async () => {
      resolveRefresh({
        valid: false,
        failure: { title: "Station inactive", message: "Deactivated" },
      });
    });
    await advance(0);
    expect(result.current.isKicked).toBe(false);
  });

  it("kicks when the refreshed station is no longer valid", async () => {
    mockRefreshStation.mockResolvedValue({
      valid: false,
      failure: { title: "Station inactive", message: "Deactivated" },
    });
    const { result } = renderHook(() => useSessionKickListener());

    act(() => result.current.requestStationRefresh());
    await advance(0);
    expect(result.current.isKicked).toBe(true);
    expect(result.current.kickReason).toBe("Deactivated");
  });
});
