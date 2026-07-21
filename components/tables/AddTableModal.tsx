import { useUiScale } from '@/lib/uiScale'
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
}) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
    <TouchableOpacity
      key={id}
      onPress={onPress}
      style={{
        padding: s(12),
        borderWidth: 2,
        borderRadius: s(12),
        alignItems: "center",
        justifyContent: "center",
        width: s(250),
        height: s(130),
        borderColor: isSelected ? colors.teal : colors.border,
        backgroundColor: isSelected ? colors.tealMuted : colors.panel,
      }}
    >
      <ShapeComponent color={isSelected ? colors.teal : colors.label} height={s(60)} />
      <Text
        style={{
          marginTop: s(8),
          fontWeight: "600",
          fontSize: s(14),
          textAlign: "center",
          color: isSelected ? colors.teal : colors.label,
        }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  )
}

export const AddTableModal: React.FC<AddTableModalProps> = ({
  isOpen,
  onClose,
  onAdd,
}) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
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
          width: s(620),
          padding: s(32),
          borderRadius: s(16),
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <DialogHeader>
            <DialogTitle style={{ fontSize: s(24), fontWeight: "700", color: colors.heading }}>
              Add New Object
            </DialogTitle>
            <DialogDescription style={{ fontSize: s(16), color: colors.muted, marginTop: s(4) }}>
              Enter a name and choose a shape to add to the floor plan.
            </DialogDescription>
          </DialogHeader>

          <View style={{ rowGap: s(24), paddingVertical: s(16) }}>
            <View>
              <Text style={{ fontSize: s(16), fontWeight: "500", color: colors.label, marginBottom: s(8) }}>
                Object Name
              </Text>
              <View style={{ rowGap: s(12), paddingVertical: s(12) }}>
                <View>
                  <Text style={{ fontSize: s(18), color: colors.label, fontWeight: "500", marginBottom: s(6) }}>
                    Table Name
                  </Text>
                  <TextInput
                    value={name}
                    onChangeText={setName}
                    placeholder="e.g., T-24 or Main Bar"
                    placeholderTextColor={colors.muted}
                    style={{
                      paddingHorizontal: s(16),
                      height: s(56),
                      backgroundColor: colors.inset,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: s(10),
                      fontSize: s(18),
                      color: colors.heading,
                    }}
                  />
                </View>

                <View>
                  <Text style={{ fontSize: s(16), fontWeight: "500", color: colors.label, marginBottom: s(8) }}>
                    Select Shape
                  </Text>
                  <ScrollView style={{ maxHeight: s(290) }}>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(16), justifyContent: "center" }}>
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
              gap: s(16),
              paddingTop: s(16),
              borderTopWidth: 1,
              borderColor: colors.border,
            }}
          >
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1,
                paddingVertical: s(12),
                backgroundColor: colors.inset,
                borderRadius: s(10),
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text style={{ fontSize: s(16), fontWeight: "700", color: colors.label }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleAddPress}
              style={{
                flex: 1,
                backgroundColor: colors.teal,
                paddingVertical: s(12),
                borderRadius: s(10),
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.onSolid, fontSize: s(16), fontWeight: "700" }}>
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