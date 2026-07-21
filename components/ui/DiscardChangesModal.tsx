import { colors } from "@/lib/theme";
import { AlertTriangle } from "lucide-react-native";
import React from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";

interface DiscardChangesModalProps {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title?: string;
  description?: string;
  confirmText?: string;
}

// Native RN <Modal>-based discard prompt. We avoid the Dialog primitive here
// because that one renders via Portal at the React root and can be eclipsed by
// a parent React Native modal — the user sees the discard dialog "behind" the
// form. Nesting <Modal>s correctly stacks them at the OS level.
const DiscardChangesModal: React.FC<DiscardChangesModalProps> = ({
  visible,
  onClose,
  onConfirm,
  title = "Discard changes?",
  description = "You have unsaved changes. Are you sure you want to close this form?",
  confirmText = "Discard",
}) => {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: 24,
        }}
      >
        <View
          style={{
            width: "100%",
            maxWidth: 440,
            backgroundColor: colors.panel,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 18,
            gap: 12,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <View
              style={{
                width: 40,
                height: 40,
                borderRadius: 8,
                backgroundColor: colors.danger + "15",
                borderWidth: 1,
                borderColor: colors.danger + "30",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertTriangle color={colors.danger} size={18} />
            </View>
            <View style={{ flex: 1 }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                {title}
              </Text>
              <Text
                style={{
                  color: colors.label,
                  marginTop: 6,
                  fontSize: 13,
                  lineHeight: 18,
                }}
              >
                {description}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                backgroundColor: "transparent",
              }}
            >
              <Text
                style={{
                  fontWeight: "600",
                  fontSize: 13,
                  color: colors.label,
                  textAlign: "center",
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.danger + "40",
                backgroundColor: colors.danger + "15",
              }}
            >
              <Text
                style={{
                  fontWeight: "600",
                  fontSize: 13,
                  color: colors.danger,
                  textAlign: "center",
                }}
              >
                {confirmText}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default DiscardChangesModal;
