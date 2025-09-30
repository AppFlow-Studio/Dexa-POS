import { useRouter } from "expo-router";
import React, { useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const mockStores = [
  {
    id: "1",
    name: "John's Gourmet Market",
    number: "45654",
    street: "Main St.",
  },
  {
    id: "2",
    name: "John's Gourmet Market",
    number: "45654",
    street: "Main St.",
  },
  {
    id: "3",
    name: "John's Gourmet Market",
    number: "45654",
    street: "Main St.",
  },
  {
    id: "4",
    name: "John's Gourmet Market",
    number: "45654",
    street: "Main St.",
  },
  {
    id: "5",
    name: "John's Gourmet Market",
    number: "45654",
    street: "Main St.",
  },
  {
    id: "6",
    name: "John's Gourmet Market",
    number: "45654",
    street: "Main St.",
  },
];

const StoreSelectItem = ({ store, isSelected, onPress }: any) => (
  <TouchableOpacity
    onPress={onPress}
    className={`p-4 border rounded-lg mb-3 ${isSelected ? "border-blue-500 bg-blue-900/30" : "border-gray-700 bg-[#303030]"}`}
  >
    <Text
      className={`text-xl font-medium ${isSelected ? "text-blue-400" : "text-white"}`}
    >
      {store.name}
    </Text>
    <Text
      className={`text-lg mt-1 ${isSelected ? "text-blue-300" : "text-gray-400"}`}
    >
      {store.number}, {store.street}
    </Text>
  </TouchableOpacity>
);

const StoreSelectScreen = () => {
  const router = useRouter();
  const [selectedStore, setSelectedStore] = useState("3"); // Default selection

  const handleLogin = () => {
    // TODO: Add logic to save the selected store
    // On success, navigate to the main application
    router.replace("/pin-login"); // Use replace to prevent going back to auth flow
  };

  return (
    <View className="w-full">
      <Text className="text-3xl font-semibold text-white text-center mb-6">
        Select Store
      </Text>

      <ScrollView className="h-80 mb-6">
        {mockStores.map((store) => (
          <StoreSelectItem
            key={store.id}
            store={store}
            isSelected={selectedStore === store.id}
            onPress={() => setSelectedStore(store.id)}
          />
        ))}
      </ScrollView>

      <TouchableOpacity
        onPress={handleLogin}
        className="w-full p-4 bg-blue-600 rounded-xl items-center"
      >
        <Text className="text-white text-xl font-bold">Login</Text>
      </TouchableOpacity>
    </View>
  );
};

export default StoreSelectScreen;
