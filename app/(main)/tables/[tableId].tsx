import ItemProgressTracker from "@/components/bill/ItemProgressTracker";
import MoreOptionsBottomSheet from "@/components/bill/MoreOptionsBottomSheet";
import TableBillSection from "@/components/bill/TableBillSection";
import MenuSection from "@/components/menu/MenuSection";
import OrderInfoHeader from "@/components/tables/OrderInfoHeader";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { useToast } from "@/contexts/ToastContext";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const UpdateTableScreen = () => {
  const { defaultSittingTimeMinutes } = useSettingsStore();
  const [duration, setDuration] = useState("");
  const [isOvertime, setIsOvertime] = useState(false);

  const router = useRouter();
  const { tableId } = useLocalSearchParams();
  const { show } = useToast();

  const [isNotReadyConfirmOpen, setNotReadyConfirmOpen] = useState(false);
  const [isVoidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [isOrderClosedWarningOpen, setOrderClosedWarningOpen] = useState(false);
  const [selectedCourseIdForTracker, setSelectedCourseIdForTracker] = useState<
    number | null
  >(null);
  const [courseToResend, setCourseToResend] = useState<number | null>(null);

  const pricingSheetRef = useRef<BottomSheetMethods>(null);
  const moreOptionsSheetRef = useRef<BottomSheetMethods>(null);

  const { tables, updateSessionStatus } = useFloorPlanStore();
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
    deleteOrder,
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
  const existingOrderForTable = useMemo(
    () =>
      orders.find(
        (o) =>
          o.service_location_id === currentTableId &&
          o.order_status !== "void" &&
          o.order_status !== "completed"
      ),
    [orders, currentTableId]
  );
  const activeOrder = orders.find((o) => o.id === activeOrderId);

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

  useEffect(() => {
    if (existingOrderForTable) {
      // If we navigated to a table that's already in use, make its order active.
      setActiveOrder(existingOrderForTable.id);
    }
    return () => setActiveOrder(null);
  }, [currentTableId, existingOrderForTable, setActiveOrder]);

  useEffect(() => {
    if (currentTableId) {
      setActiveTableId(currentTableId);
    }

    return () => {
      clearActiveTableId();
    };
  }, [currentTableId]);

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
      const anyNotReady = order.items.some(
        (i) => (i.item_status || "preparing") !== "ready"
      );
      if (anyNotReady) {
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
    show({
      title: "Items Marked Ready",
      message: "All items in the course have been marked as ready.",
      type: "success",
    });
  };

  // --- Coursing ---
  const coursingStore = useCoursingStore();
  const currentCourse =
    coursingStore.byOrderId[activeOrderId || ""]?.currentCourse ?? 1;
  const { setCurrentCourse } = coursingStore;
  const coursing = coursingStore;
  const prevItemIdsRef = useRef<string[]>([]);

  useEffect(() => {
    if (!activeOrder) return;
    coursing.initializeForOrder(activeOrder.id);
    const currentIds = activeOrder.items.map((i) => i.id);
    const prevIds = prevItemIdsRef.current;

    if (prevIds.length === 0) {
      prevItemIdsRef.current = currentIds;
      return;
    }
    const newIds = currentIds.filter((id) => !prevIds.includes(id));
    if (newIds.length > 0) {
      const state = coursing.getForOrder(activeOrder.id);
      const useCourse = state?.currentCourse ?? 1;
      newIds.forEach((id) => {
        if (state?.itemCourseMap?.[id] === undefined) {
          coursing.setItemCourse(activeOrder.id, id, useCourse);
        }
      });
    }
    prevItemIdsRef.current = currentIds;
  }, [activeOrder?.items]);

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

  const handleSendCourseToKitchen = (course: number, forceResend = false) => {
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

    if (currentTableId && table?.session?.id) {
      updateSessionStatus(table.session.id, "ordered");
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
    if (!hasPayments && hasAnyItems) {
      setVoidConfirmOpen(true);
      return;
    }

    updateOrderStatus(activeOrder.id, "completed");
    if (table?.session?.id) {
      await updateSessionStatus(table.session.id, "available");
    }
    router.back();
  };

  const confirmVoid = async () => {
    if (!activeOrder) return;
    updateOrderStatus(activeOrder.id, "void");
    if (table?.session?.id) {
      await updateSessionStatus(table.session.id, "available");
    }

    setVoidConfirmOpen(false);
    show({
      title: "Check Voided",
      message: "The order has been successfully voided.",
      type: "success",
    });
    router.back();
  };

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
        message:
          "Cannot clear the table as some items are still being prepared.",
        type: "warning",
      });
      return;
    }

    if (table?.session?.id) {
      await updateSessionStatus(table.session.id, "cleaning");
    }

    archiveOrder(activeOrderId);
    router.back();
    show({
      title: "Table Cleared",
      message: `Table marked for cleaning.`,
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
          sentCourses={coursing.getForOrder(activeOrder?.id || "")?.sentCourses}
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
            const currentCourse = coursingState?.currentCourse ?? 1;
            const isCurrentCourseSent = coursing.isCourseSent(
              activeOrder?.id || "",
              currentCourse
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

      <MoreOptionsBottomSheet ref={moreOptionsSheetRef} />

      <AlertDialog
        open={isNotReadyConfirmOpen}
        onOpenChange={setNotReadyConfirmOpen}
      >
        <AlertDialogContent className="w-[450px] p-4 rounded-2xl bg-[#303030]">
          <Text className="text-lg font-bold text-white mb-2">
            Items not ready
          </Text>
          <Text className="text-sm text-gray-400 mb-4">
            Not all items are marked as ready. Proceed to payment?
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => setNotReadyConfirmOpen(false)}
              className="flex-1 py-2 border border-gray-600 rounded-lg items-center bg-[#212121]"
            >
              <Text className="font-semibold text-white text-base">Cancel</Text>
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
              className="flex-1 py-2 bg-blue-500 rounded-lg items-center"
            >
              <Text className="font-semibold text-white text-base">
                Continue
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
