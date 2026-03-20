import MenuForm from "@/components/menu/MenuForm";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { useToast } from "@/contexts/ToastContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { colors } from "@/lib/theme";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft, Globe } from "lucide-react-native";
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
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const existing = useMemo(() => menus.find((m) => m.id === id), [id, menus]);

  // Check if this is a global menu (not local to this store)
  const isGlobalMenu =
    existing?.location_id === null || existing?.location_id === undefined;
  const isLocalMenu = existing?.location_id === selectedStore?.id;

  if (existing && (isGlobalMenu || !isLocalMenu)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.panel }}>
        {/* Header */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}
          >
            <ArrowLeft size={14} color={colors.label} />
            <Text style={{ fontSize: 13, color: colors.label, fontWeight: "500" }}>Back</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.teal + "15", borderWidth: 1, borderColor: colors.teal + "30", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Globe size={26} color={colors.teal} />
          </View>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading, marginBottom: 8 }}>Global Menu</Text>
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 20, marginBottom: 24, maxWidth: 300 }}>
            This menu belongs to all locations and cannot be edited here. Contact your administrator to modify global menus.
          </Text>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 16, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.teal + "20", borderWidth: 1, borderColor: colors.teal + "50" }}
          >
            <ArrowLeft size={13} color={colors.teal} />
            <Text style={{ fontSize: 13, color: colors.teal, fontWeight: "600" }}>Go Back</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
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

  const handleDelete = () => {
    if (!existing) return;
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (!existing) return;

    // Delete from backend
    const { error } = await MenuService.deleteMenu(supabase, existing.id);
    if (error) {
      show({
        title: "Error",
        message: error.message || "Failed to delete menu.",
        type: "error",
      });
      setShowDeleteModal(false);
      return;
    }

    // Delete from local store
    deleteMenu(existing.id);
    show({
      title: "Menu Deleted",
      message: `Menu "${existing.name}" has been deleted.`,
      type: "success",
    });
    setShowDeleteModal(false);
    router.replace({ pathname: "/menu", params: { tab: "menus" } });
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

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title="Delete Menu"
        description={`Are you sure you want to delete '${existing?.name}'?`}
        confirmText="Delete"
        variant="destructive"
      />
    </View>
  );
};

export default EditMenuScreen;
