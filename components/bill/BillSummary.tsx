import { useCartStore } from "@/stores/useCartStore";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import BillItem from "./BillItem";

const BillSummary: React.FC = () => {
  const billItems = useCartStore((state) => state.items);

  return (
    <View className="flex-1 my-4 min-h-40">
      <Text className="text-xl font-bold text-gray-800 mb-4">Bills</Text>
      <ScrollView showsVerticalScrollIndicator={true}>
        {billItems.map((item) => (
          <BillItem key={item.id} item={item} />
        ))}
      </ScrollView>
      {/* TODO: Replace this View with an SVG for the torn paper effect */}
      <View className="h-px bg-gray-200 border-b-2 border-dashed border-gray-300 -mx-6" />
    </View>
  );
};

export default BillSummary;
