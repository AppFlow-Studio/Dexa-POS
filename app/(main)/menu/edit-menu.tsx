import MenuForm from "@/components/menu/MenuForm";
import { useToast } from "@/contexts/ToastContext";
import { useMenuStore } from "@/stores/useMenuStore";
import { router, useLocalSearchParams } from "expo-router";
import React, { useMemo, useState } from "react";
import { Alert, Text, TouchableOpacity, View } from "react-native";

const EditMenuScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { menus, updateMenu, deleteMenu } = useMenuStore();
  const { show } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const existing = useMemo(() => menus.find((m) => m.id === id), [id, menus]);

  const handleSubmit = async (data: any): Promise<boolean> => {
    if (!existing) return false;
    setIsSaving(true);
    try {
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
        onPress: () => {
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
