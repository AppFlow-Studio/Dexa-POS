import DiscountBottomSheet from "@/components/bill/DiscountBottomSheet";
import ItemProgressTracker from "@/components/bill/ItemProgressTracker";
import MoreOptionsBottomSheet from "@/components/bill/MoreOptionsBottomSheet";
import TableBillSection from "@/components/bill/TableBillSection";
import MenuSection from "@/components/menu/MenuSection";
import OrderInfoHeader from "@/components/tables/OrderInfoHeader";
import TableAlertDialogs from "@/components/tables/TableAlertDialogs";
import TableDetailSkeleton from "@/components/tables/TableDetailSkeleton";
import { colors } from "@/lib/theme";
import { useLoading } from "@/contexts/LoadingContext";
import { useToast } from "@/contexts/ToastContext";
import { isItemReadyOrServed } from "@/lib/kitchenStatusUtils";
import { isActiveSession } from "@/lib/tableStateMachine";
import { useTableCoursing } from "@/hooks/useTableCoursing";
import { useTableDuration } from "@/hooks/useTableDuration";
import { useTablePaymentSync } from "@/hooks/useTablePaymentSync";
import { useTableSession } from "@/hooks/useTableSession";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { PrinterService } from "@/services/printing/PrinterService";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Stack, useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useShallow } from "zustand/react/shallow";

