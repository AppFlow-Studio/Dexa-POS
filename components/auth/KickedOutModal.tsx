import { colors } from "@/lib/theme";
import { AlertTriangle } from "lucide-react-native";
import { Modal, Text, TouchableOpacity, View } from "react-native";

interface KickedOutModalProps {
  visible: boolean;
  kickedBy: string | null;
  kickReason: string | null;
  countdown: number;
  onAcknowledge: () => void;
}

/**
 * Modal that displays when the user's session is taken over by another device.
 * Shows a countdown before automatic logout.
 */
export function KickedOutModal({
  visible,
  kickedBy,
  kickReason,
  countdown,
  onAcknowledge,
}: KickedOutModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View className="flex-1 bg-black/70 items-center justify-center p-6">
        <View className="bg-card rounded-2xl p-6 w-full max-w-md border-2 border-red-500">
          {/* Icon */}
          <View className="items-center mb-4">
            <View className="bg-red-500/20 p-4 rounded-full">
              <AlertTriangle size={48} color={colors.danger} />
            </View>
          </View>

          {/* Title */}
          <Text className="text-2xl font-bold text-red-400 text-center mb-2">
            Session Taken Over
          </Text>

          {/* Message */}
          <Text className="text-lg text-gray-200 text-center mb-4">
            {kickedBy
              ? `${kickedBy} has taken over this station.`
              : "Another user has taken over this station."}
          </Text>

          {kickReason && (
            <Text className="text-base text-gray-400 text-center mb-4">
              Reason: {kickReason}
            </Text>
          )}

          {/* Countdown */}
          <View className="bg-red-500/10 rounded-lg p-4 mb-6">
            <Text className="text-center text-gray-300">
              You will be logged out in
            </Text>
            <Text className="text-4xl font-bold text-red-400 text-center">
              {countdown}
            </Text>
            <Text className="text-center text-gray-400 text-sm">seconds</Text>
          </View>

          {/* Acknowledge Button */}
          <TouchableOpacity
            onPress={onAcknowledge}
            className="bg-red-600 py-4 rounded-xl"
          >
            <Text className="text-white text-lg font-semibold text-center">
              OK, Log Me Out Now
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
