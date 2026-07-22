import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getNotificationAppearance } from "@/lib/notificationUtils";
import { colors } from "@/lib/theme";
import { Notification } from "@/lib/types";
import { useQrGuestAlertsStore } from "@/stores/useQrGuestAlertsStore";
import { formatDistanceToNow } from "date-fns";
import { Check, X } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  FadeOutRight,
  LinearTransition,
} from "react-native-reanimated";

interface NotificationItemProps {
  notification: Notification;
  onDelete: (id: string) => void;
}

/**
 * A single notification card. No hidden gestures — explicit dismiss (✕) and,
 * for QR guest requests, an explicit "Mark Resolved" action that resolves the
 * alert server-side (idempotent; the broadcast clears the bell, other
 * stations, the floor-plan badge, and this mirror).
 */
const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onDelete,
}) => {
  const { icon: Icon, color, title } = getNotificationAppearance(
    notification.type,
  );
  const supabase = useSupabaseClient();
  const [resolving, setResolving] = useState(false);

  const isQrAlert = notification.type === "qr_call_server";

  const handleResolveAlert = async () => {
    const alertId = notification.payload?.alertId as string | undefined;
    if (!alertId || !supabase) return;
    setResolving(true);
    await useQrGuestAlertsStore.getState().resolve(supabase, alertId);
    setResolving(false);
  };

  return (
    <Animated.View
      exiting={FadeOutRight.duration(180)}
      layout={LinearTransition.duration(180)}
      style={{
        marginHorizontal: 12,
        marginVertical: 4,
        borderRadius: 14,
        overflow: "hidden",
        backgroundColor: notification.isRead
          ? colors.card
          : color + "0D",
        borderWidth: 1,
        borderColor: notification.isRead ? colors.border : color + "40",
      }}
    >
      <View
        style={{
          paddingHorizontal: 14,
          paddingVertical: 12,
          flexDirection: "row",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        {/* Icon tile */}
        <View
          style={{
            width: 38,
            height: 38,
            borderRadius: 12,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: color + "18",
            borderWidth: 1,
            borderColor: color + "30",
          }}
        >
          <Icon size={18} color={color} />
        </View>

        {/* Body */}
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
            }}
          >
            {!notification.isRead && (
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: color,
                }}
              />
            )}
            <Text
              style={{
                fontSize: 13,
                fontWeight: "700",
                color: colors.heading,
                flex: 1,
              }}
              numberOfLines={1}
            >
              {title}
            </Text>
            <Text style={{ fontSize: 10, color: colors.muted }}>
              {formatDistanceToNow(new Date(notification.timestamp), {
                addSuffix: true,
              })}
            </Text>
          </View>

          <Text
            style={{
              fontSize: 12,
              color: colors.label,
              marginTop: 3,
              lineHeight: 17,
            }}
          >
            {notification.message}
          </Text>

          {isQrAlert ? (
            <TouchableOpacity
              onPress={handleResolveAlert}
              disabled={resolving}
              activeOpacity={0.7}
              style={{
                alignSelf: "flex-start",
                marginTop: 10,
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                paddingVertical: 7,
                paddingHorizontal: 14,
                borderRadius: 10,
                backgroundColor: "#0C4FD1",
                opacity: resolving ? 0.5 : 1,
              }}
            >
              <Check size={13} color="#fff" />
              <Text
                style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}
              >
                {resolving ? "Resolving…" : "Mark Resolved"}
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>

        {/* Explicit dismiss — QR alerts clear via Resolve instead. */}
        {!isQrAlert ? (
          <TouchableOpacity
            onPress={() => onDelete(notification.id)}
            hitSlop={8}
            style={{
              width: 26,
              height: 26,
              borderRadius: 13,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: colors.screen,
            }}
          >
            <X size={13} color={colors.muted} />
          </TouchableOpacity>
        ) : null}
      </View>
    </Animated.View>
  );
};

export default NotificationItem;
