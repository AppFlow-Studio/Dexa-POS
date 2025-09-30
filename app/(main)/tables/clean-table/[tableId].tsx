import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Info } from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const CleanTableScreen = () => {
  const router = useRouter();
  const { tableId } = useLocalSearchParams();
  const { layouts, updateTableStatus } = useFloorPlanStore();

  const { table, allTablesInGroup, displayNames } = useMemo(() => {
    if (!tableId)
      return { table: null, allTablesInGroup: [], displayNames: "N/A" };

    const allTables = layouts.flatMap((l) => l.tables);
    const foundTable = allTables.find((t) => t.id === tableId);

    if (!foundTable) {
      return { table: null, allTablesInGroup: [], displayNames: "N/A" };
    }

    // Determine the primary table and all associated tables
    let primaryTable = foundTable;
    if (!foundTable.isPrimary && foundTable.mergedWith) {
      const primary = allTables.find(
        (t) => t.isPrimary && t.mergedWith?.includes(foundTable.id)
      );
      if (primary) primaryTable = primary;
    }

    const groupIds = [primaryTable.id, ...(primaryTable.mergedWith || [])];
    const groupTables = allTables.filter((t) => groupIds.includes(t.id));

    // Create the display name
    const primaryName = primaryTable.name;
    const secondaryNames = groupTables
      .filter((t) => !t.isPrimary)
      .map((t) => t.name)
      .join(", ");

    const finalDisplayName = secondaryNames
      ? `${primaryName} (Merged with ${secondaryNames})`
      : primaryName;

    return {
      table: foundTable,
      allTablesInGroup: groupTables,
      displayNames: finalDisplayName,
    };
  }, [layouts, tableId]);

  const handleCleanTable = () => {
    if (allTablesInGroup.length > 0) {
      // Update the status for every table in the group
      allTablesInGroup.forEach((t) => {
        updateTableStatus(t.id, "Available");
      });
      router.back(); // Go back to the floor plan
    }
  };

  if (!table) {
    return (
      <View className="flex-1 items-center justify-center bg-[#212121]">
        <Text className="text-2xl text-white">Table not found.</Text>
      </View>
    );
  }

  const totalCapacity = allTablesInGroup.reduce(
    (acc, t) => acc + t.capacity,
    0
  );

  return (
    <View className="flex-1 bg-[#212121]">
      {/* --- Main Content Area --- */}
      <View className="flex-1 items-center p-4">
        <View className="w-full max-w-4xl">
          {/* Title */}
          <View className="items-center text-center">
            <Text className="text-2xl font-bold text-white">
              Please Clean Table(s)
            </Text>
            <Text className="text-xl text-gray-400 mt-1">
              Cleaning is required to make this group available
            </Text>
          </View>

          {/* Info Banner - NOW DISPLAYS MERGED INFO */}
          <View className="flex-row items-center p-4 bg-[#303030] rounded-lg my-4">
            <Info color="#f97316" size={20} />
            <Text className="ml-2 font-semibold text-lg text-white">
              Tables: {displayNames} (Capacity: {totalCapacity})
            </Text>
          </View>

          {/* Action Buttons */}
          <View className="flex-row gap-4">
            <TouchableOpacity
              onPress={() => router.back()}
              className="flex-1 py-4 border border-gray-600 rounded-lg items-center bg-[#303030]"
            >
              <Text className="text-lg font-bold text-white">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleCleanTable}
              className="flex-1 py-4 bg-blue-500 rounded-lg items-center"
            >
              <Text className="text-lg font-bold text-white">Clean Tables</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </View>
  );
};

export default CleanTableScreen;
