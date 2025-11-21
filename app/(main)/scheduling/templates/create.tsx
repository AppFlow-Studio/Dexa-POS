import { ShiftEditorModal } from "@/components/scheduling/ShiftEditorModal";
import TemplateGrid from "@/components/scheduling/TemplateGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropZoneProvider } from "@/contexts/DropZoneContext";
import { useToast } from "@/contexts/ToastContext";
import { PREDEFINED_TAGS, ScheduleTemplate, TemplateShift } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { addTemplate } from "@/stores/useScheduleTemplateStore";
import { useRouter } from "expo-router";
import { Search } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const CreateTemplateScreen = () => {
  const router = useRouter();
  const { employees } = useEmployeeStore();
  const { show } = useToast();
  const [template, setTemplate] = useState<Omit<ScheduleTemplate, "id">>({
    name: "",
    description: "",
    tags: [],
    shifts: [],
    lastUsed: new Date(),
  });

  const [isShiftEditorOpen, setIsShiftEditorOpen] = useState(false);
  const [selectedShift, setSelectedShift] =
    useState<Partial<TemplateShift> | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const filteredEmployees = useMemo(() => {
    return employees.filter((emp) =>
      emp.fullName.toLowerCase().includes(searchQuery.toLowerCase())
    );
  }, [employees, searchQuery]);

  const handleNameChange = (name: string) => {
    setTemplate((prev) => ({ ...prev, name }));
  };

  const handleDescriptionChange = (description: string) => {
    setTemplate((prev) => ({ ...prev, description }));
  };

  const handleToggleTag = (tag: string) => {
    setTemplate((prev) => {
      const newTags = prev.tags.includes(tag)
        ? prev.tags.filter((t) => t !== tag)
        : [...prev.tags, tag];
      return { ...prev, tags: newTags };
    });
  };

  const handleAddShift = (employeeId: string, dayOfWeek: number) => {
    const employee = employees.find((e) => e.id === employeeId);
    if (!employee) return;
    setSelectedShift({
      tempId: `temp_${Date.now()}`,
      employeeId,
      dayOfWeek,
      role: employee.role,
    });
    setIsShiftEditorOpen(true);
  };

  const handleShiftPress = (shift: TemplateShift) => {
    setSelectedShift(shift);
    setIsShiftEditorOpen(true);
  };

  const handleSaveShift = (savedShift: Partial<TemplateShift>) => {
    setTemplate((prev) => {
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
    if (!template.name.trim()) {
      show({
        title: "Name Required",
        message: "Please enter a name for the template before saving.",
        type: "error",
      });
      return;
    }
    addTemplate(template);
    show({
      title: "Template Created",
      message: `The template "${template.name}" has been successfully created.`,
      type: "success",
    });
    router.back();
  };

  const handleCancel = () => {
    router.back();
  };

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
              <Text className="text-white text-base mb-2">Template Name</Text>
              <Input
                placeholder="e.g., Weekend Rush"
                placeholderTextColor="#9CA3AF"
                value={template.name}
                onChangeText={handleNameChange}
                className="bg-[#303030] border-gray-600 text-white"
              />
            </View>

            <View className="mb-4">
              <Text className="text-white text-base mb-2">Description</Text>
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
              <Text className="text-white text-base mb-2">Tags</Text>
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

            {/* Employee Search Input */}
            <View className="w-full border border-gray-600 rounded-lg p-3 mb-4">
              <View className="flex-row items-center bg-[#212121] border border-gray-600 rounded-lg px-2 w-full">
                <Search size={16} color="#9CA3AF" />
                <TextInput
                  placeholder="Search employees..."
                  placeholderTextColor="#9CA3AF"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  className="p-2 text-white flex-1"
                />
              </View>
            </View>

            {/* TemplateGrid */}
            <DropZoneProvider>
              <TemplateGrid
                shifts={template.shifts}
                employees={filteredEmployees} // Pass filtered employees
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
              <Text className="text-white font-semibold">Save Template</Text>
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

export default CreateTemplateScreen;
