import TableBillSection from "@/components/bill/TableBillSection";
import OrderInfoHeader from "@/components/tables/OrderInfoHeader";
import { AlertDialog, AlertDialogContent } from "@/components/ui/alert-dialog";
import { useToast } from "@/contexts/ToastContext";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useLocalSearchParams, useRouter } from "expo-router";

import DiscountOverlay from "@/components/bill/DiscountOverlay"; // New Import
import MoreOptionsBottomSheet from "@/components/bill/MoreOptionsBottomSheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types"; // For ref

import ItemProgressTracker from "@/components/bill/ItemProgressTracker";
import MenuSection from "@/components/menu/MenuSection";
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
  const [isDiscountOverlayOpen, setDiscountOverlayOpen] = useState(false); // New State
  const [selectedCourseIdForTracker, setSelectedCourseIdForTracker] = useState<
    number | null
  >(null);
  const [courseToResend, setCourseToResend] = useState<number | null>(null);

  const pricingSheetRef = useRef<BottomSheetMethods>(null);
  const moreOptionsSheetRef = useRef<BottomSheetMethods>(null);

  const { layouts, updateTableStatus } = useFloorPlanStore();
  const {
    orders,
    activeOrderId,
    activeOrderTotal, // <--- Add this
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
      o.order_status !== "Closed"
  );
  const activeOrder = orders.find((o) => o.id === activeOrderId);

  // --- Derived helpers ---
  const hasAnyItems = !!activeOrder && activeOrder.items?.length > 0;
  const hasPayments = !!activeOrder && (activeOrder.payments?.length || 0) > 0;

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
    }, 60000);

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
    console.log("we came here");

    openPaymentSheet("Card", tableId as string, "payment-method-selection");
  };

  const handleReopenCheck = () => {
    if (!activeOrderId) return;
    // Mark as pending to allow adding new items and reopen the order
    updateActiveOrderDetails({
      paid_status: "Pending",
      check_status: "Opened",
      order_status: "Preparing",
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
    itemIds.forEach((itemId) => updateItemStatusInActiveOrder(itemId, "Ready"));
    show({
      title: "Items Marked Ready",
      message: "All items in the course have been marked as ready.",
      type: "success",
    });
  };

  // --- Coursing ---
  // Get the full store object
  const coursingStore = useCoursingStore();
  // Derive current course safely
  const currentCourse =
    coursingStore.byOrderId[activeOrderId || ""]?.currentCourse ?? 1;
  // Extract setCurrentCourse for direct usage as a variable
  const { setCurrentCourse } = coursingStore;
  // Use the full store object as 'coursing' so methods like coursing.getForOrder work
  const coursing = coursingStore;
  // --- FIXED SECTION END ---
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
    show({
      title: "Course Finalized",
      message: `Course ${
        nextCourse - 1
      } complete. New items added to Course ${nextCourse}.`,
      type: "success",
    });
  };

  const handleSendCourseToKitchen = (course: number, forceResend = false) => {
    if (!activeOrder) return;

    // Modified guard logic: Check if sent, unless forcing resend
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

    // Reset status to Preparing (triggers kitchen ticket logic)
    itemsInCourse.forEach((i) => {
      updateItemStatusInActiveOrder(i.id, "Preparing");
    });

    coursing.markCourseSent(activeOrder.id, course);

    if (activeOrder.order_status === "Building") {
      updateOrderStatus(activeOrder.id, "Preparing");
    }

    if (tableId && table?.status !== "In Use") {
      handleAssignToTable();
    }

    show({
      title: forceResend ? "Course Resent" : "Course Sent",
      message: `Course ${course} has been ${forceResend ? "resent" : "sent"} for preparation.`,
      type: "success",
    });
  };

  const handleDoubleTapCourse = (course: number) => {
    if (!activeOrder) return;

    // 1. Check if course is already sent
    const isSent = coursing.isCourseSent(activeOrder.id, course);

    if (isSent) {
      // Secondary Action: Re-Send Safety -> Open Modal
      setCourseToResend(course);
    } else {
      // Primary Action: Draft -> Send Immediately (No Confirmation)
      handleSendCourseToKitchen(course, false);
    }
  };

  // --- Modal Confirmation Handler ---
  const handleConfirmResend = () => {
    if (courseToResend !== null) {
      handleSendCourseToKitchen(courseToResend, true);
      setCourseToResend(null);
    }
  };

  // Close/ Void check behavior
  const handleCloseCheck = () => {
    if (!activeOrder || !tableId) return;
    // If the order is already paid, "closing" it means clearing the table for the next customer.
    if (activeOrder.paid_status === "Paid") {
      handleClearTable();
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
    show({
      title: "Check Voided",
      message: "The order has been successfully voided.",
      type: "success",
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
      show({
        title: "Table Not Found",
        message: "Could not find the table for this order.",
        type: "error",
      });
      return;
    }

    const allItemsReady = activeOrder.items.every(
      (item) => (item.item_status || "Preparing") === "Ready"
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
    show({
      title: "Table Cleared",
      message: `Table(s) ${tablesToClean
        .map((id) => allTables.find((t) => t.id === id)?.name)
        .join(", ")} marked for cleaning.`,
      type: "success",
    });
  };

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

  const handleProceedToPayment = () => {
    pricingSheetRef.current?.close(); // Close the sheet first
    handlePay(); // Call the existing payment logic
  };

  const handleMoreOptionsCloseCheck = () => {
    moreOptionsSheetRef.current?.close();
    handleCloseCheck();
  };

  const handleApplyDiscount = () => {
    moreOptionsSheetRef.current?.close();
    setDiscountOverlayOpen(true); // Open the DiscountOverlay
  };

  const handleApplyVoucher = () => {
    moreOptionsSheetRef.current?.close();
    // Logic for applying voucher
    show({
      title: "Apply Voucher",
      message: "Voucher options will appear here.",
      type: "success",
    });
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

      <DiscountOverlay
        isVisible={isDiscountOverlayOpen}
        onClose={() => setDiscountOverlayOpen(false)}
      />

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
          onSendCourseToKitchen={(course) =>
            handleSendCourseToKitchen(course, false)
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
        onCloseCheck={handleMoreOptionsCloseCheck}
        onApplyDiscount={handleApplyDiscount}
        onApplyVoucher={handleApplyVoucher}
      />

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
                  tableId as string,
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
