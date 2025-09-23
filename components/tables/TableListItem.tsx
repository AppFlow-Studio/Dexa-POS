import { TableType } from "@/lib/types";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import React, { useMemo } from "react";
import { Text, View } from "react-native";

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

const TableListItem: React.FC<{ table: TableType }> = ({ table }) => {
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
    <View className="p-6 border-b border-gray-100">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <StatusIndicator status={status} />
          <Text className="text-2xl font-semibold text-white" numberOfLines={2}>
            {displayName}
          </Text>
        </View>
        {/* Display the total only if an active order exists for this table */}
        {status === "In Use" && activeOrderForThisTable && (
          <Text className="text-2xl font-bold text-white">
            ${orderTotal.toFixed(2)}
          </Text>
        )}
      </View>
      {/* Display the order details from the active order */}
      {status === "In Use" && activeOrderForThisTable && (
        <Text className="text-xl text-white ml-8 mt-1">
          Order {activeOrderForThisTable.id.slice(-5)}
          {activeOrderForThisTable.customer_name || ""}
          {activeOrderForThisTable?.check_status === "Closed" && (
            <Text className="text-red-600 font-semibold"> (Closed)</Text>
          )}
        </Text>
      )}
    </View>
  );
};

export default TableListItem;
