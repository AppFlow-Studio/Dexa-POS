import { useOrderStore } from "@/stores/useOrderStore";
import { ChevronDown, Minus, Plus } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const FormInput = ({ label, value, onChangeText }: any) => (
  <View className="flex-1">
    <Text className="text-base font-semibold text-white mb-2">{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      className="py-3 px-4 bg-[#303030] flex content-center rounded-xl text-lg text-white border border-gray-200"
    />
  </View>
);

const OrderInfoHeader = () => {
  const [isExpanded, setIsExpanded] = useState(false);

  const { activeOrderId, orders, updateActiveOrderDetails } = useOrderStore();
  const activeOrder = orders.find((o) => o.id === activeOrderId);

  // We still use local state for fields NOT stored in the order (server, guests)
  const [serverName, setServerName] = useState("James Cameron");
  const [numberOfGuests, setNumberOfGuests] = useState(4);

  const handleCustomerNameChange = (name: string) => {
    if (activeOrder) {
      updateActiveOrderDetails({ customer_name: name });
    }
  };

  if (!activeOrder) return null;

  if (!isExpanded) {
    // --- Collapsed View ---
    return (
      <TouchableOpacity
        onPress={() => setIsExpanded(true)}
        className="flex-row items-center p-4 bg-[#303030] rounded-lg border border-gray-600"
      >
        <Text className="font-semibold text-white">
          Server: <Text className="font-normal">{serverName}</Text>
        </Text>
        <Text className="mx-4 text-gray-300">|</Text>
        <Text className="font-semibold text-white">
          Customer:{" "}
          <Text className="font-normal">
            {activeOrder.customer_name || "Walk-In"}
          </Text>
        </Text>
        <Text className="mx-4 text-gray-300">|</Text>
        <Text className="font-semibold text-white">
          Order: <Text className="font-normal">{activeOrder.id}</Text>
        </Text>
        <Text className="mx-4 text-gray-300">|</Text>
        <Text className="font-semibold text-white">
          Guests: <Text className="font-normal">{numberOfGuests}</Text>
        </Text>
        <View className="ml-auto">
          <ChevronDown color="white" size={24} />
        </View>
      </TouchableOpacity>
    );
  }

  // --- Expanded View ---
  return (
    <View>
      <View className="space-y-4">
        <View className="flex-row gap-4">
          <FormInput
            label="Server/Employee Name"
            value={serverName}
            onChangeText={setServerName}
            className="text-white "
          />
          <FormInput
            label="Customer Name"
            value={activeOrder.customer_name || ""}
            onChangeText={handleCustomerNameChange}
            className="text-white "
          />
        </View>
        <View className="flex-row gap-4">
          <View className="flex-1">
            <Text className="text-base font-semibold text-white mb-2">Order ID</Text>
            <View className="py-3 px-4 bg-gray-600 rounded-xl border border-gray-500">
              <Text className="text-lg text-gray-300">{activeOrder.id}</Text>
            </View>
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-white mb-2">
              Guests
            </Text>
            <View className="flex-row items-center justify-between p-2 pl-4 bg-[#303030] rounded-xl border border-gray-600">
              <Text className="text-sm text-white">Number of people</Text>
              <View className="flex-row items-center gap-2 bg-[#212121] p-1 rounded-full border border-gray-600">
                <TouchableOpacity
                  onPress={() => setNumberOfGuests((p) => Math.max(1, p - 1))}
                  className="p-1.5"
                >
                  <Minus color="#9CA3AF" size={16} />
                </TouchableOpacity>
                <Text className="text-lg font-bold text-white w-6 text-center">
                  {numberOfGuests}
                </Text>
                <TouchableOpacity
                  onPress={() => setNumberOfGuests((p) => p + 1)}
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
        className="items-end mt-4"
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
