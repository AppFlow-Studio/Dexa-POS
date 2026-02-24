import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Info } from "lucide-react-native";
import { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const CleanTableScreen = () => {
  const router = useRouter();
  const { tableId } = useLocalSearchParams();
  const tables = useFloorPlanStore((s) => s.tables);
  const dispatchAction = useTableSessionStore((s) => s.dispatchAction);

  const { table, allTablesInGroup, displayNames, sessionId } = useMemo(() => {
    if (!tableId || typeof tableId !== "string")
      return {
        table: null,
        allTablesInGroup: [],
        displayNames: "N/A",
        sessionId: null,
      };

    const foundTable = tables.find((t) => t.id === tableId);

    if (!foundTable) {
      return {
        table: null,
        allTablesInGroup: [],
        displayNames: "N/A",
        sessionId: null,
      };
    }

    // Determine the session and associated tables
    let primaryTable = foundTable;
    const session = foundTable.session;

    // If we have a session with merged tables, find all of them
    let groupTables = [foundTable];
    if (session?.merged_tables && session.merged_tables.length > 0) {
      groupTables = tables.filter((t) => session.merged_tables?.includes(t.id));
    }

    // Create the display name
    // For merged tables, usually one is the 'anchor' or we list all.
    // The previous logic distinguished 'primary'. Now we stick to the Session logic.
    // We can just list all names.
    const names = groupTables.map((t) => t.name).join(", ");

    // Total capacity
    // const totalCapacity = groupTables.reduce((acc, t) => acc + (t.capacity || 0), 0);

    return {
      table: foundTable,
      allTablesInGroup: groupTables,
      displayNames: names,
      sessionId: session?.id,
    };
  }, [tables, tableId]);

  const handleCleanTable = async () => {
    if (tableId && typeof tableId === "string") {
      try {
        await dispatchAction({
          type: "FINISH_CLEANING",
          tableId: tableId,
        });
        router.replace("/tables");
      } catch (error) {
        console.error("Failed to clean table:", error);
      }
    } else if (table) {
      console.warn("No session found for table to clean");
      router.replace("/tables");
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
    (acc, t) => acc + (t.capacity || 0),
    0,
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
              onPress={() => router.replace("/tables")}
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
