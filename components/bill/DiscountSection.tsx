import { Tag } from "lucide-react-native";
import React from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

const DiscountSection: React.FC = () => {
  return (
    <View className="p-4 bg-background-200">
      <View className="flex-row items-center mb-2">
        <View className="bg-background-100 border border-background-200 rounded-xl flex-row py-1 px-2">
          <View className="p-1 rounded-md mr-2">
            <Tag color="#5D5D73" size={14} />
          </View>
          <Text className="font-bold text-base text-accent-300">Discounts</Text>
        </View>
      </View>
      <View className="flex-row items-center space-x-2 gap-2">
        <TextInput
          placeholder="Add promo or voucher"
          className="flex-1 p-3 bg-background-100 rounded-xl text-base"
          placeholderTextColor="#6b7280"
        />
        <TouchableOpacity className="px-6 py-3 bg-primary-400 rounded-xl">
          <Text className="text-white font-bold">Apply</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default DiscountSection;
