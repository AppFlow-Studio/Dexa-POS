import { colors } from "@/lib/theme";
import { useToast } from "@/contexts/ToastContext"; // Import useToast
import { SHAPE_OPTIONS, TABLE_SHAPES } from "@/lib/table-shapes";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import React, { useState } from "react";
import {
  KeyboardAvoidingView, // <--- Imported
  Platform, // <--- Imported
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
    style={{
      padding: 12,
      borderWidth: 2,
      borderRadius: 12,
      alignItems: "center",
      justifyContent: "center",
      width: 250,
      height: 130,
      borderColor: isSelected ? colors.teal : colors.border,
      backgroundColor: isSelected ? colors.tealMuted : colors.panel,
    }}
  >
    <ShapeComponent color={isSelected ? colors.teal : colors.label} height={60} />
    <Text
      style={{
        marginTop: 8,
        fontWeight: "600",
        fontSize: 14,
        textAlign: "center",
        color: isSelected ? colors.teal : colors.label,
      }}
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

  const { tables } = useFloorPlanStore();
  const { show } = useToast();
  const tablesInCurrentLayout = tables;

  const handleAddPress = () => {
    if (!name || !selectedShapeId) {
      show({
        title: "Missing Information",
        message: "Please provide a name for the object and select a shape.",
        type: "error",
      });
      return;
    }

    const nameExists = tablesInCurrentLayout.some(
      (table) => table.name.trim().toLowerCase() === name.trim().toLowerCase()
    );

    if (nameExists) {
      show({
        title: "Duplicate Name",
        message: `An object named "${name}" already exists. Please choose a unique name.`,
        type: "error",
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
      <DialogContent
        style={{
          width: 620,
          padding: 32,
          borderRadius: 16,
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <DialogHeader>
            <DialogTitle style={{ fontSize: 24, fontWeight: "700", color: colors.heading }}>
              Add New Object
            </DialogTitle>
            <DialogDescription style={{ fontSize: 16, color: colors.muted, marginTop: 4 }}>
              Enter a name and choose a shape to add to the floor plan.
            </DialogDescription>
          </DialogHeader>

          <View style={{ rowGap: 24, paddingVertical: 16 }}>
            <View>
              <Text style={{ fontSize: 16, fontWeight: "500", color: colors.label, marginBottom: 8 }}>
                Object Name
              </Text>
              <View style={{ rowGap: 12, paddingVertical: 12 }}>
                <View>
                  <Text style={{ fontSize: 18, color: colors.label, fontWeight: "500", marginBottom: 6 }}>
                    Table Name
                  </Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g., T-24 or Main Bar"
                    placeholderTextColor={colors.muted}
                    style={{
                      paddingHorizontal: 16,
                      height: 56,
                      backgroundColor: colors.inset,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 10,
                      fontSize: 18,
                      color: colors.heading,
                    }}
                  />
                </View>

                <View>
                  <Text style={{ fontSize: 16, fontWeight: "500", color: colors.label, marginBottom: 8 }}>
                    Select Shape
                  </Text>
                  <ScrollView style={{ maxHeight: 290 }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 16, justifyContent: "center" }}>
                      {SHAPE_OPTIONS.map(
                        ({ id, label, component: ShapeComponent }) => (
                          <ShapeButton
                            key={id}
                            id={id}
                            label={label}
                            ShapeComponent={ShapeComponent}
                            isSelected={selectedShapeId === id}
                            onPress={() =>
                              setSelectedShapeId(
                                id as keyof typeof TABLE_SHAPES
                              )
                            }
                          />
                        )
                      )}
                    </View>
                  </ScrollView>
                </View>
              </View>
            </View>
          </View>
          <DialogFooter
            style={{
              flexDirection: "row",
              gap: 16,
              paddingTop: 16,
              borderTopWidth: 1,
              borderColor: colors.border,
            }}
          >
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1,
                paddingVertical: 12,
                backgroundColor: colors.inset,
                borderRadius: 10,
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.label }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAddPress}
              style={{
                flex: 1,
                backgroundColor: colors.teal,
                paddingVertical: 12,
                borderRadius: 10,
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.onSolid, fontSize: 16, fontWeight: "700" }}>
                Add Object
              </Text>
            </TouchableOpacity>
          </DialogFooter>
        </KeyboardAvoidingView>
      </DialogContent>
    </Dialog>
  );
};

export default AddTableModal;
