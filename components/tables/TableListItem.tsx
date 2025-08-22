import { TableType } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import React from "react";
import { Text, View } from "react-native";

// Update the StatusIndicator to use the correct color scheme
const StatusIndicator = ({ status }: { status: TableType["status"] }) => {
  const color =
    status === "Available"
      ? "bg-green-500"
      : status === "In Use"
        ? "bg-blue-500"
        : "bg-red-500"; // Needs Cleaning
  return <View className={`w-2.5 h-2.5 rounded-full ${color}`} />;
};

const TableListItem: React.FC<{ table: TableType }> = ({ table }) => {
  // Get the full list of orders from the store
  const { orders } = useOrderStore();

  // Find the single "Open" order that is associated with THIS table.
  // This is the core logic that connects the table to its live data.
  const activeOrderForThisTable = orders.find(
    (o) => o.service_location_id === table.id && o.order_status === "Open"
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
    <View className="p-4 border-b border-gray-100">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <StatusIndicator status={status} />
          <Text className="text-base font-semibold text-gray-700">
            {table.name}
          </Text>
        </View>
        {/* Display the total only if an active order exists for this table */}
        {status === "In Use" && activeOrderForThisTable && (
          <Text className="text-base font-bold text-gray-800">
            ${orderTotal.toFixed(2)}
          </Text>
        )}
      </View>
      {/* Display the order details from the active order */}
      {status === "In Use" && activeOrderForThisTable && (
        <Text className="text-sm text-gray-500 ml-6 mt-1">
          Order {activeOrderForThisTable.id} •{" "}
          {activeOrderForThisTable.customer_name || ""}
        </Text>
      )}
    </View>
  );
};

export default TableListItem;
