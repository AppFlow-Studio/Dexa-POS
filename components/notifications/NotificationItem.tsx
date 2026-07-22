import { Notification } from "@/lib/types";
import { colors } from "@/lib/theme";
import { formatDistanceToNow } from "date-fns";
import { getNotificationAppearance } from "@/lib/notificationUtils";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Text, TouchableOpacity, View } from "react-native";
import { Check } from "lucide-react-native";
import React, { useState } from "react";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { useQrGuestAlertsStore } from "@/stores/useQrGuestAlertsStore";

interface NotificationItemProps {
  notification: Notification;
  onDelete: (id: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onDelete }) => {
  const { icon: Icon, color, title } = getNotificationAppearance(notification.type);
  const supabase = useSupabaseClient();
  const [resolving, setResolving] = useState(false);

  // QR guest request rows carry a visible resolve action — resolving is
  // server-side (idempotent) and the broadcast clears every surface (bell,
  // other stations, floor-plan badge, this mirror).
  const handleResolveAlert = async () => {
    const alertId = notification.payload?.alertId as string | undefined;
    if (!alertId || !supabase) return;
    setResolving(true);
    await useQrGuestAlertsStore.getState().resolve(supabase, alertId);
    setResolving(false);
  };

  const translateX = useSharedValue(0);
  const itemHeight = useSharedValue(76);

  const startX = useSharedValue(0);
  const panGesture = Gesture.Pan()
    .onStart(() => {
      startX.value = translateX.value;
    })
    .onUpdate((event) => {
      translateX.value = startX.value + event.translationX;
    })
    .onEnd(() => {
      if (translateX.value < -100) {
        translateX.value = withTiming(-500);
        itemHeight.value = withTiming(0, undefined, (isFinished) => {
          if (isFinished) runOnJS(onDelete)(notification.id);
        });
      } else {
        translateX.value = withTiming(0);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    height: itemHeight.value,
    opacity: itemHeight.value === 0 ? 0 : 1,
    marginVertical: itemHeight.value === 0 ? 0 : 3,
  }));

  return (
    <GestureDetector gesture={panGesture}>
      <Animated.View style={animatedStyle}>
        <View
          style={{
            paddingHorizontal: 14, paddingVertical: 12,
            flexDirection: 'row', alignItems: 'flex-start', gap: 12,
            backgroundColor: notification.isRead ? colors.panel : colors.teal + '08',
            borderLeftWidth: 3, borderLeftColor: notification.isRead ? 'transparent' : color,
          }}
        >
          <View style={{ width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: color + '15' }}>
            <Icon size={18} color={color} />
          </View>
          <View style={{ flex: 1 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading, flex: 1, paddingRight: 8 }}>
                {title}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted }}>
                {formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true })}
              </Text>
            </View>
            <Text style={{ fontSize: 12, color: colors.label, marginTop: 2 }}>
              {notification.message}
            </Text>
            {notification.type === "qr_call_server" ? (
              <TouchableOpacity
                onPress={handleResolveAlert}
                disabled={resolving}
                style={{
                  alignSelf: 'flex-start',
                  marginTop: 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6,
                  paddingVertical: 6,
                  paddingHorizontal: 12,
                  borderRadius: 8,
                  backgroundColor: '#0C4FD1',
                  opacity: resolving ? 0.5 : 1,
                }}
              >
                <Check size={12} color='#fff' />
                <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>
                  Mark Resolved
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Animated.View>
    </GestureDetector>
  );
};

export default NotificationItem;
