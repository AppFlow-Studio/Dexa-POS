import SelectPaymentMethodModal from "@/components/bill/SelectPaymentMethodModal";
import TableBillSection from "@/components/bill/TableBillSection";
import MenuSection from "@/components/menu/MenuSection";
import OrderInfoHeader from "@/components/tables/OrderInfoHeader";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, XCircle } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const UpdateTableScreen = () => {
  const { defaultSittingTimeMinutes } = useSettingsStore();
  const [duration, setDuration] = useState("");
  const [isOvertime, setIsOvertime] = useState(false);

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
    deleteOrder,
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
    if (table?.status !== "In Use" || !activeOrder?.opened_at) {
      setDuration("");
      setIsOvertime(false);
      return;
    }

    const timer = setInterval(() => {
      const startTime = new Date(activeOrder.opened_at!);
      const now = new Date();
      const diffMs = now.getTime() - startTime.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      setDuration(`${diffMins} min`);
      setIsOvertime(diffMins > defaultSittingTimeMinutes);
    }, 60000); // Update every minute

    // Run once immediately
    const startTime = new Date(activeOrder.opened_at);
    const now = new Date();
    const diffMs = now.getTime() - startTime.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    setDuration(`${diffMins} min`);
    setIsOvertime(diffMins > defaultSittingTimeMinutes);

    return () => clearInterval(timer);
  }, [table?.status, activeOrder, defaultSittingTimeMinutes]);

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
      `Course ${
        nextCourse - 1
      } created. New items will be Course ${nextCourse}.`,
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

    if (!activeOrder.opened_at) {
      updateActiveOrderDetails({ opened_at: new Date().toISOString() });
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
    if (!activeOrder || !tableId) return;
    // If the order is already paid, "closing" it means clearing the table for the next customer.
    if (activeOrder.paid_status === "Paid") {
      handleClearTable(); // This function already archives the order and sets the table to "Needs Cleaning".
      return;
    }
    // If the order is unpaid AND has items, prompt to void it.
    if (!hasPayments && hasAnyItems) {
      setVoidConfirmOpen(true);
      return;
    }

    // Fallback for other cases (e.g., an empty order)
    updateOrderStatus(activeOrder.id, "Closed");
    // If it's an empty order, the table becomes available immediately.
    updateTableStatus(tableId as string, "Available");
    router.back();
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
    if (!activeOrderId || !activeOrder) return;

    // Find the primary table for the current order
    const allTables = layouts.flatMap((l) => l.tables);
    const primaryTable = allTables.find(
      (t) => t.id === activeOrder.service_location_id
    );

    if (!primaryTable) {
      toast.error("Could not find the table for this order.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }

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

    // Determine all tables that need to be cleaned
    const tablesToClean = [primaryTable.id];
    if (primaryTable.isPrimary && primaryTable.mergedWith) {
      tablesToClean.push(...primaryTable.mergedWith);
    }

    // Update status for all tables in the group
    tablesToClean.forEach((id) => {
      updateTableStatus(id, "Needs Cleaning");
    });

    // Archive the order and navigate back
    archiveOrder(activeOrderId);
    router.back();
    toast.success(
      `Table(s) ${tablesToClean
        .map((id) => allTables.find((t) => t.id === id)?.name)
        .join(", ")} marked for cleaning.`,
      {
        duration: 3000,
        position: ToastPosition.BOTTOM,
      }
    );
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
        <Text className="text-xl font-bold text-red-400">Table not found!</Text>
      </View>
    );
  }

  const handleCloseEmptyOrder = () => {
    if (activeOrder && activeOrder.items.length === 0) {
      deleteOrder(activeOrder.id); // Remove the empty order
      updateTableStatus(tableId as string, "Available"); // Set table back to Available
      router.back(); // Go back to the floor plan
    }
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
          currentCourse={
            coursing.getForOrder(activeOrder?.id || "")?.currentCourse
          }
          onSelectCourse={(course: number) =>
            activeOrder && coursing.setCurrentCourse(activeOrder.id, course)
          }
        />
        <View className="flex-1 p-4 px-3 pt-0">
          {/* Coursing Toolbar */}
          <View className="bg-[#303030] border border-gray-700 rounded-2xl p-2 mb-2 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <Text className="text-sm font-semibold text-white">
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
                className="px-3 py-1.5 rounded-lg bg-green-200"
              >
                <Text className="font-semibold text-green-600 text-sm">
                  New Course
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() =>
                  handleSendCourseToKitchen(
                    coursing.getForOrder(activeOrder?.id || "")
                      ?.currentCourse ?? 1
                  )
                }
                className="px-3 py-1.5 rounded-lg bg-blue-500"
              >
                <Text className="font-semibold text-white text-sm">
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
            const isCurrentCourseSent = coursing.isCourseSent(
              activeOrder?.id || "",
              currentCourse
            );

            if (isCurrentCourseSent) {
              // Show "Start New Course" button when current course is sent
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
              // Show normal menu section
              return (
                <MenuSection onOrderClosedCheck={checkOrderClosedAndWarn} />
              );
            }
          })()}
        </View>
      </View>

      {/* Per-item status tracker */}
      {activeOrder && activeOrder.items?.length > 0 && (
        <View className="bg-[#303030] border-t border-gray-700 p-3">
          <ScrollView
            className="max-h-28 w-full "
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
                  className="flex-row justify-between items-center py-1.5 border-b border-gray-100"
                >
                  <View className="flex-1 pr-2">
                    <Text className="text-sm font-medium text-white">
                      {item.name} x{item.quantity}
                    </Text>
                    <View className="flex-row items-center gap-2 mt-1">
                      <View
                        className={`px-1.5 py-0.5 rounded-full ${
                          isReady ? "bg-green-600" : "bg-yellow-600"
                        }`}
                      >
                        <Text
                          className={`text-[9px] font-semibold ${
                            isReady ? "text-green-100" : "text-yellow-100"
                          }`}
                        >
                          {isReady ? "Ready" : "Preparing"}
                        </Text>
                      </View>
                      <View className="flex-row items-center gap-1 bg-[#212121] border border-gray-700 rounded-full px-1.5 py-0.5">
                        <Text className="text-[9px] font-semibold text-gray-300">
                          Course
                        </Text>
                        <Text className="text-[9px] font-bold text-white">
                          {course}
                        </Text>
                      </View>
                    </View>
                  </View>
                  {!isReady && (
                    <TouchableOpacity
                      onPress={() =>
                        updateItemStatusInActiveOrder(item.id, "Ready")
                      }
                      className="mt-2 px-2 py-1.5 rounded-lg bg-green-600 items-center"
                    >
                      <Text className="text-xs font-bold text-white">
                        Mark Ready
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* --- Fixed Footer (Not Scrollable) --- */}
      <View className="bg-[#303030] border-t border-gray-700 p-3 flex-row justify-between items-center">
        <View className="flex-row items-center gap-2">
          <AlertCircle color="#f97316" size={18} />
          <Text className="text-sm font-medium text-white">
            Table No. {table?.name}, Table Size - Medium, {table?.capacity}
          </Text>
        </View>
        {activeOrder && (
          <View className="flex-row items-center gap-2">
            <View
              className={`px-1.5 py-0.5 rounded-md ${
                activeOrder.paid_status === "Paid"
                  ? "bg-green-600"
                  : activeOrder.paid_status === "Pending"
                  ? "bg-yellow-600"
                  : "bg-red-600"
              }`}
            >
              <Text
                className={`text-[11px] font-semibold ${
                  activeOrder.paid_status === "Paid"
                    ? "text-green-100"
                    : activeOrder.paid_status === "Pending"
                    ? "text-yellow-100"
                    : "text-red-100"
                }`}
              >
                {activeOrder.paid_status}
              </Text>
            </View>
            <View
              className={`px-1.5 py-0.5 rounded-md ${
                activeOrder.check_status === "Opened"
                  ? "bg-purple-600"
                  : "bg-gray-600"
              }`}
            >
              <Text
                className={`text-[11px] font-semibold ${
                  activeOrder.check_status === "Opened"
                    ? "text-purple-100"
                    : "text-gray-100"
                }`}
              >
                {activeOrder.check_status}
              </Text>
            </View>
          </View>
        )}
        <View className="flex-row  gap-2">
          {/* --- NEW LOGIC: Check for an empty cart first --- */}
          {activeOrder && activeOrder.items.length === 0 && !hasPayments ? (
            // If the cart is empty and no payments have been made, show ONLY the Close button
            <TouchableOpacity
              onPress={handleCloseEmptyOrder}
              className="px-4 py-2 bg-red-600 rounded-lg flex-row items-center justify-center gap-2"
            >
              <XCircle size={20} color="white" />
              <Text className="font-semibold text-white text-lg">Close</Text>
            </TouchableOpacity>
          ) : existingOrderForTable ? (
            // --- YOUR EXISTING LOGIC: If the cart is NOT empty, render the normal buttons ---
            activeOrder?.check_status === "Closed" ? (
              <>
                <TouchableOpacity
                  onPress={handleReopenCheck}
                  className="px-6 py-2 rounded-lg bg-blue-500"
                >
                  <Text className="font-semibold text-white text-base">
                    Reopen Check
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleClearTable}
                  className="px-6 py-2 rounded-lg border border-red-500 bg-red-600"
                >
                  <Text className="font-semibold text-red-100 text-base">
                    Clear Table
                  </Text>
                </TouchableOpacity>
              </>
            ) : activeOrder?.paid_status === "Paid" ? (
              <>
                <TouchableOpacity
                  onPress={handleCloseCheck}
                  className="px-6 py-2 rounded-lg bg-blue-500"
                >
                  <Text className="font-semibold text-white text-base">
                    Close Check
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleClearTable}
                  className="px-6 py-2 rounded-lg border border-red-500 bg-red-600"
                >
                  <Text className="font-semibold text-red-100 text-base">
                    Clear Table
                  </Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity
                  onPress={handlePay}
                  disabled={!hasAnyItems}
                  className={`px-6 py-2 rounded-lg bg-blue-500 ${
                    !hasAnyItems ? "opacity-50" : ""
                  }`}
                >
                  <Text className="font-semibold text-white text-base">
                    Pay
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleCloseCheck}
                  className="px-6 py-2 rounded-lg border border-gray-600 bg-[#303030]"
                >
                  <Text className="font-semibold text-white text-base">
                    Close Check
                  </Text>
                </TouchableOpacity>
              </>
            )
          ) : (
            // Fallback for "Take Order" if no order exists for the table yet
            <TouchableOpacity
              className="px-6 py-2 rounded-lg bg-blue-500"
              onPress={handleAssignToTable}
            >
              <Text className="font-semibold text-white text-base">
                Take Order
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

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
                setPaymentSelectOpen(true);
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

      <SelectPaymentMethodModal
        isOpen={isPaymentSelectOpen}
        onClose={() => setPaymentSelectOpen(false)}
      />

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
    </View>
  );
};

export default UpdateTableScreen;
