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

  // State for managing expanded item
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  const handleToggleExpand = (itemId: string) => {
    setExpandedItemId(expandedItemId === itemId ? null : itemId);
  };

  return (
    <View className=" bg-background-100 p-6 rounded-2xl">
      <Text className="text-2xl font-bold text-center mb-4 text-accent-400">
        Items
      </Text>
      <ScrollView>
        {items.map((item) => (
          <BillItem
            key={item.id}
            item={item}
            expandedItemId={expandedItemId}
            onToggleExpand={handleToggleExpand}
          />
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
        <View className="flex-row justify-between items-center pt-4 border-t border-dashed border-gray-300">
          <Text className="text-lg font-bold text-gray-900">Total</Text>
          <Text className="text-lg font-bold text-gray-900">
            ${activeOrderTotal.toFixed(2)}
          </Text>
        </View>
        {/* Outstanding section (to be charged now) */}
        <View className="mt-4 p-3 rounded-lg bg-yellow-50 border border-yellow-200">
          <Text className="text-sm font-semibold text-yellow-800 mb-2">
            Outstanding Amount
          </Text>

          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-sm text-yellow-700">Subtotal</Text>
            <Text className="text-sm font-medium text-yellow-800">
              ${activeOrderOutstandingSubtotal.toFixed(2)}
            </Text>
          </View>
          {activeOrderDiscount > 0 && (
            <View className="flex-row justify-between items-center mb-1">
              <Text className="text-sm text-yellow-700">Discount</Text>
              <Text className="text-sm font-medium text-yellow-800">
                - ${activeOrderDiscount.toFixed(2)}
              </Text>
            </View>
          )}

          <View className="flex-row justify-between items-center mb-1">
            <Text className="text-sm text-yellow-700">Tax</Text>
            <Text className="text-sm font-medium text-yellow-800">
              ${activeOrderOutstandingTax.toFixed(2)}
            </Text>
          </View>
          <View className="flex-row justify-between items-center pt-2 border-t border-yellow-200">
            <Text className="text-base font-bold text-yellow-800">Total</Text>
            <Text className="text-base font-bold text-yellow-800">
              ${activeOrderOutstandingTotal.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Action Buttons */}
        <View className="flex-row gap-3 mt-6">
          <TouchableOpacity
            onPress={close}
            className="flex-1 py-3 border border-gray-300 rounded-lg"
          >
            <Text className="font-bold text-gray-700 text-center">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => {
              // Route to the correct payment method view based on the selected method
              if (paymentMethod === "Card") {
                setView("card");
              } else if (paymentMethod === "Cash") {
                setView("cash");
              } else if (paymentMethod === "Split") {
                setView("split");
              } else {
                // Default to cash if no method is selected
                setView("cash");
              }
            }}
            className="flex-1 py-3 bg-accent-400 rounded-lg"
          >
            <Text className="font-bold text-white text-center">Continue</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default ItemsReviewView;
