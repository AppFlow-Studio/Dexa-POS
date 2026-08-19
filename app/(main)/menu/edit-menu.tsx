import MenuForm from "@/components/menu/MenuForm";
import { MenuScopeLoadingScreen } from "@/components/menu/MenuScopeLoadingScreen";
import { useToast } from "@/contexts/ToastContext";
import { useIsSingleLocation } from "@/hooks/pos/useIsSingleLocation";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { MenuService } from "@/services/menuService";
import { useMenuManagementSearchStore } from "@/stores/useMenuManagementSearchStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { router, useLocalSearchParams } from "expo-router";
import { GlobalItemScreen } from "@/components/menu/GlobalItemScreen";
import React, { useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

const EditMenuScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const menus = useMenuStore((s) => s.menus);
  const updateMenu = useMenuStore((s) => s.updateMenu);
  const deleteMenu = useMenuStore((s) => s.deleteMenu);
  const categoriesByName = useMenuStore((s) => s.categoriesByName);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const supabase = useSupabaseClient();
  const { show } = useToast();
  const { isSingleLocation, isLoading: isSingleLocationLoading } =
    useIsSingleLocation();
  const [isSaving, setIsSaving] = useState(false);
  const setMenuTab = useMenuManagementSearchStore((s) => s.setActiveTab);

  const existing = useMemo(() => menus.find((m) => m.id === id), [id, menus]);

  // Check if this is a global menu (not local to this store)
  const isGlobalMenu =
    existing?.location_id === null || existing?.location_id === undefined;
  const isLocalMenu = existing?.location_id === selectedStore?.id;

  // Single-location merchants edit the global menu directly; multi-location
  // keeps the read-only wall for global menus.
  if (existing && isGlobalMenu && isSingleLocationLoading) {
    return <MenuScopeLoadingScreen />;
  }
  if (existing && isGlobalMenu && !isSingleLocation) {
    return <GlobalItemScreen type="Menu" />
  }
  if (existing && !isGlobalMenu && !isLocalMenu) {
    return <GlobalItemScreen type="Menu" />
  }

  const handleSubmit = async (data: any): Promise<boolean> => {
    if (!existing) return false;
    setIsSaving(true);
    try {
      // Update in backend
      const { error } = await MenuService.updateMenu(supabase, existing.id, {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
      });

      if (error) {
        console.error("Failed to update menu:", error);
        show({
          title: "Error",
          message: error.message || "Failed to update menu. Please try again.",
          type: "error",
        });
        return false;
      }

      // Sync Categories
      // 1. Calculate diff
      const existingCategoryNames = existing.categories.map((c) => c.name);
      const newCategoryNames = data.categories as string[];

      const addedCategories = newCategoryNames.filter(
        (name) => !existingCategoryNames.includes(name)
      );
      const removedCategories = existingCategoryNames.filter(
        (name) => !newCategoryNames.includes(name)
      );

      // 2. Handle Additions
      for (const catName of addedCategories) {
        const category = categoriesByName[catName];
        if (category) {
          const { error: addError } = await MenuService.addCategoryToMenu(
            supabase,
            {
              menuId: existing.id,
              categoryId: category.id,
              merchantId: selectedStore?.merchant_id || "",
              displayOrder: 0, // Default order
            }
          );
          if (addError) {
            console.error(`Failed to add category ${catName}:`, addError);
            // We continue to try adding others, but could alert the user
            show({
              title: "Warning",
              message: `Failed to add category "${catName}".`,
              type: "error",
            });
          }
        }
      }

      // 3. Handle Removals
      for (const catName of removedCategories) {
        // Find ID from existing menu categories
        const category = existing.categories.find((c) => c.name === catName);
        if (category) {
          const { error: removeError } =
            await MenuService.removeCategoryFromMenu(
              supabase,
              existing.id,
              category.id
            );
          if (removeError) {
            console.error(`Failed to remove category ${catName}:`, removeError);
            show({
              title: "Warning",
              message: `Failed to remove category "${catName}".`,
              type: "error",
            });
          }
        }
      }

      // Update local store for immediate UI feedback
      updateMenu(existing.id, {
        name: data.name,
        description: data.description,
        isActive: data.isActive,
        categories: data.categories,
        schedules: data.schedules,
      });

      show({
        title: "Menu Updated",
        message: `Successfully updated "${data.name}".`,
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

  const handleDelete = async () => {
    if (!existing) return;

    try {
      setIsSaving(true);
      const { error } = await MenuService.deleteMenu(supabase, existing.id);
      if (error) {
        show({
          title: "Error",
          message: error.message || "Failed to delete menu.",
          type: "error",
        });
        return;
      }

      deleteMenu(existing.id);
      show({
        title: "Menu Deleted",
        message: `Menu "${existing.name}" has been deleted.`,
        type: "success",
      });
      setMenuTab("menus");
      router.replace("/menu");
    } catch (error) {
      console.error(error);
      show({
        title: "Delete Error",
        message: "Failed to delete menu. Please try again.",
        type: "error",
      });
    } finally {
      setIsSaving(false);
    }
  };

  if (!existing) {
    return (
      <View className="flex-1 bg-panel items-center justify-center p-4">
        <Text className="text-xl text-white">Menu not found.</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-3 px-4 py-2 bg-surface rounded border border-gray-600"
        >
          <Text className="text-lg text-gray-300">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-panel">
      <MenuForm
        initialData={existing}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        title="Edit Menu"
        submitButtonLabel="Save Changes"
        onDelete={handleDelete}
      />
    </View>
  );
};

export default EditMenuScreen;
