import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import BillItem from "../BillItem";

const ItemsReviewView = () => {
  const {
    activeOrderId,
    orders,
    activeOrderSubtotal,
    activeOrderTax,
    activeOrderDiscount,
    activeOrderTotal,
    activeOrderOutstandingSubtotal,
    activeOrderOutstandingTax,
    activeOrderOutstandingTotal,
  } = useOrderStore();
  const { close, setView, paymentMethod } = usePaymentStore();

  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const items = activeOrder?.items || [];

  return (
    <View className=" bg-background-100 p-6 rounded-2xl">
      <Text className="text-2xl font-bold text-center mb-4 text-accent-400">
        Items
      </Text>
      <ScrollView>
        {items.map((item) => (
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
          <View className="flex-row justify-between">
            <Text className="text-green-600">Discount</Text>
            <Text className="text-green-600">
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
        {activeOrderDiscount > 0 && (
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-base text-green-600">Discount</Text>
            <Text className="text-base text-green-600">
              -${activeOrderDiscount.toFixed(2)}
            </Text>
          </View>
        )}
        <View className="flex-row justify-between items-center pt-4 border-t border-dashed border-gray-300">
          <Text className="text-lg font-bold text-gray-900">Total</Text>
          <Text className="text-lg font-bold text-gray-900">
            ${activeOrderTotal.toFixed(2)}
          </Text>
        </View>
        {/* Outstanding section (to be charged now) */}
        <View className="mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-sm font-semibold text-yellow-800">Outstanding Subtotal</Text>
            <Text className="text-sm font-bold text-yellow-900">${activeOrderOutstandingSubtotal.toFixed(2)}</Text>
          </View>
          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-sm text-yellow-800">Outstanding Tax</Text>
            <Text className="text-sm font-semibold text-yellow-900">${activeOrderOutstandingTax.toFixed(2)}</Text>
          </View>
          <View className="flex-row justify-between items-center">
            <Text className="text-base font-bold text-yellow-900">Amount to Charge</Text>
            <Text className="text-base font-bold text-yellow-900">${activeOrderOutstandingTotal.toFixed(2)}</Text>
          </View>
        </View>
        {/* Actions */}
        <View className="flex-row gap-2 mt-6">
          <TouchableOpacity
            onPress={close}
            className="flex-1 py-3 border border-gray-300 rounded-lg items-center"
          >
            <Text className="font-bold text-gray-700">Return</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setView(paymentMethod!.toLowerCase() as any)}
            className="flex-1 py-3 bg-primary-400 rounded-lg items-center"
          >
            <Text className="font-bold text-white">Checkout</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default ItemsReviewView;
