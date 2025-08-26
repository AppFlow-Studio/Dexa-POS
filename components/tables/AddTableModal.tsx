import { SHAPE_OPTIONS, TABLE_SHAPES } from "@/lib/table-shapes"; // Import our new shape data
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

  const tables = useFloorPlanStore((state) => state.tables);

  const handleAddPress = () => {
    if (!name || !selectedShapeId) {
      toast.error("Please enter a name and select a table shape.", {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }
    const nameExists = tables.some(
      (table) => table.name.trim().toLowerCase() === name.trim().toLowerCase()
    );

    if (nameExists) {
      toast.error(`A table named "${name}" already exists`, {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return; // Stop the function
    }

    onAdd({ name, shapeId: selectedShapeId });
    // Reset form for next time
    setName("");
    setSelectedShapeId(SHAPE_OPTIONS[0].id as keyof typeof TABLE_SHAPES);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[550px] bg-white p-6 rounded-2xl">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold">
            Add New Table
          </DialogTitle>
        </DialogHeader>
        <View className="gap-y-4 py-4">
          <View>
            <Text className="font-semibold text-gray-600 mb-2">Table Name</Text>
            <TextInput
              value={name}
              onChangeText={setName}
              placeholder="e.g., T-24 or Patio 1"
              className="p-3 bg-gray-100 rounded-lg text-base border border-gray-200"
            />
          </View>
          <View>
            <Text className="font-semibold text-gray-600 mb-2">
              Select Shape
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              className="-mx-6 px-6"
            >
              <View className="flex-row gap-4">
                {SHAPE_OPTIONS.map(
                  ({ id, label, component: ShapeComponent }) => {
                    const isSelected = selectedShapeId === id;
                    return (
                      <TouchableOpacity
                        key={id}
                        onPress={() =>
                          setSelectedShapeId(id as keyof typeof TABLE_SHAPES)
                        }
                        className={`p-4 border-2 rounded-lg items-center ${isSelected ? "border-primary-400 bg-blue-50" : "border-gray-200 bg-white"}`}
                      >
                        <ShapeComponent color="#4b5563" />
                        <Text
                          className={`mt-2 font-semibold ${isSelected ? "text-primary-400" : "text-gray-600"}`}
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
          <Text className="text-white font-bold">Add Table</Text>
        </TouchableOpacity>
      </DialogContent>
    </Dialog>
  );
};

export default AddTableModal;
