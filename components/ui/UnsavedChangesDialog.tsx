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
      <View style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.5)", alignItems: "center", justifyContent: "center", padding: 24 }}>
        <View style={{ backgroundColor: colors.panel, borderRadius: 20, padding: 28, width: "100%", maxWidth: 400, borderWidth: 1, borderColor: colors.border, shadowColor: "#000", shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.3, shadowRadius: 16, elevation: 10 }}>
          {/* Icon Container */}
          <View style={{ alignItems: "center", marginBottom: 20 }}>
            <View style={{ width: 60, height: 60, borderRadius: 14, backgroundColor: colors.warning + "20", alignItems: "center", justifyContent: "center", marginBottom: 16 }}>
              <AlertTriangle size={28} color={colors.warning} strokeWidth={2.5} />
            </View>

            <Text style={{ fontSize: 18, fontWeight: "800", color: colors.heading, marginBottom: 8 }}>
              Discard Changes?
            </Text>
            <Text style={{ fontSize: 13, color: colors.label, textAlign: "center", lineHeight: 20 }}>
              Your unsaved changes will be lost. This action cannot be undone.
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={{ flexDirection: "column", gap: 10, marginTop: 8 }}>
            <TouchableOpacity
              onPress={onCancel}
              style={{ width: "100%", backgroundColor: colors.teal, borderRadius: 12, paddingVertical: 13, alignItems: "center", shadowColor: colors.teal, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 8, elevation: 4 }}
            >
              <Text style={{ fontSize: 14, color: colors.onSolid, fontWeight: "700" }}>
                Keep Editing
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onDiscard}
              style={{ width: "100%", backgroundColor: colors.danger + "15", borderRadius: 12, borderWidth: 1.5, borderColor: colors.danger + "50", paddingVertical: 13, alignItems: "center" }}
            >
              <Text style={{ fontSize: 14, color: colors.danger, fontWeight: "700" }}>
                Discard Changes
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default UnsavedChangesDialog;
