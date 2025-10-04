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
      <DialogContent className="w-[700px] max-h-[90vh] bg-[#313131] rounded-2xl border border-gray-700 p-0">
        <DialogHeader className="p-6 border-b border-gray-700">
          <DialogTitle className="text-2xl font-bold text-white">
            Process Refund
          </DialogTitle>
          <View className="flex-row items-center justify-between mt-1">
            <Text className="text-lg text-gray-400">
              Order #{order.orderId} - ${order.total.toFixed(2)}
            </Text>
            <View
              className={`px-2 py-1 rounded-full ${getStatusColor(
                order.paymentStatus
              )}`}
            >
              <Text
                className={`font-semibold text-sm ${getStatusColor(
                  order.paymentStatus
                )}`}
              >
                {order.paymentStatus}
              </Text>
            </View>
          </View>
        </DialogHeader>

        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <View className="gap-y-6">
            {/* Refund Type Section */}
            <View>
              <Text className="text-lg font-semibold text-gray-300 mb-2">
                Refund Type
              </Text>
              <View className="flex-row gap-4">
                <TouchableOpacity
                  onPress={() => setRefundType("full")}
                  disabled={!canDoFullRefund}
                  className={`flex-1 p-4 rounded-lg border-2 ${
                    refundType === "full"
                      ? "border-blue-500 bg-blue-900/30"
                      : "border-gray-600"
                  } ${!canDoFullRefund && "opacity-50"}`}
                >
                  <Text
                    className={`font-semibold text-center text-xl ${
                      refundType === "full" ? "text-blue-400" : "text-gray-300"
                    }`}
                  >
                    Full Refund
                  </Text>
                  <Text className="text-base text-center text-gray-400 mt-1">
                    ${order.total.toFixed(2)}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setRefundType("partial")}
                  className={`flex-1 p-4 rounded-lg border-2 ${
                    refundType === "partial"
                      ? "border-blue-500 bg-blue-900/30"
                      : "border-gray-600"
                  }`}
                >
                  <Text
                    className={`font-semibold text-center text-xl ${
                      refundType === "partial"
                        ? "text-blue-400"
                        : "text-gray-300"
                    }`}
                  >
                    Partial Refund
                  </Text>
                  <Text className="text-base text-center text-gray-400 mt-1">
                    Select Items
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Refund Method Section */}
            <View>
              <Text className="text-lg font-semibold text-gray-300 mb-2">
                Refund Method
              </Text>
              <View className="flex-row gap-4">
                {(["Card", "Cash"] as PaymentType[]).map((method) => (
                  <TouchableOpacity
                    key={method}
                    onPress={() => setPaymentMethod(method)}
                    className={`flex-1 py-4 rounded-lg border-2 ${
                      paymentMethod === method
                        ? "border-blue-500 bg-blue-900/30"
                        : "border-gray-600"
                    }`}
                  >
                    <Text
                      className={`font-semibold text-center text-xl ${
                        paymentMethod === method
                          ? "text-blue-400"
                          : "text-gray-300"
                      }`}
                    >
                      {method}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Reason for Full Refund */}
            {refundType === "full" && (
              <View>
                <Text className="text-lg font-semibold text-gray-300 mb-2">
                  Reason
                </Text>
                <TextInput
                  value={reason}
                  onChangeText={setReason}
                  placeholder="Enter reason for the full refund..."
                  placeholderTextColor="#6B7280"
                  multiline
                  className="w-full p-3 bg-[#212121] border border-gray-600 rounded-lg text-lg text-white h-24"
                />
              </View>
            )}

            {/* Partial Refund Item Selection */}
            {refundType === "partial" && (
              <View>
                <Text className="text-lg font-semibold text-gray-300 mb-2">
                  Select Items to Refund
                </Text>
                <View className="gap-y-3">
                  {refundableItems.map((item) => {
                    const isSelected = selectedItems.some(
                      (si) => si.itemId === item.id
                    );
                    const selectedItem = selectedItems.find(
                      (si) => si.itemId === item.id
                    );
                    const maxRefundable =
                      item.quantity - (item.refundedQuantity || 0);

                    return (
                      <View
                        key={item.id}
                        className="p-4 bg-[#212121] border border-gray-600 rounded-lg gap-y-3"
                      >
                        <View className="flex-row items-center justify-between">
                          <View>
                            <Text className="font-semibold text-white text-lg">
                              {item.name}
                            </Text>
                            <Text className="text-gray-400 text-base mt-1">
                              Refundable: {maxRefundable}
                            </Text>
                          </View>
                          <TouchableOpacity
                            onPress={() => toggleItemSelection(item)}
                            className={`w-8 h-8 rounded-md items-center justify-center border ${
                              isSelected
                                ? "border-red-500 bg-red-500/20"
                                : "border-green-500 bg-green-500/20"
                            }`}
                          >
                            {isSelected ? (
                              <X color="#f87171" size={18} />
                            ) : (
                              <Check color="#4ade80" size={18} />
                            )}
                          </TouchableOpacity>
                        </View>
                        {isSelected && (
                          <View className="space-y-1.5">
                            <View className="flex-row items-center gap-1.5">
                              <Text className="text-lg text-gray-600">
                                Qty:
                              </Text>
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
                </View>
              </View>
            )}

            {/* Summary Section */}
            <View className="p-4 bg-[#212121] rounded-lg border border-gray-600">
              <Text className="text-xl font-semibold text-white mb-2">
                Summary
              </Text>
              <View className="gap-y-1">
                <View className="flex-row justify-between">
                  <Text className="text-lg text-gray-400">Original Total:</Text>
                  <Text className="text-lg font-semibold text-gray-300">
                    ${order.total.toFixed(2)}
                  </Text>
                </View>
                <View className="flex-row justify-between">
                  <Text className="text-lg text-red-400">Refund Amount:</Text>
                  <Text className="font-semibold text-red-400 text-xl">
                    -${calculateRefundAmount().toFixed(2)}
                  </Text>
                </View>
                <View className="flex-row justify-between border-t border-gray-600 pt-2 mt-2">
                  <Text className="text-lg text-white">New Total:</Text>
                  <Text className="font-semibold text-white text-xl">
                    ${(order.total - calculateRefundAmount()).toFixed(2)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </ScrollView>

        <View className="flex-row gap-4 p-6 border-t border-gray-700">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-3 border border-gray-600 rounded-lg items-center"
          >
            <Text className="font-bold text-lg text-gray-300 text-center">
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={
              refundType === "full" ? handleFullRefund : handlePartialRefund
            }
            className="flex-1 py-3 bg-red-600 rounded-lg items-center"
          >
            <Text className="font-bold text-white text-lg text-center">
              Process Refund
            </Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default AdvancedRefundModal;
