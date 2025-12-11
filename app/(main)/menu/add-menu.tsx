import MenuForm from "@/components/menu/MenuForm";
import { useToast } from "@/contexts/ToastContext";
import { useMenuStore } from "@/stores/useMenuStore";
import React, { useState } from "react";
import { View } from "react-native";

const AddMenuScreen: React.FC = () => {
  const { addMenu } = useMenuStore();
  const { show } = useToast();
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (data: any): Promise<boolean> => {
    setIsSaving(true);
    try {
      addMenu({
        name: data.name,
        description: data.description,
        isActive: data.isActive,
        categories: data.categories,
        schedules: data.schedules,
      });

      show({
        title: "Menu Created",
        message: `Successfully created "${data.name}".`,
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

  return (
    <View className="flex-1 bg-[#212121]">
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
