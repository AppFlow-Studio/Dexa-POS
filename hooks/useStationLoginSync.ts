import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getPinAuthFailure } from "@/lib/authFlow";
import { getDeviceName } from "@/lib/deviceName";
import { getPosAccessFailure } from "@/lib/posAccessControl";
import { replaceRoute } from "@/lib/rootNavigation";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { PosStaffLoginResponse } from "@/types/station";
import NetInfo from "@react-native-community/netinfo";
import { useEffect } from "react";

/**
 * Background queue processor for station login RPCs that failed due to network errors.
 * Retries every 15 seconds when online. Mirrors the pattern from useTimeclock.ts.
 */
export function useStationLoginSync() {
  const supabase = useSupabaseClient();
  const isKDS = useStoreSettingsStore(
    (s) => s.selectedStation?.station_type === 'kds'
  );
  useEffect(() => {
    if (isKDS) return;

    const processQueue = async () => {
      // Always read fresh state to avoid stale closures (interval is stable)
      const { pendingStationLogins, isStationLoginSyncing } =
        useEmployeeStore.getState();

      if (pendingStationLogins.length === 0 || isStationLoginSyncing) return;

      const net = await NetInfo.fetch();
      if (!net.isConnected || !net.isInternetReachable) return;

      useEmployeeStore.getState().setStationLoginSyncing(true);
      const action = pendingStationLogins[0];

      try {
        const { data, error } = await supabase.rpc('pos_staff_login_v2', {
          p_location_id: action.locationId,
          p_pin_code: action.pin,
          p_station_id: action.stationId,
          p_device_id: action.deviceId,
          p_device_name: getDeviceName(),
          p_auto_clock_in: true,
          p_force_takeover: false,
          p_ip_address: null,
          p_app_version: null,
          p_os_version: null,
          p_hardware_model: null,
        });

        const response = data as PosStaffLoginResponse | null;
        const accessFailure = getPosAccessFailure({
          error: response?.error,
          errorCode: response?.error_code,
        });

        if (!error && response && !response.success && accessFailure) {
          const authFailure = getPinAuthFailure({
            error: response.error,
            errorCode: response.error_code,
          });
          const employeeStore = useEmployeeStore.getState();
          employeeStore.removeStationLoginFromQueue(action.id);
          employeeStore.rollbackSignIn();
          employeeStore.signOut();
          employeeStore.setPendingAuthError(authFailure.message);
          useStoreSettingsStore.getState().clearSelectedStation();
          replaceRoute("(auth)", "station-select");
          return;
        }

        // Success OR logic error (INVALID_PIN etc.): remove from queue
        if (!error || response?.error_code) {
          useEmployeeStore.getState().removeStationLoginFromQueue(action.id);
          if (response?.session?.session_id) {
            useStoreSettingsStore
              .getState()
              .setStationSessionId(response.session.session_id);
          }
        }
        // Network error: keep in queue for retry
      } catch {
        // Keep in queue
      } finally {
        useEmployeeStore.getState().setStationLoginSyncing(false);
      }
    };

    // Stable interval — processQueue reads fresh store state internally
    processQueue();
    const interval = setInterval(processQueue, 15_000);
    return () => clearInterval(interval);
  }, [supabase, isKDS]);
}
