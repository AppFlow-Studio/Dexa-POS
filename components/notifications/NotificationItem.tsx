import { Notification } from "@/lib/types";
import { colors } from "@/lib/theme";
import { formatDistanceToNow } from "date-fns";
import { getNotificationAppearance } from "@/lib/notificationUtils";
import { PanGestureHandler } from "react-native-gesture-handler";
import Animated, {
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { Text, View } from "react-native";

interface NotificationItemProps {
  notification: Notification;
  onDelete: (id: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({ notification, onDelete }) => {
  const { icon: Icon, color, title } = getNotificationAppearance(notification.type);

  const translateX = useSharedValue(0);
  const itemHeight = useSharedValue(76);

  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, ctx: any) => { ctx.startX = translateX.value; },
    onActive: (event, ctx: any) => { translateX.value = ctx.startX + event.translationX; },
    onEnd: () => {
      if (translateX.value < -100) {
        translateX.value = withTiming(-500);
        itemHeight.value = withTiming(0, undefined, (isFinished) => {
          if (isFinished) runOnJS(onDelete)(notification.id);
        });
      } else {
        translateX.value = withTiming(0);
      }
    },
  });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
    height: itemHeight.value,
    opacity: itemHeight.value === 0 ? 0 : 1,
    marginVertical: itemHeight.value === 0 ? 0 : 3,
  }));

  return (
    <PanGestureHandler onGestureEvent={gestureHandler}>
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
          </View>
        </View>
      </Animated.View>
    </PanGestureHandler>
  );
};

export default NotificationItem;
