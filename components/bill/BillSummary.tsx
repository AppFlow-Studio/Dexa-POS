import { images } from "@/lib/image";
import { useCartStore } from "@/stores/useCartStore";
import React from "react";
import { Image, ScrollView, Text, View } from "react-native";
import BillItem from "./BillItem";

const BillSummary: React.FC = () => {
  const billItems = useCartStore((state) => state.items);

  return (
    <View className="flex-1 ">
      <View className="my-4 px-4">
        <Text className="text-xl font-bold text-accent-500 mb-4">Bills</Text>
        <ScrollView
          showsVerticalScrollIndicator={true}
          className="max-h-40"
          nestedScrollEnabled={true}
        >
          {billItems.map((item) => (
            <BillItem key={item.id} item={item} />
          ))}
        </ScrollView>
      </View>
      <View className="absolute bottom-0 left-0 right-0">
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
