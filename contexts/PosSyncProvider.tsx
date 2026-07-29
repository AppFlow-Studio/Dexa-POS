import { queryClient } from "@/contexts/TanstackProvider";
import { useBusinessDayRollover } from "@/hooks/pos/useBusinessDayRollover";
import { orderQueryKeys, useOrdersQuery } from "@/hooks/pos/useOrdersQuery";
import { useMenuSnoozeReconcile } from "@/hooks/pos/useMenuSnoozeReconcile";
import { usePosSync } from "@/hooks/pos/usePosSync";
import { useServiceChargeRulesSync } from "@/hooks/pos/useServiceChargeRulesSync";
import { useStandaloneSync } from "@/hooks/pos/useStandaloneSync";
import { useOrderReconcile } from "@/hooks/useOrderReconcile";
import { useStationLoginSync } from "@/hooks/useStationLoginSync";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { setupConnectionQuality } from "@/lib/network/setupConnectionQuality";
import { getStorageSizeStats } from "@/lib/storage";
import { initLandiPrinter } from "@/native/LandiPrinter";
import { setCartShapeReconcileSupabaseClient } from "@/services/cartShapeReconcile";
import { syncEmployees as syncEmployeesService } from "@/services/employeeSyncService";
import { FloorPlanService } from "@/services/floorPlanService";
import {
    detectAndStoreCapabilities,
    startHeartbeat,
    startStarPrinterHealthCheck,
    startTerminalHealthCheck,
    stopHeartbeat,
    stopStarPrinterHealthCheck,
    stopTerminalHealthCheck,
} from "@/services/hardware";
import { initLocationConfigSync } from "@/services/locationConfigSync";
import {
    initializeOfflineSync,
    isServiceInitialized,
    setOfflineSyncSupabaseClient,
} from "@/services/offlineSyncInit";
import {
    startStarPrinterDiscoveryService,
    stopStarPrinterDiscoveryService,
} from "@/services/printing/discovery/StarPrinterDiscoveryService";
import { getDriver } from "@/services/printing/DriverFactory";
import { getSharedCastlesService } from "@/services/terminals/castles-service";
import {
    startCastlesUsbAutoConnect,
    stopCastlesUsbAutoConnect,
} from "@/services/terminals/castlesUsbAutoConnect";
import {
    startValorUsbAutoConnect,
    stopValorUsbAutoConnect,
} from "@/services/terminals/valorUsbAutoConnect";
import {
    startAtomLoopbackDetect,
    stopAtomLoopbackDetect,
} from "@/services/terminals/atomLoopbackDetector";
import {
    startTimeclockSyncProcessor,
    stopTimeclockSyncProcessor,
} from "@/services/timeclockSyncProcessor";
import { setCoursingSupabaseClient } from "@/stores/useCoursingStore";
import {
    setFloorPlanSupabaseClient,
    useFloorPlanStore,
} from "@/stores/useFloorPlanStore";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { setKDSSupabaseClient } from "@/stores/useKDSStore";
import { useMenuStore } from "@/stores/useMenuStore";
import {
    setOrderStoreSupabaseClient,
    useOrderStore,
} from "@/stores/useOrderStore";
import { setPreviousOrdersSupabaseClient } from "@/stores/usePreviousOrdersStore";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { useReceiptTemplateStore } from "@/stores/useReceiptTemplateStore";
import { setSeatingSupabaseClient } from "@/stores/useSeatingStore";
import {
    SyncableDiningSettings,
    useSettingsStore,
} from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { setWaitlistSupabaseClient } from "@/stores/useWaitlistStore";
import { CASTLES_DEFAULT_PORT } from "@/types/castles";
import { TaxRate } from "@/types/menu";
import * as Sentry from "@sentry/react-native";
import React, { useCallback, useEffect, useRef } from "react";
import { AppState, AppStateStatus, InteractionManager } from "react-native";

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
  const hasCheckedStorageSizeRef = useRef(false);
  const lastStoreSettingsRefreshRef = useRef<number>(0);
  const lastEmployeeSyncRefreshRef = useRef<number>(0);
  const supabase = useSupabaseClient();
  // Archive layer: TanStack Query fetches orders and hydrates workspace (skip for KDS).
  // stationId is part of the queryKey so the server-side draft filter refetches
  // when the user switches stations on the same device.
  useOrdersQuery({
    locationId: selectedStore?.id ?? null,
    stationId: selectedStation?.id ?? null,
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
      setCartShapeReconcileSupabaseClient(supabase);
      setOfflineSyncSupabaseClient(supabase);
      setupConnectionQuality(supabase);
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

  useBusinessDayRollover({
    enabled: Boolean(supabase && selectedStore?.id && !isKDS),
  });

  // Keep 86/out-of-stock state live with website + other-station changes.
  // pos_sync is staleTime:Infinity, so without this a website 86 never reaches a
  // running POS. Surgical snooze-only reconcile (no full menu rebuild). KDS skips.
  useMenuSnoozeReconcile(isKDS ? undefined : selectedStore?.id);

  // Wave 3.0d-5: combined order reconcile on slow→fast + foreground recovery.
  // Sequenced: cart-shape push (3.0f-3) → 500ms gap → header pull (3.0d-5).
  // Each pass is independently flag-gated (EXPO_PUBLIC_CART_SHAPE_RECONCILE
  // and EXPO_PUBLIC_ORDER_HEADER_RECONCILE). KDS skips both — it doesn't
  // author or display orders in the order-processing sense.
  useOrderReconcile({ enabled: !isKDS });

  // Device detection & heartbeat lifecycle
  useEffect(() => {
    if (supabase && selectedStation?.id && selectedStore?.id) {
      detectAndStoreCapabilities(supabase, selectedStation.id)
        .then(async (capabilities) => {
          // Fetch printers into local store so PrinterService can route jobs
          await usePrinterStore.getState().fetchPrinters(selectedStore.id);

          // Reconcile DB ↔ MMKV per-station receipt printer claim. The DB
          // (stations.current_receipt_printer_id) is now the source of
          // truth; useSettingsStore.defaultReceiptPrinterId is kept as a
          // boot-window cache + safety net while devices roll over.
          try {
            const stationId = selectedStation.id;
            const { data: stationRow } = await supabase
              .from("stations")
              .select("current_receipt_printer_id")
              .eq("id", stationId)
              .maybeSingle();

            const dbClaim = stationRow?.current_receipt_printer_id ?? null;
            const mmkvClaim =
              useSettingsStore.getState().defaultReceiptPrinterId;
            const setMmkv =
              useSettingsStore.getState().setDefaultReceiptPrinterId;
            const printers = usePrinterStore.getState().printers;

            if (dbClaim) {
              // Mirror DB onto selectedStation + MMKV so PrintRouter's fast
              // path can read from the cache without an extra fetch.
              if (selectedStation.current_receipt_printer_id !== dbClaim) {
                useStoreSettingsStore.getState().setSelectedStation({
                  ...selectedStation,
                  current_receipt_printer_id: dbClaim,
                });
              }
              if (mmkvClaim !== dbClaim) setMmkv(dbClaim);
            } else if (mmkvClaim) {
              // Legacy MMKV-only claim — promote to DB if the printer still
              // exists at this location; otherwise clear the stale local id.
              const stillExists = printers.some(
                (p) => p.id === mmkvClaim && p.isActive,
              );
              if (stillExists) {
                await usePrinterStore
                  .getState()
                  .setStationReceiptPrinter(stationId, mmkvClaim);
              } else {
                setMmkv(null);
              }
            }
          } catch (e) {
            console.warn(
              "[PosSyncProvider] Receipt printer claim reconciliation failed:",
              e,
            );
          }

          // Pre-warm Landi printer + cashBox so the first cash payment
          // doesn't pay cold-init cost on the AIDL bus (10-15s delay).
          // Route through the driver instance so its `connected=true` flag is
          // set — otherwise the next print/drawer call sees `!isConnected()`
          // and re-runs initialize() per job.
          if (capabilities.hasBuiltinPrinter && !isKDS) {
            const landiPrinter = usePrinterStore
              .getState()
              .printers.find(
                (p) => p.printerType === "builtin_landi" && p.isActive,
              );
            const warmUp = landiPrinter
              ? getDriver(landiPrinter)
                  .initialize(landiPrinter)
                  .then(() => true)
              : initLandiPrinter();
            warmUp
              .then((ok) =>
                console.log(
                  `[PosSyncProvider] Landi pre-warm ${ok ? "ok" : "skipped"}`,
                ),
              )
              .catch((e) =>
                console.warn("[PosSyncProvider] Landi pre-warm failed:", e),
              );
          }
        })
        .catch((e) =>
          console.warn("[PosSyncProvider] Device detection failed:", e),
        );
      startHeartbeat(supabase, selectedStation.id, selectedStore.id);
    }

    return () => {
      stopHeartbeat();
    };
  }, [supabase, selectedStation?.id, selectedStore?.id, isKDS]);

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

  // Zero-touch Castles USB auto-connect: plug in a USB pin pad (or have it
  // already attached at app/station load) and the shared singleton connects
  // automatically. No-op unless the station's terminal is a USB Castles, and
  // skipped in KDS mode (no POS hardware there).
  useEffect(() => {
    const terminal = selectedStation?.payment_terminal;
    const isUsbCastles =
      terminal?.terminal_type === "castles" &&
      terminal?.connection_type === "usb";
    const isUsbValor =
      terminal?.terminal_type === "valor" &&
      terminal?.connection_type === "usb";
    if (!isKDS && isUsbCastles) {
      startCastlesUsbAutoConnect();
    }
    if (!isKDS && isUsbValor) {
      startValorUsbAutoConnect();
    }
    return () => {
      stopCastlesUsbAutoConnect();
      stopValorUsbAutoConnect();
    };
  }, [
    isKDS,
    selectedStation?.payment_terminal?.id,
    selectedStation?.payment_terminal?.terminal_type,
    selectedStation?.payment_terminal?.connection_type,
  ]);

  // On-device ("internal") ATOM detection: probe the loopback ATOM app and
  // surface it as an available terminal. Self-gates on Landi hardware + the
  // native AtomBridge, so it's a no-op on non-Landi devices. POS-only.
  useEffect(() => {
    if (isKDS) return;
    startAtomLoopbackDetect();
    return () => {
      stopAtomLoopbackDetect();
    };
  }, [isKDS]);

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
      try {
        await syncEmployeesService(supabase, locationId);
      } catch {
        // Error state already recorded in useEmployeeStore by syncEmployeesService.
      }
    },
    [supabase],
  );

  // Staff/PIN resync, gated behind a 5-minute staleness window shared by the
  // AppState "active" handler and the idle interval fallback below — so a
  // station left open and foregrounded for a whole shift (never backgrounded)
  // still picks up backend PIN changes without needing a manual "Sync POS".
  const refreshEmployeesIfStale = useCallback(() => {
    const locationId = useStoreSettingsStore.getState().selectedStore?.id;
    if (!locationId) return;
    const age = Date.now() - lastEmployeeSyncRefreshRef.current;
    if (age <= 5 * 60 * 1000) return;
    lastEmployeeSyncRefreshRef.current = Date.now();
    console.log(
      `[PosSyncProvider] Employee/PIN staleness resync firing (age ${Math.round(age / 1000)}s)`,
    );
    syncEmployeesService(supabase, locationId).catch(() => {});
  }, [supabase]);

  // Idle fallback: re-check staleness on an interval independent of AppState
  // transitions, since a device that never backgrounds/foregrounds (the common
  // case for a tablet POS left open through a shift) would otherwise never
  // re-consult the 5-minute window at all.
  useEffect(() => {
    const interval = setInterval(refreshEmployeesIfStale, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [refreshEmployeesIfStale]);

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
          // Await prefetch so all floorplans are cached before we strip
          // orphaned sessions below.
          await useFloorPlanStore
            .getState()
            .prefetchFloorPlans(
              (floorPlans || []).map((floorPlan) => floorPlan.id),
            );
        }

        // Strip sessions for tables that no longer exist in ANY floorplan
        // (e.g. after a floorplan was deleted). Safe to call now because all
        // floorplans have been prefetched and cached.
        const { useTableSessionStore } =
          await import("@/stores/useTableSessionStore");
        useTableSessionStore.getState()._stripOrphanedSessions();

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
        if (taxRates.length === 0) {
          // No error but zero rows — usually RLS silently filtering (stale JWT /
          // location not in user's set). setTaxRates preserves existing rates
          // rather than wiping the map and taxing everything at 0%.
          console.warn(
            "Tax rates sync returned 0 rows (no error) — preserving existing rates if any",
          );
        }
        useStoreSettingsStore.getState().setTaxRates(taxRates);
        // console.log("Tax rates synced:", taxRates.length);
      } catch (err: any) {
        console.error("Tax rates sync error:", err);
      }
    },
    [supabase],
  );

  // Sync employees when store is selected.
  // KDS only needs employees (for PIN verification).
  // Floor plans + tax rates sync lives in the effect further down (the one
  // that clears stale floor data first) — it used to ALSO run here, which
  // double-fetched both on every store selection (perf F3 dedupe).
  // Deferred past interactions so boot syncs don't compete with first paint.
  useEffect(() => {
    if (!selectedStore?.id) return;
    const storeId = selectedStore.id;
    const task = InteractionManager.runAfterInteractions(() => {
      console.log(
        `[PosSyncProvider] Employee/PIN sync firing (store selection changed): ${storeId}`,
      );
      syncEmployees(storeId).then(() => {
        // Hydrate active shifts after employees are loaded (needs employee data for mapping)
        if (!isKDS) {
          useTimeclockStore.getState().hydrateActiveShifts(supabase, storeId);
        }
      });
    });
    return () => task.cancel();
  }, [selectedStore?.id, isKDS, syncEmployees, supabase]);

  // Run timeclock queue processor at app scope so it is not tied to mounted screens.
  useEffect(() => {
    if (supabase && selectedStore?.id && !isKDS) {
      startTimeclockSyncProcessor(supabase);
    }

    return () => {
      stopTimeclockSyncProcessor();
    };
  }, [supabase, selectedStore?.id, isKDS]);

  useEffect(() => {
    if (hasCheckedStorageSizeRef.current) return;
    hasCheckedStorageSizeRef.current = true;

    const TEN_MB = 10 * 1024 * 1024;
    const stats = getStorageSizeStats();
    const buckets = [
      { name: "general", ...stats.general },
      { name: "secure", ...stats.secure },
      { name: "sync", ...stats.sync },
    ];

    for (const bucket of buckets) {
      if (bucket.totalBytes > TEN_MB) {
        Sentry.captureMessage("MMKV bucket size exceeded 10MB", {
          level: "warning",
          tags: {
            source: "storage_monitor",
            bucket: bucket.name,
          },
          extra: {
            totalBytes: bucket.totalBytes,
            keyCount: bucket.keyCount,
            thresholdBytes: TEN_MB,
          },
        });
      }
    }
  }, []);

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

  // --- SERVICE CHARGE RULES SYNC --- (skip for KDS)
  useServiceChargeRulesSync({
    merchantId: isKDS ? null : (selectedStore?.merchant_id ?? null),
    locationId: isKDS ? null : (selectedStore?.id ?? null),
  });

  // Inventory data is fetched lazily in inventory/_layout.tsx, not at startup.
  // We still need to register the Supabase client so store methods work when inventory loads.
  const setInventorySupabase = useInventoryStore(
    (state) => state.setSupabaseClient,
  );

  useEffect(() => {
    if (supabase) {
      setInventorySupabase(supabase);
    }
  }, [supabase]);

  // Helper to merge recipes into menu store
  const applyRecipes = (
    data:
      | {
          menu_item_ingredients?: Array<{
            menu_item_id: string;
            inventory_item_id: string;
            quantity: number;
          }>;
          modifier_group_item_ingredients?: Array<{
            modifier_group_item_id: string;
            inventory_item_id: string;
            quantity: number;
          }>;
        }
      | null
      | undefined,
  ) => {
    if (!data) return;
    if (
      data.menu_item_ingredients?.length ||
      data.modifier_group_item_ingredients?.length
    ) {
      useMenuStore.getState().mergeRecipeData({
        menuRecipes: (data.menu_item_ingredients ?? []).map((r) => ({
          menu_item_id: r.menu_item_id,
          inventory_item_id: r.inventory_item_id,
          quantity: r.quantity,
        })),
        modifierRecipes: (data.modifier_group_item_ingredients ?? []).map(
          (r) => ({
            modifier_group_item_id: r.modifier_group_item_id,
            inventory_item_id: r.inventory_item_id,
            quantity: r.quantity,
          }),
        ),
      });
    }
  };

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
      applyRecipes(posSyncData);

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
  }, [posSyncData, setMenuData, selectedStore?.id]);

  // Merge standalone data (categories, items, modifiers, menus including inactive)
  useEffect(() => {
    if (standaloneData) {
      const menuStore = useMenuStore.getState();
      menuStore.mergeStandaloneData(standaloneData);

      // Re-apply recipes if available (since mergeStandaloneData might overwrite items)
      applyRecipes(posSyncData);

      console.log("✅ Standalone data merged:", {
        categories: standaloneData.categories?.length || 0,
        items: standaloneData.items?.length || 0,
        modifierGroups: standaloneData.modifierGroups?.length || 0,
        menus: standaloneData.menus?.length || 0,
      });
    }
  }, [standaloneData, posSyncData]);

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
    if (
      realtimeLocationRef.current &&
      realtimeLocationRef.current !== locationId
    ) {
      useFloorPlanStore.getState().cleanup();
    }

    realtimeLocationRef.current = locationId;

    // Cleanup function
    return () => {
      useFloorPlanStore.getState().cleanup();
      realtimeLocationRef.current = null;
    };
  }, [selectedStore?.id]);

  // Single owner of floor plan + tax rate + receipt template sync (perf F3:
  // the employee-sync effect above no longer duplicates these fetches).
  // Deferred past interactions; the three calls run concurrently.
  useEffect(() => {
    if (!selectedStore?.id || isKDS) return;
    const storeId = selectedStore.id;
    const task = InteractionManager.runAfterInteractions(() => {
      // Clear stale floor plan data ONLY on a genuine station switch. On a
      // same-station cold boot, locationId (persisted) already equals storeId,
      // so we keep the rehydrated geometry + bridged sessions and let
      // syncFloorPlans reconcile in the background. Blanking tables here on
      // every boot caused a blank board (and forced the re-fetch that paints
      // from the session-stripped cache) before fresh data arrived.
      const fp = useFloorPlanStore.getState();
      if (fp.locationId && fp.locationId !== storeId) {
        useFloorPlanStore.setState({
          tables: [],
          lastSyncAt: null,
        });
      }

      syncFloorPlans(storeId);
      syncTaxRates(storeId);
      useReceiptTemplateStore.getState().fetchTemplates(storeId);
    });
    return () => task.cancel();
  }, [selectedStore?.id, isKDS, syncFloorPlans, syncTaxRates]);

  // App state listener - reconnect realtime and refresh stale data when app becomes active
  // KDS screen handles its own 120s polling fallback, so skip POS reconnect logic
  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active") {
        console.log("[PosSyncProvider] App became active - refreshing data");

        // Refresh location settings for ALL devices (fallback for missed broadcasts).
        // Gate behind a 5-minute staleness window — fires on every active event
        // (including brief foreground→background→foreground cycles) otherwise,
        // which adds a network round-trip on the critical first-tap path.
        const storeSettings = useStoreSettingsStore.getState();
        const settingsAge = Date.now() - lastStoreSettingsRefreshRef.current;
        if (settingsAge > 5 * 60 * 1000) {
          lastStoreSettingsRefreshRef.current = Date.now();
          storeSettings.refreshSelectedStore(supabase);
        }

        // Refresh staff/PIN data on the same 5-minute staleness window as
        // store settings — picks up PIN changes made on another device or the
        // backend without requiring a manual "Sync POS" or re-selecting the store.
        refreshEmployeesIfStale();

        if (!isKDS) {
          const floorPlanStore = useFloorPlanStore.getState();

          // Floor realtime (re)connection on foreground is owned by
          // useFloorRealtime / useRealtimeChannel (AppState-aware). Here we only
          // converge state via the authoritative snapshot if it's stale.
          floorPlanStore.loadFloorPlanStatusIfStale();

          // Refresh orders when app resumes — only if data is older than staleTime.
          // useOrderSyncRecovery handles reconnection-triggered refetches separately.
          // queryKey now includes stationId, so use a prefix-matching cache lookup
          // (exact:false) instead of getQueryState (which is exact-match).
          if (storeSettings.selectedStore?.id) {
            const cached = queryClient.getQueryCache().find({
              queryKey: orderQueryKeys.active(storeSettings.selectedStore.id),
              exact: false,
            });
            const dataAge = Date.now() - (cached?.state.dataUpdatedAt ?? 0);
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
        const service = getSharedCastlesService();
        if (service.isSuspended()) {
          const terminal =
            useStoreSettingsStore.getState().selectedStation?.payment_terminal;
          if (
            terminal?.id &&
            terminal?.terminal_type === "castles" &&
            (terminal.ip_address || terminal.connection_type === "usb")
          ) {
            // Resume + pre-warm connection with terminal config
            service.resume({
              connectionType:
                terminal.connection_type === "usb" ? "usb" : "local_socket",
              host: terminal.ip_address,
              port: terminal.port ?? CASTLES_DEFAULT_PORT,
              timeout: 10_000,
              terminalId: terminal.id,
            });
          } else {
            // Always clear suspended flag — lazy-connect will handle the rest
            service.resume();
          }
        }
      } else if (nextState === "background") {
        // Idle GC: reclaim completed-order memory now, while backgrounded and
        // nobody is waiting on the JS thread — so the app wakes up lean instead
        // of carrying a shift's worth of archived orders until the next 2-min
        // prune tick. Deliberately a GC, NOT a purge+resync: blowing away the
        // working set on idle would force a network re-fetch on the operator's
        // first tap (the documented ~1hr-idle cold-start lag), trading a quiet
        // background cost for foreground latency on a busy floor. Skip on KDS
        // (it owns its own lifecycle and has no POS order workspace).
        if (!isKDS) {
          useOrderStore.getState().clearInactiveOrders();
        }

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

    const stationId = selectedStation?.id ?? null;
    const cleanup = initLocationConfigSync(supabase, locationId, stationId);

    // Backward compat: still hydrate dining settings into old store during migration
    if (selectedStore?.public_metadata?.dining_settings) {
      useSettingsStore
        .getState()
        .updateDiningSettings(
          selectedStore.public_metadata
            .dining_settings as Partial<SyncableDiningSettings>,
        );
    }

    return cleanup;
  }, [selectedStore?.id, selectedStation?.id, supabase]);

  // Background queue processor for station logins queued during offline sign-in
  useStationLoginSync();

  return <>{children}</>;
}
