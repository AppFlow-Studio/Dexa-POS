import BillSection from "@/components/bill/BillSection";
import MenuSection from "@/components/menu/MenuSection";
import { useTableStore } from "@/stores/useTableStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AlertCircle, ArrowLeft, Minus, Plus } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const UpdateTableScreen = () => {
  const router = useRouter();
  const { tableId } = useLocalSearchParams(); // Get the tableId from the URL

  const [customerName, setCustomerName] = useState("John Doe");
  const [numberOfPeople, setNumberOfPeople] = useState(3);

  const table = useTableStore((state) => state.getTableById(tableId as string));
  const addItemToTableCart = useTableStore((state) => state.addItemToTableCart);

  if (!table) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-2xl font-bold text-red-500">
          Table not found!
        </Text>
      </View>
    );
  }
  const handleAddItem = (itemData: any) => {
    addItemToTableCart(table.id, itemData);
  };

  return (
    <View className="flex-1 flex-row">
      {/* --- Left Panel: Order Creation --- */}
      <View className="flex-1 p-6 bg-white">
        {/* Header */}
        <View className="flex-row items-center mb-6">
          <TouchableOpacity
            onPress={() => router.back()}
            className="p-2 mr-4 bg-gray-100 rounded-lg"
          >
            <ArrowLeft color="#1f2937" size={24} />
          </TouchableOpacity>
          <Text className="text-3xl font-bold text-gray-800">
            Update Table No. {table.name}
          </Text>
        </View>

        {/* Customer Info */}
        <View className="flex-row space-x-6 mb-6">
          <View className="flex-1">
            <Text className="text-base font-semibold text-gray-600 mb-2">
              Customer Name
            </Text>
            <TextInput
              value={customerName}
              onChangeText={setCustomerName}
              className="p-4 bg-gray-100 rounded-lg text-lg"
            />
          </View>
          <View className="flex-1">
            <Text className="text-base font-semibold text-gray-600 mb-2">
              Number of People
            </Text>
            <View className="flex-row items-center">
              <Text className="text-sm text-gray-500 flex-1 mr-4">
                The number of people will be added into the table
              </Text>
              <View className="flex-row items-center space-x-4">
                <TouchableOpacity
                  onPress={() => setNumberOfPeople((p) => Math.max(1, p - 1))}
                  className="p-3 border border-gray-300 rounded-md"
                >
                  <Minus color="#4b5563" size={20} />
                </TouchableOpacity>
                <Text className="text-xl font-bold text-gray-800 w-8 text-center">
                  {numberOfPeople}
                </Text>
                <TouchableOpacity
                  onPress={() => setNumberOfPeople((p) => p + 1)}
                  className="p-3 bg-primary-400 rounded-md"
                >
                  <Plus color="#FFFFFF" size={20} />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>

        {/* Menu Section */}
        <MenuSection tableId={tableId as string} />
      </View>

      {/* --- Right Panel: Bill Section for this table --- */}
      <BillSection tableId={tableId as string} />

      {/* --- Footer --- */}
      <View className="absolute bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 flex-row justify-between items-center">
        <View className="flex-row items-center space-x-2">
          <AlertCircle color="#f97316" size={20} />
          <Text className="font-semibold text-gray-600">
            Table No. {table.name}, Table Size - Medium, {table.capacity}
          </Text>
        </View>
        <View className="flex-row space-x-2">
          <TouchableOpacity
            onPress={() => router.back()}
            className="px-8 py-3 rounded-lg border border-gray-300"
          >
            <Text className="font-bold text-gray-700">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity className="px-8 py-3 rounded-lg border border-gray-300">
            <Text className="font-bold text-gray-700">Assign to table</Text>
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
