import { useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import BillItem from "../BillItem";

const ItemsReviewView = () => {
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const ordersById = useOrderStore((s) => s.ordersById);
  const orderTotals = useActiveOrderTotals();
  const activeOrderSubtotal = orderTotals?.subtotal ?? 0;
  const activeOrderTax = orderTotals?.tax ?? 0;
  const activeOrderDiscount = orderTotals?.discount ?? 0;
  const activeOrderTotal = orderTotals?.total ?? 0;
  const close = usePaymentStore((s) => s.close);
  const setView = usePaymentStore((s) => s.setView);
  const paymentMethod = usePaymentStore((s) => s.paymentMethod);

  const activeOrder = activeOrderId ? ordersById[activeOrderId] : undefined;
  const items = activeOrder?.items || [];

  return (
    <View className="bg-[#212121] p-4 rounded-2xl border border-gray-700 w-[550px]">
      <Text className="text-2xl font-bold text-center mb-4 text-white">
        Review Items
      </Text>
      <ScrollView
        className="max-h-[400px] mb-4"
        contentContainerClassName="gap-y-2"
      >
        {items.map((item) => (
          // FIXED: Removed invalid props (expandedItemId, onToggleExpand, showStatus)
          // BillItemProps only accepts: item, isEditable
          <BillItem
            key={item.id}
            item={item}
            isEditable={false}
          />
        ))}
      </ScrollView>
      <View className="border-t border-gray-700 pt-4">
        {/* Totals Summary */}
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-lg text-gray-300">Subtotal</Text>
          <Text className="text-lg text-white">
            ${activeOrderSubtotal.toFixed(2)}
          </Text>
        </View>
        {activeOrderDiscount > 0 && (
          <View className="flex-row justify-between">
            <Text className="text-lg text-green-400">Discount</Text>
            <Text className="text-lg text-green-400">
              -${activeOrderDiscount.toFixed(2)}
            </Text>
          </View>
        )}
        <View className="flex-row justify-between items-center mb-2">
          <Text className="text-lg text-gray-300">Tax</Text>
          <Text className="text-lg text-white">
            ${activeOrderTax.toFixed(2)}
          </Text>
        </View>
        <View className="flex-row justify-between items-center pt-4 border-t border-dashed border-gray-600">
          <Text className="text-2xl font-bold text-white">Total</Text>
          <Text className="text-2xl font-bold text-white">
            ${activeOrderTotal.toFixed(2)}
          </Text>
        </View>

        {/* Action Buttons */}
        <View className="flex-row gap-4 mt-4">
          <TouchableOpacity
            onPress={close}
            className="flex-1 py-3 bg-[#303030] border border-gray-600 rounded-xl items-center"
          >
            <Text className="text-lg font-bold text-white text-center">
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
            className="flex-1 py-3 bg-blue-600 rounded-xl items-center"
          >
            <Text className="text-lg font-bold text-white text-center">
              Continue
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default ItemsReviewView;
