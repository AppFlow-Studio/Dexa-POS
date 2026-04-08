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

interface VoidItemDialogProps {
  isOpen: boolean;
  itemName: string;
  onConfirm: (reason: string) => void;
  onCancel: () => void;
}

const PREDEFINED_REASONS = [
  "Customer changed mind",
  "Out of stock",
  "Wrong item ordered",
  "Quality issue",
];

const VoidItemDialog: React.FC<VoidItemDialogProps> = ({
  isOpen,
  itemName,
  onConfirm,
  onCancel,
}) => {
  const [selectedReason, setSelectedReason] = useState<string | null>(null);
  const [customReason, setCustomReason] = useState("");
  const [isOtherSelected, setIsOtherSelected] = useState(false);

  const handleSelectReason = (reason: string) => {
    setSelectedReason(reason);
    setIsOtherSelected(false);
    setCustomReason("");
  };

  const handleSelectOther = () => {
    setSelectedReason(null);
    setIsOtherSelected(true);
  };

  const handleConfirm = () => {
    const reason = isOtherSelected ? customReason.trim() : selectedReason;
    if (reason) {
      onConfirm(reason);
      // Reset state
      setSelectedReason(null);
      setCustomReason("");
      setIsOtherSelected(false);
    }
  };

  const handleCancel = () => {
    // Reset state
    setSelectedReason(null);
    setCustomReason("");
    setIsOtherSelected(false);
    onCancel();
  };

  const isConfirmDisabled =
    !selectedReason && (!isOtherSelected || !customReason.trim());

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
            style={{ flex: 1 }}
            className="justify-center items-center bg-black/70 px-4"
          >
            <View className="w-full max-w-md bg-surface rounded-2xl overflow-hidden">
              {/* Header */}
              <View className="flex-row items-center justify-between p-4 border-b border-border">
                <Text className="text-xl font-bold text-white">Void Item</Text>
                <TouchableOpacity onPress={handleCancel} className="p-1">
                  <X size={24} color={colors.muted} />
                </TouchableOpacity>
              </View>

              {/* Content - Scrollable */}
              <ScrollView
                keyboardShouldPersistTaps="handled"
                contentContainerStyle={{ flexGrow: 1 }}
              >
                <View className="p-4">
                  {/* Void warning banner */}
                  <View className="bg-red-900/30 border border-red-600/50 rounded-lg p-3 mb-4">
                    <Text className="text-red-400 text-sm font-medium">
                      ⚠️ This item was sent to the kitchen
                    </Text>
                    <Text className="text-red-300/80 text-xs mt-1">
                      Voiding requires a reason for tracking. Manager approval
                      may be needed.
                    </Text>
                  </View>

                  <Text className="text-gray-300 text-base mb-2">
                    Voiding:{" "}
                    <Text className="text-white font-semibold">{itemName}</Text>
                  </Text>
                  <Text className="text-gray-400 text-sm mb-4">
                    Select a reason for voiding this item:
                  </Text>

                  {/* Predefined Reasons */}
                  <View className="flex-row flex-wrap gap-2 mb-4">
                    {PREDEFINED_REASONS.map((reason) => (
                      <TouchableOpacity
                        key={reason}
                        onPress={() => handleSelectReason(reason)}
                        className={`px-4 py-2 rounded-full border ${
                          selectedReason === reason
                            ? "bg-red-600 border-red-500"
                            : "bg-surface border-border"
                        }`}
                      >
                        <Text
                          className={`text-sm ${
                            selectedReason === reason
                              ? "text-white font-semibold"
                              : "text-gray-300"
                          }`}
                        >
                          {reason}
                        </Text>
                      </TouchableOpacity>
                    ))}

                    {/* Other option */}
                    <TouchableOpacity
                      onPress={handleSelectOther}
                      className={`px-4 py-2 rounded-full border ${
                        isOtherSelected
                          ? "bg-red-600 border-red-500"
                          : "bg-surface border-border"
                      }`}
                    >
                      <Text
                        className={`text-sm ${
                          isOtherSelected
                            ? "text-white font-semibold"
                            : "text-gray-300"
                        }`}
                      >
                        Other
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Custom reason input */}
                  {isOtherSelected && (
                    <TextInput
                      className="bg-panel border border-border rounded-lg p-3 text-white text-base mb-4"
                      placeholder="Enter reason..."
                      placeholderTextColor={colors.muted}
                      value={customReason}
                      onChangeText={setCustomReason}
                      autoFocus
                      multiline
                      numberOfLines={2}
                      textAlignVertical="top"
                    />
                  )}
                </View>
              </ScrollView>

              {/* Actions */}
              <View className="flex-row border-t border-border">
                <TouchableOpacity
                  onPress={handleCancel}
                  className="flex-1 py-4 items-center border-r border-border"
                >
                  <Text className="text-gray-400 text-base font-semibold">
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirm}
                  disabled={isConfirmDisabled}
                  className={`flex-1 py-4 items-center ${
                    isConfirmDisabled ? "opacity-40" : ""
                  }`}
                >
                  <Text
                    className={`text-base font-semibold ${
                      isConfirmDisabled ? "text-gray-500" : "text-red-500"
                    }`}
                  >
                    Void Item
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

export default VoidItemDialog;
