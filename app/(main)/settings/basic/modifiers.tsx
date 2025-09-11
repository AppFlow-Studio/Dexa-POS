// /app/(main)/settings/basic/modifiers.tsx
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { ModifierGroup, ModifierOption } from "@/lib/types";
import { useModifierGroupStore } from "@/stores/useModifierGroupStore";
import { Edit, Plus, Trash2 } from "lucide-react-native";
import React, { useState } from "react";
import { FlatList, Switch, Text, TouchableOpacity, View } from "react-native";
// import { CreateEditModifierGroupModal } from '@/components/settings/modifiers/CreateEditModifierGroupModal';
import {
  Building2,
  Database,
  Receipt,
  Settings as SettingsIcon,
  User,
} from "lucide-react-native";

// Row component for displaying each modifier option
const ModifierOptionRow = ({
  option,
  onEdit,
  onDelete,
}: {
  option: ModifierOption;
  onEdit: () => void;
  onDelete: () => void;
}) => (
  <View className="flex-row items-center p-3 bg-gray-50 rounded-lg justify-between">
    <View>
      <Text className="font-semibold text-gray-800">{option.name}</Text>
      <Text className="text-gray-600">${option.price.toFixed(2)}</Text>
    </View>
    <View className="flex-row gap-2">
      <TouchableOpacity onPress={onEdit} className="p-2">
        <Edit size={18} color="#4b5563" />
      </TouchableOpacity>
      <TouchableOpacity onPress={onDelete} className="p-2">
        <Trash2 size={18} color="#ef4444" />
      </TouchableOpacity>
    </View>
  </View>
);

const ModifiersScreen = () => {
  const {
    modifierGroups,
    createGroup,
    updateGroup,
    deleteGroup,
    addOptionToGroup,
  } = useModifierGroupStore();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState<ModifierGroup | null>(
    null
  );

  const handleSaveGroup = (
    groupData: Omit<ModifierGroup, "id" | "options">
  ) => {
    if (selectedGroup) {
      updateGroup(selectedGroup.id, groupData);
    } else {
      createGroup(groupData);
    }
    setSelectedGroup(null);
  };

  const basicSubsections = [
    {
      id: "store-info",
      title: "Store Info",
      subtitle: "Business Details",
      route: "/settings/basic/store-info",
      icon: <Building2 color="#3b82f6" size={20} />,
    },
    {
      id: "my-profile",
      title: "My Profile",
      subtitle: "Personal Settings",
      route: "/settings/basic/my-profile",
      icon: <User color="#3b82f6" size={20} />,
    },
    {
      id: "category",
      title: "Categories",
      subtitle: "Menu Categories",
      route: "/settings/basic/category",
      icon: <Database color="#3b82f6" size={20} />,
    },
    {
      id: "modifiers",
      title: "Modifiers",
      subtitle: "Item Customizations",
      route: "/settings/basic/modifiers",
      icon: <SettingsIcon color="#3b82f6" size={20} />,
    },
    {
      id: "taxes",
      title: "Taxes",
      subtitle: "Tax Configuration",
      route: "/settings/basic/taxes",
      icon: <Receipt color="#3b82f6" size={20} />,
    },
  ];

  return (
    <View className="flex-1 bg-gray-50 p-6">
      <View className="flex-row gap-6 h-full w-full">
        <SettingsSidebar
          title="Basic Settings"
          subsections={basicSubsections}
          currentRoute="/settings/basic/modifiers"
        />
        <View className="flex-1 bg-white rounded-2xl border border-gray-200 p-6">
          <View className="flex-row justify-between items-center mb-4">
            <Text className="text-xl font-bold text-gray-800">
              Modifier Groups
            </Text>
            <TouchableOpacity
              onPress={() => {
                setSelectedGroup(null);
                setIsModalOpen(true);
              }}
              className="flex-row items-center gap-2 py-2 px-4 bg-primary-400 rounded-lg"
            >
              <Plus color="#FFFFFF" size={18} />
              <Text className="font-bold text-white">Create Group</Text>
            </TouchableOpacity>
          </View>

          <FlatList
            data={modifierGroups}
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <View className="mb-4 p-4 border border-gray-200 rounded-lg">
                <View className="flex-row justify-between items-center">
                  <View>
                    <Text className="text-lg font-bold">{item.name}</Text>
                    <Text className="text-sm text-gray-500">
                      Select min {item.minSelections}, max {item.maxSelections}
                    </Text>
                  </View>
                  <View className="flex-row items-center gap-4">
                    <Switch
                      value={item.isEnabled}
                      onValueChange={(value) =>
                        updateGroup(item.id, { isEnabled: value })
                      }
                    />
                    <TouchableOpacity
                      onPress={() => {
                        setSelectedGroup(item);
                        setIsModalOpen(true);
                      }}
                    >
                      <Edit size={20} color="#4b5563" />
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => deleteGroup(item.id)}>
                      <Trash2 size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View className="mt-4 space-y-2">
                  {item.options.map((opt) => (
                    <ModifierOptionRow
                      key={opt.id}
                      option={opt}
                      onEdit={() => {}}
                      onDelete={() => {}}
                    />
                  ))}
                  <TouchableOpacity
                    onPress={() =>
                      addOptionToGroup(item.id, {
                        name: "New Option",
                        price: 0,
                      })
                    }
                    className="py-2 mt-2 border-2 border-dashed border-gray-300 rounded-lg items-center"
                  >
                    <Text className="font-semibold text-gray-600">
                      + Add Modifier
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>
      </View>

      {/* <CreateEditModifierGroupModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveGroup}
        initialData={selectedGroup}
      /> */}
    </View>
  );
};

export default ModifiersScreen;
