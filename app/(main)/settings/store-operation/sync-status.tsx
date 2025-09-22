import DatePicker from "@/components/date-picker";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import OfflineOrderRow from "@/components/settings/sync-status/OfflineOrderRow";
import { MOCK_OFFLINE_ORDERS } from "@/lib/mockData";
import {
  ChevronLeft,
  ChevronRight,
  Receipt,
  RefreshCcw,
  Search,
  Store,
} from "lucide-react-native";
import React, { useState } from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const TABLE_HEADERS = [
  "# Serial No",
  "Order Date",
  "Order ID",
  "Server/Cashier",
  "Total",
  "",
];

const SyncStatusScreen = () => {
  const [selectedDate, setSelectedDate] = useState(new Date("2021-09-19"));

  const storeOperationSubsections = [
    {
      id: "end-of-day",
      title: "End of Day",
      subtitle: "Daily Operations",
      route: "/settings/store-operation/end-of-day",
      icon: <Store color="#3b82f6" size={24} />,
      isLocked: true,
    },
    {
      id: "receipt-rules",
      title: "Receipt Rules",
      subtitle: "Receipt Configuration",
      route: "/settings/store-operation/receipt-rules",
      icon: <Receipt color="#3b82f6" size={24} />,
      isLocked: true,
    },
    {
      id: "sync-status",
      title: "Sync Status",
      subtitle: "Data Synchronization",
      route: "/settings/store-operation/sync-status",
      icon: <RefreshCcw color="#3b82f6" size={24} />,
      isLocked: true,
    },
  ];

  return (
    <View className="flex-1 bg-[#212121] p-6">
      <View className="flex-row gap-6 h-full w-full">
        {/* Sidebar */}
        <SettingsSidebar
          title="Store Operation"
          subsections={storeOperationSubsections}
          currentRoute="/settings/store-operation/sync-status"
        />

        {/* Main Content */}
        <View className="flex-1 bg-[#303030] rounded-2xl border border-gray-600 p-6">
          {/* Main Content */}
          <View className="flex-1 gap-y-6">
            {/* Last Updated Card */}
            <View className="bg-[#212121] p-6 rounded-2xl border border-gray-600 flex-row justify-between items-center">
              <Text className="text-3xl font-bold text-white">
                Last Updated
              </Text>
              <Text className="text-2xl font-semibold text-gray-300">
                2 minutes ago
              </Text>
            </View>

            {/* Offline Mode Card */}
            <View className="flex-1 bg-[#212121] p-6 rounded-2xl border border-gray-600">
              <Text className="text-3xl font-bold text-white">
                Offline Mode
              </Text>

              {/* Toolbar */}
              <View className="flex-row items-center justify-between my-4">
                <View className="flex-row items-center bg-[#303030] rounded-lg px-4 w-[400px] border border-gray-600">
                  <Search color="#9CA3AF" size={24} />
                  <TextInput
                    placeholder="Search Order"
                    placeholderTextColor="#9CA3AF"
                    className="ml-3 text-2xl flex-1 text-white h-20"
                  />
                </View>
                <DatePicker
                  date={selectedDate}
                  onDateChange={setSelectedDate}
                />
              </View>

              {/* Table */}
              <View className="flex-1 rounded-xl">
                {/* Table Header */}
                <View className="flex-row p-6 bg-[#303030] rounded-t-xl border-b border-gray-600">
                  {TABLE_HEADERS.map((header) => (
                    <Text
                      key={header}
                      className="w-1/6 font-bold text-xl text-gray-300"
                    >
                      {header}
                    </Text>
                  ))}
                </View>
                {/* Table Body */}
                <FlatList
                  data={MOCK_OFFLINE_ORDERS}
                  keyExtractor={(item, index) => `${item.orderId}-${index}`}
                  renderItem={({ item }) => <OfflineOrderRow order={item} />}
                />
              </View>

              {/* Footer for the card */}
              <View className="flex-row justify-between items-center mt-4">
                <TouchableOpacity className="py-4 px-6 bg-blue-500 rounded-lg">
                  <Text className="text-2xl font-bold text-white">
                    Sync Now
                  </Text>
                </TouchableOpacity>
                <View className="flex-row items-center gap-2">
                  <TouchableOpacity className="p-3 border border-gray-500 rounded-full">
                    <ChevronLeft color="#9CA3AF" size={24} />
                  </TouchableOpacity>
                  <TouchableOpacity className="p-3 border border-gray-500 rounded-full bg-blue-500">
                    <ChevronRight color="white" size={24} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

export default SyncStatusScreen;
