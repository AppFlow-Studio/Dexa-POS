import ItemForm from "@/components/menu/ItemForm";
import { useToast } from "@/contexts/ToastContext";
import { MenuItemType } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const EditMenuItemScreen: React.FC = () => {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { menuItems, updateMenuItem } = useMenuStore();
  const { show } = useToast();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const itemToEdit = menuItems.find((item) => item.id === itemId);

  if (!itemToEdit) {
    return (
      <View className="flex-1 bg-[#212121] items-center justify-center">
        <Text className="text-xl text-white mb-4">Item not found</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="bg-blue-600 px-4 py-2 rounded-lg"
        >
          <Text className="text-lg text-white font-medium">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const handleSubmit = async (
    data: Omit<MenuItemType, "id">
  ): Promise<boolean> => {
    setIsSaving(true);
    try {
      updateMenuItem(itemId, data);
      show({
        title: "Item Updated",
        message: `Successfully updated "${data.name}".`,
        type: "success",
      });
      return true;
    } catch (error) {
      show({
        title: "Save Error",
        message: "Failed to update the menu item. Please try again.",
        type: "error",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-[#212121]">
      <ItemForm
        initialData={itemToEdit}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        title="Edit Menu Item"
        submitButtonLabel="Save Changes"
      />
    </View>
  );
};

export default EditMenuItemScreen;
