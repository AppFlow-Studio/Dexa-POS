import { useStationSignIn } from "@/hooks/useStationSignIn";
import { renderHook } from "@testing-library/react-native";

// --- Mocks -----------------------------------------------------------------

let mockRpcResult: { data: unknown; error: unknown } = {
  data: null,
  error: null,
};
const mockRpc = jest.fn(async (_name: string, _args: unknown) => mockRpcResult);
const mockSupabase = { rpc: mockRpc };
const mockSetStationSessionId = jest.fn();
const mockSendKickBroadcast = jest.fn(async (..._args: unknown[]) => {});

jest.mock("@/hooks/useSupabaseClient", () => ({
  useSupabaseClient: () => mockSupabase,
}));
jest.mock("@/hooks/usePinSignIn", () => ({
  getDeviceInfo: async () => ({
    ip_address: "10.0.0.5",
    app_version: "2.6.0",
    os_version: "Android 14",
    hardware_model: "Tab",
  }),
  sanitizeIpAddress: (ip: string | null) => ip,
  sendKickBroadcast: (...args: unknown[]) => mockSendKickBroadcast(...args),
}));
jest.mock("@/lib/deviceId", () => ({ getDeviceId: () => "device-1" }));
jest.mock("@/lib/deviceName", () => ({ getDeviceName: () => "Kitchen Tab" }));
jest.mock("@/stores/useStoreSettingsStore", () => ({
  useStoreSettingsStore: {
    getState: () => ({ setStationSessionId: mockSetStationSessionId }),
  },
}));


const start = (forceTakeover = false) => {
  const { result } = renderHook(() => useStationSignIn());
  return result.current.startStation({
    locationId: "loc-1",
    stationId: "station-1",
    forceTakeover,
  });
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe("useStationSignIn", () => {
  it("claims the station without a PIN and stores its session", async () => {
    mockRpcResult = {
      data: {
        success: true,
        session: { session_id: "session-9", kicked_previous: false },
      },
      error: null,
    };

    await expect(start()).resolves.toEqual({ outcome: "started" });
    expect(mockRpc).toHaveBeenCalledWith(
      "pos_station_login",
      expect.objectContaining({
        p_location_id: "loc-1",
        p_station_id: "station-1",
        p_device_id: "device-1",
        p_force_takeover: false,
      }),
    );
    expect(mockRpc.mock.calls[0][1]).not.toHaveProperty("p_pin_code");
    expect(mockSetStationSessionId).toHaveBeenCalledWith("session-9");
    expect(mockSendKickBroadcast).not.toHaveBeenCalled();
  });

  it("tells the device it took the station from", async () => {
    mockRpcResult = {
      data: {
        success: true,
        session: {
          session_id: "session-9",
          kicked_previous: true,
          kicked_device_id: "device-2",
          kicked_session_id: "session-1",
        },
      },
      error: null,
    };

    await expect(start(true)).resolves.toEqual({ outcome: "started" });
    expect(mockSendKickBroadcast).toHaveBeenCalledWith(
      mockSupabase,
      "device-2",
      expect.objectContaining({
        session_id: "session-9",
        kicked_by: "Kitchen Tab",
        source_device_id: "device-1",
        target_session_id: "session-1",
      }),
    );
  });

  it("reports a station held by another device", async () => {
    const currentSession = {
      session_id: "session-1",
      device_name: "Front Tab",
      staff_name: null,
      started_at: "2026-10-01T08:00:00Z",
    };
    mockRpcResult = {
      data: {
        success: false,
        error_code: "STATION_IN_USE",
        current_session: currentSession,
      },
      error: null,
    };

    await expect(start()).resolves.toEqual({
      outcome: "in_use",
      currentSession,
    });
    expect(mockSetStationSessionId).not.toHaveBeenCalled();
  });

  it("falls back to the PIN sign-in when the backend lacks the function", async () => {
    mockRpcResult = { data: null, error: { code: "PGRST202" } };
    await expect(start()).resolves.toEqual({ outcome: "needs_pin" });
  });

  it("falls back to the PIN sign-in for a station that requires one", async () => {
    mockRpcResult = {
      data: { success: false, error_code: "PIN_REQUIRED" },
      error: null,
    };
    await expect(start()).resolves.toEqual({ outcome: "needs_pin" });
  });

  it("fails without a session on access or connection errors", async () => {
    mockRpcResult = {
      data: { success: false, error_code: "ACCESS_DENIED" },
      error: null,
    };
    await expect(start()).resolves.toMatchObject({
      outcome: "failed",
      title: "No Access",
    });

    mockRpcResult = { data: null, error: { code: "08006" } };
    await expect(start()).resolves.toMatchObject({ outcome: "failed" });
    expect(mockSetStationSessionId).not.toHaveBeenCalled();
  });
});
