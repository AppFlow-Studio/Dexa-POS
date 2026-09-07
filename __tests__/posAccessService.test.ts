import { refreshSelectedStationOperationalState } from "@/services/posAccessService";

const mockStore: any = {
  selectedStore: { id: "location-1", merchant_id: "merchant-1" },
  selectedStation: { id: "station-1" },
  setBillingAccess: jest.fn(),
  setSelectedStation: jest.fn(),
};
jest.mock("@/stores/useStoreSettingsStore", () => ({
  useStoreSettingsStore: { getState: () => mockStore },
}));

function client(status: Record<string, unknown>, station: Record<string, unknown> | null) {
  return { rpc: jest.fn(async (name: string) => ({
    data: name === "get_merchant_subscription_status" ? status : station ? [station] : [],
    error: null,
  })) };
}

describe("station refresh used by kiosk checkout", () => {
  it("blocks suspension before fetching the terminal assignment", async () => {
    const supabase = client({ subscription_status: "suspended" }, null);
    expect(await refreshSelectedStationOperationalState(supabase as any)).toMatchObject({ valid: false, failure: { reason: "subscription_suspended" } });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(mockStore.setSelectedStation).not.toHaveBeenCalled();
  });

  it.each([null, { id: "station-1", is_active: false }])("blocks missing or inactive stations", async (station) => {
    const supabase = client({ subscription_status: "active" }, station);
    expect(await refreshSelectedStationOperationalState(supabase as any)).toMatchObject({ valid: false, failure: { reason: "station_inactive" } });
  });

  it("refreshes the active Valor assignment without dropping the kiosk profile", async () => {
    const terminal = { id: "valor-2", terminal_type: "valor", connection_type: "usb", epi: "test-epi" };
    const supabase = client({ subscription_status: "active" }, { id: "station-1", is_active: true, kiosk_profile_id: "profile-1", payment_terminal: terminal });
    expect(await refreshSelectedStationOperationalState(supabase as any)).toEqual({ valid: true });
    expect(mockStore.setSelectedStation).toHaveBeenCalledWith(expect.objectContaining({ id: "station-1", kiosk_profile_id: "profile-1", payment_terminal: terminal }));
  });

  it("characterizes the unresolved past_due/allowed contract conflict", async () => {
    // This is the existing policy, not approval of it. Billing owners must
    // confirm the grace contract before changing the shared normalizer.
    const supabase = client({ subscription_status: "past_due", access_allowed: true }, { id: "station-1", is_active: true });
    expect(await refreshSelectedStationOperationalState(supabase as any)).toMatchObject({ valid: false });
  });

  it("propagates access-network failures instead of refreshing from stale state", async () => {
    const error = new Error("Offline");
    const supabase = { rpc: jest.fn().mockResolvedValue({ data: null, error }) };
    await expect(refreshSelectedStationOperationalState(supabase as any)).rejects.toBe(error);
    expect(mockStore.setSelectedStation).not.toHaveBeenCalled();
  });
});
