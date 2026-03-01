import CategoryForm from "@/components/menu/CategoryForm";
import { useToast } from "@/contexts/ToastContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import React, { useState } from "react";
import { Alert, View } from "react-native";

const AddCategoryScreen: React.FC = () => {
  const addCategory = useMenuStore((s) => s.addCategory);
  const addItemToCategory = useMenuStore((s) => s.addItemToCategory);
  const categories = useMenuStore((s) => s.categories);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const supabase = useSupabaseClient();
  const { show } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (data: any): Promise<boolean> => {
    setIsSaving(true);
    try {
      // Validate store selection
      if (!selectedStore) {
        Alert.alert("Error", "No store selected. Please select a store first.");
        return false;
      }

      const merchantId = selectedStore.merchant_id;
      const locationId = selectedStore.id;

      // Calculate new display order
      const newOrder = Math.max(...categories.map((cat) => cat.order), 0) + 1;

      // Create category in backend
      const { data: createdCategory, error } = await MenuService.createCategory(
        supabase,
        {
          merchantId,
          locationId,
          name: data.name,
          description: data.description || "",
          displayOrder: newOrder,
          isActive: data.isActive,
        }
      );

      if (error) {
        console.error("Failed to create category:", error);
        show({
          title: "Error",
          message:
            error.message || "Failed to create category. Please try again.",
          type: "error",
        });
        return false;
      }

      // Add items to category if selected
      if (
        data.selectedItems &&
        data.selectedItems.length > 0 &&
        createdCategory?.id
      ) {
        for (let i = 0; i < data.selectedItems.length; i++) {
          const itemId = data.selectedItems[i];
          await MenuService.addItemToCategory(supabase, {
            categoryId: createdCategory.id,
            menuItemId: itemId,
            merchantId,
            displayOrder: i,
            isFeatured: false,
          });
        }
      }

      // Also update local store for immediate UI feedback
      // Include location_id so the category is identified as local to this store
      addCategory({
        name: data.name,
        isActive: data.isActive,
        order: newOrder,
        schedules: data.schedules,
        location_id: locationId, // Mark as local to current store
        id: createdCategory.id,
      });

      // Add items to local store
      if (data.selectedItems) {
        data.selectedItems.forEach((itemId: string) => {
          addItemToCategory(itemId, data.name);
        });
      }

      show({
        title: "Category Created",
        message: `Successfully created "${data.name}".`,
        type: "success",
      });
      return true;
    } catch (error) {
      console.error(error);
      show({
        title: "Error",
        message: "An unexpected error occurred. Please try again.",
        type: "error",
      });
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <View className="flex-1 bg-panel">
      <CategoryForm
        onSubmit={handleSubmit}
        isSaving={isSaving}
        title="Add New Category"
        submitButtonLabel="Create Category"
      />
    </View>
  );
};

export default AddCategoryScreen;
