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
    className={`p-6 border rounded-xl mb-3 ${isSelected ? "border-primary-400 bg-primary-100" : "border-background-400 bg-white"}`}
  >
    <Text className="text-2xl font-medium text-accent-500">{store.name}</Text>
    <Text className="text-xl text-accent-500 mt-1">
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
      <Text className="text-5xl font-semibold text-white text-center mb-8">
        Select Store
      </Text>

      <ScrollView className="h-96 mb-6">
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
        className="w-full p-6 bg-primary-400 rounded-xl items-center"
      >
        <Text className="text-white text-2xl font-bold">Login</Text>
      </TouchableOpacity>
    </View>
  );
};

export default StoreSelectScreen;
