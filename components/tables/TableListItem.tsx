import { TableType } from "@/lib/types";
import React from "react";
import { Text, View } from "react-native";

const StatusIndicator = ({ status }: { status: TableType["status"] }) => {
  const color = status === "Available" ? "bg-green-500" : "bg-red-500";
  return <View className={`w-2 h-2 rounded-full ${color}`} />;
};

const TableListItem: React.FC<{ table: TableType }> = ({ table }) => {
  return (
    <View className="p-4 border-b border-gray-100">
      <View className="flex-row items-center justify-between">
        <View className="flex-row items-center gap-3">
          <StatusIndicator status={table.status} />
          <Text className="text-base font-semibold text-gray-700">
            {table.name}
          </Text>
        </View>
        {table.status === "In Use" && table.order && (
          <Text className="text-base font-bold text-gray-800">
            ${table.order.total.toFixed(2)}
          </Text>
        )}
      </View>
      {table.status === "In Use" && table.order && (
        <Text className="text-sm text-gray-500 ml-5 mt-1">
          Order {table.order.id} • {table.order.customerName}
        </Text>
      )}
    </View>
  );
};

export default TableListItem;
