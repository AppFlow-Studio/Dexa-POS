import DiscountBottomSheet from "@/components/bill/DiscountBottomSheet";
import ItemProgressTracker from "@/components/bill/ItemProgressTracker";
import MoreOptionsBottomSheet from "@/components/bill/MoreOptionsBottomSheet";
import TableBillSection from "@/components/bill/TableBillSection";
import MenuSection from "@/components/menu/MenuSection";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import OrderInfoHeader from "@/components/tables/OrderInfoHeader";
import TableDetailSkeleton from "@/components/tables/TableDetailSkeleton";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { useLoading } from "@/contexts/LoadingContext";
import { useToast } from "@/contexts/ToastContext";
import { InventoryService } from "@/services/inventoryService";
import { queueFailedOperation } from "@/services/offlineSyncInit";
import { OrderService } from "@/services/orderService";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import {
  getOrderStoreSupabaseClient,
  useOrderStore,
} from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { AlertTriangle, ChevronLeft } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { InteractionManager, ScrollView, Text, TouchableOpacity, View } from "react-native";

const UpdateTableScreen = () => {
  const { defaultSittingTimeMinutes } = useSettingsStore();
  const [duration, setDuration] = useState("");
  const [isOvertime, setIsOvertime] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const isNavigatingAwayRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const wasPaymentSheetOpenRef = useRef(false);
  const isPaymentProcessingRef = useRef(false); // Prevent auto-session during payment sync
  const isAutoSessionRunningRef = useRef(false); // Prevent re-entry during async operations

  const router = useRouter();
  const { tableId, source } = useLocalSearchParams<{
    tableId: string;
    source?: string;
  }>();
  const isModifierSidebarOpen = useModifierSidebarStore(
    (state) => state.isOpen,
  );
  const { show } = useToast();
  const { showLoading, hideLoading } = useLoading();

  const [isNotReadyConfirmOpen, setNotReadyConfirmOpen] = useState(false);
  const [isClearNotReadyConfirmOpen, setClearNotReadyConfirmOpen] =
    useState(false);
  const [isVoidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [isOrderClosedWarningOpen, setOrderClosedWarningOpen] = useState(false);
  const [selectedCourseIdForTracker, setSelectedCourseIdForTracker] = useState<
    number | null
  >(null);
  const [courseToResend, setCourseToResend] = useState<number | null>(null);
  const [notReadyItems, setNotReadyItems] = useState<
    { id: string; name: string; quantity: number }[]
  >([]);
  const [isReopenModalOpen, setReopenModalOpen] = useState(false);

  const pricingSheetRef = useRef<BottomSheetMethods>(null);
  const moreOptionsSheetRef = useRef<BottomSheetMethods>(null);
  const discountSheetRef = useRef<BottomSheetMethods>(null);

  const updateSessionStatus = useFloorPlanStore((s) => s.updateSessionStatus);
  const loadFloorPlanStatus = useFloorPlanStore((s) => s.loadFloorPlanStatus);
  const getTableById = useFloorPlanStore((s) => s.getTableById);
  const clearTableSession = useFloorPlanStore((s) => s.clearTableSession);

  const setActiveOrder = useOrderStore((s) => s.setActiveOrder);
  const startNewOrder = useOrderStore((s) => s.startNewOrder);
  const assignOrderToTable = useOrderStore((s) => s.assignOrderToTable);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const updateActiveOrderDetails = useOrderStore((s) => s.updateActiveOrderDetails);
  const updateItemStatusInActiveOrder = useOrderStore((s) => s.updateItemStatusInActiveOrder);
  const syncOrderStatus = useOrderStore((s) => s.syncOrderStatus);
  const archiveOrder = useOrderStore((s) => s.archiveOrder);
  const syncOrderFromBackendComplete = useOrderStore((s) => s.syncOrderFromBackendComplete);
  const syncOrderFromDatabase = useOrderStore((s) => s.syncOrderFromDatabase);

  const setActiveTableId = usePaymentStore((s) => s.setActiveTableId);
  const clearActiveTableId = usePaymentStore((s) => s.clearActiveTableId);
  const openPaymentSheet = usePaymentStore((s) => s.open);
  const isPaymentSheetOpen = usePaymentStore((s) => s.isOpen);

  const currentTableId = typeof tableId === "string" ? tableId : "";
  // OPTIMIZED: Use O(1) lookup instead of .find()
  const initialTable = getTableById(currentTableId);
  // Logic to find primary table if this is a merged table
  // In the new system, tables are merged via session.merged_tables or similar logic
  // For now, we rely on the implementation where tables have a session
  const table = initialTable;

  const tableStatus = table?.session?.status || "available";

  // Get order ID for this table's session
  const sessionOrderId = table?.session?.order_id;

  // REACTIVE SUBSCRIPTION: Subscribe directly to the order from the store
  // This ensures we always get the latest data when payment updates the store
  // Phase 2.2: Use universal getOrder() for O(1) lookup
  const activeOrder = useOrderStore((state) => {
    if (sessionOrderId) {
      // Use universal getter (works with both local and DB IDs)
      return state.getOrder(sessionOrderId);
    }
    // Fall back to active order
    if (state.activeOrderId) {
      return state.ordersById[state.activeOrderId];
    }
    return undefined;
  });

  // REACTIVE: Subscribe directly to these values from the store
  const activeOrderId = useOrderStore((state) => state.activeOrderId);
  const storeActiveOrderOutstandingTotal = useOrderStore(
    (state) => state.activeOrderOutstandingTotal,
  );
  const storeActiveOrderTotal = useOrderStore(
    (state) => state.activeOrderTotal,
  );
  // console.log('[activeOrder] activeOrder Items', activeOrder?.items.length, activeOrder);
  // --- Derived helpers ---
  const hasAnyItems = !!activeOrder && activeOrder.items?.length > 0;
  const hasPayments = !!activeOrder && (activeOrder.payments?.length || 0) > 0;

  // Calculate the amount to display on the Pay button
  // Use locally calculated values - fast and accurate
  // Properly accounts for: item prices, discounts, and payments
  let displayBalanceDue: number;

  if (activeOrder?.payments && activeOrder.payments.length > 0) {
    // Has payments - show outstanding balance (unpaid items)
    displayBalanceDue = storeActiveOrderOutstandingTotal;
  } else {
    // No payments - show full order total
    displayBalanceDue = storeActiveOrderTotal;
  }

  // Check if order is fully paid
  const isFullyPaid = useMemo(() => {
    // If check is explicitly reopened, don't consider it fully paid
    // This allows adding items or closing the check again without changes
    if (activeOrder?.check_status === "Opened") {
      return false;
    }
    return (
      activeOrder?.paid_status === "Paid" ||
      (hasPayments && displayBalanceDue <= 0)
    );
  }, [
    activeOrder?.check_status,
    activeOrder?.paid_status,
    hasPayments,
    displayBalanceDue,
  ]);

  useEffect(() => {
    if (
      (tableStatus !== "seated" &&
        tableStatus !== "ordered" &&
        tableStatus !== "served" &&
        tableStatus !== "check_presented" &&
        tableStatus !== "paid") ||
      !activeOrder?.opened_at
    ) {
      setDuration("");
      setIsOvertime(false);
      return;
    }

    const updateDuration = () => {
      if (!activeOrder?.opened_at) return;
      const startTime = new Date(activeOrder.opened_at);
      const now = new Date();
      const diffMs = now.getTime() - startTime.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      setDuration(`${diffMins} min`);
      setIsOvertime(
        defaultSittingTimeMinutes > 0 && diffMins > defaultSittingTimeMinutes,
      );
    };

    updateDuration(); // Run immediately

    const timer = setInterval(updateDuration, 60000);
    return () => clearInterval(timer);
  }, [tableStatus, activeOrder?.opened_at, defaultSittingTimeMinutes]);

  useEffect(() => {
    if (tableStatus === "cleaning") {
      router.replace("/tables");
      return;
    }
  }, [tableStatus]);

  // Use stable ID instead of object reference to prevent loops
  // Note: activeOrder is now the same as what was existingOrderForTable
  const existingOrderId = activeOrder?.id;
  const existingOrderForTable = activeOrder; // Alias for backward compatibility

  useEffect(() => {
    if (existingOrderId) {
      // If we navigated to a table that's already in use, make its order active.
      setActiveOrder(existingOrderId);
    }
    return () => setActiveOrder(null);
  }, [currentTableId, existingOrderId, setActiveOrder]);

  // Mark initialization complete when table and order are ready
  useEffect(() => {
    if (table && (activeOrder || tableStatus === "available")) {
      // Defer until animations/interactions complete for smooth transition
      const interaction = InteractionManager.runAfterInteractions(() => {
        setIsInitializing(false);
      });
      return () => interaction.cancel();
    }
  }, [table, activeOrder, tableStatus]);

  useEffect(() => {
    if (currentTableId) {
      setActiveTableId(currentTableId);
    }

    return () => {
      clearActiveTableId();
    };
  }, [currentTableId]);

  // --- Sync payment status from database after payment sheet closes ---
  useEffect(() => {
    // Detect when payment sheet closes (was open -> now closed)
    if (wasPaymentSheetOpenRef.current && !isPaymentSheetOpen) {
      console.log("[Payment] Sheet closed. Syncing from database...");

      // SET GUARD: Block auto-session during payment sync
      isPaymentProcessingRef.current = true;

      const orderId = activeOrder?.id;
      if (orderId) {
        setTimeout(async () => {
          try {
            // Use syncOrderFromBackendComplete for complete order details
            // This fetches FULL order including items, modifiers, payments, and status history
            await syncOrderFromBackendComplete(orderId);
          } catch (error) {
            console.error("[Payment] Failed to sync order:", error);
          } finally {
            // CLEAR GUARD: Allow auto-session again
            isPaymentProcessingRef.current = false;
          }
        }, 500);
      } else {
        isPaymentProcessingRef.current = false;
      }
    }

    // Update ref
    wasPaymentSheetOpenRef.current = isPaymentSheetOpen;
  }, [isPaymentSheetOpen, activeOrder?.id]);

  // --- Auto-Session & Order Sync Logic ---
  useEffect(() => {
    // Skip if we're navigating away
    if (isNavigatingAwayRef.current) {
      console.log("[AutoSession] Skipping - navigating away");
      return;
    }

    // Guard against re-entry while async operation is in progress
    if (isAutoSessionRunningRef.current) {
      console.log("[AutoSession] Skipping - already running");
      return;
    }

    const handleAutoCreateSession = async () => {
      // Wait for navigation animations to complete before heavy work
      await new Promise<void>((resolve) => {
        InteractionManager.runAfterInteractions(() => resolve());
      });
      // Double-check navigation guard (async timing)
      if (isNavigatingAwayRef.current) {
        console.log("[AutoSession] Skipping async - navigating away");
        return;
      }

      // NEW GUARD: Block during payment processing
      if (isPaymentProcessingRef.current) {
        console.log("[AutoSession] Skipping - payment processing in progress");
        return;
      }

      // Set running flag to prevent re-entry
      isAutoSessionRunningRef.current = true;

      try {
        // OPTIMIZED: Check if we already have session data before fetching
        // This prevents unnecessary network call when data is already fresh (e.g., after prefetch)
        const currentTable = getTableById(currentTableId);
        const hasExistingSession =
          currentTable?.session?.status &&
          currentTable.session.status !== "available";

        if (!hasExistingSession) {
          // Only load floor plan status if we don't have session data
          // This is critical for preventing race condition when navigating from waitlist
          await loadFloorPlanStatus();
        }

        // Re-fetch table from store after status check (to get updated session data)
        const updatedTables = useFloorPlanStore.getState().tables;
        const updatedTable = updatedTables.find((t) => t.id === currentTableId);
        const updatedTableStatus = updatedTable?.session?.status || "available";

        console.log("[handleAutoCreateSession] Starting...");
        console.log("  currentTableId:", currentTableId);
        console.log("  updatedTableStatus:", updatedTableStatus);
        console.log("  updatedTable?.session:", updatedTable?.session?.id);
        console.log("  session.order_id:", updatedTable?.session?.order_id);
        console.log("  existingOrderForTable:", existingOrderForTable?.id);

        if (!currentTableId || !updatedTable) return;

        // Case 1: Session exists with an order
        if (updatedTable.session?.order_id) {
          // NEW CHECK: If active order already matches, don't re-fetch
          const activeOrderDbId = activeOrder?.db_order_id;
          if (activeOrderDbId === updatedTable.session.order_id) {
            console.log(
              "[AutoSession] Active order already matches session, skipping",
            );
            return;
          }

          // FIX: Direct O(1) lookup by DB UUID (single-index architecture)
          // Orders are now keyed by DB UUID, so direct lookup is fastest and most reliable
          const ordersById = useOrderStore.getState().ordersById;
          const directLookup = ordersById[updatedTable.session.order_id];
          if (directLookup) {
            if (activeOrderId !== directLookup.id) {
              console.log(
                "[AutoSession] Found order by direct lookup:",
                directLookup.id,
              );
              setActiveOrder(directLookup.id);
            }
            return;
          }

          // Fallback: Use getState() for fresh data and search by id or db_order_id
          const currentOrders = Object.values(ordersById);
          const foundOrder = currentOrders.find(
            (o) =>
              o.id === updatedTable.session!.order_id ||
              o.db_order_id === updatedTable.session!.order_id,
          );

          if (foundOrder) {
            if (activeOrderId !== foundOrder.id) {
              console.log(
                "[AutoSession] Found existing order via fallback search:",
                foundOrder.id,
              );
              setActiveOrder(foundOrder.id);
            }
          } else {
            // Don't fetch if navigating away or table is being cleared
            if (
              isNavigatingAwayRef.current ||
              updatedTableStatus === "cleaning" ||
              updatedTableStatus === "available"
            ) {
              console.log(
                "[AutoSession] Skipping fetch - table being cleared or navigating",
              );
              return;
            }

            // Before fetching, check if order already exists in store by db_order_id
            const existingOrderByDbId = currentOrders.find(
              (o) => o.db_order_id === updatedTable.session?.order_id,
            );

            if (existingOrderByDbId) {
              // Order exists locally but wasn't found by ID
              // Just set it active, don't fetch
              console.log(
                "[AutoSession] Found order by db_id:",
                existingOrderByDbId.id,
              );
              setActiveOrder(existingOrderByDbId.id);
              return;
            }

            // Phase 12.1: Order not found locally - fetch from database
            console.log(
              "[AutoSession] Syncing order from database:",
              updatedTable.session.order_id,
            );
            showLoading("Restoring table session...");

            try {
              // Use the proper sync function that fetches items + payments
              const localOrderId = await syncOrderFromDatabase(
                updatedTable.session.order_id,
              );

              hideLoading();

              // Check again after async operation
              if (isNavigatingAwayRef.current) {
                console.log(
                  "[AutoSession] Skipping order restore - navigated away",
                );
                return;
              }

              if (localOrderId) {
                console.log(
                  "[AutoSession] Order synced successfully:",
                  localOrderId,
                );
                setActiveOrder(localOrderId);
              }
            } catch (error) {
              console.error(
                "[AutoSession] Failed to sync single order, trying full init:",
                error,
              );

              // Phase 12.1: FALLBACK - Try full initializeOrders as safety net
              try {
                const locationId =
                  useStoreSettingsStore.getState().selectedStore?.id;
                if (locationId) {
                  await useOrderStore.getState().initializeOrders(locationId);

                  // After init, check if order is now available
                  const refreshedOrder =
                    useOrderStore.getState().ordersById[
                      updatedTable.session.order_id
                    ];
                  if (refreshedOrder) {
                    console.log(
                      "[AutoSession] Order found after fallback init:",
                      refreshedOrder.id,
                    );
                    setActiveOrder(refreshedOrder.id);
                    hideLoading();
                    return;
                  }
                }
              } catch (fallbackError) {
                console.error(
                  "[AutoSession] Fallback init also failed:",
                  fallbackError,
                );
              }

              hideLoading();
              show({
                title: "Error Loading Order",
                message: "Failed to restore table session. Please try again.",
                type: "error",
              });
            }
          }
          return;
        }

        // Case 2: No Session - Auto-create ONLY on first mount
        // CRITICAL: Only auto-create once per screen mount, not on every status change
        if (
          !updatedTable.session &&
          updatedTableStatus === "available" &&
          !hasInitializedRef.current
        ) {
          hasInitializedRef.current = true;

          // Final guard check
          if (isNavigatingAwayRef.current) {
            console.log("[AutoSession] Skipping auto-create - navigating away");
            return;
          }

          console.log(
            "[AutoSession] Auto-creating session for table",
            currentTableId,
          );
          showLoading("Creating session...");

          try {
            // For fallback cases (direct URL navigation), try to use existing local order's guest count
            // Use getState() for fresh data instead of stale orders array
            const currentOrders = Object.values(
              useOrderStore.getState().ordersById,
            );
            const existingLocalOrder = currentOrders.find(
              (o) => o.service_location_id === currentTableId,
            );
            const partySize = existingLocalOrder?.guest_count || 1;

            const { sessionId, orderId } = await useFloorPlanStore
              .getState()
              .seatGuests({
                tableIds: [currentTableId],
                partySize: partySize,
                createOrder: true,
              });

            console.log(
              "[AutoSession] Created session:",
              sessionId,
              "Order:",
              orderId,
            );

            // Only set active if we haven't navigated away
            if (orderId && !isNavigatingAwayRef.current) {
              // FIX: Check if order exists in store - seatGuests creates on backend only
              const orderExists = useOrderStore.getState().ordersById[orderId];

              if (!orderExists) {
                // Order created on backend but not in local store - sync it
                console.log(
                  "[AutoSession] Order not in store, syncing:",
                  orderId,
                );
                try {
                  await syncOrderFromDatabase(orderId);
                } catch (syncError) {
                  console.error(
                    "[AutoSession] Failed to sync new order:",
                    syncError,
                  );
                  // Fallback: Try full initializeOrders
                  const locationId =
                    useStoreSettingsStore.getState().selectedStore?.id;
                  if (locationId) {
                    await useOrderStore.getState().initializeOrders(locationId);
                  }
                }
              }

              // Now set active order (it should exist in store now)
              setActiveOrder(orderId);
            } else if (!orderId && !isNavigatingAwayRef.current) {
              setActiveOrder(null);
            }
          } catch (err) {
            console.error("[AutoSession] Failed to auto-seat:", err);
          } finally {
            hideLoading();
          }
        }
      } finally {
        // Reset running flag when async operation completes
        isAutoSessionRunningRef.current = false;
      }
    };

    handleAutoCreateSession();
  }, [currentTableId, tableStatus, table?.session?.order_id]);

  useEffect(() => {
    if (tableStatus === "cleaning" || tableStatus === "available") {
      // If we HAD a session and now we don't, we're being cleaned/voided
      if (hasInitializedRef.current && !table?.session) {
        console.log("[Navigation] Table cleared, navigating away");
        isNavigatingAwayRef.current = true;
        router.replace("/tables"); // Use replace to prevent back-navigation
      }
    }
  }, [tableStatus, table?.session]);

  const handleAssignToTable = async () => {
    if (activeOrderId && currentTableId && table?.session?.id) {
      // This is the key action. It links the active order to the table
      assignOrderToTable(activeOrderId, currentTableId);
      await updateSessionStatus(table.session.id, "ordered");
      updateOrderStatus(activeOrderId, "preparing");
      router.replace("/tables");
    } else if (activeOrderId && currentTableId && !table?.session?.id) {
      // Fallback if no session exists - this might be an issue with data sync or flow
      // Ideally should create a session first or use an existing one.
      // Assuming session creation happens on seating.
      console.warn("Cannot assign order: Table has no session");
      // Try to assign anyway for Order behavior
      // Try to assign anyway for Order behavior
      assignOrderToTable(activeOrderId, currentTableId);
      router.replace("/tables");
    }
  };

  const handlePay = () => {
    // Use activeOrder directly (already subscribed reactively)
    const order = activeOrder;
    if (order) {
      const preparingItems = order.items.filter(
        (i) =>
          (i.item_status || "preparing") !== "ready" &&
          i.item_status !== "served",
      );
      if (preparingItems.length > 0) {
        setNotReadyItems(
          preparingItems.map((i) => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
          })),
        );
        setNotReadyConfirmOpen(true);
        return;
      }
    }
    openPaymentSheet("Card", currentTableId, "payment-method-selection");
  };

  const handleReopenCheck = () => {
    if (!activeOrderId || !activeOrder?.db_order_id) return;
    setReopenModalOpen(true);
  };

  const handleConfirmReopen = async () => {
    setReopenModalOpen(false);

    if (!activeOrderId || !activeOrder?.db_order_id) return;

    try {
      showLoading("Reopening check...");

      const supabase = getOrderStoreSupabaseClient();
      const { loggedInEmployee } = useEmployeeStore.getState();
      const staffId = loggedInEmployee?.profileId;

      if (!supabase) {
        throw new Error("Database connection unavailable");
      }

      if (!staffId) {
        throw new Error("No active employee found");
      }

      // Call backend RPC
      const result = await OrderService.reopenCheck(
        supabase,
        activeOrder.db_order_id,
        staffId,
        "Adding more items", // Default reason
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to reopen check");
      }

      // Update local state
      updateActiveOrderDetails({
        paid_status: "Partial",
        check_status: "Opened",
      });

      // Sync order status based on items
      syncOrderStatus(activeOrderId);

      show({
        title: "Check Reopened",
        message: "You can now add new items to the order.",
        type: "success",
      });
    } catch (error: any) {
      console.error("Failed to reopen check:", error);
      show({
        title: "Failed to Reopen Check",
        message: error.message || "An error occurred",
        type: "error",
      });
    } finally {
      hideLoading();
    }
  };

  const handleMarkAllReadyForCourse = (itemIds: string[]) => {
    itemIds.forEach((itemId) => updateItemStatusInActiveOrder(itemId, "ready"));

    if (activeOrderId && selectedCourseIdForTracker !== null) {
      coursingStore.markCourseServed(activeOrderId, selectedCourseIdForTracker);
    }

    show({
      title: "Items Marked Ready",
      message: "All items in the course have been marked as ready.",
      type: "success",
    });
  };

  // --- Coursing ---
  const coursingStore = useCoursingStore();
  const currentCourse =
    coursingStore.byOrderId[activeOrderId || ""]?.workingCourse ?? 1;
  const { setCurrentCourse } = coursingStore;
  const coursing = coursingStore;
  const prevItemIdsRef = useRef<string[]>([]);

  // Track when coursing data has been loaded from server
  const [coursingInitialized, setCoursingInitialized] = useState(false);

  // Use stable item count and IDs to prevent infinite loops
  const itemCount = activeOrder?.items?.length ?? 0;
  const itemIds = useMemo(
    () => activeOrder?.items?.map((i) => i.id).join(",") ?? "",
    [activeOrder?.items],
  );
  const orderId = activeOrder?.id;

  // Initialize coursing and load from server
  useEffect(() => {
    if (!orderId) {
      setCoursingInitialized(false);
      return;
    }

    // Pass db_order_id for backend RPC calls (use UUID, not local ID)
    coursing.initializeForOrder(orderId, activeOrder?.db_order_id);

    // Defer server load until after interactions complete for smooth transition
    const interaction = InteractionManager.runAfterInteractions(() => {
      // Wait for server data to load before marking as initialized
      // This ensures dbIdToCourseMap is populated before sync effect runs
      coursing
        .loadFromServer(orderId)
        .then(() => {
          setCoursingInitialized(true);
        })
        .catch((error) => {
          console.error("[Coursing] Failed to load from server:", error);
          // Still mark as initialized so UI doesn't block forever
          setCoursingInitialized(true);
        });
    });

    return () => {
      interaction.cancel();
      setCoursingInitialized(false);
    };
  }, [orderId, activeOrder?.db_order_id]);

  // Assign new items to working course
  useEffect(() => {
    if (!orderId || !coursingInitialized) return;

    const currentIds = itemIds.split(",").filter(Boolean);
    const prevIds = prevItemIdsRef.current;

    if (prevIds.length === 0) {
      prevItemIdsRef.current = currentIds;
      return;
    }
    const newIds = currentIds.filter((id) => !prevIds.includes(id));
    if (newIds.length > 0) {
      const state = coursing.getForOrder(orderId);
      const useCourse = state?.workingCourse ?? 1;
      newIds.forEach((id) => {
        const item = activeOrder?.items?.find((i) => i.id === id);
        // Skip if item already has courseNumber from DB sync - don't overwrite it
        if (item?.courseNumber !== undefined && item.courseNumber > 0) {
          // Item already has course from backend - just update local map without changing course
          coursing.setItemCourse(
            orderId,
            id,
            item.courseNumber,
            item?.db_order_item_id,
            true, // Skip backend sync since course is already set there
          );
        } else if (state?.itemCourseMap?.[id] === undefined) {
          // Truly new item without course - assign to working course
          coursing.setItemCourse(
            orderId,
            id,
            useCourse,
            item?.db_order_item_id,
          );
        }
      });
    }
    prevItemIdsRef.current = currentIds;
  }, [orderId, itemIds, coursing, coursingInitialized, activeOrder?.items]);

  // Ref to track which DB items have been synced to coursing backend
  const syncedDbItemsRef = useRef<Set<string>>(new Set());

  // Effect to sync items to backend once they have a DB ID
  const dbItemIdsHash = useMemo(
    () =>
      activeOrder?.items
        ?.map((i) => i.db_order_item_id)
        .filter(Boolean)
        .join(",") ?? "",
    [activeOrder?.items],
  );

  useEffect(() => {
    if (!orderId || !activeOrder?.items || !coursingInitialized) return;

    activeOrder.items.forEach((item) => {
      // If item has a DB ID and hasn't been synced yet
      if (
        item.db_order_item_id &&
        !syncedDbItemsRef.current.has(item.db_order_item_id)
      ) {
        const state = coursing.getForOrder(orderId);

        // Priority for determining course:
        // 1. Item's courseNumber (from backend fetch) - most authoritative
        // 2. Backend's dbIdToCourseMap (from get_order_courses RPC)
        // 3. Local itemCourseMap
        // 4. Working course as fallback
        let course: number;

        if (item.courseNumber !== undefined && item.courseNumber > 0) {
          // Use the course number from the fetched item data (most accurate)
          course = item.courseNumber;
        } else if (
          state?.dbIdToCourseMap?.[item.db_order_item_id] !== undefined
        ) {
          // Use the DB ID mapping from backend
          course = state.dbIdToCourseMap[item.db_order_item_id];
        } else if (state?.itemCourseMap?.[item.id] !== undefined) {
          // Use local mapping if exists
          course = state.itemCourseMap[item.id];
        } else {
          // Fall back to working course
          course = state?.workingCourse ?? 1;
        }

        // Guard: Only sync if the target course is still open
        // If the course is already fired (from backend), don't attempt to re-sync
        const courseStatus = state?.courses?.[course]?.status;
        if (courseStatus && courseStatus !== "open") {
          // Course is already fired - update local map only, skip backend RPC
          coursing.setItemCourse(
            orderId,
            item.id,
            course,
            item.db_order_item_id,
            true,
          );
          syncedDbItemsRef.current.add(item.db_order_item_id);
          return;
        }

        // Sync item course with DB ID (will RPC only if course is open)
        coursing.setItemCourse(
          orderId,
          item.id,
          course,
          item.db_order_item_id,
          false,
        );

        // Mark as synced
        syncedDbItemsRef.current.add(item.db_order_item_id);
      }
    });
  }, [orderId, dbItemIdsHash, coursing, coursingInitialized]); // activeOrder.items is covered by dbItemIdsHash change

  const finalizeCurrentCourse = () => {
    if (!activeOrder) return;
    const nextCourse = coursing.finalizeCurrentCourse(
      activeOrder.id,
      activeOrder.items.map((i) => i.id),
    );
    show({
      title: "Course Finalized",
      message: `Course ${
        nextCourse - 1
      } complete. New items added to Course ${nextCourse}.`,
      type: "success",
    });
  };

  const handleSendCourseToKitchen = async (
    course: number,
    forceResend = false,
  ) => {
    if (!activeOrder) return;

    if (!forceResend && coursing.isCourseSent(activeOrder.id, course)) {
      show({
        title: "Already Sent",
        message: `Course ${course} has already been sent to the kitchen.`,
        type: "warning",
      });
      return;
    }

    const state = coursing.getForOrder(activeOrder.id);
    const itemsInCourse = activeOrder.items.filter(
      (i) => (state?.itemCourseMap?.[i.id] ?? 1) === course,
    );
    if (itemsInCourse.length === 0) {
      show({
        title: "Empty Course",
        message: `There are no items in Course ${course} to send.`,
        type: "warning",
      });
      return;
    }

    if (!activeOrder.opened_at) {
      updateActiveOrderDetails({ opened_at: new Date().toISOString() });
    }

    // Set sent_to_kitchen_at if not already set (required for KDS gate)
    if (!activeOrder.sent_to_kitchen_at) {
      updateActiveOrderDetails({ sent_to_kitchen_at: new Date().toISOString() });
    }

    itemsInCourse.forEach((i) => {
      updateItemStatusInActiveOrder(i.id, "preparing");
    });

    coursing.markCourseSent(activeOrder.id, course);

    if (activeOrder.order_status === "draft") {
      updateOrderStatus(activeOrder.id, "sent_to_kitchen");
    }

    // Sync item statuses to backend for KDS visibility
    const supabase = getOrderStoreSupabaseClient();
    if (supabase && activeOrder.db_order_id) {
      const dbItemIds = itemsInCourse
        .map((i) => i.db_order_item_id)
        .filter((id): id is string => !!id);

      if (dbItemIds.length === 0 && itemsInCourse.length > 0) {
        // Items haven't synced to backend yet — queue for retry
        console.log("[handleSendCourseToKitchen] Items not synced yet, queuing send_to_kitchen");
        queueFailedOperation(
          "send_to_kitchen",
          {
            localOrderId: activeOrder.id,
            localItemIds: itemsInCourse.map((i) => i.id),
          },
          activeOrder.id,
        );
      } else if (dbItemIds.length > 0) {
        OrderService.bulkUpdateOrderItemStatus(supabase, dbItemIds, "sent")
          .then((result) => {
            if (result?.error) {
              console.error("[handleSendCourseToKitchen] Failed to update item statuses:", result.error);
              queueFailedOperation(
                "send_to_kitchen",
                {
                  localOrderId: activeOrder.id,
                  localItemIds: itemsInCourse.map((i) => i.id),
                },
                activeOrder.id,
              );
            }
          })
          .catch((err) => {
            console.error("[handleSendCourseToKitchen] Failed to sync course items:", err);
            queueFailedOperation(
              "send_to_kitchen",
              {
                localOrderId: activeOrder.id,
                localItemIds: itemsInCourse.map((i) => i.id),
              },
              activeOrder.id,
            );
          });
      }
    }

    // Update table session status to "ordered" via backend RPC
    if (currentTableId && table?.session?.id) {
      try {
        await updateSessionStatus(table.session.id, "ordered");
        console.log("Table session status updated to 'ordered'");
      } catch (error) {
        console.error("Failed to update table session status:", error);
      }
    }

    show({
      title: forceResend ? "Course Resent" : "Course Sent",
      message: `Course ${course} has been ${
        forceResend ? "resent" : "sent"
      } for preparation.`,
      type: "success",
    });
  };

  const handleDoubleTapCourse = (course: number) => {
    if (!activeOrder) return;
    const isSent = coursing.isCourseSent(activeOrder.id, course);
    if (isSent) {
      setCourseToResend(course);
    } else {
      handleSendCourseToKitchen(course, false);
    }
  };

  const handleConfirmResend = () => {
    if (courseToResend !== null) {
      handleSendCourseToKitchen(courseToResend, true);
      setCourseToResend(null);
    }
  };

  const handleCloseCheck = async () => {
    if (!activeOrder || !currentTableId) return;

    // Validate order is fully paid
    if (displayBalanceDue > 0.01) {
      show({
        title: "Cannot Close Check",
        message: "Outstanding balance must be $0.00 to close check",
        type: "error",
      });
      return;
    }

    // Validate order has backend ID
    if (!activeOrder.db_order_id) {
      show({
        title: "Cannot Close Check",
        message: "Order must be synced to close check",
        type: "error",
      });
      return;
    }

    try {
      showLoading("Closing check...");

      const supabase = getOrderStoreSupabaseClient();
      const { activeEmployeeId } = useEmployeeStore.getState();

      if (!supabase) {
        throw new Error("Database connection unavailable");
      }

      // Call backend RPC
      const result = await OrderService.closeCheck(
        supabase,
        activeOrder.db_order_id,
        activeEmployeeId,
      );

      if (!result.success) {
        throw new Error(result.error || "Failed to close check");
      }

      // Update local state
      updateActiveOrderDetails({
        check_status: "Closed",
      });

      show({
        title: "Check Closed",
        message: "The check has been finalized. You can now clear the table.",
        type: "success",
      });
    } catch (error: any) {
      console.error("Failed to close check:", error);
      show({
        title: "Failed to Close Check",
        message: error.message || "An error occurred",
        type: "error",
      });
    } finally {
      hideLoading();
    }
  };

  const confirmVoid = async () => {
    if (!activeOrder) return;

    // SET NAVIGATION GUARD FIRST
    isNavigatingAwayRef.current = true;

    try {
      // Call the proper void function
      const dbOrderId = activeOrder.db_order_id;

      if (dbOrderId) {
        const supabase = getOrderStoreSupabaseClient();
        if (supabase) {
          // Deduct inventory BEFORE voiding (items already consumed/wasted)
          const deductResult =
            await InventoryService.processOrderInventoryDeduction(
              supabase,
              dbOrderId,
            );
          if (!deductResult.success) {
            console.warn(
              "[confirmVoid] Inventory deduction failed, proceeding with void",
            );
          }

          // Also update local inventory store
          if (activeOrder.items?.length > 0) {
            useInventoryStore
              .getState()
              .decrementStockFromSale(activeOrder.items);
          }

          const { error } = await supabase.rpc("void_order", {
            p_order_id: dbOrderId,
            p_void_reason: "Order voided by staff",
          });

          if (error) {
            console.error("[confirmVoid] RPC error:", error);
            isNavigatingAwayRef.current = false; // Reset on error
            show({
              title: "Void Failed",
              message: error.message,
              type: "error",
            });
            return;
          }
        }
      }

      // Update local state
      updateOrderStatus(activeOrder.id, "void");

      // Clear active order BEFORE navigating
      setActiveOrder(null);

      setVoidConfirmOpen(false);

      show({
        title: "Check Voided",
        message:
          "The order has been successfully voided. Table marked for cleaning.",
        type: "success",
      });

      // Use replace instead of back to prevent re-entry
      router.replace("/tables");
    } catch (error) {
      console.error("[confirmVoid] Error:", error);
      isNavigatingAwayRef.current = false; // Reset on error
      show({
        title: "Void Failed",
        message: "An unexpected error occurred.",
        type: "error",
      });
    }
  };

  // Extracted clearing logic for reuse
  // Note: archiveOrder now handles inventory deduction automatically (local + backend)
  const doClearTable = async () => {
    if (!activeOrderId || !activeOrder) return;
    showLoading("Clearing table...");
    isNavigatingAwayRef.current = true;

    if (table?.session?.id) {
      await updateSessionStatus(table.session.id, "cleaning");
      // await unmergeTable(table.session.id, tableId as string);
    }

    archiveOrder(activeOrderId);
    setActiveOrder(null);

    hideLoading();
    router.replace("/tables");

    show({
      title: "Table Cleared",
      message: "Table marked for cleaning.",
      type: "success",
    });
  };

  const handleClearTable = async () => {
    if (!activeOrderId || !activeOrder) return;

    const preparingItems = activeOrder.items.filter(
      (item) =>
        (item.item_status || "preparing") !== "ready" &&
        item.item_status !== "served",
    );

    if (preparingItems.length > 0) {
      // Show alert with items list and "Proceed Anyway" option
      setNotReadyItems(
        preparingItems.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
        })),
      );
      setClearNotReadyConfirmOpen(true);
      return;
    }

    // All items ready, proceed with clearing
    await doClearTable();
  };

  const checkOrderClosedAndWarn = () => {
    // LOCAL-FIRST: Block item additions if order is fully paid OR check is closed
    // This ensures menu is blocked immediately after payment without waiting for backend sync
    if (isFullyPaid || activeOrder?.check_status === "Closed") {
      setOrderClosedWarningOpen(true);
      return true;
    }
    return false;
  };

  // Memoized sentCourses to prevent recreation on every render
  const sentCourses = useMemo(() => {
    const courseData = coursing.getForOrder(activeOrder?.id || "");
    const sentMap: Record<number, boolean> = {};
    if (courseData?.courses) {
      Object.entries(courseData.courses).forEach(([num, info]) => {
        sentMap[Number(num)] = info.status !== "open";
      });
    }
    return sentMap;
  }, [
    activeOrder?.id,
    coursingStore.byOrderId[activeOrder?.id || ""]?.courses,
  ]);

  // Memoized items for selected course to prevent recreation on every render
  const itemsInSelectedCourse = useMemo(() => {
    if (!activeOrder || selectedCourseIdForTracker === null) return [];
    const courseMap = coursing.getForOrder(activeOrder.id)?.itemCourseMap;
    return activeOrder.items.filter(
      (item) => (courseMap?.[item.id] ?? 1) === selectedCourseIdForTracker,
    );
  }, [
    activeOrder?.items,
    activeOrder?.id,
    selectedCourseIdForTracker,
    coursingStore.byOrderId[activeOrder?.id || ""]?.itemCourseMap,
  ]);

  // Show skeleton during initial load for smooth transition
  if (isInitializing) {
    return <TableDetailSkeleton />;
  }

  if (!table) {
    return (
      <View className="flex-1 items-center justify-center bg-[#212121]">
        <Text className="text-xl font-bold text-red-400">Table not found!</Text>
      </View>
    );
  }

  const handleProceedToPayment = () => {
    pricingSheetRef.current?.close();
    handlePay();
  };

  return (
    <View className="flex-1 bg-[#212121]">
      <Stack.Screen
        options={{
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => {
                // FIXED: Navigation Loop
                // Use replace() instead of back() to prevent traversing through
                // multiple history states of the same table (caused by updates).
                // This ensures we always Exit to the parent screen.
                if (source) {
                  router.replace(source as any);
                } else {
                  router.replace("/tables");
                }
              }}
              className="flex-row items-center -ml-2 p-2"
            >
              <ChevronLeft color="#FFFFFF" size={26} />
              <Text className="text-white text-lg font-medium ml-1">Back</Text>
            </TouchableOpacity>
          ),
          headerStyle: { backgroundColor: "#212121" },
          headerShadowVisible: false,
          headerTitle: "",
          headerTintColor: "#FFFFFF",
        }}
      />
      {isOvertime && (
        <View className="p-2 bg-yellow-500 items-center">
          <Text className="text-base font-bold text-yellow-900">
            This table has exceeded the default sitting time of{" "}
            {defaultSittingTimeMinutes} minutes.
          </Text>
        </View>
      )}
      {/* --- Customer Info Section (Top) --- */}
      <View className="px-2 mt-2">
        <OrderInfoHeader duration={duration} tableId={currentTableId} />
      </View>

      <View className="flex-1 flex-row ">
        <TableBillSection
          showOrderDetails={false}
          itemCourseMap={
            coursing.getForOrder(activeOrder?.id || "")?.itemCourseMap
          }
          sentCourses={sentCourses}
          currentCourse={currentCourse}
          onSelectCourse={(courseId: number | null) => {
            setSelectedCourseIdForTracker(courseId);
            if (activeOrder && courseId !== null) {
              coursing.setCurrentCourse(activeOrder.id, courseId);
            }
          }}
          setCurrentCourse={(course) => {
            if (activeOrder?.id) {
              setCurrentCourse(activeOrder.id, course);
            }
          }}
          onDoubleTapCourse={handleDoubleTapCourse}
          activeOrder={activeOrder}
          onPressMore={() => moreOptionsSheetRef.current?.expand()}
          onPressTotal={() => pricingSheetRef.current?.expand()}
          onPressReopenCheck={handleReopenCheck}
          onPressCloseCheck={handleCloseCheck}
          onPressClearTable={handleClearTable}
          totalDisplayAmount={displayBalanceDue}
          pricingSheetRef={
            pricingSheetRef as React.RefObject<BottomSheetMethods>
          }
          onClosePricingSheet={() => pricingSheetRef.current?.close()}
          onPressProceedToPayment={handleProceedToPayment}
          onPressStartNewCourse={finalizeCurrentCourse}
          isFullyPaid={isFullyPaid}
        />
        <View className="flex-1 p-4 px-3 pt-0">
          {(() => {
            const coursingState = coursing.getForOrder(activeOrder?.id || "");
            const workingCourse = coursingState?.workingCourse ?? 1;
            const isCurrentCourseSent = coursing.isCourseSent(
              activeOrder?.id || "",
              workingCourse,
            );

            if (isCurrentCourseSent) {
              return (
                <View className="flex-1 justify-center items-center">
                  <TouchableOpacity
                    onPress={finalizeCurrentCourse}
                    className="px-4 py-2 rounded-lg bg-green-600 border border-green-500"
                    activeOpacity={0.8}
                  >
                    <Text className="font-semibold text-white text-base">
                      ✨ Start New Course
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            } else {
              return (
                <MenuSection
                  onOrderClosedCheck={checkOrderClosedAndWarn}
                  isTableOrder={true}
                />
              );
            }
          })()}
        </View>
      </View>

      {selectedCourseIdForTracker !== null && (
        <ItemProgressTracker
          selectedCourse={selectedCourseIdForTracker}
          itemsInSelectedCourse={itemsInSelectedCourse}
          isModifierSidebarOpen={isModifierSidebarOpen}
          onMarkAllReady={handleMarkAllReadyForCourse}
          isCourseSent={coursing.isCourseSent(
            activeOrder?.id || "",
            selectedCourseIdForTracker,
          )}
        />
      )}

      <MoreOptionsBottomSheet
        ref={moreOptionsSheetRef}
        onVoidSuccess={async () => {
          // CRITICAL: Set this FIRST to prevent auto-session creation
          isNavigatingAwayRef.current = true;

          // Update local state
          updateOrderStatus(activeOrder?.id || "", "void");

          // Clear the table session immediately
          await clearTableSession(currentTableId);

          // Clear active order BEFORE navigating
          setActiveOrder(null);

          setVoidConfirmOpen(false);

          show({
            title: "Check Voided",
            message:
              "The order has been successfully voided. Table is now available.",
            type: "success",
          });

          // Use replace instead of back to prevent re-entry
          router.replace("/tables");
        }}
        discountSheetRef={
          discountSheetRef as React.RefObject<BottomSheetMethods>
        }
        onCloseCheck={handleCloseCheck}
      />
      
      <DiscountBottomSheet
        ref={discountSheetRef}
        onClose={() => discountSheetRef.current?.close()}
      />

      <AlertDialog
        open={isNotReadyConfirmOpen}
        onOpenChange={setNotReadyConfirmOpen}
      >
        <AlertDialogContent className="w-[450px] p-5 rounded-2xl bg-[#1C1C1E] border border-[#333333]">
          {/* Warning Icon */}
          <View className="items-center mb-4">
            <View className="w-16 h-16 rounded-full bg-amber-500/20 items-center justify-center">
              <AlertTriangle size={32} color="#f59e0b" />
            </View>
          </View>

          {/* Title */}
          <Text className="text-xl font-bold text-white text-center mb-2">
            Items Still Preparing
          </Text>

          {/* Item Count */}
          <Text className="text-sm text-gray-400 text-center mb-3">
            {notReadyItems.length} item{notReadyItems.length !== 1 ? "s" : ""}{" "}
            not ready yet:
          </Text>

          {/* Item List */}
          <ScrollView
            className="max-h-32 mb-4 bg-[#252528] rounded-xl p-3"
            showsVerticalScrollIndicator={false}
          >
            {notReadyItems.map((item) => (
              <View key={item.id} className="flex-row items-center py-1">
                <Text className="text-amber-400 mr-2">•</Text>
                <Text className="text-gray-300 text-sm">
                  {item.quantity}x {item.name}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Question */}
          <Text className="text-sm text-gray-400 text-center mb-4">
            Proceed to payment anyway?
          </Text>

          {/* Buttons */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => setNotReadyConfirmOpen(false)}
              className="flex-1 py-3 rounded-xl items-center"
            >
              <Text className="font-semibold text-gray-400 text-base">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setNotReadyConfirmOpen(false);
                pricingSheetRef.current?.close();
                openPaymentSheet(
                  "Card",
                  currentTableId,
                  "payment-method-selection",
                );
              }}
              className="flex-1 py-3 bg-amber-600 rounded-xl items-center"
            >
              <Text className="font-semibold text-white text-base">
                Pay Anyway
              </Text>
            </TouchableOpacity>
          </View>
        </AlertDialogContent>
      </AlertDialog>

      {/* Clear Table - Items Not Ready Alert */}
      <AlertDialog
        open={isClearNotReadyConfirmOpen}
        onOpenChange={setClearNotReadyConfirmOpen}
      >
        <AlertDialogContent className="w-[450px] p-5 rounded-2xl bg-[#1C1C1E] border border-[#333333]">
          {/* Warning Icon */}
          <View className="items-center mb-4">
            <View className="w-16 h-16 rounded-full bg-amber-500/20 items-center justify-center">
              <AlertTriangle size={32} color="#f59e0b" />
            </View>
          </View>

          {/* Title */}
          <Text className="text-xl font-bold text-white text-center mb-2">
            Items Still Preparing
          </Text>

          {/* Item Count */}
          <Text className="text-sm text-gray-400 text-center mb-3">
            {notReadyItems.length} item{notReadyItems.length !== 1 ? "s" : ""}{" "}
            not ready yet:
          </Text>

          {/* Item List */}
          <ScrollView
            className="max-h-32 mb-4 bg-[#252528] rounded-xl p-3"
            showsVerticalScrollIndicator={false}
          >
            {notReadyItems.map((item) => (
              <View key={item.id} className="flex-row items-center py-1">
                <Text className="text-amber-400 mr-2">•</Text>
                <Text className="text-gray-300 text-sm">
                  {item.quantity}x {item.name}
                </Text>
              </View>
            ))}
          </ScrollView>

          {/* Question */}
          <Text className="text-sm text-gray-400 text-center mb-4">
            Proceed to clear table anyway?
          </Text>

          {/* Buttons */}
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => setClearNotReadyConfirmOpen(false)}
              className="flex-1 py-3 rounded-xl items-center"
            >
              <Text className="font-semibold text-gray-400 text-base">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={async () => {
                setClearNotReadyConfirmOpen(false);
                await doClearTable();
              }}
              className="flex-1 py-3 bg-amber-600 rounded-xl items-center"
            >
              <Text className="font-semibold text-white text-base">
                Clear Anyway
              </Text>
            </TouchableOpacity>
          </View>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={isVoidConfirmOpen} onOpenChange={setVoidConfirmOpen}>
        <AlertDialogContent className="w-[450px] p-4 rounded-2xl bg-[#303030]">
          <Text className="text-lg font-bold text-white mb-2">Void check?</Text>
          <Text className="text-sm text-gray-400 mb-4">
            No payment has been made. Do you want to void this check?
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => setVoidConfirmOpen(false)}
              className="flex-1 py-2 border border-gray-600 rounded-lg items-center bg-[#212121]"
            >
              <Text className="font-semibold text-white text-base">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmVoid}
              className="flex-1 py-2 bg-red-500 rounded-lg items-center"
            >
              <Text className="font-semibold text-white text-base">
                Void Check
              </Text>
            </TouchableOpacity>
          </View>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={isOrderClosedWarningOpen}
        onOpenChange={setOrderClosedWarningOpen}
      >
        <AlertDialogContent className="w-[450px] p-4 rounded-2xl bg-[#303030]">
          <Text className="text-lg font-bold text-white mb-2">
            Order is Closed
          </Text>
          <Text className="text-sm text-gray-400 mb-4">
            This order is currently closed. Please reopen the check to add
            items.
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => setOrderClosedWarningOpen(false)}
              className="flex-1 py-2 bg-blue-500 rounded-lg items-center"
            >
              <Text className="font-semibold text-white text-base">OK</Text>
            </TouchableOpacity>
          </View>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={courseToResend !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) setCourseToResend(null);
        }}
      >
        <AlertDialogContent className="w-[450px] p-4 rounded-2xl bg-[#303030]">
          <Text className="text-lg font-bold text-white mb-2">
            Resend Course {courseToResend}?
          </Text>
          <Text className="text-sm text-gray-400 mb-4">
            Are you sure you want to send Course {courseToResend} to the kitchen
            again?
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => setCourseToResend(null)}
              className="flex-1 py-2 border border-gray-600 rounded-lg items-center bg-[#212121]"
            >
              <Text className="font-semibold text-white text-base">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirmResend}
              className="flex-1 py-2 bg-blue-500 rounded-lg items-center"
            >
              <Text className="font-semibold text-white text-base">Resend</Text>
            </TouchableOpacity>
          </View>
        </AlertDialogContent>
      </AlertDialog>

      {/* Reopen Check Confirmation Modal */}
      <ConfirmationModal
        isOpen={isReopenModalOpen}
        onClose={() => setReopenModalOpen(false)}
        onConfirm={handleConfirmReopen}
        title="Reopen Check?"
        description="Are you sure you want to reopen this closed check? This will allow adding new items."
        confirmText="Reopen"
        variant="default"
      />
    </View>
  );
};

export default UpdateTableScreen;
