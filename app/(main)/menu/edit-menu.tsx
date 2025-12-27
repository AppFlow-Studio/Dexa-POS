import MenuForm from "@/components/menu/MenuForm";
import { useToast } from "@/contexts/ToastContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";

const EditMenuScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { menus, updateMenu, deleteMenu } = useMenuStore();
  const { selectedStore } = useStoreSettingsStore();
  const supabase = useSupabaseClient();
  const { show } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const existing = useMemo(() => menus.find((m) => m.id === id), [id, menus]);

  // Check if this is a global menu (not local to this store)
  const isGlobalMenu =
    existing?.location_id === null || existing?.location_id === undefined;
  const isLocalMenu = existing?.location_id === selectedStore?.id;

  if (existing && (isGlobalMenu || !isLocalMenu)) {
    return (
      <View className="flex-1 bg-[#212121] items-center justify-center p-4">
        <Text className="text-2xl text-white font-bold mb-2">Global Menu</Text>
        <Text className="text-lg text-gray-400 text-center mb-6">
          This menu belongs to all locations and cannot be edited from here.
          Please contact your administrator to modify global menus.
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
    Alert.alert("Delete Menu", `Delete "${existing.name}"?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          // Delete from backend
          const { error } = await MenuService.deleteMenu(supabase, existing.id);
          if (error) {
            show({
              title: "Error",
              message: error.message || "Failed to delete menu.",
              type: "error",
            });
            return;
          }

          // Delete from local store
          deleteMenu(existing.id);
          show({
            title: "Menu Deleted",
            message: `Menu "${existing.name}" has been deleted.`,
            type: "success",
          });
          router.replace({ pathname: "/menu", params: { tab: "menus" } });
        },
      },
    ]);
  };

  if (!existing) {
    return (
      <View className="flex-1 bg-[#212121] items-center justify-center p-4">
        <Text className="text-xl text-white">Menu not found.</Text>
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
