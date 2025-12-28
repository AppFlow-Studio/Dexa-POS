import ItemForm from "@/components/menu/ItemForm";
import { useToast } from "@/contexts/ToastContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { MenuItemType } from "@/lib/types";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const EditMenuItemScreen: React.FC = () => {
  const { itemId } = useLocalSearchParams<{ itemId: string }>();
  const { menuItems, updateMenuItem, categories } = useMenuStore();
  const { selectedStore } = useStoreSettingsStore();
  const supabase = useSupabaseClient();
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

  // Check if this is a global item (not local to this store)
  const isGlobalItem =
    itemToEdit.location_id === null || itemToEdit.location_id === undefined;
  const isLocalItem = itemToEdit.location_id === selectedStore?.id;

  if (isGlobalItem || !isLocalItem) {
    return (
      <View className="flex-1 bg-[#212121] items-center justify-center p-4">
        <Text className="text-2xl text-white font-bold mb-2">Global Item</Text>
        <Text className="text-lg text-gray-400 text-center mb-6">
          This item belongs to all locations and cannot be edited from here.
          Please contact your administrator to modify global items.
        </Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="bg-blue-600 px-6 py-3 rounded-lg"
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
      // Update in backend first
      const { error } = await MenuService.updateMenuItem(supabase, itemId, {
        name: data.name,
        description: data.description,
        price: data.price,
        cashPrice: data.cashPrice,
        image: data.image,
        mealTypes: data.meal as ("Lunch" | "Dinner" | "Brunch" | "Specials")[],
        allergens: data.allergens,
        availability: data.availability,
        stockTrackingMode: data.stockTrackingMode,
        cardBgColor: data.cardBgColor,
      });

      if (error) {
        console.error("Failed to update menu item:", error);
        show({
          title: "Error",
          message: error.message || "Failed to update item. Please try again.",
          type: "error",
        });
        return false;
      }

      // Sync category changes to backend
      const isValidUUID = (id: string) => {
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(id);
      };

      const oldCategories = Array.isArray(itemToEdit.category)
        ? itemToEdit.category
        : itemToEdit.category
        ? [itemToEdit.category]
        : [];
      const newCategories = Array.isArray(data.category)
        ? data.category
        : data.category
        ? [data.category]
        : [];

      // Find categories to add and remove
      const categoriesToAdd = newCategories.filter(
        (c) => !oldCategories.includes(c)
      );
      const categoriesToRemove = oldCategories.filter(
        (c) => !newCategories.includes(c)
      );

      // Add to new categories
      for (const categoryName of categoriesToAdd) {
        const category = categories.find((c) => c.name === categoryName);
        if (category?.id && isValidUUID(category.id) && selectedStore) {
          await MenuService.addItemToCategory(supabase, {
            categoryId: category.id,
            menuItemId: itemId,
            merchantId: selectedStore.merchant_id,
          });
        }
      }

      // Remove from old categories
      for (const categoryName of categoriesToRemove) {
        const category = categories.find((c) => c.name === categoryName);
        if (category?.id && isValidUUID(category.id)) {
          await MenuService.removeItemFromCategory(
            supabase,
            category.id,
            itemId
          );
        }
      }

      // Update local store for immediate UI feedback
      updateMenuItem(itemId, data);
      show({
        title: "Item Updated",
        message: `Successfully updated "${data.name}".`,
        type: "success",
      });
      return true;
    } catch (error) {
      console.error(error);
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
