import { TABLE_SHAPES } from "@/lib/table-shapes";
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

interface QuickSetupPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onAddMultiple: (
    items: { shapeId: keyof typeof TABLE_SHAPES; quantity: number }[]
  ) => void;
}

// Restyled ShapeInputRow to match the new design
const ShapeInputRow = ({
  shape,
  onQuantityChange,
}: {
  shape: (typeof TABLE_SHAPES)[keyof typeof TABLE_SHAPES] & { id: string };
  onQuantityChange: (shapeId: string, quantity: number) => void;
}) => {
  const [quantity, setQuantity] = useState("0");

  const handleTextChange = (text: string) => {
    const num = parseInt(text, 10);
    if (text === "" || (num >= 0 && num <= 99)) {
      setQuantity(text);
      onQuantityChange(shape.id, text === "" ? 0 : num);
    }
  };

  return (
    <View className="flex-row items-center justify-between p-4 bg-[#3c3c3c] rounded-lg border border-gray-600">
      <View className="flex-row items-center gap-5 flex-1">
        <View className="w-20 items-center justify-center">
          <shape.component color="#d4d4d4" height={28} />
        </View>
        <Text className="text-gray-200 text-lg font-medium">{shape.label}</Text>
      </View>
      <TextInput
        value={quantity}
        onChangeText={handleTextChange}
        keyboardType="number-pad"
        maxLength={2}
        className="w-24 h-12 bg-[#2a2a2a] border border-gray-500 rounded-md text-white text-lg text-center"
      />
    </View>
  );
};

const QuickSetupPanel: React.FC<QuickSetupPanelProps> = ({
  isOpen,
  onClose,
  onAddMultiple,
}) => {
  const [quantities, setQuantities] = useState<Record<string, number>>({});

  const handleQuantityChange = (shapeId: string, quantity: number) => {
    setQuantities((prev) => ({ ...prev, [shapeId]: quantity }));
  };

  const handleApply = () => {
    const itemsToAdd = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([shapeId, quantity]) => ({
        shapeId: shapeId as keyof typeof TABLE_SHAPES,
        quantity,
      }));

    if (itemsToAdd.length > 0) {
      onAddMultiple(itemsToAdd);
    }
    onClose();
  };

  const tableShapes = Object.entries(TABLE_SHAPES)
    .filter(([, data]) => data.type === "table")
    .map(([id, data]) => ({ id, ...data }));

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="w-[580px] bg-[#2a2a2a] rounded-xl border border-gray-700 shadow-2xl p-0">
        <DialogHeader className="p-6">
          <DialogTitle className="text-xl font-bold text-white">
            Quick Floor Setup
          </DialogTitle>
          <DialogDescription className="text-base text-gray-400 mt-1">
            Add multiple tables at once to get started quickly.
          </DialogDescription>
        </DialogHeader>

        <ScrollView
          style={{ maxHeight: 420 }}
          contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 24 }}
        >
          <View className="gap-y-4">
            {tableShapes.map((shape) => (
              <ShapeInputRow
                key={shape.id}
                shape={shape}
                onQuantityChange={handleQuantityChange}
              />
            ))}
          </View>
        </ScrollView>

        <DialogFooter className="flex-row gap-4 p-6 bg-[#313131] border-t border-gray-700 rounded-b-xl">
          <TouchableOpacity
            onPress={onClose}
            className="flex-1 py-3 bg-gray-600 rounded-lg items-center"
          >
            <Text className="text-base font-bold text-white">
              Start with Blank Canvas
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleApply}
            className="flex-1 bg-blue-600 py-3 rounded-lg items-center"
          >
            <Text className="text-white text-base font-bold">Add Tables</Text>
          </TouchableOpacity>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default QuickSetupPanel;
