import { MerchantRole } from "@/lib/types";
import { EmployeeProfile, useEmployeeStore } from "@/stores/useEmployeeStore";
import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fetches active location_members (staff + PINs) for a location and replaces
 * useEmployeeStore's employee list. Shared by PosSyncProvider (initial/store-change
 * sync) and manual "Sync POS" (Settings > Syncing) so PIN changes made on the
 * backend are picked up without requiring a store re-selection.
 */
export async function syncEmployees(
  supabase: SupabaseClient,
  locationId: string,
): Promise<void> {
  const { setEmployees, setSyncState } = useEmployeeStore.getState();
  setSyncState({ isLoading: true, error: null });
  try {
    const { data, error } = await supabase
      .from("location_members")
      .select(
        `
      id,
      pin_code,
      pin_plain,
      role_code,
      staff_profile_id,
      staff_profiles (
        id,
        first_name,
        last_name,
        display_name,
        avatar_url,
        email,
        phone
      )
    `,
      )
      .eq("location_id", locationId)
      .eq("is_active", true);

    if (error) throw error;

    const mappedEmployees: EmployeeProfile[] = (data || []).map((row: any) => {
      const profile = row.staff_profiles;
      const fullName = `${profile?.first_name || ""} ${
        profile?.last_name || ""
      }`.trim();

      return {
        id: row.id, // location_member id
        profileId: profile?.id || "",
        fullName: fullName || "Unknown Staff",
        displayName: profile?.display_name || fullName || "Unknown",
        role: row.role_code as MerchantRole,
        profilePictureUrl: profile?.avatar_url || undefined,
        pin: row.pin_plain ?? null,
        email: profile?.email,
        phone: profile?.phone,
        shiftStatus: "clocked_out" as const,
      };
    });

    const previousById = new Map(
      useEmployeeStore.getState().employees.map((e) => [e.id, e] as const),
    );
    const pinChanges = mappedEmployees.filter((e) => {
      const prev = previousById.get(e.id);
      return prev !== undefined && prev.pin !== e.pin;
    });

    setEmployees(mappedEmployees);
    setSyncState({ isLoading: false, error: null });

    if (pinChanges.length > 0) {
      console.log(
        `[employeeSyncService] PIN change detected for ${pinChanges.length} employee(s):`,
        pinChanges.map((e) => e.displayName),
      );
    } else {
      console.log(
        `[employeeSyncService] Synced ${mappedEmployees.length} employee(s) for location ${locationId}, no PIN changes.`,
      );
    }
  } catch (err: any) {
    console.error("Employee sync failed:", err);
    setSyncState({
      isLoading: false,
      error: err?.message || "Sync failed",
    });
    throw err;
  }
}
