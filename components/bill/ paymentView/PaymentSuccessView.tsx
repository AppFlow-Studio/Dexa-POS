"use no memo";

import { useUiScale } from "@/lib/uiScale";
import { useToast } from "@/contexts/ToastContext";
import { colors } from "@/lib/theme";
import { PrinterService } from "@/services/printing/PrinterService";
import { finalizeDineInPaymentClear } from "@/services/tables/finalizeDineInPaymentClear";
import {
  findLatestReusableEmptyDraftId,
  getRefreshedReusableDraftNumbers,
} from "@/lib/reusableEmptyDraft";
import { useNoPrinterModalStore } from "@/stores/useNoPrinterModalStore";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useDineInStore } from "@/stores/useDineInStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { Check, ChevronUp, Layers, Mail, MessageSquare, Printer } from "lucide-react-native";
import { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, Text, TouchableOpacity, View } from "react-native";
import Animated, { FadeIn, FadeInUp } from "react-native-reanimated";
import { iosOnly } from "@/lib/safeAnimations";
import SendReceiptSheet from "@/components/receipts/SendReceiptSheet";
import SplitReceiptSelectorModal from "@/components/bill/SplitReceiptSelectorModal";
import type { SendReceiptDeliveryMethod } from "@/services/messaging/sendReceiptService";

