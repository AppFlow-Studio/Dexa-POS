import React from "react";
import { Image, Text, View } from "react-native";

const Header = () => {
  return (
    <View className="flex-row justify-between items-center">
      {/* The original design has the "Order Line" title in the main content, 
          this header is for the user profile. */}
      <View>
        <Text className="text-2xl font-bold text-gray-800">Order Line</Text>
      </View>
      <View className="flex-row items-center">
        <Image
          source={{ uri: "https://placehold.co/40x40" }}
          className="w-10 h-10 rounded-full"
        />
        <View className="ml-3">
          <Text className="font-semibold">Jessica</Text>
          <Text className="text-gray-500">New York</Text>
        </View>
      </View>
    </View>
  );
};

export default Header;
