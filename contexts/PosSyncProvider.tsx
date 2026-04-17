import { useStationLoginSync } from "@/hooks/useStationLoginSync";
import { useInventorySync } from "@/hooks/pos/useInventorySync";
import { usePreviousOrdersBootstrap } from "@/hooks/pos/usePreviousOrdersBootstrap";
import { useOrdersQuery, orderQueryKeys } from "@/hooks/pos/useOrdersQuery";
import { usePosSync } from "@/hooks/pos/usePosSync";
import { useStandaloneSync } from "@/hooks/pos/useStandaloneSync";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { queryClient } from "@/contexts/TanstackProvider";
import { MerchantRole } from "@/lib/types";
import { FloorPlanService } from "@/services/floorPlanService";
import {
  initializeOfflineSync,
  isServiceInitialized,
  setOfflineSyncSupabaseClient,
} from "@/services/offlineSyncInit";
import { setCoursingSupabaseClient } from "@/stores/useCoursingStore";
import { setSeatingSupabaseClient } from "@/stores/useSeatingStore";
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
import { useSettingsStore, SyncableDiningSettings } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { initLocationConfigSync } from "@/services/locationConfigSync";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { setKDSSupabaseClient, useKDSStore } from "@/stores/useKDSStore";
import { setWaitlistSupabaseClient } from "@/stores/useWaitlistStore";
import {
  detectAndStoreCapabilities,
  startHeartbeat,
  stopHeartbeat,
  startTerminalHealthCheck,
  stopTerminalHealthCheck,
  startStarPrinterHealthCheck,
  stopStarPrinterHealthCheck,
} from "@/services/hardware";
import {
  startStarPrinterDiscoveryService,
  stopStarPrinterDiscoveryService,
} from "@/services/printing/discovery/StarPrinterDiscoveryService";
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import { CASTLES_DEFAULT_PORT } from "@/types/castles";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { useReceiptTemplateStore } from "@/stores/useReceiptTemplateStore";
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
  const selectedStation = useStoreSettingsStore(
    (state) => state.selectedStation,
  );
  const isKDS = selectedStation?.station_type === "kds";
  const supabase = useSupabaseClient();
  const setEmployees = useEmployeeStore((state) => state.setEmployees);
  const setEmployeeSyncState = useEmployeeStore((state) => state.setSyncState);
  // Archive layer: TanStack Query fetches orders and hydrates workspace (skip for KDS)
  useOrdersQuery({
    locationId: selectedStore?.id ?? null,
    enabled: !!selectedStore?.id && !isKDS,
  });

  // Register Supabase client with all stores BEFORE bootstrap hooks run,
  // so store methods have the client available when their effects fire.
  useEffect(() => {
    if (supabase) {
      setOrderStoreSupabaseClient(supabase);
      setFloorPlanSupabaseClient(supabase);
      setCoursingSupabaseClient(supabase);
      setSeatingSupabaseClient(supabase);
      setOfflineSyncSupabaseClient(supabase);
      setWaitlistSupabaseClient(supabase);
      setPreviousOrdersSupabaseClient(supabase);
      setKDSSupabaseClient(supabase);
      // Initialize offline sync service (re-inits after Fast Refresh since module-level state resets)
      if (!isServiceInitialized()) {
        initializeOfflineSync()
          .then(() => {
            console.log("Offline sync service initialized");
          })
          .catch((err) => {
            console.error("Failed to initialize offline sync:", err);
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

  usePreviousOrdersBootstrap({
    locationId: selectedStore?.id ?? null,
    enabled: Boolean(supabase && selectedStore?.id && !isKDS),
  });

  // Device detection & heartbeat lifecycle
  useEffect(() => {
    if (supabase && selectedStation?.id && selectedStore?.id) {
      detectAndStoreCapabilities(supabase, selectedStation.id)
        .then(async () => {
          // Fetch printers into local store so PrinterService can route jobs
          await usePrinterStore.getState().fetchPrinters(selectedStore.id);
        })
        .catch((e) =>
          console.warn("[PosSyncProvider] Device detection failed:", e),
        );
      startHeartbeat(supabase, selectedStation.id, selectedStore.id);
    }

    return () => {
      stopHeartbeat();
    };
  }, [supabase, selectedStation?.id, selectedStore?.id]);

  // Terminal health check lifecycle
  useEffect(() => {
    const terminal = selectedStation?.payment_terminal;
    if (supabase && terminal?.id) {
      startTerminalHealthCheck(supabase, terminal.id, terminal);
    }
    return () => {
      stopTerminalHealthCheck();
      // Fire-and-forget graceful disconnect of the Castles singleton when
      // the effect tears down (station switch, unmount). Prevents a stale
      // socket from lingering against the previous terminal's host:port.
      getSharedCastlesService()
        .gracefulDisconnect()
        .catch(() => {});
    };
  }, [supabase, selectedStation?.payment_terminal?.id]);

  // Star printer health check + background discovery lifecycle
  useEffect(() => {
    if (selectedStore?.id && !isKDS) {
      startStarPrinterHealthCheck(selectedStore.id);
      startStarPrinterDiscoveryService();
    }
    return () => {
      stopStarPrinterHealthCheck();
      stopStarPrinterDiscoveryService();
    };
  }, [selectedStore?.id, isKDS]);

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
              pin: row.pin_plain ?? null,
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
  // KDS only needs employees (for PIN verification)
  useEffect(() => {
    if (selectedStore?.id) {
      syncEmployees(selectedStore.id).then(() => {
        // Hydrate active shifts after employees are loaded (needs employee data for mapping)
        if (!isKDS) {
          useTimeclockStore
            .getState()
            .hydrateActiveShifts(supabase, selectedStore.id);
        }
      });
      if (!isKDS) {
        syncFloorPlans(selectedStore.id);
        syncTaxRates(selectedStore.id);
      }
    }
  }, [selectedStore?.id, isKDS, syncEmployees, syncFloorPlans, syncTaxRates]);
  const setMenuData = useMenuStore((state) => state.setMenuData);
  const setSyncState = useMenuStore((state) => state.setSyncState);

  // Fetch menu data from API when store is selected (skip for KDS)
  const {
    data: posSyncData,
    isLoading: isSyncing,
    isError: isSyncError,
    error: syncError,
  } = usePosSync(isKDS ? null : (selectedStore?.id ?? null));

  // Fetch standalone entities (categories, items, modifiers not in menus) (skip for KDS)
  const { data: standaloneData } = useStandaloneSync(
    isKDS ? null : (selectedStore?.merchant_id ?? null),
    isKDS ? null : (selectedStore?.id ?? null),
  );

  // Keep a ref to standalone data so the posSyncData effect can re-merge
  // without adding standaloneData as a dependency (which would cause extra runs)
  const standaloneDataRef = useRef(standaloneData);
  standaloneDataRef.current = standaloneData;

  // --- INVENTORY SYNC --- (skip for KDS)
  const { data: inventoryData } = useInventorySync(isKDS ? null : (selectedStore?.id ?? null));
  const setInventoryData = useInventoryStore((state) => state.setInventoryData);
  const setInventorySupabase = useInventoryStore(
    (state) => state.setSupabaseClient,
  );
  const fetchPurchaseOrders = useInventoryStore(
    (state) => state.fetchPurchaseOrders,
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

  useEffect(() => {
    if (!isKDS && selectedStore?.id) {
      fetchPurchaseOrders(selectedStore.id);
    }
  }, [fetchPurchaseOrders, isKDS, selectedStore?.id]);

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
      // const DEBUG_MENU_URL = __DEV__
      //   ? "http://192.168.29.134:3456/debug/sync-data"
      //   : null;

      // if (DEBUG_MENU_URL) {
      //   fetch(DEBUG_MENU_URL, {
      //     method: "POST",
      //     headers: { "Content-Type": "application/json" },
      //     body: JSON.stringify({
      //       menuData: posSyncData,
      //       locationId: selectedStore?.id,
      //     }),
      //   })
      //     .then((res) => res.json())
      //     .then((result) => {
      //       if (result.success) {
      //         console.log("✅ Menu data sent to debug server:", result.path);
      //       }
      //     })
      //     .catch((err) => {
      //       console.log("Debug server not running (optional):", err.message);
      //     });
      // }
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
    if (selectedStore?.id && !isKDS) {
      // Clear potentially stale floor plan data before fresh sync
      useFloorPlanStore.setState({
        tables: [],
        lastSyncAt: null,
      });

      syncFloorPlans(selectedStore.id);
      syncTaxRates(selectedStore.id);
      useReceiptTemplateStore.getState().fetchTemplates(selectedStore.id);
    }
  }, [selectedStore?.id, isKDS, syncFloorPlans, syncTaxRates]);

  // App state listener - reconnect realtime and refresh stale data when app becomes active
  // KDS screen handles its own 120s polling fallback, so skip POS reconnect logic
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        console.log("[PosSyncProvider] App became active - refreshing data");

        // Refresh location settings for ALL devices (fallback for missed broadcasts)
        const storeSettings = useStoreSettingsStore.getState();
        storeSettings.refreshSelectedStore(supabase);

        if (!isKDS) {
          const floorPlanStore = useFloorPlanStore.getState();

          // Reconnect realtime if disconnected or reconnecting
          if (floorPlanStore.realtimeStatus !== "connected") {
            floorPlanStore.manualReconnect();
          }

          // Refresh stale floor plan data
          floorPlanStore.loadFloorPlanStatusIfStale();

          // Refresh orders when app resumes — only if data is older than staleTime.
          // useOrderSyncRecovery handles reconnection-triggered refetches separately.
          if (storeSettings.selectedStore?.id) {
            const qState = queryClient.getQueryState(
              orderQueryKeys.active(storeSettings.selectedStore.id),
            );
            const dataAge = Date.now() - (qState?.dataUpdatedAt ?? 0);
            if (dataAge > 2 * 60 * 1000) {
              queryClient.invalidateQueries({
                queryKey: orderQueryKeys.active(storeSettings.selectedStore.id),
              });
            }
          }
        }

        // Resume the Castles singleton with the current station's terminal
        // config so the first post-resume payment skips the cold-connect
        // penalty. Read from the store (not closure) to avoid stale refs.
        const terminal =
          useStoreSettingsStore.getState().selectedStation?.payment_terminal;
        if (
          terminal?.id &&
          terminal?.terminal_type === "castles" &&
          (terminal.ip_address || terminal.connection_type === "usb")
        ) {
          const service = getSharedCastlesService();
          if (service.isSuspended()) {
            service.resume({
              connectionType:
                terminal.connection_type === "usb" ? "usb" : "local_socket",
              host: terminal.ip_address,
              port: terminal.port ?? CASTLES_DEFAULT_PORT,
              timeout: 10_000,
              terminalId: terminal.id,
            });
          }
        }
      } else if (nextState === "background") {
        // Graceful Castles disconnect: send return2Idle + close the socket so
        // the terminal cleans up its side. Fire-and-forget — the method is
        // safe (never throws, never blocks long) but defensively catch.
        getSharedCastlesService()
          .suspend()
          .catch(() => {});
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange,
    );

    return () => {
      subscription.remove();
    };
  }, [isKDS]);

  // Unified location config sync — hydrates pos_config + subscribes to real-time updates
  // Also handles legacy SETTINGS_UPDATE events for backward compat with older stations
  useEffect(() => {
    const locationId = selectedStore?.id;
    if (!locationId || !supabase) return;

    const myStationId = useStoreSettingsStore.getState().selectedStation?.id ?? null;
    const cleanup = initLocationConfigSync(supabase, locationId, myStationId);

    // Backward compat: still hydrate dining settings into old store during migration
    if (selectedStore?.public_metadata?.dining_settings) {
      useSettingsStore.getState().updateDiningSettings(
        selectedStore.public_metadata.dining_settings as Partial<SyncableDiningSettings>
      );
    }

    return cleanup;
  }, [selectedStore?.id, supabase]);

  // Background queue processor for station logins queued during offline sign-in
  useStationLoginSync();

  return <>{children}</>;
}
