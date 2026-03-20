import CategoryForm from "@/components/menu/CategoryForm";
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

const EditCategoryScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const categories = useMenuStore((s) => s.categories);
  const menuItems = useMenuStore((s) => s.menuItems);
  const updateCategory = useMenuStore((s) => s.updateCategory);
  const deleteCategory = useMenuStore((s) => s.deleteCategory);
  const addItemToCategory = useMenuStore((s) => s.addItemToCategory);
  const removeItemFromCategory = useMenuStore((s) => s.removeItemFromCategory);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const supabase = useSupabaseClient();
  const { show } = useToast();
  const [isSaving, setIsSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);

  const existing = useMemo(
    () => categories.find((c) => c.id === id),
    [id, categories]
  );

  const initialItems = useMemo(() => {
    if (!existing) return [];
    return menuItems
      .filter((item) => {
        const cats = Array.isArray(item.category)
          ? item.category
          : item.category
          ? [item.category]
          : [];
        return cats.includes(existing.name);
      })
      .map((i) => i.id);
  }, [existing, menuItems]);

  // Check if this is a global category (not local to this store)
  const isGlobalCategory =
    existing?.location_id === null || existing?.location_id === undefined;
  const isLocalCategory = existing?.location_id === selectedStore?.id;
  console.log(
    "Category debug:",
    existing?.id,
    existing?.location_id,
    selectedStore?.id
  );
  if (existing && (isGlobalCategory || !isLocalCategory)) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.panel }}>
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.card }}>
          <TouchableOpacity
            onPress={() => router.back()}
            style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border }}
          >
            <ArrowLeft size={14} color={colors.label} />
            <Text style={{ fontSize: 13, color: colors.label, fontWeight: "500" }}>Back</Text>
          </TouchableOpacity>
        </View>
        <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
          <View style={{ width: 56, height: 56, borderRadius: 16, backgroundColor: colors.teal + "15", borderWidth: 1, borderColor: colors.teal + "30", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
            <Globe size={26} color={colors.teal} />
          </View>
          <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading, marginBottom: 8 }}>Global Category</Text>
          <Text style={{ fontSize: 13, color: colors.muted, textAlign: "center", lineHeight: 20, marginBottom: 24, maxWidth: 300 }}>
            This category belongs to all locations and cannot be edited here. Contact your administrator to modify global categories.
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
    if (!existing || !selectedStore) return false;
    setIsSaving(true);
    try {
      // 1. Update Category in backend
      const { error } = await MenuService.updateCategory(
        supabase,
        existing.id,
        {
          name: data.name,
          isActive: data.isActive,
        }
      );

      if (error) {
        console.error("Failed to update category:", error);
        show({
          title: "Error",
          message:
            error.message || "Failed to update category. Please try again.",
          type: "error",
        });
        return false;
      }

      // 2. Update local store for immediate UI feedback
      updateCategory(existing.id, {
        name: data.name,
        isActive: data.isActive,
        schedules: data.schedules,
      });

      // 3. Update Items (Diffing) - handle additions/removals
      const selectedItemIds: string[] = data.selectedItems;
      const beforeItemIds = menuItems
        .filter((item) => {
          const cats = Array.isArray(item.category)
            ? item.category
            : item.category
            ? [item.category]
            : [];
          return cats.includes(existing.name);
        })
        .map((i) => i.id);

      // Remove items that are no longer selected
      const removedItems = beforeItemIds.filter(
        (itemId) => !selectedItemIds.includes(itemId)
      );
      for (const itemId of removedItems) {
        await MenuService.removeItemFromCategory(supabase, existing.id, itemId);
        removeItemFromCategory(itemId, existing.name);
      }

      // Add items that are newly selected
      const addedItems = selectedItemIds.filter(
        (itemId) => !beforeItemIds.includes(itemId)
      );
      for (const itemId of addedItems) {
        await MenuService.addItemToCategory(supabase, {
          categoryId: existing.id,
          menuItemId: itemId,
          merchantId: selectedStore.merchant_id,
        });
        addItemToCategory(itemId, data.name);
      }

      show({
        title: "Category Updated",
        message: `Successfully updated "${data.name}".`,
        type: "success",
      });
      return true;
    } catch (error) {
      console.error(error);
      show({
        title: "Error",
        message: "Failed to update category. Please try again.",
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

    // Delete from backend first
    const { error } = await MenuService.deleteCategory(supabase, existing.id);
    if (error) {
      show({
        title: "Error",
        message: error.message || "Failed to delete category.",
        type: "error",
      });
      setShowDeleteModal(false);
      return;
    }

    // Delete from local store
    deleteCategory(existing.id);
    show({
      title: "Category Deleted",
      message: `Category "${existing.name}" has been deleted.`,
      type: "success",
    });
    setShowDeleteModal(false);
    router.replace({ pathname: "/menu", params: { tab: "categories" } });
  };

  if (!existing) {
    return (
      <View className="flex-1 bg-panel items-center justify-center p-4">
        <Text className="text-xl text-white">Category not found.</Text>
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
      <CategoryForm
        initialData={existing}
        initialItems={initialItems}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        title="Edit Category"
        submitButtonLabel="Save Changes"
        onDelete={handleDelete}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={confirmDelete}
        title="Delete Category"
        description={`Are you sure you want to delete '${existing?.name}'?`}
        confirmText="Delete"
        variant="destructive"
      />
    </View>
  );
};

export default EditCategoryScreen;
