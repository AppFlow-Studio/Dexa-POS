import ScheduleEditor from "@/components/menu/ScheduleEditor";
import ScheduleRuleModal from "@/components/menu/ScheduleRuleModal";
import UnsavedChangesDialog from "@/components/ui/UnsavedChangesDialog";
import { useUnsavedChanges } from "@/hooks/useUnsavedChanges";
import { Schedule } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Alert,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const EditMenuScreen: React.FC = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { menus, categories, updateMenu, deleteMenu, getItemsInCategory } =
    useMenuStore();

  const existing = useMemo(() => menus.find((m) => m.id === id), [id, menus]);
  const allCategoryNames = categories
    .map((c) => c.name)
    .sort((a, b) => a.localeCompare(b));

  const [name, setName] = useState(existing?.name || "");
  const [description, setDescription] = useState(existing?.description || "");
  const [isActive, setIsActive] = useState(existing?.isActive ?? true);
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    existing?.categories || []
  );
  const [schedules, setSchedules] = useState(existing?.schedules ?? []);
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});
  // --- State for the new modal ---
  const [isScheduleModalOpen, setIsScheduleModalOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<Omit<
    Schedule,
    "id" | "isActive"
  > | null>(null);
  const [editingRuleIndex, setEditingRuleIndex] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const hasSavedRef = useRef(false);

  const { isDialogVisible, handleCancel, handleDiscard } = useUnsavedChanges(
    hasChanges && !hasSavedRef.current
  );

  useEffect(() => {
    if (!existing) return;
    const nameChanged = existing.name !== name;
    const descChanged = existing.description !== description;
    const activeChanged = existing.isActive !== isActive;
    const catsChanged =
      JSON.stringify(existing.categories.sort()) !==
      JSON.stringify(selectedCategories.sort());
    const schedulesChanged =
      JSON.stringify(existing.schedules) !== JSON.stringify(schedules);

    setHasChanges(
      nameChanged ||
        descChanged ||
        activeChanged ||
        catsChanged ||
        schedulesChanged
    );
  }, [name, description, isActive, selectedCategories, schedules, existing]);

  const handleAddPress = () => {
    setEditingRule(null);
    setEditingRuleIndex(null);
    setIsScheduleModalOpen(true);
  };

  const handleEditPress = (rule: Schedule, index: number) => {
    setEditingRule(rule);
    setEditingRuleIndex(index);
    setIsScheduleModalOpen(true);
  };

  const handleSaveSchedule = (ruleData: Omit<Schedule, "id" | "isActive">) => {
    if (editingRuleIndex !== null) {
      // Editing existing rule
      const updatedSchedules = [...schedules];
      updatedSchedules[editingRuleIndex] = {
        ...schedules[editingRuleIndex],
        ...ruleData,
      };
      setSchedules(updatedSchedules);
    } else {
      // Adding new rule
      const newRule: Schedule = {
        id: `sch_${Date.now()}`,
        isActive: true,
        ...ruleData,
      };
      setSchedules([...schedules, newRule]);
    }
  };

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleSave = () => {
    if (!existing) return;
    if (!name.trim()) {
      Alert.alert("Validation", "Name is required");
      return;
    }

    updateMenu(existing.id, {
      name: name.trim(),
      description: description.trim() || undefined,
      isActive,
      categories: selectedCategories,
      schedules,
    });
    hasSavedRef.current = true;

    // Use a timeout to ensure state propagation before navigation
    setTimeout(() => {
      if (router.canGoBack()) {
        router.replace({ pathname: "/menu", params: { tab: "menus" } });
      }
    }, 100);
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
      <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center"
        >
          <ArrowLeft size={20} color="#9CA3AF" />
          <Text className="text-xl text-white font-medium ml-1.5">Back</Text>
        </TouchableOpacity>
        <View className="flex-row gap-2">
          <TouchableOpacity
            onPress={handleDelete}
            className="px-4 py-2 rounded-lg border border-red-500 bg-red-900/30"
          >
            <Text className="text-xl text-red-400">Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            className="px-4 py-2 rounded-lg bg-blue-600"
          >
            <Text className="text-xl text-white">Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 p-4">
        <Text className="text-2xl font-bold text-white mb-4">Edit Menu</Text>

        <View className="mb-4">
          <Text className="text-xl font-semibold text-white mb-2">Name</Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-lg text-white h-16"
            value={name}
            onChangeText={setName}
            placeholder="Menu name"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View className="mb-4">
          <Text className="text-xl font-semibold text-white mb-2">
            Description
          </Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-lg text-white h-16"
            value={description}
            onChangeText={setDescription}
            placeholder="Optional description"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View className="mb-4">
          <Text className="text-xl font-semibold text-white mb-2">
            Categories
          </Text>
          <View className="flex-row flex-wrap gap-2">
            {allCategoryNames.map((cat) => {
              const selected = selectedCategories.includes(cat);
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => toggleCategory(cat)}
                  className={`px-3 py-2 rounded-lg border ${
                    selected
                      ? "bg-blue-600 border-blue-500"
                      : "bg-[#303030] border-gray-600"
                  }`}
                >
                  <Text
                    className={`text-lg ${
                      selected ? "text-white" : "text-gray-300"
                    }`}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {selectedCategories.length > 0 && (
            <View className="mt-3 gap-3">
              {selectedCategories
                .sort((a, b) => a.localeCompare(b))
                .map((cat) => {
                  const isExpanded = !!expandedCategories[cat];
                  const items = getItemsInCategory(cat);
                  return (
                    <View
                      key={cat}
                      className="bg-[#303030] rounded-lg border border-gray-700"
                    >
                      <TouchableOpacity
                        onPress={() =>
                          setExpandedCategories((prev) => ({
                            ...prev,
                            [cat]: !isExpanded,
                          }))
                        }
                        className="flex-row items-center justify-between p-3"
                      >
                        <View className="flex-row items-center gap-2">
                          <Text className="text-xl text-white font-medium">
                            {cat}
                          </Text>
                          <View className="bg-blue-900/30 border border-blue-500 px-2.5 py-1.5 rounded-full">
                            <Text className="text-lg text-blue-400">
                              {items.length} items
                            </Text>
                          </View>
                        </View>
                        <Text className="text-lg text-gray-300">
                          {isExpanded ? "Hide" : "Show"}
                        </Text>
                      </TouchableOpacity>
                      {isExpanded && (
                        <View className="border-t border-gray-700 p-3 gap-2">
                          {items.length === 0 ? (
                            <Text className="text-lg text-gray-400">
                              No items in this category.
                            </Text>
                          ) : (
                            <View className="gap-2 flex flex-row flex-wrap">
                              {items.map((item) => (
                                <View
                                  key={item.id}
                                  className="flex-row items-center justify-between bg-[#212121] border border-gray-700 rounded-lg px-3 py-2"
                                >
                                  <Text className="text-lg text-white">
                                    {item.name}
                                  </Text>
                                  <Text className="text-lg text-gray-300 ml-2">
                                    ${item.price.toFixed(2)}
                                  </Text>
                                </View>
                              ))}
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })}
            </View>
          )}
        </View>

        <View className="mb-4">
          <View className="flex-row items-center justify-between mb-2">
            <Text className="text-xl font-semibold text-white">Schedules</Text>
            <TouchableOpacity
              onPress={() => setIsActive(!isActive)}
              className={`px-3 py-2 rounded-lg border ${
                isActive
                  ? "bg-green-900/30 border-green-500"
                  : "bg-red-900/30 border-red-500"
              }`}
            >
              <Text
                className={`text-lg ${
                  isActive ? "text-green-400" : "text-red-400"
                }`}
              >
                {isActive ? "Master: On" : "Master: Off"}
              </Text>
            </TouchableOpacity>
          </View>
          <ScheduleEditor
            value={schedules}
            onChange={setSchedules}
            onAddPress={handleAddPress}
            onEditPress={handleEditPress}
          />
        </View>
      </ScrollView>

      <ScheduleRuleModal
        isOpen={isScheduleModalOpen}
        onClose={() => setIsScheduleModalOpen(false)}
        onSave={handleSaveSchedule}
        initialData={editingRule}
        existingSchedules={schedules}
      />
      <UnsavedChangesDialog
        isOpen={isDialogVisible}
        onCancel={handleCancel}
        onDiscard={handleDiscard}
      />
    </View>
  );
};

export default EditMenuScreen;
