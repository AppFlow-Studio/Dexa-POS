import { colors } from "@/lib/theme";
import { X } from "lucide-react-native";
import React from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";

/**
 * Plain confirmation for marking an accepted online/OrderOut order READY for
 * pickup. Unlike CancelOnlineOrderDialog there is no reason enum — mark-ready
 * carries no reason. Confirming flips the order to `ready`, which stamps the
 * orderout_orders bridge so the external OrderOut relay notifies the platform
 * (Uber Eats / DoorDash / Grubhub).
 */

interface MarkOrderReadyDialogProps {
  isOpen: boolean;
  orderLabel: string;
  platformLabel?: string | null;
  onConfirm: () => void;
  onCancel: () => void;
}

const MarkOrderReadyDialog: React.FC<MarkOrderReadyDialogProps> = ({
  isOpen,
  orderLabel,
  platformLabel,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onCancel}
    >
      <View
        style={{
          flex: 1,
          justifyContent: "center",
          alignItems: "center",
          backgroundColor: "rgba(0,0,0,0.7)",
          paddingHorizontal: 16,
        }}
      >
        <View
          style={{
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
          }}
          className="w-full max-w-md rounded-2xl overflow-hidden"
        >
          {/* Header */}
          <View
            style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
            className="flex-row items-center justify-between p-4"
          >
            <Text style={{ color: colors.heading }} className="text-xl font-bold">
              Mark Order Ready
            </Text>
            <TouchableOpacity onPress={onCancel} className="p-1">
              <X size={24} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {/* Content */}
          <View className="p-4">
            <Text style={{ color: colors.label }} className="text-base mb-1">
              Mark{" "}
              <Text style={{ color: colors.heading }} className="font-semibold">
                #{orderLabel}
              </Text>{" "}
              ready for pickup?
            </Text>
            <Text style={{ color: colors.muted }} className="text-sm">
              This notifies {platformLabel || "the delivery platform"} the order
              is ready for pickup.
            </Text>
          </View>

          {/* Actions */}
          <View
            style={{ borderTopWidth: 1, borderTopColor: colors.border }}
            className="flex-row"
          >
            <TouchableOpacity
              onPress={onCancel}
              style={{
                borderRightWidth: 1,
                borderRightColor: colors.border,
                backgroundColor: colors.card,
              }}
              className="flex-1 py-4 items-center"
            >
              <Text
                style={{ color: colors.label }}
                className="text-base font-semibold"
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              style={{ backgroundColor: `${colors.teal}14` }}
              className="flex-1 py-4 items-center"
            >
              <Text
                style={{ color: colors.teal }}
                className="text-base font-semibold"
              >
                Mark Ready
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

export default MarkOrderReadyDialog;
