import { PreviousOrder } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { Users } from "lucide-react-native";
import React, { useMemo } from "react";
import { FlatList, Text, View } from "react-native";

// History Card Component
const HistoryCard = ({
  order,
  tableName,
}: {
  order: PreviousOrder;
  tableName: string;
}) => {
  return (
    <View className="flex-row relative mb-4">
      <View className="absolute left-2 top-2 w-4 h-4 rounded-full bg-[#212121] border-2 border-gray-700 z-10" />
      <View className="flex-1 bg-gray-800 rounded-lg p-3 ml-8 mr-4 border border-gray-700">
        <View className="flex-row justify-between mb-1">
          <Text className="font-bold text-white text-base">
            Table {tableName}
          </Text>
          <Text className="text-xs text-gray-400">{order.orderTime}</Text>
        </View>
        <View className="flex-row gap-4 text-xs text-gray-400 mb-2">
          <View className="flex-row items-center gap-1">
            <Users size={14} color="#9CA3AF" />
            <Text className="text-gray-300">{order.itemCount} items</Text>
          </View>
          {/* Duration is not in PreviousOrder, so omitting for now */}
        </View>
        <View className="flex-row justify-between items-center pt-2 border-t border-gray-700 text-xs">
          <Text className="text-gray-400">Server: {order.server}</Text>
          <Text className="font-bold text-green-400">
            ${order.total.toFixed(2)}
          </Text>
        </View>
      </View>
    </View>
  );
};

const HistoryPanel = () => {
  const { previousOrders } = usePreviousOrdersStore();
  const tablesById = useFloorPlanStore((s) => s.tablesById);

  const getTableName = (tableId: string | undefined) => {
    if (!tableId) return "N/A";
    const table = tablesById[tableId];
    return table ? table.name : "N/A";
  };

  return (
    <View className="h-full flex-col bg-[#292929]">
      <View className="px-4 py-2 border-b border-gray-700">
        <Text className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          Recent Activity
        </Text>
      </View>

      <View className="flex-1 relative pl-6">
        <View className="absolute left-[20px] top-4 bottom-4 w-[2px] bg-gray-700" />
        <FlatList
          data={previousOrders}
          keyExtractor={(item) => item.orderId}
          renderItem={({ item }) => (
            <HistoryCard
              order={item}
              tableName={getTableName(item.service_location_id)}
            />
          )}
          contentContainerStyle={{ paddingVertical: 16 }}
          ListEmptyComponent={() => (
            <View className="flex-1 items-center justify-center p-8">
              <Text className="text-gray-400 text-center">
                No recent activity.
              </Text>
            </View>
          )}
        />
      </View>
    </View>
  );
};

export default HistoryPanel;
