import { CartItem, PreviousOrder } from "@/lib/types";
import { X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View
} from "react-native";

interface OrderNotesModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: PreviousOrder | null;
}

// Helper to truncate long order IDs
const truncateOrderId = (orderId: string, maxLength: number = 12) => {
  if (orderId.length <= maxLength) return orderId;
  return `${orderId.slice(0, maxLength)}...`;
};

const ModifierItem = ({ item }: { item: CartItem }) => (
  <View style={itemStyles.card}>
    <View className="flex-row justify-between items-center">
      <Text className="text-xl font-bold text-white">{item.name}</Text>
      <View style={itemStyles.quantityBadge}>
        <Text className="font-semibold text-base text-gray-200">
          {item.quantity} PCs
        </Text>
      </View>
    </View>

    {item.customizations?.modifiers &&
      item.customizations.modifiers.length > 0 && (
        <View className="mt-3">
          {item.customizations.modifiers.map((mod, index) => (
            <View key={index} className="mt-1">
              <Text className="font-bold text-base text-gray-400">
                {mod.categoryName}:
              </Text>
              <Text className="text-base text-gray-300 ml-1.5">
                {mod.options
                  .map(
                    (opt) =>
                      `${opt.name}${
                        opt.price > 0 ? ` (+$${opt.price.toFixed(2)})` : ""
                      }`
                  )
                  .join(", ")}
              </Text>
            </View>
          ))}
        </View>
      )}

    {item.customizations?.notes && (
      <View className="mt-3">
        <Text className="font-bold text-base text-gray-400 mb-1.5">Notes:</Text>
        <View style={itemStyles.notesContainer}>
          <View style={itemStyles.notesAccent} />
          <View style={itemStyles.notesContent}>
            <Text className="text-base text-gray-300 italic">
              {item.customizations.notes}
            </Text>
          </View>
        </View>
      </View>
    )}
  </View>
);

const itemStyles = StyleSheet.create({
  card: {
    backgroundColor: "#252525",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#3f3f3f",
  },
  quantityBadge: {
    backgroundColor: "#3f3f3f",
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 8,
  },
  notesContainer: {
    flexDirection: "row",
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    overflow: "hidden",
  },
  notesAccent: {
    width: 3,
    backgroundColor: "#3B82F6",
  },
  notesContent: {
    flex: 1,
    padding: 12,
  },
});

const ANIMATION_DURATION = 280;
const SWIPE_THRESHOLD = 100; // Minimum swipe distance to close

