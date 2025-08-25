import { images } from "@/lib/image";
import { CartItem } from "@/lib/types"; // Use your global CartItem type
import React from "react";
import { Image, ScrollView, Text, View } from "react-native";
import BillItem from "./BillItem";

// 1. The component now accepts a `cart` array as a prop
interface BillSummaryProps {
  cart: CartItem[];
}

const BillSummary: React.FC<BillSummaryProps> = ({ cart }) => {
  return (
    <View className="flex-1 bg-white ">
      <View className="my-4 px-4 ">
        <View className="flex flex-row items-center justify-between">
          <Text className="text-xl font-bold text-accent-500">Cart</Text>
          <Text className="text-sm text-accent-500">
            {cart.length} Items
          </Text>
        </View>
        <ScrollView
          showsVerticalScrollIndicator={true}
          className="max-h-80 mb-2"
          nestedScrollEnabled={true}
        >
          {cart.length > 0 ? (
            cart.map((item, index) => (
              <BillItem
                key={`${item.id}-${index}`}
                item={item}
                isEditable={true}
              />
            ))
          ) : (
            <View className="h-24 items-center justify-center">
              <Text className="text-gray-500">Cart is empty.</Text>
            </View>
          )}
        </ScrollView>
      </View>
      <View className="absolute bottom-0 left-0 right-0 ">
        <Image
          source={images.paperEffect}
          className="w-full"
          resizeMode="cover"
        />
      </View>
    </View>
  );
};

export default BillSummary;
