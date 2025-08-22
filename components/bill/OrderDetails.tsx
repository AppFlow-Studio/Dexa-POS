import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { FileText, Pencil } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Define a consistent type for our dropdown options
type SelectOption = { label: string; value: string };

// Static options for the Order Type dropdown
const ORDER_TYPE_OPTIONS: SelectOption[] = [
  { label: "Dine In", value: "Dine In" },
  { label: "Take Away", value: "Take Away" },
];

const OrderDetails: React.FC = () => {
  // Add state to manage the selected values for each dropdown
  const [selectedTable, setSelectedTable] = useState<
    SelectOption | undefined
  >();
  const [selectedOrderType, setSelectedOrderType] = useState<
    SelectOption | undefined
  >();

  // Get the list of all tables from our global store
  const tables = useFloorPlanStore((state) => state.tables);

  // Filter and map the tables to get only the "Available" ones
  // useMemo ensures this calculation only runs when the tables array changes
  const availableTableOptions = useMemo(() => {
    return tables
      .filter((table) => table.status === "Available")
      .map((table) => ({ label: table.name, value: table.id }));
  }, [tables]);

  // Get safe area insets for proper dropdown positioning
  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  return (
    <View className="pb-4 px-4 bg-white">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4">
        <TouchableOpacity className="p-2.5 bg-background-300 rounded-full">
          <FileText color="#5D5D73" size={20} />
        </TouchableOpacity>
        <View className="items-center">
          <Text className="text-xl font-bold text-accent-500">Jake Carter</Text>
          <Text className="text-sm text-accent-500">Order Number #45654</Text>
        </View>
        <TouchableOpacity className="p-2.5 bg-background-300 rounded-full">
          <Pencil color="#5D5D73" size={20} />
        </TouchableOpacity>
      </View>

      {/* Selectors */}
      <View className="flex-row gap-2">
        {/* --- Select Table Dropdown --- */}
        <View className="flex-1">
          <Select
            value={selectedTable}
            onValueChange={(option) => option && setSelectedTable(option)}
          >
            <SelectTrigger className="w-full flex-row justify-between items-center p-3 border border-background-400 rounded-lg">
              <SelectValue
                placeholder="Select Table"
                className="font-semibold text-accent-400"
              />
            </SelectTrigger>
            <SelectContent insets={contentInsets} className="max-h-64">
              <SelectGroup>
                {availableTableOptions.map((tableOption) => (
                  <SelectItem
                    key={tableOption.value}
                    label={tableOption.label}
                    value={tableOption.value}
                  >
                    {tableOption.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </View>

        {/* --- Order Type Dropdown --- */}
        <View className="flex-1">
          <Select
            value={selectedOrderType}
            onValueChange={(option) => option && setSelectedOrderType(option)}
          >
            <SelectTrigger className="w-full flex-row justify-between items-center p-3 border border-background-400 rounded-lg">
              <SelectValue
                placeholder="Order Type"
                className="font-semibold text-accent-400"
              />
            </SelectTrigger>
            <SelectContent insets={contentInsets}>
              <SelectGroup>
                {ORDER_TYPE_OPTIONS.map((typeOption) => (
                  <SelectItem
                    key={typeOption.value}
                    label={typeOption.label}
                    value={typeOption.value}
                  >
                    {typeOption.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </View>
      </View>

      {/* Open Item Button */}
      <TouchableOpacity className="mt-2 w-full items-center py-3 border border-background-400 rounded-lg">
        <Text className="font-bold text-accent-400">Open Item</Text>
      </TouchableOpacity>
    </View>
  );
};

export default OrderDetails;
