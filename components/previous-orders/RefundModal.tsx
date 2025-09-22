import { PaymentType, PreviousOrder } from "@/lib/types";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Check, X } from "lucide-react-native";
import React, { useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

interface RefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreviousOrder | null;
}

const RefundModal: React.FC<RefundModalProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  const [refundType, setRefundType] = useState<"full" | "partial">("full");
  const [reason, setReason] = useState("");
  const [selectedItems, setSelectedItems] = useState<
    Array<{ itemId: string; quantity: number; reason: string }>
  >([]);
  const [paymentMethod, setPaymentMethod] = useState<PaymentType>("Card");

  const { refundFullOrder, refundItems } = usePreviousOrdersStore();

  if (!order) return null;

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

    refundItems(order.orderId, selectedItems, "Cashier", paymentMethod);
    toast.success("Partial refund processed successfully", {
      duration: 3000,
      position: ToastPosition.BOTTOM,
    });
    onClose();
  };

  const toggleItemSelection = (itemId: string, maxQuantity: number) => {
    const existingIndex = selectedItems.findIndex(
      (item) => item.itemId === itemId
    );

    if (existingIndex >= 0) {
      // Remove item
      setSelectedItems((prev) => prev.filter((item) => item.itemId !== itemId));
    } else {
      // Add item with full quantity
      setSelectedItems((prev) => [
        ...prev,
        { itemId, quantity: maxQuantity, reason: "" },
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[600px] max-h-[80vh] bg-white rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-gray-800">
            Process Refund
          </DialogTitle>
          <Text className="text-gray-600 mt-2">
            Order #{order.orderId} - ${order.total.toFixed(2)}
          </Text>
        </DialogHeader>

        <ScrollView className="flex-1">
          {/* Refund Type Selection */}
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-800 mb-3">
              Refund Type
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setRefundType("full")}
                className={`flex-1 py-3 px-4 rounded-lg border-2 ${
                  refundType === "full"
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-300"
                }`}
              >
                <Text
                  className={`font-semibold text-center ${
                    refundType === "full" ? "text-blue-600" : "text-gray-600"
                  }`}
                >
                  Full Refund
                </Text>
                <Text className="text-sm text-center text-gray-500 mt-1">
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
                  className={`font-semibold text-center ${
                    refundType === "partial" ? "text-blue-600" : "text-gray-600"
                  }`}
                >
                  Partial Refund
                </Text>
                <Text className="text-sm text-center text-gray-500 mt-1">
                  Select Items
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Payment Method */}
          <View className="mb-6">
            <Text className="text-lg font-semibold text-gray-800 mb-3">
              Refund Method
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
                    className={`font-semibold text-center ${
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
            <View className="mb-6">
              <Text className="text-lg font-semibold text-gray-800 mb-3">
                Reason for Refund
              </Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                placeholder="Enter reason for refund..."
                multiline
                numberOfLines={3}
                className="w-full p-3 border border-gray-300 rounded-lg text-gray-800 h-20"
              />
            </View>
          )}

          {/* Partial Refund Section */}
          {refundType === "partial" && (
            <View className="mb-6">
              <Text className="text-lg font-semibold text-gray-800 mb-3">
                Select Items to Refund
              </Text>
              <ScrollView className="max-h-60">
                {order.items.map((item) => {
                  const isSelected = selectedItems.some(
                    (selected) => selected.itemId === item.id
                  );
                  const selectedQuantity = getSelectedItemQuantity(item.id);
                  const selectedReason = getSelectedItemReason(item.id);

                  return (
                    <View
                      key={item.id}
                      className="mb-4 p-4 border border-gray-200 rounded-lg"
                    >
                      <View className="flex-row items-center justify-between mb-2">
                        <Text className="font-semibold text-gray-800">
                          {item.name}
                        </Text>
                        <Text className="text-gray-600">
                          ${item.price.toFixed(2)} each
                        </Text>
                      </View>

                      <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-gray-600">
                          Quantity: {item.quantity}
                        </Text>
                        <TouchableOpacity
                          onPress={() =>
                            toggleItemSelection(item.id, item.quantity)
                          }
                          className={`p-2 rounded-lg ${
                            isSelected ? "bg-blue-500" : "bg-gray-200"
                          }`}
                        >
                          {isSelected ? (
                            <Check color="white" size={16} />
                          ) : (
                            <X color="gray" size={16} />
                          )}
                        </TouchableOpacity>
                      </View>

                      {isSelected && (
                        <View className="space-y-2">
                          <View className="flex-row items-center gap-2">
                            <Text className="text-gray-600">Refund Qty:</Text>
                            <TextInput
                              value={selectedQuantity.toString()}
                              onChangeText={(text) => {
                                const qty = parseInt(text) || 0;
                                if (qty >= 0 && qty <= item.quantity) {
                                  updateItemQuantity(item.id, qty);
                                }
                              }}
                              keyboardType="numeric"
                              className="flex-1 p-2 border border-gray-300 rounded text-center h-20"
                            />
                            <Text className="text-gray-600">
                              / {item.quantity}
                            </Text>
                          </View>

                          <TextInput
                            value={selectedReason}
                            onChangeText={(text) =>
                              updateItemReason(item.id, text)
                            }
                            placeholder="Reason for this item..."
                            className="w-full p-2 border border-gray-300 rounded text-sm h-20"
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
            <Text className="text-lg font-semibold text-gray-800 mb-2">
              Refund Summary
            </Text>
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Original Total:</Text>
              <Text className="font-semibold">${order.total.toFixed(2)}</Text>
            </View>
            <View className="flex-row justify-between">
              <Text className="text-gray-600">Refund Amount:</Text>
              <Text className="font-semibold text-red-600">
                ${calculateRefundAmount().toFixed(2)}
              </Text>
            </View>
            <View className="flex-row justify-between border-t border-gray-300 pt-2 mt-2">
              <Text className="text-gray-600">Remaining:</Text>
              <Text className="font-semibold">
                ${(order.total - calculateRefundAmount()).toFixed(2)}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Action Buttons */}
        <View className="flex-row gap-3 pt-4 border-t border-gray-200">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-3 border border-gray-300 rounded-lg"
          >
            <Text className="font-bold text-gray-700 text-center">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={
              refundType === "full" ? handleFullRefund : handlePartialRefund
            }
            className="flex-1 py-3 bg-red-500 rounded-lg"
          >
            <Text className="font-bold text-white text-center">
              Process Refund
            </Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default RefundModal;
