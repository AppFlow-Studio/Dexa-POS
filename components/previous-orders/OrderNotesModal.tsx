import { CartItem, PreviousOrder } from "@/lib/types";
import { X } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

interface OrderNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreviousOrder | null;
}

const ModifierItem = ({ item }: { item: CartItem }) => (
  <View className="border-b border-gray-700 pb-3">
    <View className="flex-row justify-between items-center">
      <Text className="text-xl font-bold text-white">{item.name}</Text>
      <Text className="font-semibold text-lg text-gray-300">
        {item.quantity} PCs
      </Text>
    </View>

    {item.customizations?.modifiers &&
      item.customizations.modifiers.length > 0 && (
        <View className="mt-1.5">
          {item.customizations.modifiers.map((mod, index) => (
            <View key={index} className="mt-1">
              <Text className="font-bold text-base text-gray-400">
                {mod.categoryName}:
              </Text>
              <Text className="text-base text-gray-300 ml-1.5">
                {mod.options
                  .map(
                    (opt) =>
                      `${opt.name}${
                        opt.price > 0 ? ` (+$${opt.price.toFixed(2)})` : ""
                      }`
                  )
                  .join(", ")}
              </Text>
            </View>
          ))}
        </View>
      )}

    {item.customizations?.notes && (
      <View className="mt-1.5">
        <Text className="font-bold text-base text-gray-400 mb-1">Notes:</Text>
        <View className="p-2 bg-[#212121] border border-gray-700 rounded-lg">
          <Text className="text-base text-gray-300 italic">
            {item.customizations.notes}
          </Text>
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
  if (!order) return null;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-xl w-full p-0 rounded-2xl bg-[#303030] border-gray-700">
        <DialogHeader className="flex-row justify-between items-center p-4 border-b border-gray-700">
          <DialogTitle className="text-2xl font-bold text-white">
            Order Notes & Modifiers
          </DialogTitle>
          <TouchableOpacity onPress={onClose} className="p-2">
            <X color="#9CA3AF" size={20} />
          </TouchableOpacity>
        </DialogHeader>
        <View className="p-4">
          <Text className="text-lg font-semibold text-gray-400 mb-3">
            Order #{order.orderId} - Total ${order.total.toFixed(2)}
          </Text>
          <ScrollView className="max-h-[60vh]">
            <View className="space-y-3">
              {order.items.map((item) => (
                <ModifierItem key={item.id} item={item} />
              ))}
            </View>
          </ScrollView>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default OrderNotesModal;
