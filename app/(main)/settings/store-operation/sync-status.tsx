import DatePicker from "@/components/date-picker";
import OfflineOrderRow from "@/components/settings/sync-status/OfflineOrderRow";
import { MOCK_OFFLINE_ORDERS } from "@/lib/mockData";
import { ChevronLeft, ChevronRight, Search } from "lucide-react-native";
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

  return (
    <View className="flex-1 bg-background-300 p-6">
      {/* Main Content */}
      <View className="flex-1 gap-y-6">
        {/* Last Updated Card */}
        <View className="bg-white p-6 rounded-2xl border border-gray-200 flex-row justify-between items-center">
          <Text className="text-xl font-bold text-gray-800">Last Updated</Text>
          <Text className="text-lg font-semibold text-gray-600">
            2 minutes ago
          </Text>
        </View>

        {/* Offline Mode Card */}
        <View className="flex-1 bg-white p-6 rounded-2xl border border-gray-200">
          <Text className="text-xl font-bold text-gray-800">Offline Mode</Text>

          {/* Toolbar */}
          <View className="flex-row items-center justify-between my-4">
            <View className="flex-row items-center bg-gray-100 rounded-lg px-3 w-[300px]">
              <Search color="#6b7280" size={16} />
              <TextInput
                placeholder="Search Order"
                className="ml-2 text-base flex-1"
              />
            </View>
            <DatePicker date={selectedDate} onDateChange={setSelectedDate} />
          </View>

          {/* Table */}
          <View className="flex-1 rounded-xl">
            {/* Table Header */}
            <View className="flex-row p-4 bg-background-100 rounded-t-xl border-b border-background-400">
              {TABLE_HEADERS.map((header) => (
                <Text
                  key={header}
                  className="w-1/6 font-bold text-sm text-gray-500"
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
            <TouchableOpacity className="py-3 px-5 bg-primary-400 rounded-lg">
              <Text className="font-bold text-white">Sync Now</Text>
            </TouchableOpacity>
            <View className="flex-row items-center gap-2">
              <TouchableOpacity className="p-2 border border-gray-300 rounded-full">
                <ChevronLeft color="#4b5563" size={20} />
              </TouchableOpacity>
              <TouchableOpacity className="p-2 border border-gray-300 rounded-full bg-primary-400">
                <ChevronRight color="white" size={20} />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    </View>
  );
};

export default SyncStatusScreen;
