import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import React, { useState } from "react";
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

  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const handleToggleExpand = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  return (
    <View className="bg-[#212121] p-8 rounded-2xl border border-gray-700 w-[600px]">
      <Text className="text-3xl font-bold text-center mb-6 text-white">
        Review Items
      </Text>
      <ScrollView
        className="max-h-[350px] mb-4"
        contentContainerClassName="gap-y-2"
      >
        {items.map((item) => (
          <BillItem
            key={item.id}
            item={item}
            expandedItemId={expandedItemId}
            onToggleExpand={handleToggleExpand}
            isEditable={false} // Hide the Edit/Delete functionality in this view
          />
        ))}
      </ScrollView>
      <View className="border-t border-gray-700 pt-4">
        {/* Totals Summary */}
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-2xl text-gray-300">Subtotal</Text>
          <Text className="text-2xl text-white">
            ${activeOrderSubtotal.toFixed(2)}
          </Text>
        </View>
        {activeOrderDiscount > 0 && (
          <View className="flex-row justify-between">
            <Text className="text-2xl text-green-400">Discount</Text>
            <Text className="text-2xl text-green-400">
              -${activeOrderDiscount.toFixed(2)}
            </Text>
          </View>
        )}
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-2xl text-gray-300">Tax</Text>
          <Text className="text-2xl text-white">
            ${activeOrderTax.toFixed(2)}
          </Text>
        </View>
        <View className="flex-row justify-between items-center pt-4 border-t border-dashed border-gray-600">
          <Text className="text-3xl font-bold text-white">Total</Text>
          <Text className="text-3xl font-bold text-white">
            ${activeOrderTotal.toFixed(2)}
          </Text>
        </View>

        {/* Action Buttons */}
        <View className="flex-row gap-4 mt-6">
          <TouchableOpacity
            onPress={close}
            className="flex-1 py-4 bg-[#303030] border border-gray-600 rounded-xl items-center"
          >
            <Text className="text-2xl font-bold text-white text-center">
              Cancel
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              if (paymentMethod === "Card") setView("card");
              else if (paymentMethod === "Cash") setView("cash");
              else if (paymentMethod === "Split") setView("split");
              else setView("cash");
            }}
            className="flex-1 py-4 bg-blue-600 rounded-xl items-center"
          >
            <Text className="text-2xl font-bold text-white text-center">
              Continue
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default ItemsReviewView;
