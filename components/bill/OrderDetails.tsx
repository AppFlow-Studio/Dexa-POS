import { ChevronDown, FileText, Pencil } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const OrderDetails: React.FC = () => {
  return (
    <View className="mb-4">
      {/* Header */}
      <View className="flex-row items-center justify-between mb-4">
        <TouchableOpacity className="p-2.5 bg-gray-100 rounded-full">
          <FileText color="#4b5563" size={20} />
        </TouchableOpacity>
        <View className="items-center">
          <Text className="text-xl font-bold text-gray-800">Jake Carter</Text>
          <Text className="text-sm text-gray-500">Order Number #45654</Text>
        </View>
        <TouchableOpacity className="p-2.5 bg-gray-100 rounded-full">
          <Pencil color="#4b5563" size={20} />
        </TouchableOpacity>
      </View>

      {/* Selectors */}
      <View className="flex-row space-x-2">
        <TouchableOpacity className="flex-1 flex-row justify-between items-center p-3 bg-white border border-gray-200 rounded-lg">
          <Text className="font-semibold text-gray-700">Select Table</Text>
          <ChevronDown color="#6b7280" size={20} />
        </TouchableOpacity>
        <TouchableOpacity className="flex-1 flex-row justify-between items-center p-3 bg-white border border-gray-200 rounded-lg">
          <Text className="font-semibold text-gray-700">Order Type</Text>
          <ChevronDown color="#6b7280" size={20} />
        </TouchableOpacity>
      </View>

      {/* Open Item Button */}
      <TouchableOpacity className="mt-2 w-full items-center py-3 bg-white border border-gray-200 rounded-lg">
        <Text className="font-bold text-gray-800">Open Item</Text>
      </TouchableOpacity>
    </View>
  );
};

export default OrderDetails;
