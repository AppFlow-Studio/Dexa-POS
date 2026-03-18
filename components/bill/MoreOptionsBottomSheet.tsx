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
import { CheckCircle, Lock, Printer, Tag, Trash2, User, X } from "lucide-react-native";
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
  const [promoCode, setPromoCode] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [isTaxExempt, setIsTaxExempt] = useState(false);
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

  const handleApplyPromoCode = () => {
    if (promoCode.trim()) {
      show({
        title: "Promo Code Applied",
        message: `Promo code "${promoCode.trim()}" has been applied.`,
        type: "success",
      });
      setPromoCode("");
    }
  };

  const handleTaxExemptToggle = () => {
    if (!isTaxExempt) {
      setShowManagerPin(true);
    } else {
      setIsTaxExempt(false);
      show({
        title: "Tax Exempt Disabled",
        message: "Tax exemption has been removed from this order.",
        type: "success",
      });
    }
  };

  const handleManagerPinSubmit = async () => {
    // Verify PIN against actual employee database
    const MANAGER_ROLES: MerchantRole[] = ["merchant.manager", "merchant.admin", "merchant.owner"];
    const employee = useEmployeeStore.getState().findEmployeeByPin(managerPin);
    const isManager = employee && MANAGER_ROLES.includes(employee.role);

    if (isManager) {
      setIsTaxExempt(true);
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
        (item) => item.status !== "voided"
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
        <BottomSheetScrollView className="flex-1 bg-panel rounded-t-3xl overflow-hidden">
          <View className="flex-row justify-between items-center p-4 border-b border-gray-700">
            <Text className="text-2xl font-bold text-white">More Options</Text>
            <TouchableOpacity
              onPress={() => {
                if (ref && "current" in ref && ref.current) {
                  ref.current.close();
                }
              }}
              className="p-2 bg-surface rounded-full border border-gray-600"
            >
              <X color={colors.label} size={20} />
            </TouchableOpacity>
          </View>
          <View>
            <View className="p-4 border-b border-gray-700 flex-row justify-between items-center">
              <Text className="text-xl font-semibold text-white">
                Cart Actions
              </Text>
              <TouchableOpacity
                onPress={handleClearCart}
                className="flex-row items-center gap-x-2 bg-surface border border-red-700 p-2 rounded-lg"
              >
                <Trash2 color={colors.danger} size={16} />
                <Text className="text-base text-red-400 font-semibold">
                  Clear Cart
                </Text>
              </TouchableOpacity>
            </View>
            <View className="p-4 border-b border-gray-700 flex-row justify-between items-center">
              <View>
                <Text className="text-xl font-semibold text-white">
                  Discounts
                </Text>
                {!canApplyDiscount && (
                  <Text className="text-xs text-gray-500">
                    Unavailable for refunded orders
                  </Text>
                )}
              </View>
              <TouchableOpacity
                onPress={handleOpenDiscounts}
                className={`flex-row items-center gap-x-2 p-2 rounded-lg ${
                  canApplyDiscount
                    ? "bg-surface border border-purple-700"
                    : "bg-surface border border-gray-700 opacity-50"
                }`}
              >
                <Tag color={canApplyDiscount ? "#a855f7" : colors.muted} size={16} />
                <Text className={`text-base font-semibold ${
                  canApplyDiscount ? "text-purple-400" : "text-gray-500"
                }`}>
                  Apply Discount
                </Text>
              </TouchableOpacity>
            </View>
            <View className="p-4 border-b border-gray-700 flex-row justify-between items-center">
              <View>
                <Text className="text-xl font-semibold text-white">
                  Order Actions
                </Text>
                <Text className="text-sm text-gray-500">
                  This action cannot be undone.
                </Text>
              </View>
              <TouchableOpacity
                onPress={handleVoidOrderClick}
                disabled={!canVoid}
                className={`flex-row items-center gap-x-2 p-2 rounded-lg ${
                  canVoid
                    ? "bg-surface border border-red-700"
                    : "bg-surface border border-gray-700 opacity-50"
                }`}
              >
                <Trash2 color={canVoid ? colors.danger : colors.muted} size={16} />
                <Text
                  className={`text-base font-semibold ${
                    canVoid ? "text-red-400" : "text-gray-500"
                  }`}
                >
                  Void Order
                </Text>
              </TouchableOpacity>
            </View>

            {/* Print Section */}
            <View className="p-4 border-b border-gray-700">
              <Text className="text-xl font-semibold text-white mb-3">Print</Text>
              <View className="flex-row gap-x-3">
                <TouchableOpacity
                  onPress={handlePrintReceipt}
                  disabled={!hasItems || isPrintingReceipt}
                  className={`flex-1 flex-row items-center justify-center gap-x-2 p-3 rounded-lg ${
                    hasItems && !isPrintingReceipt
                      ? "bg-surface border border-blue-700"
                      : "bg-surface border border-gray-700 opacity-50"
                  }`}
                >
                  {isPrintingReceipt ? (
                    <ActivityIndicator size="small" color={colors.info} />
                  ) : (
                    <Printer color={hasItems ? colors.info : colors.muted} size={16} />
                  )}
                  <Text
                    className={`text-base font-semibold ${
                      hasItems ? "text-blue-400" : "text-gray-500"
                    }`}
                  >
                    Print Receipt
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handlePrintKitchenTicket}
                  disabled={!hasItems || isPrintingKitchen}
                  className={`flex-1 flex-row items-center justify-center gap-x-2 p-3 rounded-lg ${
                    hasItems && !isPrintingKitchen
                      ? "bg-surface border border-orange-700"
                      : "bg-surface border border-gray-700 opacity-50"
                  }`}
                >
                  {isPrintingKitchen ? (
                    <ActivityIndicator size="small" color="#fb923c" />
                  ) : (
                    <Printer color={hasItems ? "#fb923c" : colors.muted} size={16} />
                  )}
                  <Text
                    className={`text-base font-semibold ${
                      hasItems ? "text-orange-400" : "text-gray-500"
                    }`}
                  >
                    Kitchen Ticket
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Close Check Section - Only show when balance is $0 */}
            {isBalanceZero && (
              <View className="p-4 border-b border-gray-700 flex-row justify-between items-center">
                <View>
                  <Text className="text-xl font-semibold text-white">
                    Close Check
                  </Text>
                  <Text className="text-sm text-gray-500">
                    Finalize this order
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => {
                    if (ref && "current" in ref && ref.current) {
                      ref.current.close();
                    }
                    setTimeout(() => {
                      onCloseCheck?.();
                    }, 250);
                  }}
                  className="flex-row items-center gap-x-2 bg-emerald-600 p-3 rounded-lg"
                >
                  <CheckCircle color="white" size={18} />
                  <Text className="text-base text-white font-semibold">
                    Close Check
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            <View className="p-4 border-b border-gray-700 flex-row justify-between items-center">
              <Text className="text-xl font-semibold text-white">Customer</Text>
              <TouchableOpacity
                onPress={handleAddCustomer}
                className="flex-row items-center gap-x-2 bg-surface border border-gray-600 p-2 rounded-lg"
              >
                <User color={colors.label} size={16} />
                <Text className="text-base text-gray-300">Add Customer</Text>
              </TouchableOpacity>
            </View>
            <View className="p-4">
              <Text className="text-xl font-semibold text-white mb-2">
                Order Notes
              </Text>
              <BottomSheetTextInput
                value={orderNotes}
                onChangeText={setOrderNotes}
                placeholder="Add special instructions..."
                multiline
                numberOfLines={3}
                className="p-3 bg-surface rounded-xl text-lg min-h-[90px] text-white border border-gray-600"
                placeholderTextColor={colors.muted}
                textAlignVertical="top"
              />
            </View>

            {onNoSale && (
              <View className="px-4 pb-4 flex-row justify-between items-center">
                <Text className="text-xl font-semibold text-white">
                  No Sale
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    if (ref && "current" in ref && ref.current) {
                      ref.current.close();
                    }
                    setTimeout(() => onNoSale(), 250);
                  }}
                  className="flex-row items-center gap-x-2 px-5 py-2 bg-surface rounded-xl border border-gray-600"
                >
                  <Lock color={colors.label} size={16} />
                  <Text className="text-base font-medium text-white">Open Drawer</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
      <Dialog
        open={showManagerPin}
        onOpenChange={() => setShowManagerPin(false)}
      >
        <DialogContent className="w-fit h-fit bg-surface border-gray-600 p-6">
          <DialogHeader>
            <DialogTitle className="text-center text-2xl font-semibold text-white">
              Manager Override
            </DialogTitle>
          </DialogHeader>
          <Animated.View style={shakeStyle} className="py-4">
            <Text className="text-center text-lg text-gray-300 mb-4">
              Enter Manager PIN to access this item
            </Text>
            <PinDisplay pinLength={managerPin.length} maxLength={4} />
            <PinNumpad
              onKeyPress={(input) => {
                if (typeof input === "number") {
                  if (managerPin.length < 4) {
                    const newPin = managerPin + input.toString();
                    setManagerPin(newPin);
                  }
                } else if (input === "clear") {
                  setManagerPin("");
                } else if (input === "backspace") {
                  setManagerPin(managerPin.slice(0, -1));
                }
              }}
            />
            <TouchableOpacity
              onPress={handleManagerPinSubmit}
              className="py-3 bg-blue-600 rounded-lg w-full self-center mt-4"
            >
              <Text className="text-center text-lg font-bold text-white">
                Enter
              </Text>
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
      <Dialog
        open={showRefundedDiscountDialog}
        onOpenChange={() => setShowRefundedDiscountDialog(false)}
      >
        <DialogContent className="w-80 bg-surface border-gray-600 p-6">
          <DialogHeader>
            <DialogTitle className="text-center text-xl font-semibold text-white">
              Cannot Add Discount
            </DialogTitle>
          </DialogHeader>
          <Text className="text-center text-gray-300 mt-4">
            Discounts cannot be applied to orders that have been refunded or
            partially refunded.
          </Text>
          <TouchableOpacity
            onPress={() => setShowRefundedDiscountDialog(false)}
            className="mt-6 py-3 bg-blue-600 rounded-lg"
          >
            <Text className="text-center text-white font-semibold">OK</Text>
          </TouchableOpacity>
        </DialogContent>
      </Dialog>
    </>
  );
};

const MoreOptionsBottomSheet = React.memo(forwardRef(MoreOptionsComponent));
MoreOptionsBottomSheet.displayName = "MoreOptionsBottomSheet";

export default MoreOptionsBottomSheet;
