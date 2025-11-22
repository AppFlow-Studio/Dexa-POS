import { Notification } from "@/lib/types";
import { formatDistanceToNow } from "date-fns";
import React from "react";
import { Text, View } from "react-native";
import { getNotificationAppearance } from "@/lib/notificationUtils";
import { PanGestureHandler } from "react-native-gesture-handler";
import Animated, {
  useAnimatedGestureHandler,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  runOnJS,
} from "react-native-reanimated";
import { XCircle } from "lucide-react-native";

interface NotificationItemProps {
  notification: Notification;
  onDelete: (id: string) => void;
}

const NotificationItem: React.FC<NotificationItemProps> = ({
  notification,
  onDelete,
}) => {
  const { icon: Icon, color, title } = getNotificationAppearance(
    notification.type
  );

  const translateX = useSharedValue(0);
  const itemHeight = useSharedValue(88); // Approximate height

  const gestureHandler = useAnimatedGestureHandler({
    onStart: (_, ctx: any) => {
      ctx.startX = translateX.value;
    },
    onActive: (event, ctx: any) => {
      translateX.value = ctx.startX + event.translationX;
    },
    onEnd: () => {
      if (translateX.value < -100) {
        translateX.value = withTiming(-500);
        itemHeight.value = withTiming(0, undefined, (isFinished) => {
          if (isFinished) {
            runOnJS(onDelete)(notification.id);
          }
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
    marginVertical: itemHeight.value === 0 ? 0 : 4,
  }));

  return (
    <PanGestureHandler onGestureEvent={gestureHandler}>
      <Animated.View style={animatedStyle}>
        <View
          className={`p-4 flex-row items-start gap-4 rounded-lg ${
            !notification.isRead ? "bg-[#2A2A2A]" : "bg-[#1F1F1F]"
          }`}
          style={{ borderLeftColor: color, borderLeftWidth: 4 }}
        >
          <View
            className="w-10 h-10 rounded-full items-center justify-center"
            style={{ backgroundColor: `${color}20` }}
          >
            <Icon size={24} color={color} />
          </View>
          <View className="flex-1">
            <View className="flex-row justify-between items-start">
              <Text className="text-white font-bold text-base flex-1 pr-2">
                {title}
              </Text>
              <Text className="text-gray-400 text-xs">
                {formatDistanceToNow(new Date(notification.timestamp), {
                  addSuffix: true,
                })}
              </Text>
            </View>
            <Text className="text-gray-300 text-sm mt-1">
              {notification.message}
            </Text>
          </View>
        </View>
      </Animated.View>
    </PanGestureHandler>
  );
};

export default NotificationItem;
