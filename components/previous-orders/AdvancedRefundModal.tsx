import { CartItem, PaymentType, PreviousOrder } from "@/lib/types";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Check, X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

interface AdvancedRefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreviousOrder | null;
}

interface RefundItem {
  itemId: string;
  quantity: number;
  reason: string;
}

const AdvancedRefundModal: React.FC<AdvancedRefundModalProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [reason, setReason] = useState("");
  const [selectedItems, setSelectedItems] = useState<RefundItem[]>([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentType>("Card");

  const { refundFullOrder, refundItems } = usePreviousOrdersStore();

  useEffect(() => {
    // When the modal opens or the order changes, reset the local state
    if (isOpen && order) {
      // Determine if a full refund is still possible
      const canDoFull = (order.refundedAmount || 0) < 0.01;
      setRefundType(canDoFull ? "full" : "partial");
      setReason("");
      setSelectedItems([]);
      setPaymentMethod("Card");
    }
  }, [isOpen, order]);

  if (!order) return null;

  const refundableItems = useMemo(() => {
    return order.items.filter(
      (item) => (item.refundedQuantity || 0) < item.quantity
    );
  }, [order.items]);

  // 2. The Full Refund option should only be available if the order is not partially refunded.
  const canDoFullRefund = (order.refundedAmount || 0) < 0.01;

  // Reset refundType if full refund is not possible
  useEffect(() => {
    if (!canDoFullRefund && refundType === "full") {
      setRefundType("partial");
    }
  }, [canDoFullRefund, refundType]);

  const handleFullRefund = () => {
    if (!reason.trim()) {
      toast.error("Please provide a reason for the refund", {
        duration: 3000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    refundFullOrder(order.orderId, reason, "Cashier", paymentMethod);
    toast.success("Full refund processed successfully", {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
    onClose();
  };

  const handlePartialRefund = () => {
    if (selectedItems.length === 0) {
      toast.error("Please select items to refund", {
        duration: 3000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    // Validate that all selected items have reasons
    const itemsWithReasons = selectedItems.filter((item) => item.reason.trim());
    if (itemsWithReasons.length !== selectedItems.length) {
      toast.error("Please provide reasons for all selected items", {
        duration: 3000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    refundItems(order.orderId, selectedItems, "Cashier", paymentMethod);
    toast.success("Partial refund processed successfully", {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
    onClose();
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
      return order.total;
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[600px] max-h-[90vh] bg-white rounded-2xl">
        <DialogHeader className="p-4 rounded-t-2xl">
          <DialogTitle className="font-bold text-gray-800">
            <Text className="text-2xl">Process Refund</Text>
          </DialogTitle>
          <View className="flex-row items-center justify-between mt-1.5">
            <Text className="text-lg text-gray-600">
              Order #{order.orderId} - ${order.total.toFixed(2)}
            </Text>
            <View
              className={`px-2 py-1 rounded-full ${getStatusColor(
                order.paymentStatus
              )}`}
            >
              <Text
                className={`font-semibold text-base ${getStatusColor(
                  order.paymentStatus
                )}`}
              >
                {order.paymentStatus}
              </Text>
            </View>
          </View>
        </DialogHeader>

        <ScrollView>
          <View className="mb-4 px-4">
            <Text className="text-xl font-semibold text-gray-800 mb-2">
              Refund Type
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setRefundType("full")}
                disabled={!canDoFullRefund}
                className={`flex-1 py-3 px-4 rounded-lg border-2 ${
                  refundType === "full"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300"
                }`}
              >
                <Text
                  className={`font-semibold text-center text-xl ${
                    refundType === "full" ? "text-blue-600" : "text-gray-600"
                  }`}
                >
                  Full Refund
                </Text>
                <Text className="text-base text-center text-gray-500 mt-0.5">
                  ${order.total.toFixed(2)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRefundType("partial")}
                className={`flex-1 py-3 px-4 rounded-lg border-2 ${
                  refundType === "partial"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300"
                }`}
              >
                <Text
                  className={`font-semibold text-center text-xl ${
                    refundType === "partial" ? "text-blue-600" : "text-gray-600"
                  }`}
                >
                  Partial
                </Text>
                <Text className="text-base text-center text-gray-500 mt-0.5">
                  Select Items
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <View className="mb-4 px-4">
            <Text className="text-xl font-semibold text-gray-800 mb-2">
              Method
            </Text>
            <View className="flex-row gap-3">
              {(["Card", "Cash"] as PaymentType[]).map((method) => (
                <TouchableOpacity
                  key={method}
                  onPress={() => setPaymentMethod(method)}
                  className={`flex-1 py-3 px-4 rounded-lg border-2 ${
                    paymentMethod === method
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-300"
                  }`}
                >
                  <Text
                    className={`font-semibold text-center text-xl ${
                      paymentMethod === method
                        ? "text-blue-600"
                        : "text-gray-600"
                    }`}
                  >
                    {method}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          {refundType === "full" && (
            <View className="mb-4 px-4">
              <Text className="text-xl font-semibold text-gray-800 mb-2">
                Reason
              </Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Reason for refund..."
                multiline
                className="w-full p-3 border border-gray-300 rounded-lg text-base text-gray-800 h-16"
              />
            </View>
          )}

          {refundType === "partial" && (
            <View className="mb-4">
              <Text className="text-lg font-semibold text-gray-800 mb-2 px-4">
                Select Items
              </Text>
              <ScrollView className="max-h-[60vh]">
                {refundableItems.map((item) => {
                  const isSelected = selectedItems.some(
                    (selected) => selected.itemId === item.id
                  );
                  return (
                    <View
                      key={item.id}
                      className="mb-3 p-4 border border-gray-200 rounded-lg mx-4"
                    >
                      <View className="flex-row items-center justify-between mb-1.5">
                        <Text className="font-semibold text-gray-800 text-lg">
                          {item.name}
                        </Text>
                        <Text className="text-gray-600 text-lg">
                          ${item.price.toFixed(2)}
                        </Text>
                      </View>
                      <View className="flex-row items-center justify-between mb-1.5">
                        <Text className="text-gray-600 text-lg">
                          Qty: {item.quantity}
                        </Text>
                        <TouchableOpacity
                          onPress={() => toggleItemSelection(item)}
                          className={`p-1.5 rounded-lg ${
                            isSelected ? "bg-gray-200" : "bg-blue-500"
                          }`}
                        >
                          {isSelected ? (
                            <X color="gray" size={18} />
                          ) : (
                            <Check color="white" size={18} />
                          )}
                        </TouchableOpacity>
                      </View>
                      {isSelected && (
                        <View className="space-y-1.5">
                          <View className="flex-row items-center gap-1.5">
                            <Text className="text-lg text-gray-600">Qty:</Text>
                            <TextInput
                              value={getSelectedItemQuantity(
                                item.id
                              ).toString()}
                              onChangeText={(t) =>
                                updateItemQuantity(item.id, parseInt(t) || 0)
                              }
                              keyboardType="numeric"
                              className="flex-1 p-2 border border-gray-300 rounded text-center text-lg h-16"
                            />
                            <Text className="text-lg text-gray-600">
                              / {item.quantity}
                            </Text>
                          </View>
                          <TextInput
                            value={getSelectedItemReason(item.id)}
                            onChangeText={(t) => updateItemReason(item.id, t)}
                            placeholder="Reason..."
                            className="w-full p-2 border border-gray-300 rounded text-base h-16"
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View className="mb-4 p-3 bg-gray-50 rounded-lg mx-4">
            <Text className="text-xl font-semibold text-gray-800 mb-1.5">
              Summary
            </Text>
            <View className="flex-row justify-between">
              <Text className="text-lg text-gray-600">Original:</Text>
              <Text className="text-lg font-semibold text-gray-800">
                {order.total.toFixed(2)}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-lg text-gray-600">Refund:</Text>
              <Text className="font-semibold text-red-600 text-xl">
                ${calculateRefundAmount().toFixed(2)}
              </Text>
            </View>
            <View className="flex-row justify-between border-t border-gray-300 pt-1 mt-1">
              <Text className="text-lg text-gray-600">Remaining:</Text>
              <Text className="font-semibold text-lg">
                ${(order.total - calculateRefundAmount()).toFixed(2)}
              </Text>
            </View>
          </View>
        </ScrollView>

        <View className="flex-row gap-3 pt-3 border-t border-gray-200 px-4 pb-4">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-3 border border-gray-300 rounded-lg"
          >
            <Text className="font-bold text-xl text-gray-700 text-center">
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={
              refundType === "full" ? handleFullRefund : handlePartialRefund
            }
            className="flex-1 py-3 bg-red-500 rounded-lg"
          >
            <Text className="font-bold text-white text-xl text-center">
              Process Refund
            </Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default AdvancedRefundModal;
