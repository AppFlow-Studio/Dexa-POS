import { useOrderStore } from "@/stores/useOrderStore";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import BillItem from "../bill/BillItem"; // Reuse the BillItem component

const OrderLineItemsView = ({ onClose }: { onClose: () => void }) => {
  // Get all data directly from the order store
  const {
    activeOrderId,
    orders,
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderDiscount,
    activeOrderTotal,
  } = useOrderStore();

  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const items = activeOrder?.items || [];

  return (
    <View className="bg-background-100 p-6 rounded-2xl">
      <Text className="text-2xl font-bold text-center mb-4 text-accent-400">
        Items
      </Text>
      <ScrollView className="max-h-80" showsVerticalScrollIndicator={false}>
        {items.map((item) => (
          // You can pass an onEdit handler here if you want to allow editing from this view
          <BillItem key={item.id} item={item} />
        ))}
      </ScrollView>
      <View className="border-t border-gray-200 pt-4 mt-4">
        {/* Totals Summary */}
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-base text-gray-600">Subtotal</Text>
          <Text className="text-base text-gray-800">
            ${activeOrderSubtotal.toFixed(2)}
          </Text>
        </View>
        {activeOrderDiscount > 0 && (
          <View className="flex-row justify-between items-center mb-2">
            <Text className="text-base text-green-600">Discount</Text>
            <Text className="text-base text-green-600">
              -${activeOrderDiscount.toFixed(2)}
            </Text>
          </View>
        )}
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-base text-gray-600">Tax</Text>
          <Text className="text-base text-gray-800">
            ${activeOrderTax.toFixed(2)}
          </Text>
        </View>
        <View className="flex-row justify-between items-center pt-4 border-t border-dashed border-gray-300">
          <Text className="text-lg font-bold text-gray-900">Total</Text>
          <Text className="text-lg font-bold text-gray-900">
            ${activeOrderTotal.toFixed(2)}
          </Text>
        </View>

        {/* Single Action Button */}
        <TouchableOpacity
          onPress={onClose}
          className="w-full py-3 mt-6 border border-gray-300 rounded-lg items-center"
        >
          <Text className="font-bold text-gray-700">Return</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default OrderLineItemsView;