const OrderNotesModal: React.FC<OrderNotesModalProps> = ({
  isOpen,
  onClose,
  order,
}) => {
  const slideAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.98)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const [isVisible, setIsVisible] = useState(false);
  const [closeButtonPressed, setCloseButtonPressed] = useState(false);

  // Pan responder for drag gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        // Only respond to vertical gestures
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        // Only allow dragging down (positive dy)
        if (gestureState.dy > 0) {
          dragY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > SWIPE_THRESHOLD) {
          // Swipe down past threshold - close the sheet
          onClose();
        } else {
          // Spring back to original position
          Animated.spring(dragY, {
            toValue: 0,
            useNativeDriver: true,
            tension: 100,
            friction: 10,
          }).start();
        }
      },
    })
  ).current;

  useEffect(() => {
    if (isOpen) {
      setIsVisible(true);
      dragY.setValue(0); // Reset drag position
      // Animate in: slide up, scale up, and fade in backdrop
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
      ]).start();
    } else {
      // Animate out: slide down, scale down, and fade out backdrop
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 1,
          duration: ANIMATION_DURATION,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.98,
          duration: ANIMATION_DURATION,
          easing: Easing.in(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: ANIMATION_DURATION,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsVisible(false);
      });
    }
  }, [isOpen, slideAnim, scaleAnim, fadeAnim, dragY]);

  if (!isVisible || !order) return null;

  return (
    <View style={styles.container}>
      {/* Semi-transparent backdrop */}
      <Animated.View style={[styles.backdrop, { opacity: fadeAnim }]}>
        <Pressable style={styles.backdropPressable} onPress={onClose} />
      </Animated.View>

      {/* Bottom sheet */}
      <Animated.View
        style={[
          styles.sheet,
          {
            transform: [
              {
                translateY: Animated.add(
                  slideAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0, 500],
                  }),
                  dragY
                ),
              },
              { scale: scaleAnim },
            ],
          },
        ]}
      >
        {/* Drag Handle - swipe down to close */}
        <Animated.View
          style={styles.dragHandleContainer}
          {...panResponder.panHandlers}
        >
          <View style={styles.dragHandle} />
        </Animated.View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Order Notes & Modifiers</Text>
          <Pressable
            onPress={onClose}
            onPressIn={() => setCloseButtonPressed(true)}
            onPressOut={() => setCloseButtonPressed(false)}
            style={[
              styles.closeButton,
              closeButtonPressed && styles.closeButtonPressed,
            ]}
          >
            <X color={closeButtonPressed ? "#3B82F6" : "#9CA3AF"} size={24} />
          </Pressable>
        </View>

        {/* Content */}
        <View style={styles.content}>
          {/* Order Info Badge */}
          <View style={styles.orderInfoBadge}>
            <Text style={styles.orderInfoText}>
              Order #{truncateOrderId(order.orderId)}
            </Text>
            <View style={styles.orderInfoDivider} />
            <Text style={styles.orderTotalText}>
              Total ${order.total.toFixed(2)}
            </Text>
          </View>

          <ScrollView
            style={styles.scrollView}
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            {/* Order-level notes */}
            {order.notes && (
              <View style={styles.orderNotesContainer}>
                <Text style={styles.orderNotesLabel}>Order Notes:</Text>
                <View style={styles.orderNotesBox}>
                  <View style={styles.orderNotesAccent} />
                  <Text style={styles.orderNotesText}>{order.notes}</Text>
                </View>
              </View>
            )}

            {/* Items with their notes */}
            <View style={styles.itemsList}>
              {order.items.map((item) => (
                <ModifierItem key={item.id} item={item} />
              ))}
            </View>
          </ScrollView>
        </View>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 1000,
  },
  backdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
  },
  backdropPressable: {
    flex: 1,
  },
  sheet: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    maxHeight: "80%",
    backgroundColor: "#303030",
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    borderTopWidth: 1,
    borderLeftWidth: 1,
    borderRightWidth: 1,
    borderColor: "#374151",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 10,
  },
  dragHandleContainer: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
  },
  dragHandle: {
    width: 40,
    height: 4,
    backgroundColor: "#525252",
    borderRadius: 2,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#374151",
  },
  headerTitle: {
    fontSize: 22,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  closeButton: {
    padding: 10,
    borderRadius: 20,
    backgroundColor: "transparent",
  },
  closeButtonPressed: {
    backgroundColor: "rgba(59, 130, 246, 0.15)",
  },
  content: {
    flexShrink: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
    paddingBottom: 24,
  },
  orderInfoBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#252525",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    marginBottom: 16,
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#3f3f3f",
  },
  orderInfoText: {
    fontSize: 15,
    fontWeight: "600",
    color: "#9CA3AF",
  },
  orderInfoDivider: {
    width: 1,
    height: 16,
    backgroundColor: "#525252",
    marginHorizontal: 12,
  },
  orderTotalText: {
    fontSize: 15,
    fontWeight: "700",
    color: "#22C55E",
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 8,
  },
  itemsList: {
    gap: 12,
  },
  orderNotesContainer: {
    marginBottom: 16,
  },
  orderNotesLabel: {
    fontSize: 14,
    fontWeight: "600",
    color: "#9CA3AF",
    marginBottom: 8,
  },
  orderNotesBox: {
    flexDirection: "row",
    backgroundColor: "#1a1a1a",
    borderRadius: 8,
    overflow: "hidden",
  },
  orderNotesAccent: {
    width: 3,
    backgroundColor: "#F59E0B",
  },
  orderNotesText: {
    flex: 1,
    padding: 12,
    fontSize: 15,
    color: "#E5E7EB",
    fontStyle: "italic",
  },
});

export default OrderNotesModal;