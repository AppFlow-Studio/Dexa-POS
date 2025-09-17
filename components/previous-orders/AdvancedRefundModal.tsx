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
      <DialogContent className="w-[700px] max-h-[90vh] bg-white rounded-2xl">
        <DialogHeader className="p-6 rounded-t-[36px]">
          <DialogTitle className="font-bold text-gray-800">
            <Text className="text-3xl">Process Refund</Text>
          </DialogTitle>
          <View className="flex-row items-center justify-between mt-2">
            <Text className="text-xl text-gray-600">
              Order #{order.orderId} - ${order.total.toFixed(2)}
            </Text>
            <View
              className={`px-3 py-2 rounded-full ${getStatusColor(order.paymentStatus)}`}
            >
              <Text
                className={`font-semibold text-lg ${getStatusColor(order.paymentStatus)}`}
              >
                {order.paymentStatus}
              </Text>
            </View>
          </View>
        </DialogHeader>

        <ScrollView>
          {/* Refund Type Selection */}
          <View className="mb-6 px-6">
            <Text className="text-2xl font-semibold text-gray-800 mb-3">
              Refund Type
            </Text>
            <View className="flex-row gap-4">
              <TouchableOpacity
                onPress={() => setRefundType("full")}
                disabled={!canDoFullRefund}
                className={`flex-1 py-4 px-6 rounded-lg border-2 ${
                  refundType === "full"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300"
                }`}
              >
                <Text
                  className={`font-semibold text-center text-2xl ${
                    refundType === "full" ? "text-blue-600" : "text-gray-600"
                  }`}
                >
                  Full Refund
                </Text>
                <Text className="text-lg text-center text-gray-500 mt-1">
                  ${order.total.toFixed(2)}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setRefundType("partial")}
                className={`flex-1 py-4 px-6 rounded-lg border-2 ${
                  refundType === "partial"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300"
                }`}
              >
                <Text
                  className={`font-semibold text-center text-2xl ${
                    refundType === "partial" ? "text-blue-600" : "text-gray-600"
                  }`}
                >
                  Partial Refund
                </Text>
                <Text className="text-lg text-center text-gray-500 mt-1">
                  Select Items
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Payment Method */}
          <View className="mb-6 px-6">
            <Text className="text-2xl font-semibold text-gray-800 mb-3">
              Refund Method
            </Text>
            <View className="flex-row gap-4">
              {(["Card", "Cash"] as PaymentType[]).map((method) => (
                <TouchableOpacity
                  key={method}
                  onPress={() => setPaymentMethod(method)}
                  className={`flex-1 py-4 px-6 rounded-lg border-2 ${
                    paymentMethod === method
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-300"
                  }`}
                >
                  <Text
                    className={`font-semibold text-center text-2xl ${
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

          {/* Full Refund Section */}
          {refundType === "full" && (
            <View className="mb-6 px-6">
              <Text className="text-2xl font-semibold text-gray-800 mb-3">
                Reason for Refund
              </Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Enter reason for refund (e.g., Customer dissatisfied, Order error, Item returned)..."
                multiline
                numberOfLines={3}
                className="w-full p-4 border border-gray-300 rounded-lg text-lg text-gray-800"
              />
            </View>
          )}

          {/* Partial Refund Section */}
          {refundType === "partial" && (
            <View className="mb-6">
              <Text className="text-lg font-semibold text-gray-800 mb-3">
                Select Items to Refund
              </Text>
              <ScrollView className="max-h-[70vh]">
                {refundableItems.map((item) => {
                  const isSelected = selectedItems.some(
                    (selected) => selected.itemId === item.id
                  );
                  const selectedQuantity = getSelectedItemQuantity(item.id);
                  const selectedReason = getSelectedItemReason(item.id);
                  // Calculate the actual remaining quantity for this item
                  const maxRefundableQty =
                    item.quantity - (item.refundedQuantity || 0);

                  return (
                    <View
                      key={item.id}
                      className="mb-4 p-6 border border-gray-200 rounded-lg"
                    >
                      <View className="flex-row items-center justify-between mb-2">
                        <Text className="font-semibold text-gray-800 text-xl">
                          {item.name}
                        </Text>
                        <Text className="text-gray-600 text-xl">
                          ${item.price.toFixed(2)} each
                        </Text>
                      </View>

                      <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-gray-600 text-xl">
                          Quantity: {item.quantity} (Refunded:{" "}
                          {item.refundedQuantity || 0})
                        </Text>
                        <TouchableOpacity
                          onPress={() => toggleItemSelection(item)}
                          className={`p-2 rounded-lg ${
                            isSelected ? "bg-gray-200" : "bg-blue-500"
                          }`}
                        >
                          {isSelected ? (
                            <X color="gray" size={20} />
                          ) : (
                            <Check color="white" size={20} />
                          )}
                        </TouchableOpacity>
                      </View>

                      {isSelected && (
                        <View className="space-y-2">
                          <View className="flex-row items-center gap-2">
                            <Text className="text-xl text-gray-600">
                              Refund Qty:
                            </Text>
                            <TextInput
                              value={selectedQuantity.toString()}
                              onChangeText={(text) => {
                                const qty = parseInt(text) || 0;
                                if (qty > item.quantity) {
                                  toast.error(
                                    "Quantity cannot be greater than item quantity",
                                    {
                                      duration: 3000,
                                      position: ToastPosition.BOTTOM,
                                    }
                                  );
                                }
                                if (qty >= 0 && qty <= item.quantity) {
                                  updateItemQuantity(item.id, qty);
                                }
                              }}
                              keyboardType="numeric"
                              className="flex-1 p-3 border border-gray-300 rounded text-center text-xl"
                            />
                            <Text className="text-xl text-gray-600">
                              / {item.quantity}
                            </Text>
                          </View>

                          <TextInput
                            value={selectedReason}
                            onChangeText={(text) =>
                              updateItemReason(item.id, text)
                            }
                            placeholder="Reason for this item..."
                            className="w-full p-3 border border-gray-300 rounded text-lg"
                          />
                        </View>
                      )}
                    </View>
                  );
                })}
              </ScrollView>
            </View>
          )}

          {/* Refund Summary */}
          <View className="mb-6 p-4 bg-gray-50 rounded-lg">
            <Text className="text-2xl font-semibold text-gray-800 mb-2">
              Refund Summary
            </Text>
            <View className="flex-row justify-between">
              <Text className="text-xl text-gray-600">Original Total:</Text>
              <Text className="text-xl font-semibold text-gray-800">
                {order.total.toFixed(2)}
              </Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-xl text-gray-600">Refund Amount:</Text>
              <Text className="font-semibold text-red-600 text-2xl">
                ${calculateRefundAmount().toFixed(2)}
              </Text>
            </View>
            <View className="flex-row justify-between border-t border-gray-300 pt-2 mt-2">
              <Text className="text-xl text-gray-600">Remaining:</Text>
              <Text className="font-semibold text-xl">
                ${(order.total - calculateRefundAmount()).toFixed(2)}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View className="flex-row gap-4 pt-4 border-t border-gray-200">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-4 border border-gray-300 rounded-lg"
          >
            <Text className="font-bold text-2xl text-gray-700 text-center">
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={
              refundType === "full" ? handleFullRefund : handlePartialRefund
            }
            className="flex-1 py-4 bg-red-500 rounded-lg"
          >
            <Text className="font-bold text-white text-2xl text-center">
              Process Refund
            </Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default AdvancedRefundModal;
