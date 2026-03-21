import { colors } from "@/lib/theme";
import { AlertTriangle } from "lucide-react-native";
import React from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";

interface UnsavedChangesDialogProps {
  isOpen: boolean;
  onCancel: () => void;
  onDiscard: () => void;
}

const UnsavedChangesDialog: React.FC<UnsavedChangesDialogProps> = ({
  isOpen,
  onCancel,
  onDiscard,
}) => {
  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: "#00000080", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 20, width: "100%", maxWidth: 360, borderWidth: 1, borderColor: colors.border }}>
          <View style={{ alignItems: "center", marginBottom: 14 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.warning + "15", borderWidth: 1, borderColor: colors.warning + "40", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <AlertTriangle size={20} color={colors.warning} />
            </View>
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading, marginBottom: 6 }}>
              Unsaved Changes
            </Text>
            <Text style={{ fontSize: 12, color: colors.muted, textAlign: "center", lineHeight: 18 }}>
              You have unsaved changes. Are you sure you want to go back?
            </Text>
          </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TouchableOpacity
              onPress={onCancel}
              style={{ flex: 1, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 9, alignItems: "center" }}
            >
              <Text style={{ fontSize: 13, color: colors.label, fontWeight: "500" }}>Keep Editing</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onDiscard}
              style={{ flex: 1, backgroundColor: colors.danger + "15", borderWidth: 1, borderColor: colors.danger + "40", borderRadius: 8, paddingVertical: 9, alignItems: "center" }}
            >
              <Text style={{ fontSize: 13, color: colors.danger, fontWeight: "600" }}>Discard</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default UnsavedChangesDialog;
