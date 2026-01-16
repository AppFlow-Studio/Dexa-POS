import { useToast } from "@/contexts/ToastContext";
import { InventoryService } from "@/services/inventoryService";
import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import {
  getOrderStoreSupabaseClient,
  useOrderStore,
} from "@/stores/useOrderStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
  BottomSheetTextInput,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { CheckCircle, Lock, Tag, Trash2, User, X } from "lucide-react-native";
import React, { forwardRef, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
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
}

const MoreOptionsComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  MoreOptionsProps
> = function MoreOptionsComponent(
  { discountSheetRef, onVoidSuccess, onCloseCheck },
  ref
) {
  const snapPoints = useMemo(() => ["75%"], []);
  const [promoCode, setPromoCode] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [isTaxExempt, setIsTaxExempt] = useState(false);
  const [isOpenDrawer, setIsOpenDrawer] = useState(false);
  const [showManagerPin, setShowManagerPin] = useState(false);
  const [managerPin, setManagerPin] = useState("");
  const [isClearCartConfirmOpen, setClearCartConfirmOpen] = useState(false);
  const [isVoidConfirmOpen, setVoidConfirmOpen] = useState(false);
  const { show } = useToast();

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
      // Deduct inventory before voiding (items already consumed/wasted)
      if (activeOrder.db_order_id) {
        const supabase = getOrderStoreSupabaseClient();
        if (supabase) {
          const result = await InventoryService.processOrderInventoryDeduction(
            supabase,
            activeOrder.db_order_id
          );
          if (!result.success) {
            console.warn(
              "[onConfirmVoid] Inventory deduction failed, proceeding with void"
            );
          }
        }
      }
      // Also update local inventory
      if (activeOrder.items?.length > 0) {
        const { useInventoryStore } = require("@/stores/useInventoryStore");
        useInventoryStore.getState().decrementStockFromSale(activeOrder.items);
      }

      voidOrder(activeOrderId);
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

  const handleManagerPinSubmit = () => {
    if (managerPin === "1234") {
      if (isOpenDrawer) {
        show({
          title: "Drawer Opened",
          message: "The cash drawer has been successfully opened.",
          type: "success",
        });
        setIsOpenDrawer(false);
      } else {
        setIsTaxExempt(true);
        show({
          title: "Tax Exempt Enabled",
          message: "The order is now tax-exempt.",
          type: "success",
        });
      }
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
        message: "The manager PIN you entered is incorrect.",
        type: "error",
      });
    }
  };

  const handleOpenDrawer = () => {
    setIsOpenDrawer(true);
    setShowManagerPin(true);
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
    if (ref && "current" in ref && ref.current) {
      ref.current.close();
    }
    setTimeout(() => {
      discountSheetRef?.current?.expand();
    }, 250);
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
        handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: "#212121" }}
      >
        <BottomSheetScrollView className="flex-1 bg-[#212121] rounded-t-3xl overflow-hidden">
          <View className="flex-row justify-between items-center p-4 border-b border-gray-700">
            <Text className="text-2xl font-bold text-white">More Options</Text>
            <TouchableOpacity
              onPress={() => {
                if (ref && "current" in ref && ref.current) {
                  ref.current.close();
                }
              }}
              className="p-2 bg-[#303030] rounded-full border border-gray-600"
            >
              <X color="#9CA3AF" size={20} />
            </TouchableOpacity>
          </View>
          <View>
            <View className="p-4 border-b border-gray-700 flex-row justify-between items-center">
              <Text className="text-xl font-semibold text-white">
                Cart Actions
              </Text>
              <TouchableOpacity
                onPress={handleClearCart}
                className="flex-row items-center gap-x-2 bg-[#303030] border border-red-700 p-2 rounded-lg"
              >
                <Trash2 color="#f87171" size={16} />
                <Text className="text-base text-red-400 font-semibold">
                  Clear Cart
                </Text>
              </TouchableOpacity>
            </View>
            <View className="p-4 border-b border-gray-700 flex-row justify-between items-center">
              <Text className="text-xl font-semibold text-white">
                Discounts
              </Text>
              <TouchableOpacity
                onPress={handleOpenDiscounts}
                className="flex-row items-center gap-x-2 bg-[#303030] border border-purple-700 p-2 rounded-lg"
              >
                <Tag color="#a855f7" size={16} />
                <Text className="text-base text-purple-400 font-semibold">
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
                    ? "bg-[#303030] border border-red-700"
                    : "bg-[#2a2a2a] border border-gray-700 opacity-50"
                }`}
              >
                <Trash2 color={canVoid ? "#f87171" : "#6B7280"} size={16} />
                <Text
                  className={`text-base font-semibold ${
                    canVoid ? "text-red-400" : "text-gray-500"
                  }`}
                >
                  Void Order
                </Text>
              </TouchableOpacity>
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
                className="flex-row items-center gap-x-2 bg-[#303030] border border-gray-600 p-2 rounded-lg"
              >
                <User color="#9CA3AF" size={16} />
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
                className="p-3 bg-[#303030] rounded-xl text-lg min-h-[90px] text-white border border-gray-600"
                placeholderTextColor="#6B7280"
                textAlignVertical="top"
              />
            </View>

            <View className="px-4 pb-4">
              <Text className="text-xl font-semibold text-white mb-2">
                Open Drawer (No-sale)
              </Text>
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center">
                  <Text className="text-lg text-gray-400 mr-2">
                    Requires PIN
                  </Text>
                  <Lock color="#9CA3AF" size={20} />
                </View>
                <TouchableOpacity
                  onPress={handleOpenDrawer}
                  className="px-5 py-2 bg-[#303030] rounded-xl border border-gray-600"
                >
                  <Text className="text-xl font-medium text-white">Open</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
      <Dialog
        open={showManagerPin}
        onOpenChange={() => setShowManagerPin(false)}
      >
        <DialogContent className="w-fit h-fit bg-[#303030] border-gray-600 p-6">
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
    </>
  );
};

const MoreOptionsBottomSheet = forwardRef(MoreOptionsComponent);
MoreOptionsBottomSheet.displayName = "MoreOptionsBottomSheet";

export default MoreOptionsBottomSheet;
