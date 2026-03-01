import { colors } from "@/lib/theme";
import { AlertTriangle } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import { Animated, Modal, Text, TouchableOpacity, View } from "react-native";

interface PaymentErrorModalProps {
  visible: boolean;
  title: string;
  message: string;
  countdownSeconds?: number;
  onDismiss: () => void;
}

/**
 * Modal that displays when a payment fails.
 * Shows error details with a countdown timer before auto-dismissing.
 * Parent keeps isProcessing=true while this is visible to prevent sheet close.
 */
export function PaymentErrorModal({
  visible,
  title,
  message,
  countdownSeconds = 5,
  onDismiss,
}: PaymentErrorModalProps) {
  const [countdown, setCountdown] = useState(countdownSeconds);
  const progressAnim = useRef(new Animated.Value(1)).current;
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset and start countdown when modal becomes visible
  useEffect(() => {
    if (visible) {
      setCountdown(countdownSeconds);
      progressAnim.setValue(1);

      // Animate progress bar from full to empty
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: countdownSeconds * 1000,
        useNativeDriver: false,
      }).start();

      // Countdown tick
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [visible, countdownSeconds, progressAnim]);

  // Auto-dismiss when countdown reaches 0
  useEffect(() => {
    if (visible && countdown === 0) {
      onDismiss();
    }
  }, [visible, countdown, onDismiss]);

  const handleDismiss = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    onDismiss();
  }, [onDismiss]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
    >
      <View className="flex-1 bg-black/70 items-center justify-center p-6">
        <View className="bg-surface rounded-2xl p-6 w-full max-w-md border-2 border-red-500">
          {/* Icon */}
          <View className="items-center mb-4">
            <View className="bg-red-500/20 p-4 rounded-full">
              <AlertTriangle size={48} color={colors.danger} />
            </View>
          </View>

          {/* Title */}
          <Text className="text-2xl font-bold text-red-400 text-center mb-2">
            {title}
          </Text>

          {/* Message */}
          <Text className="text-lg text-gray-200 text-center mb-6">
            {message}
          </Text>

          {/* Countdown Progress Bar */}
          <View className="bg-panel rounded-full h-2 mb-2 overflow-hidden">
            <Animated.View
              className="bg-red-500 h-full rounded-full"
              style={{
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", "100%"],
                }),
              }}
            />
          </View>
          <Text className="text-center text-gray-400 text-sm mb-6">
            Auto-dismiss in {countdown}s
          </Text>

          {/* Dismiss Button */}
          <TouchableOpacity
            onPress={handleDismiss}
            className="bg-red-600 py-4 rounded-xl"
          >
            <Text className="text-white text-lg font-semibold text-center">
              Dismiss
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
