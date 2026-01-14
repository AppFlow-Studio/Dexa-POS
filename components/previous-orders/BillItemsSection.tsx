import { OrderProfile } from "@/lib/types";
import React from "react";
import { Text, View } from "react-native";

interface BillItemsSectionProps {
  order: OrderProfile;
}

const BillItemsSection: React.FC<BillItemsSectionProps> = ({ order }) => {
  return (
    <View className="py-4">
      <Text className="text-xl font-bold text-white mb-4">Order Items</Text>

      {/* Order Items List */}
      <View className="bg-[#303030] rounded-lg border border-gray-700 p-4">
        {order.items && order.items.length > 0 ? (
          order.items.map((item, index) => (
            <View
              key={index}
              className="border-b border-gray-700 last:border-b-0 py-3"
            >
              <View className="flex-row justify-between items-start mb-1">
                <View className="flex-1">
                  <Text className="text-white font-semibold text-lg">
                    {item.name || "Unknown Item"}
                  </Text>
                  <Text className="text-gray-400 text-sm">
                    Quantity: {item.quantity || 1}
                  </Text>
                </View>
                <Text className="text-white font-bold text-lg">
                  ${((item.price || 0) * (item.quantity || 1))?.toFixed(2)}
                </Text>
              </View>

              {/* Show modifiers if available */}
              {item.customizations.modifiers && item.customizations.modifiers.length > 0 && (
                <View className="ml-4 mt-1">
                  {item.customizations.modifiers.map((modifier, modIndex) => (
                    <Text key={modIndex} className="text-gray-500 text-sm">
                      • {modifier.categoryName}
                      {modifier.options.map((option, optionIndex) => (
                        <Text key={optionIndex} className="text-gray-500 text-sm">
                          {option.name}
                        </Text>
                      ))}
                    </Text>
                  ))}
                </View>
              )}

              {/* Show notes if available */}
              {item.customizations.notes && (
                <View className="ml-4 mt-1 bg-yellow-900/20 border border-yellow-700 rounded p-2">
                  <Text className="text-yellow-400 text-sm">
                    Note: {item.customizations.notes}
                  </Text>
                </View>
              )}
            </View>
          ))
        ) : (
          <Text className="text-gray-400 text-center py-4">
            No items in this order
          </Text>
        )}
      </View>

      {/* Order Totals */}
      <View className="mt-4 bg-[#303030] rounded-lg border border-gray-700 p-4">
        <View className="flex-row justify-between py-2">
          <Text className="text-gray-400">Subtotal</Text>
          <Text className="text-white font-semibold">
            ${((order.total_amount || 0) - (order.total_tax || 0))?.toFixed(2)}
          </Text>
        </View>
        <View className="flex-row justify-between py-2">
          <Text className="text-gray-400">Tax</Text>
          <Text className="text-white font-semibold">
            ${order.total_tax?.toFixed(2) || "0.00"}
          </Text>
        </View>
        {order.total_discount && order.total_discount > 0 && (
          <View className="flex-row justify-between py-2">
            <Text className="text-red-400">Discount</Text>
            <Text className="text-red-400 font-semibold">
              -${order.total_discount?.toFixed(2)}
            </Text>
          </View>
        )}
        <View className="flex-row justify-between py-2 border-t border-gray-700 mt-2 pt-2">
          <Text className="text-white font-bold text-lg">Total</Text>
          <Text className="text-white font-bold text-lg">
            ${order.total_amount?.toFixed(2) || "0.00"}
          </Text>
        </View>
      </View>
    </View>
  );
};

export default BillItemsSection;