const UpdateTableScreen = () => {
  const router = useRouter();
  const { tableId, source } = useLocalSearchParams<{
    tableId: string;
    source?: string;
  }>();
  const currentTableId = typeof tableId === "string" ? tableId : "";

  const { show } = useToast();
  const { showLoading, hideLoading } = useLoading();
  const { defaultSittingTimeMinutes } = useSettingsStore();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const autoPrintKitchenTickets = useStoreSettingsStore((s) => s.autoPrintKitchenTickets);

  // --- Extracted hooks ---
  const {
    phase,
    activeOrder,
    tableStatus,
    isReady,
    markNavigatingAway,
    markPaymentSyncing,
    markPaymentSyncDone,
  } = useTableSession(currentTableId, source);

  const coursingHook = useTableCoursing(activeOrder);
  useTablePaymentSync(activeOrder?.id, markPaymentSyncing, markPaymentSyncDone);

  const isTableActive = isActiveSession(tableStatus) || tableStatus === "paid";
  const { duration, isOvertime } = useTableDuration(
    activeOrder?.opened_at,
    isTableActive,
  );

  // --- Store selectors (only what's still needed at this level) ---
  const isModifierSidebarOpen = useModifierSidebarStore((s) => s.isOpen);
  const table = useFloorPlanStore((s) => s.tablesById[currentTableId]);
  const session = useTableSessionStore((s) => s.sessions[currentTableId]);
  const updateSessionStatus = useTableSessionStore((s) => s.updateSessionStatus);
  const dispatchAction = useTableSessionStore((s) => s.dispatchAction);
  const openPaymentSheet = usePaymentStore((s) => s.open);

  const updateActiveOrderDetails = useOrderStore((s) => s.updateActiveOrderDetails);
  const updateItemStatusInActiveOrder = useOrderStore((s) => s.updateItemStatusInActiveOrder);
  const updateOrderStatus = useOrderStore((s) => s.updateOrderStatus);
  const syncOrderStatus = useOrderStore((s) => s.syncOrderStatus);

  const { activeOrderId, storeActiveOrderOutstandingTotal, storeActiveOrderTotal } =
    useOrderStore(
      useShallow((s) => ({
        activeOrderId: s.activeOrderId,
        storeActiveOrderOutstandingTotal: s.activeOrderOutstandingTotal,
        storeActiveOrderTotal: s.activeOrderTotal,
      })),
    );

  // --- Bottom sheet refs ---
  const pricingSheetRef = useRef<BottomSheetMethods>(null);
  const moreOptionsSheetRef = useRef<BottomSheetMethods>(null);
  const discountSheetRef = useRef<BottomSheetMethods>(null);

  // --- Alert dialog state ---
  const [isNotReadyConfirmOpen, setNotReadyConfirmOpen] = useState(false);
  const [isClearNotReadyConfirmOpen, setClearNotReadyConfirmOpen] =
    useState(false);
  const [isVoidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [isOrderClosedWarningOpen, setOrderClosedWarningOpen] = useState(false);
  const [courseToResend, setCourseToResend] = useState<number | null>(null);
  const [isReopenModalOpen, setReopenModalOpen] = useState(false);
  const [selectedCourseIdForTracker, setSelectedCourseIdForTracker] = useState<
    number | null
  >(null);
  const [notReadyItems, setNotReadyItems] = useState<
    { id: string; name: string; quantity: number }[]
  >([]);

  // --- Deferred rendering ---
  // Skip skeleton (stage 0) when order data is already in the store (e.g. navigating from tables screen)
  const [renderStage, setRenderStage] = useState(() => {
    const orderState = useOrderStore.getState();
    const oid = orderState.activeOrderId;
    const hasOrder = oid && orderState.ordersById[oid]?.service_location_id === currentTableId;
    return hasOrder ? 1 : 0;
  });
  useEffect(() => {
    let cancelled = false;
    if (renderStage >= 2) return;
    const raf = requestAnimationFrame(() => {
      if (cancelled) return;
      if (renderStage < 1) {
        setRenderStage(1);
        requestAnimationFrame(() => {
          if (!cancelled) setRenderStage(2);
        });
      } else {
        setRenderStage(2);
      }
    });
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf);
    };
  }, []);

  // --- Derived values ---
  const hasPayments = !!activeOrder && (activeOrder.payments?.length || 0) > 0;
  const displayBalanceDue =
    hasPayments ? storeActiveOrderOutstandingTotal : storeActiveOrderTotal;

  const isFullyPaid = useMemo(() => {
    if (activeOrder?.check_status === "Opened") return false;
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

  // Items in selected course (for ItemProgressTracker)
  const itemsInSelectedCourse = useMemo(() => {
    if (!activeOrder || selectedCourseIdForTracker === null) return [];
    return activeOrder.items.filter(
      (item) =>
        (item.courseNumber ?? coursingHook.itemCourseMap?.[item.id] ?? 1) ===
        selectedCourseIdForTracker,
    );
  }, [activeOrder?.items, selectedCourseIdForTracker, coursingHook.itemCourseMap]);

  // --- Action handlers ---

  const handlePay = useCallback(() => {
    if (activeOrder) {
      const preparingItems = activeOrder.items.filter(
        (i) => !isItemReadyOrServed(i),
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
  }, [activeOrder, openPaymentSheet, currentTableId]);

  const handleClearTable = async () => {
    if (!activeOrderId || !activeOrder) return;

    const preparingItems = activeOrder.items.filter(
      (item) => !isItemReadyOrServed(item),
    );

    if (preparingItems.length > 0) {
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

    await doClearTable();
  };

  const doClearTable = async () => {
    if (!activeOrderId || !activeOrder) return;
    showLoading("Clearing table...");
    markNavigatingAway();

    // Recovery: if session isn't at "paid" yet but order IS paid,
    // dispatch FULL_PAYMENT first (fixes stuck check_presented race)
    const sess = useTableSessionStore.getState().getSession(currentTableId);
    if (
      sess &&
      sess.status !== "paid" &&
      sess.status !== "closing" &&
      sess.status !== "cleaning" &&
      activeOrder.paid_status === "Paid"
    ) {
      await dispatchAction({ type: "FULL_PAYMENT", tableId: currentTableId });
    }

    const result = await dispatchAction({
      type: "CLEAR_TABLE",
      tableId: currentTableId,
      orderId: activeOrder.id,
    });

    hideLoading();

    if (result.success) {
      router.replace("/tables");
      show({
        title: "Table Cleared",
        message: "Table marked for cleaning.",
        type: "success",
      });
    } else {
      show({
        title: "Clear Failed",
        message: result.error || "An unexpected error occurred.",
        type: "error",
      });
    }
  };

  const confirmVoid = async () => {
    if (!activeOrder) return;

    if (activeOrder.order_status === "void") {
      setVoidConfirmOpen(false);
      show({
        title: "Already Voided",
        message: "This order has already been voided.",
        type: "warning",
      });
      markNavigatingAway();
      useOrderStore.getState().setActiveOrder(null);
      router.replace("/tables");
      return;
    }

    markNavigatingAway();

    const result = await dispatchAction({
      type: "VOID_ORDER",
      tableId: currentTableId,
      orderId: activeOrder.id,
      dbOrderId: activeOrder.db_order_id,
    });

    if (result.success) {
      setVoidConfirmOpen(false);
      show({
        title: "Check Voided",
        message:
          "The order has been successfully voided. Table marked for cleaning.",
        type: "success",
      });
      router.replace("/tables");
    } else {
      show({
        title: "Void Failed",
        message: result.error || "An unexpected error occurred.",
        type: "error",
      });
    }
  };

  const handleCloseCheck = async () => {
    if (!activeOrder || !currentTableId) return;

    if (displayBalanceDue > 0.01) {
      show({
        title: "Cannot Close Check",
        message: "Outstanding balance must be $0.00 to close check",
        type: "error",
      });
      return;
    }

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
      const result = await dispatchAction({
        type: "CLOSE_CHECK",
        tableId: currentTableId,
        orderId: activeOrder.id,
        dbOrderId: activeOrder.db_order_id,
      });
      if (!result.success) throw new Error(result.error || "Failed to close check");

      // Ensure session reaches "paid" — covers race where markPaymentSyncDone
      // ran before realtime overwrote the status back to "check_presented"
      const sess = useTableSessionStore.getState().getSession(currentTableId);
      if (sess && sess.status !== "paid" && sess.status !== "cleaning") {
        await dispatchAction({ type: "FULL_PAYMENT", tableId: currentTableId });
      }

      updateActiveOrderDetails({ check_status: "Closed" });
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

  const handleReopenCheck = () => {
    if (!activeOrderId || !activeOrder?.db_order_id) return;
    setReopenModalOpen(true);
  };

  const handleConfirmReopen = async () => {
    setReopenModalOpen(false);
    if (!activeOrderId || !activeOrder?.db_order_id) return;

    try {
      showLoading("Reopening check...");
      const result = await dispatchAction({
        type: "REOPEN_CHECK",
        tableId: currentTableId,
        orderId: activeOrder.id,
        dbOrderId: activeOrder.db_order_id,
        reason: "Adding more items",
      });
      if (!result.success) throw new Error(result.error || "Failed to reopen check");

      updateActiveOrderDetails({
        paid_status: "Partial",
        check_status: "Opened",
      });
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
      coursingHook.markCourseServed(activeOrderId, selectedCourseIdForTracker);
    }
    show({
      title: "Items Marked Ready",
      message: "All items in the course have been marked as ready.",
      type: "success",
    });
  };

  const finalizeCurrentCourse = () => {
    if (!activeOrder) return;
    const nextCourse = coursingHook.finalizeCurrentCourse(
      activeOrder.id,
      activeOrder.items.map((i) => i.id),
    );
    show({
      title: "Course Finalized",
      message: `Course ${nextCourse - 1} complete. New items added to Course ${nextCourse}.`,
      type: "success",
    });
  };

  const handleSendCourseToKitchen = async (
    course: number,
    forceResend = false,
  ) => {
    if (!activeOrder) return;

    if (!forceResend && coursingHook.isCourseSent(activeOrder.id, course)) {
      show({
        title: "Already Sent",
        message: `Course ${course} has already been sent to the kitchen.`,
        type: "warning",
      });
      return;
    }

    const state = coursingHook.getForOrder(activeOrder.id);
    const itemsInCourse = activeOrder.items.filter(
      (i) => (i.courseNumber ?? state?.itemCourseMap?.[i.id] ?? 1) === course,
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
    if (!activeOrder.sent_to_kitchen_at) {
      updateActiveOrderDetails({
        sent_to_kitchen_at: new Date().toISOString(),
      });
    }

    // Save original statuses for rollback
    const originalStatuses = itemsInCourse.map((i) => ({
      id: i.id,
      item_status: i.item_status,
      kitchen_status: i.kitchen_status,
    }));

    // Optimistically mark items as preparing
    itemsInCourse.forEach((i) => {
      updateItemStatusInActiveOrder(i.id, "preparing");
    });

    // Collect db item IDs for the effect
    const dbItemIds = itemsInCourse
      .map((i) => i.db_order_item_id)
      .filter((id): id is string => !!id);

    // Dispatch: transitions to "ordered" + fires backend sync effect
    const result = await dispatchAction({
      type: "SEND_TO_KITCHEN",
      tableId: currentTableId,
      courseNumber: course,
      itemIds: itemsInCourse.map((i) => i.id),
      dbItemIds,
      orderId: activeOrder.id,
      dbOrderId: activeOrder.db_order_id,
      forceResend,
    });

    if (result.success) {
      coursingHook.markCourseSent(activeOrder.id, course);

      // Auto-print kitchen tickets for the sent items
      if (autoPrintKitchenTickets && selectedStore) {
        PrinterService.printKitchenTickets(activeOrder, itemsInCourse, selectedStore)
          .catch((e) => console.warn("[TableView] Auto-print kitchen tickets failed:", e));
      }

      if (activeOrder.order_status === "draft") {
        updateOrderStatus(activeOrder.id, "sent_to_kitchen");
      }

      show({
        title: forceResend ? "Course Resent" : "Course Sent",
        message: `Course ${course} has been ${forceResend ? "resent" : "sent"} for preparation.`,
        type: "success",
      });
    } else {
      // Revert item statuses on failure
      const orderStore = useOrderStore.getState();
      const oid = orderStore.activeOrderId;
      if (oid) {
        useOrderStore.setState((state) => {
          const order = state.ordersById[oid];
          if (!order) return;
          for (const orig of originalStatuses) {
            const item = order.items.find((i) => i.id === orig.id);
            if (item) {
              item.item_status = orig.item_status;
              item.kitchen_status = orig.kitchen_status;
            }
          }
        });
      }

      show({
        title: "Send Failed",
        message: result.error || "Failed to send course to kitchen.",
        type: "error",
      });
    }
  };

  const handleDoubleTapCourse = (course: number) => {
    if (!activeOrder) return;
    if (coursingHook.isCourseSent(activeOrder.id, course)) {
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

  const checkOrderClosedAndWarn = useCallback(() => {
    if (isFullyPaid || activeOrder?.check_status === "Closed") {
      setOrderClosedWarningOpen(true);
      return true;
    }
    return false;
  }, [isFullyPaid, activeOrder?.check_status]);

  const handleSelectCourse = useCallback(
    (courseId: number | null) => {
      setSelectedCourseIdForTracker(courseId);
      if (activeOrder && courseId !== null) {
        coursingHook.setCurrentCourse(activeOrder.id, courseId);
      }
    },
    [activeOrder?.id, coursingHook.setCurrentCourse],
  );

  const handleSetCurrentCourse = useCallback(
    (course: number) => {
      if (activeOrder?.id) {
        coursingHook.setCurrentCourse(activeOrder.id, course);
      }
    },
    [activeOrder?.id, coursingHook.setCurrentCourse],
  );

  const handlePressMore = useCallback(
    () => moreOptionsSheetRef.current?.expand(),
    [],
  );

  const handlePressTotal = useCallback(
    () => pricingSheetRef.current?.expand(),
    [],
  );

  const handleClosePricingSheet = useCallback(
    () => pricingSheetRef.current?.close(),
    [],
  );

  const handleProceedToPayment = useCallback(() => {
    pricingSheetRef.current?.close();
    handlePay();
  }, [handlePay]);

  // --- Memoized course content ---
  const isCurrentCourseSent = useMemo(() => {
    if (!activeOrder?.id) return false;
    const coursingState = coursingHook.getForOrder(activeOrder.id);
    const workingCourse = coursingState?.workingCourse ?? 1;
    return coursingHook.isCourseSent(activeOrder.id, workingCourse);
  }, [activeOrder?.id, coursingHook.getForOrder, coursingHook.isCourseSent]);

  // --- Render ---

  if (!isReady && phase !== "ready" && phase !== "payment_syncing") {
    return <TableDetailSkeleton />;
  }

  if (!table) {
    return (
      <View className="flex-1 items-center justify-center bg-screen">
        <Text className="text-xl font-bold" style={{ color: colors.danger }}>Table not found!</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-screen">
      <Stack.Screen
        options={{
          headerLeft: () => (
            <TouchableOpacity
              onPress={() => {
                if (source) {
                  router.replace(source as any);
                } else {
                  router.replace("/tables");
                }
              }}
              className="flex-row items-center -ml-2 p-2"
            >
              <ChevronLeft color={colors.heading} size={26} />
              <Text className="text-heading text-lg font-medium ml-1">Back</Text>
            </TouchableOpacity>
          ),
          headerStyle: { backgroundColor: colors.screen },
          headerShadowVisible: false,
          headerTitle: "",
          headerTintColor: colors.heading,
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

      {/* Stage 1: OrderInfoHeader + TableBillSection (user sees their bill first) */}
      {renderStage >= 1 ? (
        <>
          <View className="px-2 mt-2">
            <OrderInfoHeader duration={duration} tableId={currentTableId} />
          </View>

          <View className="flex-1 flex-row">
            <TableBillSection
              showOrderDetails={false}
              itemCourseMap={coursingHook.itemCourseMap}
              sentCourses={coursingHook.sentCourses}
              currentCourse={coursingHook.currentCourse}
              onSelectCourse={handleSelectCourse}
              setCurrentCourse={handleSetCurrentCourse}
              onDoubleTapCourse={handleDoubleTapCourse}
              activeOrder={activeOrder}
              onPressMore={handlePressMore}
              onPressTotal={handlePressTotal}
              onPressReopenCheck={handleReopenCheck}
              onPressCloseCheck={handleCloseCheck}
              onPressClearTable={handleClearTable}
              totalDisplayAmount={displayBalanceDue}
              pricingSheetRef={
                pricingSheetRef as React.RefObject<BottomSheetMethods>
              }
              onClosePricingSheet={handleClosePricingSheet}
              onPressProceedToPayment={handleProceedToPayment}
              onPressStartNewCourse={finalizeCurrentCourse}
              isFullyPaid={isFullyPaid}
            />
            <View className="flex-1 p-4 px-3 pt-0">
              {/* Stage 2: MenuSection (heavier — deferred to avoid blocking modifier animation) */}
              {renderStage >= 2 ? (
                isCurrentCourseSent ? (
                  <View className="flex-1 justify-center items-center">
                    <TouchableOpacity
                      onPress={finalizeCurrentCourse}
                      className="flex-row items-center gap-1.5 px-4 py-2 rounded-lg border border-teal"
                      activeOpacity={0.8}
                    >
                      <Text className="font-semibold text-teal text-base">
                        + New Course
                      </Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <MenuSection
                    onOrderClosedCheck={checkOrderClosedAndWarn}
                    isTableOrder={true}
                  />
                )
              ) : (
                <View className="flex-1 items-center justify-center">
                  <Text className="text-gray-500">Loading menu...</Text>
                </View>
              )}
            </View>
          </View>
        </>
      ) : (
        <TableDetailSkeleton />
      )}

      {/* Stage 2: Defer heavy bottom sheets and dialogs */}
      {renderStage >= 2 && (
        <>
          {selectedCourseIdForTracker !== null && (
            <ItemProgressTracker
              selectedCourse={selectedCourseIdForTracker}
              itemsInSelectedCourse={itemsInSelectedCourse}
              isModifierSidebarOpen={isModifierSidebarOpen}
              onMarkAllReady={handleMarkAllReadyForCourse}
              isCourseSent={coursingHook.isCourseSent(
                activeOrder?.id || "",
                selectedCourseIdForTracker,
              )}
            />
          )}

          <MoreOptionsBottomSheet
            ref={moreOptionsSheetRef}
            onVoidSuccess={async () => {
              markNavigatingAway();
              useOrderStore.getState().setActiveOrder(null);
              await useTableSessionStore.getState().clearTableSession(currentTableId);
              show({
                title: "Check Voided",
                message:
                  "The order has been successfully voided. Table is now available.",
                type: "success",
              });
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

          <TableAlertDialogs
            isNotReadyConfirmOpen={isNotReadyConfirmOpen}
            onNotReadyConfirmChange={setNotReadyConfirmOpen}
            onPayAnyway={() => {
              setNotReadyConfirmOpen(false);
              pricingSheetRef.current?.close();
              openPaymentSheet("Card", currentTableId, "payment-method-selection");
            }}
            isClearNotReadyConfirmOpen={isClearNotReadyConfirmOpen}
            onClearNotReadyConfirmChange={setClearNotReadyConfirmOpen}
            onClearAnyway={async () => {
              setClearNotReadyConfirmOpen(false);
              await doClearTable();
            }}
            notReadyItems={notReadyItems}
            isVoidConfirmOpen={isVoidConfirmOpen}
            onVoidConfirmChange={setVoidConfirmOpen}
            onConfirmVoid={confirmVoid}
            isOrderClosedWarningOpen={isOrderClosedWarningOpen}
            onOrderClosedWarningChange={setOrderClosedWarningOpen}
            courseToResend={courseToResend}
            onCourseResendChange={setCourseToResend}
            onConfirmResend={handleConfirmResend}
            isReopenModalOpen={isReopenModalOpen}
            onReopenModalClose={() => setReopenModalOpen(false)}
            onConfirmReopen={handleConfirmReopen}
          />
        </>
      )}
    </View>
  );
};

export default UpdateTableScreen;
