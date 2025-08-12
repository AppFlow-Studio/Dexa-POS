import { useTableStore } from "@/stores/useTableStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const CleanTableScreen = () => {
  const router = useRouter();
  const { tableId } = useLocalSearchParams();
  const { updateTableStatus } = useTableStore();

  const handleCleanTable = () => {
    if (tableId) {
      updateTableStatus(tableId as string, "Available");
      router.back(); // Go back to the floor plan
    }
  };

  return (
    <View className="flex-1 items-center justify-center bg-gray-50 space-y-6">
      <Text className="text-4xl font-bold">
        Table #{tableId} Needs Cleaning
      </Text>
      <TouchableOpacity
        onPress={handleCleanTable}
        className="py-4 px-8 bg-green-500 rounded-lg"
      >
        <Text className="text-2xl font-bold text-white">Mark as Clean</Text>
      </TouchableOpacity>
    </View>
  );
};

export default CleanTableScreen;
