import ItemForm from "@/components/menu/ItemForm";
import { useToast } from "@/contexts/ToastContext";
import {
    MENU_OFFLINE_REASON,
    useMenuWriteGate,
} from "@/hooks/menu/useMenuWriteGate";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { MenuItemType } from "@/lib/types";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useAuth } from "@clerk/clerk-expo";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { Alert, View } from "react-native";

const AddMenuItemScreen: React.FC = () => {
  const addMenuItem = useMenuStore((s) => s.addMenuItem);
  const categories = useMenuStore((s) => s.categories);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const supabase = useSupabaseClient();
  const { getToken } = useAuth();
  const { show } = useToast();
  const router = useRouter();
  const { canWrite } = useMenuWriteGate();
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (
    data: Omit<MenuItemType, "id">,
  ): Promise<boolean> => {
    if (!canWrite) {
      show({
        title: "You're offline",
        message: MENU_OFFLINE_REASON,
        type: "warning",
      });
      return false;
    }
    setIsSaving(true);
    try {
      // Validate store selection
      if (!selectedStore) {
        Alert.alert("Error", "No store selected. Please select a store first.");
        return false;
      }

      const merchantId = selectedStore.merchant_id;

      // Upload image to CDN if a new image was picked (base64 string)
      let imageUrl = data.image;
      if (data.image && !data.image.startsWith("http")) {
        try {
          imageUrl = await MenuService.uploadMenuImage(supabase, {
            merchantId,
            base64: data.image,
            getToken,
          });
        } catch (uploadErr) {
          console.error("Image upload failed:", uploadErr);
          show({
            title: "Image Upload Failed",
            message: "Could not upload image. Item will be saved without it.",
            type: "error",
          });
          imageUrl = undefined;
        }
      }

      // Create menu item in backend
      const { data: createdItem, error } = await MenuService.createMenuItem(
        supabase,
        {
          merchantId,
          locationId: selectedStore.id,
          name: data.name,
          description: data.description,
          price: data.price,
          cashPrice: data.cashPrice,
          image: imageUrl,
          cardBgColor: data.cardBgColor,
          mealTypes: data.meal,
          allergens: data.allergens || [],
          availability: data.availability,
          stockTrackingMode: undefined, // TODO: Add field to form
        },
      );

      if (error) {
        console.error("Failed to create menu item:", error);
        show({
          title: "Error",
          message:
            error.message || "Failed to create menu item. Please try again.",
          type: "error",
        });
        return false;
      }

      // Add item to categories if selected (only sync to backend for categories with valid UUIDs)
      const isValidUUID = (id: string) => {
        const uuidRegex =
          /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        return uuidRegex.test(id);
      };

      if (data.category && data.category.length > 0 && createdItem?.id) {
        const categoryNames = Array.isArray(data.category)
          ? data.category
          : [data.category];
        for (const categoryName of categoryNames) {
          const category = categories.find((c) => c.name === categoryName);
          // Only call backend for categories with valid UUIDs (local categories from backend)
          if (category?.id && isValidUUID(category.id)) {
            await MenuService.addItemToCategory(supabase, {
              categoryId: category.id,
              menuItemId: createdItem.id,
              merchantId,
              displayOrder: 0,
              isFeatured: false,
            });
          }
        }
      }

      // Assign modifier groups if selected
      if (
        data.modifierGroupIds &&
        data.modifierGroupIds.length > 0 &&
        createdItem?.id
      ) {
        for (let i = 0; i < data.modifierGroupIds.length; i++) {
          const modifierId = data.modifierGroupIds[i];
          await MenuService.assignModifierToItem(supabase, {
            menuItemId: createdItem.id,
            modifierGroupId: modifierId,
            merchantId,
            displayOrder: i,
          });
        }
      }

      // 4. Save Recipe Ingredients (New)
      if (data.recipe && data.recipe.length > 0 && createdItem?.id) {
        const recipeResult = await MenuService.upsertMenuItemRecipe(
          supabase,
          createdItem.id,
          selectedStore.id,
          data.recipe.map((r) => ({
            inventoryItemId: r.inventoryItemId,
            quantity: r.quantity,
          })),
        );

        if (!recipeResult.success) {
          console.error("Failed to save menu item recipe:", recipeResult.error);
          show({
            title: "Recipe Save Failed",
            message:
              recipeResult.error?.message ||
              "The menu item was created, but its recipe items were not saved.",
            type: "error",
          });
          return false;
        }

        const { queryClient } =
          require("@/contexts/TanstackProvider") as typeof import("@/contexts/TanstackProvider");
        await queryClient.invalidateQueries({
          queryKey: ["pos_sync", selectedStore.id],
        });
      }

      // Also update local store for immediate UI feedback - use backend ID
      addMenuItem({
        ...data,
        id: createdItem?.id,
        location_id: selectedStore.id,
      } as any);

      show({
        title: "Item Created",
        message: `Successfully added "${data.name}" to the menu.`,
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
      <ItemForm
        onSubmit={handleSubmit}
        isSaving={isSaving}
        disabled={!canWrite}
        title="Add New Menu Item"
        submitButtonLabel="Save Item"
      />
    </View>
  );
};

export default AddMenuItemScreen;
