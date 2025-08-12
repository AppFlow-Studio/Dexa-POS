import { useCartData } from "@/hooks/useCartData";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import BillItem from "../BillItem";

const ItemsReviewView = () => {
  const { items, subtotal, tax, totalDiscountAmount, total } = useCartData();
  const { close, setView, paymentMethod } = usePaymentStore();

  return (
    <View className=" bg-background-100">
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
            ${subtotal.toFixed(2)}
          </Text>
        </View>
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-base text-gray-600">Tax</Text>
          <Text className="text-base text-gray-800">${tax.toFixed(2)}</Text>
        </View>
        {totalDiscountAmount > 0 && (
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-base text-green-600">Discount</Text>
            <Text className="text-base text-green-600">
              -${totalDiscountAmount.toFixed(2)}
            </Text>
          </View>
        )}
        <View className="flex-row justify-between items-center pt-4 border-t border-dashed border-gray-300">
          <Text className="text-lg font-bold text-gray-900">Total</Text>
          <Text className="text-lg font-bold text-gray-900">
            ${total.toFixed(2)}
          </Text>
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
