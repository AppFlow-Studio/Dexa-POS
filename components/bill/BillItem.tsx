import { CartItem } from "@/lib/types";
import {
  selectSetSelectedItemPosition,
  useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import {
  useItemSyncError,
  useItemSyncStatus,
} from "@/stores/useSyncStatusStore";
import { AlertCircle, Banknote, Trash2 } from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
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
  isActive?: boolean; // Highlight when being edited in modifier panel
}

const DELETE_BUTTON_WIDTH = 90;

// Type for modifier structure
interface ModifierDisplay {
  categoryId: string;
  categoryName?: string;
  options: Array<{ id: string; name: string; price: number }>;
}

/**
 * ModifiersList - Memoized component for rendering item modifiers
 * PERFORMANCE: Extracted to avoid recreating nested maps on every render
 */
const ModifiersList = React.memo<{ modifiers: ModifierDisplay[] }>(
  ({ modifiers }) => (
    <View className="py-1">
      {modifiers.map((modifier, index) => (
        <View key={`mod-${index}`} className="ml-4">
          {modifier.options.length > 0 && (
            <View className="flex flex-row flex-wrap items-center mb-1">
              {modifier.categoryName && (
                <Text className="text-sm font-medium text-gray-300">
                  {modifier.categoryName}:
                </Text>
              )}
              {modifier.options.map((option, optionIndex) => (
                <View
                  key={`opt-${optionIndex}`}
                  className="flex-row justify-between items-center ml-1"
                >
                  <Text className="text-sm text-gray-200">
                    {option.name}
                    {optionIndex < modifier.options.length - 1 && " • "}
                  </Text>
                  {option.price > 0 && (
                    <Text className="text-sm font-medium ml-1 text-green-400">
                      +${option.price.toFixed(2)}
                      {optionIndex < modifier.options.length - 1 && ","}
                    </Text>
                  )}
                </View>
              ))}
            </View>
          )}
        </View>
      ))}
    </View>
  ),
  (prev, next) => {
    // Deep comparison for modifiers array - compare actual option content
    if (prev.modifiers.length !== next.modifiers.length) return false;

    for (let i = 0; i < prev.modifiers.length; i++) {
      const prevMod = prev.modifiers[i];
      const nextMod = next.modifiers[i];

      if (prevMod.categoryId !== nextMod.categoryId) return false;
      if (prevMod.options.length !== nextMod.options.length) return false;

      // Compare actual option IDs and names to detect changes
      for (let j = 0; j < prevMod.options.length; j++) {
        if (prevMod.options[j].id !== nextMod.options[j].id) return false;
        if (prevMod.options[j].name !== nextMod.options[j].name) return false;
      }
    }

    return true;
  },
);

