import { useInventorySync } from "@/hooks/pos/useInventorySync";
import { usePosSync } from "@/hooks/pos/usePosSync";
import { useStandaloneSync } from "@/hooks/pos/useStandaloneSync";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { MerchantRole } from "@/lib/types";
import { FloorPlanService } from "@/services/floorPlanService";
import {
  initializeOfflineSync,
  setOfflineSyncSupabaseClient,
} from "@/services/offlineSyncInit";
import { setCoursingSupabaseClient } from "@/stores/useCoursingStore";
import { EmployeeProfile, useEmployeeStore } from "@/stores/useEmployeeStore";
import {
  setFloorPlanSupabaseClient,
  useFloorPlanStore,
} from "@/stores/useFloorPlanStore";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useMenuStore } from "@/stores/useMenuStore";
import {
  setOrderStoreSupabaseClient,
  useOrderStore,
} from "@/stores/useOrderStore";
import { setPreviousOrdersSupabaseClient } from "@/stores/usePreviousOrdersStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { setWaitlistSupabaseClient } from "@/stores/useWaitlistStore";
import { TaxRate } from "@/types/menu";
import React, { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus } from "react-native";

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

  // Register Supabase client with order store, floor plan store, coursing store, and offline sync
  useEffect(() => {
    if (supabase) {
      setOrderStoreSupabaseClient(supabase);
      setFloorPlanSupabaseClient(supabase);
      setCoursingSupabaseClient(supabase);
      setOfflineSyncSupabaseClient(supabase);
      setWaitlistSupabaseClient(supabase);
      setPreviousOrdersSupabaseClient(supabase);

      // Initialize offline sync service (only once)
      if (!offlineSyncInitialized.current) {
        offlineSyncInitialized.current = true;
        initializeOfflineSync().then(() => {
          console.log("Offline sync service initialized");
        });
      }

      console.log(
        "Supabase client registered with order, floor plan, coursing, waitlist, and offline sync",
      );
    }
    // return () => {
    //   setOrderStoreSupabaseClient(null);
    //   setFloorPlanSupabaseClient(null);
    //   setCoursingSupabaseClient(null);
    // };
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
        `,
          )
          .eq("location_id", locationId)
          .eq("is_active", true);

        if (error) throw error;

        // console.log("Employee Sync Data received!");
        // console.log("Employees count:", data?.length || 0);
        // console.log("Employees data:", data);

        // Map Supabase data to EmployeeProfile format
        const mappedEmployees: EmployeeProfile[] = (data || []).map(
          (row: any) => {
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
              pinHash: row.pin_code, // bcrypt hash from DB
              email: profile?.email,
              phone: profile?.phone,
              shiftStatus: "clocked_out" as const,
            };
          },
        );

        // Update employee store with mapped data
        setEmployees(mappedEmployees);
        setEmployeeSyncState({ isLoading: false, error: null });
      } catch (err: any) {
        console.error("Employee sync failed:", err);
        setEmployeeSyncState({
          isLoading: false,
          error: err?.message || "Sync failed",
        });
      }
    },
    [supabase, setEmployees, setEmployeeSyncState],
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

        // Load status if we have a floor plan
        if (defaultPlan?.id) {
          await useFloorPlanStore.getState().setActiveFloorPlan(defaultPlan.id);
        }

        // Load waitlist and reservations
        await Promise.all([
          useFloorPlanStore.getState().loadWaitlist(),
          useFloorPlanStore.getState().loadReservations(),
        ]);
      } catch (error: any) {
        console.error("Floor plan sync failed:", error);
      }
    },
    [supabase],
  );

  // Sync tax rates from tax_rates table
  const syncTaxRates = useCallback(
    async (locationId: string) => {
      try {
        const { data, error } = await supabase
          .from("tax_rates")
          .select(
            "id, location_id, name, percentage, tax_category, is_active, created_at, updated_at",
          )
          .eq("location_id", locationId)
          .eq("is_active", true);

        if (error) {
          console.error("Tax rates sync failed:", error);
          return;
        }

        const taxRates = (data || []) as TaxRate[];
        useStoreSettingsStore.getState().setTaxRates(taxRates);
        // console.log("Tax rates synced:", taxRates.length);
      } catch (err: any) {
        console.error("Tax rates sync error:", err);
      }
    },
    [supabase],
  );

  // Sync employees and floor plans when store is selected (parallel)
  useEffect(() => {
    if (selectedStore?.id) {
      syncEmployees(selectedStore.id);
      syncFloorPlans(selectedStore.id);
      syncTaxRates(selectedStore.id);
    }
  }, [selectedStore?.id, syncEmployees, syncFloorPlans, syncTaxRates]);
  const setMenuData = useMenuStore((state) => state.setMenuData);
  const setSyncState = useMenuStore((state) => state.setSyncState);

  // Fetch menu data from API when store is selected
  const {
    data: posSyncData,
    isLoading: isSyncing,
    isError: isSyncError,
    error: syncError,
  } = usePosSync(selectedStore?.id ?? null);

  // Fetch standalone entities (categories, items, modifiers not in menus)
  const { data: standaloneData } = useStandaloneSync(
    selectedStore?.merchant_id ?? null,
    selectedStore?.id ?? null,
  );

  // Keep a ref to standalone data so the posSyncData effect can re-merge
  // without adding standaloneData as a dependency (which would cause extra runs)
  const standaloneDataRef = useRef(standaloneData);
  standaloneDataRef.current = standaloneData;

  // --- INVENTORY SYNC ---
  const { data: inventoryData } = useInventorySync(selectedStore?.id ?? null);
  const setInventoryData = useInventoryStore((state) => state.setInventoryData);
  const setInventorySupabase = useInventoryStore(
    (state) => state.setSupabaseClient,
  );

  useEffect(() => {
    if (supabase) {
      setInventorySupabase(supabase);
    }
  }, [supabase]);

  // Helper to merge recipes into menu store
  const applyRecipes = (data: typeof inventoryData) => {
    if (!data) return;
    if (data.menuRecipes?.length || data.modifierRecipes?.length) {
      useMenuStore.getState().mergeRecipeData({
        menuRecipes: data.menuRecipes.map((r) => ({
          menu_item_id: r.menu_item_id,
          inventory_item_id: r.inventory_item_id,
          quantity: r.quantity_used,
        })),
        modifierRecipes: data.modifierRecipes.map((r) => ({
          modifier_group_item_id: r.modifier_group_item_id,
          inventory_item_id: r.inventory_item_id,
          quantity: r.quantity_used,
        })),
      });
    }
  };

  useEffect(() => {
    if (inventoryData) {
      setInventoryData({
        items: inventoryData.inventoryItems,
        vendors: inventoryData.vendors,
      });

      // Merge Recipe Data into MenuStore
      applyRecipes(inventoryData);

      console.log(
        "✅ Inventory & Recipe data synced:",
        inventoryData.inventoryItems.length,
        "items,",
        inventoryData.menuRecipes?.length || 0,
        "menu recipes",
      );
    }
  }, [inventoryData]);
  // --- END INVENTORY SYNC ---

  // Update menu store when sync data changes
  useEffect(() => {
    if (posSyncData) {
      setMenuData(posSyncData);

      // Re-merge standalone data so orphan items/categories aren't lost
      // after setMenuData replaces the store with tree-only data
      if (standaloneDataRef.current) {
        useMenuStore.getState().mergeStandaloneData(standaloneDataRef.current);
      }

      // Re-apply recipes if available (since setMenuData might reset them)
      applyRecipes(inventoryData);

      // Send menu data to debug server in development
      const DEBUG_MENU_URL = __DEV__
        ? "http://192.168.29.134:3456/debug/sync-data"
        : null;

      if (DEBUG_MENU_URL) {
        fetch(DEBUG_MENU_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            menuData: posSyncData,
            locationId: selectedStore?.id,
          }),
        })
          .then((res) => res.json())
          .then((result) => {
            if (result.success) {
              console.log("✅ Menu data sent to debug server:", result.path);
            }
          })
          .catch((err) => {
            console.log("Debug server not running (optional):", err.message);
          });
      }
    }
  }, [posSyncData, setMenuData, selectedStore?.id, inventoryData]);

  // Merge standalone data (categories, items, modifiers, menus including inactive)
  useEffect(() => {
    if (standaloneData) {
      const menuStore = useMenuStore.getState();
      menuStore.mergeStandaloneData(standaloneData);

      // Re-apply recipes if available (since mergeStandaloneData might overwrite items)
      applyRecipes(inventoryData);

      console.log("✅ Standalone data merged:", {
        categories: standaloneData.categories?.length || 0,
        items: standaloneData.items?.length || 0,
        modifierGroups: standaloneData.modifierGroups?.length || 0,
        menus: standaloneData.menus?.length || 0,
      });
    }
  }, [standaloneData, inventoryData]);

  // Floor plan sync is now handled in the combined useEffect above

  // Update sync state in store
  // useEffect(() => {
  //   setSyncState({
  //     isLoading: isSyncing,
  //     isError: isSyncError,
  //     error: syncError instanceof Error ? syncError : null,
  //   });
  // }, [isSyncing, isSyncError, syncError, setSyncState]);

  // Setup and cleanup realtime subscriptions for floor plans and orders
  // Use a ref to track if we've already subscribed to prevent duplicate setups
  const realtimeLocationRef = useRef<string | null>(null);

  useEffect(() => {
    const locationId = selectedStore?.id;

    if (!locationId) {
      return;
    }

    // Skip if already subscribed to this location
    if (realtimeLocationRef.current === locationId) {
      return;
    }

    // Cleanup previous subscriptions if switching locations
    // if (realtimeLocationRef.current && realtimeLocationRef.current !== locationId) {
    //   useFloorPlanStore.getState().cleanup();
    //   // REMOVED: Cleanup for duplicate order subscription (now handled by useOrdersRealtime hook)
    //   // useOrderStore.getState().cleanupOrderRealtime();
    // }

    realtimeLocationRef.current = locationId;

    // Setup realtime subscriptions for tables/sessions
    // useFloorPlanStore.getState().setupRealtimeSubscriptions(locationId);

    // REMOVED: Duplicate order realtime subscription (now handled by LocationRealtimeProvider with useOrdersRealtime hook)
    // useOrderStore.getState().setupOrderRealtimeSubscriptions(locationId);

    // console.log('[PosSyncProvider] Realtime subscriptions enabled for location:', locationId);

    // Cleanup function
    // return () => {
    //   useFloorPlanStore.getState().cleanup();
    //   // REMOVED: Cleanup for duplicate order subscription
    //   // useOrderStore.getState().cleanupOrderRealtime();
    //   realtimeLocationRef.current = null;
    // };
  }, [selectedStore?.id]);

  useEffect(() => {
    if (selectedStore?.id) {
      // Clear potentially stale floor plan data before fresh sync
      useFloorPlanStore.setState({
        tables: [],
        lastSyncAt: null,
      });

      syncEmployees(selectedStore.id);
      syncFloorPlans(selectedStore.id);
      syncTaxRates(selectedStore.id);

      // Phase 11.1: Initialize orders in background (non-blocking)
      // This populates ordersById with active orders for the location
      useOrderStore.getState().initializeOrders(selectedStore.id, true);
    }
  }, [selectedStore?.id, syncEmployees, syncFloorPlans, syncTaxRates]);

  // App state listener - reconnect realtime and refresh stale data when app becomes active
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        console.log("[PosSyncProvider] App became active - refreshing data");
        const floorPlanStore = useFloorPlanStore.getState();
        const storeSettings = useStoreSettingsStore.getState();

        // Reconnect realtime if disconnected or reconnecting
        if (floorPlanStore.realtimeStatus !== "connected") {
          floorPlanStore.manualReconnect();
        }

        // Refresh stale floor plan data
        floorPlanStore.loadFloorPlanStatusIfStale();

        // Phase 11.2: Refresh orders when app resumes from background
        // This ensures orders are up-to-date after tablet sleep/wake
        if (storeSettings.selectedStore?.id) {
          useOrderStore
            .getState()
            .initializeOrders(storeSettings.selectedStore.id, true);
        }
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, []);

  return <>{children}</>;
}
