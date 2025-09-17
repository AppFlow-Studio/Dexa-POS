import { TrackedOrder } from "@/lib/types";
import { Pencil } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const TrackOrderCard: React.FC<{ order: TrackedOrder }> = ({ order }) => {
  const itemsToShow = order.items.slice(0, 4); // Show a maximum of 4 items

  return (
    <View className="w-96 p-6 bg-[#303030] border border-gray-200 rounded-2xl mr-4">
      {/* Header */}
      <View className="flex-row justify-between items-start">
        <View>
          <Text className="text-3xl font-bold text-white">
            {order.customerName}
          </Text>
          <Text className="text-xl text-white mt-1">
            {order.type} • Table {order.table}
          </Text>
        </View>
        <View className="flex-col items-end gap-1">
          <View className="px-3 py-2 bg-gray-100 rounded-md">
            <Text className="font-semibold text-xl text-white">
              {order.status}
            </Text>
          </View>
          <Text className="text-xl text-white">{order.timestamp}</Text>
        </View>
      </View>

      {/* Dashed Separator */}
      <View className="border-b border-dashed border-white my-4" />

      {/* Item List */}
      <View className="space-y-2 flex-1">
        {itemsToShow.map((item, index) => (
          <Text key={index} className="text-2xl text-white">
            {item.quantity}x {item.name}
          </Text>
        ))}
        {order.items.length > 4 && (
          <TouchableOpacity>
            <Text className="text-xl font-semibold text-primary-400">
              See More Items
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Footer */}
      <View className="flex-row justify-between items-center mt-4 border-t border-gray-200 pt-4">
        <TouchableOpacity className="flex-row items-center gap-2 bg-blue-50 py-2 px-3 rounded-md">
          <Text className="font-bold text-xl text-blue-600">Notes</Text>
          <Pencil size={24} color="white" />
        </TouchableOpacity>
        <Text className="text-xl font-semibold text-white">
          Total Order: {order.totalItems} Items
        </Text>
      </View>
    </View>
  );
};

export default TrackOrderCard;
