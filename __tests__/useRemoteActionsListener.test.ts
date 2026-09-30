import { renderHook } from "@testing-library/react-native";

const mockHandlers = new Map<string, (msg: { payload: unknown }) => void>();
const mockChannel: { on: jest.Mock; subscribe: jest.Mock } = {
  on: jest.fn(
    (_type: string, filter: { event: string }, cb: (msg: { payload: unknown }) => void) => {
      mockHandlers.set(filter.event, cb);
      return mockChannel;
    }
  ),
  subscribe: jest.fn(() => mockChannel),
};
const mockSupabase = {
  channel: jest.fn(() => mockChannel),
  removeChannel: jest.fn(),
};
const mockRequestStationRefresh = jest.fn();
const mockReportActionStatus = jest.fn();
const mockLogRemoteAction = jest.fn();

jest.mock("@/hooks/useSupabaseClient", () => ({
  useSupabaseClient: () => mockSupabase,
}));
jest.mock("@/contexts/SessionKickListenerProvider", () => ({
  useSessionKick: () => ({ requestStationRefresh: mockRequestStationRefresh }),
}));
jest.mock("expo-router", () => ({ useRouter: () => ({ replace: jest.fn() }) }));
jest.mock("@/services/remoteActions", () => ({
  handleClearCache: jest.fn(),
  handleConfigUpdate: jest.fn(),
  handleDeactivateStation: jest.fn(),
  handleForceRefresh: jest.fn(),
  handleRestartApp: jest.fn(),
  handleSendLogs: jest.fn(),
  logRemoteAction: (...args: unknown[]) => mockLogRemoteAction(...args),
  reportActionStatus: (...args: unknown[]) => mockReportActionStatus(...args),
}));
jest.mock("@/stores/useStoreSettingsStore", () => ({
  useStoreSettingsStore: (selector: (s: Record<string, unknown>) => unknown) =>
    selector({
      selectedStation: { id: "station-1" },
      clearSelectedStation: jest.fn(),
      setStationSessionId: jest.fn(),
    }),
}));

import { useRemoteActionsListener } from "@/hooks/useRemoteActionsListener";

describe("useRemoteActionsListener station_updated", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockHandlers.clear();
  });

  it("joins station:{id} and relays station_updated to the station refresh", () => {
    renderHook(() => useRemoteActionsListener());

    expect(mockSupabase.channel).toHaveBeenCalledWith("station:station-1");
    const handler = mockHandlers.get("station_updated");
    expect(handler).toBeDefined();

    handler!({ payload: {} });
    handler!({ payload: {} });
    expect(mockRequestStationRefresh).toHaveBeenCalledTimes(2);
  });

  it("does not treat station_updated as a remote action (no status report, no audit row)", () => {
    renderHook(() => useRemoteActionsListener());
    mockHandlers.get("station_updated")!({ payload: {} });

    expect(mockReportActionStatus).not.toHaveBeenCalled();
    expect(mockLogRemoteAction).not.toHaveBeenCalled();
  });
});
