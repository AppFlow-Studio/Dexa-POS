import { TrackedOrder } from "@/lib/types";
import { Pencil } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const TrackOrderCard: React.FC<{ order: TrackedOrder }> = ({ order }) => {
  const itemsToShow = order.items.slice(0, 4); // Show a maximum of 4 items

  return (
    <View className="w-72 p-4 bg-white border border-gray-200 rounded-2xl mr-4">
      {/* Header */}
      <View className="flex-row justify-between items-start">
        <View>
          <Text className="text-xl font-bold text-gray-800">
            {order.customerName}
          </Text>
          <Text className="text-sm text-gray-500 mt-1">
            {order.type} • Table {order.table}
          </Text>
        </View>
        <View className="flex-col items-end gap-1">
          <View className="px-2 py-1 bg-gray-100 rounded-md">
            <Text className="font-semibold text-xs text-gray-600">
              {order.status}
            </Text>
          </View>
          <Text className="text-sm text-gray-500">{order.timestamp}</Text>
        </View>
      </View>

      {/* Dashed Separator */}
      <View className="border-b border-dashed border-gray-300 my-3" />

      {/* Item List */}
      <View className="space-y-1">
        {itemsToShow.map((item, index) => (
          <Text key={index} className="text-gray-600">
            {item.quantity}x {item.name}
          </Text>
        ))}
        {order.items.length > 4 && (
          <TouchableOpacity>
            <Text className="font-semibold text-primary-400">
              See More Items
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer */}
      <View className="flex-row justify-between items-center mt-3 border-t border-gray-200 pt-3">
        <TouchableOpacity className="flex-row items-center gap-1 bg-blue-50 py-1 px-2 rounded-md">
          <Text className="font-bold text-xs text-blue-600">Notes</Text>
          <Pencil size={12} color="#2563eb" />
        </TouchableOpacity>
        <Text className="text-sm font-semibold text-gray-600">
          Total Order: {order.totalItems} Items
        </Text>
      </View>
    </View>
  );
};

export default TrackOrderCard;
