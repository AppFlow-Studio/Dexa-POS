import DatePicker from "@/components/date-picker";
import KanbanColumn from "@/components/online-orders/KanbanColumn";
import { MOCK_ONLINE_ORDERS } from "@/lib/mockData";
import { useOnlineOrderStore } from "@/stores/useOnlineOrderStore";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Href, Link } from "expo-router";
import { Search, Table } from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";
import { TextInput } from "react-native-gesture-handler";

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
  const [searchCustomer, setSearchCustomer] = useState("");
  const [searchOrderId, setSearchOrderId] = useState("");
  const [searchPartner, setSearchPartner] = useState("All");

  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = useMemo(() => ["40%", "85%"], []);

  const orders = useOnlineOrderStore((state) => state.orders);
  const updateOrderStatus = useOnlineOrderStore((s) => s.updateOrderStatus);
  const rejectOrder = useOnlineOrderStore((s) => s.rejectOrder);
  const archiveOrder = useOnlineOrderStore((s) => s.archiveOrder);

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

  const filteredForSearch = useMemo(() => {
    return orders.filter((order) => {
      const matchesCustomer = searchCustomer
        ? order.customerName.toLowerCase().includes(searchCustomer.toLowerCase())
        : true;
      const matchesOrderId = searchOrderId
        ? order.id.toLowerCase().includes(searchOrderId.toLowerCase())
        : true;
      const matchesPartner = searchPartner === "All" || order.deliveryPartner === searchPartner;
      return matchesCustomer && matchesOrderId && matchesPartner;
    });
  }, [orders, searchCustomer, searchOrderId, searchPartner]);

  const openSearchSheet = () => bottomSheetRef.current?.expand();
  const closeSearchSheet = () => bottomSheetRef.current?.close();

  return (
    <View className="flex-1 px-6 bg-[#212121]">
      {/* Toolbar */}

      <View className="flex-row items-center justify-between my-4">
        <View className="flex-row items-center justify-end gap-x-4">
          <TouchableOpacity
            onPress={openSearchSheet}
            activeOpacity={0.8}
            className="flex-row items-center bg-[#303030] rounded-2xl border border-gray-600 p-4 w-fit"
          >
            <Search color="#9CA3AF" size={24} />
          </TouchableOpacity>
          <Link href='/order-processing' asChild>
            <TouchableOpacity
              className="flex-row items-center bg-[#303030] rounded-2xl border border-gray-600 p-4 w-fit"
            >
              <Table color="#9CA3AF" size={24} />
            </TouchableOpacity>
          </Link>
        </View>
        <View className="flex-row items-center bg-[#303030] border border-gray-600 p-2 rounded-xl">
          {PARTNERS.map((partner) => (
            <TouchableOpacity
              key={partner}
              onPress={() => setActivePartner(partner)}
              className={`py-3 px-6 rounded-lg ${activePartner === partner ? "bg-[#212121]" : ""}`}
            >
              <Text
                className={`text-xl font-semibold ${activePartner === partner ? "text-blue-400" : "text-gray-300"}`}
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
      {/* Search Bottom Sheet */}
      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        backgroundStyle={{ backgroundColor: "#2b2b2b" }}
        handleIndicatorStyle={{ backgroundColor: "#555" }}
      >
        <BottomSheetScrollView contentContainerStyle={{ padding: 16 }}>
          <Text className="text-white text-xl font-bold mb-4">Search Online Orders</Text>

          <View className="gap-y-3 mb-4">
            <View className="bg-[#303030] border border-gray-600 rounded-xl px-4">
              <Text className="text-gray-400 mt-3 mb-1">Customer Name</Text>
              <TextInput
                value={searchCustomer}
                onChangeText={setSearchCustomer}
                placeholder="e.g. John Smith"
                placeholderTextColor="#9CA3AF"
                className="text-white text-lg py-3"
              />
            </View>

            <View className="bg-[#303030] border border-gray-600 rounded-xl px-4">
              <Text className="text-gray-400 mt-3 mb-1">Order ID</Text>
              <TextInput
                value={searchOrderId}
                onChangeText={setSearchOrderId}
                placeholder="#45654"
                placeholderTextColor="#9CA3AF"
                className="text-white text-lg py-3"
                autoCapitalize="none"
              />
            </View>

            <View>
              <Text className="text-gray-400 mb-2">Delivery Service</Text>
              <View className="flex-row flex-wrap gap-2">
                {PARTNERS.map((partner) => (
                  <TouchableOpacity
                    key={`filter_${partner}`}
                    onPress={() => setSearchPartner(partner)}
                    className={`px-3 py-2 rounded-lg border ${searchPartner === partner
                      ? "bg-blue-900/30 border-blue-500"
                      : "bg-[#303030] border-gray-600"
                      }`}
                  >
                    <Text className={`${searchPartner === partner ? "text-blue-400" : "text-gray-300"}`}>
                      {partner}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          {/* Results */}
          <View className="mt-2">
            <Text className="text-gray-300 mb-3">Results ({filteredForSearch.length})</Text>
            <View className="gap-y-3">
              {filteredForSearch.map((order) => (
                <View key={order.id} className="bg-[#303030] border border-gray-600 rounded-xl p-4">
                  <View className="flex-row justify-between items-start mb-3">
                    <View>
                      <Text className="text-white text-base font-semibold">{order.id}</Text>
                      <Text className="text-gray-300">{order.customerName} • {order.deliveryPartner}</Text>
                      <Text className="text-gray-400 text-xs mt-1">Status: {order.status}</Text>
                    </View>
                    <Text className="text-white font-semibold">${order.total.toFixed(2)}</Text>
                  </View>

                  <View className="flex-row flex-wrap gap-2">
                    <TouchableOpacity
                      onPress={() => updateOrderStatus(order.id, "Confirmed/In-Process")}
                      className="px-3 py-2 rounded-lg bg-green-600/20 border border-green-500/40"
                    >
                      <Text className="text-green-400">Accept</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => rejectOrder(order.id)}
                      className="px-3 py-2 rounded-lg bg-red-600/20 border border-red-500/40"
                    >
                      <Text className="text-red-400">Reject</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => updateOrderStatus(order.id, "Ready to Dispatch")}
                      className="px-3 py-2 rounded-lg bg-purple-600/20 border border-purple-500/40"
                    >
                      <Text className="text-purple-300">Mark Ready</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => updateOrderStatus(order.id, "Dispatched")}
                      className="px-3 py-2 rounded-lg bg-blue-600/20 border border-blue-500/40"
                    >
                      <Text className="text-blue-300">Mark Dispatched</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => archiveOrder(order.id)}
                      className="px-3 py-2 rounded-lg bg-gray-600/20 border border-gray-500/40"
                    >
                      <Text className="text-gray-300">Archive</Text>
                    </TouchableOpacity>

                    <Link href={`/online-orders/${order.id.replace("#", "")}` as Href} asChild>
                      <TouchableOpacity
                        onPress={() => { closeSearchSheet(); }}
                        className="px-3 py-2 rounded-lg bg-[#1f2937] border border-gray-600"
                      >
                        <Text className="text-white">View Details</Text>
                      </TouchableOpacity>
                    </Link>
                  </View>
                </View>
              ))}
            </View>
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
    </View>
  );
};

export default OnlineOrdersScreen;
