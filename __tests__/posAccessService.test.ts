import {
  fetchLocationStationsWithBillingGate,
  fetchLocationSubscriptionEntitlement,
  refreshSelectedStationOperationalState,
} from "@/services/posAccessService";

const mockStore: any = {
  selectedStore: { id: "location-1", merchant_id: "merchant-1" },
  selectedStation: { id: "station-1" },
  setBillingAccess: jest.fn(),
  setSelectedStation: jest.fn(),
};
jest.mock("@/stores/useStoreSettingsStore", () => ({
  useStoreSettingsStore: { getState: () => mockStore },
}));

function client(
  status: Record<string, unknown>,
  station: Record<string, unknown> | null,
) {
  return {
    rpc: jest.fn(async (name: string) => ({
      data:
        name === "get_subscription_access_state"
          ? status
          : station
            ? [station]
            : [],
      error: null,
    })),
  };
}

describe("station refresh used by kiosk checkout", () => {
  it("fails closed when merchant scope is missing", async () => {
    const supabase = client({ allowed: true, status: "active" }, null);

    const result = await fetchLocationStationsWithBillingGate(supabase as any, {
      merchantId: null,
      locationId: "location-1",
    });

    expect(result).toMatchObject({
      stations: [],
      billingAccess: { allowed: false },
    });
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it("blocks suspension before fetching the terminal assignment", async () => {
    const supabase = client(
      { allowed: false, status: "subscription_suspended" },
      null,
    );
    expect(await refreshSelectedStationOperationalState(supabase as any)).toMatchObject({ valid: false, failure: { reason: "subscription_suspended" } });
    expect(supabase.rpc).toHaveBeenCalledTimes(1);
    expect(supabase.rpc).toHaveBeenCalledWith(
      "get_subscription_access_state",
      { p_merchant_id: "merchant-1", p_location_id: "location-1" },
    );
    expect(mockStore.setSelectedStation).not.toHaveBeenCalled();
  });

  it.each([null, { id: "station-1", is_active: false }])("blocks missing or inactive stations", async (station) => {
    const supabase = client({ allowed: true, status: "active" }, station);
    expect(await refreshSelectedStationOperationalState(supabase as any)).toMatchObject({ valid: false, failure: { reason: "station_inactive" } });
  });

  it("refreshes the active Valor assignment without dropping the kiosk profile", async () => {
    const terminal = { id: "valor-2", terminal_type: "valor", connection_type: "usb", epi: "test-epi" };
    const supabase = client({ allowed: true, status: "active" }, { id: "station-1", is_active: true, kiosk_profile_id: "profile-1", payment_terminal: terminal });
    expect(await refreshSelectedStationOperationalState(supabase as any)).toEqual({ valid: true });
    expect(mockStore.setSelectedStation).toHaveBeenCalledWith(expect.objectContaining({ id: "station-1", kiosk_profile_id: "profile-1", payment_terminal: terminal }));
  });

  it.each(["active", "billing_exempt", "past_due_grace"])(
    "allows %s and refreshes the selected location station",
    async (status) => {
      const supabase = client(
        {
          allowed: true,
          status,
          subscription_status: status === "billing_exempt" ? "suspended" : status,
        },
        { id: "station-1", is_active: true },
      );

      expect(
        await refreshSelectedStationOperationalState(supabase as any),
      ).toEqual({ valid: true });
    },
  );

  it("blocks an expired exemption through the authoritative RPC decision", async () => {
    const supabase = client(
      {
        allowed: false,
        status: "subscription_suspended",
        billing_exempt: false,
        billing_exempt_expires_at: "2026-01-01T00:00:00Z",
      },
      null,
    );

    expect(
      await refreshSelectedStationOperationalState(supabase as any),
    ).toMatchObject({ valid: false });
  });

  it("blocks manual suspension even when exemption metadata exists", async () => {
    const supabase = client(
      {
        allowed: false,
        status: "merchant_suspended",
        billing_exempt: true,
      },
      null,
    );

    expect(
      await refreshSelectedStationOperationalState(supabase as any),
    ).toMatchObject({ valid: false });
  });

  it("passes location scope while loading stations", async () => {
    const supabase = client(
      { allowed: true, status: "billing_exempt" },
      { id: "station-1", is_active: true },
    );

    await fetchLocationStationsWithBillingGate(supabase as any, {
      merchantId: "merchant-1",
      locationId: "location-2",
    });

    expect(supabase.rpc).toHaveBeenNthCalledWith(
      1,
      "get_subscription_access_state",
      { p_merchant_id: "merchant-1", p_location_id: "location-2" },
    );
  });

  it("propagates access-network failures instead of refreshing from stale state", async () => {
    const error = new Error("Offline");
    const supabase = { rpc: jest.fn().mockResolvedValue({ data: null, error }) };
    await expect(refreshSelectedStationOperationalState(supabase as any)).rejects.toBe(error);
    expect(mockStore.setSelectedStation).not.toHaveBeenCalled();
  });
});

describe("location subscription entitlements", () => {
  it("keeps entitlement isolated by location", async () => {
    const supabase = {
      rpc: jest.fn(async (_name: string, args: Record<string, string>) => ({
        data: {
          entitled: args.p_location_id === "location-a",
          status: args.p_location_id === "location-a" ? "active" : "inactive",
          reason:
            args.p_location_id === "location-a"
              ? null
              : "Service is not assigned to this location",
        },
        error: null,
      })),
    };

    const assigned = await fetchLocationSubscriptionEntitlement(
      supabase as any,
      {
        merchantId: "merchant-1",
        locationId: "location-a",
        serviceCode: "inventory",
      },
    );
    const otherLocation = await fetchLocationSubscriptionEntitlement(
      supabase as any,
      {
        merchantId: "merchant-1",
        locationId: "location-b",
        serviceCode: "inventory",
      },
    );

    expect(assigned.entitled).toBe(true);
    expect(otherLocation).toMatchObject({
      entitled: false,
      status: "inactive",
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(
      2,
      "get_subscription_entitlement",
      {
        p_merchant_id: "merchant-1",
        p_location_id: "location-b",
        p_service_code: "inventory",
      },
    );
  });

  it("does not manufacture an unassigned entitlement for an exempt merchant", async () => {
    const supabase = {
      rpc: jest.fn().mockResolvedValue({
        data: {
          entitled: false,
          status: "inactive",
          access: { allowed: true, status: "billing_exempt" },
        },
        error: null,
      }),
    };

    expect(
      await fetchLocationSubscriptionEntitlement(supabase as any, {
        merchantId: "merchant-1",
        locationId: "location-1",
        serviceCode: "unassigned_feature",
      }),
    ).toMatchObject({ entitled: false, status: "inactive" });
  });
});
