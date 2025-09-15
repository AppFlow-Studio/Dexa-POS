import DatePicker from "@/components/date-picker";
import KanbanColumn from "@/components/online-orders/KanbanColumn";
import { MOCK_ONLINE_ORDERS } from "@/lib/mockData";
import { useOnlineOrderStore } from "@/stores/useOnlineOrderStore";
import { Search } from "lucide-react-native";
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
  const [selectedDate, setSelectedDate] = useState(new Date("2021-09-19"));

  const orders = useOnlineOrderStore((state) => state.orders);

  const groupedOrders = useMemo(() => {
    // 3. Filter the live data from the store
    const filtered = orders.filter(
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
  }, [orders, activePartner]);

  return (
    <View className="flex-1 px-6 bg-[#212121]">
      {/* Toolbar */}
      <View className="flex-row items-center bg-[#303030] rounded-2xl border border-gray-600 p-3 py-0 w-full">
        <Search color="#9CA3AF" size={16} />
        <TextInput
          placeholder="Search Order No."
          placeholderTextColor="#9CA3AF"
          className="ml-2 text-base flex-1 text-white"
        />
      </View>
      <View className="flex-row items-center justify-between my-4">
        <View className="flex-row items-center bg-[#303030] border border-gray-600 p-1 rounded-xl">
          {PARTNERS.map((partner) => (
            <TouchableOpacity
              key={partner}
              onPress={() => setActivePartner(partner)}
              className={`py-2 px-4 rounded-lg ${activePartner === partner ? "bg-[#212121]" : ""}`}
            >
              <Text
                className={`font-semibold ${activePartner === partner ? "text-blue-400" : "text-gray-300"}`}
              >
                {partner}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <DatePicker date={selectedDate} onDateChange={setSelectedDate} />
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
