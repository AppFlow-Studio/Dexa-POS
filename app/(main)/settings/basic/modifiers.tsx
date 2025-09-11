import GroupEditorModal from "@/components/settings/modifiers/GroupEditorModal";
import OptionEditorModal from "@/components/settings/modifiers/OptionEditorModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import SettingsSidebar from "@/components/settings/SettingsSidebar";
import { ModifierGroup, ModifierOption } from "@/lib/types";
import { useModifierGroupStore } from "@/stores/useModifierGroupStore";
import {
  Building2,
  Database,
  Edit,
  Plus,
  Receipt,
  SettingsIcon,
  Trash2,
  User,
} from "lucide-react-native";
import React, { useState } from "react";
import { FlatList, Switch, Text, TouchableOpacity, View } from "react-native";

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
    updateOptionInGroup,
    deleteOptionFromGroup,
  } = useModifierGroupStore();

  // State for modals
  const [isGroupModalOpen, setGroupModalOpen] = useState(false);
  const [isOptionModalOpen, setOptionModalOpen] = useState(false);
  const [isDeleteGroupModalOpen, setDeleteGroupModalOpen] = useState(false);
  const [isDeleteOptionModalOpen, setDeleteOptionModalOpen] = useState(false);

  // State to hold the item being edited or deleted
  const [selectedGroup, setSelectedGroup] = useState<ModifierGroup | null>(
    null
  );
  const [selectedOption, setSelectedOption] = useState<{
    groupId: string;
    option: ModifierOption;
  } | null>(null);
  const [groupToDelete, setGroupToDelete] = useState<string | null>(null);
  const [optionToDelete, setOptionToDelete] = useState<{
    groupId: string;
    optionId: string;
  } | null>(null);

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

  const handleSaveOption = (optionData: Omit<ModifierOption, "id">) => {
    if (selectedOption) {
      updateOptionInGroup(
        selectedOption.groupId,
        selectedOption.option.id,
        optionData
      );
    } else if (selectedGroup) {
      // Adding a new option to the currently viewed group
      addOptionToGroup(selectedGroup.id, optionData);
    }
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
                setGroupModalOpen(true);
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
                        setGroupModalOpen(true);
                      }}
                    >
                      <Edit size={20} color="#4b5563" />
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setGroupToDelete(item.id);
                        setDeleteGroupModalOpen(true);
                      }}
                    >
                      <Trash2 size={20} color="#ef4444" />
                    </TouchableOpacity>
                  </View>
                </View>
                <View className="mt-4 space-y-2">
                  {item.options.map((opt) => (
                    <ModifierOptionRow
                      key={opt.id}
                      option={opt}
                      onEdit={() => {
                        setSelectedOption({ groupId: item.id, option: opt });
                        setOptionModalOpen(true);
                      }}
                      onDelete={() => {
                        setOptionToDelete({
                          groupId: item.id,
                          optionId: opt.id,
                        });
                        setDeleteOptionModalOpen(true);
                      }}
                    />
                  ))}
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedGroup(item);
                      setSelectedOption(null);
                      setOptionModalOpen(true);
                    }}
                    className="py-2 mt-2 border-2 border-dashed border-gray-300 rounded-lg items-center"
                  >
                    <Text className="font-semibold text-gray-600">
                      + Add Modifier Option
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            )}
          />
        </View>
      </View>

      {/* --- MODALS --- */}
      <GroupEditorModal
        isOpen={isGroupModalOpen}
        onClose={() => setGroupModalOpen(false)}
        onSave={handleSaveGroup}
        initialData={selectedGroup}
      />
      <OptionEditorModal
        isOpen={isOptionModalOpen}
        onClose={() => setOptionModalOpen(false)}
        onSave={handleSaveOption}
        initialData={selectedOption?.option}
      />

      <ConfirmationModal
        isOpen={isDeleteGroupModalOpen}
        onClose={() => setDeleteGroupModalOpen(false)}
        onConfirm={() => {
          if (groupToDelete) deleteGroup(groupToDelete);
          setDeleteGroupModalOpen(false);
        }}
        title="Delete Group"
        description="Are you sure? This will remove the group and all its options."
        confirmText="Delete"
        variant="destructive"
      />

      <ConfirmationModal
        isOpen={isDeleteOptionModalOpen}
        onClose={() => setDeleteOptionModalOpen(false)}
        onConfirm={() => {
          if (optionToDelete)
            deleteOptionFromGroup(
              optionToDelete.groupId,
              optionToDelete.optionId
            );
          setDeleteOptionModalOpen(false);
        }}
        title="Delete Option"
        description="Are you sure you want to delete this modifier option?"
        confirmText="Delete"
        variant="destructive"
      />
    </View>
  );
};

export default ModifiersScreen;
