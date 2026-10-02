import {
  getDeviceInfo,
  sanitizeIpAddress,
  sendKickBroadcast,
} from "@/hooks/usePinSignIn";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getDeviceId } from "@/lib/deviceId";
import { getDeviceName } from "@/lib/deviceName";
import { isMissingFunctionError } from "@/lib/network/rpcVersionFallback";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  PosStationLoginResponse,
  StationCurrentSession,
} from "@/types/station";
import { useCallback } from "react";

export type StationStartResult =
  | { outcome: "started" }
  /** Another device holds the station; starting it here takes it over. */
  | { outcome: "in_use"; currentSession: StationCurrentSession | null }
  /** This backend can't start the station without a PIN: use pin-login. */
  | { outcome: "needs_pin" }
  | { outcome: "failed"; title: string; message: string };

const CONNECTION_FAILURE: StationStartResult = {
  outcome: "failed",
  title: "Couldn't Start Station",
  message: "Check the connection and try again.",
};

/**
 * Starts a KDS or kiosk station on this device without a staff PIN
 * (`pos_station_login`): claims the station, stores its session, and tells the
 * device it took the station from. The caller navigates on "started".
 */
export function useStationSignIn() {
  const supabase = useSupabaseClient();

  const startStation = useCallback(
    async (params: {
      locationId: string;
      stationId: string;
      forceTakeover: boolean;
    }): Promise<StationStartResult> => {
      const deviceId = getDeviceId();
      const deviceName = getDeviceName();
      const info = await getDeviceInfo();

      let response: PosStationLoginResponse;
      try {
        // Not in the generated types until the migration ships — cast to call it.
        const { data, error } = await (supabase.rpc as any)(
          "pos_station_login",
          {
            p_location_id: params.locationId,
            p_station_id: params.stationId,
            p_device_id: deviceId,
            p_device_name: deviceName,
            p_force_takeover: params.forceTakeover,
            p_ip_address: sanitizeIpAddress(info.ip_address),
            p_app_version: info.app_version,
            p_os_version: info.os_version,
            p_hardware_model: info.hardware_model,
          },
        );
        if (error) {
          // Backend without the migration yet: these stations keep working
          // through the staff PIN sign-in until it ships.
          if (isMissingFunctionError(error)) return { outcome: "needs_pin" };
          return CONNECTION_FAILURE;
        }
        response = data as PosStationLoginResponse;
      } catch {
        return CONNECTION_FAILURE;
      }

      if (!response?.success) {
        switch (response?.error_code) {
          case "STATION_IN_USE":
            return {
              outcome: "in_use",
              currentSession: response.current_session ?? null,
            };
          case "PIN_REQUIRED":
            return { outcome: "needs_pin" };
          case "STATION_NOT_FOUND":
            return {
              outcome: "failed",
              title: "Station Unavailable",
              message:
                "This station was removed or turned off. Refresh the list and pick another.",
            };
          case "ACCESS_DENIED":
            return {
              outcome: "failed",
              title: "No Access",
              message: "This account can't open stations at this location.",
            };
          default:
            return CONNECTION_FAILURE;
        }
      }

      const session = response.session;
      if (!session?.session_id) return CONNECTION_FAILURE;
      useStoreSettingsStore.getState().setStationSessionId(session.session_id);

      if (session.kicked_previous && session.kicked_device_id) {
        void sendKickBroadcast(supabase, session.kicked_device_id, {
          session_id: session.session_id,
          kicked_by: deviceName,
          station_id: params.stationId,
          source_device_id: deviceId,
          target_session_id: session.kicked_session_id,
        });
      }

      return { outcome: "started" };
    },
    [supabase],
  );

  return { startStation };
}
