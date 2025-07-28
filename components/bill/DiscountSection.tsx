import { Tag } from "lucide-react-native";
import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const DiscountSection: React.FC = () => {
  return (
    <View className="my-4">
      <View className="flex-row items-center mb-2">
        <View className="p-1 bg-gray-800 rounded-md mr-2">
          <Tag color="#FFFFFF" size={14} />
        </View>
        <Text className="font-bold text-base text-gray-800">Discounts</Text>
      </View>
      <View className="flex-row items-center space-x-2">
        <TextInput
          placeholder="Add promo or voucher"
          className="flex-1 p-3 bg-gray-100 rounded-lg text-base"
          placeholderTextColor="#6b7280"
        />
        <TouchableOpacity className="px-6 py-3 bg-blue-500 rounded-lg">
          <Text className="text-white font-bold">Apply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default DiscountSection;
