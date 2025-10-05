import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogTitle,
} from "@/components/ui/dialog";
import { Check } from "@/lib/types";
import { Mail, Printer } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";

const DetailRow = ({
  label,
  value,
}: {
  label: string;
  value: string | number;
}) => (
  <View className="flex-row justify-between items-center py-3 border-b border-dashed border-gray-700">
    <Text className="text-lg text-gray-300">{label}</Text>
    <Text className="text-lg font-semibold text-white">{value}</Text>
  </View>
);

const CheckDetailsModal = ({
  isOpen,
  onClose,
  check,
}: {
  isOpen: boolean;
  onClose: () => void;
  check: Check | null;
}) => {
  if (!check) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="p-0 rounded-2xl overflow-hidden bg-[#303030] border border-gray-700 w-[550px] max-h-[90vh]">
        {/* Header */}
        <View className="p-6 border-b border-gray-700">
          <DialogTitle className="text-white text-2xl font-bold text-center">
            Check Details
          </DialogTitle>
        </View>

        {/* Content */}
        <ScrollView contentContainerStyle={{ padding: 24 }}>
          <View className="gap-y-4">
            <DetailRow label="Check Number" value={check.checkNo} />
            <DetailRow label="Status" value={check.status} />
            <DetailRow label="Payee" value={check.payee} />
            <DetailRow label="Date Issued" value={check.dateIssued} />

            {/* Items Section */}
            <View className="pt-4 mt-2 border-t border-gray-700">
              <Text className="text-xl font-bold text-white mb-2">
                Items ({check.items.length})
              </Text>
              {check.items.map((item, index) => (
                <DetailRow
                  key={index}
                  label={item.name}
                  value={`$${item.price.toFixed(2)}`}
                />
              ))}
            </View>

            {/* Totals Section */}
            <View className="pt-4 mt-2 border-t border-gray-700">
              <DetailRow
                label="Subtotal"
                value={`$${check.subtotal.toFixed(2)}`}
              />
              <DetailRow label="Tax" value={`$${check.tax.toFixed(2)}`} />
              <DetailRow label="Tips" value={`$${check.tips.toFixed(2)}`} />
            </View>

            {/* Grand Total */}
            <View className="flex-row justify-between items-center pt-4 mt-2 border-t border-gray-700">
              <Text className="text-2xl font-bold text-white">Total</Text>
              <Text className="text-2xl font-bold text-white">
                ${check.total.toFixed(2)}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Footer with Buttons */}
        <DialogFooter className="p-6 flex-row gap-4 border-t border-gray-700 bg-[#212121] rounded-b-2xl">
          <TouchableOpacity className="flex-1 flex-row justify-center items-center gap-2 py-3 border border-gray-600 rounded-lg">
            <Mail color="#9CA3AF" size={20} />
            <Text className="text-lg font-bold text-gray-300">Send Email</Text>
          </TouchableOpacity>
          <TouchableOpacity className="flex-1 flex-row justify-center items-center gap-2 py-3 bg-blue-600 rounded-lg">
            <Printer color="#FFFFFF" size={20} />
            <Text className="text-lg font-bold text-white">Print Receipt</Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default CheckDetailsModal;
