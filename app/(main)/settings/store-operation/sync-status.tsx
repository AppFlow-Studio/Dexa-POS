import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
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
  Users,
  Utensils,
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
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(),
    to: new Date(),
  });

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
      id: "dining-options",
      title: "Dining Options",
      subtitle: "Table & Seating Rules",
      route: "/settings/store-operation/dining-options",
      icon: <Utensils color="#3b82f6" size={24} />,
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
    {
      id: "employees",
      title: "Employee Settings",
      subtitle: "Break and login rules",
      route: "/settings/store-operation/employees",
      icon: <Users color="#3b82f6" size={24} />,
    },
  ];

  return (
    <View className="flex-1 bg-[#212121] p-4">
      <View className="flex-row gap-4 h-full w-full">
        {/* Sidebar */}
        <SettingsSidebar
          title="Store Operation"
          subsections={storeOperationSubsections}
          currentRoute="/settings/store-operation/sync-status"
        />

        {/* Main Content */}
        <View className="flex-1 bg-[#303030] rounded-2xl border border-gray-600 p-4">
          {/* Main Content */}
          <View className="flex-1 gap-y-4">
            {/* Last Updated Card */}
            <View className="bg-[#212121] p-4 rounded-2xl border border-gray-600 flex-row justify-between items-center">
              <Text className="text-2xl font-bold text-white">
                Last Updated
              </Text>
              <Text className="text-xl font-semibold text-gray-300">
                2 minutes ago
              </Text>
            </View>

            {/* Offline Mode Card */}
            <View className="flex-1 bg-[#212121] p-4 rounded-2xl border border-gray-600">
              <Text className="text-2xl font-bold text-white">
                Offline Mode
              </Text>

              {/* Toolbar */}
              <View className="flex-row items-center justify-between my-3">
                <View className="flex-row items-center bg-[#303030] rounded-lg px-3 w-[400px] border border-gray-600">
                  <Search color="#9CA3AF" size={20} />
                  <TextInput
                    placeholder="Search Order"
                    className="ml-2 text-lg flex-1 text-white h-12"
                    placeholderTextColor="#9CA3AF"
                  />
                </View>
                <DateRangePicker
                  range={dateRange}
                  onRangeChange={setDateRange}
                />
              </View>

              {/* Table */}
              <View className="flex-1 rounded-xl">
                {/* Table Header */}
                <View className="flex-row p-4 bg-[#303030] rounded-t-xl border-b border-gray-600">
                  {TABLE_HEADERS.map((header) => (
                    <Text
                      key={header}
                      className="w-1/6 font-bold text-lg text-gray-300"
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
              <View className="flex-row justify-between items-center mt-3">
                <TouchableOpacity className="py-3 px-4 bg-blue-500 rounded-lg">
                  <Text className="text-xl font-bold text-white">Sync Now</Text>
                </TouchableOpacity>
                <View className="flex-row items-center gap-1.5">
                  <TouchableOpacity className="p-2 border border-gray-500 rounded-full">
                    <ChevronLeft color="#9CA3AF" size={20} />
                  </TouchableOpacity>
                  <TouchableOpacity className="p-2 border border-gray-500 rounded-full bg-blue-500">
                    <ChevronRight color="white" size={20} />
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
