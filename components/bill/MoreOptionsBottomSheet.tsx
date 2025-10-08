import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Lock, Trash2, User, X } from "lucide-react-native";
import React, { forwardRef, useMemo, useState } from "react";
import { Modal, Text, TextInput, TouchableOpacity, View } from "react-native";
import ConfirmationModal from "../settings/reset-application/ConfirmationModal";

const MoreOptionsComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods
> = (props, ref) => {
  const snapPoints = useMemo(() => ["75%"], []);
  const [promoCode, setPromoCode] = useState("");
  const [orderNotes, setOrderNotes] = useState("");
  const [isTaxExempt, setIsTaxExempt] = useState(false);
  const [showManagerPin, setShowManagerPin] = useState(false);
  const [managerPin, setManagerPin] = useState("");
  const [isClearCartConfirmOpen, setClearCartConfirmOpen] = useState(false);
  const [isVoidConfirmOpen, setVoidConfirmOpen] = useState(false);

  const { openSheet } = useCustomerSheetStore();

  // FIX: Use individual selectors to prevent unnecessary re-renders
  const activeOrderId = useOrderStore((state) => state.activeOrderId);
  const clearCart = useOrderStore((state) => state.clearCart);
  const voidOrder = useOrderStore((state) => state.voidOrder);

  // FIX: Get the active order directly without using orders array
  const activeOrder = useOrderStore((state) =>
    state.orders.find((o) => o.id === state.activeOrderId)
  );

  const handleClearCart = () => {
    setClearCartConfirmOpen(true);
  };

  const onConfirmClearCart = () => {
    clearCart();
    setClearCartConfirmOpen(false);
    if (ref && "current" in ref && ref.current) {
      ref.current.close();
    }
  };

  const handleVoidOrderClick = () => {
    if (ref && "current" in ref && ref.current) {
      ref.current.close();
    }
    setTimeout(() => {
      setVoidConfirmOpen(true);
    }, 250);
  };

  const onConfirmVoid = () => {
    if (activeOrderId) {
      voidOrder(activeOrderId);
      setVoidConfirmOpen(false);
    }
  };

  const handleApplyPromoCode = () => {
    if (promoCode.trim()) {
      toast.success("Promo code applied", {
        duration: 2000,
        position: ToastPosition.BOTTOM,
      });
      setPromoCode("");
    }
  };

  const handleTaxExemptToggle = () => {
    if (!isTaxExempt) {
      setShowManagerPin(true);
    } else {
      setIsTaxExempt(false);
    }
  };

  const handleManagerPinSubmit = () => {
    if (managerPin === "1234") {
      setIsTaxExempt(true);
      setShowManagerPin(false);
      setManagerPin("");
      toast.success("Tax exempt enabled", {
        duration: 2000,
        position: ToastPosition.BOTTOM,
      });
    } else {
      toast.error("Invalid PIN", {
        duration: 2000,
        position: ToastPosition.BOTTOM,
      });
    }
  };

  const handleOpenDrawer = () => {
    setShowManagerPin(true);
  };

  const handleManagerPinForDrawer = () => {
    if (managerPin === "1234") {
      toast.success("Drawer opened", {
        duration: 2000,
        position: ToastPosition.BOTTOM,
      });
      setShowManagerPin(false);
      setManagerPin("");
      if (ref && "current" in ref && ref.current) {
        ref.current.close();
      }
    } else {
      toast.error("Invalid PIN", {
        duration: 2000,
        position: ToastPosition.BOTTOM,
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

  const renderBackdrop = useMemo(
    () => (props: any) =>
      (
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
    activeOrder &&
    activeOrder.items?.length > 0 &&
    activeOrder.paid_status !== "Paid";

  return (
    <>
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose={true}
        handleComponent={null}
        backdropComponent={renderBackdrop}
        backgroundStyle={{ backgroundColor: "#212121" }}
      >
        <BottomSheetView className="flex-1 bg-[#212121] rounded-t-3xl overflow-hidden">
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
          <View className="p-4 border-b border-gray-700">
            <Text className="text-xl font-semibold text-white mb-2">
              Cart Actions
            </Text>
            <TouchableOpacity
              onPress={handleClearCart}
              className="flex-row items-center gap-x-3 w-full bg-[#303030] border border-red-700 p-3 rounded-lg"
            >
              <Trash2 color="#f87171" size={20} />
              <Text className="text-lg text-red-400 font-semibold">
                Clear Full Cart
              </Text>
            </TouchableOpacity>
          </View>
          <View className="p-4 border-b border-gray-700">
            <Text className="text-xl font-semibold text-white mb-2">
              Order Actions
            </Text>
            <TouchableOpacity
              onPress={handleVoidOrderClick}
              disabled={!canVoid}
              className={`flex-row items-center gap-x-3 w-full p-3 rounded-lg ${
                canVoid
                  ? "bg-[#303030] border border-red-700"
                  : "bg-[#2a2a2a] border border-gray-700 opacity-50"
              }`}
            >
              <Trash2 color={canVoid ? "#f87171" : "#6B7280"} size={20} />
              <View>
                <Text
                  className={`text-lg font-semibold ${
                    canVoid ? "text-red-400" : "text-gray-500"
                  }`}
                >
                  Void Order
                </Text>
                <Text className="text-sm text-gray-500">
                  This action cannot be undone.
                </Text>
              </View>
            </TouchableOpacity>
          </View>
          <View className="p-4 border-b border-gray-700">
            <Text className="text-xl font-semibold text-white mb-2">
              Customer
            </Text>
            <TouchableOpacity
              onPress={handleAddCustomer}
              className="flex-row items-center gap-x-3 w-full bg-[#303030] border border-gray-600 p-3 rounded-lg"
            >
              <User color="#9CA3AF" size={20} />
              <Text className="text-lg text-gray-300">
                Add Customer to Order
              </Text>
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
              Tax Exempt
            </Text>
            <View className="flex-row items-center justify-between">
              <Text className="text-lg text-gray-400">Requires PIN</Text>
              <TouchableOpacity
                onPress={handleTaxExemptToggle}
                className={`w-14 h-8 rounded-full flex-row items-center p-1 ${
                  isTaxExempt
                    ? "bg-blue-600 justify-end"
                    : "bg-gray-600 justify-start"
                }`}
              >
                <View className="w-6 h-6 bg-white rounded-full shadow-sm" />
              </TouchableOpacity>
            </View>
          </View>

          <View className="px-4 pb-4">
            <Text className="text-xl font-semibold text-white mb-2">
              Open Drawer (No-sale)
            </Text>
            <View className="flex-row items-center justify-between">
              <View className="flex-row items-center">
                <Text className="text-lg text-gray-400 mr-2">Requires PIN</Text>
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
        </BottomSheetView>
      </BottomSheet>

      <Modal
        visible={showManagerPin}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowManagerPin(false)}
      >
        <View className="flex-1 justify-center items-center bg-black/60">
          <View className="bg-[#303030] rounded-2xl p-6 w-96 border border-gray-700">
            <Text className="text-2xl font-bold text-white mb-4 text-center">
              Manager PIN Required
            </Text>
            <TextInput
              value={managerPin}
              onChangeText={setManagerPin}
              placeholder="Enter PIN"
              secureTextEntry
              keyboardType="numeric"
              maxLength={4}
              className="p-4 bg-[#212121] border border-gray-600 rounded-xl text-center text-xl font-bold mb-4 text-white h-16"
              placeholderTextColor="#6B7280"
            />
            <View className="flex-row gap-4">
              <TouchableOpacity
                onPress={() => {
                  setShowManagerPin(false);
                  setManagerPin("");
                }}
                className="flex-1 py-3 bg-[#212121] border border-gray-600 rounded-xl"
              >
                <Text className="text-center text-xl font-bold text-gray-300">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={
                  isTaxExempt
                    ? handleManagerPinSubmit
                    : handleManagerPinForDrawer
                }
                className="flex-1 py-3 bg-blue-600 rounded-xl"
              >
                <Text className="text-center text-xl font-bold text-white">
                  Submit
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
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

export default MoreOptionsBottomSheet;
