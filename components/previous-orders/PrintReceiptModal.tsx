import { OrderProfile } from "@/lib/types";
import { PrinterService } from "@/services/printing/PrinterService";
import { SelectedLocation } from "@/stores/useStoreSettingsStore";
import { Printer, X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Easing,
  PanResponder,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface PrintReceiptModalProps {
  isOpen: boolean;
  onClose: () => void;
  order: OrderProfile | null;
  location: SelectedLocation | null;
}

const ReceiptRow = ({
  label,
  value,
  bold = false,
}: {
  label: string;
  value: string | number;
  bold?: boolean;
}) => (
  <View className="flex-row justify-between items-center py-2.5 border-b border-[#3f3f3f]">
    <Text className={`text-base text-gray-400 ${bold ? "font-bold text-lg" : ""}`}>
      {label}
    </Text>
    <Text className={`text-base font-semibold text-gray-200 ${bold ? "font-bold text-lg" : ""}`}>
      {value}
    </Text>
  </View>
);

const ANIMATION_DURATION = 280;
const SWIPE_THRESHOLD = 100;

const PrintReceiptModal: React.FC<PrintReceiptModalProps> = ({
  isOpen,
  onClose,
  order,
  location,
}) => {
  const slideAnim = useRef(new Animated.Value(1)).current;
  const scaleAnim = useRef(new Animated.Value(0.98)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const dragY = useRef(new Animated.Value(0)).current;
  const [isVisible, setIsVisible] = useState(false);
  const [closeButtonPressed, setCloseButtonPressed] = useState(false);
  const [isPrinting, setIsPrinting] = useState(false);

  // Pan responder for drag gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, gestureState) => {
        return Math.abs(gestureState.dy) > Math.abs(gestureState.dx);
      },
      onPanResponderMove: (_, gestureState) => {
        if (gestureState.dy > 0) {
          dragY.setValue(gestureState.dy);
        }
      },
      onPanResponderRelease: (_, gestureState) => {
        if (gestureState.dy > SWIPE_THRESHOLD) {
          onClose();
        } else {
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
      dragY.setValue(0);
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

  // Create a simplified summary for the receipt
  const nonVoidedItems = (order.items || []).filter((item) => !item.is_voided);
  const receiptSummary = nonVoidedItems.reduce(
    (acc, item) => {
      const existing = acc.find((i) => i.name === item.name);
      if (existing) {
        existing.quantity += item.quantity;
        existing.totalPrice += item.price * item.quantity;
      } else {
        acc.push({
          name: item.name,
          quantity: item.quantity,
          totalPrice: item.price * item.quantity,
        });
      }
      return acc;
    },
    [] as { name: string; quantity: number; totalPrice: number }[]
  );

  const handlePrintReceipt = async () => {
    if (!order || !location) return;
    setIsPrinting(true);
    try {
      const success = await PrinterService.printReceipt(order, location);
      if (success) {
        onClose();
      }
    } catch (e) {
      console.warn("[PrintReceiptModal] Print failed:", e);
    } finally {
      setIsPrinting(false);
    }
  };

  return (
    <View className="absolute inset-0 z-[1000]">
      {/* Semi-transparent backdrop */}
      <Animated.View
        className="absolute inset-0 bg-black/40"
        style={{ opacity: fadeAnim }}
      >
        <Pressable className="flex-1" onPress={onClose} />
      </Animated.View>

      {/* Bottom sheet */}
      <Animated.View
        className="absolute bottom-0 left-0 right-0 bg-[#303030] rounded-t-2xl border-t border-l border-r border-gray-700"
        style={{
          maxHeight: "85%",
          shadowColor: "#000",
          shadowOffset: { width: 0, height: -4 },
          shadowOpacity: 0.25,
          shadowRadius: 8,
          elevation: 10,
          transform: [
            {
              translateY: Animated.add(
                slideAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: [0, 600],
                }),
                dragY
              ),
            },
            { scale: scaleAnim },
          ],
        }}
      >
        {/* Drag Handle */}
        <Animated.View
          className="items-center pt-3 pb-1"
          {...panResponder.panHandlers}
        >
          <View className="w-10 h-1 bg-gray-600 rounded-sm" />
        </Animated.View>

        {/* Header */}
        <View className="flex-row justify-between items-center px-6 py-4 border-b border-gray-700">
          <Text className="text-2xl font-bold text-white">Print Receipt</Text>
          <Pressable
            onPress={onClose}
            onPressIn={() => setCloseButtonPressed(true)}
            onPressOut={() => setCloseButtonPressed(false)}
            className={`p-2.5 rounded-full ${closeButtonPressed ? "bg-blue-500/15" : ""}`}
          >
            <X color={closeButtonPressed ? "#3B82F6" : "#9CA3AF"} size={24} />
          </Pressable>
        </View>

        {/* Receipt Content */}
        <ScrollView
          className="shrink"
          contentContainerStyle={{ padding: 24, paddingBottom: 8 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Receipt Card */}
          <View className="bg-[#252525] rounded-xl p-4 border border-[#3f3f3f]">
            <ReceiptRow label="Order #" value={order.display_number || order.order_number || `#${order.id.slice(-4)}`} />
            <ReceiptRow
              label="Table"
              value={order.service_location_name || "N/A"}
            />
            <ReceiptRow label="Type" value={order.order_type || "Dine In"} />

            <View className="h-4 border-b border-gray-600" />

            <ReceiptRow label="Total Items" value={`${nonVoidedItems.length} Items`} />
            {receiptSummary.map((item) => (
              <ReceiptRow
                key={item.name}
                label={`${item.quantity}x ${item.name}`}
                value={`$${item.totalPrice.toFixed(2)}`}
              />
            ))}

            <View className="h-4 border-b border-gray-600" />

            <ReceiptRow label="Subtotal" value={`$${receiptSummary.reduce((sum, i) => sum + i.totalPrice, 0).toFixed(2)}`} />
            <ReceiptRow label="Tax" value={`$${(order.total_tax || 0).toFixed(2)}`} />
            {(order.total_discount ?? 0) > 0 && (
              <ReceiptRow label="Discount" value={`-$${(order.total_discount || 0).toFixed(2)}`} />
            )}

            <View className="h-px bg-gray-600 my-3" />
            <View className="flex-row justify-between items-center">
              <Text className="text-xl font-bold text-white">Total</Text>
              <Text className="text-xl font-bold text-green-500">
                ${(order.total_amount || 0).toFixed(2)}
              </Text>
            </View>
          </View>
        </ScrollView>

        {/* Footer with Buttons */}
        <View className="flex-row p-4 pb-6 gap-3 border-t border-gray-700">
          <TouchableOpacity
            className="flex-1 py-3.5 border border-red-500 rounded-lg items-center bg-red-500/15"
            onPress={onClose}
          >
            <Text className="text-base font-semibold text-red-500">Close</Text>
          </TouchableOpacity>
          <TouchableOpacity
            className={`flex-1 flex-row justify-center items-center gap-2 py-3.5 bg-blue-500 rounded-lg ${isPrinting ? "opacity-60" : ""}`}
            onPress={handlePrintReceipt}
            disabled={isPrinting || !location}
          >
            {isPrinting ? (
              <ActivityIndicator size="small" color="#FFFFFF" />
            ) : (
              <Printer color="#FFFFFF" size={20} />
            )}
            <Text className="text-base font-bold text-white">
              {isPrinting ? "Printing..." : "Print Receipt"}
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>
    </View>
  );
};

export default PrintReceiptModal;