const BillItemComponent: React.FC<BillItemProps> = ({
  item,
  isEditable = false,
  isActive = false,
}) => {
  // FIXED: Use selectors instead of destructuring to avoid subscribing to entire store
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const removeItemFromActiveOrder = useOrderStore(
    (s) => s.removeItemFromActiveOrder,
  );
  const openToView = useModifierSidebarStore((s) => s.openToView);
  const openToEdit = useModifierSidebarStore((s) => s.openToEdit);
  const setSelectedItemPosition = useModifierSidebarStore(
    selectSetSelectedItemPosition,
  );

  // Phase 7D: Sync status from dedicated store (not from item)
  // This prevents re-renders of other components when sync status changes
  const syncStatus = useItemSyncStatus(item.id);
  const syncError = useItemSyncError(item.id);

  // PERF: Only subscribe to payments array - prevents re-render when other order fields change
  const payments = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.payments ?? null;
  });

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

  // Delete button opacity - only visible when swiping
  const deleteButtonStyle = useAnimatedStyle(() => ({
    opacity:
      translateX.value < -10
        ? withTiming(1, { duration: 100 })
        : withTiming(0, { duration: 100 }),
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
    [translateX],
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
      }, 50);
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
      }, 50);
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

    if (isEditable && !isKitchenItem) {
      // Use attached panel mode (not fullscreen) to show arrow pointing to bill item
      openToEdit(item, activeOrderId);
    } else {
      openToView(item, activeOrderId);
    }
  };

  // Check if item is voided (moved before paymentCoverage useMemo)
  const isVoided = item.is_voided === true;

  // PERF: Single memoized computation for all payment coverage data
  // Replaces two inline IIFEs that ran O(n*m) on every render
  const paymentCoverage = useMemo(() => {
    if (isVoided || !payments) {
      return {
        isFullyPaid: false,
        isPartiallyPaid: false,
        isFullyRefunded: false,
        isPartiallyRefunded: false,
        netCoveredQty: 0,
        refundedQty: 0,
        methodLabel: "",
        primaryMethod: "",
        isSplitMethod: false,
        hasRefundHistory: false,
        hasRepaid: false,
        repaidMethodLabel: "",
      };
    }

    let coveredQty = 0;
    const methodQtyMap: Record<string, number> = {};

    for (const payment of payments) {
      if (payment.isVoided) continue;
      for (const covered of payment.itemsCovered ?? []) {
        if (covered.itemId === item.id || covered.itemId === item.db_order_item_id) {
          coveredQty += covered.quantity;
          const m = payment.method ?? "Unknown";
          methodQtyMap[m] = (methodQtyMap[m] ?? 0) + covered.quantity;
        }
      }
    }

    const refundedQty = item.refundedQuantity ?? 0;
    const netCoveredQty = coveredQty - refundedQty;
    const hasRefundHistory = refundedQty > 0;

    let primaryMethod = "";
    let maxQty = 0;
    let methodCount = 0;
    for (const [method, qty] of Object.entries(methodQtyMap)) {
      methodCount++;
      if (qty > maxQty) {
        maxQty = qty;
        primaryMethod = method;
      }
    }
    const isSplitMethod = methodCount > 1;
    const methodLabel = isSplitMethod ? "SPLIT" : primaryMethod.toUpperCase();

    const isFullyRefunded = hasRefundHistory && netCoveredQty <= 0;
    const isPartiallyRefunded = hasRefundHistory && netCoveredQty > 0;
    const isFullyPaid = netCoveredQty >= item.quantity;
    const isPartiallyPaid = netCoveredQty > 0 && netCoveredQty < item.quantity;

    // Repaid after refund data
    const methods = Object.keys(methodQtyMap);
    const repaidMethodLabel = methods.length > 1 ? "Split" : (methods[0] ?? "");
    const hasRepaid = hasRefundHistory && isFullyPaid;

    return {
      isFullyPaid,
      isPartiallyPaid,
      isFullyRefunded,
      isPartiallyRefunded,
      netCoveredQty,
      refundedQty,
      methodLabel,
      primaryMethod,
      isSplitMethod,
      hasRefundHistory,
      hasRepaid,
      repaidMethodLabel,
    };
  }, [payments, item.id, item.db_order_item_id, item.quantity, item.refundedQuantity, isVoided]);

  // Check if item has any modifiers to show
  const hasModifiers =
    (item.customizations.modifiers &&
      item.customizations.modifiers.length > 0) ||
    item.customizations.notes;

  return (
    <View
      ref={itemRef}
      className={`rounded-xl overflow-hidden ${
        isActive
          ? "border-2 border-blue-400 bg-blue-500/5"
          : isVoided
            ? "border bg-[#2a2020] border-red-900/50 opacity-60"
            : "border bg-[#303030] border-gray-600"
      }`}
      style={
        isActive
          ? {
              shadowColor: "#3B82F6",
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.5,
              shadowRadius: 8,
              elevation: 8,
            }
          : undefined
      }
    >
      {isEditable && !isVoided && (
        <Animated.View
          style={deleteButtonStyle}
          className="absolute top-0 right-1 h-full justify-center items-end self-center z-10"
        >
          <TouchableOpacity
            onPress={handleDelete}
            className="w-20 h-[85%] bg-red-500 items-center rounded-lg justify-center"
          >
            <Trash2 color="white" size={20} />
          </TouchableOpacity>
        </Animated.View>
      )}

      <GestureDetector gesture={isVoided ? Gesture.Pan() : pan}>
        <Animated.View
          style={animatedStyle}
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
                  {/* Paid/Refunded status badges - from memoized paymentCoverage */}
                  {!isVoided && paymentCoverage.isFullyRefunded && (
                    <View className="bg-red-600/20 px-2 py-0.5 rounded mr-2">
                      <Text className="text-red-400 text-xs font-bold">
                        REFUNDED
                      </Text>
                    </View>
                  )}
                  {!isVoided && paymentCoverage.isPartiallyRefunded && paymentCoverage.isFullyPaid && (
                    <View className="bg-orange-600/20 px-2 py-0.5 rounded mr-2">
                      <Text className="text-orange-400 text-xs font-bold">
                        {paymentCoverage.refundedQty} REFUNDED
                      </Text>
                    </View>
                  )}
                  {!isVoided && !paymentCoverage.isFullyRefunded && !(paymentCoverage.isPartiallyRefunded && paymentCoverage.isFullyPaid) && paymentCoverage.isFullyPaid && (
                    <View className="flex-row items-center bg-green-600/20 px-2 py-0.5 rounded mr-2">
                      {paymentCoverage.primaryMethod === "Cash" && !paymentCoverage.isSplitMethod && (
                        <Banknote size={12} color="#4ADE80" style={{ marginRight: 3 }} />
                      )}
                      <Text className="text-green-400 text-xs font-bold">
                        PAID {paymentCoverage.methodLabel}
                      </Text>
                    </View>
                  )}
                  {!isVoided && paymentCoverage.isPartiallyPaid && (
                    <View className="bg-yellow-600/20 px-2 py-0.5 rounded mr-2">
                      <Text className="text-yellow-400 text-xs font-bold">
                        {paymentCoverage.netCoveredQty}/{item.quantity} PAID
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
                  {/* Sync status indicator - Phase 7D: from dedicated store */}
                  {syncStatus === "pending" || syncStatus === "syncing" ? (
                    <ActivityIndicator
                      size={10}
                      color="#60A5FA"
                      style={{ marginLeft: 12 }}
                    />
                  ) : syncStatus === "failed" ? (
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
                {/* Refund-then-repay sub-text - from memoized paymentCoverage */}
                {paymentCoverage.hasRepaid && (
                  <Text className="text-gray-500 text-[10px] italic mt-0.5">
                    Refunded → Re-paid {paymentCoverage.repaidMethodLabel}
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
              <Animated.View className="overflow-hidden">
                <View className="px-2 border-t border-gray-600">
                  {/* OPTIMIZED: Use memoized ModifiersList component */}
                  {item.customizations.modifiers &&
                    item.customizations.modifiers.length > 0 && (
                      <ModifiersList
                        modifiers={item.customizations.modifiers}
                      />
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
// Phase 7D: sync_status is now in useSyncStatusStore, not on item
// BillItem re-renders for sync status changes via its own useItemSyncStatus subscription
const BillItem = React.memo(BillItemComponent, (prev, next) => {
  // Return true if props are equal (skip re-render)
  // Quick checks first
  // Note: sync_status removed - it's now managed by useSyncStatusStore
  if (
    prev.item.id !== next.item.id ||
    prev.item.quantity !== next.item.quantity ||
    prev.item.price !== next.item.price ||
    prev.item.is_voided !== next.item.is_voided ||
    prev.item.void_reason !== next.item.void_reason ||
    prev.item.paidQuantity !== next.item.paidQuantity ||
    prev.item.refundedQuantity !== next.item.refundedQuantity ||
    prev.item.kitchen_status !== next.item.kitchen_status ||
    prev.item.isDraft !== next.item.isDraft ||
    prev.item.customizations?.notes !== next.item.customizations?.notes ||
    prev.isEditable !== next.isEditable ||
    prev.isActive !== next.isActive
  ) {
    return false;
  }

  // Deep compare modifiers - check actual option IDs, not just length
  const prevModifiers = prev.item.customizations?.modifiers || [];
  const nextModifiers = next.item.customizations?.modifiers || [];

  if (prevModifiers.length !== nextModifiers.length) return false;

  for (let i = 0; i < prevModifiers.length; i++) {
    const prevMod = prevModifiers[i];
    const nextMod = nextModifiers[i];

    if (prevMod.categoryId !== nextMod.categoryId) return false;
    if (prevMod.options.length !== nextMod.options.length) return false;

    // Compare actual option IDs to detect when options change
    for (let j = 0; j < prevMod.options.length; j++) {
      if (prevMod.options[j].id !== nextMod.options[j].id) return false;
    }
  }

  return true;
});

export default BillItem;
