import { useNoPrinterModalStore } from "@/stores/useNoPrinterModalStore";
import { colors } from "@/lib/theme";
import { Printer, Settings, X } from "lucide-react-native";
import React, { useCallback } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";

const MESSAGES = {
  receipt: {
    title: "No Default Receipt Printer",
    message:
      "Please set a default receipt printer in Settings.",
  },
  kitchen: {
    title: "No Kitchen Printer",
    message:
      "There is no kitchen printer configured for this station. Please connect a printer in Settings to send kitchen tickets.",
  },
} as const;

export function NoPrinterModal() {
  const visible = useNoPrinterModalStore((s) => s.visible);
  const printerType = useNoPrinterModalStore((s) => s.printerType);
  const hide = useNoPrinterModalStore((s) => s.hide);
  const router = useRouter();

  const { title, message } = MESSAGES[printerType];

  const handleConfigure = useCallback(() => {
    hide();
    router.push("/settings/printers?tab=order");
  }, [hide, router]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={hide}
    >
      <View className="flex-1 bg-black/70 items-center justify-center p-6">
        <View className="bg-surface rounded-2xl p-6 w-full max-w-md border border-gray-600">
          {/* Close button */}
          <TouchableOpacity
            onPress={hide}
            className="absolute top-4 right-4 z-10 p-1"
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <X size={20} color={colors.muted} />
          </TouchableOpacity>

          {/* Icon */}
          <View className="items-center mb-4">
            <View className="bg-amber-500/15 p-4 rounded-full">
              <Printer size={44} color={colors.warning} />
            </View>
          </View>

          {/* Title */}
          <Text className="text-xl font-bold text-white text-center mb-2">
            {title}
          </Text>

          {/* Message */}
          <Text className="text-base text-gray-400 text-center mb-6 leading-6">
            {message}
          </Text>

          {/* Action buttons */}
          <View className="gap-3">
            <TouchableOpacity
              onPress={handleConfigure}
              className="bg-blue-600 py-3.5 rounded-xl flex-row items-center justify-center gap-2"
            >
              <Settings size={18} color="white" />
              <Text className="text-white text-base font-semibold">
                Configure Printer
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={hide}
              className="bg-panel border border-gray-600 py-3.5 rounded-xl"
            >
              <Text className="text-gray-300 text-base font-medium text-center">
                Dismiss
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
