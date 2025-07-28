import React from "react";
import { ScrollView, Text, View } from "react-native";
import BillItem, { BillItemType } from "./BillItem";

// Mock data
const billItems: BillItemType[] = [
  {
    id: "1",
    name: "Classic Crispyburger",
    quantity: 3,
    price: 4.75,
    imageUrl: "https://placehold.co/100x100",
  },
  {
    id: "2",
    name: "Classic Crispyburger",
    quantity: 3,
    price: 4.75,
    imageUrl: "https://placehold.co/100x100",
  },
  {
    id: "3",
    name: "Classic Crispyburger",
    quantity: 3,
    price: 4.75,
    imageUrl: "https://placehold.co/100x100",
  },
  {
    id: "4",
    name: "Classic Crispyburger",
    quantity: 3,
    price: 4.75,
    imageUrl: "https://placehold.co/100x100",
  },
];

const BillSummary: React.FC = () => {
  return (
    <View className="flex-1 my-4">
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
