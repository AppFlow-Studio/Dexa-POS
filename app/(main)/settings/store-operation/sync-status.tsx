import Header from "@/components/Header";
import OfflineOrderRow from "@/components/settings/sync-status/OfflineOrderRow";
import { MOCK_OFFLINE_ORDERS } from "@/lib/mockData";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Search,
} from "lucide-react-native";
import React from "react";
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
  // State for filters would go here

  return (
    <View className="flex-1 bg-gray-50 p-6">
      <Header />
      <Text className="text-3xl font-bold text-gray-800 my-4">
        Sync and Offline Mode Status
      </Text>

      {/* Main Content */}
      <View className="flex-1 space-y-6">
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
            <View className="flex-row items-center bg-gray-100 rounded-lg p-3 w-[300px]">
              <Search color="#6b7280" size={20} />
              <TextInput
                placeholder="Search Order"
                className="ml-2 text-base flex-1"
              />
            </View>
            <TouchableOpacity className="flex-row items-center p-3 bg-gray-100 rounded-lg">
              <Text className="font-semibold text-gray-600 mr-2">
                Date: 02/03/25
              </Text>
              <Calendar color="#6b7280" size={20} />
            </TouchableOpacity>
          </View>

          {/* Table */}
          <View className="flex-1 border border-gray-200 rounded-xl">
            {/* Table Header */}
            <View className="flex-row p-4 bg-gray-50 rounded-t-xl border-b border-gray-200">
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
            <View className="flex-row items-center space-x-2">
              <TouchableOpacity className="p-2 border border-gray-300 rounded-md">
                <ChevronLeft color="#4b5563" size={20} />
              </TouchableOpacity>
              <TouchableOpacity className="p-2 border border-gray-300 rounded-md bg-primary-400">
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
