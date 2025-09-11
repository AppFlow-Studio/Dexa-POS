import { InventoryItemForm } from "@/components/inventory/InventoryItemForm";
import { useItemStore } from "@/stores/useItemStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Text, View } from "react-native";

const EditItemScreen = () => {
  const router = useRouter();
  const { itemId } = useLocalSearchParams();
  const { items, updateItem } = useItemStore();

  const itemToEdit = items.find((item) => item.id === itemId);

  if (!itemToEdit) {
    return (
      <View className="flex-1 justify-center items-center">
        <ActivityIndicator size="large" />
        <Text className="mt-4 text-lg">Loading item...</Text>
      </View>
    );
  }

  const handleSaveChanges = (data: any) => {
    updateItem(itemId as string, data);
    router.back();
  };

  return (
    <InventoryItemForm
      item={itemToEdit}
      onSave={handleSaveChanges}
      onCancel={() => router.back()}
    />
  );
};

export default EditItemScreen;
