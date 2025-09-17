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
    <View className="w-80 mr-6">
      <View className={`p-4 rounded-xl`} style={{ backgroundColor: color }}>
        <Text className="text-2xl font-bold text-center text-white">
          {title}
        </Text>
      </View>
      <ScrollView className="py-3">
        <View className="gap-y-4">
          {orders.map((order) => (
            <OnlineOrderCard key={order.id} order={order} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

export default KanbanColumn;
