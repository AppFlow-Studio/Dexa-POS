import { ShiftEditorModal } from "@/components/scheduling/ShiftEditorModal";
import TemplateGrid from "@/components/scheduling/TemplateGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DropZoneProvider } from "@/contexts/DropZoneContext";
import { PREDEFINED_TAGS, ScheduleTemplate, TemplateShift } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import {
  updateTemplate,
  useScheduleTemplateStore,
} from "@/stores/useScheduleTemplateStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const EditTemplateScreen = () => {
  const router = useRouter();
  const { id } = useLocalSearchParams();
  const { templates } = useScheduleTemplateStore();
  const { employees } = useEmployeeStore();
  const [template, setTemplate] = useState<ScheduleTemplate | null>(null);

  const [isShiftEditorOpen, setIsShiftEditorOpen] = useState(false);
  const [selectedShift, setSelectedShift] =
    useState<Partial<TemplateShift> | null>(null);

  useEffect(() => {
    if (id) {
      const foundTemplate = templates.find((t) => t.id === id);
      if (foundTemplate) {
        setTemplate(foundTemplate);
      } else {
        router.back();
        toast.error("Template not found.", { position: ToastPosition.BOTTOM });
      }
    }
  }, [id, templates, router]);

  const handleNameChange = (name: string) => {
    if (template) setTemplate((prev) => (prev ? { ...prev, name } : null));
  };

  const handleDescriptionChange = (description: string) => {
    if (template)
      setTemplate((prev) => (prev ? { ...prev, description } : null));
  };

  const handleToggleTag = (tag: string) => {
    if (template) {
      setTemplate((prev) => {
        if (!prev) return null;
        const newTags = prev.tags.includes(tag)
          ? prev.tags.filter((t) => t !== tag)
          : [...prev.tags, tag];
        return { ...prev, tags: newTags };
      });
    }
  };

  const handleAddShift = (employeeId: string, dayOfWeek: number) => {
    const employee = employees.find((e) => e.id === employeeId);
    if (!employee) return;
    setSelectedShift({ employeeId, dayOfWeek, role: employee.role });
    setIsShiftEditorOpen(true);
  };

  const handleShiftPress = (shift: TemplateShift) => {
    setSelectedShift(shift);
    setIsShiftEditorOpen(true);
  };

  const handleSaveShift = (savedShift: Partial<TemplateShift>) => {
    if (!template) return;
    setTemplate((prev) => {
      if (!prev) return null;
      const existingIndex = prev.shifts.findIndex(
        (s) => s.tempId === savedShift.tempId
      );
      let newShifts = [...prev.shifts];
      if (existingIndex > -1) {
        newShifts[existingIndex] = savedShift as TemplateShift;
      } else {
        newShifts.push(savedShift as TemplateShift);
      }
      return { ...prev, shifts: newShifts };
    });
    setIsShiftEditorOpen(false);
    setSelectedShift(null);
  };

  const handleSave = () => {
    if (!template) return;
    if (!template.name.trim()) {
      toast.error("Template name cannot be empty.", {
        position: ToastPosition.BOTTOM,
      });
      return;
    }
    updateTemplate(template.id, template);
    toast.success("Template updated successfully!", {
      position: ToastPosition.BOTTOM,
    });
    router.back();
  };

  const handleCancel = () => {
    router.back();
  };

  if (!template) {
    return (
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "#212121",
        }}
      >
        <Text style={{ color: "white", fontSize: 24 }}>
          Loading Template...
        </Text>
      </View>
    );
  }

  return (
    <>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <View className="flex-1 bg-[#212121]">
          {/* Form Area */}
          <View className="flex-1 p-4">
            <View className="mb-4">
              <Label className="text-white text-base mb-2">Template Name</Label>
              <Input
                placeholder="e.g., Weekend Rush"
                placeholderTextColor="#9CA3AF"
                value={template.name}
                onChangeText={handleNameChange}
                className="bg-[#303030] border-gray-600 text-white"
              />
            </View>

            <View className="mb-4">
              <Label className="text-white text-base mb-2">Description</Label>
              <TextInput
                placeholder="e.g., Full staffing for peak hours on weekends"
                placeholderTextColor="#9CA3AF"
                value={template.description}
                onChangeText={handleDescriptionChange}
                multiline
                className="bg-[#303030] border border-gray-600 rounded-lg p-3 text-white min-h-[80px]"
              />
            </View>

            {/* Tags input */}
            <View className="mb-4">
              <Label className="text-white text-base mb-2">Tags</Label>
              <View className="flex-row flex-wrap gap-2">
                {PREDEFINED_TAGS.map((tag) => (
                  <TouchableOpacity
                    key={tag}
                    onPress={() => handleToggleTag(tag)}
                    className={`px-3 py-1.5 rounded-full ${
                      template.tags.includes(tag)
                        ? "bg-blue-500"
                        : "bg-[#303030] border border-gray-600"
                    }`}
                  >
                    <Text
                      className={`${
                        template.tags.includes(tag)
                          ? "text-white"
                          : "text-gray-400"
                      }`}
                    >
                      {tag}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* TemplateGrid */}
            <DropZoneProvider>
              <TemplateGrid
                shifts={template.shifts}
                employees={employees}
                onShiftPress={handleShiftPress}
                onAddShift={handleAddShift}
              />
            </DropZoneProvider>
          </View>

          {/* Footer with Save/Cancel Buttons */}
          <View className="flex-row justify-end p-4 border-t border-gray-700 bg-[#303030]">
            <Button
              variant="outline"
              onPress={handleCancel}
              className="mr-2 rounded-lg"
            >
              <Text className="text-white">Cancel</Text>
            </Button>
            <Button
              onPress={handleSave}
              variant="secondary"
              className="bg-blue-600 rounded-lg"
            >
              <Text className="text-white font-semibold">Save Changes</Text>
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>
      <ShiftEditorModal
        open={isShiftEditorOpen}
        onOpenChange={setIsShiftEditorOpen}
        shift={selectedShift}
        onSave={handleSaveShift}
        isTemplateMode={true}
        dayOfWeek={selectedShift?.dayOfWeek}
      />
    </>
  );
};

export default EditTemplateScreen;
