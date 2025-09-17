import ScheduleEditor from "@/components/menu/ScheduleEditor";
import { useMenuStore } from "@/stores/useMenuStore";
import { router, useLocalSearchParams } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import React, { useMemo, useState } from "react";
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

  const toggleCategory = (cat: string) => {
    setSelectedCategories((prev) =>
      prev.includes(cat) ? prev.filter((c) => c !== cat) : [...prev, cat]
    );
  };

  const handleSave = async () => {
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
    await new Promise((r) => setTimeout(r, 400));
    router.replace({ pathname: "/menu", params: { tab: "menus" } });
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
      <View className="flex-1 bg-[#212121] items-center justify-center p-6">
        <Text className="text-2xl text-white">Menu not found.</Text>
        <TouchableOpacity
          onPress={() => router.back()}
          className="mt-4 px-6 py-3 bg-[#303030] rounded border border-gray-600"
        >
          <Text className="text-xl text-gray-300">Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-[#212121]">
      <View className="flex-row items-center justify-between p-6 border-b border-gray-700 bg-[#303030]">
        <TouchableOpacity
          onPress={() => router.back()}
          className="flex-row items-center"
        >
          <ArrowLeft size={24} color="#9CA3AF" />
          <Text className="text-2xl text-white font-medium ml-2">Back</Text>
        </TouchableOpacity>
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={handleDelete}
            className="px-6 py-3 rounded-lg border border-red-500 bg-red-900/30"
          >
            <Text className="text-2xl text-red-400">Delete</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            className="px-6 py-3 rounded-lg bg-blue-600"
          >
            <Text className="text-2xl text-white">Save</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView className="flex-1 p-6">
        <Text className="text-3xl font-bold text-white mb-6">Edit Menu</Text>

        <View className="mb-6">
          <Text className="text-2xl font-semibold text-white mb-3">Name</Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-6 py-4 text-2xl text-white"
            value={name}
            onChangeText={setName}
            placeholder="Menu name"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View className="mb-6">
          <Text className="text-2xl font-semibold text-white mb-3">
            Description
          </Text>
          <TextInput
            className="bg-[#303030] border border-gray-600 rounded-lg px-6 py-4 text-2xl text-white"
            value={description}
            onChangeText={setDescription}
            placeholder="Optional description"
            placeholderTextColor="#9CA3AF"
          />
        </View>

        <View className="mb-6">
          <Text className="text-2xl font-semibold text-white mb-3">
            Categories
          </Text>
          <View className="flex-row flex-wrap gap-3">
            {allCategoryNames.map((cat) => {
              const selected = selectedCategories.includes(cat);
              return (
                <TouchableOpacity
                  key={cat}
                  onPress={() => toggleCategory(cat)}
                  className={`px-4 py-3 rounded-lg border ${selected ? "bg-blue-600 border-blue-500" : "bg-[#303030] border-gray-600"}`}
                >
                  <Text
                    className={`text-xl ${selected ? "text-white" : "text-gray-300"}`}
                  >
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
          {/* Expandable selected categories */}
          {selectedCategories.length > 0 && (
            <View className="mt-4 gap-4">
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
                        className="flex-row items-center justify-between p-4"
                      >
                        <View className="flex-row items-center gap-3">
                          <Text className="text-2xl text-white font-medium">
                            {cat}
                          </Text>
                          <View className="bg-blue-900/30 border border-blue-500 px-3 py-2 rounded-full">
                            <Text className="text-xl text-blue-400">
                              {items.length} items
                            </Text>
                          </View>
                        </View>
                        <Text className="text-xl text-gray-300">
                          {isExpanded ? "Hide" : "Show"}
                        </Text>
                      </TouchableOpacity>
                      {isExpanded && (
                        <View className="border-t border-gray-700 p-4 gap-3">
                          {items.length === 0 ? (
                            <Text className="text-xl text-gray-400">
                              No items in this category.
                            </Text>
                          ) : (
                            <View className="gap-3 flex flex-row flex-wrap">
                              {items.map((item) => (
                                <View
                                  key={item.id}
                                  className="flex-row items-center justify-between bg-[#212121] border border-gray-700 rounded-lg px-4 py-3 mr-2 mb-2"
                                >
                                  <Text className="text-xl text-white">
                                    {item.name}
                                  </Text>
                                  <Text className="text-xl text-gray-300 ml-3">
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

        <View className="mb-6">
          <View className="flex-row items-center justify-between mb-3">
            <Text className="text-2xl font-semibold text-white">Schedules</Text>
            <TouchableOpacity
              onPress={() => setIsActive(!isActive)}
              className={`px-4 py-3 rounded-lg border ${isActive ? "bg-green-900/30 border-green-500" : "bg-red-900/30 border-red-500"}`}
            >
              <Text
                className={`text-xl ${isActive ? "text-green-400" : "text-red-400"}`}
              >
                {isActive ? "Master: Enabled" : "Master: Disabled"}
              </Text>
            </TouchableOpacity>
          </View>
          <ScheduleEditor value={schedules} onChange={setSchedules} />
        </View>
      </ScrollView>
    </View>
  );
};

export default EditMenuScreen;
