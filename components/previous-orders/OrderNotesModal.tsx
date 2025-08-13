import { CartItem, PreviousOrder } from "@/lib/types";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

interface OrderNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreviousOrder | null;
}
const ModifierItem = ({ item }: { item: CartItem }) => (
  <View className="border-b border-gray-100 pb-4">
    <View className="flex-row justify-between items-center">
      <Text className="text-lg font-bold text-gray-800">{item.name}</Text>
      <Text className="font-semibold text-gray-600">{item.quantity} PCs</Text>
    </View>

    {item.customizations?.addOns && item.customizations.addOns.length > 0 && (
      <View className="mt-2">
        <Text className="font-bold text-gray-600 mb-2">Add-ons</Text>
        <View className="flex-row flex-wrap gap-2">
          {item.customizations.addOns.map((addon) => (
            <View
              key={addon.id}
              className="py-2 px-3 bg-white border border-gray-200 rounded-lg"
            >
              <Text className="text-gray-700 font-semibold">
                {addon.name} + ${addon.price.toFixed(2)}
              </Text>
            </View>
          ))}
        </View>
      </View>
    )}
    {item.customizations?.notes && (
      <View className="mt-2">
        <Text className="font-bold text-gray-600 mb-2">Notes</Text>
        <View className="p-3 bg-white border border-gray-200 rounded-lg">
          <Text className="text-gray-500">{item.customizations.notes}</Text>
        </View>
      </View>
    )}
  </View>
);

const OrderNotesModal: React.FC<OrderNotesModalProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-6 rounded-2xl bg-gray-50">
        <DialogHeader className="flex-row justify-between items-center mb-4">
          <DialogTitle className="text-2xl font-bold text-gray-800">
            Modifiers
          </DialogTitle>
          <Text className="text-lg font-semibold text-gray-600">
            Total ${order?.total.toFixed(2)}
          </Text>
        </DialogHeader>
        <ScrollView className="max-h-[70vh]">
          <View className="space-y-4">
            {order?.items.map((item) => (
              <ModifierItem key={item.id} item={item} />
            ))}
          </View>
        </ScrollView>
      </DialogContent>
    </Dialog>
  );
};

export default OrderNotesModal;
