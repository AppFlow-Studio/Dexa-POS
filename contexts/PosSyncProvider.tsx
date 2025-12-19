import { usePosSync } from "@/hooks/pos/usePosSync";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { MerchantRole } from "@/lib/types";
import { FloorPlanService } from "@/services/floorPlanService";
import {
  initializeOfflineSync,
  setOfflineSyncSupabaseClient,
} from "@/services/offlineSyncInit";
import { EmployeeProfile, useEmployeeStore } from "@/stores/useEmployeeStore";
import {
  setFloorPlanSupabaseClient,
  useFloorPlanStore,
} from "@/stores/useFloorPlanStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { setOrderStoreSupabaseClient } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import React, { useCallback, useEffect, useRef } from "react";

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
  const offlineSyncInitialized = useRef(false);

  // Register Supabase client with order store, floor plan store, and offline sync
  useEffect(() => {
    if (supabase) {
      setOrderStoreSupabaseClient(supabase);
      setFloorPlanSupabaseClient(supabase);
      setOfflineSyncSupabaseClient(supabase);

      // Initialize offline sync service (only once)
      if (!offlineSyncInitialized.current) {
        offlineSyncInitialized.current = true;
        initializeOfflineSync().then(() => {
          console.log("Offline sync service initialized");
        });
      }

      console.log(
        "Supabase client registered with order, floor plan, and offline sync"
      );
    }
    return () => {
      setOrderStoreSupabaseClient(null);
      setFloorPlanSupabaseClient(null);
    };
  }, [supabase]);

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
        // if (DEBUG_EMPLOYEES_URL && data) {
        //   fetch(DEBUG_EMPLOYEES_URL, {
        //     method: "POST",
        //     headers: { "Content-Type": "application/json" },
        //     body: JSON.stringify({ employees: data, locationId }),
        //   })
        //     .then((res) => res.json())
        //     .then((result) => {
        //       if (result.success) {
        //         console.log(
        //           "✅ Employee data sent to debug server:",
        //           result.path
        //         );
        //       }
        //     })
        //     .catch((err) => {
        //       console.log("Debug server not running (optional):", err.message);
        //     });
        // }
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

  // Sync floor plans from backend
  const syncFloorPlans = useCallback(
    async (locationId: string) => {
      try {
        // Load floor plans for location
        const { data: floorPlans, error: fpError } =
          await FloorPlanService.getLocationFloorPlans(supabase, locationId);

        if (fpError) throw fpError;

        // Find default or first floor plan
        const defaultPlan =
          floorPlans?.find((fp) => fp.is_default) || floorPlans?.[0];

        // Set floor plans in store
        useFloorPlanStore.setState({ locationId });
        useFloorPlanStore.getState().setFloorPlans(floorPlans || []);
        useFloorPlanStore
          .getState()
          .setActiveFloorPlanId(defaultPlan?.id || null);

        // Debug server logging
        const DEBUG_FLOOR_PLANS_URL = __DEV__
          ? "http://192.168.29.134:3456/debug/sync-data"
          : null;

        if (DEBUG_FLOOR_PLANS_URL && floorPlans) {
          fetch(DEBUG_FLOOR_PLANS_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ floorPlans: floorPlans, locationId }),
          })
            .then((res) => res.json())
            .then((result) => {
              if (result.success) {
                console.log(
                  "✅ Floor plan data sent to debug server:",
                  result.path
                );
              }
            })
            .catch((err) => {
              console.log("Debug server not running (optional):", err.message);
            });
        }

        // Load status if we have a floor plan
        if (defaultPlan?.id) {
          await useFloorPlanStore.getState().setActiveFloorPlan(defaultPlan.id);
        }

        // Load waitlist and reservations
        await Promise.all([
          useFloorPlanStore.getState().loadWaitlist(),
          useFloorPlanStore.getState().loadReservations(),
        ]);

        // Setup realtime subscriptions
        useFloorPlanStore.getState().setupRealtimeSubscriptions(locationId);

        console.log("Floor plans synced successfully");
      } catch (error: any) {
        console.error("Floor plan sync failed:", error);
      }
    },
    [supabase]
  );

  // Sync employees and floor plans when store is selected (parallel)
  useEffect(() => {
    if (selectedStore?.id) {
      syncEmployees(selectedStore.id);
      syncFloorPlans(selectedStore.id);
    }
  }, [selectedStore?.id, syncEmployees, syncFloorPlans]);
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

  // Floor plan sync is now handled in the combined useEffect above

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
