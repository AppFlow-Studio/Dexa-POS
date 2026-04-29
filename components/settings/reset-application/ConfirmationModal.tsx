import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { colors } from "@/lib/theme";
import { AlertTriangle } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText: string;
  variant?: "default" | "destructive";
}

const ConfirmationModal: React.FC<ConfirmationModalProps> = ({
  isOpen,
  onClose,
  onConfirm,
  title,
  description,
  confirmText,
  variant = "default",
}) => {
  const isDestructive = variant === "destructive";

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        style={{
          padding: 18,
          borderRadius: 16,
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
          width: 440,
        }}
      >
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            {isDestructive ? (
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
            ) : (
              <View
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 8,
                  backgroundColor: colors.teal + "15",
                  borderWidth: 1,
                  borderColor: colors.teal + "30",
                }}
              />
            )}
            <DialogHeader style={{ flex: 1 }}>
              <DialogTitle
                style={{
                  fontSize: 16,
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                {title}
              </DialogTitle>
              <DialogDescription
                style={{
                  color: colors.label,
                  marginTop: 6,
                  fontSize: 13,
                }}
              >
                {description}
              </DialogDescription>
            </DialogHeader>
          </View>

          <DialogFooter style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={onClose}
              style={{
                flex: 1,
                paddingHorizontal: 14,
                paddingVertical: 8,
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
                paddingHorizontal: 14,
                paddingVertical: 8,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: isDestructive
                  ? colors.danger + "30"
                  : colors.teal + "50",
                backgroundColor: isDestructive
                  ? colors.danger + "15"
                  : colors.teal + "20",
              }}
            >
              <Text
                style={{
                  fontWeight: "600",
                  fontSize: 13,
                  color: isDestructive ? colors.danger : colors.teal,
                  textAlign: "center",
                }}
              >
                {confirmText}
              </Text>
            </TouchableOpacity>
          </DialogFooter>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default ConfirmationModal;
