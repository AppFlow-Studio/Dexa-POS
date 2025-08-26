import { useOrderStore } from "@/stores/useOrderStore";
import { ChevronDown, Minus, Plus } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const FormInput = ({ label, value, onChangeText }: any) => (
  <View className="flex-1">
    <Text className="text-base font-semibold text-gray-600 mb-2">{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      className="py-3 px-4 bg-gray-50 rounded-xl text-lg border border-gray-200"
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
        className="flex-row items-center p-4 bg-gray-50 rounded-lg border border-gray-200"
      >
        <Text className="font-semibold text-gray-700">
          Server: <Text className="font-normal">{serverName}</Text>
        </Text>
        <Text className="mx-4 text-gray-300">|</Text>
        <Text className="font-semibold text-gray-700">
          Customer:{" "}
          <Text className="font-normal">
            {activeOrder.customer_name || "Walk-In"}
          </Text>
        </Text>
        <Text className="mx-4 text-gray-300">|</Text>
        <Text className="font-semibold text-gray-700">
          Order: <Text className="font-normal">{activeOrder.id}</Text>
        </Text>
        <Text className="mx-4 text-gray-300">|</Text>
        <Text className="font-semibold text-gray-700">
          Guests: <Text className="font-normal">{numberOfGuests}</Text>
        </Text>
        <View className="ml-auto">
          <ChevronDown color="#6b7280" size={24} />
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
          />
          <FormInput
            label="Customer Name"
            value={activeOrder.customer_name || ""}
            onChangeText={handleCustomerNameChange}
          />
        </View>
        <View className="flex-row gap-4">
          <FormInput
            label="Order"
            value={activeOrder.id}
            onChangeText={() => {}}
          />
          <View className="flex-1">
            <Text className="text-base font-semibold text-gray-600 mb-2">
              Guests
            </Text>
            <View className="flex-row items-center justify-between p-2 pl-4 bg-gray-50 rounded-xl border border-gray-200">
              <Text className="text-sm text-gray-500">Number of people</Text>
              <View className="flex-row items-center gap-2 bg-white p-1 rounded-full border border-gray-200">
                <TouchableOpacity
                  onPress={() => setNumberOfGuests((p) => Math.max(1, p - 1))}
                  className="p-1.5"
                >
                  <Minus color="#4b5563" size={16} />
                </TouchableOpacity>
                <Text className="text-lg font-bold text-gray-800 w-6 text-center">
                  {numberOfGuests}
                </Text>
                <TouchableOpacity
                  onPress={() => setNumberOfGuests((p) => p + 1)}
                  className="p-1.5 bg-primary-400 rounded-full"
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
          color="#6b7280"
          size={24}
        />
      </TouchableOpacity>
    </View>
  );
};

export default OrderInfoHeader;
