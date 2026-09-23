import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getPinAuthFailure, resolvePostLoginRoute } from "@/lib/authFlow";
import { getDeviceName } from "@/lib/deviceName";
import { replaceRoute } from "@/lib/rootNavigation";
import {
    STATION_IN_USE_AUTH_ERROR,
    useEmployeeStore,
} from "@/stores/useEmployeeStore";
import {
    SelectedLocation,
    useStoreSettingsStore,
} from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { PosStaffLoginResponse, SelectedStation } from "@/types/station";
import * as Application from "expo-application";
import * as Device from "expo-device";
import * as Network from "expo-network";
import { useCallback } from "react";
import { sanitizeIpAddress } from "@/lib/network/ipAddress";

// ── Shared utilities (also used by pin-login.tsx) ───────────────────────────

// Re-exported so existing `@/hooks/usePinSignIn` importers keep working; the
// hardened implementation lives in lib/ so services (heartbeat, device
// detection) can share it without importing this hook module.
export { sanitizeIpAddress };

export const getDeviceInfo = async () => {
  const ip = await Network.getIpAddressAsync().catch(() => null);
  return {
    // Sanitize at the source: Android reports "0.0.0.0" before Wi-Fi settles.
    // Storing that clobbers the station's real IP, so drop it to null here and
    // every downstream login RPC COALESCEs to the last-known-good value.
    ip_address: sanitizeIpAddress(ip),
    app_version: Application.nativeApplicationVersion,
    os_version: `${Device.osName} ${Device.osVersion}`,
    hardware_model: Device.modelName,
  };
};

export type DeviceInfo = Awaited<ReturnType<typeof getDeviceInfo>>;

export type SignInOutcome =
  | { outcome: "navigating" }
  | { outcome: "cache_miss" }
  | { outcome: "server_validation_required" }
  | { outcome: "blocked"; title: string; message: string };

// ── Internal helpers ─────────────────────────────────────────────────────────

export async function sendKickBroadcast(
  supabase: ReturnType<typeof useSupabaseClient>,
  kickedDeviceId: string,
  payload: {
    session_id: string;
    kicked_by: string;
    station_id: string;
    source_device_id?: string;
    target_session_id?: string | null;
  },
) {
  try {
    if (payload.source_device_id && kickedDeviceId === payload.source_device_id) {
      if (__DEV__) {
        console.log("[PinSignIn] Skipping self kick broadcast", {
          kickedDeviceId,
          sourceDeviceId: payload.source_device_id,
          targetSessionId: payload.target_session_id,
        });
      }
      return;
    }

    const ch = supabase.channel(`station-kick:${kickedDeviceId}`);
    await ch.send({
      type: "broadcast",
      event: "kick",
      payload: { device_id: kickedDeviceId, ...payload, reason: "Taken over" },
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
  supabase: ReturnType<typeof useSupabaseClient>,
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
    if (response?.error_code === "STATION_IN_USE") {
      store.rollbackSignIn();
      store.setPendingAuthError(STATION_IN_USE_AUTH_ERROR);
      replaceRoute("(auth)", "pin-login");
      return;
    }
    const authFailure = getPinAuthFailure({
      error: response?.error,
      errorCode: response?.error_code,
    });
    store.rollbackSignIn();
    store.setPendingAuthError(authFailure.message);
    replaceRoute("(auth)", "pin-login");
    return;
  }

  // Success
  store.commitSignIn(response.session?.session_id);

  // Fire kick broadcast (non-critical, fire-and-forget)
  if (response.session?.kicked_previous && response.session?.kicked_device_id) {
    sendKickBroadcast(supabase, response.session.kicked_device_id, {
      session_id: response.session.session_id,
      kicked_by: response.staff?.display_name ?? "Unknown",
      station_id: selectedStation.id,
      source_device_id: deviceId,
      target_session_id: response.session.kicked_session_id,
    });
  }
}

// ── Hook ─────────────────────────────────────────────────────────────────────

export function usePinSignIn() {
  const supabase = useSupabaseClient();

  const performOptimisticSignIn = useCallback(
    async (params: {
      pin: string;
      selectedStore: SelectedLocation;
      selectedStation: SelectedStation;
      deviceId: string;
      cachedDeviceInfo: DeviceInfo | null;
      forceTakeover: boolean;
      isOnline: boolean;
    }): Promise<SignInOutcome> => {
      const {
        pin,
        selectedStore,
        selectedStation,
        deviceId,
        cachedDeviceInfo,
        forceTakeover,
        isOnline,
      } = params;
      const store = useEmployeeStore.getState();

      // 1. Try local cache
      const employee = store.findEmployeeByPin(pin);
      if (!employee) return { outcome: "cache_miss" };

      // Online logins must be server-validated first (lockout/rate-limit checks).
      // This prevents temporary entry followed by rollback when backend rejects.
      if (isOnline) {
        return { outcome: "server_validation_required" };
      }

      const billingAccess = useStoreSettingsStore.getState().billingAccess;
      if (billingAccess && !billingAccess.allowed && billingAccess.failure) {
        return {
          outcome: "blocked",
          title: billingAccess.failure.title,
          message: billingAccess.failure.message,
        };
      }

      // 2. Offline-only optimistic sign-in
      const existingSession = useTimeclockStore
        .getState()
        .getSession(employee.id);
      store.beginOptimisticSignIn(employee, !!existingSession);

      // 3. Navigate immediately (before background RPC)
      replaceRoute(
        "(main)",
        resolvePostLoginRoute(selectedStation.station_type),
      );

      // 4. Fire background RPC (fire-and-forget, does NOT block navigation)
      const info = cachedDeviceInfo ?? (await getDeviceInfo());
      void (async () => {
        try {
          const { data, error } = await supabase.rpc("pos_staff_login_v2", {
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
          await handleBackgroundResult(
            data,
            error,
            selectedStation,
            selectedStore,
            deviceId,
            pin,
            supabase,
          );
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

      return { outcome: "navigating" };
    },
    [supabase],
  );

  return { performOptimisticSignIn };
}
