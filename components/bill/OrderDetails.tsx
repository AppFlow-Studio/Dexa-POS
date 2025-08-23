import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { FileText, Pencil } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";

// Define a consistent type for our dropdown options
type SelectOption = { label: string; value: string };

// Static options for the Order Type dropdown
const ORDER_TYPE_OPTIONS: SelectOption[] = [
  { label: "Dine In", value: "Dine In" },
  { label: "Take Away", value: "Take Away" },
];

const OrderDetails: React.FC = () => {
  // 2. Get the necessary state and actions from the stores
  const { tables, updateTableStatus } = useFloorPlanStore();
  const {
    activeOrderId,
    orders,
    assignOrderToTable,
    updateActiveOrderDetails,
  } = useOrderStore();

  // Find the full active order object
  const activeOrder = orders.find((o) => o.id === activeOrderId);

  // 3. The state now reflects the data from the global store
  const [selectedTable, setSelectedTable] = useState<SelectOption | undefined>(
    activeOrder?.service_location_id
      ? {
          label:
            tables.find((t) => t.id === activeOrder.service_location_id)
              ?.name || "",
          value: activeOrder.service_location_id,
        }
      : undefined
  );

  const [selectedOrderType, setSelectedOrderType] = useState<
    SelectOption | undefined
  >();

  useEffect(() => {
    if (selectedTable) {
      handleTableSelect(selectedTable);
    }
  }, [selectedTable]);

  const availableTableOptions = useMemo(() => {
    // Show the currently assigned table PLUS all available tables
    return tables
      .filter(
        (t) =>
          t.status === "Available" || t.id === activeOrder?.service_location_id
      )
      .map((t) => ({ label: t.name, value: t.id }));
  }, [tables, activeOrder]);

  // --- 5. THIS IS THE KEY LOGIC ---
  const handleTableSelect = (option: SelectOption | undefined) => {
    if (!option || !activeOrderId) return;

    const newTableId = option.value;
    const oldTableId = activeOrder?.service_location_id;

    // Assign the active order to the new table
    assignOrderToTable(activeOrderId, newTableId);

    // Update the status of the new table
    updateTableStatus(newTableId, "In Use");
    setSelectedTable(undefined);

    // If the order was previously on another table, make that one available again
    if (oldTableId && oldTableId !== newTableId) {
      updateTableStatus(oldTableId, "Available");
    }

    toast.success("Table assigned successfully!", {
      duration: 4000,
      position: ToastPosition.BOTTOM,
    });

    setSelectedOrderType(undefined);
  };

  const handleOrderTypeSelect = (option: SelectOption | undefined) => {
    if (!option || !activeOrderId) return;

    updateActiveOrderDetails({ order_type: option.value as any });
    setSelectedOrderType(option);
  };

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
          <Select value={selectedTable}>
            <SelectTrigger className="w-full flex-row justify-between items-center p-3 border border-background-400 rounded-lg">
              <SelectValue
                placeholder="Select Table"
                className="font-semibold text-accent-400"
              />
            </SelectTrigger>
            <SelectContent insets={contentInsets} className="max-h-64">
              <ScrollView>
                <SelectGroup>
                  {availableTableOptions.map((tableOption) => (
                    <SelectItem
                      key={tableOption.value}
                      label={tableOption.label}
                      value={tableOption.value}
                      onPress={() => handleTableSelect(tableOption)}
                    >
                      {tableOption.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </ScrollView>
            </SelectContent>
          </Select>
        </View>

        {/* --- Order Type Dropdown --- */}
        <View className="flex-1">
          <Select
            value={selectedOrderType}
            onValueChange={handleOrderTypeSelect}
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
