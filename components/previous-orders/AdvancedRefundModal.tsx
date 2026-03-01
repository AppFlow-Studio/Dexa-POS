import { useToast } from "@/contexts/ToastContext";
import { orderHistoryKeys } from "@/hooks/orders/useOrderHistory";
import { CartItem, OrderProfile, PaymentType } from "@/lib/types";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFooter,
  BottomSheetScrollView,
  BottomSheetTextInput,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BottomSheetDefaultFooterProps } from "@gorhom/bottom-sheet/lib/typescript/components/bottomSheetFooter/types";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { useQueryClient } from "@tanstack/react-query";
import { Check, X } from "lucide-react-native";
import React, { forwardRef, useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { bottomSheetTheme } from "@/lib/theme";

interface AdvancedRefundModalProps {
  onClose: () => void;
  order: OrderProfile | null;
}

export interface AdvancedRefundModalRef {
  open: () => void;
  close: () => void;
}

interface RefundItem {
  itemId: string;
  quantity: number;
  reason: string;
}

const AdvancedRefundModalComponent: React.ForwardRefRenderFunction<
  AdvancedRefundModalRef,
  AdvancedRefundModalProps
> = ({ onClose, order }, ref) => {
  const bottomSheetRef = useRef<BottomSheetMethods>(null);
  const snapPoints = useMemo(() => ["95%"], []);

  useImperativeHandle(ref, () => ({
    open: () => {
      // Ensure the previous orders store has data for the refund lookup
      usePreviousOrdersStore.getState().refreshPreviousOrders();
      bottomSheetRef.current?.snapToIndex(0);
    },
    close: () => bottomSheetRef.current?.close(),
  }));
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [reason, setReason] = useState("");
  const [selectedItems, setSelectedItems] = useState<RefundItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentType>("Card");
  const { show } = useToast();
  const queryClient = useQueryClient();

  const { refundFullOrder, refundItems } = usePreviousOrdersStore();

  // Derive fields from OrderProfile
  const orderId = order?.id ?? "";
  const orderTotal = order?.total_amount ?? 0;
  const refundedAmount = useMemo(() => {
    return (order?.payments || []).reduce(
      (sum, p) => sum + (p.refundedAmount ?? 0),
      0,
    );
  }, [order?.payments]);

  useEffect(() => {
    // When the order changes, reset the local state
    if (order) {
      const canDoFull = refundedAmount < 0.01;
      setRefundType(canDoFull ? "full" : "partial");
      setReason("");
      setSelectedItems([]);
      setPaymentMethod("Card");
    }
  }, [order, refundedAmount]);

  const refundableItems = useMemo(() => {
    if (!order) return [];
    return order.items.filter(
      (item) => (item.refundedQuantity || 0) < item.quantity
    );
  }, [order?.items]);

  // 2. The Full Refund option should only be available if the order is not partially refunded.
  const canDoFullRefund = refundedAmount < 0.01;

  // Reset refundType if full refund is not possible
  useEffect(() => {
    if (!canDoFullRefund && refundType === "full") {
      setRefundType("partial");
    }
  }, [canDoFullRefund, refundType]);

  const handleFullRefund = async () => {
    if (!reason.trim()) {
      show({
        title: "Reason Required",
        message: "Please provide a reason for the full refund.",
        type: "error",
      });
      return;
    }

    await refundFullOrder(orderId, reason, "Cashier", paymentMethod);
    show({
      title: "Refund Successful",
      message: "The full refund has been processed successfully.",
      type: "success",
    });
    queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all });
    bottomSheetRef.current?.close();
  };

  const handlePartialRefund = async () => {
    if (selectedItems.length === 0) {
      show({
        title: "No Items Selected",
        message: "Please select one or more items to process a partial refund.",
        type: "error",
      });
      return;
    }

    // Validate that all selected items have reasons
    const itemsWithReasons = selectedItems.filter((item) => item.reason.trim());
    if (itemsWithReasons.length !== selectedItems.length) {
      show({
        title: "Reason Required",
        message: "Please provide a reason for each item selected for refund.",
        type: "error",
      });
      return;
    }

    await refundItems(orderId, selectedItems, "Cashier", paymentMethod);
    show({
      title: "Refund Successful",
      message: "The partial refund has been processed successfully.",
      type: "success",
    });
    queryClient.invalidateQueries({ queryKey: orderHistoryKeys.all });
    bottomSheetRef.current?.close();
  };

  const toggleItemSelection = (item: CartItem) => {
    const existingIndex = selectedItems.findIndex(
      (item) => item.itemId === item.itemId
    );

    if (existingIndex >= 0) {
      // Remove item
      setSelectedItems((prev) =>
        prev.filter((item) => item.itemId !== item.itemId)
      );
    } else {
      // If not selected, add it.
      // The quantity should default to the REMAINING refundable quantity.
      const maxRefundableQty = item.quantity - (item.refundedQuantity || 0);
      setSelectedItems((prev) => [
        ...prev,
        { itemId: item.id, quantity: maxRefundableQty, reason: "" },
      ]);
    }
  };

  const updateItemQuantity = (itemId: string, quantity: number) => {
    setSelectedItems((prev) =>
      prev.map((item) =>
        item.itemId === itemId ? { ...item, quantity } : item
      )
    );
  };

  const updateItemReason = (itemId: string, reason: string) => {
    setSelectedItems((prev) =>
      prev.map((item) => (item.itemId === itemId ? { ...item, reason } : item))
    );
  };

  const getSelectedItemQuantity = (itemId: string) => {
    const item = selectedItems.find((item) => item.itemId === itemId);
    return item?.quantity || 0;
  };

  const getSelectedItemReason = (itemId: string) => {
    const item = selectedItems.find((item) => item.itemId === itemId);
    return item?.reason || "";
  };

  const calculateRefundAmount = () => {
    if (refundType === "full") {
      return orderTotal;
    }

    return selectedItems.reduce((total, selectedItem) => {
      const item = order.items.find((i) => i.id === selectedItem.itemId);
      return total + (item ? item.price * selectedItem.quantity : 0);
    }, 0);
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case "Paid":
        return "bg-green-100 text-green-800";
      case "In Progress":
        return "bg-orange-100 text-orange-800";
      case "Refunded":
        return "bg-gray-200 text-gray-600";
      case "Partially Refunded":
        return "bg-yellow-100 text-yellow-800";
      default:
        return "bg-gray-100 text-gray-800";
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

  const handleClose = () => {
    bottomSheetRef.current?.close();
  };

  const renderFooter = useCallback(
    (props: BottomSheetDefaultFooterProps) => (
      <BottomSheetFooter {...props} bottomInset={0}>
        <View className="px-5 py-3 bg-panel border-t border-gray-700">
          <TouchableOpacity
            onPress={refundType === "full" ? handleFullRefund : handlePartialRefund}
            className="w-full py-3 bg-blue-600 rounded-lg items-center"
          >
            <Text className="font-bold text-white text-base tracking-wide">PROCESS REFUND</Text>
          </TouchableOpacity>
        </View>
      </BottomSheetFooter>
    ),
    [refundType, handleFullRefund, handlePartialRefund]
  );

  if (!order) return null;

  return (
    <BottomSheet
      ref={bottomSheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose={true}
      backdropComponent={renderBackdrop}
      footerComponent={renderFooter}
      {...bottomSheetTheme}
      keyboardBehavior="interactive"
      keyboardBlurBehavior="restore"
      android_keyboardInputMode="adjustResize"
      onClose={onClose}
    >
      <BottomSheetView className="flex-1 bg-panel">
        {/* Header */}
        <View className="px-5 pb-3 border-b border-gray-700">
          <View className="flex-row justify-between items-center">
            <View>
              <Text className="text-xl font-bold text-white">Process Refund</Text>
              <Text className="text-sm text-gray-400">
                Order #{order?.display_number || order?.order_number || orderId} • ${orderTotal.toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleClose}
              className="p-1.5 bg-surface rounded-full border border-gray-600"
            >
              <X color={colors.label} size={18} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Scrollable Content */}
        <BottomSheetScrollView
          contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 80 }}
          showsVerticalScrollIndicator={true}
        >
          {/* Refund Type Section */}
          <View className="mb-4">
            <Text className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
              Refund Type
            </Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setRefundType("full")}
                disabled={!canDoFullRefund}
                className={`flex-1 p-3 rounded-lg border ${
                  refundType === "full"
                    ? "border-blue-500 bg-blue-900/40"
                    : "border-gray-700 bg-surface"
                } ${!canDoFullRefund && "opacity-50"}`}
              >
                <Text className={`font-bold text-base text-center ${refundType === "full" ? "text-blue-400" : "text-white"}`}>
                  Full Refund
                </Text>
                <Text className={`text-sm text-center mt-1 ${refundType === "full" ? "text-blue-300" : "text-gray-400"}`}>
                  ${orderTotal.toFixed(2)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRefundType("partial")}
                className={`flex-1 p-3 rounded-lg border ${
                  refundType === "partial"
                    ? "border-blue-500 bg-blue-900/40"
                    : "border-gray-700 bg-surface"
                }`}
              >
                <View className="flex-row items-center justify-center gap-2">
                  <Text className="text-base">◐</Text>
                  <Text className={`font-bold text-base ${refundType === "partial" ? "text-blue-400" : "text-white"}`}>
                    Partial
                  </Text>
                </View>
                <Text className={`text-sm text-center mt-1 ${refundType === "partial" ? "text-blue-300" : "text-gray-400"}`}>
                  Select items
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Divider */}
          <View className="h-px bg-gray-700 mb-4" />

          {/* Refund Method Section */}
          <View className="mb-4">
            <Text className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
              Refund Method
            </Text>
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={() => setPaymentMethod("Card")}
                className={`flex-1 py-3 px-4 rounded-lg border flex-row items-center justify-center gap-2 ${
                  paymentMethod === "Card"
                    ? "border-blue-500 bg-blue-900/40"
                    : "border-gray-700 bg-surface"
                }`}
              >
                <Text className="text-base">💳</Text>
                <Text className={`font-bold text-base ${paymentMethod === "Card" ? "text-blue-400" : "text-white"}`}>
                  Card
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setPaymentMethod("Cash")}
                className={`flex-1 py-3 px-4 rounded-lg border flex-row items-center justify-center gap-2 ${
                  paymentMethod === "Cash"
                    ? "border-blue-500 bg-blue-900/40"
                    : "border-gray-700 bg-surface"
                }`}
              >
                <Text className="text-base">💵</Text>
                <Text className={`font-bold text-base ${paymentMethod === "Cash" ? "text-blue-400" : "text-white"}`}>
                  Cash
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Divider */}
          <View className="h-px bg-gray-700 mb-4" />

          {/* Reason Section (Full Refund) */}
          {refundType === "full" && (
            <>
              <View className="mb-4">
                <Text className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
                  Reason
                </Text>
                <BottomSheetTextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Enter reason for the refund..."
                  placeholderTextColor="#6B7280"
                  multiline
                  style={{
                    backgroundColor: colors.card,
                    color: "white",
                    padding: 12,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    fontSize: 14,
                    minHeight: 70,
                    textAlignVertical: "top",
                  }}
                />
              </View>
              {/* Divider */}
              <View className="h-px bg-gray-700 mb-4" />
            </>
          )}

          {/* Partial Refund Item Selection */}
          {refundType === "partial" && (
            <>
              <View className="mb-4">
                <Text className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
                  Select Items
                </Text>
                <View className="gap-y-2">
                  {refundableItems.map((item) => {
                    const isSelected = selectedItems.some(
                      (si) => si.itemId === item.id
                    );
                    const maxRefundable =
                      item.quantity - (item.refundedQuantity || 0);

                    return (
                      <View
                        key={item.id}
                        className={`p-3 rounded-lg border ${
                          isSelected
                            ? "border-blue-500 bg-blue-900/20"
                            : "border-gray-700 bg-surface"
                        }`}
                      >
                        <View className="flex-row items-center justify-between">
                          <View className="flex-1">
                            <Text className="font-bold text-white text-base">
                              {item.name}
                            </Text>
                            <Text className="text-gray-400 text-xs">
                              {maxRefundable} × ${item.price?.toFixed(2)}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => toggleItemSelection(item)}
                            className={`w-8 h-8 rounded-md items-center justify-center ${
                              isSelected
                                ? "bg-red-500/20 border border-red-500"
                                : "bg-green-500/20 border border-green-500"
                            }`}
                          >
                            {isSelected ? (
                              <X color={colors.danger} size={16} />
                            ) : (
                              <Check color={colors.success} size={16} />
                            )}
                          </TouchableOpacity>
                        </View>
                        {isSelected && (
                          <View className="mt-3 gap-y-2">
                            <View className="flex-row items-center gap-2">
                              <Text className="text-sm text-gray-400">Qty:</Text>
                              <BottomSheetTextInput
                                value={getSelectedItemQuantity(item.id).toString()}
                                onChangeText={(t) =>
                                  updateItemQuantity(item.id, parseInt(t) || 0)
                                }
                                keyboardType="numeric"
                                style={{
                                  flex: 1,
                                  backgroundColor: colors.panel,
                                  color: "white",
                                  padding: 8,
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                  fontSize: 14,
                                  textAlign: "center",
                                }}
                              />
                              <Text className="text-sm text-gray-400">/ {maxRefundable}</Text>
                            </View>
                            <BottomSheetTextInput
                              value={getSelectedItemReason(item.id)}
                              onChangeText={(t) => updateItemReason(item.id, t)}
                              placeholder="Reason..."
                              placeholderTextColor="#6B7280"
                              style={{
                                backgroundColor: colors.panel,
                                color: "white",
                                padding: 8,
                                borderRadius: 6,
                                borderWidth: 1,
                                borderColor: colors.border,
                                fontSize: 14,
                              }}
                            />
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              </View>
              {/* Divider */}
              <View className="h-px bg-gray-700 mb-4" />
            </>
          )}

          {/* Summary Section */}
          <View>
            <Text className="text-xs font-semibold text-gray-500 mb-2 uppercase tracking-wider">
              Summary
            </Text>
            <View className="p-3 bg-surface rounded-lg border border-gray-700">
              <View className="flex-row justify-between mb-1">
                <Text className="text-sm text-gray-400">Original Total</Text>
                <Text className="text-sm font-semibold text-white">
                  ${orderTotal.toFixed(2)}
                </Text>
              </View>
              <View className="flex-row justify-between mb-2">
                <Text className="text-sm text-red-400">Refund Amount</Text>
                <Text className="font-bold text-red-400 text-base">
                  -${calculateRefundAmount()?.toFixed(2)}
                </Text>
              </View>
              <View className="h-px bg-gray-600 mb-2" />
              <View className="flex-row justify-between">
                <Text className="text-base text-white font-bold">New Total</Text>
                <Text className="font-bold text-white text-lg">
                  ${(orderTotal - (calculateRefundAmount() ?? 0)).toFixed(2)}
                </Text>
              </View>
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheetView>
    </BottomSheet>
  );
};

const AdvancedRefundModal = forwardRef(AdvancedRefundModalComponent);
AdvancedRefundModal.displayName = "AdvancedRefundModal";

export default AdvancedRefundModal;
