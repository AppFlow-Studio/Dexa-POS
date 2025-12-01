import { useToast } from "@/contexts/ToastContext";
import { PaymentType, PreviousOrder } from "@/lib/types";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import React, { useState } from "react";
import {
  KeyboardAvoidingView, // <--- Imported
  Platform, // <--- Imported
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

interface SimpleRefundModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreviousOrder | null;
}

const SimpleRefundModal: React.FC<SimpleRefundModalProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  const [reason, setReason] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentType>("Card");
  const { show } = useToast();

  const { refundFullOrder } = usePreviousOrdersStore();

  if (!order) return null;

  const handleRefund = () => {
    if (!reason.trim()) {
      show({
        title: "Reason Required",
        message: "A reason must be provided to process the refund.",
        type: "error",
      });
      return;
    }

    refundFullOrder(order.orderId, reason, "Cashier", paymentMethod);
    show({
      title: "Refund Processed",
      message: `The refund for order #${order.orderId} has been successfully processed.`,
      type: "success",
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[500px] bg-white rounded-2xl">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <DialogHeader>
            <DialogTitle className="text-2xl font-bold text-gray-800">
              Process Refund
            </DialogTitle>
            <Text className="text-gray-600 mt-2">
              Order #{order.orderId} - ${order.total.toFixed(2)}
            </Text>
          </DialogHeader>

          <ScrollView className="flex-1">
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

            {/* Reason for Refund */}
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
                  ${order.total.toFixed(2)}
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
              <Text className="font-bold text-gray-700 text-center">
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleRefund}
              className="flex-1 py-3 bg-red-500 rounded-lg"
            >
              <Text className="font-bold text-white text-center">
                Process Refund
              </Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </DialogContent>
    </Dialog>
  );
};

export default SimpleRefundModal;
