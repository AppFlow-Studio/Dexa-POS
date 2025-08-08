import Header from "@/components/Header";
import KanbanColumn from "@/components/online-orders/KanbanColumn";
import { MOCK_ONLINE_ORDERS } from "@/lib/mockData";
import { Calendar, Search } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const PARTNERS = ["All", "Door Dash", "grubhub", "Uber-Eats", "Food Panda"];
const COLUMNS = [
  { title: "New Orders", color: "#3b82f6" }, // blue-500
  { title: "Confirmed/In-Process", color: "#ef4444" }, // red-500
  { title: "Ready to Dispatch", color: "#a855f7" }, // purple-500
  { title: "Dispatched", color: "#22c55e" }, // green-500
];

const OnlineOrdersScreen = () => {
  const [activePartner, setActivePartner] = useState("All");

  const groupedOrders = useMemo(() => {
    const filtered = MOCK_ONLINE_ORDERS.filter(
      (order) =>
        activePartner === "All" || order.deliveryPartner === activePartner
    );

    // Group by status
    return filtered.reduce(
      (acc, order) => {
        if (!acc[order.status]) {
          acc[order.status] = [];
        }
        acc[order.status].push(order);
        return acc;
      },
      {} as Record<string, typeof MOCK_ONLINE_ORDERS>
    );
  }, [activePartner]);

  return (
    <View className="flex-1 p-6 bg-white">
      <Header />
      <Text className="text-3xl font-bold text-gray-800 mt-4">
        Online Orders
      </Text>

      {/* Toolbar */}
      <View className="flex-row items-center justify-between my-4">
        <View className="flex-row items-center bg-gray-100 rounded-lg p-3 w-[300px]">
          <Search color="#6b7280" size={20} />
          <TextInput
            placeholder="Search Order No."
            className="ml-2 text-base flex-1"
          />
        </View>
        <View className="flex-row items-center bg-gray-100 p-1 rounded-xl">
          {PARTNERS.map((partner) => (
            <TouchableOpacity
              key={partner}
              onPress={() => setActivePartner(partner)}
              className={`py-2 px-4 rounded-lg ${activePartner === partner ? "bg-white" : ""}`}
            >
              <Text
                className={`font-semibold ${activePartner === partner ? "text-primary-400" : "text-gray-500"}`}
              >
                {partner}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <TouchableOpacity className="flex-row items-center p-3 bg-gray-100 rounded-lg">
          <Text className="font-semibold text-gray-600 mr-2">
            Date: 02/03/25
          </Text>
          <Calendar color="#6b7280" size={20} />
        </TouchableOpacity>
      </View>

      {/* Kanban Board */}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        {COLUMNS.map((col) => (
          <KanbanColumn
            key={col.title}
            title={col.title}
            color={col.color}
            orders={groupedOrders[col.title] || []}
          />
        ))}
      </ScrollView>
    </View>
  );
};

export default OnlineOrdersScreen;
