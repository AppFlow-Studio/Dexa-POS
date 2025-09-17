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
  <View className="flex-row justify-between items-center py-2 border-b border-dashed border-gray-200">
    <Text className="text-2xl text-accent-500">{label}</Text>
    <Text className="text-2xl font-semibold text-accent-500">{value}</Text>
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
      <DialogContent className="p-0 rounded-[36px] overflow-hidden bg-[#11111A] w-[550px] max-h-[95%]">
        {/* Dark Header */}
        <View className="p-6 rounded-t-[36px]">
          <DialogTitle className="text-[#F1F1F1] text-3xl font-bold text-center">
            Check Details
          </DialogTitle>
        </View>

        {/* White Content */}
        <ScrollView>
          <View className="p-6 rounded-[36px] bg-background-100 gap-y-4">
            <DetailRow label="Check Number" value={check.checkNo} />
            <DetailRow label="Status" value={check.status} />
            <DetailRow label="Payee" value={check.payee} />
            <DetailRow label="Date Issued" value={check.dateIssued} />

            <View className="pt-4 border-t border-dashed border-gray-300">
              <DetailRow
                label="Total Items"
                value={`${check.items.length} Items`}
              />
              {check.items.map((item, index) => (
                <DetailRow
                  key={index}
                  label={item.name}
                  value={`${item.price.toFixed(2)}`}
                />
              ))}
            </View>

            <View className="pt-4 border-t border-dashed border-gray-300">
              <DetailRow
                label="Subtotal"
                value={`${check.subtotal.toFixed(2)}`}
              />
              <DetailRow label="Tax" value={`${check.tax.toFixed(2)}`} />
              <DetailRow label="Tips" value={`${check.tips.toFixed(2)}`} />
            </View>

            <View className="flex-row justify-between items-center pt-4 border-t border-dashed border-gray-300">
              <Text className="text-3xl font-bold text-accent-500">Total</Text>
              <Text className="text-3xl font-bold text-accent-500">
                ${check.total.toFixed(2)}
              </Text>
            </View>

            {/* Footer with Buttons */}
            <DialogFooter className="p-6 flex-row gap-4 border-t border-gray-200">
              <TouchableOpacity className="flex-1 flex-row justify-center items-center gap-2 py-4 border border-gray-300 rounded-lg">
                <Mail color="#4b5563" size={24} />
                <Text className="text-2xl font-bold text-gray-700">
                  Send Email
                </Text>
              </TouchableOpacity>
              <TouchableOpacity className="flex-1 flex-row justify-center items-center gap-2 py-4 bg-primary-400 rounded-lg">
                <Printer color="#FFFFFF" size={24} />
                <Text className="text-2xl font-bold text-white">
                  Print Receipt
                </Text>
              </TouchableOpacity>
            </DialogFooter>
          </View>
        </ScrollView>
      </DialogContent>
    </Dialog>
  );
};

export default CheckDetailsModal;
