import { useIsNetworkDegraded } from "@/hooks/useNetworkStatus";
import { useIsActiveOrderReadOnly } from "@/lib/orderAccessControlHooks";
import { colors } from "@/lib/theme";
import { CartItem } from "@/lib/types";
import { PrinterService } from "@/services/printing/PrinterService";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import {
  getItemEffectiveSubtotal,
  useOrderStore,
} from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useItemSyncInfo } from "@/stores/useSyncStatusStore";
import { useToastStore } from "@/stores/useToastStore";
import {
  AlertCircle,
  Banknote,
  Minus,
  Plus,
  Trash2,
} from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import VoidItemDialog from "./VoidItemDialog";

interface BillItemProps {
  item: CartItem;
  isEditable?: boolean;
  isActive?: boolean; // Highlight when being edited in modifier panel
  showPaidBadge?: boolean; // Hide per-item paid badges when order-level badge already shows paid
  // Optional: pass from parent to avoid per-item store subscriptions (improves list mount perf)
  orderHasPayments?: boolean;
  payments?: any[] | null;
  isNetworkDegraded?: boolean;
}

const DELETE_BUTTON_WIDTH = 90;
const INCREMENT_BUTTON_WIDTH = 90;
const PRICE_COLUMN_WIDTH = 72;

// Type for modifier structure
interface ModifierDisplay {
  categoryId: string;
  categoryName?: string;
  options: Array<{ id: string; name: string; price: number; isNo?: boolean }>;
}

/**
 * ModifiersList - Memoized component for rendering item modifiers
 * PERFORMANCE: Extracted to avoid recreating nested maps on every render
 */
const ModifiersList = React.memo<{
  modifiers: ModifierDisplay[];
  isVoided?: boolean;
  discountFactor?: number;
}>(
  ({ modifiers, isVoided = false, discountFactor = 1 }) => (
    <View>
      {modifiers.map(
        (modifier, index) =>
          modifier.options.length > 0 &&
          modifier.options.map((option, optionIndex) => {
            const displayPrice = option.price * discountFactor;
            return (
              <View
                key={`mod-${index}-opt-${optionIndex}`}
                className="flex-row items-center my-0.5"
                style={{
                  paddingLeft: 4,
                  paddingRight: 12,
                  borderLeftColor: colors.border,
                  borderLeftWidth: 2,
                  paddingVertical: 1,
                }}
              >
                <Text
                  style={{
                    fontSize: 10,
                    color: option.isNo ? colors.danger : colors.heading,
                    flex: 1,
                  }}
                >
                  {option.isNo ? `NO ${option.name}` : option.name}
                </Text>
                <Text
                  style={{
                    width: PRICE_COLUMN_WIDTH,
                    fontSize: 10,
                    textAlign: "right",
                    color: isVoided ? colors.muted : colors.teal,
                    textDecorationLine: isVoided ? "line-through" : "none",
                  }}
                >
                  {!option.isNo && option.price > 0
                    ? `+$${displayPrice.toFixed(2)}`
                    : ""}
                </Text>
              </View>
            );
          }),
      )}
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

      // Compare actual option IDs, names and isNo to detect changes
      for (let j = 0; j < prevMod.options.length; j++) {
        if (prevMod.options[j].id !== nextMod.options[j].id) return false;
        if (prevMod.options[j].name !== nextMod.options[j].name) return false;
        if (prevMod.options[j].isNo !== nextMod.options[j].isNo) return false;
      }
    }

    return (
      prev.isVoided === next.isVoided &&
      prev.discountFactor === next.discountFactor
    );
  },
);

