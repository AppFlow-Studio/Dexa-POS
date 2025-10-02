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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

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

// A styled sub-component for the shape selection buttons, matching the new image design
const ShapeButton = ({
  id,
  label,
  ShapeComponent,
  isSelected,
  onPress,
}: {
  id: string;
  label: string;
  ShapeComponent: React.ComponentType<any>;
  isSelected: boolean;
  onPress: () => void;
}) => (
  <TouchableOpacity
    key={id}
    onPress={onPress}
    className={`p-3 border-2 rounded-xl items-center justify-center w-[250px] h-[130px] ${isSelected
      ? "border-blue-500 bg-blue-500/10"
      : "border-gray-700 bg-[#212121]"
      }`}
  >
    <ShapeComponent color={isSelected ? "#3b82f6" : "#9CA3AF"} height={60} />
    <Text
      className={`mt-2 font-semibold text-sm text-center ${isSelected ? "text-blue-400" : "text-gray-400"
        }`}
      numberOfLines={1}
    >
      {label}
    </Text>
  </TouchableOpacity>
);

export const AddTableModal: React.FC<AddTableModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const [name, setName] = useState("");
  const [selectedShapeId, setSelectedShapeId] = useState<
    keyof typeof TABLE_SHAPES
  >(SHAPE_OPTIONS[0].id as keyof typeof TABLE_SHAPES);

  const { layouts, activeLayoutId } = useFloorPlanStore();
  const activeLayout = layouts.find((layout) => layout.id === activeLayoutId);
  const tablesInCurrentLayout = activeLayout?.tables || [];

  const handleAddPress = () => {
    if (!name || !selectedShapeId) {
      toast.error("Please enter a name and select a shape.", {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    const nameExists = tablesInCurrentLayout.some(
      (table) => table.name.trim().toLowerCase() === name.trim().toLowerCase()
    );

    if (nameExists) {
      toast.error(`An object named "${name}" already exists in this layout.`, {
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
      <DialogContent className="w-[620px] p-8 rounded-2xl bg-[#2a2a2a] border border-gray-700">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold text-white">
            Add New Object
          </DialogTitle>
          <DialogDescription className="text-base text-gray-400 mt-1">
            Enter a name and choose a shape to add to the floor plan.
          </DialogDescription>
        </DialogHeader>

        <View className="gap-y-6 py-4">
          <Text className="text-base font-medium text-gray-300 mb-2">
            Object Name
          </Text>
          <View className="gap-y-3 py-3">
            <View>
              <Text className="text-lg text-gray-300 font-medium mb-1.5">
                Table Name
              </Text>
              <TextInput
                value={name}
                onChangeText={setName}
                placeholder="e.g., T-24 or Main Bar"
                placeholderTextColor="#6B7280"
                className="p-4 bg-[#1e1e1e] border border-gray-600 rounded-lg text-lg text-white h-14"

              />
            </View>

            {/* Shape Selection Section with Vertical Scroll */}
            <View>
              <Text className="text-base font-medium text-gray-300 mb-2">
                Select Shape
              </Text>
              <ScrollView style={{ maxHeight: 290 }}>
                <View className="flex-row flex-wrap gap-4 justify-center">
                  {SHAPE_OPTIONS.map(
                    ({ id, label, component: ShapeComponent }) => (
                      <ShapeButton
                        key={id}
                        id={id}
                        label={label}
                        ShapeComponent={ShapeComponent}
                        isSelected={selectedShapeId === id}
                        onPress={() =>
                          setSelectedShapeId(id as keyof typeof TABLE_SHAPES)
                        }
                      />
                    )
                  )}
                </View>
              </ScrollView>
            </View>
          </View>
        </View>

        <DialogFooter className="flex-row gap-4 pt-4 border-t border-gray-700">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-3 bg-gray-700 rounded-lg items-center"
          >
            <Text className="text-base font-bold text-gray-300">Cancel</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleAddPress}
            className="flex-1 bg-blue-600 py-3 rounded-lg items-center"
          >
            <Text className="text-white text-base font-bold">Add Object</Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default AddTableModal;
