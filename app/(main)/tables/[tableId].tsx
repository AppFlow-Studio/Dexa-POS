import BillSection from "@/components/bill/BillSection";
import MenuSection from "@/components/menu/MenuSection";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useTableStore } from "@/stores/useTableStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, Minus, Plus } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const FormInput = ({
  label,
  value,
  onChangeText,
  placeholder,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
}) => (
  <View className="flex-1">
    <Text className="text-base font-semibold text-gray-600 mb-2">{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      className="py-3 px-4 bg-[#FAFAFA] rounded-xl text-lg border border-background-400"
    />
  </View>
);

const UpdateTableScreen = () => {
  const router = useRouter();
  const { tableId } = useLocalSearchParams();
  const [serverName, setServerName] = useState("James Cameron");
  const [customerName, setCustomerName] = useState("Jake Carter");
  const [orderId, setOrderId] = useState("#021943");
  const [numberOfGuests, setNumberOfGuests] = useState(4);

  const table = useTableStore((state) => state.getTableById(tableId as string));

  useEffect(() => {
    // (See next step for store update)
    const { setActiveTableId } = usePaymentStore.getState();
    setActiveTableId(tableId as string);

    // 3. When the screen unmounts, clear the active table ID
    return () => {
      const { clearActiveTableId } = usePaymentStore.getState();
      clearActiveTableId();
    };
  }, [tableId]); // Rerun if the tableId changes

  if (!table) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-2xl font-bold text-red-500">
          Table not found!
        </Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-50">
      {/* --- Customer Info Section (Top) --- */}
      <View className="bg-white p-6 border-b border-gray-200">
        <View className="space-y-4">
          <View className="flex-row gap-8 my-1">
            <FormInput
              label="Server/Employee Name"
              value={serverName}
              onChangeText={setServerName}
            />
            <FormInput
              label="Customer Name"
              value={customerName}
              onChangeText={setCustomerName}
            />
          </View>
          <View className="flex-row gap-8 my-1">
            <FormInput
              label="Order"
              value={orderId}
              onChangeText={setOrderId}
            />
            <View className="flex-1">
              <Text className="text-base font-semibold text-gray-600 mb-2">
                Guests
              </Text>
              <View className="flex-row items-center justify-between p-2 pl-4 bg-[#FAFAFA] rounded-xl border border-background-400">
                <Text className="text-sm text-gray-500">
                  The number of people will be added into the table
                </Text>
                <View className="flex-row items-center gap-2 bg-background-400 rounded-full">
                  <TouchableOpacity
                    onPress={() => setNumberOfGuests((p) => Math.max(1, p - 1))}
                    className="p-2 bg-white rounded-full"
                  >
                    <Minus color="#4b5563" size={20} />
                  </TouchableOpacity>
                  <Text className="text-xl font-bold text-gray-800 w-8 text-center">
                    {numberOfGuests}
                  </Text>
                  <TouchableOpacity
                    onPress={() => setNumberOfGuests((p) => p + 1)}
                    className="p-2 bg-primary-400 rounded-full"
                  >
                    <Plus color="#FFFFFF" size={20} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </View>
        </View>
      </View>
      <View className="flex-1 flex-row ">
        <View className="flex-1 p-6 px-4 pt-0">
          <MenuSection tableId={tableId as string} />
        </View>
        <BillSection tableId={tableId as string} />
      </View>

      {/* --- Fixed Footer (Not Scrollable) --- */}
      <View className="bg-white border-t border-gray-200 p-4 flex-row justify-between items-center">
        <View className="flex-row items-center gap-2">
          <AlertCircle color="#f97316" size={20} />
          <Text className="font-semibold text-gray-600">
            Table No. {table.name}, Table Size - Medium, {table.capacity}
          </Text>
        </View>
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={() => router.back()}
            className="px-8 py-3 rounded-lg border border-gray-300"
          >
            <Text className="font-bold text-gray-700">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity className="px-8 py-3 rounded-lg bg-primary-400">
            <Text className="font-bold text-white">Take Order</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};

export default UpdateTableScreen;
