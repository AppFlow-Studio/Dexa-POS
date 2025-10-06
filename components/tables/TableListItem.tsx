import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

// Update the StatusIndicator to use the correct color scheme
const StatusIndicator = ({
  status,
  isOvertime,
}: {
  status: TableType["status"];
  isOvertime: boolean;
}) => {
  const color = isOvertime
    ? "bg-yellow-500"
    : status === "Available"
    ? "bg-green-500"
    : status === "In Use"
    ? "bg-blue-500"
    : "bg-red-500";

  return <View className={`w-3 h-3 rounded-full ${color}`} />;
};

// Helper function to format duration
const formatDuration = (milliseconds: number): string => {
  if (isNaN(milliseconds) || milliseconds < 0) return "0m";
  const totalSeconds = Math.floor(milliseconds / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
};

const TableListItem: React.FC<{
  table: TableType;
  handleTablePress: (table: TableType) => void;
}> = ({ table, handleTablePress }) => {
  const [isOvertime, setIsOvertime] = useState(false);
  const [duration, setDuration] = useState("");

  // Get the full list of orders from the store
  const { orders } = useOrderStore();
  const { layouts } = useFloorPlanStore();
  const { defaultSittingTimeMinutes } = useSettingsStore();

  const displayName = useMemo(() => {
    const allTables = layouts.flatMap((l) => l.tables);

    // Case 1: It's a primary table
    if (table.isPrimary && table.mergedWith && table.mergedWith.length > 0) {
      const mergedNames = table.mergedWith
        .map((id) => allTables.find((t) => t.id === id)?.name)
        .filter(Boolean)
        .join(", ");
      return `${table.name} (Merged with ${mergedNames})`;
    }

    // Case 2: It's a non-primary merged table
    if (table.mergedWith && !table.isPrimary) {
      const primaryTable = allTables.find(
        (t) => t.isPrimary && t.mergedWith?.includes(table.id)
      );
      if (primaryTable) {
        return `${table.name} (Merged to ${primaryTable.name})`;
      }
    }

    // Case 3: It's a standalone table
    return table.name;
  }, [table, layouts]);

  // Find the single order that is associated with THIS table.
  // This is the core logic that connects the table to its live data.
  const activeOrderForThisTable = orders.find(
    (o) => o.service_location_id === table.id && o.order_status !== "Voided" // Show all orders except voided ones
  );

  useEffect(() => {
    if (table.status !== "In Use" || !activeOrderForThisTable?.opened_at) {
      setIsOvertime(false);
      setDuration("");
      return;
    }

    const updateTimer = () => {
      if (!activeOrderForThisTable?.opened_at) return;
      const startTime = new Date(activeOrderForThisTable.opened_at);
      const now = new Date();
      const diffMs = now.getTime() - startTime.getTime();
      const diffMins = Math.floor(diffMs / 60000);

      setIsOvertime(diffMins > defaultSittingTimeMinutes);
      setDuration(formatDuration(diffMs));
    };

    updateTimer(); // Run immediately on load
    const timer = setInterval(updateTimer, 1000); // And update every second

    return () => clearInterval(timer);
  }, [table.status, activeOrderForThisTable, defaultSittingTimeMinutes]);

  // Calculate the total for this specific order's cart
  const orderTotal =
    activeOrderForThisTable?.items.reduce(
      (acc, item) => acc + item.price * item.quantity,
      0
    ) || 0;

  // The table's status from the floor plan store is the source of truth for its state
  const status = table.status;
  return (
    <TouchableOpacity
      onPress={() => handleTablePress(table)}
      className="p-4 border-b border-gray-700"
    >
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <StatusIndicator status={status} isOvertime={isOvertime} />
          <Text className="text-xl font-semibold text-white" numberOfLines={1}>
            {displayName}
          </Text>
        </View>
        {/* Show duration on the right side if the table is in use */}
        {status === "In Use" && duration && (
          <Text className="text-lg font-medium text-gray-300">{duration}</Text>
        )}
      </View>

      {/* Show guest count and total below the name */}
      {status === "In Use" && activeOrderForThisTable && (
        <View className="mt-2 pl-6">
          <Text className="text-base text-gray-400">
            {activeOrderForThisTable.guest_count || 1} Guests
          </Text>
          <Text className="text-lg font-bold text-white mt-1">
            ${orderTotal.toFixed(2)}
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

export default TableListItem;
