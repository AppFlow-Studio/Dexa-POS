import { colors } from "@/lib/theme";
import { X } from "lucide-react-native";
import React, { useState } from "react";
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from "react-native";

/**
 * Cancel-reason picker for an already-accepted online/OrderOut order.
 *
 * Reasons are the OrderOut cancel API enum
 * (https://developers.orderout.co/reference/cancel-marketplace-order). The chip
 * label is human-friendly; onConfirm emits the ENUM CODE so the external relay
 * can forward it verbatim. `details` is optional free text (API `details`).
 */

export type CancelReasonCode =
  | "ITEM_UNAVAILABLE"
  | "STORE_CLOSED"
  | "TOO_BUSY"
  | "CUSTOMER_REQUEST"
  | "CANNOT_FULFILL";

const REASONS: { code: CancelReasonCode; label: string }[] = [
  { code: "ITEM_UNAVAILABLE", label: "Item unavailable" },
  { code: "STORE_CLOSED", label: "Store closed" },
  { code: "TOO_BUSY", label: "Too busy" },
  { code: "CUSTOMER_REQUEST", label: "Customer request" },
  { code: "CANNOT_FULFILL", label: "Can't fulfill" },
];

interface CancelOnlineOrderDialogProps {
  isOpen: boolean;
  orderLabel: string;
  platformLabel?: string | null;
  onConfirm: (reason: CancelReasonCode, details?: string) => void;
  onCancel: () => void;
}

const CancelOnlineOrderDialog: React.FC<CancelOnlineOrderDialogProps> = ({
  isOpen,
  orderLabel,
  platformLabel,
  onConfirm,
  onCancel,
}) => {
  const [selected, setSelected] = useState<CancelReasonCode | null>(null);
  const [details, setDetails] = useState("");

  const reset = () => {
    setSelected(null);
    setDetails("");
  };

  const handleConfirm = () => {
    if (!selected) return;
    onConfirm(selected, details.trim() || undefined);
    reset();
  };

  const handleCancel = () => {
    reset();
    onCancel();
  };

  const warningBackground = `${colors.danger}1A`;
  const warningBorder = `${colors.danger}59`;

  if (!isOpen) return null;

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={handleCancel}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 20}
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
                <Text
                  style={{ color: colors.heading }}
                  className="text-xl font-bold"
                >
                  Cancel Order
                </Text>
                <TouchableOpacity onPress={handleCancel} className="p-1">
                  <X size={24} color={colors.muted} />
                </TouchableOpacity>
              </View>

              {/* Content */}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ flexGrow: 1 }}
              >
                <View className="p-4">
                  {/* Warning banner */}
                  <View
                    style={{
                      backgroundColor: warningBackground,
                      borderWidth: 1,
                      borderColor: warningBorder,
                    }}
                    className="rounded-lg p-3 mb-4"
                  >
                    <Text
                      style={{ color: colors.danger }}
                      className="text-sm font-medium"
                    >
                      ⚠️ This cancels the order on{" "}
                      {platformLabel || "the delivery platform"}
                    </Text>
                    <Text
                      style={{ color: colors.label }}
                      className="text-xs mt-1 leading-[18px]"
                    >
                      The customer will be notified and refunded by the platform.
                      This can't be undone.
                    </Text>
                  </View>

                  <Text style={{ color: colors.label }} className="text-base mb-2">
                    Cancelling:{" "}
                    <Text
                      style={{ color: colors.heading }}
                      className="font-semibold"
                    >
                      #{orderLabel}
                    </Text>
                  </Text>
                  <Text style={{ color: colors.muted }} className="text-sm mb-4">
                    Select a reason for cancelling:
                  </Text>

                  {/* Reason chips */}
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {REASONS.map(({ code, label }) => {
                      const isSelected = selected === code;
                      return (
                        <TouchableOpacity
                          key={code}
                          onPress={() => setSelected(code)}
                          style={{
                            borderWidth: 1,
                            backgroundColor: isSelected
                              ? colors.danger
                              : colors.card,
                            borderColor: isSelected
                              ? colors.danger
                              : colors.border,
                          }}
                          className="px-4 py-2 rounded-full"
                        >
                          <Text
                            style={{
                              color: isSelected ? colors.onSolid : colors.label,
                            }}
                            className={
                              isSelected
                                ? "text-sm font-semibold"
                                : "text-sm"
                            }
                          >
                            {label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Optional details */}
                  <Text style={{ color: colors.muted }} className="text-sm mb-2">
                    Additional details (optional):
                  </Text>
                  <TextInput
                    style={{
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                      color: colors.heading,
                    }}
                    className="rounded-lg p-3 text-base"
                    placeholder="Add context for the platform…"
                    placeholderTextColor={colors.muted}
                    value={details}
                    onChangeText={setDetails}
                    multiline
                    numberOfLines={2}
                    textAlignVertical="top"
                  />
                </View>
              </ScrollView>

              {/* Actions */}
              <View
                style={{ borderTopWidth: 1, borderTopColor: colors.border }}
                className="flex-row"
              >
                <TouchableOpacity
                  onPress={handleCancel}
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
                    Keep Order
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirm}
                  disabled={!selected}
                  style={{
                    backgroundColor: !selected
                      ? colors.card
                      : `${colors.danger}14`,
                    opacity: !selected ? 0.45 : 1,
                  }}
                  className="flex-1 py-4 items-center"
                >
                  <Text
                    style={{ color: !selected ? colors.muted : colors.danger }}
                    className="text-base font-semibold"
                  >
                    Cancel Order
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  );
};

export default CancelOnlineOrderDialog;
