import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { ChevronDown, Minus, Plus } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const FormInput = ({ label, value, onChangeText, ...props }: any) => (
  <View className="flex-1">
    <Text className="text-base font-semibold text-white mb-2">{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      className="py-3 px-4 bg-[#303030] rounded-xl text-lg text-white border border-gray-600 h-20"
      {...props}
    />
  </View>
);

const OrderInfoHeader = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { activeOrderId, orders, updateActiveOrderDetails } = useOrderStore();
  const { layouts } = useFloorPlanStore();
  const activeOrder = orders.find((o) => o.id === activeOrderId);

  // This local state is still needed for the expanded view's interactive counter
  const [numberOfGuests, setNumberOfGuests] = useState(1);

  // Sync local state with the store's state whenever the active order changes
  useEffect(() => {
    if (activeOrder?.guest_count) {
      setNumberOfGuests(activeOrder.guest_count);
    }
  }, [activeOrder]);

  const table = useMemo(() => {
    if (!activeOrder?.service_location_id) return null;
    for (const layout of layouts) {
      const foundTable = layout.tables.find(
        (t) => t.id === activeOrder.service_location_id
      );
      if (foundTable) return foundTable;
    }
    return null;
  }, [layouts, activeOrder?.service_location_id]);

  const [serverName, setServerName] = useState("James Cameron");

  const handleCustomerNameChange = (name: string) => {
    if (activeOrder) {
      updateActiveOrderDetails({ customer_name: name });
    }
  };

  const handleGuestCountChange = (newCount: number) => {
    const count = Math.max(1, newCount);
    setNumberOfGuests(count);
    if (activeOrder) {
      updateActiveOrderDetails({ guest_count: count });
    }
  };

  const getTableDisplayName = () => {
    if (!table) return "N/A";
    if (table.isPrimary && table.mergedWith && table.mergedWith.length > 0) {
      const allTables = layouts.flatMap((l) => l.tables);
      const mergedNames = table.mergedWith
        .map((id) => allTables.find((t) => t.id === id)?.name || id)
        .join(" + ");
      return `${table.name} + ${mergedNames}`;
    }
    return table.name;
  };

  if (!activeOrder) return null;

  if (!isExpanded) {
    return (
      <TouchableOpacity
        onPress={() => setIsExpanded(true)}
        className="flex-row items-center p-4 bg-[#303030] rounded-lg border border-gray-600"
      >
        <Text className="font-semibold text-white">
          Table: <Text className="font-normal">{getTableDisplayName()}</Text>
        </Text>
        <Text className="mx-4 text-gray-400">|</Text>
        <Text className="font-semibold text-white">
          Guests:{" "}
          {/* FIX: Read directly from the store, which now has a reliable default */}
          <Text className="font-normal">{activeOrder.guest_count}</Text>
        </Text>
        <Text className="mx-4 text-gray-400">|</Text>
        <Text className="font-semibold text-white">
          Customer:{" "}
          <Text className="font-normal">
            {activeOrder.customer_name || "Walk-In"}
          </Text>
        </Text>
        <View className="ml-auto">
          <ChevronDown color="white" size={24} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <View className="p-4 bg-[#303030] rounded-lg border border-gray-600">
      <View className="space-y-4">
        <View className="flex-row gap-4">
          <FormInput
            label="Server/Employee Name"
            value={serverName}
            onChangeText={setServerName}
          />
          <FormInput
            label="Customer Name"
            value={activeOrder.customer_name || ""}
            onChangeText={handleCustomerNameChange}
            placeholder="Walk-In"
            placeholderTextColor="#9CA3AF"
          />
        </View>
        <View className="flex-row gap-4">
          <View className="flex-1">
            <Text className="text-base font-semibold text-white mb-2">
              Table Info
            </Text>
            <View className="py-3 px-4 bg-gray-600 rounded-xl border border-gray-500">
              <Text className="text-lg text-gray-300">
                {getTableDisplayName()}
              </Text>
            </View>
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-white mb-2">
              Guests
            </Text>
            <View className="flex-row items-center justify-between p-2 pl-4 bg-[#212121] rounded-xl border border-gray-600">
              <Text className="text-sm text-white">Number of people</Text>
              <View className="flex-row items-center gap-2 bg-[#303030] p-1 rounded-full border border-gray-700">
                <TouchableOpacity
                  onPress={() => handleGuestCountChange(numberOfGuests - 1)}
                  className="p-1.5"
                >
                  <Minus color="#9CA3AF" size={16} />
                </TouchableOpacity>
                <Text className="text-lg font-bold text-white w-6 text-center">
                  {numberOfGuests}
                </Text>
                <TouchableOpacity
                  onPress={() => handleGuestCountChange(numberOfGuests + 1)}
                  className="p-1.5 bg-blue-500 rounded-full"
                >
                  <Plus color="#FFFFFF" size={16} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </View>
      <TouchableOpacity
        onPress={() => setIsExpanded(false)}
        className="items-center mt-4"
      >
        <ChevronDown
          style={{ transform: [{ rotate: "180deg" }] }}
          color="white"
          size={24}
        />
      </TouchableOpacity>
    </View>
  );
};

export default OrderInfoHeader;
