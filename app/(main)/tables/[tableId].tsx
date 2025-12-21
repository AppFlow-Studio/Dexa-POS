// /(main)/tables/[tableId].tsx
import DiscountBottomSheet from "@/components/bill/DiscountBottomSheet";
import ItemProgressTracker from "@/components/bill/ItemProgressTracker";
import MoreOptionsBottomSheet from "@/components/bill/MoreOptionsBottomSheet";
import TableBillSection from "@/components/bill/TableBillSection";
import MenuSection from "@/components/menu/MenuSection";
import OrderInfoHeader from "@/components/tables/OrderInfoHeader";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { useLoading } from "@/contexts/LoadingContext";
import { useToast } from "@/contexts/ToastContext";
import { OrderProfile } from "@/lib/types";
import { OrderService } from "@/services/orderService";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
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
  const isNavigatingAwayRef = useRef(false);
  const hasInitializedRef = useRef(false);

  const router = useRouter();
  const { tableId } = useLocalSearchParams();
  const { show } = useToast();
  const { showLoading, hideLoading } = useLoading();

  const [isNotReadyConfirmOpen, setNotReadyConfirmOpen] = useState(false);
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

  const { tables, updateSessionStatus, loadFloorPlanStatus } =
    useFloorPlanStore();

  const {
    orders,
    activeOrderId,
    activeOrderTotal,
    setActiveOrder,
    startNewOrder,
    assignOrderToTable,
    updateOrderStatus,
    updateActiveOrderDetails,
    updateItemStatusInActiveOrder,
    syncOrderStatus,
    archiveOrder,
  } = useOrderStore();

  const {
    setActiveTableId,
    clearActiveTableId,
    open: openPaymentSheet,
  } = usePaymentStore();

  const currentTableId = typeof tableId === "string" ? tableId : "";
  const initialTable = tables.find((t) => t.id === currentTableId);
  // Logic to find primary table if this is a merged table
  // In the new system, tables are merged via session.merged_tables or similar logic
  // For now, we rely on the implementation where tables have a session
  const table = initialTable;

  const tableStatus = table?.session?.status || "available";

  // Find if an order is ALREADY assigned to this table (including closed orders)
  // Memoized to prevent infinite loop - only recalculates when orders array or currentTableId changes
  // STRICT SYNC: Only return an order if it matches the active session.
  // If no session exists, we pretend no order exists so we can auto-create one.
  const existingOrderForTable = useMemo(() => {
    if (table?.session?.order_id) {
      return orders.find(
        (o) =>
          o.db_order_id === table.session!.order_id ||
          o.id === table.session!.order_id
      );
    }
    return undefined;
  }, [orders, table?.session?.order_id]);
  const activeOrder = existingOrderForTable ? existingOrderForTable : orders.find((o) => o.id === activeOrderId);

  // --- Derived helpers ---
  const hasAnyItems = !!activeOrder && activeOrder.items?.length > 0;
  const hasPayments = !!activeOrder && (activeOrder.payments?.length || 0) > 0;

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
  const existingOrderId = existingOrderForTable?.id;

  useEffect(() => {
    if (existingOrderId) {
      // If we navigated to a table that's already in use, make its order active.
      setActiveOrder(existingOrderId);
    }
    return () => setActiveOrder(null);
  }, [currentTableId, existingOrderId, setActiveOrder]);

  useEffect(() => {
    if (currentTableId) {
      setActiveTableId(currentTableId);
    }

    return () => {
      clearActiveTableId();
    };
  }, [currentTableId]);

  // // --- Auto-Session & Order Sync Logic ---
  // useEffect(() => {
  //   loadFloorPlanStatus();
  //   const handleAutoCreateSession = async () => {
  //     console.log("handleAutoCreateSession");
  //     console.log("currentTableId", currentTableId);
  //     console.log("table", table);
  //     console.log("tableStatus", tableStatus);
  //     console.log("existingOrderForTable", existingOrderForTable);

  //     console.log(
  //       "existingOrderForTable",
  //       existingOrderForTable ? existingOrderForTable.id : "null"
  //     );

  //     if (!currentTableId || !table) return;

  //     // Case 1: Session exists, but local order sync might be missing activeOrderId
  //     if (table.session?.order_id) {
  //       // If we found the order locally, good. If not, we might need to fetch it (future/real sync).
  //       // Check both local ID and db_order_id because session usually has the UUID
  //       const foundOrder = orders.find(
  //         (o) =>
  //           o.id === table.session!.order_id ||
  //           o.db_order_id === table.session!.order_id
  //       );
  //       if (foundOrder) {
  //         if (activeOrderId !== foundOrder.id) {
  //           console.log(
  //             "Found existing local order for session. Setting active.",
  //             foundOrder.id
  //           );
  //           setActiveOrder(foundOrder.id);
  //         }
  //       } else {
  //         // Don't fetch order if table is being cleared/cleaned
  //         if (tableStatus === "cleaning" || tableStatus === "available") {
  //           console.log("Skipping order fetch for cleared/available table");
  //           return;
  //         }

  //         console.log(
  //           "Fetching missing order from backend:",
  //           table.session.order_id
  //         );

  //         showLoading("Restoring table session...");

  //         const supabase = getOrderStoreSupabaseClient();
  //         if (!supabase) {
  //           hideLoading();
  //         }
  //         if (supabase) {
  //           const { data: fetchedOrder, error } =
  //             await OrderService.fetchOrderById(
  //               supabase,
  //               table.session.order_id
  //             );

  //           hideLoading(); // Hide immediately after fetch

  //           if (fetchedOrder && !error) {
  //             console.log("Fetched order from backend:", fetchedOrder.id);
  //             // Transform to local OrderProfile
  //             const newOrderProfile: OrderProfile = {
  //               id: `order_${Date.now()}`, // Local ID
  //               db_order_id: fetchedOrder.id,
  //               service_location_id: currentTableId,
  //               order_status: (fetchedOrder.status as any) || "preparing",
  //               check_status:
  //                 fetchedOrder.status === "completed" ? "Closed" : "Opened",
  //               paid_status:
  //                 (fetchedOrder.payment_status as string) === "paid" // Cast to string to avoid overlap error with strict Enum
  //                   ? ("Paid" as const)
  //                   : ("Unpaid" as const),
  //               order_type: "Dine In",
  //               items:
  //                 (fetchedOrder as any).order_items?.map((item: any) => ({
  //                   id: `item_${Date.now()}_${Math.random()}`, // New local ID
  //                   isDraft: false,
  //                   menuItemId: item.menu_item_id,
  //                   name: item.item_name,
  //                   price: item.unit_price,
  //                   originalPrice: item.unit_price,
  //                   quantity: item.quantity,
  //                   db_order_item_id: item.id,
  //                   item_status: item.status || "ordered",
  //                   kitchen_status: item.status || "ordered",
  //                   customizations: {
  //                     notes: item.special_instructions,
  //                     modifiers: [], // TODO: Map modifiers if needed for display
  //                   },
  //                 })) || [],
  //               payments: [], // TODO: Fetch payments if needed
  //               opened_at: fetchedOrder.created_at,
  //             };

  //             // Inject into store
  //             useOrderStore.setState((state) => ({
  //               ordersById: {
  //                 ...state.ordersById,
  //                 [newOrderProfile.id]: newOrderProfile,
  //               },
  //               orderIds: [...state.orderIds, newOrderProfile.id],
  //             }));
  //             setActiveOrder(newOrderProfile.id);
  //           } else {
  //             console.error("Failed to fetch order:", error);
  //           }
  //         }
  //       }
  //       return;
  //     }

  //     // Case 2: No Session, and No Active Order for this table.
  //     // The user expects the "Order Started" state just by navigating here.
  //     // So we Auto-Seat / Create Session.
  //     // FIX: Ignored existingOrderForTable if table.session is null, because backend is source of truth.
  //     if (!table.session && tableStatus === "available") {
  //       console.log("Auto-creating session for table", currentTableId);
  //       showLoading("Creating session...");
  //       try {
  //         // Default party size 1, no name. Just to get the ID.
  //         const { sessionId, orderId } = await useFloorPlanStore
  //           .getState()
  //           .seatGuests({
  //             tableIds: [currentTableId],
  //             partySize: 1,
  //             createOrder: true,
  //           });

  //         console.log("Auto-created session:", sessionId, "Order:", orderId);
  //         // Force active order to the new one, overriding any stale local state
  //         setActiveOrder(orderId || null);
  //       } catch (err) {
  //         console.error("Failed to auto-seat guests:", err);
  //       } finally {
  //         hideLoading();
  //       }
  //     }
  //   };

  //   handleAutoCreateSession();
  // }, [currentTableId, tableStatus, table?.session?.order_id]);
  useEffect(() => {
    // Skip if we're navigating away
    if (isNavigatingAwayRef.current) {
      console.log("[AutoSession] Skipping - navigating away");
      return;
    }

    loadFloorPlanStatus();

    const handleAutoCreateSession = async () => {
      // Double-check navigation guard (async timing)
      if (isNavigatingAwayRef.current) {
        console.log("[AutoSession] Skipping async - navigating away");
        return;
      }

      console.log("[handleAutoCreateSession] Starting...");
      console.log("  currentTableId:", currentTableId);
      console.log("  tableStatus:", tableStatus);
      console.log("  table?.session:", table?.session?.id);
      console.log("  existingOrderForTable:", existingOrderForTable?.id);

      if (!currentTableId || !table) return;

      // Case 1: Session exists with an order
      if (table.session?.order_id) {
        const foundOrder = orders.find(
          (o) =>
            o.id === table.session!.order_id ||
            o.db_order_id === table.session!.order_id
        );

        if (foundOrder) {
          if (activeOrderId !== foundOrder.id) {
            console.log("[AutoSession] Found existing order, setting active:", foundOrder.id);
            setActiveOrder(foundOrder.id);
          }
        } else {
          // Don't fetch if navigating away or table is being cleared
          if (isNavigatingAwayRef.current || tableStatus === "cleaning" || tableStatus === "available") {
            console.log("[AutoSession] Skipping fetch - table being cleared or navigating");
            return;
          }

          console.log("[AutoSession] Fetching missing order:", table.session.order_id);
          showLoading("Restoring table session...");

          const supabase = getOrderStoreSupabaseClient();
          if (supabase) {
            const { data: fetchedOrder, error } = await OrderService.fetchOrderById(
              supabase,
              table.session.order_id
            );

            hideLoading();

            // Check again after async operation
            if (isNavigatingAwayRef.current) {
              console.log("[AutoSession] Skipping order restore - navigated away");
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
                  (fetchedOrder as any).order_items?.map((item: any) => ({
                    id: `item_${Date.now()}_${Math.random()}`, // New local ID
                    isDraft: false,
                    menuItemId: item.menu_item_id,
                    name: item.item_name,
                    price: item.unit_price,
                    originalPrice: item.unit_price,
                    quantity: item.quantity,
                    db_order_item_id: item.id,
                    item_status: item.status || "ordered",
                    kitchen_status: item.status || "ordered",
                    customizations: {
                      notes: item.special_instructions,
                      modifiers: [], // TODO: Map modifiers if needed for display
                    },
                  })) || [],
                payments: [], // TODO: Fetch payments if needed
                opened_at: fetchedOrder.created_at,
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
      if (!table.session && tableStatus === "available" && !hasInitializedRef.current) {
        hasInitializedRef.current = true;

        // Final guard check
        if (isNavigatingAwayRef.current) {
          console.log("[AutoSession] Skipping auto-create - navigating away");
          return;
        }

        console.log("[AutoSession] Auto-creating session for table", currentTableId);
        showLoading("Creating session...");

        try {
          const { sessionId, orderId } = await useFloorPlanStore
            .getState()
            .seatGuests({
              tableIds: [currentTableId],
              partySize: 1,
              createOrder: true,
            });

          console.log("[AutoSession] Created session:", sessionId, "Order:", orderId);

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
    const order = orders.find((o) => o.id === activeOrderId);
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

  // Use stable item count and IDs to prevent infinite loops
  const itemCount = activeOrder?.items?.length ?? 0;
  const itemIds = useMemo(
    () => activeOrder?.items?.map((i) => i.id).join(",") ?? "",
    [activeOrder?.items]
  );
  const orderId = activeOrder?.id;

  useEffect(() => {
    if (!orderId) return;
    // Pass db_order_id for backend RPC calls (use UUID, not local ID)
    coursing.initializeForOrder(orderId, activeOrder?.db_order_id);

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
  }, [orderId, itemIds, coursing, activeOrder?.db_order_id]);

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
    if (!orderId || !activeOrder?.items) return;

    activeOrder.items.forEach((item) => {
      // If item has a DB ID and hasn't been synced yet
      if (
        item.db_order_item_id &&
        !syncedDbItemsRef.current.has(item.db_order_item_id)
      ) {
        // Get the course meant for this item from local state
        const state = coursing.getForOrder(orderId);
        const course =
          state?.itemCourseMap?.[item.id] ?? state?.workingCourse ?? 1;

        // Sync item course with DB ID
        coursing.setItemCourse(orderId, item.id, course, item.db_order_item_id);

        // Mark as synced
        syncedDbItemsRef.current.add(item.db_order_item_id);
      }
    });
  }, [orderId, dbItemIdsHash, coursing]); // activeOrder.items is covered by dbItemIdsHash change

  const finalizeCurrentCourse = () => {
    if (!activeOrder) return;
    const nextCourse = coursing.finalizeCurrentCourse(
      activeOrder.id,
      activeOrder.items.map((i) => i.id)
    );
    show({
      title: "Course Finalized",
      message: `Course ${nextCourse - 1} complete. New items added to Course ${nextCourse}.`,
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
      message: `Course ${course} has been ${forceResend ? "resent" : "sent"} for preparation.`,
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
      await updateSessionStatus(table.session.id, "available");
    }
    router.back();
  };

  // const confirmVoid = async () => {
  //   if (!activeOrder) return;
  //   updateOrderStatus(activeOrder.id, "void");
  //   if (table?.session?.id) {
  //     await updateSessionStatus(table.session.id, "cleaning");
  //   }

  //   setVoidConfirmOpen(false);
  //   show({
  //     title: "Check Voided",
  //     message: "The order has been successfully voided.",
  //     type: "success",
  //   });
  //   router.back();
  // };


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
        message: "The order has been successfully voided. Table marked for cleaning.",
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

  // const handleClearTable = async () => {
  //   if (!activeOrderId || !activeOrder) return;

  //   const allItemsReady = activeOrder.items.every(
  //     (item) =>
  //       (item.item_status || "preparing") === "ready" ||
  //       item.item_status === "served"
  //   );

  //   if (!allItemsReady) {
  //     show({
  //       title: "Items Not Ready",
  //       message:
  //         "Cannot clear the table as some items are still being prepared.",
  //       type: "warning",
  //     });
  //     return;
  //   }

  //   if (table?.session?.id) {
  //     await updateSessionStatus(table.session.id, "cleaning");
  //   }

  //   archiveOrder(activeOrderId);
  //   setActiveOrder(null); // Explicitly clear active order to prevent zombie state

  //   router.back();
  //   show({
  //     title: "Table Cleared",
  //     message: `Table marked for cleaning.`,
  //     type: "success",
  //   });
  // };

  const handleClearTable = async () => {
    if (!activeOrderId || !activeOrder) return;

    const allItemsReady = activeOrder.items.every(
      (item) =>
        (item.item_status || "preparing") === "ready" ||
        item.item_status === "served"
    );

    if (!allItemsReady) {
      show({
        title: "Items Not Ready",
        message: "Cannot clear the table as some items are still being prepared.",
        type: "warning",
      });
      return;
    }

    // SET NAVIGATION GUARD
    isNavigatingAwayRef.current = true;

    if (table?.session?.id) {
      await updateSessionStatus(table.session.id, "cleaning");
    }

    archiveOrder(activeOrderId);
    setActiveOrder(null);

    router.replace("/tables"); // Use replace
    
    show({
      title: "Table Cleared",
      message: "Table marked for cleaning.",
      type: "success",
    });
  };

  const checkOrderClosedAndWarn = () => {
    if (activeOrder?.check_status === "Closed") {
      setOrderClosedWarningOpen(true);
      return true;
    }
    return false;
  };

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
          sentCourses={(() => {
            // Convert courses to sentCourses format for backward compatibility
            const courseData = coursing.getForOrder(activeOrder?.id || "");
            const sentMap: Record<number, boolean> = {};
            if (courseData?.courses) {
              Object.entries(courseData.courses).forEach(([num, info]) => {
                sentMap[Number(num)] = info.status !== "open";
              });
            }
            return sentMap;
          })()}
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
          totalDisplayAmount={activeOrderTotal || 0}
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
          itemsInSelectedCourse={
            activeOrder?.items.filter(
              (item) =>
                (coursing.getForOrder(activeOrder?.id || "")?.itemCourseMap?.[
                  item.id
                ] ?? 1) === selectedCourseIdForTracker
            ) || []
          }
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
          // setVoidConfirmOpen(false);
          // show({
          //   title: "Order Voided",
          //   message: "The order has been successfully voided.",
          //   type: "success",
          // });
          // router.back();
          // Force session status update
          // Update local state
          updateOrderStatus(activeOrder?.id || "", "void");

          // Clear active order BEFORE navigating
          setActiveOrder(null);

          setVoidConfirmOpen(false);

          show({
            title: "Check Voided",
            message: "The order has been successfully voided. Table marked for cleaning.",
            type: "success",
          });

          // Use replace instead of back to prevent re-entry
          router.replace("/tables");

        }
        }
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
