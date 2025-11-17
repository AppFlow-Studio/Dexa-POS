import TemplateListItem from "@/components/scheduling/TemplateListItem";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { ScheduleTemplate } from "@/lib/types";
import { useScheduleTemplateStore } from "@/stores/useScheduleTemplateStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { useRouter } from "expo-router";
import { Calendar, CheckCircle2, Plus, X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";

const TemplateLibraryScreen = () => {
  const router = useRouter();
  const { templates, activeTemplateIds, actions } = useScheduleTemplateStore();
  const [searchQuery, setSearchQuery] = useState("");
  const [isDeleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] =
    useState<ScheduleTemplate | null>(null);
  const { width } = useWindowDimensions();

  const [isSelectionMode, setSelectionMode] = useState(false);
  const [selectedActiveIds, setSelectedActiveIds] = useState<string[]>([]);

  useEffect(() => {
    setSelectedActiveIds(activeTemplateIds);
  }, [activeTemplateIds]);

  const filteredTemplates = useMemo(() => {
    if (!searchQuery) {
      return templates;
    }
    return templates.filter(
      (template) =>
        template.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (template.tags &&
          template.tags.some((tag) =>
            tag.toLowerCase().includes(searchQuery.toLowerCase())
          ))
    );
  }, [templates, searchQuery]);

  const handleEdit = (id: string) => {
    router.push(`/(main)/scheduling/templates/${id}`);
  };

  const handleDelete = (id: string) => {
    const template = templates.find((t) => t.id === id);
    if (template) {
      setSelectedTemplate(template);
      setDeleteConfirmOpen(true);
    }
  };

  const handleConfirmDelete = () => {
    if (selectedTemplate) {
      actions.deleteTemplate(selectedTemplate.id);
      toast.success(`Template "${selectedTemplate.name}" deleted.`, {
        position: ToastPosition.BOTTOM,
      });
    }
    setDeleteConfirmOpen(false);
    setSelectedTemplate(null);
  };

  const handleDuplicate = (id: string) => {
    actions.duplicateTemplate(id);
    toast.success("Template duplicated.", { position: ToastPosition.BOTTOM });
  };

  const handleToggleSelection = (id: string) => {
    setSelectedActiveIds((prev) => {
      if (prev.includes(id)) {
        return prev.filter((i) => i !== id);
      }
      if (prev.length < 3) {
        return [...prev, id];
      }
      toast.error("You can only select up to 3 active templates.", {
        position: ToastPosition.BOTTOM,
      });
      return prev;
    });
  };

  const handleSaveSelection = () => {
    actions.setActiveTemplateIds(selectedActiveIds);
    setSelectionMode(false);
    toast.success("Active templates updated.", {
      position: ToastPosition.BOTTOM,
    });
  };

  const handleCancelSelection = () => {
    setSelectedActiveIds(activeTemplateIds);
    setSelectionMode(false);
  };

  const numColumns = width > 1024 ? 3 : width > 768 ? 2 : 1;
  const activeTemplateCount = activeTemplateIds.length;

  return (
    <View className="flex-1 p-8">
      {/* Header */}
      <View className="flex-row items-start justify-between mb-8 z-10">
        <View>
          <Text className="text-white text-lg">
            {isSelectionMode
              ? `Select up to 3 templates for schedule making (${selectedActiveIds.length}/3 selected)`
              : `Save time with reusable shift patterns • ${activeTemplateCount} active for scheduling`}
          </Text>
        </View>
        {!isSelectionMode && (
          <View className="flex-row gap-3">
            <TouchableOpacity
              onPress={() => setSelectionMode(true)}
              className="bg-[#374151] flex-row items-center px-6 py-3 rounded-xl gap-4"
            >
              <CheckCircle2 className="w-5 h-5 mr-2" color={"#ffffff"} />
              <Text className="text-white font-semibold">
                Set Active Templates
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => router.push("/(main)/scheduling/templates/create")}
              className="bg-blue-600 flex-row items-center px-6 py-3 rounded-xl gap-4"
            >
              <Plus className="w-5 h-5 mr-2" color={"#ffffff"} />
              <Text className="text-white font-semibold">Create Template</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Selection Mode Banner */}
      {isSelectionMode && (
        <View className="mb-6 bg-zinc-800 rounded-xl p-4 border border-blue-600 flex-row items-center justify-between">
          <View className="flex-row items-center gap-3">
            <CheckCircle2 className="w-5 h-5 text-blue-500" color={"#3b82f6"} />
            <View>
              <Text className="text-white font-semibold">
                Select Templates for Schedule Making
              </Text>
              <Text className="text-gray-400 text-sm">
                Choose up to 3 templates that will be available when creating
                schedules
              </Text>
            </View>
          </View>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={handleCancelSelection}
              className="bg-zinc-700 hover:bg-zinc-600 flex-row items-center px-4 py-2 rounded-lg gap-2"
            >
              <X className="w-4 h-4 text-white mr-2" color={"#ffffff"} />
              <Text className="text-white font-medium">Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSaveSelection}
              disabled={selectedActiveIds.length === 0}
              className="bg-blue-600 hover:bg-blue-500 flex-row items-center px-4 py-2 rounded-lg disabled:opacity-50 gap-2"
            >
              <CheckCircle2
                className="w-4 h-4 text-white mr-2"
                color={"#ffffff"}
              />
              <Text className="text-white font-medium">
                Save Selection ({selectedActiveIds.length})
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Grid */}
      {filteredTemplates.length > 0 ? (
        <FlatList
          data={filteredTemplates}
          key={numColumns}
          numColumns={numColumns}
          keyExtractor={(item) => item.id}
          contentContainerClassName="gap-6"
          columnWrapperStyle={{ gap: 6 }}
          renderItem={({ item }) => (
            <View style={{ flex: 1 / numColumns }}>
              <TemplateListItem
                template={item}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onDuplicate={handleDuplicate}
                isSelectionMode={isSelectionMode}
                isSelected={selectedActiveIds.includes(item.id)}
                onSelect={handleToggleSelection}
              />
            </View>
          )}
        />
      ) : (
        <View className="flex-1 items-center justify-center py-20">
          <Calendar
            className="w-20 h-20 text-[#374151] mb-6"
            height={80}
            width={80}
            color={"#374151"}
          />
          <Text className="text-white text-2xl font-semibold mb-2">
            No templates yet
          </Text>
          <Text className="text-zinc-400 mb-6 text-center max-w-md">
            Create your first template to save time on scheduling
          </Text>
          <TouchableOpacity
            onPress={() => router.push("/(main)/scheduling/templates/create")}
            className="bg-blue-600 hover:bg-blue-500 flex-row items-center px-6 py-3 rounded-xl gap-2"
          >
            <Plus className="w-5 h-5 text-white mr-2" color={"#ffffff"} />
            <Text className="text-white font-semibold">Create Template</Text>
          </TouchableOpacity>
        </View>
      )}

      <ConfirmationModal
        isOpen={isDeleteConfirmOpen}
        onClose={() => setDeleteConfirmOpen(false)}
        onConfirm={handleConfirmDelete}
        title="Delete Template"
        description={`Are you sure you want to delete the "${selectedTemplate?.name}" template? This action cannot be undone.`}
        confirmText="Delete"
        variant="destructive"
      />
    </View>
  );
};

export default TemplateLibraryScreen;
