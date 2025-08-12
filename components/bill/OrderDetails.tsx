import { ChevronDown, FileText, Pencil } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

const OrderDetails: React.FC = () => {
  return (
    <View className="mb-4 px-4">
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
        <TouchableOpacity className="flex-1 flex-row justify-between items-center p-3 border border-background-400 rounded-lg">
          <Text className="font-semibold text-accent-400">Select Table</Text>
          <ChevronDown color="#6b7280" size={20} />
        </TouchableOpacity>
        <TouchableOpacity className="flex-1 flex-row justify-between items-center p-3 border border-background-400 rounded-lg">
          <Text className="font-semibold text-accent-400">Order Type</Text>
          <ChevronDown color="#6b7280" size={20} />
        </TouchableOpacity>
      </View>

      {/* Open Item Button */}
      <TouchableOpacity className="mt-2 w-full items-center py-3 border border-background-400 rounded-lg">
        <Text className="font-bold text-accent-400">Open Item</Text>
      </TouchableOpacity>
    </View>
  );
};

export default OrderDetails;
