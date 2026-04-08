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

  useEffect(() => {
    if (visible) {
      setCountdown(countdownSeconds);
      progressAnim.setValue(1);
      Animated.timing(progressAnim, {
        toValue: 0,
        duration: countdownSeconds * 1000,
        useNativeDriver: false,
      }).start();
      intervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) { if (intervalRef.current) clearInterval(intervalRef.current); return 0; }
          return prev - 1;
        });
      }, 1000);
    }
    return () => { if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; } };
  }, [visible, countdownSeconds, progressAnim]);

  useEffect(() => { if (visible && countdown === 0) onDismiss(); }, [visible, countdown, onDismiss]);

  const handleDismiss = useCallback(() => {
    if (intervalRef.current) { clearInterval(intervalRef.current); intervalRef.current = null; }
    onDismiss();
  }, [onDismiss]);

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: colors.panel, borderRadius: 16, padding: 20, width: '100%', maxWidth: 360, borderWidth: 1, borderColor: colors.danger + '50' }}>
          {/* Icon */}
          <View style={{ alignItems: 'center', marginBottom: 14 }}>
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: colors.danger + '15', alignItems: 'center', justifyContent: 'center' }}>
              <AlertTriangle size={26} color={colors.danger} />
            </View>
          </View>

          {/* Title */}
          <Text style={{ fontSize: 15, fontWeight: '700', color: colors.danger, textAlign: 'center', marginBottom: 6 }}>
            {title}
          </Text>

          {/* Message */}
          <Text style={{ fontSize: 13, color: colors.label, textAlign: 'center', marginBottom: 16, lineHeight: 18 }}>
            {message}
          </Text>

          {/* Progress bar */}
          <View style={{ backgroundColor: colors.screen, borderRadius: 4, height: 3, marginBottom: 6, overflow: 'hidden' }}>
            <Animated.View
              style={{
                backgroundColor: colors.danger,
                height: '100%', borderRadius: 4,
                width: progressAnim.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] }),
              }}
            />
          </View>
          <Text style={{ textAlign: 'center', fontSize: 11, color: colors.muted, marginBottom: 14 }}>
            Auto-dismiss in {countdown}s
          </Text>

          {/* Dismiss Button */}
          <TouchableOpacity
            onPress={handleDismiss}
            style={{ backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger + '50', paddingVertical: 10, borderRadius: 8, alignItems: 'center' }}
          >
            <Text style={{ color: colors.danger, fontWeight: '700', fontSize: 13 }}>Dismiss</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}
