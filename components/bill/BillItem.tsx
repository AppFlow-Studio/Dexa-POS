import { Pencil } from "lucide-react-native";
import React from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";

export interface BillItemType {
  id: string;
  name: string;
  quantity: number;
  price: number;
  imageUrl: string;
}

interface BillItemProps {
  item: BillItemType;
}

const BillItem: React.FC<BillItemProps> = ({ item }) => {
  return (
    <View className="flex-row items-center mb-4">
      <Image source={{ uri: item.imageUrl }} className="w-12 h-12 rounded-lg" />
      <View className="flex-1 ml-3">
        <Text className="font-semibold text-base text-gray-800">
          {item.name}
        </Text>
        <View className="flex-row items-center mt-1">
          <Text className="text-sm text-gray-500">x {item.quantity}</Text>
          <TouchableOpacity className="flex-row items-center ml-3 px-2 py-0.5 bg-blue-100 rounded-md">
            <Text className="text-xs font-semibold text-blue-600 mr-1">
              Notes
            </Text>
            <Pencil color="#2563eb" size={10} />
          </TouchableOpacity>
        </View>
      </View>
      <Text className="font-semibold text-base text-gray-800">
        ${item.price.toFixed(2)}
      </Text>
    </View>
  );
};

export default BillItem;
