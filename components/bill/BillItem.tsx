import { CartItem } from "@/lib/types";
import {
  selectSetSelectedItemPosition,
  useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { AlertCircle, Trash2 } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import VoidItemDialog from "./VoidItemDialog";

interface BillItemProps {
  item: CartItem;
  isEditable?: boolean;
}

const DELETE_BUTTON_WIDTH = 90;

const BillItemComponent: React.FC<BillItemProps> = ({ item, isEditable = false }) => {
  // FIXED: Use selectors instead of destructuring to avoid subscribing to entire store
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const removeItemFromActiveOrder = useOrderStore((s) => s.removeItemFromActiveOrder);
  const openToView = useModifierSidebarStore((s) => s.openToView);
  const openFullscreenEdit = useModifierSidebarStore((s) => s.openFullscreenEdit);
  const setSelectedItemPosition = useModifierSidebarStore(selectSetSelectedItemPosition);

  // Ref for position tracking (attached modifier panel positioning)
  const itemRef = useRef<View>(null);

  const translateX = useSharedValue(0);
  const [showVoidDialog, setShowVoidDialog] = useState(false);

  // Reset animation when item becomes voided
  useEffect(() => {
    if (item.is_voided) {
      translateX.value = withTiming(0);
    }
  }, [item.is_voided]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Pan gesture to reveal delete
  // OPTIMIZED: Memoize gesture to prevent recreation on each render
  const MAX_LEFT = -DELETE_BUTTON_WIDTH;
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onUpdate((e) => {
          const next = Math.max(MAX_LEFT, Math.min(0, e.translationX));
          translateX.value = next;
        })
        .onEnd(() => {
          const shouldOpen = translateX.value < MAX_LEFT / 2;
          translateX.value = withTiming(shouldOpen ? MAX_LEFT : 0);
        })
        .activeOffsetX([-20, 20]) // Only activate if horizontal movement exceeds 20px
        .failOffsetY([-20, 20]), // Fail if vertical movement exceeds 20px
    [translateX]
  );

  // Check if item is in draft/new state (simple delete) or in kitchen (needs void reason)
  const isKitchenItem =
    item.kitchen_status === "sent" ||
    item.kitchen_status === "ready" ||
    item.kitchen_status === "served";

  const handleDelete = () => {
    if (!activeOrderId) return;

    if (item.isDraft || !isKitchenItem) {
      // Draft or new item - animate back then remove
      translateX.value = withTiming(0);
      // Delay removal to allow animation to complete
      setTimeout(() => {
        removeItemFromActiveOrder(item.id);
      }, 200);
    } else {
      // Kitchen item - show void reason dialog
      setShowVoidDialog(true);
    }
  };

  const handleConfirmVoid = (reason: string) => {
    // Reset animation first, before any state changes
    translateX.value = withTiming(0);
    setShowVoidDialog(false);

    // Delay the void operation to allow animation to complete
    if (activeOrderId) {
      setTimeout(() => {
        removeItemFromActiveOrder(item.id, reason);
      }, 200);
    }
  };

  const handleCancelVoid = () => {
    setShowVoidDialog(false);
    // Reset slide position
    translateX.value = withTiming(0);
  };

  // Capture item position for attached modifier panel positioning
  const captureItemPosition = useCallback(() => {
    if (itemRef.current) {
      itemRef.current.measureInWindow((x, y, width, height) => {
        setSelectedItemPosition({
          y,
          height,
          absoluteY: y, // Absolute Y position on screen
        });
      });
    }
  }, [setSelectedItemPosition]);

  const handleNotesPress = (e: any) => {
    e.stopPropagation();

    // Capture position before opening modifier for attached panel positioning
    captureItemPosition();

    if (isEditable) {
      openFullscreenEdit(item, activeOrderId);
    } else {
      openToView(item, activeOrderId);
    }
  };

  // Check if item has any modifiers to show
  const hasModifiers =
    (item.customizations.modifiers &&
      item.customizations.modifiers.length > 0) ||
    item.customizations.notes;

  // Check if item is voided
  const isVoided = item.is_voided === true;

  return (
    <View
      ref={itemRef}
      className={`rounded-xl overflow-hidden border ${
        isVoided
          ? "bg-[#2a2020] border-red-900/50 opacity-60"
          : "bg-[#303030] border-gray-600"
      }`}
    >
      {isEditable && !isVoided && (
        <View className="absolute top-0 right-1 h-full justify-center items-end self-center z-10">
          <TouchableOpacity
            onPress={handleDelete}
            className="w-20 h-[85%] bg-red-500 items-center rounded-lg justify-center"
          >
            <Trash2 color="white" size={20} />
          </TouchableOpacity>
        </View>
      )}

      <GestureDetector gesture={isVoided ? Gesture.Pan() : pan}>
        <Animated.View
          style={isVoided ? undefined : animatedStyle}
          className={isVoided ? "bg-[#2a2020]" : "bg-[#303030] z-20"}
        >
          <TouchableOpacity
            onPress={isVoided ? undefined : handleNotesPress}
            activeOpacity={isVoided ? 1 : 0.9}
            disabled={isVoided}
          >
            <View className="flex-row items-center py-2 px-2">
              <View className="flex-1">
                <View className="flex-row items-center flex-wrap">
                  {isVoided && (
                    <View className="bg-red-600 px-2 py-0.5 rounded mr-2">
                      <Text className="text-white text-xs font-bold">VOID</Text>
                    </View>
                  )}
                  {/* Paid status badge */}
                  {!isVoided &&
                    item.paidQuantity > 0 &&
                    item.paidQuantity >= item.quantity && (
                      <View className="bg-green-600/20 px-2 py-0.5 rounded mr-2">
                        <Text className="text-green-400 text-xs font-bold">
                          PAID
                        </Text>
                      </View>
                    )}
                  {!isVoided &&
                    item.paidQuantity > 0 &&
                    item.paidQuantity < item.quantity && (
                      <View className="bg-yellow-600/20 px-2 py-0.5 rounded mr-2">
                        <Text className="text-yellow-400 text-xs font-bold">
                          {item.paidQuantity}/{item.quantity} PAID
                        </Text>
                      </View>
                    )}
                  <Text
                    className={`font-semibold text-base ${
                      isVoided ? "text-gray-500 line-through" : "text-white"
                    }`}
                  >
                    {item.name}
                  </Text>
                  {/* Sync status indicator */}
                  {item.sync_status === "pending" ||
                  item.sync_status === "syncing" ? (
                    <ActivityIndicator
                      size={10}
                      color="#60A5FA"
                      style={{ marginLeft: 12 }}
                    />
                  ) : item.sync_status === "failed" ? (
                    <AlertCircle
                      size={16}
                      color="#EF4444"
                      style={{ marginLeft: 6 }}
                    />
                  ) : null}
                  <Text
                    className={`text-sm ml-3 ${
                      isVoided ? "text-gray-600 line-through" : "text-gray-300"
                    }`}
                  >
                    {item.quantity} X
                  </Text>
                </View>
                {isVoided && item.void_reason && (
                  <Text className="text-red-400/70 text-xs mt-1 italic">
                    Reason: {item.void_reason}
                  </Text>
                )}
                <View className="flex-row items-center">
                  {/* {!item.isDraft && (...)} */}
                </View>
              </View>
              <Text
                className={`font-semibold text-lg ${
                  isVoided ? "text-gray-500 line-through" : "text-white"
                }`}
              >
                ${(item.price * item.quantity).toFixed(2)}
              </Text>
            </View>

            {hasModifiers && (
              <Animated.View className={`overflow-hidden `}>
                <View className="px-2 border-t border-gray-600">
                  {/* Modifiers */}
                  {item.customizations.modifiers &&
                    item.customizations.modifiers.length > 0 && (
                      <View className=" py-1">
                        {item.customizations.modifiers.map(
                          (modifier, index) => (
                            <View key={index} className="ml-4">
                              {modifier.options.length > 0 && (
                                <View
                                  key={index}
                                  className="flex flex-row flex-wrap items-center mb-1"
                                >
                                  {/* Only show category name if it exists */}
                                  {modifier.categoryName && (
                                    <Text className="text-sm font-medium text-gray-300 ">
                                      {modifier.categoryName}:
                                    </Text>
                                  )}
                                  {modifier.options.map(
                                    (option, optionIndex) => {
                                      return (
                                        <View
                                          key={optionIndex}
                                          className="flex-row justify-between items-center ml-1"
                                        >
                                          <Text className="text-sm text-gray-200">
                                            {option.name}
                                            {optionIndex <
                                              modifier.options.length - 1 &&
                                              " • "}
                                          </Text>
                                          {option.price > 0 && (
                                            <Text className="text-sm font-medium ml-1 text-green-400">
                                              +${option.price.toFixed(2)}{" "}
                                              {optionIndex <
                                                modifier.options.length - 1 &&
                                                ","}
                                            </Text>
                                          )}
                                        </View>
                                      );
                                    }
                                  )}
                                </View>
                              )}
                            </View>
                          )
                        )}
                      </View>
                    )}

                  {item.customizations.notes && (
                    <View className="py-0.5">
                      <Text className="text-sm text-gray-300">Notes:</Text>
                      <Text className="text-sm text-gray-200 ml-2 italic">
                        {item.customizations.notes}
                      </Text>
                    </View>
                  )}
                </View>
              </Animated.View>
            )}
          </TouchableOpacity>
        </Animated.View>
      </GestureDetector>

      {/* Void Item Dialog */}
      <VoidItemDialog
        isOpen={showVoidDialog}
        itemName={item.name}
        onConfirm={handleConfirmVoid}
        onCancel={handleCancelVoid}
      />
    </View>
  );
};

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const BillItem = React.memo(BillItemComponent, (prev, next) => {
  // Return true if props are equal (skip re-render)
  return (
    prev.item.id === next.item.id &&
    prev.item.quantity === next.item.quantity &&
    prev.item.price === next.item.price &&
    prev.item.is_voided === next.item.is_voided &&
    prev.item.void_reason === next.item.void_reason &&
    prev.item.sync_status === next.item.sync_status &&
    prev.item.paidQuantity === next.item.paidQuantity &&
    prev.item.kitchen_status === next.item.kitchen_status &&
    prev.item.isDraft === next.item.isDraft &&
    // OPTIMIZED: Deep compare customizations instead of reference comparison
    prev.item.customizations?.notes === next.item.customizations?.notes &&
    prev.item.customizations?.modifiers?.length === next.item.customizations?.modifiers?.length &&
    prev.isEditable === next.isEditable
  );
});

export default BillItem;
