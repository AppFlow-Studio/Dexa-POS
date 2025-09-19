import SelectPaymentMethodModal from "@/components/bill/SelectPaymentMethodModal";
import TableBillSection from "@/components/bill/TableBillSection";
import MenuSection from "@/components/menu/MenuSection";
import OrderInfoHeader from "@/components/tables/OrderInfoHeader";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const UpdateTableScreen = () => {
  const router = useRouter();
  const { tableId } = useLocalSearchParams();

  const [isPaymentSelectOpen, setPaymentSelectOpen] = useState(false);
  const [isNotReadyConfirmOpen, setNotReadyConfirmOpen] = useState(false);
  const [isVoidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [isOrderClosedWarningOpen, setOrderClosedWarningOpen] = useState(false);

  const { layouts, updateTableStatus } = useFloorPlanStore();
  const {
    orders,
    activeOrderId,
    setActiveOrder,
    startNewOrder,
    assignOrderToTable,
    updateOrderStatus,
    updateActiveOrderDetails,
    updateItemStatusInActiveOrder,
    syncOrderStatus,
    archiveOrder,
    sendNewItemsToKitchen,
  } = useOrderStore();
  const { setActiveTableId, clearActiveTableId } = usePaymentStore();

  const allTables = useMemo(() => layouts.flatMap((l) => l.tables), [layouts]);

  const initialTable = allTables.find((t) => t.id === tableId);
  let primaryTableId = tableId;

  if (initialTable && initialTable.mergedWith && !initialTable.isPrimary) {
    const primary = allTables.find(
      (t) => t.isPrimary && t.mergedWith?.includes(initialTable.id)
    );
    if (primary) {
      primaryTableId = primary.id;
    }
  }

  const table = allTables.find((t) => t.id === primaryTableId);

  // Find if an order is ALREADY assigned to this table (including closed orders)
  const existingOrderForTable = orders.find(
    (o) =>
      o.service_location_id === tableId &&
      o.order_status !== "Voided" &&
      o.order_status !== "Closed" // Show all orders except voided ones
  );
  const activeOrder = orders.find((o) => o.id === activeOrderId);

  // --- Derived helpers ---
  const hasAnyItems = !!activeOrder && activeOrder.items?.length > 0;
  const hasPayments = !!activeOrder && (activeOrder.payments?.length || 0) > 0;
  const isReopenedPaidNoNewItems = useMemo(() => {
    if (!activeOrder) return false;
    const totalQty = activeOrder.items.reduce((acc, i) => acc + i.quantity, 0);
    const paidQty = activeOrder.items.reduce(
      (acc, i) => acc + (i.paidQuantity || 0),
      0
    );
    // Previously paid order (Paid) that was reopened to Pending, and no new items added
    return activeOrder.paid_status !== "Paid" && paidQty === totalQty;
  }, [activeOrder]);

  // --- Core Logic ---
  useEffect(() => {
    if (table?.status === "Needs Cleaning") {
      router.push("/tables");
      return;
    }
  }, []);

  useEffect(() => {
    if (existingOrderForTable) {
      // If we navigated to a table that's already in use, make its order active.
      setActiveOrder(existingOrderForTable.id);
    }
    return () => setActiveOrder(null);
  }, [primaryTableId, existingOrderForTable, setActiveOrder, startNewOrder]);

  useEffect(() => {
    if (tableId) {
      setActiveTableId(tableId as string);
    }

    return () => {
      clearActiveTableId();
    };
  }, [tableId]);

  const handleAssignToTable = () => {
    if (activeOrderId && tableId) {
      // This is the key action. It links the active order to the table
      assignOrderToTable(activeOrderId, tableId as string);
      updateTableStatus(tableId as string, "In Use");
      updateOrderStatus(activeOrderId, "Preparing");
      router.push("/tables");
    }
  };

  const handlePay = () => {
    const order = orders.find((o) => o.id === activeOrderId);
    if (order) {
      const anyNotReady = order.items.some(
        (i) => (i.item_status || "Preparing") !== "Ready"
      );
      if (anyNotReady) {
        setNotReadyConfirmOpen(true);
        return;
      }
    }
    setPaymentSelectOpen(true);
  };

  const handleReopenCheck = () => {
    if (!activeOrderId) return;
    // Mark as pending to allow adding new items and reopen the order
    updateActiveOrderDetails({
      paid_status: "Pending",
      check_status: "Opened",
      order_status: "Preparing", // Reopen the order status
    });

    // Sync order status based on existing items
    syncOrderStatus(activeOrderId);

    toast.success("Check reopened. You can add items now.", {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
  };

  // --- Coursing ---
  const coursing = useCoursingStore();
  const prevItemIdsRef = useRef<string[]>([]);

  // Initialize coursing for this order and auto-assign new items
  useEffect(() => {
    if (!activeOrder) return;
    coursing.initializeForOrder(activeOrder.id);
    const currentIds = activeOrder.items.map((i) => i.id);
    const prevIds = prevItemIdsRef.current;
    // On initial mount, don't auto-assign existing items. Preserve stored mapping.
    if (prevIds.length === 0) {
      prevItemIdsRef.current = currentIds;
      return;
    }
    const newIds = currentIds.filter((id) => !prevIds.includes(id));
    if (newIds.length > 0) {
      const state = coursing.getForOrder(activeOrder.id);
      const useCourse = state?.currentCourse ?? 1;
      // Only assign a course to truly unmapped items
      newIds.forEach((id) => {
        if (state?.itemCourseMap?.[id] === undefined) {
          coursing.setItemCourse(activeOrder.id, id, useCourse);
        }
      });
    }
    prevItemIdsRef.current = currentIds;
  }, [activeOrder?.items]);

  const setItemCourse = (itemId: string, course: number) => {
    if (!activeOrder) return;
    coursing.setItemCourse(activeOrder.id, itemId, Math.max(1, course));
  };

  const finalizeCurrentCourse = () => {
    if (!activeOrder) return;
    const nextCourse = coursing.finalizeCurrentCourse(
      activeOrder.id,
      activeOrder.items.map((i) => i.id)
    );
    toast.success(
      `Course ${nextCourse - 1} created. New items will be Course ${nextCourse}.`,
      { duration: 2500, position: ToastPosition.BOTTOM }
    );
  };

  const handleSendCourseToKitchen = (course: number) => {
    if (!activeOrder) return;

    // Use helper function to check if course was already sent
    if (coursing.isCourseSent(activeOrder.id, course)) {
      toast.error(`Course ${course} has already been sent to kitchen.`, {
        duration: 2500,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    const state = coursing.getForOrder(activeOrder.id);
    const itemsInCourse = activeOrder.items.filter(
      (i) => (state?.itemCourseMap?.[i.id] ?? 1) === course
    );
    if (itemsInCourse.length === 0) {
      toast.error(`No items in course ${course} to send.`, {
        duration: 2500,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    // Update items in the course to "sent" status
    itemsInCourse.forEach((i) => {
      // Update both kitchen_status and item_status for course items
      updateItemStatusInActiveOrder(i.id, "Preparing");
    });

    // Mark the course as sent
    coursing.markCourseSent(activeOrder.id, course);

    // Update order status if it was building
    if (activeOrder.order_status === "Building") {
      updateOrderStatus(activeOrder.id, "Preparing");
    }

    // Update table status like Take Order
    if (tableId && table?.status !== "In Use") {
      handleAssignToTable();
    }

    toast.success(`Sent course ${course} to kitchen.`, {
      duration: 2500,
      position: ToastPosition.BOTTOM,
    });
  };

  // Close/ Void check behavior
  const handleCloseCheck = () => {
    if (!activeOrder) return;

    // 1) If unpaid and has items => prompt to void
    if (!hasPayments && hasAnyItems) {
      setVoidConfirmOpen(true);
      return;
    }

    // 2) If reopened and fully covered (no new items) => simply close
    if (isReopenedPaidNoNewItems) {
      updateOrderStatus(activeOrder.id, "Closed");
      toast.success("Check closed.", {
        duration: 2500,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    // Fallback: if no items or already closed
    updateOrderStatus(activeOrder.id, "Closed");
  };

  const confirmVoid = () => {
    if (!activeOrder) return;
    updateOrderStatus(activeOrder.id, "Voided");
    updateTableStatus(tableId as string, "Available");
    setVoidConfirmOpen(false);
    toast.success("Check voided.", {
      duration: 2500,
      position: ToastPosition.BOTTOM,
    });
    router.back();
  };

  const handleClearTable = () => {
    if (!tableId || !activeOrderId || !activeOrder) return;

    // Check if all items are ready
    const allItemsReady = activeOrder.items.every(
      (item) => (item.item_status || "Preparing") === "Ready"
    );

    if (!allItemsReady) {
      toast.error("Cannot clear table: Not all items are ready.", {
        duration: 3000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    // Only proceed if all items are ready
    updateTableStatus(tableId as string, "Needs Cleaning");
    archiveOrder(activeOrderId);
    router.back();
    toast.success("Table marked for cleaning.", {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
  };

  // Function to check if order is closed and show warning
  const checkOrderClosedAndWarn = () => {
    if (activeOrder?.check_status === "Closed") {
      setOrderClosedWarningOpen(true);
      return true; // Order is closed
    }
    return false; // Order is not closed
  };
  if (!table) {
    return (
      <View className="flex-1 items-center justify-center bg-[#212121]">
        <Text className="text-2xl font-bold text-red-400">
          Table not found!
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#212121]">
      {/* --- Customer Info Section (Top) --- */}
      <View className="px-2 mt-2">
        <OrderInfoHeader />
      </View>

      <View className="flex-1 flex-row ">
        <TableBillSection
          showOrderDetails={false}
          itemCourseMap={
            coursing.getForOrder(activeOrder?.id || "")?.itemCourseMap
          }
          sentCourses={coursing.getForOrder(activeOrder?.id || "")?.sentCourses}
          currentCourse={
            coursing.getForOrder(activeOrder?.id || "")?.currentCourse
          }
          onSelectCourse={(course: number) =>
            activeOrder && coursing.setCurrentCourse(activeOrder.id, course)
          }
        />
        <View className="flex-1 p-6 px-4 pt-0">
          {/* Coursing Toolbar */}
          <View className="bg-[#303030] border border-gray-700 rounded-2xl p-3 mb-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Text className="text-base font-semibold text-white">
                Current Course
              </Text>
              <View className="flex-row items-center gap-2 bg-[#212121] border border-gray-700 rounded-lg px-2 py-1">
                <Text className="text-white font-bold">
                  {coursing.getForOrder(activeOrder?.id || "")?.currentCourse ??
                    1}
                </Text>
              </View>
            </View>
            <View className="flex-row items-center gap-2">
              <TouchableOpacity
                onPress={finalizeCurrentCourse}
                className="px-4 py-2 rounded-lg bg-green-200"
              >
                <Text className="font-bold text-green-600">New Course</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={coursing.getForOrder(activeOrder?.id || "")?.currentCourse === 1}
                onPress={() =>
                  handleSendCourseToKitchen(
                    coursing.getForOrder(activeOrder?.id || "")
                      ?.currentCourse ?? 1
                  )
                }

                className="px-4 py-2 rounded-lg bg-blue-500"
              >
                <Text className="font-bold text-white">
                  Send Course{" "}
                  {coursing.getForOrder(activeOrder?.id || "")?.currentCourse ??
                    1}
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {(() => {
            const coursingState = coursing.getForOrder(activeOrder?.id || "");
            const currentCourse = coursingState?.currentCourse ?? 1;
            const isCurrentCourseSent = coursing.isCourseSent(activeOrder?.id || "", currentCourse);

            if (isCurrentCourseSent) {
              // Show "Start New Course" button when current course is sent
              return (
                <View className="flex-1 justify-center items-center">
                  <TouchableOpacity
                    onPress={finalizeCurrentCourse}
                    className="px-6 py-3 rounded-lg bg-green-600 border border-green-500"
                    activeOpacity={0.8}
                  >
                    <Text className="font-bold text-white text-lg">
                      ✨ Start New Course
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            } else {
              // Show normal menu section
              return <MenuSection onOrderClosedCheck={checkOrderClosedAndWarn} />;
            }
          })()}

        </View>
      </View>

      {/* Per-item status tracker */}
      {activeOrder && activeOrder.items?.length > 0 && (
        <View className="bg-[#303030] border-t border-gray-700 p-4">
          {/* <Text className="text-base font-bold text-blue-400 mb-3">
            Items Status
          </Text> */}
          <ScrollView
            className="max-h-32 w-full "
            contentContainerStyle={{ columnGap: 16 }}
            horizontal={true}
          >
            {activeOrder.items.map((item) => {
              const isReady = (item.item_status || "Preparing") === "Ready";
              const state = coursing.getForOrder(activeOrder?.id || "");
              const course =
                state?.itemCourseMap?.[item.id] ?? state?.currentCourse ?? 1;
              return (
                <View
                  key={item.id}
                  className="flex-row justify-between items-center py-2 border-b border-gray-100"
                >
                  <View className="flex-1 pr-2">
                    <Text className="font-semibold text-white">
                      {item.name} x{item.quantity}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-1">
                      <View
                        className={`px-2 py-0.5 rounded-full ${isReady ? "bg-green-600" : "bg-yellow-600"}`}
                      >
                        <Text
                          className={`text-[10px] font-semibold ${isReady ? "text-green-100" : "text-yellow-100"}`}
                        >
                          {isReady ? "Ready" : "Preparing"}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1 bg-[#212121] border border-gray-700 rounded-full px-2 py-0.5">
                        <Text className="text-[10px] font-semibold text-gray-300">
                          Course
                        </Text>
                        <Text className="text-[10px] font-bold text-white">
                          {course}
                        </Text>
                      </View>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() =>
                      updateItemStatusInActiveOrder(
                        item.id,
                        isReady ? "Preparing" : "Ready"
                      )
                    }
                    className={`px-3 py-2 rounded-lg ${isReady ? "bg-yellow-500" : "bg-green-500"
                      }`}
                  >
                    <Text
                      className={`text-xs font-bold ${isReady ? "text-yellow-100" : "text-white"
                        }`}
                    >
                      {isReady ? "Mark Preparing" : "Mark Ready"}
                    </Text>
                  </TouchableOpacity>
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* --- Fixed Footer (Not Scrollable) --- */}
      <View className="bg-[#303030] border-t border-gray-700 p-4 flex-row justify-between items-center">
        <View className="flex-row items-center gap-2">
          <AlertCircle color="#f97316" size={20} />
          <Text className="font-semibold text-white">
            Table No. {table?.name}, Table Size - Medium, {table?.capacity}
          </Text>
        </View>
        {/* Paid / Status badges for table order */}
        {activeOrder && (
          <View className="flex-row items-center gap-2">
            <View
              className={`px-2 py-1 rounded-full ${activeOrder.paid_status === "Paid"
                ? "bg-green-600"
                : activeOrder.paid_status === "Pending"
                  ? "bg-yellow-600"
                  : "bg-red-600"
                }`}
            >
              <Text
                className={`text-xs font-semibold ${activeOrder.paid_status === "Paid"
                  ? "text-green-100"
                  : activeOrder.paid_status === "Pending"
                    ? "text-yellow-100"
                    : "text-red-100"
                  }`}
              >
                {activeOrder.paid_status}
              </Text>
            </View>
            {/* <View className="px-2 py-1 rounded-full bg-blue-100">
              <Text className="text-xs font-semibold text-blue-800">
                {activeOrder.order_status}
              </Text>
            </View> */}
            <View
              className={`px-2 py-1 rounded-full ${activeOrder.check_status === "Opened" ? "bg-purple-600" : "bg-gray-600"}`}
            >
              <Text
                className={`text-xs font-semibold ${activeOrder.check_status === "Opened" ? "text-purple-100" : "text-gray-100"}`}
              >
                {activeOrder.check_status}
              </Text>
            </View>
          </View>
        )}
        <View className="flex-row gap-2">
          {/* <TouchableOpacity
            onPress={() => router.back()}
            className="px-8 py-3 rounded-lg border border-gray-300"
          >
            <Text className="font-bold text-gray-700">Cancel</Text>
          </TouchableOpacity> */}
          {existingOrderForTable ? (
            activeOrder?.check_status === "Closed" ? (
              // Closed order: show Reopen Check and Clear Table
              <>
                <TouchableOpacity
                  onPress={handleReopenCheck}
                  className="px-8 py-3 rounded-lg bg-blue-500"
                >
                  <Text className="font-bold text-white">Reopen Check</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleClearTable}
                  className="px-8 py-3 rounded-lg border border-red-500 bg-red-600"
                >
                  <Text className="font-bold text-red-100">Clear Table</Text>
                </TouchableOpacity>
              </>
            ) : activeOrder?.paid_status === "Paid" ? (
              // Paid but not closed: show Close Check and Clear Table
              <>
                <TouchableOpacity
                  onPress={handleCloseCheck}
                  className="px-8 py-3 rounded-lg bg-blue-500"
                >
                  <Text className="font-bold text-white">Close Check</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleClearTable}
                  className="px-8 py-3 rounded-lg border border-red-500 bg-red-600"
                >
                  <Text className="font-bold text-red-100">Clear Table</Text>
                </TouchableOpacity>
              </>
            ) : (
              // Unpaid: show Send to Kitchen, Pay, and Close (which may void)
              <>
                <TouchableOpacity
                  onPress={handlePay}
                  disabled={activeOrder?.items.length === 0}
                  className={`px-8 py-3 rounded-lg bg-blue-500 ${activeOrder?.items.length === 0 ? "bg-gray-600" : ""}`}
                >
                  <Text className="font-bold text-white">Pay</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCloseCheck}
                  disabled={activeOrder?.items.length === 0}
                  className={`px-8 py-3 rounded-lg border border-gray-600 bg-[#303030] ${activeOrder?.items.length === 0 ? "bg-gray-600" : ""}`}
                >
                  <Text className="font-bold text-white">Close Check</Text>
                </TouchableOpacity>
              </>
            )
          ) : (
            <TouchableOpacity
              className="px-8 py-3 rounded-lg bg-blue-500"
              onPress={handleAssignToTable}
            >
              <Text className="font-bold text-white">Take Order</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Confirm: items not ready */}
      <AlertDialog
        open={isNotReadyConfirmOpen}
        onOpenChange={setNotReadyConfirmOpen}
      >
        <AlertDialogContent className="w-[500px] p-6 rounded-2xl bg-[#303030]">
          <Text className="text-xl font-bold text-white mb-2">
            Items not ready
          </Text>
          <Text className="text-gray-400 mb-6">
            Not all items are marked as ready. Proceed to payment?
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => setNotReadyConfirmOpen(false)}
              className="flex-1 py-3 border border-gray-600 rounded-lg items-center bg-[#212121]"
            >
              <Text className="font-bold text-white">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => {
                setNotReadyConfirmOpen(false);
                setPaymentSelectOpen(true);
              }}
              className="flex-1 py-3 bg-blue-500 rounded-lg items-center"
            >
              <Text className="font-bold text-white">Continue</Text>
            </TouchableOpacity>
          </View>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm: void unpaid check */}
      <AlertDialog open={isVoidConfirmOpen} onOpenChange={setVoidConfirmOpen}>
        <AlertDialogContent className="w-[500px] p-6 rounded-2xl bg-[#303030]">
          <Text className="text-xl font-bold text-white mb-2">Void check?</Text>
          <Text className="text-gray-400 mb-6">
            No payment has been made. Do you want to void this check?
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => setVoidConfirmOpen(false)}
              className="flex-1 py-3 border border-gray-600 rounded-lg items-center bg-[#212121]"
            >
              <Text className="font-bold text-white">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={confirmVoid}
              className="flex-1 py-3 bg-red-500 rounded-lg items-center"
            >
              <Text className="font-bold text-white">Void Check</Text>
            </TouchableOpacity>
          </View>
        </AlertDialogContent>
      </AlertDialog>

      {/* Payment method selection modal */}
      <SelectPaymentMethodModal
        isOpen={isPaymentSelectOpen}
        onClose={() => setPaymentSelectOpen(false)}
      />

      {/* Order closed warning */}
      <AlertDialog
        open={isOrderClosedWarningOpen}
        onOpenChange={setOrderClosedWarningOpen}
      >
        <AlertDialogContent className="w-[500px] p-6 rounded-2xl bg-[#303030]">
          <Text className="text-xl font-bold text-white mb-2">
            Order is Closed
          </Text>
          <Text className="text-gray-400 mb-6">
            This order is currently closed. Please reopen the check to add
            items.
          </Text>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => setOrderClosedWarningOpen(false)}
              className="flex-1 py-3 bg-blue-500 rounded-lg items-center"
            >
              <Text className="font-bold text-white">OK</Text>
            </TouchableOpacity>
          </View>
        </AlertDialogContent>
      </AlertDialog>
    </View>
  );
};

export default UpdateTableScreen;
