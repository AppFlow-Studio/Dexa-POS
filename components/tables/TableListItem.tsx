import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

// Update the StatusIndicator to use the correct color scheme
const StatusIndicator = ({ status }: { status: TableType["status"] }) => {
  const color =
    status === "Available"
      ? "bg-green-500"
      : status === "In Use"
        ? "bg-blue-500"
        : "bg-red-500"; // Needs Cleaning
  return <View className={`w-3 h-3 rounded-full ${color}`} />;
};

const TableListItem: React.FC<{
  table: TableType;
  handleTablePress: (table: TableType) => void;
}> = ({ table, handleTablePress }) => {
  // Get the full list of orders from the store
  const { orders } = useOrderStore();
  const { layouts } = useFloorPlanStore();

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
        <View className="flex-row items-center gap-2">
          <StatusIndicator status={status} />
          <Text className="text-xl font-semibold text-white" numberOfLines={2}>
            {displayName}
          </Text>
        </View>
      </View>
      {/* Display the order details from the active order */}
      <View className="flex-col items-start my-1">
        {/* Display the total only if an active order exists for this table */}
        {status === "In Use" && activeOrderForThisTable && (
          <Text className="text-xl font-bold text-white">
            ${orderTotal.toFixed(2)}
          </Text>
        )}
        {status === "In Use" && activeOrderForThisTable && (
          <Text className="text-sm text-white mt-1">
            Order {activeOrderForThisTable.id.slice(-5)}
            {`\n`}
            <Text className="text-lg text-white">
              {activeOrderForThisTable.customer_name || ""}
            </Text>
            {activeOrderForThisTable?.check_status === "Closed" && (
              <Text className="text-red-600 font-semibold"> (Closed)</Text>
            )}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

export default TableListItem;
