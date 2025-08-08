import { OnlineOrder } from "@/lib/types";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import OnlineOrderCard from "./OnlineOrderCard";

interface KanbanColumnProps {
  title: string;
  color: string;
  orders: OnlineOrder[];
}

const KanbanColumn: React.FC<KanbanColumnProps> = ({
  title,
  color,
  orders,
}) => {
  return (
    <View className="w-80 mr-4">
      <View className={`p-3 rounded-t-xl`} style={{ backgroundColor: color }}>
        <Text className="font-bold text-white text-center">{title}</Text>
      </View>
      <ScrollView className="bg-gray-100 p-2 rounded-b-xl">
        <View className="space-y-3">
          {orders.map((order) => (
            <OnlineOrderCard key={order.id} order={order} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

export default KanbanColumn;
