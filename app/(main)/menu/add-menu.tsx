import MenuForm from "@/components/menu/MenuForm";
import { useToast } from "@/contexts/ToastContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import React, { useState } from "react";
import { Alert, View } from "react-native";

const AddMenuScreen: React.FC = () => {
  const addMenu = useMenuStore((s) => s.addMenu);
  const categories = useMenuStore((s) => s.categories);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const { show } = useToast();
  const supabase = useSupabaseClient();
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

      // Create menu in backend
      const { data: createdMenu, error } = await MenuService.createMenu(
        supabase,
        {
          merchantId,
          locationId,
          name: data.name,
          description: data.description,
          isActive: data.isActive,
          displayOrder: 0, // Auto-calculate based on existing menus
        }
      );

      if (error) {
        console.error("Failed to create menu:", error);
        show({
          title: "Error",
          message: error.message || "Failed to create menu. Please try again.",
          type: "error",
        });
        return false;
      }

      // Add categories to menu if selected
      if (data.categories && data.categories.length > 0 && createdMenu?.id) {
        for (let i = 0; i < data.categories.length; i++) {
          const categoryName = data.categories[i];
          // Find category ID from store by name
          const category = categories?.find((c) => c.name === categoryName);
          if (category?.id) {
            await MenuService.addCategoryToMenu(supabase, {
              menuId: createdMenu.id,
              categoryId: category.id,
              merchantId,
              displayOrder: i,
            });
          }
        }
      }

      // Also update local store for immediate UI feedback
      addMenu({
        name: data.name,
        description: data.description,
        isActive: data.isActive,
        categories: data.categories,
        schedules: data.schedules,
        location_id: locationId,
        id: createdMenu.id,
      });

      show({
        title: "Menu Created",
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
      <MenuForm
        onSubmit={handleSubmit}
        isSaving={isSaving}
        title="Create New Menu"
        submitButtonLabel="Create Menu"
      />
    </View>
  );
};

export default AddMenuScreen;
