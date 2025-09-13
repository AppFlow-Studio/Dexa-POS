import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ModifierGroup } from "@/lib/types";
import React, { useEffect, useState } from "react";
import { Switch, Text, TextInput, TouchableOpacity, View } from "react-native";

const GroupEditorModal = ({
  isOpen,
  onClose,
  onSave,
  initialData,
}: {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Omit<ModifierGroup, "id" | "options">) => void;
  initialData?: ModifierGroup | null;
}) => {
  const [name, setName] = useState("");
  const [isEnabled, setIsEnabled] = useState(true);
  const [minSelections, setMinSelections] = useState("0");
  const [maxSelections, setMaxSelections] = useState("1");

  useEffect(() => {
    if (initialData) {
      setName(initialData.name);
      setIsEnabled(initialData.isEnabled);
      setMinSelections(initialData.minSelections.toString());
      setMaxSelections(initialData.maxSelections.toString());
    } else {
      setName("");
      setIsEnabled(true);
      setMinSelections("0");
      setMaxSelections("1");
    }
  }, [initialData, isOpen]);

  const handleSave = () => {
    onSave({
      name,
      isEnabled,
      minSelections: parseInt(minSelections) || 0,
      maxSelections: parseInt(maxSelections) || 1,
    });
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-lg bg-white">
        <DialogHeader>
          <DialogTitle>
            {initialData ? "Edit" : "Create"} Modifier Group
          </DialogTitle>
        </DialogHeader>
        <View className="space-y-4 py-4">
          <View>
            <Text className="font-semibold mb-2">Group Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              className="p-3 bg-gray-100 rounded-lg"
            />
          </View>
          <View className="flex-row justify-between items-center">
            <Text className="font-semibold">Enable/Disable</Text>
            <Switch value={isEnabled} onValueChange={setIsEnabled} />
          </View>
          <View className="flex-row gap-4">
            <View className="flex-1">
              <Text className="font-semibold mb-2">Min Selections</Text>
              <TextInput
                value={minSelections}
                onChangeText={setMinSelections}
                keyboardType="numeric"
                className="p-3 bg-gray-100 rounded-lg"
              />
            </View>
            <View className="flex-1">
              <Text className="font-semibold mb-2">Max Selections</Text>
              <TextInput
                value={maxSelections}
                onChangeText={setMaxSelections}
                keyboardType="numeric"
                className="p-3 bg-gray-100 rounded-lg"
              />
            </View>
          </View>
        </View>
        <DialogFooter>
          <TouchableOpacity
            onPress={onClose}
            className="px-6 py-3 border rounded-lg"
          >
            <Text>Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleSave}
            className="px-8 py-3 bg-primary-400 rounded-lg"
          >
            <Text className="text-white">Save</Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default GroupEditorModal;
