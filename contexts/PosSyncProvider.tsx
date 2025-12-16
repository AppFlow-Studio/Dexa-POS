import { usePosSync } from "@/hooks/pos/usePosSync";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { MerchantRole } from "@/lib/types";
import { EmployeeProfile, useEmployeeStore } from "@/stores/useEmployeeStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import React, { useCallback, useEffect } from "react";

// Debug server URL - use your machine's local IP (run: ipconfig getifaddr en0)
// Change this IP to match your machine's IP address
const DEBUG_EMPLOYEES_URL = __DEV__
  ? "http://192.168.29.134:3456/debug/sync-data"
  : null;

/**
 * Component that handles POS sync logic.
 * Must be rendered inside ClerkProvider since it uses authenticated Supabase calls.
 */
export function PosSyncProvider({ children }: { children: React.ReactNode }) {
  // POS Sync Integration - Centralized sync for the entire app
  const selectedStore = useStoreSettingsStore((state) => state.selectedStore);
  const supabase = useSupabaseClient();
  const setEmployees = useEmployeeStore((state) => state.setEmployees);
  const setEmployeeSyncState = useEmployeeStore((state) => state.setSyncState);

  // Sync employees from location_members
  const syncEmployees = useCallback(
    async (locationId: string) => {
      setEmployeeSyncState({ isLoading: true, error: null });
      try {
        const { data, error } = await supabase
          .from("location_members")
          .select(
            `
          id,
          pin_code,
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
        `
          )
          .eq("location_id", locationId)
          .eq("is_active", true);

        if (error) throw error;

        console.log("Employee Sync Data received!");
        console.log("Employees count:", data?.length || 0);

        // Map Supabase data to EmployeeProfile format
        const mappedEmployees: EmployeeProfile[] = (data || []).map(
          (row: any) => {
            const profile = row.staff_profiles;
            const fullName =
              `${profile?.first_name || ""} ${profile?.last_name || ""}`.trim();

            return {
              id: row.id, // location_member id
              profileId: profile?.id || "",
              fullName: fullName || "Unknown Staff",
              displayName: profile?.display_name || fullName || "Unknown",
              role: row.role_code as MerchantRole,
              profilePictureUrl: profile?.avatar_url || undefined,
              pinHash: row.pin_code, // bcrypt hash from DB
              email: profile?.email,
              phone: profile?.phone,
              shiftStatus: "clocked_out" as const,
            };
          }
        );

        // Update employee store with mapped data
        setEmployees(mappedEmployees);
        setEmployeeSyncState({ isLoading: false, error: null });

        // Send to debug server in development
        if (DEBUG_EMPLOYEES_URL && data) {
          fetch(DEBUG_EMPLOYEES_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ employees: data, locationId }),
          })
            .then((res) => res.json())
            .then((result) => {
              if (result.success) {
                console.log(
                  "✅ Employee data sent to debug server:",
                  result.path
                );
              }
            })
            .catch((err) => {
              console.log("Debug server not running (optional):", err.message);
            });
        }
      } catch (err: any) {
        console.error("Employee sync failed:", err);
        setEmployeeSyncState({
          isLoading: false,
          error: err?.message || "Sync failed",
        });
      }
    },
    [supabase, setEmployees, setEmployeeSyncState]
  );

  // Sync employees when store is selected
  useEffect(() => {
    if (selectedStore?.id) {
      syncEmployees(selectedStore.id);
    }
  }, [selectedStore?.id, syncEmployees]);
  const setMenuData = useMenuStore((state) => state.setMenuData);
  const setSyncState = useMenuStore((state) => state.setSyncState);

  // Fetch menu data from API when store is selected
  const {
    data: posSyncData,
    isLoading: isSyncing,
    isError: isSyncError,
    error: syncError,
  } = usePosSync(selectedStore?.id ?? null);

  // Update menu store when sync data changes
  useEffect(() => {
    if (posSyncData) {
      setMenuData(posSyncData);
    }
  }, [posSyncData, setMenuData]);

  // Update sync state in store
  useEffect(() => {
    setSyncState({
      isLoading: isSyncing,
      isError: isSyncError,
      error: syncError instanceof Error ? syncError : null,
    });
  }, [isSyncing, isSyncError, syncError, setSyncState]);

  return <>{children}</>;
}
