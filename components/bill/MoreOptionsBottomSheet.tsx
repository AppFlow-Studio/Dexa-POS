import { useToast } from "@/contexts/ToastContext";
import { PrinterService } from "@/services/printing/PrinterService";
import { useNoPrinterModalStore } from "@/stores/useNoPrinterModalStore";
import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { MerchantRole } from "@/lib/types";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { CheckCircle2, ChevronRight, Lock, Printer, Tag, Trash2, User, X } from "lucide-react-native";
import React, { forwardRef, useMemo, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { bottomSheetTheme, colors } from "@/lib/theme";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import PinDisplay from "../auth/PinDisplay";
import PinNumpad from "../auth/PinNumpad";
import ConfirmationModal from "../settings/reset-application/ConfirmationModal";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

interface MoreOptionsProps {
  discountSheetRef?: React.RefObject<BottomSheetMethods>;
  onVoidSuccess?: () => void;
  onCloseCheck?: () => void;
  onNoSale?: () => void;
}

const MoreOptionsComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  MoreOptionsProps
> = function MoreOptionsComponent(
  { discountSheetRef, onVoidSuccess, onCloseCheck, onNoSale },
  ref
) {
  const snapPoints = useMemo(() => ["75%"], []);
  const [orderNotes, setOrderNotes] = useState("");
  const [showManagerPin, setShowManagerPin] = useState(false);
  const [managerPin, setManagerPin] = useState("");
  const [isClearCartConfirmOpen, setClearCartConfirmOpen] = useState(false);
  const [isVoidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const [showRefundedDiscountDialog, setShowRefundedDiscountDialog] = useState(false);
  const [isPrintingReceipt, setIsPrintingReceipt] = useState(false);
  const [isPrintingKitchen, setIsPrintingKitchen] = useState(false);
  const { show } = useToast();

  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  // Animation values for shake effect
  const shakeX = useSharedValue(0);

  const { openSheet } = useCustomerSheetStore();

  // FIX: Use individual selectors to prevent unnecessary re-renders
  const activeOrderId = useOrderStore((state) => state.activeOrderId);
  const clearCart = useOrderStore((state) => state.clearCart);
  const voidOrder = useOrderStore((state) => state.voidOrder);

  // FIX: Get the active order directly without using orders array
  const activeOrder = useOrderStore(
    (state) => state.ordersById[state?.activeOrderId || ""]
  );

  // Calculate if balance is zero for Close Check option
  const hasItems = (activeOrder?.items?.length ?? 0) > 0;
  const balance = activeOrder?.amount_due ?? 0;
  const isBalanceZero = hasItems && balance <= 0;

  // Check if order has refunds - if so, discounts cannot be applied
  const hasRefunds = useMemo(() => {
    const payments = activeOrder?.payments || [];
    return payments.some((p) => (p.refundedAmount ?? 0) > 0);
  }, [activeOrder?.payments]);
  const canApplyDiscount = !hasRefunds;

  const handleClearCart = () => {
    setClearCartConfirmOpen(true);
  };

  const onConfirmClearCart = () => {
    clearCart();
    setClearCartConfirmOpen(false);
    if (ref && "current" in ref && ref.current) {
      ref.current.close();
    }
    show({
      title: "Cart Cleared",
      message: "All items have been removed from the cart.",
      type: "success",
    });
  };

  const handleVoidOrderClick = () => {
    if (ref && "current" in ref && ref.current) {
      ref.current.close();
    }
    setTimeout(() => {
      setVoidConfirmOpen(true);
    }, 250);
  };

  const onConfirmVoid = async () => {
    if (activeOrderId && activeOrder) {
      // Dispatch VOID_ORDER — the effect handles inventory deduction + void
      const sessionStore = useTableSessionStore.getState();
      const dispatchAction = sessionStore.dispatchAction;

      // Resolve real table UUID via session_id → sessionTableIndex
      const sessionId = activeOrder.session_id;
      const tableId = sessionId
        ? (sessionStore.sessionTableIndex[sessionId]?.[0] ?? "")
        : "";

      if (tableId) {
        await dispatchAction({
          type: "VOID_ORDER",
          tableId,
          orderId: activeOrder.id,
          dbOrderId: activeOrder.db_order_id,
        });
      } else {
        // Fallback for non-table orders: use voidOrder directly
        voidOrder(activeOrderId);
      }

      setVoidConfirmOpen(false);
      show({
        title: "Order Voided",
        message: "The current order has been successfully voided.",
        type: "success",
      });
      onVoidSuccess?.();
    }
  };

  const handleManagerPinSubmit = async () => {
    // Verify PIN against actual employee database
    const MANAGER_ROLES: MerchantRole[] = ["merchant.manager", "merchant.admin", "merchant.owner"];
    const employee = useEmployeeStore.getState().findEmployeeByPin(managerPin);
    const isManager = employee && MANAGER_ROLES.includes(employee.role);

    if (isManager) {
      show({
        title: "Tax Exempt Enabled",
        message: "The order is now tax-exempt.",
        type: "success",
      });
      setShowManagerPin(false);
      setManagerPin("");
    } else {
      // Trigger shake animation for wrong PIN
      shakeX.value = withSequence(
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(-10, { duration: 100 }),
        withTiming(10, { duration: 100 }),
        withTiming(0, { duration: 100 })
      );
      setManagerPin("");
      show({
        title: "Invalid PIN",
        message: employee
          ? "This employee does not have manager access."
          : "The PIN you entered does not match any employee.",
        type: "error",
      });
    }
  };

  const handleAddCustomer = () => {
    if (ref && "current" in ref && ref.current) {
      ref.current.close();
    }
    setTimeout(() => {
      openSheet();
    }, 250);
  };

  const handleOpenDiscounts = () => {
    // Show dialog if order has refunds
    if (!canApplyDiscount) {
      setShowRefundedDiscountDialog(true);
      return;
    }
    
    if (ref && "current" in ref && ref.current) {
      ref.current.close();
    }
    setTimeout(() => {
      discountSheetRef?.current?.expand();
    }, 250);
  };

  const handlePrintReceipt = async () => {
    if (!activeOrder || !selectedStore || !hasItems) return;
    setIsPrintingReceipt(true);
    try {
      const success = await PrinterService.printReceipt(activeOrder, selectedStore);
      if (success) {
        show({ title: "Receipt Sent", message: "Receipt sent to printer.", type: "success" });
      } else {
        useNoPrinterModalStore.getState().show("receipt");
      }
    } catch (e: any) {
      show({ title: "Print Error", message: e?.message || "Failed to print receipt.", type: "error" });
    } finally {
      setIsPrintingReceipt(false);
    }
    if (ref && "current" in ref && ref.current) {
      ref.current.close();
    }
  };

  const handlePrintKitchenTicket = async () => {
    if (!activeOrder || !selectedStore || !hasItems) return;
    setIsPrintingKitchen(true);
    try {
      const nonVoidedItems = (activeOrder.items || []).filter(
        (item) => !item.is_voided
      );
      if (nonVoidedItems.length === 0) {
        show({ title: "No Items", message: "No non-voided items to print.", type: "error" });
        setIsPrintingKitchen(false);
        return;
      }
      const success = await PrinterService.printKitchenTickets(activeOrder, nonVoidedItems, selectedStore);
      if (success) {
        show({ title: "Kitchen Ticket Sent", message: "Kitchen ticket sent to printer.", type: "success" });
      } else {
        useNoPrinterModalStore.getState().show("kitchen");
      }
    } catch (e: any) {
      show({ title: "Print Error", message: e?.message || "Failed to print kitchen ticket.", type: "error" });
    } finally {
      setIsPrintingKitchen(false);
    }
    if (ref && "current" in ref && ref.current) {
      ref.current.close();
    }
  };

  const renderBackdrop = useMemo(
    () => (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
      />
    ),
    []
  );

  // FIX: Use optional chaining to prevent errors
  const canVoid =
    (activeOrder &&
      activeOrder.items?.length > 0 &&
      activeOrder.paid_status !== "Paid") ||
    activeOrder?.db_order_id;

  // Animated style for shake effect
  const shakeStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateX: shakeX.value }],
    };
  });

  const closeSheet = () => {
    if (ref && "current" in ref && ref.current) ref.current.close();
  };

  return (
    <>
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose={true}
        {...bottomSheetTheme}
        backdropComponent={renderBackdrop}
      >
        <BottomSheetScrollView style={{ flex: 1, backgroundColor: colors.panel }}>
          {/* ── Header ── */}
          <View style={{
            flexDirection: "row", alignItems: "center", justifyContent: "space-between",
            paddingHorizontal: 16, paddingTop: 14, paddingBottom: 12,
            borderBottomWidth: 1, borderBottomColor: colors.border,
          }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
              More Options
            </Text>
            <TouchableOpacity
              onPress={closeSheet}
              style={{
                padding: 6, borderRadius: 10,
                backgroundColor: colors.teal + "10",
                borderWidth: 1, borderColor: colors.teal + "30",
              }}
            >
              <X size={16} color={colors.teal} />
            </TouchableOpacity>
          </View>

          {/* ── Section label: Order ── */}
          <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.7 }}>
              Order
            </Text>
          </View>

          {/* Close Check */}
          {isBalanceZero && (
            <TouchableOpacity
              onPress={() => { closeSheet(); setTimeout(() => onCloseCheck?.(), 250); }}
              style={{
                flexDirection: "row", alignItems: "center",
                marginHorizontal: 12, marginBottom: 4,
                paddingHorizontal: 12, paddingVertical: 10,
                borderRadius: 10,
                backgroundColor: colors.success + "15",
                borderWidth: 1, borderColor: colors.success + "30",
              }}
            >
              <View style={{
                width: 30, height: 30, borderRadius: 8,
                backgroundColor: colors.success + "20",
                alignItems: "center", justifyContent: "center", marginRight: 12,
              }}>
                <CheckCircle2 size={15} color={colors.success} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontWeight: "600", color: colors.success }}>Close Check</Text>
                <Text style={{ fontSize: 11, color: colors.success + "99", marginTop: 1 }}>Finalize this order</Text>
              </View>
              <ChevronRight size={14} color={colors.success + "80"} />
            </TouchableOpacity>
          )}

          {/* Discounts row */}
          <TouchableOpacity
            onPress={handleOpenDiscounts}
            disabled={!canApplyDiscount}
            style={{
              flexDirection: "row", alignItems: "center",
              paddingHorizontal: 16, paddingVertical: 10,
              opacity: canApplyDiscount ? 1 : 0.45,
            }}
          >
            <View style={{
              width: 30, height: 30, borderRadius: 8,
              backgroundColor: "#a855f715",
              alignItems: "center", justifyContent: "center", marginRight: 12,
            }}>
              <Tag size={14} color="#a855f7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading }}>Apply Discount</Text>
              {!canApplyDiscount && (
                <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>Unavailable for refunded orders</Text>
              )}
            </View>
            <ChevronRight size={14} color={colors.muted} />
          </TouchableOpacity>

          {/* Add Customer row */}
          <TouchableOpacity
            onPress={handleAddCustomer}
            style={{
              flexDirection: "row", alignItems: "center",
              paddingHorizontal: 16, paddingVertical: 10,
            }}
          >
            <View style={{
              width: 30, height: 30, borderRadius: 8,
              backgroundColor: colors.teal + "15",
              alignItems: "center", justifyContent: "center", marginRight: 12,
            }}>
              <User size={14} color={colors.teal} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading, flex: 1 }}>
              Add Customer
            </Text>
            <ChevronRight size={14} color={colors.muted} />
          </TouchableOpacity>

          {/* ── Section label: Print ── */}
          <View style={{
            paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
            borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4,
          }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.7 }}>
              Print
            </Text>
          </View>

          {/* Print Receipt row */}
          <TouchableOpacity
            onPress={handlePrintReceipt}
            disabled={!hasItems || isPrintingReceipt}
            style={{
              flexDirection: "row", alignItems: "center",
              paddingHorizontal: 16, paddingVertical: 10,
              opacity: hasItems ? 1 : 0.45,
            }}
          >
            <View style={{
              width: 30, height: 30, borderRadius: 8,
              backgroundColor: colors.info + "15",
              alignItems: "center", justifyContent: "center", marginRight: 12,
            }}>
              {isPrintingReceipt
                ? <ActivityIndicator size="small" color={colors.info} />
                : <Printer size={14} color={colors.info} />}
            </View>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading, flex: 1 }}>
              Print Receipt
            </Text>
            <ChevronRight size={14} color={colors.muted} />
          </TouchableOpacity>

          {/* Kitchen Ticket row */}
          <TouchableOpacity
            onPress={handlePrintKitchenTicket}
            disabled={!hasItems || isPrintingKitchen}
            style={{
              flexDirection: "row", alignItems: "center",
              paddingHorizontal: 16, paddingVertical: 10,
              opacity: hasItems ? 1 : 0.45,
            }}
          >
            <View style={{
              width: 30, height: 30, borderRadius: 8,
              backgroundColor: colors.warning + "15",
              alignItems: "center", justifyContent: "center", marginRight: 12,
            }}>
              {isPrintingKitchen
                ? <ActivityIndicator size="small" color={colors.warning} />
                : <Printer size={14} color={colors.warning} />}
            </View>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.heading, flex: 1 }}>
              Kitchen Ticket
            </Text>
            <ChevronRight size={14} color={colors.muted} />
          </TouchableOpacity>

          {/* ── Section label: Order Notes ── */}
          <View style={{
            paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8,
            borderTopWidth: 1, borderTopColor: colors.border, marginTop: 4,
          }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.7 }}>
              Order Notes
            </Text>
          </View>
          <View style={{ paddingHorizontal: 16, paddingBottom: 12 }}>
            <BottomSheetTextInput
              value={orderNotes}
              onChangeText={setOrderNotes}
              placeholder="Add special instructions..."
              numberOfLines={1}
              style={{
                padding: 10,
                backgroundColor: colors.screen,
                borderRadius: 10,
                borderWidth: 1, borderColor: colors.border,
                color: colors.heading,
                fontSize: 13,
                minHeight: 72,
                textAlignVertical: "top",
              }}
              placeholderTextColor={colors.muted}
            />
          </View>

          {/* ── Section label: Danger zone ── */}
          <View style={{
            paddingHorizontal: 16, paddingTop: 14, paddingBottom: 6,
            borderTopWidth: 1, borderTopColor: colors.border,
          }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: colors.muted, textTransform: "uppercase", letterSpacing: 0.7 }}>
              Danger Zone
            </Text>
          </View>

          {/* Clear Cart row */}
          <TouchableOpacity
            onPress={handleClearCart}
            style={{
              flexDirection: "row", alignItems: "center",
              paddingHorizontal: 16, paddingVertical: 10,
            }}
          >
            <View style={{
              width: 30, height: 30, borderRadius: 8,
              backgroundColor: colors.danger + "15",
              alignItems: "center", justifyContent: "center", marginRight: 12,
            }}>
              <Trash2 size={14} color={colors.danger} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.danger, flex: 1 }}>
              Clear Cart
            </Text>
            <ChevronRight size={14} color={colors.muted} />
          </TouchableOpacity>

          {/* Void Order row */}
          <TouchableOpacity
            onPress={handleVoidOrderClick}
            disabled={!canVoid}
            style={{
              flexDirection: "row", alignItems: "center",
              paddingHorizontal: 16, paddingVertical: 10,
              opacity: canVoid ? 1 : 0.45,
            }}
          >
            <View style={{
              width: 30, height: 30, borderRadius: 8,
              backgroundColor: colors.danger + "15",
              alignItems: "center", justifyContent: "center", marginRight: 12,
            }}>
              <Trash2 size={14} color={colors.danger} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.danger }}>Void Order</Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 1 }}>This action cannot be undone</Text>
            </View>
            <ChevronRight size={14} color={colors.muted} />
          </TouchableOpacity>

          {/* No Sale row */}
          {onNoSale && (
            <TouchableOpacity
              onPress={() => { closeSheet(); setTimeout(() => onNoSale(), 250); }}
              style={{
                flexDirection: "row", alignItems: "center",
                paddingHorizontal: 16, paddingVertical: 10,
                marginBottom: 8,
              }}
            >
              <View style={{
                width: 30, height: 30, borderRadius: 8,
                backgroundColor: "rgba(255,255,255,0.05)",
                alignItems: "center", justifyContent: "center", marginRight: 12,
              }}>
                <Lock size={14} color={colors.label} />
              </View>
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.label, flex: 1 }}>
                Open Drawer (No Sale)
              </Text>
              <ChevronRight size={14} color={colors.muted} />
            </TouchableOpacity>
          )}

          <View style={{ height: 24 }} />
        </BottomSheetScrollView>
      </BottomSheet>

      {/* Manager PIN dialog */}
      <Dialog open={showManagerPin} onOpenChange={() => setShowManagerPin(false)}>
        <DialogContent style={{ width: "auto", backgroundColor: colors.card, borderColor: colors.border, padding: 24 }}>
          <DialogHeader>
            <DialogTitle style={{ textAlign: "center", fontSize: 16, fontWeight: "700", color: colors.heading }}>
              Manager Override
            </DialogTitle>
          </DialogHeader>
          <Animated.View style={[shakeStyle, { paddingVertical: 16 }]}>
            <Text style={{ textAlign: "center", fontSize: 13, color: colors.label, marginBottom: 16 }}>
              Enter Manager PIN to enable tax exemption
            </Text>
            <PinDisplay pinLength={managerPin.length} maxLength={4} />
            <PinNumpad
              onKeyPress={(input) => {
                if (typeof input === "number") {
                  if (managerPin.length < 4) setManagerPin(managerPin + input.toString());
                } else if (input === "clear") {
                  setManagerPin("");
                } else if (input === "backspace") {
                  setManagerPin(managerPin.slice(0, -1));
                }
              }}
            />
            <TouchableOpacity
              onPress={handleManagerPinSubmit}
              style={{
                marginTop: 16, paddingVertical: 10, borderRadius: 8,
                backgroundColor: colors.teal, alignItems: "center",
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.onSolid }}>Confirm</Text>
            </TouchableOpacity>
          </Animated.View>
        </DialogContent>
      </Dialog>

      <ConfirmationModal
        isOpen={isClearCartConfirmOpen}
        onClose={() => setClearCartConfirmOpen(false)}
        onConfirm={onConfirmClearCart}
        title="Clear Full Cart?"
        description="Are you sure you want to remove all items from the current order? This action cannot be undone."
        confirmText="Clear Cart"
        variant="destructive"
      />
      <ConfirmationModal
        isOpen={isVoidConfirmOpen}
        onClose={() => setVoidConfirmOpen(false)}
        onConfirm={onConfirmVoid}
        title="Void This Order?"
        description="Are you sure you want to void this entire order? All items will be cancelled. This action cannot be undone."
        confirmText="Yes, Void Order"
        variant="destructive"
      />

      {/* Cannot discount refunded order dialog */}
      <Dialog open={showRefundedDiscountDialog} onOpenChange={() => setShowRefundedDiscountDialog(false)}>
        <DialogContent style={{ width: 320, backgroundColor: colors.card, borderColor: colors.border, padding: 24 }}>
          <DialogHeader>
            <DialogTitle style={{ textAlign: "center", fontSize: 15, fontWeight: "700", color: colors.heading }}>
              Cannot Add Discount
            </DialogTitle>
          </DialogHeader>
          <Text style={{ textAlign: "center", fontSize: 13, color: colors.label, marginTop: 12 }}>
            Discounts cannot be applied to orders that have been refunded or partially refunded.
          </Text>
          <TouchableOpacity
            onPress={() => setShowRefundedDiscountDialog(false)}
            style={{
              marginTop: 20, paddingVertical: 9, borderRadius: 8,
              backgroundColor: colors.teal, alignItems: "center",
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: "600", color: colors.onSolid }}>OK</Text>
          </TouchableOpacity>
        </DialogContent>
      </Dialog>
    </>
  );
};

const MoreOptionsBottomSheet = React.memo(forwardRef(MoreOptionsComponent));
MoreOptionsBottomSheet.displayName = "MoreOptionsBottomSheet";

export default MoreOptionsBottomSheet;
