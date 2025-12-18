import React, { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { FloorPlanObject as TableType } from "@/types/db-floor-plan-types";
import { useOrderStore } from "@/stores/useOrderStore";
import { ChevronDown, Minus, Plus } from "lucide-react-native";

const FormInput = ({ label, value, onChangeText, ...props }: any) => (
  <View className="flex-1">
    <Text className="text-sm font-semibold text-white mb-1.5">{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      className="py-2 px-3 bg-[#303030] rounded-xl text-base text-white border border-gray-600 h-16"
      {...props}
    />
  </View>
);

interface OrderInfoHeaderProps {
  duration?: string;
}

const OrderInfoHeader: React.FC<OrderInfoHeaderProps> = ({ duration }) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const { activeOrderId, orders, updateActiveOrderDetails } = useOrderStore();
  const { tables } = useFloorPlanStore();
  const activeOrder = orders.find((o) => o.id === activeOrderId);

  const [numberOfGuests, setNumberOfGuests] = useState(1);

  useEffect(() => {
    if (activeOrder?.guest_count) {
      setNumberOfGuests(activeOrder.guest_count);
    }
  }, [activeOrder]);

  const table = useMemo(() => {
    if (!activeOrder?.service_location_id) return null;
    return tables.find((t) => t.id === activeOrder.service_location_id) || null;
  }, [tables, activeOrder?.service_location_id]);

  const handleCustomerNameChange = (name: string) => {
    if (activeOrder) {
      updateActiveOrderDetails({ customer_name: name });
    }
  };

  const handleServerNameChange = (name: string) => {
    if (activeOrder) {
      updateActiveOrderDetails({ server_name: name });
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
    const session = table.session;

    if (session?.merged_tables && session.merged_tables.length > 0) {
      const mergedNames = tables
        .filter((t) => session.merged_tables?.includes(t.id) && t.id !== table.id)
        .map((t) => t.name)
        .join(", ");
      
      return mergedNames ? `${table.name} (Merged with ${mergedNames})` : table.name;
    }

    return table.name;
  };

  if (!activeOrder) return null;

  if (!isExpanded) {
    return (
      <TouchableOpacity
        onPress={() => setIsExpanded(true)}
        className="flex-row items-center p-3 bg-[#303030] rounded-lg border border-gray-600"
      >
        <Text className="font-semibold text-white text-sm">
          Table:{" "}
          <Text className="font-normal text-sm">{getTableDisplayName()}</Text>
        </Text>
        <Text className="mx-2 text-gray-400">|</Text>
        <Text className="font-semibold text-white text-sm">
          Guests:{" "}
          <Text className="font-normal text-sm">{activeOrder.guest_count}</Text>
        </Text>
        <Text className="mx-2 text-gray-400">|</Text>
        <Text className="font-semibold text-white text-sm">
          Customer:{" "}
          <Text className="font-normal text-sm">
            {activeOrder.customer_name || "Walk-In"}
          </Text>
        </Text>
        {duration && (
          <>
            <Text className="mx-2 text-gray-400">|</Text>
            <Text className="font-semibold text-white text-sm">
              Duration: <Text className="font-normal text-sm">{duration}</Text>
            </Text>
          </>
        )}
        <View className="ml-auto">
          <ChevronDown color="white" size={20} />
        </View>
      </TouchableOpacity>
    );
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="p-3 bg-[#303030] rounded-lg border border-gray-600"
    >
      <View className="gap-y-3">
        <View className="flex-row gap-3">
          <FormInput
            label="Server/Employee Name"
            value={activeOrder.server_name || "Unknown"}
            onChangeText={handleServerNameChange}
          />
          <FormInput
            label="Customer Name"
            value={activeOrder.customer_name || ""}
            onChangeText={handleCustomerNameChange}
            placeholder="Walk-In"
            placeholderTextColor="#9CA3AF"
          />
        </View>
        <View className="flex-row gap-3">
          <View className="flex-1">
            <Text className="text-sm font-semibold text-white mb-1.5">
              Table Info
            </Text>
            <View className="py-2 px-3 bg-gray-600 rounded-xl border border-gray-500 h-16 justify-center">
              <Text className="text-base text-gray-300">
                {getTableDisplayName()}
              </Text>
            </View>
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold text-white mb-1.5">
              Guests
            </Text>
            <View className="flex-row items-center justify-between p-1.5 pl-3 bg-[#212121] rounded-xl border border-gray-600 h-16">
              <Text className="text-sm text-white">Number of people</Text>
              <View className="flex-row items-center gap-2 bg-[#303030] p-1 rounded-full border border-gray-700">
                <TouchableOpacity
                  onPress={() => handleGuestCountChange(numberOfGuests - 1)}
                  className="p-1"
                >
                  <Minus color="#9CA3AF" size={14} />
                </TouchableOpacity>
                <Text className="text-base font-bold text-white w-5 text-center">
                  {numberOfGuests}
                </Text>
                <TouchableOpacity
                  onPress={() => handleGuestCountChange(numberOfGuests + 1)}
                  className="p-1 bg-blue-500 rounded-full"
                >
                  <Plus color="#FFFFFF" size={14} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
          {duration && (
            <View className="flex-1">
              <Text className="text-sm font-semibold text-white mb-1.5">
                Duration
              </Text>
              <View className="py-2 px-3 bg-gray-600 rounded-xl border border-gray-500 h-16 justify-center">
                <Text className="text-base font-bold text-white">
                  {duration}
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
      <TouchableOpacity
        onPress={() => setIsExpanded(false)}
        className="items-center mt-3"
      >
        <ChevronDown
          style={{ transform: [{ rotate: "180deg" }] }}
          color="white"
          size={20}
        />
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
};

export default OrderInfoHeader;
