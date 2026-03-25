import { colors } from "@/lib/theme";
import React, { useEffect } from "react";
import { StyleSheet, Text, View } from "react-native";
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

export interface FlyingTicketData {
  id: string;
  orderNumber: string;
  urgencyColor: string;
  itemCount: number;
  source: { x: number; y: number; width: number; height: number };
  destination: { x: number; y: number; width: number; height: number };
}

interface KDSFlyingTicketProps {
  ticket: FlyingTicketData;
  onComplete: (id: string) => void;
}

const DURATION = 260;

const KDSFlyingTicket: React.FC<KDSFlyingTicketProps> = ({ ticket, onComplete }) => {
  const { source, destination } = ticket;

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = withTiming(1, {
      duration: DURATION,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    }, (finished) => {
      if (finished) {
        runOnJS(onComplete)(ticket.id);
      }
    });
  }, []);

  const destCenterX = destination.x + destination.width / 2;
  const destCenterY = destination.y + destination.height / 2;

  const animatedStyle = useAnimatedStyle(() => {
    const p = progress.value;
    const tx = source.x + (destCenterX - source.x - source.width / 2) * p;
    const ty = source.y + (destCenterY - source.y - source.height / 2) * p;
    const scale = 1 - 0.8 * p;
    // Fade out in the last 40% of the animation
    const opacity = p > 0.6 ? 1 - (p - 0.6) / 0.4 : 1;

    return {
      position: "absolute",
      left: tx,
      top: ty,
      width: source.width,
      height: Math.min(source.height, 60),
      transform: [{ scale }],
      opacity,
      zIndex: 200,
    };
  });

  return (
    <Animated.View style={animatedStyle}>
      <View style={[styles.card, { borderColor: ticket.urgencyColor }]}>
        <View style={[styles.header, { backgroundColor: ticket.urgencyColor }]}>
          <Text style={styles.orderNum} numberOfLines={1}>
            #{ticket.orderNumber}
          </Text>
          <Text style={styles.itemCount}>
            {ticket.itemCount} items
          </Text>
        </View>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  card: {
    borderRadius: 8,
    overflow: "hidden",
    backgroundColor: colors.skeleton,
    borderWidth: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 8,
  },
  header: {
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  orderNum: {
    color: "#fff",
    fontSize: 14,
    fontWeight: "700",
  },
  itemCount: {
    color: "#fff",
    fontSize: 11,
    fontWeight: "600",
  },
});

export default React.memo(KDSFlyingTicket);
