import ItemForm from "@/components/menu/ItemForm";
import { useToast } from "@/contexts/ToastContext";
import { MenuItemType } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { View } from "react-native";

const AddMenuItemScreen: React.FC = () => {
  const { addMenuItem } = useMenuStore();
  const { show } = useToast();
  const router = useRouter();
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (
    data: Omit<MenuItemType, "id">
  ): Promise<boolean> => {
    setIsSaving(true);
    try {
      addMenuItem(data);
      show({
        title: "Item Created",
        message: `Successfully added "${data.name}" to the menu.`,
        type: "success",
      });
      return true;
    } catch (error) {
      show({
        title: "Save Error",
        message: "Failed to save the menu item. Please try again.",
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
        onSubmit={handleSubmit}
        isSaving={isSaving}
        title="Add New Menu Item"
        submitButtonLabel="Save Item"
      />
    </View>
  );
};

export default AddMenuItemScreen;
