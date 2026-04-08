import { colors } from "@/lib/theme";
import { Trash2 } from "lucide-react-native";
import React from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";

interface DeleteConfirmDialogProps {
  isOpen: boolean;
  title: string;
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}

const DeleteConfirmDialog: React.FC<DeleteConfirmDialogProps> = ({
  isOpen,
  title,
  message,
  onCancel,
  onConfirm,
}) => {
  return (
    <Modal visible={isOpen} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: "#00000080", alignItems: "center", justifyContent: "center", padding: 16 }}>
        <View style={{ backgroundColor: colors.card, borderRadius: 16, padding: 16, width: "100%", maxWidth: 340, borderWidth: 1, borderColor: colors.border }}>
          {/* Icon Container */}
          <View style={{ alignItems: "center", marginBottom: 14 }}>
            <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: colors.danger + "20", alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
              <Trash2 size={22} color={colors.danger} strokeWidth={2} />
            </View>

            <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading, marginBottom: 6, textAlign: "center" }}>
              {title}
            </Text>
            <Text style={{ fontSize: 12, color: colors.label, textAlign: "center", lineHeight: 18 }}>
              {message}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
            <TouchableOpacity
              onPress={onCancel}
              style={{ flex: 1, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
            >
              <Text style={{ fontSize: 13, color: colors.label, fontWeight: "600" }}>
                Keep
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onConfirm}
              style={{ flex: 1, backgroundColor: colors.danger + "20", borderWidth: 1, borderColor: colors.danger + "50", borderRadius: 8, paddingVertical: 10, alignItems: "center" }}
            >
              <Text style={{ fontSize: 13, color: colors.danger, fontWeight: "600" }}>
                Delete
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default DeleteConfirmDialog;
