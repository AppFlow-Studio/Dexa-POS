import { CartItem } from "@/stores/useCartStore";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

interface OrderNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  items: CartItem[];
}

const OrderNotesModal: React.FC<OrderNotesModalProps> = ({
  isOpen,
  onClose,
  items,
}) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg p-6 rounded-2xl bg-white">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-center">
            Order Notes
          </DialogTitle>
        </DialogHeader>
        <ScrollView className="my-4 max-h-96">
          <View className="space-y-4">
            {items.map((item) => (
              <View key={item.id} className="border-b border-gray-200 pb-4">
                <Text className="text-lg font-bold text-gray-800">
                  {item.name}
                </Text>
                {item.customizations.addOns &&
                  item.customizations.addOns.length > 0 && (
                    <View className="mt-2">
                      <Text className="font-semibold text-gray-600">
                        Add-ons
                      </Text>
                      <Text className="text-gray-500">
                        {item.customizations.addOns
                          .map((a) => `${a.name} + $${a.price.toFixed(2)}`)
                          .join(", ")}
                      </Text>
                    </View>
                  )}
                {item.customizations.notes && (
                  <View className="mt-2">
                    <Text className="font-semibold text-gray-600">Notes</Text>
                    <Text className="text-gray-500">
                      {item.customizations.notes}
                    </Text>
                  </View>
                )}
              </View>
            ))}
          </View>
        </ScrollView>
      </DialogContent>
    </Dialog>
  );
};

export default OrderNotesModal;
