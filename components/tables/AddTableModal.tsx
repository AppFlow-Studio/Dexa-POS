import { SHAPE_OPTIONS, TABLE_SHAPES } from "@/lib/table-shapes";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import React, { useState } from "react";
import {
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

// Define a shape for the data this modal will return
interface NewTableData {
  name: string;
  shapeId: keyof typeof TABLE_SHAPES;
}

interface AddTableModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAdd: (data: NewTableData) => void;
}

const AddTableModal: React.FC<AddTableModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [name, setName] = useState("");
  // State to track the ID of the selected shape
  const [selectedShapeId, setSelectedShapeId] = useState<
    keyof typeof TABLE_SHAPES
  >(SHAPE_OPTIONS[0].id as keyof typeof TABLE_SHAPES);

  const { layouts, activeLayoutId } = useFloorPlanStore();
  const activeLayout = layouts.find((layout) => layout.id === activeLayoutId);
  const tablesInCurrentLayout = activeLayout?.tables || [];

  const handleAddPress = () => {
    if (!name || !selectedShapeId) {
      toast.error("Please enter a name and select a table shape.", {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    const nameExists = tablesInCurrentLayout.some(
      (table) => table.name.trim().toLowerCase() === name.trim().toLowerCase()
    );

    if (nameExists) {
      toast.error(`A table named "${name}" already exists in this room.`, {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    onAdd({ name, shapeId: selectedShapeId });
    setName("");
    setSelectedShapeId(SHAPE_OPTIONS[0].id as keyof typeof TABLE_SHAPES);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[450px] p-4 rounded-2xl bg-[#303030] border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-2xl text-white">
            Add New Table
          </DialogTitle>
        </DialogHeader>
        <View className="gap-y-3 py-3">
          <View>
            <Text className="text-lg text-gray-300 font-medium mb-1.5">
              Table Name
            </Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g., T-24 or Patio 1"
              placeholderTextColor="#9CA3AF"
              className="p-3 bg-[#212121] border border-gray-600 rounded-lg text-lg text-white h-16"
            />
          </View>
          <View>
            <Text className="text-lg text-gray-300 font-medium mb-1.5">
              Select Shape
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="-mx-4 px-4"
            >
              <View className="flex-row gap-3">
                {SHAPE_OPTIONS.map(
                  ({ id, label, component: ShapeComponent }) => {
                    const isSelected = selectedShapeId === id;
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() =>
                          setSelectedShapeId(id as keyof typeof TABLE_SHAPES)
                        }
                        className={`p-4 border-2 rounded-xl items-center ${isSelected ? "border-primary-400 bg-blue-50" : "border-gray-200 bg-white"}`}
                      >
                        <ShapeComponent color="#4b5563" />
                        <Text
                          className={`mt-1.5 font-semibold text-base ${isSelected ? "text-primary-400" : "text-gray-600"}`}
                        >
                          {label}
                        </Text>
                      </TouchableOpacity>
                    );
                  }
                )}
              </View>
            </ScrollView>
          </View>
        </View>
        <TouchableOpacity
          onPress={handleAddPress}
          className="bg-primary-400 py-3 rounded-lg items-center"
        >
          <Text className="text-white text-lg font-bold">Add Table</Text>
        </TouchableOpacity>
      </DialogContent>
    </Dialog>
  );
};

export default AddTableModal;
