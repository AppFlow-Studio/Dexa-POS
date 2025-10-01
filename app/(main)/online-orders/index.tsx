import DatePicker from "@/components/date-picker";
import KanbanColumn from "@/components/online-orders/KanbanColumn";
import { MOCK_ONLINE_ORDERS } from "@/lib/mockData";
import { useOnlineOrderStore } from "@/stores/useOnlineOrderStore";
import BottomSheet, { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { Href, Link } from "expo-router";
import { Search, Table } from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
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
    return filtered.reduce((acc, order) => {
      if (!acc[order.status]) {
        acc[order.status] = [];
      }
      acc[order.status].push(order);
      return acc;
    }, {} as Record<string, typeof MOCK_ONLINE_ORDERS>);
  }, [orders, activePartner]);

  const filteredForSearch = useMemo(() => {
    return orders.filter((order) => {
      const matchesCustomer = searchCustomer
        ? order.customerName
            .toLowerCase()
            .includes(searchCustomer.toLowerCase())
        : true;
      const matchesOrderId = searchOrderId
        ? order.id.toLowerCase().includes(searchOrderId.toLowerCase())
        : true;
      const matchesPartner =
        searchPartner === "All" || order.deliveryPartner === searchPartner;
      return matchesCustomer && matchesOrderId && matchesPartner;
    });
  }, [orders, searchCustomer, searchOrderId, searchPartner]);

  const openSearchSheet = () => bottomSheetRef.current?.expand();
  const closeSearchSheet = () => bottomSheetRef.current?.close();

  return (
    <View className="flex-1 px-4 bg-[#212121]">
      <View className="flex-row items-center justify-between my-3">
        <View className="flex-row items-center justify-end gap-x-3">
          <TouchableOpacity
            onPress={openSearchSheet}
            activeOpacity={0.8}
            className="flex-row items-center bg-[#303030] rounded-xl border border-gray-600 p-3"
          >
            <Search color="#9CA3AF" size={20} />
          </TouchableOpacity>
          <Link href="/order-processing" asChild>
            <TouchableOpacity className="flex-row items-center bg-[#303030] rounded-xl border border-gray-600 p-3">
              <Table color="#9CA3AF" size={20} />
            </TouchableOpacity>
          </Link>
        </View>
        <View className="flex-row items-center bg-[#303030] border border-gray-600 p-1 rounded-xl">
          {PARTNERS.map((partner) => (
            <TouchableOpacity
              key={partner}
              onPress={() => setActivePartner(partner)}
              className={`py-2 px-4 rounded-lg ${
                activePartner === partner ? "bg-[#212121]" : ""
              }`}
            >
              <Text
                className={`text-lg font-semibold ${
                  activePartner === partner ? "text-blue-400" : "text-gray-300"
                }`}
              >
                {partner}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <DatePicker date={selectedDate} onDateChange={setSelectedDate} />
      </View>

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

      <BottomSheet
        ref={bottomSheetRef}
        index={-1}
        snapPoints={snapPoints}
        backgroundStyle={{ backgroundColor: "#2b2b2b" }}
        handleIndicatorStyle={{ backgroundColor: "#555" }}
      >
        <BottomSheetScrollView contentContainerStyle={{ padding: 12 }}>
          <Text className="text-white text-lg font-bold mb-3">
            Search Online Orders
          </Text>
          <View className="gap-y-2 mb-3">
            <View className="bg-[#303030] border border-gray-600 rounded-xl px-3">
              <Text className="text-gray-400 mt-2 mb-1 text-sm">
                Customer Name
              </Text>
              <TextInput
                value={searchCustomer}
                onChangeText={setSearchCustomer}
                placeholder="e.g. John Smith"
                className="text-white text-base py-2"
              />
            </View>
            <View className="bg-[#303030] border border-gray-600 rounded-xl px-3">
              <Text className="text-gray-400 mt-2 mb-1 text-sm">Order ID</Text>
              <TextInput
                value={searchOrderId}
                onChangeText={setSearchOrderId}
                placeholder="#45654"
                className="text-white text-base py-2"
              />
            </View>
            <View>
              <Text className="text-gray-400 mb-1.5 text-sm">Service</Text>
              <View className="flex-row flex-wrap gap-1.5">
                {PARTNERS.map((partner) => (
                  <TouchableOpacity
                    key={`filter_${partner}`}
                    onPress={() => setSearchPartner(partner)}
                    className={`px-2 py-1.5 rounded-lg border ${
                      searchPartner === partner
                        ? "bg-blue-900/30 border-blue-500"
                        : "bg-[#303030] border-gray-600"
                    }`}
                  >
                    <Text
                      className={`text-sm ${
                        searchPartner === partner
                          ? "text-blue-400"
                          : "text-gray-300"
                      }`}
                    >
                      {partner}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>

          <View className="mt-1.5">
            <Text className="text-gray-300 mb-2 text-sm">
              Results ({filteredForSearch.length})
            </Text>
            <View className="gap-y-2">
              {filteredForSearch.map((order) => (
                <View
                  key={order.id}
                  className="bg-[#303030] border border-gray-600 rounded-xl p-3"
                >
                  <View className="flex-row justify-between items-start mb-2">
                    <View>
                      <Text className="text-white text-sm font-semibold">
                        {order.id}
                      </Text>
                      <Text className="text-gray-300 text-xs">
                        {order.customerName} • {order.deliveryPartner}
                      </Text>
                      <Text className="text-gray-400 text-[10px] mt-0.5">
                        Status: {order.status}
                      </Text>
                    </View>
                    <Text className="text-white font-semibold text-sm">
                      ${order.total.toFixed(2)}
                    </Text>
                  </View>
                  <View className="flex-row flex-wrap gap-1.5">
                    <TouchableOpacity
                      onPress={() =>
                        updateOrderStatus(order.id, "Confirmed/In-Process")
                      }
                      className="px-2 py-1.5 rounded-lg bg-green-600/20 border border-green-500/40"
                    >
                      <Text className="text-green-400 text-xs">Accept</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => rejectOrder(order.id)}
                      className="px-2 py-1.5 rounded-lg bg-red-600/20 border border-red-500/40"
                    >
                      <Text className="text-red-400 text-xs">Reject</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() =>
                        updateOrderStatus(order.id, "Ready to Dispatch")
                      }
                      className="px-2 py-1.5 rounded-lg bg-purple-600/20 border border-purple-500/40"
                    >
                      <Text className="text-purple-300 text-xs">Ready</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => updateOrderStatus(order.id, "Dispatched")}
                      className="px-2 py-1.5 rounded-lg bg-blue-600/20 border border-blue-500/40"
                    >
                      <Text className="text-blue-300 text-xs">Dispatched</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => archiveOrder(order.id)}
                      className="px-2 py-1.5 rounded-lg bg-gray-600/20 border border-gray-500/40"
                    >
                      <Text className="text-gray-300 text-xs">Archive</Text>
                    </TouchableOpacity>
                    <Link
                      href={
                        `/online-orders/${order.id.replace("#", "")}` as Href
                      }
                      asChild
                    >
                      <TouchableOpacity
                        onPress={() => {
                          closeSearchSheet();
                        }}
                        className="px-2 py-1.5 rounded-lg bg-[#1f2937] border border-gray-600"
                      >
                        <Text className="text-white text-xs">Details</Text>
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
