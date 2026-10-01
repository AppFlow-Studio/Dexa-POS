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
 * Cached first: the device already holds the location's staff PINs (the same
 * plain-PIN match offline login uses, `findEmployeeByPin`), so the common case
 * verifies with no round-trip and the gate closes the moment the 4th digit
 * lands. Only a PIN with no cached match goes to the `verify_staff_pin` RPC
 * (owned by the backend; may not exist yet) — a PIN added or changed since the
 * last employee sync — and only when online. Like offline login, a PIN changed
 * on the server keeps matching here until the next employee sync.
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

      const employee = useEmployeeStore.getState().findEmployeeByPin(pin);
      if (employee?.profileId) {
        return {
          staffProfileId: employee.profileId,
          name: employee.displayName || employee.fullName,
          role: employee.role ?? null,
        };
      }

      if (!isOnline) return null;

      try {
        // `verify_staff_pin` is not in generated types yet — cast to call it.
        const { data, error } = await (supabase.rpc as any)(
          "verify_staff_pin",
          { p_location_id: locationId, p_pin_code: pin },
        );

        // RPC missing (not-yet-deployed) or transport error: the cache already
        // had no match, so there is nothing else to check.
        if (error) return null;

        const row = Array.isArray(data) ? data[0] : data;
        if (!row?.staff_profile_id) return null; // wrong PIN — server rejected

        return {
          staffProfileId: row.staff_profile_id,
          name: row.name ?? "",
          role: row.role ?? null,
        };
      } catch {
        return null;
      }
    },
    [supabase],
  );

  return { verifyPin };
}
