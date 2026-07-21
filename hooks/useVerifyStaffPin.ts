import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useCallback } from "react";

export interface VerifiedStaff {
  staffProfileId: string;
  name: string;
  role: string | null;
}

/**
 * Lightweight, attribution-only PIN verification for the per-order PIN gate.
 *
 * IMPORTANT: this must NEVER create a station_session, clock anyone in/out, or
 * touch device/shift state. It only validates a PIN and returns staff identity.
 * Do NOT swap this for `pos_staff_login*` — that path is heavy (~700ms) and has
 * session/clock side effects.
 *
 * Online: calls the `verify_staff_pin` RPC (owned by the backend; may not exist
 * yet). Offline OR when the RPC is missing/fails, falls back to the same cached
 * plain-PIN match used by offline login (`findEmployeeByPin`), so per-order
 * attribution works offline and the feature degrades gracefully before the RPC
 * ships.
 */
export function useVerifyStaffPin() {
  const supabase = useSupabaseClient();

  const verifyPin = useCallback(
    async (params: {
      pin: string;
      locationId: string;
      isOnline: boolean;
    }): Promise<VerifiedStaff | null> => {
      const { pin, locationId, isOnline } = params;

      // Offline fallback: cached plain-PIN match (same mechanism as offline login).
      const offlineVerify = (): VerifiedStaff | null => {
        const employee = useEmployeeStore.getState().findEmployeeByPin(pin);
        if (!employee?.profileId) return null;
        return {
          staffProfileId: employee.profileId,
          name: employee.displayName || employee.fullName,
          role: employee.role ?? null,
        };
      };

      if (!isOnline) return offlineVerify();

      try {
        // `verify_staff_pin` is not in generated types yet — cast to call it.
        const { data, error } = await (supabase.rpc as any)(
          "verify_staff_pin",
          { p_location_id: locationId, p_pin_code: pin },
        );

        if (error) {
          // RPC missing (not-yet-deployed) or transport error → offline path.
          return offlineVerify();
        }

        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.staff_profile_id) return null; // wrong PIN — server rejected

        return {
          staffProfileId: row.staff_profile_id,
          name: row.name ?? "",
          role: row.role ?? null,
        };
      } catch {
        return offlineVerify();
      }
    },
    [supabase],
  );

  return { verifyPin };
}
