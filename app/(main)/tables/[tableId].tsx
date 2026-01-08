import DiscountBottomSheet from "@/components/bill/DiscountBottomSheet";
import ItemProgressTracker from "@/components/bill/ItemProgressTracker";
import MoreOptionsBottomSheet from "@/components/bill/MoreOptionsBottomSheet";
import TableBillSection from "@/components/bill/TableBillSection";
import MenuSection from "@/components/menu/MenuSection";
import OrderInfoHeader from "@/components/tables/OrderInfoHeader";
import TableDetailSkeleton from "@/components/tables/TableDetailSkeleton";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { useLoading } from "@/contexts/LoadingContext";
import { useToast } from "@/contexts/ToastContext";
import { OrderProfile } from "@/lib/types";
import { OrderService } from "@/services/orderService";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import {
  getOrderStoreSupabaseClient,
  useOrderStore,
} from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertTriangle } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const UpdateTableScreen = () => {
  const { defaultSittingTimeMinutes } = useSettingsStore();
  const [duration, setDuration] = useState("");
  const [isOvertime, setIsOvertime] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const isNavigatingAwayRef = useRef(false);
  const hasInitializedRef = useRef(false);
  const wasPaymentSheetOpenRef = useRef(false);
  const isAutoSessionRunningRef = useRef(false); // Prevent re-entry during async operations

  const router = useRouter();
  const { tableId } = useLocalSearchParams();
  const isModifierSidebarOpen = useModifierSidebarStore(
    (state) => state.isOpen
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

  const pricingSheetRef = useRef<BottomSheetMethods>(null);
  const moreOptionsSheetRef = useRef<BottomSheetMethods>(null);
  const discountSheetRef = useRef<BottomSheetMethods>(null);

  const {
    // tables,
    updateSessionStatus,
    loadFloorPlanStatus,
    // unmergeTable,
    getTableById,
    clearTableSession,
  } = useFloorPlanStore();

  const {
    // OPTIMIZED: Removed deprecated `orders` array - use ordersById selectors instead
    setActiveOrder,
    startNewOrder,
    assignOrderToTable,
    updateOrderStatus,
    updateActiveOrderDetails,
    updateItemStatusInActiveOrder,
    syncOrderStatus,
    archiveOrder,
    syncOrderFromDatabase
  } = useOrderStore();

  const {
    setActiveTableId,
    clearActiveTableId,
    open: openPaymentSheet,
    isOpen: isPaymentSheetOpen,
  } = usePaymentStore();

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
  const activeOrder = useOrderStore((state) => {
    if (sessionOrderId) {
      // First try direct lookup by local ID
      if (state.ordersById[sessionOrderId]) {
        return state.ordersById[sessionOrderId];
      }
      // Fallback: Find by db_order_id
      const orderByDbId = Object.values(state.ordersById).find(
        (order) => order.db_order_id === sessionOrderId
      );
      if (orderByDbId) return orderByDbId;
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
    (state) => state.activeOrderOutstandingTotal
  );
  const storeActiveOrderTotal = useOrderStore(
    (state) => state.activeOrderTotal
  );
  console.log('[activeOrder] activeOrder Items', activeOrder?.items.length, activeOrder?.items);
  // --- Derived helpers ---
  const hasAnyItems = !!activeOrder && activeOrder.items?.length > 0;
  const hasPayments = !!activeOrder && (activeOrder.payments?.length || 0) > 0;

  // Calculate the amount to display on the Pay button
  // NO useMemo - calculate fresh every render to avoid caching stale values
  // Priority: backend amount_due > calculated outstanding total > total
  let displayBalanceDue: number;
  // console.log('[activeOrder] activeOrder', activeOrder);
  if (activeOrder?.amount_due !== undefined && activeOrder.amount_due >= 0) {
    // 1. Use backend's authoritative amount_due if available
    displayBalanceDue = activeOrder.amount_due;
  } else if (
    activeOrder?.payments &&
    activeOrder.payments.length > 0 &&
    storeActiveOrderOutstandingTotal > 0
  ) {
    // 2. Use calculated outstanding total if there are payments
    displayBalanceDue = storeActiveOrderOutstandingTotal;
  } else {
    // 3. Fall back to full order total for new orders
    displayBalanceDue = storeActiveOrderTotal;
  }


  // Check if order is fully paid
  const isFullyPaid = useMemo(() => {
    return (
      activeOrder?.paid_status === "Paid" ||
      (hasPayments && displayBalanceDue <= 0)
    );
  }, [activeOrder?.paid_status, hasPayments, displayBalanceDue]);

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
      setIsOvertime(diffMins > defaultSittingTimeMinutes);
    };

    updateDuration(); // Run immediately

    const timer = setInterval(updateDuration, 60000);
    return () => clearInterval(timer);
  }, [tableStatus, activeOrder?.opened_at, defaultSittingTimeMinutes]);

  useEffect(() => {
    if (tableStatus === "cleaning") {
      router.push("/tables");
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
      // Small delay to ensure smooth transition
      const timer = setTimeout(() => {
        setIsInitializing(false);
      }, 100);
      return () => clearTimeout(timer);
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

  // --- Sync order from database after payment sheet closes ---
  useEffect(() => {
    // Detect when payment sheet closes (was open -> now closed)
    if (wasPaymentSheetOpenRef.current && !isPaymentSheetOpen) {
      console.log("[Payment] Sheet closed. Syncing order from database...");

      // Add delay to allow backend to process payment before syncing
      // This prevents race condition where stale amount_due overwrites local calculations
      const orderId = activeOrder?.id;
      if (orderId) {
        setTimeout(() => {
          syncOrderFromDatabase(orderId);
        }, 500);
      }
    }

    // Update ref
    wasPaymentSheetOpenRef.current = isPaymentSheetOpen;
  }, [isPaymentSheetOpen, currentTableId, loadFloorPlanStatus, activeOrder?.id]);

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
      // Double-check navigation guard (async timing)
      if (isNavigatingAwayRef.current) {
        console.log("[AutoSession] Skipping async - navigating away");
        return;
      }

      // Set running flag to prevent re-entry
      isAutoSessionRunningRef.current = true;

      try {
        // OPTIMIZED: Check if we already have session data before fetching
        // This prevents unnecessary network call when data is already fresh (e.g., after prefetch)
        const currentTable = getTableById(currentTableId);
        const hasExistingSession = currentTable?.session?.status && currentTable.session.status !== "available";

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
      console.log("  existingOrderForTable:", existingOrderForTable?.id);

      if (!currentTableId || !updatedTable) return;

      // Case 1: Session exists with an order
      if (updatedTable.session?.order_id) {
        // Use getState() for fresh data instead of stale orders array
        const currentOrders = Object.values(useOrderStore.getState().ordersById);
        const foundOrder = currentOrders.find(
          (o) =>
            o.id === updatedTable.session!.order_id ||
            o.db_order_id === updatedTable.session!.order_id
        );

        if (foundOrder) {
          if (activeOrderId !== foundOrder.id) {
            console.log(
              "[AutoSession] Found existing order, setting active:",
              foundOrder.id
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
              "[AutoSession] Skipping fetch - table being cleared or navigating"
            );
            return;
          }

          console.log(
            "[AutoSession] Fetching missing order:",
            updatedTable.session.order_id
          );
          showLoading("Restoring table session...");

          const supabase = getOrderStoreSupabaseClient();
          if (supabase) {
            const { data: fetchedOrder, error } =
              await OrderService.fetchOrderById(
                supabase,
                updatedTable.session.order_id
              );

            hideLoading();

            // Check again after async operation
            if (isNavigatingAwayRef.current) {
              console.log(
                "[AutoSession] Skipping order restore - navigated away"
              );
              return;
            }

            if (fetchedOrder && !error) {
              console.log("Fetched order from backend:", fetchedOrder.id);
              // Transform to local OrderProfile
              const newOrderProfile: OrderProfile = {
                id: `order_${Date.now()}`, // Local ID
                db_order_id: fetchedOrder.id,
                service_location_id: currentTableId,
                order_status: (fetchedOrder.status as any) || "preparing",
                check_status:
                  fetchedOrder.status === "completed" ? "Closed" : "Opened",
                paid_status:
                  (fetchedOrder.payment_status as string) === "paid" // Cast to string to avoid overlap error with strict Enum
                    ? ("Paid" as const)
                    : ("Unpaid" as const),
                order_type: "Dine In",
                items:
                  (fetchedOrder as any).order_items?.map((item: any) => {
                    // Determine proper item status - default to "preparing" for items that can be marked ready
                    // Only use "ordered" if explicitly set from backend, otherwise "preparing"
                    const itemStatus = item.status === "ready" || item.status === "served"
                      ? item.status
                      : item.status === "ordered"
                        ? "preparing" // Upgrade "ordered" to "preparing" so items can be marked ready
                        : "preparing"; // Default to preparing for null/undefined

                    return {
                      id: `item_${Date.now()}_${Math.random()}`, // New local ID
                      isDraft: false,
                      menuItemId: item.menu_item_id,
                      name: item.item_name,
                      price: item.unit_price,
                      cashPrice: item.cash_price,
                      originalPrice: item.unit_price,
                      quantity: item.quantity,
                      paidQuantity: item.paid_quantity || 0,
                      db_order_item_id: item.id,
                      courseNumber: item.course_number || 1, // Include course number from backend
                      item_status: itemStatus,
                      kitchen_status: itemStatus,
                      is_voided: item.is_voided || false,
                      customizations: {
                        notes: item.special_instructions,
                        modifiers: [],
                      },
                    };
                  }) || [],
                payments: [],
                opened_at: fetchedOrder.created_at,
                // Include payment-related fields
                amount_due: (fetchedOrder as any).amount_due,
                cash_amount_due: (fetchedOrder as any).cash_amount_due,
                amount_paid: (fetchedOrder as any).amount_paid,
              };

              // Inject into store
              useOrderStore.setState((state) => ({
                ordersById: {
                  ...state.ordersById,
                  [newOrderProfile.id]: newOrderProfile,
                },
                orderIds: [...state.orderIds, newOrderProfile.id],
              }));
              setActiveOrder(newOrderProfile.id);
            }
          } else {
            hideLoading();
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
          currentTableId
        );
        showLoading("Creating session...");

        try {
          // For fallback cases (direct URL navigation), try to use existing local order's guest count
          // Use getState() for fresh data instead of stale orders array
          const currentOrders = Object.values(useOrderStore.getState().ordersById);
          const existingLocalOrder = currentOrders.find(
            (o) => o.service_location_id === currentTableId
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
            orderId
          );

          // Only set active if we haven't navigated away
          if (!isNavigatingAwayRef.current) {
            setActiveOrder(orderId || null);
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
      router.push("/tables");
    } else if (activeOrderId && currentTableId && !table?.session?.id) {
      // Fallback if no session exists - this might be an issue with data sync or flow
      // Ideally should create a session first or use an existing one.
      // Assuming session creation happens on seating.
      console.warn("Cannot assign order: Table has no session");
      // Try to assign anyway for Order behavior
      assignOrderToTable(activeOrderId, currentTableId);
      router.push("/tables");
    }
  };

  const handlePay = () => {
    // Use activeOrder directly (already subscribed reactively)
    const order = activeOrder;
    if (order) {
      const preparingItems = order.items.filter(
        (i) => (i.item_status || "preparing") !== "ready"
      );
      if (preparingItems.length > 0) {
        setNotReadyItems(
          preparingItems.map((i) => ({
            id: i.id,
            name: i.name,
            quantity: i.quantity,
          }))
        );
        setNotReadyConfirmOpen(true);
        return;
      }
    }
    openPaymentSheet("Card", currentTableId, "payment-method-selection");
  };

  const handleReopenCheck = () => {
    if (!activeOrderId) return;
    // Mark as pending to allow adding new items and reopen the order
    updateActiveOrderDetails({
      paid_status: "Pending",
      check_status: "Opened",
      order_status: "preparing",
    });

    // Sync order status based on existing items
    syncOrderStatus(activeOrderId);

    show({
      title: "Check Reopened",
      message: "You can now add new items to the order.",
      type: "success",
    });
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
    [activeOrder?.items]
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

    // Wait for server data to load before marking as initialized
    // This ensures dbIdToCourseMap is populated before sync effect runs
    coursing.loadFromServer(orderId)
      .then(() => {
        setCoursingInitialized(true);
      })
      .catch((error) => {
        console.error("[Coursing] Failed to load from server:", error);
        // Still mark as initialized so UI doesn't block forever
        setCoursingInitialized(true);
      });

    return () => {
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
        if (state?.itemCourseMap?.[id] === undefined) {
          const item = activeOrder?.items?.find((i) => i.id === id);
          coursing.setItemCourse(
            orderId,
            id,
            useCourse,
            item?.db_order_item_id
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
    [activeOrder?.items]
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
        } else if (state?.dbIdToCourseMap?.[item.db_order_item_id] !== undefined) {
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
          coursing.setItemCourse(orderId, item.id, course, item.db_order_item_id, true);
          syncedDbItemsRef.current.add(item.db_order_item_id);
          return;
        }

        // Sync item course with DB ID (will RPC only if course is open)
        coursing.setItemCourse(orderId, item.id, course, item.db_order_item_id, false);

        // Mark as synced
        syncedDbItemsRef.current.add(item.db_order_item_id);
      }
    });
  }, [orderId, dbItemIdsHash, coursing, coursingInitialized]); // activeOrder.items is covered by dbItemIdsHash change

  const finalizeCurrentCourse = () => {
    if (!activeOrder) return;
    const nextCourse = coursing.finalizeCurrentCourse(
      activeOrder.id,
      activeOrder.items.map((i) => i.id)
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
    forceResend = false
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
      (i) => (state?.itemCourseMap?.[i.id] ?? 1) === course
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

    itemsInCourse.forEach((i) => {
      updateItemStatusInActiveOrder(i.id, "preparing");
    });

    coursing.markCourseSent(activeOrder.id, course);

    if (activeOrder.order_status === "draft") {
      updateOrderStatus(activeOrder.id, "preparing");
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
    if (activeOrder.paid_status === "Paid") {
      await handleClearTable();
      return;
    }
    if ((!hasPayments && hasAnyItems) || existingOrderForTable?.db_order_id) {
      setVoidConfirmOpen(true);
      return;
    }

    updateOrderStatus(activeOrder.id, "completed");
    if (table?.session?.id) {
      await updateSessionStatus(table.session.id, "cleaning");
    }
    router.back();
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
  const doClearTable = async () => {
    if (!activeOrderId) return;
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
        item.item_status !== "served"
    );

    if (preparingItems.length > 0) {
      // Show alert with items list and "Proceed Anyway" option
      setNotReadyItems(
        preparingItems.map((i) => ({
          id: i.id,
          name: i.name,
          quantity: i.quantity,
        }))
      );
      setClearNotReadyConfirmOpen(true);
      return;
    }

    // All items ready, proceed with clearing
    await doClearTable();
  };

  const checkOrderClosedAndWarn = () => {
    if (activeOrder?.check_status === "Closed") {
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
  }, [activeOrder?.id, coursingStore.byOrderId[activeOrder?.id || ""]?.courses]);

  // Memoized items for selected course to prevent recreation on every render
  const itemsInSelectedCourse = useMemo(() => {
    if (!activeOrder || selectedCourseIdForTracker === null) return [];
    const courseMap = coursing.getForOrder(activeOrder.id)?.itemCourseMap;
    return activeOrder.items.filter(
      (item) => (courseMap?.[item.id] ?? 1) === selectedCourseIdForTracker
    );
  }, [activeOrder?.items, activeOrder?.id, selectedCourseIdForTracker, coursingStore.byOrderId[activeOrder?.id || ""]?.itemCourseMap]);

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
        <OrderInfoHeader duration={duration} />
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
        />
        <View className="flex-1 p-4 px-3 pt-0">
          {(() => {
            const coursingState = coursing.getForOrder(activeOrder?.id || "");
            const workingCourse = coursingState?.workingCourse ?? 1;
            const isCurrentCourseSent = coursing.isCourseSent(
              activeOrder?.id || "",
              workingCourse
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
                <MenuSection onOrderClosedCheck={checkOrderClosedAndWarn} />
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
            selectedCourseIdForTracker
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
                  "payment-method-selection"
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
    </View>
  );
};

export default UpdateTableScreen;