const BillItemComponent: React.FC<BillItemProps> = ({
  item,
  isEditable = false,
  isActive = false,
  showPaidBadge = true,
  orderHasPayments: orderHasPaymentsProp,
  payments: paymentsProp,
  isNetworkDegraded: isNetworkDegradedProp,
}) => {
  // FIXED: Use selectors instead of destructuring to avoid subscribing to entire store
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const removeItemFromActiveOrder = useOrderStore(
    (s) => s.removeItemFromActiveOrder,
  );
  const setItemQuantity = useOrderStore((s) => s.setItemQuantity);
  const openToView = useModifierSidebarStore((s) => s.openToView);
  const openToEdit = useModifierSidebarStore((s) => s.openToEdit);
  const isModifierActive = useModifierSidebarStore(
    (s) => s.activeEditingItemId === item.id,
  );
  // Wave 2.2: when the active order is owned by another station, show this
  // line as visually muted and force the modifier sheet into read-only mode
  // so the user can still inspect modifiers but can't dead-end edit them.
  const isReadOnlyForStation = useIsActiveOrderReadOnly();

  // Single subscription for both sync status and error (halves sync store subscriptions per item)
  const { status: syncStatus, error: syncError } = useItemSyncInfo(item.id);
  // Wave 2.8c: gate the optimistic-pending dot on actual network trouble.
  // During normal-flow optimistic latency the dot would flicker on every tap;
  // we only want it when the merchant should know syncing isn't immediate.
  const networkIsDegraded = useIsNetworkDegraded();
  const isNetworkDegraded = isNetworkDegradedProp ?? networkIsDegraded;
  const retrySingleItemSync = useOrderStore((s) => s.retrySingleItemSync);
  const showToast = useToastStore((s) => s.show);

  // If caller passes payment info, skip the per-item store subscriptions entirely.
  // Fall back to store subscriptions only when props are not provided (legacy call sites).
  const orderHasPaymentsFromStore = useOrderStore((s) => {
    if (orderHasPaymentsProp !== undefined) return false; // skip — prop wins
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return !!order?.payments?.some((p: any) => !p.isVoided);
  });
  const orderHasPayments = orderHasPaymentsProp ?? orderHasPaymentsFromStore;

  const paymentsFromStore = useOrderStore((s) => {
    if (paymentsProp !== undefined) return null; // skip — prop wins
    if (!orderHasPayments) return null;
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.payments ?? null;
  });
  const payments =
    paymentsProp !== undefined ? paymentsProp : paymentsFromStore;

  const translateX = useSharedValue(0);
  const swipeActionTriggered = useSharedValue(false);
  const [showVoidDialog, setShowVoidDialog] = useState(false);
  const [displayQuantity, setDisplayQuantity] = useState(item.quantity);
  const displayQuantityRef = useRef(item.quantity);
  const handleDeleteRef = useRef<() => void>(() => {});
  const handleLeftSwipeRef = useRef<() => void>(() => {});
  const handleIncrementRef = useRef<() => void>(() => {});
  const decrementThrottleRef = useRef(0);
  const incrementThrottleRef = useRef(0);
  const swipeActivatedRef = useRef(false);
  // Stable wrapper refs — the functions never change so Reanimated can safely
  // capture them in worklets without triggering the "tried to modify shareable" warning.
  // handleIncrementRef itself is NOT passed to worklets — only this stable wrapper is.
  const callHandleDelete = useRef(() => {
    handleDeleteRef.current();
  });
  const callHandleLeftSwipe = useRef(() => {
    handleLeftSwipeRef.current();
  });
  const callHandleIncrement = useRef(() => {
    handleIncrementRef.current();
  });
  const markSwipeActiveRef = useRef(() => {
    swipeActivatedRef.current = true;
  });
  const resetSwipeActiveRef = useRef(() => {
    // Delay reset so handleNotesPress runs first before the guard clears
    setTimeout(() => {
      swipeActivatedRef.current = false;
    }, 300);
  });

  // Reset animation when item becomes voided
  useEffect(() => {
    if (item.is_voided) {
      translateX.value = withTiming(0);
    }
  }, [item.is_voided]);

  useEffect(() => {
    displayQuantityRef.current = item.quantity;
    setDisplayQuantity(item.quantity);
  }, [item.id, item.quantity]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  // Delete button opacity - only visible when swiping left
  const deleteButtonStyle = useAnimatedStyle(() => ({
    opacity:
      translateX.value < -10
        ? withTiming(1, { duration: 100 })
        : withTiming(0, { duration: 100 }),
  }));

  // Increment button opacity - only visible when swiping right
  const incrementButtonStyle = useAnimatedStyle(() => ({
    opacity:
      translateX.value > 10
        ? withTiming(1, { duration: 100 })
        : withTiming(0, { duration: 100 }),
  }));

  // Check if item is in draft/new state (simple delete) or in kitchen (needs void reason)
  const isKitchenItem =
    item.kitchen_status === "sent" ||
    item.kitchen_status === "preparing" ||
    item.kitchen_status === "ready" ||
    item.kitchen_status === "served";

  // Shared value so the worklet can read isKitchenItem on the UI thread
  const isKitchenItemSV = useSharedValue(isKitchenItem);
  useEffect(() => {
    isKitchenItemSV.value = isKitchenItem;
  }, [isKitchenItem]);

  // Pan gesture to reveal delete (left) or increment (right)
  // OPTIMIZED: Memoize gesture to prevent recreation on each render
  const MAX_LEFT = -DELETE_BUTTON_WIDTH;
  const MAX_RIGHT = INCREMENT_BUTTON_WIDTH;
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .onBegin(() => {
          swipeActionTriggered.value = false;
        })
        .onUpdate((e) => {
          const rightLimit = isKitchenItemSV.value ? 0 : MAX_RIGHT;
          const next = Math.max(MAX_LEFT, Math.min(rightLimit, e.translationX));
          translateX.value = next;
          if (Math.abs(next) > 5) runOnJS(markSwipeActiveRef.current)();
        })
        .onEnd((e) => {
          const rightLimit = isKitchenItemSV.value ? 0 : MAX_RIGHT;
          const finalX = Math.max(
            MAX_LEFT,
            Math.min(rightLimit, e.translationX),
          );
          if (finalX > MAX_RIGHT / 2) {
            swipeActionTriggered.value = true;
            translateX.value = withTiming(0, { duration: 120 });
            runOnJS(callHandleIncrement.current)();
          } else if (finalX < MAX_LEFT / 2) {
            swipeActionTriggered.value = true;
            runOnJS(callHandleLeftSwipe.current)();
          } else {
            translateX.value = withTiming(0);
          }
          runOnJS(resetSwipeActiveRef.current)();
        })
        .activeOffsetX([-20, 20])
        .failOffsetY([-20, 20]),
    [translateX, swipeActionTriggered, isKitchenItemSV],
  );

  const handleDelete = () => {
    if (!activeOrderId || !isEditable || item.is_voided) return;

    if (item.isDraft || !isKitchenItem) {
      const now = Date.now();
      if (now - decrementThrottleRef.current < 400) return;
      decrementThrottleRef.current = now;

      const nextQuantity = displayQuantityRef.current - 1;
      if (displayQuantityRef.current > 1) {
        displayQuantityRef.current = nextQuantity;
        setDisplayQuantity(nextQuantity);
        setItemQuantity(item.id, nextQuantity);
      } else {
        const modStore = useModifierSidebarStore.getState();
        if (modStore.activeEditingItemId === item.id) {
          modStore.close();
        }
        removeItemFromActiveOrder(item.id);
      }
    } else {
      // Kitchen item - show void reason dialog
      setShowVoidDialog(true);
    }
  };
  handleDeleteRef.current = handleDelete;

  const handleLeftSwipe = () => {
    if (!activeOrderId || !isEditable || item.is_voided) return;

    if ((item.isDraft || !isKitchenItem) && displayQuantityRef.current <= 1) {
      const now = Date.now();
      if (now - decrementThrottleRef.current < 400) {
        translateX.value = withTiming(0, { duration: 120 });
        return;
      }

      decrementThrottleRef.current = now;
      translateX.value = withTiming(MAX_LEFT, { duration: 120 });
      return;
    }

    translateX.value = withTiming(0, { duration: 120 });
    handleDelete();
  };
  handleLeftSwipeRef.current = handleLeftSwipe;

  const handleConfirmVoid = (reason: string) => {
    // Reset animation first, before any state changes
    translateX.value = withTiming(0);
    setShowVoidDialog(false);

    // Delay the void operation to allow animation to complete
    if (activeOrderId) {
      setTimeout(() => {
        removeItemFromActiveOrder(item.id, reason);

        // Print void kitchen ticket if the setting is on
        const printingConfig =
          useLocationConfigStore.getState().config.printing;
        if (printingConfig.printVoidTickets) {
          const order = useOrderStore.getState().ordersById[activeOrderId];
          const selectedStore = useStoreSettingsStore.getState().selectedStore;
          if (order && selectedStore) {
            PrinterService.printVoidTicket(order, [item], selectedStore).catch(
              (err) => {
                console.warn("[BillItem] printVoidTicket failed:", err);
              },
            );
          }
        }
      }, 50);
    }
  };

  const handleCancelVoid = () => {
    setShowVoidDialog(false);
    // Reset slide position
    translateX.value = withTiming(0);
  };

  const handleIncrement = () => {
    if (!activeOrderId || !isEditable || item.is_voided || isKitchenItem)
      return;
    const now = Date.now();
    if (now - incrementThrottleRef.current < 400) return;
    incrementThrottleRef.current = now;
    const nextQuantity = displayQuantityRef.current + 1;
    displayQuantityRef.current = nextQuantity;
    setDisplayQuantity(nextQuantity);
    setItemQuantity(item.id, nextQuantity);
  };
  handleIncrementRef.current = handleIncrement;

  // Warm cache ahead of time so table-item modifier opens are instant on tap.
  useEffect(() => {
    const handle = setTimeout(() => {
      const menuItemId = item.menuItemId;
      if (!menuItemId) return;
      const menuItem = useMenuStore.getState().getMenuItemById(menuItemId);
      if (!menuItem || !menuItem.modifierGroupIds?.length) return;
      useModifierSidebarStore
        .getState()
        .preWarm(
          menuItem,
          item.addedFromCategoryId ?? undefined,
          item.addedFromMenuId ?? undefined,
        );
    }, 0);

    return () => clearTimeout(handle);
  }, [item.menuItemId, item.addedFromCategoryId, item.addedFromMenuId]);

  const handleNotesPress = (e: any) => {
    e.stopPropagation();
    if (swipeActivatedRef.current) return;

    // Wave 2.2: tap still opens the modifier sheet so the user can inspect
    // what's on the line, but in view-only mode when another station owns
    // the order. Edit operations on the modifier sheet are also gated by
    // `_checkCartEditable` at the store layer (Wave 1) — this is the UX
    // signal that reaching the sheet won't let them save.
    if (isEditable && !isKitchenItem && !isReadOnlyForStation) {
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
        if (
          covered.itemId === item.id ||
          covered.itemId === item.db_order_item_id
        ) {
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
  }, [
    payments,
    item.id,
    item.db_order_item_id,
    item.quantity,
    item.refundedQuantity,
    isVoided,
  ]);

  // Check if item has any modifiers to show
  const hasModifiers =
    (item.customizations.modifiers &&
      item.customizations.modifiers.length > 0) ||
    item.customizations.notes;

  const baseLineTotal = item.price * item.quantity;
  const explicitLineTotal = getItemEffectiveSubtotal(item);
  const rawSubtotal =
    typeof item.subtotal === "number" ? item.subtotal : baseLineTotal;
  const hasExplicitDiscountData =
    (typeof item.discount_amount === "number" &&
      item.discount_amount > 0.005) ||
    !!item.appliedDiscount;
  // Raw subtotal can be transiently wrong on first hydration; only trust it as a
  // discounted display value when we also have explicit discount metadata.
  const effectiveLineTotal = hasExplicitDiscountData
    ? rawSubtotal
    : explicitLineTotal;
  const itemDiscountAmount = Math.max(0, baseLineTotal - explicitLineTotal);
  const normalizedItemDiscountAmount = Math.max(
    0,
    typeof item.discount_amount === "number"
      ? item.discount_amount
      : itemDiscountAmount,
  );
  const modifierDiscountFactor =
    baseLineTotal > 0
      ? Math.max(
          0,
          Math.min(
            1,
            (baseLineTotal - normalizedItemDiscountAmount) / baseLineTotal,
          ),
        )
      : 1;
  const hasVisibleDiscount =
    !isVoided && (itemDiscountAmount > 0.005 || hasExplicitDiscountData);

  const effectiveIsActive =
    isActive || isModifierActive || item.isDraft === true;

  // Keep draft/new items visually unsent even if a stale item_status lingers.
  const normalizedKitchenStatus = (item.kitchen_status ?? "").toLowerCase();
  const normalizedItemStatus = (item.item_status ?? "").toLowerCase();
  const isUnsentItem =
    item.isDraft === true ||
    normalizedKitchenStatus === "" ||
    normalizedKitchenStatus === "new";
  const effectivePrepStatus =
    isUnsentItem
      ? "new"
      : normalizedKitchenStatus
      ? normalizedKitchenStatus
      : normalizedItemStatus;

  const leftStatusColor = isVoided
    ? colors.danger
    : effectivePrepStatus === "ready"
      ? colors.orderReady
      : effectivePrepStatus === "preparing"
        ? colors.orderPreparing
        : effectivePrepStatus === "sent"
          ? colors.orderSentToKitchen
          : effectivePrepStatus === "served" ||
              effectivePrepStatus === "done" ||
              effectivePrepStatus === "completed"
            ? colors.success
            : paymentCoverage.isFullyPaid
              ? colors.success
              : paymentCoverage.isPartiallyPaid
                ? colors.warning
                : colors.muted;

  const voidedSurface = colors.danger + "14";
  const voidedBorder = colors.danger + "40";
  const voidedBadgeBackground = colors.danger + "20";
  const refundedBadgeBackground = colors.danger + "14";
  const partialRefundBadgeBackground = colors.warning + "18";
  const paidBadgeBackground = colors.success + "18";
  const partialPaidBadgeBackground = colors.warning + "18";

  return (
    <View
      className={`overflow-hidden py-2 ${
        effectiveIsActive
          ? "border-2 border-blue-400 bg-blue-500/5 rounded-lg"
          : ""
      }`}
      style={[
        isVoided
          ? {
              borderWidth: 1,
              borderRadius: 8,
              borderColor: voidedBorder,
              backgroundColor: voidedSurface,
              opacity: 0.6,
            }
          : undefined,
        !isVoided && isKitchenItem ? { opacity: 0.55 } : undefined,
        isActive
          ? {
              shadowColor: colors.info,
              shadowOffset: { width: 0, height: 0 },
              shadowOpacity: 0.5,
              shadowRadius: 8,
              elevation: 8,
            }
          : undefined,
      ]}
    >
      {leftStatusColor !== "transparent" && (
        <View
          style={{
            position: "absolute",
            left: 0,
            top: 7,
            bottom: 7,
            width: 3,
            borderRadius: 999,
            backgroundColor: leftStatusColor,
            opacity: isVoided ? 0.7 : 0.95,
            zIndex: 1,
          }}
        />
      )}

      {isEditable && !isVoided && (
        <Animated.View
          style={deleteButtonStyle}
          className="absolute right-1 top-0 bottom-0 justify-center items-end z-10"
        >
          <TouchableOpacity
            onPress={handleDelete}
            className="w-12 h-12 bg-red-500 items-center rounded-xl justify-center"
          >
            {displayQuantity > 1 && !isKitchenItem ? (
              <Minus color="white" size={18} />
            ) : (
              <Trash2 color="white" size={18} />
            )}
          </TouchableOpacity>
        </Animated.View>
      )}

      {isEditable && !isVoided && !isKitchenItem && (
        <Animated.View
          style={incrementButtonStyle}
          className="absolute left-2 top-0 bottom-0 justify-center items-center z-10"
        >
          <TouchableOpacity
            onPress={handleIncrement}
            className="w-12 h-12 bg-teal-600 items-center rounded-xl justify-center"
          >
            <Plus color="white" size={18} />
          </TouchableOpacity>
        </Animated.View>
      )}

      <GestureDetector gesture={isVoided || item.isDraft ? Gesture.Pan() : pan}>
        <Animated.View
          style={[
            animatedStyle,
            // Wave 2.2: dim the row when the active order is owned by
            // another station so users see the read-only state at a glance.
            isReadOnlyForStation && !isVoided ? { opacity: 0.5 } : null,
          ]}
          className={isVoided ? "" : "z-20"}
        >
          <TouchableOpacity
            onPress={isVoided ? undefined : handleNotesPress}
            activeOpacity={isVoided ? 1 : 0.85}
            disabled={isVoided}
          >
            <View>
              {/* Main row */}
              <View className="flex-row items-center py-0 pl-3 pr-3 gap-2">
                <Text
                  style={{
                    minWidth: 18,
                    fontSize: 13,
                    fontWeight: "700",
                    color: isVoided ? colors.muted : colors.heading,
                    textAlign: "left",
                  }}
                >
                  {displayQuantity}
                </Text>

                {/* Name + badges */}
                <View className="flex-1">
                  <View className="flex-row items-center gap-1.5">
                    <Text
                      style={{
                        fontSize: 14,
                        fontWeight: "600",
                        flexShrink: 1,
                        color: isVoided ? colors.muted : colors.heading,
                        textDecorationLine: isVoided ? "line-through" : "none",
                      }}
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                    {/* Wave 2.8c + PR D.1: failed chip — tappable retry, with
                        a sibling Remove affordance so the cashier can give up
                        on a permanently-failed add (e.g. cross-station ownership
                        rejection) instead of letting the optimistic ghost ride
                        forever. */}
                    {syncStatus === "failed" &&
                    !isVoided &&
                    !orderHasPayments ? (
                      <View className="flex-row items-center gap-2">
                        <TouchableOpacity
                          onPress={async () => {
                            if (!activeOrderId) return;
                            const result = await retrySingleItemSync(
                              activeOrderId,
                              item.id,
                            );
                            if (result === "parent_dead") {
                              showToast({
                                title: "Order create failed",
                                message:
                                  "See Settings → General → Failed Syncs to retry the order.",
                                type: "error",
                                duration: 6000,
                              });
                            } else if (result === "not_found") {
                              showToast({
                                title: "Sync entry missing",
                                message:
                                  "Couldn't find the queued operation. Please re-add the item.",
                                type: "warning",
                              });
                            } else {
                              showToast({
                                title: "Retrying…",
                                message: "Re-queued for sync.",
                                type: "success",
                                duration: 2000,
                              });
                            }
                          }}
                          onLongPress={() => {
                            if (__DEV__) {
                              Alert.alert(
                                "Sync error",
                                syncError || "(no error text)",
                              );
                            }
                          }}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="Retry sync for this item"
                        >
                          <View className="flex-row items-center gap-1">
                            <AlertCircle size={13} color={colors.danger} />
                            <Text
                              style={{
                                fontSize: 10,
                                fontWeight: "700",
                                color: colors.danger,
                              }}
                            >
                              Retry
                            </Text>
                          </View>
                        </TouchableOpacity>
                        <TouchableOpacity
                          onPress={() => removeItemFromActiveOrder(item.id)}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          accessibilityLabel="Remove this failed item from the cart"
                        >
                          <Text
                            style={{
                              fontSize: 10,
                              fontWeight: "700",
                              color: colors.muted,
                              textDecorationLine: "underline",
                            }}
                          >
                            Remove
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : (syncStatus === "pending" ||
                        syncStatus === "syncing") &&
                      isNetworkDegraded ? (
                      // Pending dot only when the network is actually struggling.
                      // Hidden during normal optimistic flow to avoid flicker.
                      <ActivityIndicator size={10} color={colors.info} />
                    ) : null}
                  </View>

                  {/* Wave 3.0e-1: subtitle line for failed sync — root cause +
                      attempt count + relative time. Pulled from the dead-letter
                      op via the offlineSyncSubtitles helpers. */}
                  {syncStatus === "failed" &&
                    !isVoided &&
                    !orderHasPayments &&
                    syncError && (
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: "500",
                          color: colors.muted,
                          marginTop: 1,
                        }}
                        numberOfLines={2}
                      >
                        {syncError}
                      </Text>
                    )}

                  {/* Status badges row */}
                  {(isVoided ||
                    paymentCoverage.isFullyRefunded ||
                    paymentCoverage.isPartiallyRefunded ||
                    paymentCoverage.isFullyPaid ||
                    paymentCoverage.isPartiallyPaid) && (
                    <View className="flex-row flex-wrap gap-1 mt-0.5">
                      {isVoided && (
                        <View
                          className="px-1.5 py-px rounded"
                          style={{ backgroundColor: voidedBadgeBackground }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: "700",
                              color: colors.danger,
                            }}
                          >
                            VOID
                          </Text>
                        </View>
                      )}
                      {!isVoided && paymentCoverage.isFullyRefunded && (
                        <View
                          className="px-1.5 py-px rounded"
                          style={{ backgroundColor: refundedBadgeBackground }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: "700",
                              color: colors.danger,
                            }}
                          >
                            REFUNDED
                          </Text>
                        </View>
                      )}
                      {!isVoided &&
                        paymentCoverage.isPartiallyRefunded &&
                        paymentCoverage.isFullyPaid && (
                          <View
                            className="px-1.5 py-px rounded"
                            style={{
                              backgroundColor: partialRefundBadgeBackground,
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: "700",
                                color: colors.warning,
                              }}
                            >
                              {paymentCoverage.refundedQty} REFUNDED
                            </Text>
                          </View>
                        )}
                      {showPaidBadge &&
                        !isVoided &&
                        !paymentCoverage.isFullyRefunded &&
                        !(
                          paymentCoverage.isPartiallyRefunded &&
                          paymentCoverage.isFullyPaid
                        ) &&
                        paymentCoverage.isFullyPaid && (
                          <View
                            className="flex-row items-center px-1.5 py-px rounded gap-1"
                            style={{ backgroundColor: paidBadgeBackground }}
                          >
                            {paymentCoverage.primaryMethod === "Cash" &&
                              !paymentCoverage.isSplitMethod && (
                                <Banknote size={9} color={colors.success} />
                              )}
                            <Text
                              style={{
                                fontSize: 9,
                                fontWeight: "700",
                                color: colors.success,
                              }}
                            >
                              PAID {paymentCoverage.methodLabel}
                            </Text>
                          </View>
                        )}
                      {!isVoided && paymentCoverage.isPartiallyPaid && (
                        <View
                          className="px-1.5 py-px rounded"
                          style={{
                            backgroundColor: partialPaidBadgeBackground,
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 9,
                              fontWeight: "700",
                              color: colors.warning,
                            }}
                          >
                            {paymentCoverage.netCoveredQty}/{item.quantity} PAID
                          </Text>
                        </View>
                      )}
                    </View>
                  )}

                  {isVoided && item.void_reason && (
                    <Text
                      style={{ fontSize: 10, color: colors.danger + "AA" }}
                      className="mt-0.5 italic"
                    >
                      {item.void_reason}
                    </Text>
                  )}
                  {paymentCoverage.hasRepaid && (
                    <Text
                      style={{ fontSize: 9, color: colors.muted }}
                      className="italic mt-0.5"
                    >
                      Refunded → Re-paid {paymentCoverage.repaidMethodLabel}
                    </Text>
                  )}
                </View>

                {/* Seat number indicator */}
                {item.seatNumber != null &&
                  item.seatNumber > 0 &&
                  !isVoided && (
                    <View
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        backgroundColor: colors.border,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 9,
                          fontWeight: "700",
                          color: colors.label,
                        }}
                      >
                        {item.seatNumber}
                      </Text>
                    </View>
                  )}

                {/* Price + modifier upcharge */}
                <View
                  style={{
                    width: PRICE_COLUMN_WIDTH,
                    alignItems: "flex-end",
                    justifyContent: "flex-end",
                    marginLeft: 6,
                  }}
                >
                  {hasVisibleDiscount && (
                    <Text
                      style={{
                        fontSize: 9,
                        fontWeight: "600",
                        color: colors.muted,
                        textDecorationLine: "line-through",
                      }}
                    >
                      ${baseLineTotal.toFixed(2)}
                    </Text>
                  )}
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: "600",
                      color: isVoided ? colors.muted : colors.teal,
                      textDecorationLine: isVoided ? "line-through" : "none",
                    }}
                  >
                    ${effectiveLineTotal.toFixed(2)}
                  </Text>
                  {hasVisibleDiscount && itemDiscountAmount > 0.005 && (
                    <Text
                      style={{
                        fontSize: 8,
                        fontWeight: "700",
                        color: colors.success,
                      }}
                    >
                      -${itemDiscountAmount.toFixed(2)}
                    </Text>
                  )}
                </View>
              </View>

              {/* Modifiers / Notes — indented under item name */}
              {hasModifiers && (
                <View
                  style={{
                    marginLeft: 36,
                  }}
                >
                  {item.customizations.modifiers &&
                    item.customizations.modifiers.length > 0 && (
                      <ModifiersList
                        modifiers={item.customizations.modifiers}
                        isVoided={isVoided}
                        discountFactor={modifierDiscountFactor}
                      />
                    )}
                  {item.customizations.notes && (
                    <View className="flex-row items-start gap-1 mt-0.5">
                      <Text style={{ fontSize: 10, color: colors.muted }}>
                        Note:
                      </Text>
                      <Text
                        style={{ fontSize: 10, color: colors.label }}
                        className="italic flex-1"
                      >
                        {item.customizations.notes}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
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
    prev.item.subtotal !== next.item.subtotal ||
    prev.item.cashSubtotal !== next.item.cashSubtotal ||
    prev.item.discount_amount !== next.item.discount_amount ||
    prev.item.discount_cash_amount !== next.item.discount_cash_amount ||
    prev.item.is_voided !== next.item.is_voided ||
    prev.item.void_reason !== next.item.void_reason ||
    prev.item.paidQuantity !== next.item.paidQuantity ||
    prev.item.refundedQuantity !== next.item.refundedQuantity ||
    prev.item.kitchen_status !== next.item.kitchen_status ||
    prev.item.item_status !== next.item.item_status ||
    prev.item.isDraft !== next.item.isDraft ||
    prev.item.seatNumber !== next.item.seatNumber ||
    prev.item.customizations?.notes !== next.item.customizations?.notes ||
    prev.isEditable !== next.isEditable ||
    prev.isActive !== next.isActive ||
    prev.showPaidBadge !== next.showPaidBadge ||
    prev.orderHasPayments !== next.orderHasPayments ||
    prev.payments !== next.payments ||
    prev.isNetworkDegraded !== next.isNetworkDegraded
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
