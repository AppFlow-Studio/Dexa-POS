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
): Promise<PosBillingAccessStatus> {
  if (!merchantId) return { allowed: true, failure: null, status: null };

  const { data, error } = await supabase.rpc(
    "get_merchant_subscription_status",
    { p_merchant_id: merchantId },
  );

  if (error) throw error;
  return normalizeMerchantBillingAccess(data);
}

export async function fetchLocationStationsWithBillingGate(
  supabase: SupabaseClient,
  params: { locationId: string; merchantId: string | null | undefined },
): Promise<{ stations: Station[]; billingAccess: PosBillingAccessStatus }> {
  const billingAccess = await fetchMerchantBillingAccess(
    supabase,
    params.merchantId,
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

  if (!freshStation) {
    return { valid: false, failure: createStationInactiveFailure() };
  }

  useStoreSettingsStore
    .getState()
    .setSelectedStation(stationToSelectedStation(freshStation));

  return { valid: true };
}
