import { PreviousOrder } from "@/lib/types";
import { Printer } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent, DialogTitle } from "../ui/dialog";

interface PrintReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreviousOrder | null;
}
const ReceiptRow = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <View className="flex-row justify-between items-center py-2 border-b border-dashed border-gray-200">
    <Text className="text-2xl text-gray-600">{label}</Text>
    <Text className="text-2xl font-semibold text-gray-800">{value}</Text>
  </View>
);

const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  if (!order) return null;

  // Create a simplified summary for the receipt
  const receiptSummary = order.items.reduce(
    (acc, item) => {
      const existing = acc.find((i) => i.name === item.name);
      if (existing) {
        existing.quantity += item.quantity;
        existing.totalPrice += item.price * item.quantity;
      } else {
        acc.push({
          name: item.name,
          quantity: item.quantity,
          totalPrice: item.price * item.quantity,
        });
      }
      return acc;
    },
    [] as { name: string; quantity: number; totalPrice: number }[]
  );

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 rounded-[36px] overflow-hidden bg-[#11111A] w-[550px]">
        {/* Dark Header */}
        <View className="p-6 rounded-t-[36px]">
          <DialogTitle className="text-[#F1F1F1] text-3xl font-bold text-center">
            Print Receipt
          </DialogTitle>
        </View>

        {/* White Content */}
        <View className="p-6 rounded-[36px] bg-background-100 gap-y-4">
          <ReceiptRow label="No. Transaction" value="PZ05329283" />
          <ReceiptRow label="Table" value="T-12, T-05, T-14" />
          <ReceiptRow label="Payment" value="Cash" />
          <ReceiptRow label="Payment Terminal Id" value="Terminal-a-457678" />

          <View className="mt-4">
            <ReceiptRow
              label="Total Items"
              value={`${order.itemCount} Items`}
            />
            {receiptSummary.map((item) => (
              <ReceiptRow
                key={item.name}
                label={item.name}
                value={`${item.totalPrice.toFixed(2)}`}
              />
            ))}
          </View>

          <View className="mt-4">
            <ReceiptRow label="Subtotal" value={`${order.total.toFixed(2)}`} />
            <ReceiptRow label="Tax" value="$1.50" />
            <ReceiptRow label="Tips" value="$2.00" />
          </View>

          <View className="flex-row justify-between items-center pt-4 border-t border-dashed border-gray-300">
            <Text className="text-3xl font-bold text-accent-500">Total</Text>
            <Text className="text-3xl font-bold text-accent-500">
              ${(order.total + 1.5 + 2.0).toFixed(2)}
            </Text>
          </View>
        </View>
        {/* Footer with Buttons */}
        <View className="p-6 flex-row gap-4 border-t border-gray-200">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-4 border border-gray-300 rounded-lg"
          >
            <Text className="font-bold text-2xl text-gray-700 text-center">
              Close
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => alert("Printing...")}
            className="flex-1 flex-row justify-center items-center gap-2 py-4 bg-primary-400 rounded-lg"
          >
            <Printer color="#FFFFFF" size={24} />
            <Text className="font-bold text-white text-2xl">Print Receipt</Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default PrintReceiptModal;
