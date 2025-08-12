import { useTableStore } from "@/stores/useTableStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Info } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const CleanTableScreen = () => {
  const router = useRouter();
  const { tableId } = useLocalSearchParams();

  // Get the specific table's data from the store
  const table = useTableStore((state) =>
    state.tables.find((t) => t.id === tableId)
  );
  const { updateTableStatus } = useTableStore();

  const handleCleanTable = () => {
    if (tableId) {
      updateTableStatus(tableId as string, "Available");
      router.back(); // Go back to the floor plan
    }
  };

  if (!table) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text>Table not found.</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-background-100">
      {/* --- Main Content Area --- */}
      <View className="flex-1 items-center p-6">
        <View className="w-full max-w-4xl">
          {/* Title */}
          <View className="items-center text-center">
            <Text className="text-2xl font-bold text-gray-800">
              Please Clean Table
            </Text>
            <Text className="text-lg text-gray-500 mt-1">
              Cleaning is required to make this table available
            </Text>
          </View>

          {/* Info Banner */}
          <View className="flex-row items-center p-4 bg-background-300 rounded-lg my-6">
            <Info color="#f97316" size={20} />
            <Text className="ml-3 font-semibold text-gray-700">
              Table No. {table.name}, Table Size - Medium, {table.capacity}
            </Text>
          </View>

          {/* Action Buttons */}
          <View className="flex-row gap-4">
            <TouchableOpacity
              onPress={() => router.back()}
              className="flex-1 py-4 border border-gray-300 rounded-lg items-center bg-white"
            >
              <Text className="text-lg font-bold text-gray-700">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCleanTable}
              className="flex-1 py-4 bg-primary-400 rounded-lg items-center"
            >
              <Text className="text-lg font-bold text-white">Clean Table</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

export default CleanTableScreen;
