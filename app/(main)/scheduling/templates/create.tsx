import { DragOverlayTemplate } from "@/components/scheduling/DragOverlayTemplate";
import { ShiftActionModal } from "@/components/scheduling/ShiftActionModal";
import { ShiftEditorModal } from "@/components/scheduling/ShiftEditorModal";
import TemplateEditorHeader from "@/components/scheduling/TemplateEditorHeader";
import TemplateGrid from "@/components/scheduling/TemplateGrid";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DropZoneProvider } from "@/contexts/DropZoneContext";
import { useToast } from "@/contexts/ToastContext";
import { colors } from "@/lib/theme";
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
import uuid from "react-native-uuid"; // Import uuid to generate id for new template

const CreateTemplateScreen = () => {
  const router = useRouter();
  const { employees } = useEmployeeStore();
  const { show } = useToast();
  const [template, setTemplate] = useState<ScheduleTemplate>({
    id: uuid.v4() as string, // Generate ID here for passing to TemplateGrid
    name: "",
    description: "",
    tags: [],
    shifts: [],
    lastUsed: new Date(),
  });

  const [isShiftEditorOpen, setIsShiftEditorOpen] = useState(false);
  const [isActionModalOpen, setIsActionModalOpen] = useState(false);
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
      tempId: uuid.v4() as string, // Ensure unique tempId for new shifts
      employeeId,
      dayOfWeek,
    });
    setIsShiftEditorOpen(true);
  };

  const handleShiftPress = (shift: TemplateShift) => {
    setSelectedShift(shift);
    setIsActionModalOpen(true);
  };

  const handleEditShift = () => {
    setIsActionModalOpen(false);
    setIsShiftEditorOpen(true);
  };

  const handleDeleteShift = () => {
    if (!selectedShift?.tempId) return;
    setTemplate((prev) => ({
      ...prev,
      shifts: prev.shifts.filter((s) => s.tempId !== selectedShift.tempId),
    }));
    setIsActionModalOpen(false);
    setSelectedShift(null);
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

  const handleShiftDrop = (
    draggedShift: TemplateShift,
    newEmployeeId: string,
    newDayOfWeek: number
  ) => {
    setTemplate((prev) => {
      const updatedShifts = prev.shifts.map((s) =>
        s.tempId === draggedShift.tempId
          ? { ...s, employeeId: newEmployeeId, dayOfWeek: newDayOfWeek }
          : s
      );
      return { ...prev, shifts: updatedShifts };
    });
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
    // Now addTemplate expects a full ScheduleTemplate, but we already have the id generated
    addTemplate(template); // No cast needed
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
    <DropZoneProvider>
      <DragOverlayTemplate />
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        style={{ flex: 1 }}
        keyboardVerticalOffset={Platform.OS === "ios" ? 60 : 0}
      >
        <View className="flex-1 bg-screen">
          {/* Form Area */}
          <View className="flex-1 p-4">
            <TemplateEditorHeader template={template} defaultOpen={true}>
              <View className="mb-4">
                <Text className="text-white text-base mb-2">Template Name</Text>
                <Input
                  placeholder="e.g., Weekend Rush"
                  placeholderTextColor={colors.label}
                  value={template.name}
                  onChangeText={handleNameChange}
                  className="bg-screen border-gray-600 text-white"
                />
              </View>

              <View className="mb-4">
                <Text className="text-white text-base mb-2">Description</Text>
                <TextInput
                  placeholder="e.g., Full staffing for peak hours on weekends"
                  placeholderTextColor={colors.label}
                  value={template.description}
                  onChangeText={handleDescriptionChange}
                  multiline
                  className="bg-screen border border-gray-600 rounded-lg p-3 text-white min-h-[80px]"
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
                          : "bg-gray-700"
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
              <View className="w-full border border-gray-600 rounded-lg p-3">
                <View className="flex-row items-center bg-screen border border-gray-600 rounded-lg px-2 w-full">
                  <Search size={16} color={colors.label} />
                  <TextInput
                    placeholder="Search employees..."
                    placeholderTextColor={colors.label}
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    className="p-2 text-white flex-1"
                  />
                </View>
              </View>
            </TemplateEditorHeader>

            {/* Employee Search Input */}
            <View className="w-full border border-gray-600 rounded-lg p-3 mb-4">
              <View className="flex-row items-center bg-screen border border-gray-600 rounded-lg px-2 w-full">
                <Search size={16} color={colors.label} />
                <TextInput
                  placeholder="Search employees..."
                  placeholderTextColor={colors.label}
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  className="p-2 text-white flex-1"
                />
              </View>
            </View>

            {/* TemplateGrid */}

            <TemplateGrid
              shifts={template.shifts}
              employees={filteredEmployees} // Pass filtered employees
              onShiftPress={handleShiftPress}
              onAddShift={handleAddShift}
              onShiftDrop={handleShiftDrop}
            />
          </View>

          {/* Footer with Save/Cancel Buttons */}
          <View className="flex-row justify-end p-4 border-t border-gray-700 bg-panel">
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
      {selectedShift && (
        <ShiftActionModal
          open={isActionModalOpen}
          onOpenChange={setIsActionModalOpen}
          shift={selectedShift}
          onEdit={handleEditShift}
          onDelete={handleDeleteShift}
        />
      )}
    </DropZoneProvider>
  );
};

export default CreateTemplateScreen;