const PaymentSuccessView = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const close = usePaymentStore((s) => s.close);
  const paymentMethod = usePaymentStore((s) => s.paymentMethod);
  const completedPaymentInfo = usePaymentStore((s) => s.completedPaymentInfo);
  const activeTableId = usePaymentStore((s) => s.activeTableId);
  const updateSessionStatus = useFloorPlanStore((s) => s.updateSessionStatus);
  const { show } = useToast();

  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const autoPrintReceipt = useLocationConfigStore((s) => s.config.printing.autoPrintReceipt);
  const autoPrintSplitReceipts = useLocationConfigStore((s) => s.config.printing.autoPrintSplitReceipts);

  const activeOrderId = useOrderStore((s) => s.activeOrderId);

  const [isPrinting, setIsPrinting] = useState(false);
  const [printMenuOpen, setPrintMenuOpen] = useState(false);
  const [splitSelectorOpen, setSplitSelectorOpen] = useState(false);
  const [receiptSheet, setReceiptSheet] = useState<{
    open: boolean;
    method: SendReceiptDeliveryMethod;
  }>({ open: false, method: "email" });
  // const { addSaleEvent, forceRefresh } = useAnalyticsStore();
  // NOTE: Payment was already processed by handlePaymentCompletion
  // before navigating to this view. No need to call addPaymentToOrder again.

  // Ensure isDirty is false when this view mounts, as payment is complete
  useEffect(() => {
    usePaymentStore.getState().setPaymentClean();
  }, []);

  // Auto-print receipt on mount when setting enabled.
  // For split orders with per-portion auto-print on, each portion already
  // printed its own receipt (in usePaymentStore) — skip the combined one to
  // avoid double-printing. The combined receipt stays available via the manual
  // Print button and the reprint selector.
  useEffect(() => {
    if (autoPrintReceipt && activeOrderId) {
      const order = useOrderStore.getState().ordersById[activeOrderId];
      const printedPerPortion =
        !!order?.split_payment_path && autoPrintSplitReceipts;
      if (order && selectedStore && !printedPerPortion) {
        PrinterService.printReceipt(order, selectedStore)
          .catch((e) => console.warn("[PaymentSuccessView] Auto-print receipt failed:", e));
      }
    }
  }, []); // Run once on mount — payment just completed

  const activeOrder = useActiveOrder();
  const items = activeOrder?.items || [];
  const isSplitPaid = !!activeOrder?.split_payment_path;
  // console.log("[PaymentSuccessView] items", items);
  // console.log("[PaymentSuccessView] activeOrder", activeOrder);
  const handleDone = () => {
    const {
      activeOrderId,
      setOpenedAt,
      updateOrderStatus,
      markOrderAsPaid,
      startNewOrder,
      setActiveOrder,
      archiveOrder,
      sendNewItemsToKitchenForOrder,
    } = useOrderStore.getState();

    // Per-order PIN attribution: the order is now fully paid/closed. Drop the
    // verified staff so the next order re-opens the PIN gate. Held through
    // payment so the order AND its payment were credited to the same person.
    useEmployeeStore.getState().clearOrderAttributionStaff();

    // Analytics...
    // const saleEvents = items.map((item) => ({
    //   date: new Date().toISOString(),
    //   itemName: item.name,
    //   menuItemId: item.menuItemId,
    //   quantitySold: item.quantity,
    //   salePrice: item.price,
    //   costOfGoods: getMenuItemCostOfGoods(item.menuItemId, menuItems),
    //   category: getMenuItemCategory(item.menuItemId, menuItems),
    //   employeeId: activeOrder?.server_name || "Unknown",
    //   paymentMethod: paymentMethod || "Card",
    //   orderId: activeOrderId || undefined,
    // }));
    // addSaleEvent(saleEvents);
    // setTimeout(() => {
    //   try {
    //     forceRefresh();
    //   } catch {}
    // }, 150);

    // Dine-in: detect via activeTableId (set when sheet opened, stable until
    // close()) rather than activeOrder.order_type, because `auto_on_payment`
    // archiving nulls out activeOrderId via queueMicrotask before the operator
    // can tap Finalize Payment — especially visible on multi-check where the
    // last paid check is archived. Run the auto-clear (per Auto-Clear Table on
    // Payment setting). If the helper short-circuits (setting off, sibling
    // checks still due, no session), preserve the legacy "just close, keep the
    // paid order" behavior. When it does clear, hand the operator a fresh
    // draft so the order-processing screen doesn't end up pointing at the
    // archived order; TableOrderView's session-disappeared effect handles
    // /tables navigation.
    if (activeTableId) {
      const { cleared } = finalizeDineInPaymentClear({ tableId: activeTableId });
      if (!cleared) {
        close();
        return;
      }
      useDineInStore.getState().clearSelectedTable();

      setTimeout(() => {
        const { orderIds: latestOrderIds, ordersById: latestOrdersById } =
          useOrderStore.getState();
        const reusableEmptyDraftId = findLatestReusableEmptyDraftId(
          latestOrdersById,
          latestOrderIds,
          activeOrderId,
          useStoreSettingsStore.getState().selectedStation?.id ?? null,
        );

        if (reusableEmptyDraftId) {
          useOrderStore.setState((state) => {
            const draft = state.ordersById[reusableEmptyDraftId];
            if (!draft) return;
            // Reset stale dine-in fields so the bill shows as a clean new order.
            draft.order_type = "takeout";
            draft.service_location_id = null;
            draft.session_id = undefined;
            draft.local_session_id = undefined;
            if (selectedStore) {
              const refreshedNumbers = getRefreshedReusableDraftNumbers({
                draftId: reusableEmptyDraftId,
                ordersById: latestOrdersById,
                orderIds: latestOrderIds,
                locationId: selectedStore.id,
                stationNumber:
                  useStoreSettingsStore.getState().selectedStation
                    ?.station_number ?? null,
              });
              if (refreshedNumbers) {
                draft.order_number = refreshedNumbers.orderNumber;
                draft.display_number = refreshedNumbers.displayNumber;
              }
            }
          });
          setActiveOrder(reusableEmptyDraftId);
        } else {
          const fresh = startNewOrder();
          setActiveOrder(fresh.id);
        }
      }, 100);

      close();
      return;
    }

    // NOTE: handleDone is the explicit "Start New Order" button — it always
    // creates, even when auto-create is off. The auto-create
    // suppression lives in the AUTOMATIC post-payment path
    // (usePaymentStore.handleSuccessClose), not here.

    // For quick service / takeout, start a new order immediately
    setTimeout(() => {
      const { orderIds, ordersById } = useOrderStore.getState();
      const reusableEmptyDraftId = findLatestReusableEmptyDraftId(
        ordersById,
        orderIds,
        activeOrderId,
        useStoreSettingsStore.getState().selectedStation?.id ?? null,
      );

      if (reusableEmptyDraftId) {
        if (selectedStore) {
          const stationNumber =
            useStoreSettingsStore.getState().selectedStation?.station_number ??
            null;
          const refreshedNumbers = getRefreshedReusableDraftNumbers({
            draftId: reusableEmptyDraftId,
            ordersById,
            orderIds,
            locationId: selectedStore.id,
            stationNumber,
          });

          if (refreshedNumbers) {
            useOrderStore.setState((state) => {
              const draft = state.ordersById[reusableEmptyDraftId];
              if (!draft) return;
              draft.order_number = refreshedNumbers.orderNumber;
              draft.display_number = refreshedNumbers.displayNumber;
            });
          }
        }

        setActiveOrder(reusableEmptyDraftId);
        return;
      }

      const newOrder = startNewOrder();
      setActiveOrder(newOrder.id);
    }, 100);

    // Only update these for non-completed orders (which shouldn't happen here anyway)
    // but kept for safety if flow changes
    if (activeOrderId && activeOrder?.check_status !== "Closed") {
      setOpenedAt(activeOrderId, new Date().toISOString());

      const currentOrder = activeOrderId
        ? useOrderStore.getState().ordersById[activeOrderId]
        : undefined;

      if (currentOrder?.order_status === "draft") {
        sendNewItemsToKitchenForOrder(activeOrderId);
      }
    }

    if (
      activeOrder?.order_type === "takeout" &&
      activeOrder.order_status === "ready"
    ) {
      setTimeout(() => archiveOrder(activeOrder?.id), 500);
    }
    close();
  };

  const handlePrint = async () => {
    if (!activeOrder || !selectedStore) {
      show({ title: "Print Error", message: "No order or store available.", type: "error" });
      return;
    }
    setIsPrinting(true);
    try {
      const success = await PrinterService.printReceipt(activeOrder, selectedStore);
      if (success) {
        show({ title: "Printing Receipt", message: "Sent to printer.", type: "success" });
      } else {
        useNoPrinterModalStore.getState().show("receipt");
      }
    } catch (e) {
      console.warn("[PaymentSuccessView] Print failed:", e);
      show({ title: "Print Error", message: "Failed to send to printer.", type: "error" });
    } finally {
      setIsPrinting(false);
    }
  };

  const handlePrintAllSplits = async () => {
    if (!activeOrder || !selectedStore) {
      show({ title: "Print Error", message: "No order or store available.", type: "error" });
      return;
    }
    setIsPrinting(true);
    try {
      const success = await PrinterService.printAllSplitReceipts(activeOrder, selectedStore);
      if (success) {
        show({ title: "Printing Split Receipts", message: "Sent to printer.", type: "success" });
      } else {
        useNoPrinterModalStore.getState().show("receipt");
      }
    } catch (e) {
      console.warn("[PaymentSuccessView] Print all splits failed:", e);
      show({ title: "Print Error", message: "Failed to send to printer.", type: "error" });
    } finally {
      setIsPrinting(false);
    }
  };

  const openSendReceipt = (method: SendReceiptDeliveryMethod) => {
    if (!activeOrder?.db_order_id) {
      show({
        title: "Not synced yet",
        message: "Order is still syncing. Try again in a moment.",
        type: "error",
      });
      return;
    }
    setReceiptSheet({ open: true, method });
  };

  return (
    <View className="flex-1 justify-between" style={{ backgroundColor: colors.screen }}>
      {/* Main Content - Centered vertically if possible */}
      <View className="flex-1 justify-center items-center px-6" style={{ paddingTop: s(28), paddingBottom: s(28) }}>
        {/* Success Icon */}
        <Animated.View
          entering={iosOnly(FadeIn.delay(100))}
          className="items-center mb-6"
          style={{ marginTop: s(8) }}
        >
          <View style={{ width: s(80), height: s(80), backgroundColor: colors.success + "15", borderRadius: s(40), alignItems: "center", justifyContent: "center", marginBottom: s(20), borderWidth: 2, borderColor: colors.success + "40" }}>
            <Check color={colors.success} size={s(44)} strokeWidth={3.5} />
          </View>
          <Text style={{ fontSize: s(28), fontWeight: "800", color: colors.heading, marginBottom: s(8) }}>
            Payment Successful
          </Text>
          <Text style={{ fontSize: s(14), color: colors.label, fontWeight: "600" }}>
            {(completedPaymentInfo?.paymentMethod || paymentMethod || "Card")} Payment
          </Text>
        </Animated.View>

        {/* Compact Receipt Card */}
        <Animated.View
          entering={iosOnly(FadeInUp.delay(200))}
          style={{ width: "100%", maxWidth: s(400), backgroundColor: colors.panel, borderRadius: s(16), borderWidth: 1, borderColor: colors.border, padding: s(22), alignItems: "center" }}
        >
          {/* Use captured payment info from store to prevent real-time sync overwrites */}
          {(() => {
            // Read from completedPaymentInfo snapshot instead of live payments
            // Fall back to calculating from payments if completedPaymentInfo is not set
            // (shouldn't happen, but provides safety)
            let totalPaid = completedPaymentInfo?.totalPaid ?? 0;
            let totalTips = completedPaymentInfo?.totalTips ?? 0;
            if (!completedPaymentInfo) {
              // Fallback: calculate from live payments (original behavior)
              // For cash-priced payments, p.amount is the card-equivalent stored by the
              // backend. Subtract cashSavings to recover the actual cash amount collected.
              const payments = activeOrder?.payments || [];
              totalPaid = payments.reduce((sum, p) => {
                const gross = (p.amount || 0) - (p.refundedAmount || 0);
                const actual = p.isCashPriced && p.cashSavings
                  ? gross - p.cashSavings
                  : gross;
                return sum + actual;
              }, 0);
              totalTips = payments.reduce((sum, p) => {
                const tip = (p as any)?.tipAmount || p?.tip_amount || 0;
                return sum + tip;
              }, 0);
              console.warn(
                "[PaymentSuccessView] completedPaymentInfo not set, using fallback calculation"
              );
            }

            const grandTotal = totalPaid + totalTips;

            return (
              <>
                {totalTips > 0 ? (
                  <>
                    <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: s(4) }}>
                      Bill Total
                    </Text>
                    <Text style={{ fontSize: s(26), fontWeight: "700", color: colors.heading, marginBottom: s(10) }}>
                      ${totalPaid.toFixed(2)}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: s(10) }}>
                      <Text style={{ color: colors.muted, fontSize: s(12), marginRight: s(8) }}>Tip:</Text>
                      <Text style={{ color: colors.success, fontSize: s(17), fontWeight: "700" }}>
                        +${totalTips.toFixed(2)}
                      </Text>
                    </View>
                    <View style={{ width: "100%", height: 1, backgroundColor: colors.border, marginBottom: s(12) }} />
                    <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: s(4) }}>
                      Grand Total
                    </Text>
                    <Text style={{ fontSize: s(38), fontWeight: "800", color: colors.teal, marginBottom: s(14) }}>
                      ${grandTotal.toFixed(2)}
                    </Text>
                  </>
                ) : (
                  <>
                    <Text style={{ color: colors.muted, fontSize: s(11), fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: s(4) }}>
                      Total Paid
                    </Text>
                    <Text style={{ fontSize: s(42), fontWeight: "800", color: colors.teal, marginBottom: s(24) }}>
                      ${totalPaid.toFixed(2)}
                    </Text>
                  </>
                )}
              </>
            );
          })()}

          <View style={{ width: "100%", height: 1, backgroundColor: colors.border, marginBottom: s(18) }} />

          <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%", marginBottom: s(12) }}>
            <Text style={{ color: colors.muted, fontSize: s(13) }}>Transaction ID</Text>
            <Text style={{ color: colors.heading, fontWeight: "600", fontSize: s(13) }}>
              #{activeOrder?.id.slice(-6).toUpperCase()}
            </Text>
          </View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", width: "100%" }}>
            <Text style={{ color: colors.muted, fontSize: s(13) }}>Date</Text>
            <Text style={{ color: colors.heading, fontWeight: "600", fontSize: s(13) }}>
              {new Date().toLocaleDateString()}
            </Text>
          </View>
        </Animated.View>
      </View>

      {/* Backdrop to dismiss the print dropdown on outside tap */}
      {printMenuOpen && (
        <Pressable
          onPress={() => setPrintMenuOpen(false)}
          style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, zIndex: 50 }}
        />
      )}

      {/* Footer Actions - Fixed at Bottom */}
      <View style={{ width: "100%", backgroundColor: colors.panel, paddingTop: s(12), paddingBottom: s(16), borderTopWidth: 1, borderTopColor: colors.border, zIndex: printMenuOpen ? 100 : 0 }}>
        <View style={{ paddingHorizontal: s(20), gap: s(10) }}>
          {/* Secondary Actions Row */}
          <View style={{ flexDirection: "row", gap: s(8) }}>
            {/* Print — split-paid orders get a dropdown of receipt options */}
            <View style={{ flex: 1, position: "relative", zIndex: printMenuOpen ? 50 : 1 }}>
              <TouchableOpacity
                onPress={() => {
                  if (isSplitPaid) {
                    setPrintMenuOpen((o) => !o);
                  } else {
                    handlePrint();
                  }
                }}
                disabled={isPrinting}
                style={{ width: "100%", paddingVertical: s(8), backgroundColor: colors.card, borderRadius: s(8), borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: s(4), opacity: isPrinting ? 0.6 : 1 }}
              >
                {isPrinting ? (
                  <ActivityIndicator size="small" color={colors.label} />
                ) : (
                  <Printer size={s(13)} color={colors.label} />
                )}
                <Text style={{ color: colors.heading, fontWeight: "600", fontSize: s(11) }}>
                  {isPrinting ? "Printing..." : "Print"}
                </Text>
                {isSplitPaid && !isPrinting && (
                  <ChevronUp size={s(12)} color={colors.label} />
                )}
              </TouchableOpacity>

              {isSplitPaid && printMenuOpen && (
                <View
                  style={{
                    position: "absolute",
                    bottom: "100%",
                    marginBottom: s(10),
                    // Center the menu horizontally over the Print button.
                    left: "50%",
                    width: s(320),
                    marginLeft: -s(320) / 2,
                    backgroundColor: colors.panel,
                    borderRadius: s(14),
                    borderWidth: 1,
                    borderColor: colors.border,
                    paddingVertical: s(6),
                    zIndex: 50,
                    shadowColor: "#000",
                    shadowOffset: { width: 0, height: 4 },
                    shadowOpacity: 0.22,
                    shadowRadius: s(12),
                    elevation: 10,
                  }}
                >
                  {[
                    { icon: <Printer size={s(20)} color={colors.label} />, label: "Print Combined Receipt", onPress: handlePrint },
                    { icon: <Layers size={s(20)} color={colors.teal} />, label: "Print Split Receipts…", onPress: () => setSplitSelectorOpen(true) },
                    { icon: <Printer size={s(20)} color={colors.teal} />, label: "Print All Split Receipts", onPress: handlePrintAllSplits },
                  ].map((item, idx) => (
                    <TouchableOpacity
                      key={item.label}
                      onPress={() => {
                        setPrintMenuOpen(false);
                        item.onPress();
                      }}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: s(14),
                        paddingVertical: s(15),
                        paddingHorizontal: s(18),
                        borderTopWidth: idx === 0 ? 0 : 1,
                        borderTopColor: colors.border,
                      }}
                    >
                      {item.icon}
                      <Text style={{ color: colors.heading, fontWeight: "600", fontSize: s(15) }}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            <TouchableOpacity
              onPress={() => openSendReceipt("email")}
              style={{ flex: 1, paddingVertical: s(8), backgroundColor: colors.card, borderRadius: s(8), borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: s(4) }}
            >
              <Mail size={s(13)} color={colors.label} />
              <Text style={{ color: colors.heading, fontWeight: "600", fontSize: s(11) }}>Email</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => openSendReceipt("sms")}
              style={{ flex: 1, paddingVertical: s(8), backgroundColor: colors.card, borderRadius: s(8), borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: s(4) }}
            >
              <MessageSquare size={s(13)} color={colors.label} />
              <Text style={{ color: colors.heading, fontWeight: "600", fontSize: s(11) }}>Text</Text>
            </TouchableOpacity>
          </View>

          {/* Primary Action */}
          <TouchableOpacity
            onPress={handleDone}
            style={{ width: "100%", paddingVertical: s(10), backgroundColor: colors.teal, borderRadius: s(8), alignItems: "center", shadowColor: colors.teal, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.2, shadowRadius: 4, elevation: 3 }}
          >
            <Text style={{ color: colors.onSolid, fontWeight: "700", fontSize: s(13) }}>
              {activeOrder?.order_type === "dine_in" || activeOrder?.order_type == 'Dine In'
                ? "Finalize Payment"
                : "Start New Order"}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <SendReceiptSheet
        isOpen={receiptSheet.open}
        onClose={() => setReceiptSheet((s) => ({ ...s, open: false }))}
        dbOrderId={activeOrder?.db_order_id ?? null}
        defaultMethod={receiptSheet.method}
        defaultEmail={activeOrder?.customer_email}
        defaultPhone={activeOrder?.customer_phone}
      />

      <SplitReceiptSelectorModal
        isOpen={splitSelectorOpen}
        onClose={() => setSplitSelectorOpen(false)}
        order={activeOrder ?? null}
        location={selectedStore ?? null}
      />
    </View>
  );
};

export default PaymentSuccessView;