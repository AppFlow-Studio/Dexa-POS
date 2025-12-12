import CategoryForm from "@/components/menu/CategoryForm";
import { useToast } from "@/contexts/ToastContext";
import { useMenuStore } from "@/stores/useMenuStore";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";

const EditCategoryScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const {
    categories,
    menuItems,
    updateCategory,
    deleteCategory,
    addItemToCategory,
    removeItemFromCategory,
  } = useMenuStore();
  const { show } = useToast();
  const [isSaving, setIsSaving] = useState(false);

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

  const handleSubmit = async (data: any): Promise<boolean> => {
    if (!existing) return false;
    setIsSaving(true);
    try {
      // 1. Update Category
      updateCategory(existing.id, {
        name: data.name,
        isActive: data.isActive,
        schedules: data.schedules,
      });

      // 2. Update Items (Diffing)
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
      beforeItemIds
        .filter((id) => !selectedItemIds.includes(id))
        .forEach((id) => removeItemFromCategory(id, existing.name));

      // Add items that are newly selected
      selectedItemIds
        .filter((id) => !beforeItemIds.includes(id))
        .forEach((id) => addItemToCategory(id, data.name));

      show({
        title: "Category Updated",
        message: `Successfully updated "${data.name}".`,
        type: "success",
      });
      return true;
    } catch (error) {
      console.error(error);
      Alert.alert("Error", "Failed to update category. Please try again.");
      return false;
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = () => {
    if (!existing) return;
    Alert.alert("Delete Category", `Delete "${existing.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          deleteCategory(existing.id);
          router.replace({ pathname: "/menu", params: { tab: "categories" } });
        },
      },
    ]);
  };

  if (!existing) {
    return (
      <View className="flex-1 bg-[#212121] items-center justify-center p-4">
        <Text className="text-xl text-white">Category not found.</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-3 px-4 py-2 bg-[#303030] rounded border border-gray-600"
        >
          <Text className="text-lg text-gray-300">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#212121]">
      <CategoryForm
        initialData={existing}
        initialItems={initialItems}
        onSubmit={handleSubmit}
        isSaving={isSaving}
        title="Edit Category"
        submitButtonLabel="Save Changes"
        onDelete={handleDelete}
      />
    </View>
  );
};

export default EditCategoryScreen;
