import { OnlineOrder } from "@/lib/types";
import { ArrowLeft } from "lucide-react-native";
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { FlatList } from "react-native-gesture-handler";
import OnlineOrderCard from "./OnlineOrderCard";

interface KanbanColumnProps {
  title: string;
  color: string;
  orders: OnlineOrder[];
  isFocused: boolean;
  onHeaderPress: () => void;
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  title,
  color,
  orders,
  isFocused,
  onHeaderPress,
}) => {
  const ordersToShow = isFocused ? orders : orders.slice(0, 3);

  return (
    <View className="flex-1 flex-col bg-[#303030] rounded-xl overflow-hidden border border-gray-700">
      <TouchableOpacity
        onPress={onHeaderPress}
        style={{ backgroundColor: color }}
        className="p-3 flex-row items-center justify-center"
      >
        {isFocused && (
          <ArrowLeft size={20} color="white" className="absolute left-4" />
        )}
        <Text className="text-xl font-bold text-center text-white">
          {title} ({orders.length})
        </Text>
      </TouchableOpacity>

      {isFocused ? (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.id}
          numColumns={4}
          contentContainerStyle={{ padding: 12 }}
          columnWrapperStyle={{ gap: 12 }}
          renderItem={({ item }) => (
            <View className="flex-1 mb-3">
              <OnlineOrderCard order={item} />
            </View>
          )}
          ListEmptyComponent={
            <View className="h-40 items-center justify-center">
              <Text className="text-gray-500 text-center">
                No orders in this status.
              </Text>
            </View>
          }
        />
      ) : (
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ padding: 12, gap: 12, flexGrow: 1 }}
        >
          {ordersToShow.length > 0 ? (
            ordersToShow.map((order) => (
              <OnlineOrderCard key={order.id} order={order} />
            ))
          ) : (
            <View className="h-40 items-center justify-center">
              <Text className="text-gray-500 text-center">
                No orders in this status.
              </Text>
            </View>
          )}
          {orders.length > 3 && (
            <TouchableOpacity
              onPress={onHeaderPress}
              className="mt-2 py-2 items-center"
            >
              <Text className="text-blue-400 font-semibold underline">
                View All ({orders.length})
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      )}
    </View>
  );
};

export default KanbanColumn;
