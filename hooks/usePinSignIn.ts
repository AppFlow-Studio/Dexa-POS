import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { replaceRoute } from "@/lib/rootNavigation";
import { getDeviceName } from "@/lib/deviceName";
import { useEmployeeStore, STATION_IN_USE_AUTH_ERROR } from "@/stores/useEmployeeStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { SelectedLocation } from "@/stores/useStoreSettingsStore";
import { PosStaffLoginResponse, SelectedStation } from "@/types/station";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Network from "expo-network";
import { useCallback } from "react";

// ── Shared utilities (also used by pin-login.tsx) ───────────────────────────

export const sanitizeIpAddress = (ip: string | null | undefined): string | null => {
  if (!ip || ip.trim() === '') return null;
  const ipv4Regex = /^(\d{1,3}\.){3}\d{1,3}$/;
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/;
  const trimmed = ip.trim();
  if (ipv4Regex.test(trimmed) || ipv6Regex.test(trimmed)) return trimmed;
  return null;
};

export const getDeviceInfo = async () => {
  const ip = await Network.getIpAddressAsync().catch(() => null);
  return {
    ip_address: ip !== '' ? ip : null,
    app_version: Application.nativeApplicationVersion,
    os_version: `${Device.osName} ${Device.osVersion}`,
    hardware_model: Device.modelName,
  };
};

export type DeviceInfo = Awaited<ReturnType<typeof getDeviceInfo>>;

export type SignInOutcome =
  | { outcome: 'navigating' }
  | { outcome: 'cache_miss' };

// ── Internal helpers ─────────────────────────────────────────────────────────

export async function sendKickBroadcast(
  supabase: ReturnType<typeof useSupabaseClient>,
  kickedDeviceId: string,
  payload: { session_id: string; kicked_by: string; station_id: string }
) {
  try {
    const ch = supabase.channel(`station-kick:${kickedDeviceId}`);
    await ch.send({
      type: 'broadcast',
      event: 'kick',
      payload: { device_id: kickedDeviceId, ...payload, reason: 'Taken over' },
    });
    supabase.removeChannel(ch);
  } catch {
    // Non-critical
  }
}

async function handleBackgroundResult(
  data: unknown,
  error: any,
  selectedStation: SelectedStation,
  selectedStore: SelectedLocation,
  deviceId: string,
  pin: string,
  supabase: ReturnType<typeof useSupabaseClient>
) {
  const store = useEmployeeStore.getState();
  const response = data as PosStaffLoginResponse | null;

  // Network/transport error → queue for later sync, stay logged in
  if (error) {
    store.queueStationLogin({
      pin,
      locationId: selectedStore.id,
      stationId: selectedStation.id,
      deviceId,
    });
    store.commitSignIn();
    return;
  }

  // Logic error (not success, not STATION_IN_USE) → rollback + redirect
  if (!response?.success) {
    if (response?.error_code === 'STATION_IN_USE') {
      store.rollbackSignIn();
      store.setPendingAuthError(STATION_IN_USE_AUTH_ERROR);
      replaceRoute('(auth)', 'pin-login');
      return;
    }
    // INVALID_PIN, STATION_NOT_FOUND, or unknown
    store.rollbackSignIn();
    store.setPendingAuthError(response?.error || 'Your PIN was not recognized. Please try again.');
    replaceRoute('(auth)', 'pin-login');
    return;
  }

  // Success
  store.commitSignIn(response.session?.session_id);

  // Fire kick broadcast (non-critical, fire-and-forget)
  if (response.session?.kicked_previous && response.session?.kicked_device_id) {
    sendKickBroadcast(supabase, response.session.kicked_device_id, {
      session_id: response.session.session_id,
      kicked_by: response.staff?.display_name ?? 'Unknown',
      station_id: selectedStation.id,
    });
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePinSignIn() {
  const supabase = useSupabaseClient();

  const performOptimisticSignIn = useCallback(async (params: {
    pin: string;
    selectedStore: SelectedLocation;
    selectedStation: SelectedStation;
    deviceId: string;
    cachedDeviceInfo: DeviceInfo | null;
    forceTakeover: boolean;
  }): Promise<SignInOutcome> => {
    const { pin, selectedStore, selectedStation, deviceId, cachedDeviceInfo, forceTakeover } = params;
    const store = useEmployeeStore.getState();

    // 1. Try local cache
    const employee = store.findEmployeeByPin(pin);
    if (!employee) return { outcome: 'cache_miss' };

    // 2. Optimistic: set active session immediately
    const existingSession = useTimeclockStore.getState().getSession(employee.id);
    store.beginOptimisticSignIn(employee, !!existingSession);

    // 3. Navigate immediately (before background RPC)
    const isKDS = selectedStation.station_type === 'kds';
    replaceRoute('(main)', isKDS ? 'kds' : 'home');

    // 4. Fire background RPC (fire-and-forget, does NOT block navigation)
    const info = cachedDeviceInfo ?? await getDeviceInfo();
    void (async () => {
      try {
        const { data, error } = await supabase.rpc('pos_staff_login_v2', {
          p_location_id: selectedStore.id,
          p_pin_code: pin,
          p_station_id: selectedStation.id,
          p_device_id: deviceId,
          p_device_name: getDeviceName(),
          p_auto_clock_in: true,
          p_force_takeover: forceTakeover,
          p_ip_address: sanitizeIpAddress(info.ip_address),
          p_app_version: info.app_version,
          p_os_version: info.os_version,
          p_hardware_model: info.hardware_model,
        });
        await handleBackgroundResult(data, error, selectedStation, selectedStore, deviceId, pin, supabase);
      } catch {
        // Unexpected error: queue for sync, stay logged in
        useEmployeeStore.getState().queueStationLogin({
          pin,
          locationId: selectedStore.id,
          stationId: selectedStation.id,
          deviceId,
        });
        useEmployeeStore.getState().commitSignIn();
      }
    })();

    return { outcome: 'navigating' };
  }, [supabase]);

  return { performOptimisticSignIn };
}
