import {
  createStationInactiveFailure,
  normalizeMerchantBillingAccess,
  PosBillingAccessStatus,
  PosAccessFailure,
} from "@/lib/posAccessControl";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { SelectedStation, Station } from "@/types/station";
import type { SupabaseClient } from "@supabase/supabase-js";

export function stationToSelectedStation(station: Station): SelectedStation {
  return {
    id: station.id,
    station_name: station.station_name,
    station_type: station.station_type,
    kiosk_profile_id: station.kiosk_profile_id,
    station_number: station.station_number,
    view_scope: station.view_scope,
    can_create_orders: station.can_create_orders,
    can_process_payments: station.can_process_payments,
    can_void_orders: station.can_void_orders,
    can_apply_discounts: station.can_apply_discounts,
    can_update_kitchen_status: station.can_update_kitchen_status,
    current_receipt_printer_id: station.current_receipt_printer_id,
    payment_terminal: station.payment_terminal || null,
  };
}

export async function fetchMerchantBillingAccess(
  supabase: SupabaseClient,
  merchantId: string | null | undefined,
  locationId: string | null | undefined,
): Promise<PosBillingAccessStatus> {
  if (!merchantId || !locationId) {
    return normalizeMerchantBillingAccess(null);
  }

  // database.types.ts must be regenerated after the shared website migration
  // is deployed. Keep this single cast at the contract boundary until then.
  const { data, error } = await (supabase.rpc as any)(
    "get_subscription_access_state",
    {
      p_merchant_id: merchantId,
      p_location_id: locationId,
    },
  );

  if (error) throw error;
  return normalizeMerchantBillingAccess(data);
}

export interface PosSubscriptionEntitlement {
  entitled: boolean;
  status: string | null;
  reason: string | null;
  raw?: unknown;
}

export async function fetchLocationSubscriptionEntitlement(
  supabase: SupabaseClient,
  params: {
    merchantId: string;
    locationId: string;
    serviceCode: string;
  },
): Promise<PosSubscriptionEntitlement> {
  const serviceCode = params.serviceCode.trim();
  if (!params.merchantId || !params.locationId || !serviceCode) {
    return {
      entitled: false,
      status: "invalid_request",
      reason: "Merchant, location, and service code are required.",
    };
  }

  const { data, error } = await (supabase.rpc as any)(
    "get_subscription_entitlement",
    {
      p_merchant_id: params.merchantId,
      p_location_id: params.locationId,
      p_service_code: serviceCode,
    },
  );

  if (error) throw error;
  const candidate = Array.isArray(data) ? data[0] : data;
  const payload =
    candidate && typeof candidate === "object"
      ? (candidate as Record<string, unknown>)
      : {};

  return {
    // Fail closed: an exemption never manufactures an entitlement.
    entitled: payload.entitled === true,
    status: typeof payload.status === "string" ? payload.status : null,
    reason: typeof payload.reason === "string" ? payload.reason : null,
    raw: data,
  };
}

export async function fetchLocationStationsWithBillingGate(
  supabase: SupabaseClient,
  params: { locationId: string; merchantId: string | null | undefined },
): Promise<{ stations: Station[]; billingAccess: PosBillingAccessStatus }> {
  const billingAccess = await fetchMerchantBillingAccess(
    supabase,
    params.merchantId,
    params.locationId,
  );

  useStoreSettingsStore.getState().setBillingAccess(billingAccess);

  if (!billingAccess.allowed) {
    return { stations: [], billingAccess };
  }

  const { data, error } = await supabase.rpc(
    "get_location_stations_with_status",
    { p_location_id: params.locationId },
  );

  if (error) throw error;

  return {
    stations: (Array.isArray(data) ? data : []) as Station[],
    billingAccess,
  };
}

export async function refreshSelectedStationOperationalState(
  supabase: SupabaseClient,
): Promise<{ valid: true } | { valid: false; failure: PosAccessFailure }> {
  const store = useStoreSettingsStore.getState();
  const selectedStore = store.selectedStore;
  const selectedStation = store.selectedStation;

  if (!selectedStore?.id || !selectedStation?.id) {
    return { valid: true };
  }

  const billingAccess = await fetchMerchantBillingAccess(
    supabase,
    selectedStore.merchant_id,
    selectedStore.id,
  );
  useStoreSettingsStore.getState().setBillingAccess(billingAccess);

  if (!billingAccess.allowed && billingAccess.failure) {
    return { valid: false, failure: billingAccess.failure };
  }

  const { data, error } = await supabase.rpc(
    "get_location_stations_with_status",
    { p_location_id: selectedStore.id },
  );

  if (error) {
    throw error;
  }

  const stations = (Array.isArray(data) ? data : []) as Station[];
  const freshStation = stations.find((station) => station.id === selectedStation.id);

  if (!freshStation || freshStation.is_active === false) {
    return { valid: false, failure: createStationInactiveFailure() };
  }

  useStoreSettingsStore
    .getState()
    .setSelectedStation(stationToSelectedStation(freshStation));

  return { valid: true };
}
