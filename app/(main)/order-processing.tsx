import BillSection from "@/components/bill/BillSection";
import DiscountBottomSheet from "@/components/bill/DiscountBottomSheet";
import MoreOptionsBottomSheet from "@/components/bill/MoreOptionsBottomSheet";
import { ServiceChargeOverrideSheet } from "@/components/bill/ServiceChargeOverrideSheet";
import CashDrawerSheet from "@/components/cash-drawer/CashDrawerSheet";
import NoSaleModal from "@/components/cash-drawer/NoSaleModal";
import MenuSection from "@/components/menu/MenuSection";
import OpenItemAdder from "@/components/menu/OpenItemAdder";
import BulkCompleteModal from "@/components/order/BulkCompleteModal";
import OrderBadge from "@/components/order/OrderBadge";
import OrderLineItemsModal from "@/components/order/OrderLineItemsModal";
import OrderLineMinimalCard from "@/components/order/OrderLineMinimalCard";
import { useCFDOrderProcessingActivity } from "@/contexts/CFDProvider";
import { useLoading } from "@/contexts/LoadingContext";
import { useToast } from "@/contexts/ToastContext";
import { useActiveOrderOwnershipRecheck } from "@/hooks/orders/useActiveOrderOwnershipRecheck";
import { deriveEffectivePaidStatus } from "@/lib/deriveEffectivePaidStatus";
import { getHeaderHeight } from "@/lib/headerHeight";
import {
  forceSetLocalSequence,
  parseSequenceFromDisplayNumber,
} from "@/lib/localOrderSequence";
import { markEnd } from "@/lib/perf";
import {
  findLatestReusableEmptyDraftId,
  getRefreshedReusableDraftNumbers,
  isReusableEmptyDraftOrder,
} from "@/lib/reusableEmptyDraft";
import { iosOnly } from "@/lib/safeAnimations";
import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { useColorScheme } from "@/lib/useColorScheme";
import { PrinterService } from "@/services/printing/PrinterService";
import { useSearchStore } from "@/stores/searchStore";
import { useOrderLineFilteredOrders } from "@/stores/selectors/orderSelectors";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import {
  formatOrderStatus,
  formatPaymentStatus,
} from "@/utils/orderStatusHelpers";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { LinearGradient } from "expo-linear-gradient";
import { useRouter } from "expo-router";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Eye,
  Logs,
  Plus,
  Printer,
  Search,
  ShoppingBag,
  Sofa,
  UtensilsCrossed,
  X,
} from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Dimensions,
  InteractionManager,
  Keyboard,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from "react-native";
import Animated, {
  LinearTransition,
  SlideInLeft,
  useAnimatedStyle,
  useSharedValue,
} from "react-native-reanimated";

const EMPTY_ORDERS: OrderProfile[] = [];
const badgeContentStyle = { paddingHorizontal: 20, gap: 8 } as const;

const formatOrderOpenedTime = (openedAt?: string | null) => {
  if (!openedAt) return "";
  return new Date(openedAt).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
  });
};

const getOrderStatusColor = (status?: string | null) => {
  switch (status) {
    case "ready":
      return colors.success;
    case "preparing":
      return colors.orderPreparing;
    case "sent_to_kitchen":
      return colors.orderSentToKitchen;
    case "completed":
      return colors.info;
    case "cancelled":
    case "void":
      return colors.danger;
    default:
      return colors.muted;
  }
};

const getPaidStatusColor = (status?: string | null) => {
  if (status === "Paid") return colors.success;
  if (status === "Partial") return colors.warning;
  return colors.muted;
};

const formatOrderStatusLabel = (status?: string | null) =>
  formatOrderStatus(status || "pending");

const OrderProcessing = () => {
  const router = useRouter();
  const { height: windowHeight } = useWindowDimensions();
  const { colorScheme } = useColorScheme();
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const markOrderProcessingActivity = useCFDOrderProcessingActivity();
  const measuredHeaderHeight = getHeaderHeight();
  const overlayHeaderHeight =
    measuredHeaderHeight > 0 ? measuredHeaderHeight : 56;
  const customItemModalHeight = useMemo(() => {
    const screenHeight = Dimensions.get("screen").height;
    return Math.min(s(560), Math.max(s(420), screenHeight - 40));
  }, [uiScale]);
  const customItemModalTop = useMemo(() => {
    const screenHeight = Dimensions.get("screen").height;
    return Math.max(
      s(20),
      Math.round((screenHeight - customItemModalHeight) / 2),
    );
  }, [customItemModalHeight, uiScale]);

  // Wave 2.7: per-order ownership recheck on screen focus + connectionQuality
  // recovery. Closes the gap between Wave 2.1 (realtime) and Wave 2.1.1
  // (polling/reconnect refetch) where local `station_id` could be stale
  // because a broadcast was missed or backgrounded.
  useActiveOrderOwnershipRecheck();
  // FIXED: Use individual selectors to prevent subscribing to entire ordersById
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  // Re-trigger the eager backend create once the per-order PIN is verified for
  // the active order, so a QSR order that was blocked pre-PIN gets created
  // instead of sticking on "Creating order".
  const orderAttributionOrderId = useEmployeeStore(
    (s) => s.orderAttributionOrderId,
  );
  const setActiveOrder = useOrderStore((s) => s.setActiveOrder);
  const startNewOrder = useOrderStore((s) => s.startNewOrder);
  const markAllItemsAsReady = useOrderStore((s) => s.markAllItemsAsReady);
  const archiveOrder = useOrderStore((s) => s.archiveOrder);
  const updateOrderCheckStatus = useOrderStore((s) => s.updateOrderCheckStatus);
  const updateActiveOrderDetails = useOrderStore(
    (s) => s.updateActiveOrderDetails,
  );
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const orderCompletionMode = useStoreSettingsStore(
    (s) => s.orderCompletionMode,
  );
  const orderLineViewMode = useSettingsStore(
    (s) => s.orderLineSettings.viewMode ?? "default",
  );
  const minimalModeRows = useSettingsStore(
    (s) => s.orderLineSettings.minimalModeRows ?? 3,
  );
  const openSearch = useSearchStore((s) => s.openSearch);

  // Today-only order line list for current location.
  const reversedFilteredOrders = useOrderLineFilteredOrders();

  const [isAccordionOpen, setIsAccordionOpen] = useState(false);
  const [isOrdersModuleOpen, setIsOrdersModuleOpen] = useState(false);
  const [isItemsModalOpen, setItemsModalOpen] = useState(false);
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [isCashDrawerSheetOpen, setCashDrawerSheetOpen] = useState(false);
  const [isNoSaleModalOpen, setNoSaleModalOpen] = useState(false);
  const [bulkCompleteModalOpen, setBulkCompleteModalOpen] = useState(false);
  const [isCustomItemModuleOpen, setIsCustomItemModuleOpen] = useState(false);
  const [isCustomItemKeyboardVisible, setIsCustomItemKeyboardVisible] =
    useState(false);
  const [isInlinePreviousOrdersOpen, setIsInlinePreviousOrdersOpen] =
    useState(false);
  const moreOptionsSheetRef = useRef<BottomSheetMethods>(null);
  const discountSheetRef = useRef<BottomSheetMethods>(null);
  const serviceChargeSheetRef = useRef<BottomSheetMethods>(null);
  const [moreOptionsOpenedOnce, setMoreOptionsOpenedOnce] = useState(false);
  const [discountOpenedOnce, setDiscountOpenedOnce] = useState(false);
  const [serviceChargeOpenedOnce, setServiceChargeOpenedOnce] = useState(false);
  const orderBadgeListRef = useRef<Animated.FlatList<OrderProfile>>(null);
  const orderBadgeScrollXRef = useRef(0);
  const orderBadgeViewportWidthRef = useRef(0);
  const orderBadgeContentWidthRef = useRef(0);
  const didInitializeOrderRef = useRef(false);
  const [canScrollBadgesLeft, setCanScrollBadgesLeft] = useState(false);
  const [canScrollBadgesRight, setCanScrollBadgesRight] = useState(false);

  const requestMoreOptionsOpen = useCallback(() => {
    if (moreOptionsSheetRef.current) {
      moreOptionsSheetRef.current.expand();
      return;
    }
    setMoreOptionsOpenedOnce(true);
  }, []);
  const requestDiscountOpen = useCallback(() => {
    if (discountSheetRef.current) {
      discountSheetRef.current.expand();
      return;
    }
    setDiscountOpenedOnce(true);
  }, []);
  const requestServiceChargeOpen = useCallback(() => {
    if (serviceChargeSheetRef.current) {
      serviceChargeSheetRef.current.expand();
      return;
    }
    setServiceChargeOpenedOnce(true);
  }, []);

  const lazyMoreOptionsSheetRef = useMemo(
    () =>
      ({
        current: { expand: requestMoreOptionsOpen } as BottomSheetMethods,
      }) as React.RefObject<BottomSheetMethods>,
    [requestMoreOptionsOpen],
  );
  const lazyDiscountSheetRef = useMemo(
    () =>
      ({
        current: { expand: requestDiscountOpen } as BottomSheetMethods,
      }) as React.RefObject<BottomSheetMethods>,
    [requestDiscountOpen],
  );
  const lazyServiceChargeSheetRef = useMemo(
    () =>
      ({
        current: { expand: requestServiceChargeOpen } as BottomSheetMethods,
      }) as React.RefObject<BottomSheetMethods>,
    [requestServiceChargeOpen],
  );

  useEffect(() => {
    const showSubscription = Keyboard.addListener("keyboardDidShow", () => {
      setIsCustomItemKeyboardVisible(true);
    });
    const hideSubscription = Keyboard.addListener("keyboardDidHide", () => {
      setIsCustomItemKeyboardVisible(false);
    });

    return () => {
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  const handleCustomItemBackdropPress = useCallback(() => {
    if (isCustomItemKeyboardVisible) {
      Keyboard.dismiss();
      return;
    }

    setIsCustomItemModuleOpen(false);
  }, [isCustomItemKeyboardVisible]);
  const ordersSheetHeight = useSharedValue<number>(windowHeight);
  const dragStartHeightRef = useRef<number>(windowHeight);

  const getDateKey = (date: Date) => {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    const d = String(date.getDate()).padStart(2, "0");
    return `${y}${m}${d}`;
  };

  // On mount: reuse the most recent empty draft if one exists; otherwise
  // create a brand-new empty order.
  useEffect(() => {
    if (didInitializeOrderRef.current) return;
    didInitializeOrderRef.current = true;

    const state = useOrderStore.getState();
    const selectedStore = useStoreSettingsStore.getState().selectedStore;
    const stationNumberFromOrderStore =
      state.currentStation?.station_number ?? null;

    const currentActiveOrder = state.activeOrderId
      ? state.ordersById[state.activeOrderId]
      : null;
    const isInFinalState =
      currentActiveOrder?.order_status === "completed" ||
      currentActiveOrder?.order_status === "void" ||
      currentActiveOrder?.order_status === "cancelled";
    const shouldKeepActiveDineInOrder =
      !!currentActiveOrder?.service_location_id &&
      (currentActiveOrder.order_type === "dine_in" ||
        currentActiveOrder.order_type === "Dine In") &&
      !isInFinalState;
    // Also resume any non-final, unpaid active order that has items
    // (e.g. "Continue Order" from previous-orders for takeaway/delivery/online).
    const shouldResumeActiveOrder =
      !!currentActiveOrder &&
      !isInFinalState &&
      currentActiveOrder.paid_status !== "Paid" &&
      (currentActiveOrder.items?.length ?? 0) > 0;
    if (
      currentActiveOrder &&
      (shouldKeepActiveDineInOrder || shouldResumeActiveOrder)
    ) {
      setActiveOrder(currentActiveOrder.id);
      return;
    }

    if (
      useStoreSettingsStore.getState().autoCreateOrder &&
      currentActiveOrder &&
      isReusableEmptyDraftOrder(currentActiveOrder)
    ) {
      if (selectedStore) {
        const refreshedNumbers = getRefreshedReusableDraftNumbers({
          draftId: currentActiveOrder.id,
          ordersById: state.ordersById,
          orderIds: state.orderIds,
          locationId: selectedStore.id,
          stationNumber: stationNumberFromOrderStore,
        });

        if (refreshedNumbers) {
          useOrderStore.setState((storeState) => {
            const draft = storeState.ordersById[currentActiveOrder.id];
            if (!draft) return;
            draft.order_number = refreshedNumbers.orderNumber;
            draft.display_number = refreshedNumbers.displayNumber;
          });
        }
      }

      setActiveOrder(currentActiveOrder.id);
      return;
    }

    // Setting: when auto-create is OFF, don't auto-create/select a draft when
    // none is active. The screen shows an empty state until the operator
    // explicitly starts an order. We've already resumed any in-progress order
    // above; from here we'd only be fabricating a fresh draft, so bail.
    if (!useStoreSettingsStore.getState().autoCreateOrder) {
      return;
    }

    const allOrders = state.orderIds
      .map((id) => state.ordersById[id])
      .filter(Boolean);

    // Heal the local sequence counter from meaningful today/station orders.
    // Empty placeholder drafts are excluded so stale highs (e.g. #109) don't
    // poison the next local number.
    let reliableHighestSeq = 0;
    let highestSeenTodaySeq = 0;
    if (selectedStore) {
      const stationNumber = stationNumberFromOrderStore;
      const stationPrefix = stationNumber != null ? `S${stationNumber}` : null;
      const todayDateKey = getDateKey(new Date());
      const todayOrderPrefix = `ORD-${todayDateKey}-`;

      const isMeaningfulOrder = (o: OrderProfile) =>
        o.items.length > 0 ||
        o.service_location_id !== null ||
        !!o.customer_name ||
        !!o.customer_id ||
        o.order_status !== "draft" ||
        o.paid_status === "Paid";

      for (const o of allOrders) {
        const dn = o.display_number;
        if (!dn) continue;

        // Keep reseeding day-scoped. If we include prior days, a historical
        // high sequence (e.g. #119) can incorrectly bump today's next order.
        if (o.order_number) {
          if (!o.order_number.startsWith(todayOrderPrefix)) continue;
        } else if (o.opened_at) {
          const openedAtDate = new Date(o.opened_at);
          if (Number.isNaN(openedAtDate.getTime())) continue;
          if (getDateKey(openedAtDate) !== todayDateKey) continue;
        }

        if (stationPrefix) {
          if (!dn.startsWith(`#${stationPrefix}-`)) continue;
        } else {
          if (dn.match(/^#S\d+-/)) continue;
        }

        const seq = parseSequenceFromDisplayNumber(dn);
        if (seq > highestSeenTodaySeq) highestSeenTodaySeq = seq;

        if (!isMeaningfulOrder(o)) continue;
        if (seq > reliableHighestSeq) reliableHighestSeq = seq;
      }

      // Never rewind below a sequence that is already visible locally today.
      // Empty drafts still count here so we don't issue 4, 5, then 4 again.
      const healedSequenceFloor = Math.max(
        reliableHighestSeq,
        highestSeenTodaySeq,
      );
      forceSetLocalSequence(
        selectedStore.id,
        stationNumber,
        healedSequenceFloor,
      );
    }

    const reusableEmptyDraftId = findLatestReusableEmptyDraftId(
      state.ordersById,
      state.orderIds,
      null,
      useStoreSettingsStore.getState().selectedStation?.id ?? null,
    );

    if (reusableEmptyDraftId) {
      // Keep reusing the empty draft. Only refresh its local number when the
      // existing number is missing, from another day, or collides with another
      // visible order. Mounting alone should not consume a new sequence.
      if (selectedStore) {
        const refreshedNumbers = getRefreshedReusableDraftNumbers({
          draftId: reusableEmptyDraftId,
          ordersById: state.ordersById,
          orderIds: state.orderIds,
          locationId: selectedStore.id,
          stationNumber: stationNumberFromOrderStore,
        });

        if (refreshedNumbers) {
          useOrderStore.setState((storeState) => {
            const draft = storeState.ordersById[reusableEmptyDraftId];
            if (!draft) return;
            draft.order_number = refreshedNumbers.orderNumber;
            draft.display_number = refreshedNumbers.displayNumber;
          });
        }
      }

      setActiveOrder(reusableEmptyDraftId);
      return;
    }

    const newOrder = startNewOrder();
    setActiveOrder(newOrder.id);
  }, [setActiveOrder, startNewOrder]);

  // Eager backend create: whenever a local-only takeout order becomes active
  // (fresh order, or a reused empty draft), create its backend row immediately
  // so it behaves like dine-in — items stay blocked until db_order_id exists
  // (see addItemToActiveOrder + BillSection's isCreatingOrder gate).
  useEffect(() => {
    if (!activeOrderId) return;
    const settings = useStoreSettingsStore.getState();
    const order = useOrderStore.getState().ordersById[activeOrderId];
    if (!order || order.db_order_id) return;
    // Dine-in orders create at seating; only eager-create non-dine-in here.
    if (order.order_type === "dine_in" || order.order_type === "Dine In")
      return;

    // Per-order PIN: the order must be eager-created BEFORE items (the
    // "Creating order" gate stays intact). When the PIN is required, eager
    // creation is driven by the PIN entry — it waits for a verified staff and
    // then creates. This deliberately runs even when auto-create is OFF,
    // because the PIN entry IS the explicit "start this order" action, and
    // without it the create-before-add gate would deadlock.
    const pinRequired = settings.requirePinPerOrder;
    if (pinRequired) {
      // Wait until the PIN was verified for THIS order; effect re-runs when
      // orderAttributionOrderId changes.
      if (orderAttributionOrderId !== activeOrderId) return;
      // fall through to create
    } else {
      // No PIN: always eager-create the backend order when an order becomes
      // active, regardless of autoCreateOrder. When autoCreate is OFF, the
      // order was started explicitly via "New Order" (or is an existing draft
      // that was already active) — it still needs a backend row before items
      // can be added. The "on demand" creation at add-item time was never
      // implemented: MenuSection blocks adds when db_order_id is missing, and
      // addItemToActiveOrder shows a toast and returns without triggering
      // creation, leaving the UI permanently stuck on "Creating order".
      // Always eager-creating here is safe because ensureActiveOrderCreated
      // is idempotent and single-flight.
    }
    // Defer the eager backend create off the screen-entry frame: it's an RPC
    // whose broadcast/re-render can land mid-first-interaction. The local draft
    // is already usable; this just pre-persists it so the first item-add is
    // faster. ensureActiveOrderCreated is idempotent + single-flight, so the
    // add-item path still creates on demand if this hasn't run yet.
    const task = InteractionManager.runAfterInteractions(() => {
      void useOrderStore.getState().ensureActiveOrderCreated(activeOrderId);
    });
    return () => task.cancel();
  }, [activeOrderId, orderAttributionOrderId]);

  const handleViewItems = useCallback((orderId: string) => {
    setSelectedOrderId(orderId);
    setIsOrdersModuleOpen(false);
    setItemsModalOpen(true);
  }, []);

  const handleMarkDone = useCallback(
    (orderId: string) => {
      const order = useOrderStore.getState().ordersById[orderId];
      if (!order) return;
      const effectivePaidStatus =
        deriveEffectivePaidStatus(order) ?? order.paid_status;

      markAllItemsAsReady(orderId);

      if (effectivePaidStatus === "Paid") {
        archiveOrder(orderId);
        // Toast fires from inside archiveOrder
      }
      // If not paid: items are now "ready", awaiting payment
    },
    [markAllItemsAsReady, archiveOrder],
  );

  const handleRetrieve = useCallback(
    (orderId: string) => {
      setActiveOrder(orderId);
      const order = useOrderStore.getState().ordersById[orderId];
      const serviceLocationId = order?.service_location_id ?? null;
      usePaymentStore
        .getState()
        .open("Card", serviceLocationId, "payment-method-selection");
    },
    [setActiveOrder],
  );

  const handleReopenCheck = useCallback(
    (orderId: string) => {
      updateOrderCheckStatus(orderId, "Opened");
      setActiveOrder(orderId);
    },
    [updateOrderCheckStatus, setActiveOrder],
  );

  const { show } = useToast();
  const { showLoading, hideLoading } = useLoading();

  const handlePrintReceipt = useCallback(
    async (order: OrderProfile) => {
      if (!selectedStore) {
        show({
          title: "Print Error",
          message: "No store location selected.",
          type: "error",
        });
        return;
      }
      await PrinterService.printReceipt(order, selectedStore);
    },
    [selectedStore, show],
  );

  const handleCloseCheck = useCallback(async () => {
    const state = useOrderStore.getState();
    const currentActiveOrderId = state.activeOrderId;
    const currentActiveOrder = currentActiveOrderId
      ? state.ordersById[currentActiveOrderId]
      : null;

    if (!currentActiveOrderId || !currentActiveOrder) return;

    // Validate order has backend ID
    if (!currentActiveOrder.db_order_id) {
      show({
        title: "Cannot Close Check",
        message: "Order must be synced to close check",
        type: "error",
      });
      return;
    }

    try {
      const tableId = currentActiveOrder.service_location_id;
      if (!tableId) {
        throw new Error("Order is not linked to an active table session");
      }

      showLoading("Closing check...");

      const sessionStore = useTableSessionStore.getState();
      const tableSession = sessionStore.getSession(tableId);
      if (
        tableSession &&
        !["check_presented", "paying", "paid", "cleaning"].includes(
          tableSession.status,
        )
      ) {
        const presentCheckResult = await sessionStore.dispatchAction({
          type: "PRESENT_CHECK",
          tableId,
        });
        if (!presentCheckResult.success) {
          throw new Error(
            presentCheckResult.error || "Failed to present check",
          );
        }
      }

      const result = await sessionStore.dispatchAction({
        type: "CLOSE_CHECK",
        tableId,
        orderId: currentActiveOrder.id,
        dbOrderId: currentActiveOrder.db_order_id,
      });

      if (!result.success) {
        throw new Error(result.error || "Failed to close check");
      }

      updateActiveOrderDetails({ check_status: "Closed" });

      hideLoading();
      show({
        title: "Check Closed",
        message: "The check has been finalized. You can now clear the table.",
        type: "success",
      });
    } catch (error: any) {
      console.error("Failed to close check:", error);
      hideLoading();
      show({
        title: "Failed to Close Check",
        message: error.message || "An error occurred",
        type: "error",
      });
    }
  }, [show, showLoading, hideLoading, updateActiveOrderDetails]);

  // DEFERRED RENDERING: Progressive staged rendering via double-rAF
  // Stage 0: Skeleton placeholders (instant first paint)
  // Stage 1: BillSection (lighter — user sees their order first)
  // Stage 2: MenuSection + FlatList data. Heavy bill sheets mount on first open.
  const [renderStage, setRenderStage] = useState(0);
  useEffect(() => {
    const raf = requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        setRenderStage(1);
        requestAnimationFrame(() => {
          setRenderStage(2);
          // Perf Phase 0: closes pos.boot_to_order (started at PIN success).
          // No-op when no mark is pending (e.g. plain navigation here).
          markEnd("pos.boot_to_order");
        });
      });
    });
    return () => cancelAnimationFrame(raf);
  }, []);

  useEffect(() => {
    if (renderStage >= 2 && moreOptionsOpenedOnce) {
      const id = setTimeout(() => moreOptionsSheetRef.current?.expand(), 80);
      return () => clearTimeout(id);
    }
  }, [moreOptionsOpenedOnce, renderStage]);
  useEffect(() => {
    if (renderStage >= 2 && discountOpenedOnce) {
      const id = setTimeout(() => discountSheetRef.current?.expand(), 80);
      return () => clearTimeout(id);
    }
  }, [discountOpenedOnce, renderStage]);
  useEffect(() => {
    if (renderStage >= 2 && serviceChargeOpenedOnce) {
      const id = setTimeout(() => serviceChargeSheetRef.current?.expand(), 80);
      return () => clearTimeout(id);
    }
  }, [renderStage, serviceChargeOpenedOnce]);

  const displayOrders =
    renderStage >= 2 ? reversedFilteredOrders : EMPTY_ORDERS;
  const minOrdersSheetHeight = Math.round(windowHeight * 0.56);
  const maxOrdersSheetHeight = windowHeight;
  const defaultOrdersSheetHeight =
    minimalModeRows === 2
      ? Math.round(windowHeight * 0.74)
      : maxOrdersSheetHeight;

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    height: ordersSheetHeight.value,
  }));

  const clampOrdersSheetHeight = useCallback(
    (height: number) =>
      Math.max(minOrdersSheetHeight, Math.min(maxOrdersSheetHeight, height)),
    [maxOrdersSheetHeight, minOrdersSheetHeight],
  );

  useEffect(() => {
    if (!isOrdersModuleOpen) return;
    ordersSheetHeight.value = defaultOrdersSheetHeight;
  }, [defaultOrdersSheetHeight, isOrdersModuleOpen]);

  const sheetResizePanResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: (_evt, gestureState) =>
          Math.abs(gestureState.dy) > 2,
        onPanResponderGrant: () => {
          dragStartHeightRef.current = ordersSheetHeight.value;
        },
        onPanResponderMove: (_evt, gestureState) => {
          const nextHeight = clampOrdersSheetHeight(
            dragStartHeightRef.current - gestureState.dy,
          );
          ordersSheetHeight.value = nextHeight;
        },
        onPanResponderRelease: (_evt, gestureState) => {
          const nextHeight = clampOrdersSheetHeight(
            dragStartHeightRef.current - gestureState.dy,
          );
          ordersSheetHeight.value = nextHeight;
        },
      }),
    [clampOrdersSheetHeight, ordersSheetHeight],
  );

  // Bulk complete: orders eligible for completion
  const completableOrders = useMemo(() => {
    return displayOrders.filter((order) => {
      const effectivePaidStatus = deriveEffectivePaidStatus(order);
      if (order.order_status === "completed" || order.order_status === "void")
        return false;
      if (orderCompletionMode === "auto_on_payment")
        return effectivePaidStatus === "Paid";
      return effectivePaidStatus === "Paid" && order.order_status === "ready";
    });
  }, [displayOrders, orderCompletionMode]);

  const handleBulkComplete = useCallback(() => {
    completableOrders.forEach((order) => {
      markAllItemsAsReady(order.id);
      archiveOrder(order.id);
    });
    setBulkCompleteModalOpen(false);
  }, [completableOrders, markAllItemsAsReady, archiveOrder]);

  const renderOrderBadge = useCallback(
    ({ item }: { item: OrderProfile }) => (
      <Animated.View
        entering={iosOnly(SlideInLeft.duration(300).springify().damping(16))}
      >
        <OrderBadge
          order={item}
          onMarkDone={() => handleMarkDone(item.id)}
          onViewItems={() => handleViewItems(item.id)}
          onRetrieve={() => handleRetrieve(item.id)}
          onReopenCheck={() => handleReopenCheck(item.id)}
          onPrintReceipt={() => handlePrintReceipt(item)}
        />
      </Animated.View>
    ),
    [
      handleMarkDone,
      handleViewItems,
      handleRetrieve,
      handleReopenCheck,
      handlePrintReceipt,
    ],
  );

  const badgeKeyExtractor = useCallback((item: OrderProfile) => item.id, []);

  const updateBadgeScrollAffordance = useCallback((offsetX: number) => {
    const maxOffset = Math.max(
      0,
      orderBadgeContentWidthRef.current - orderBadgeViewportWidthRef.current,
    );
    setCanScrollBadgesLeft(offsetX > 2);
    setCanScrollBadgesRight(offsetX < maxOffset - 2);
  }, []);

  const scrollBadgesBackward = useCallback(() => {
    const nextX = Math.max(0, orderBadgeScrollXRef.current - 180);
    orderBadgeListRef.current?.scrollToOffset({
      offset: nextX,
      animated: true,
    });
  }, []);

  const scrollBadgesForward = useCallback(() => {
    const nextX = orderBadgeScrollXRef.current + 180;
    orderBadgeListRef.current?.scrollToOffset({
      offset: nextX,
      animated: true,
    });
  }, []);

  const handleAccordionChange = useCallback(
    (value: string | undefined) => setIsAccordionOpen(!!value),
    [],
  );

  useEffect(() => {
    if (orderLineViewMode !== "minimal") {
      setIsOrdersModuleOpen(false);
    }
  }, [orderLineViewMode]);

  const handleCloseItemsModal = useCallback(() => setItemsModalOpen(false), []);

  const handleManageDrawer = useCallback(
    () => setCashDrawerSheetOpen(true),
    [],
  );
  const handleNoSale = useCallback(() => setNoSaleModalOpen(true), []);

  const activeSessionCount = useTableSessionStore((s) => {
    let count = 0;
    for (const sessionId in s.sessions) {
      const session = s.sessions[sessionId];
      if (
        session &&
        session.status !== "available" &&
        session.status !== "cleaning"
      ) {
        count++;
      }
    }
    return count;
  });

  const handleSelectOrder = useCallback(
    (orderId: string) => {
      setActiveOrder(orderId);
      setIsOrdersModuleOpen(false);
    },
    [setActiveOrder],
  );

  const renderOrderCard = useCallback(
    ({ item }: { item: OrderProfile }) => (
      <Animated.View
        entering={iosOnly(SlideInLeft.duration(300).springify().damping(16))}
      >
        <OrderLineMinimalCard
          order={item}
          onMarkDone={() => handleMarkDone(item.id)}
          onViewItems={() => handleViewItems(item.id)}
          onPrintReceipt={() => handlePrintReceipt(item)}
        />
      </Animated.View>
    ),
    [handlePrintReceipt, handleViewItems, handleMarkDone],
  );

  const renderOrderGridCard = useCallback(
    ({ item }: { item: OrderProfile }) => {
      const totalAmount = item.total_amount ?? 0;
      const displayId =
        item.display_number || item.order_number || `#${item.id.slice(-4)}`;
      const itemCount =
        item.items.length > 0
          ? item.items.length
          : (item._broadcastItemCount ?? 0);
      const openedAt = formatOrderOpenedTime(item.opened_at);
      const orderStatusColor = getOrderStatusColor(item.order_status);
      const effectivePaidStatus = deriveEffectivePaidStatus(item);
      const paidStatusColor = getPaidStatusColor(effectivePaidStatus);

      const canMarkDone =
        item.order_status === "preparing" ||
        item.order_status === "sent_to_kitchen" ||
        (item.order_status === "ready" && effectivePaidStatus === "Paid");

      const cashDue = item.cash_amount_due ?? item.amount_due ?? totalAmount;
      const statusLabel = formatOrderStatusLabel(item.order_status);

      return (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => handleSelectOrder(item.id)}
          style={{
            flex: 1,
            maxWidth: 320,
            alignSelf: "flex-start",
            borderRadius: s(14),
            borderWidth: 1,
            borderColor: colors.info + "50",
            backgroundColor: colors.panel,
            overflow: "hidden",
          }}
        >
          <View
            style={{
              paddingHorizontal: s(10),
              paddingTop: s(8),
              paddingBottom: s(7),
            }}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                gap: s(6),
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  flex: 1,
                  gap: s(6),
                }}
              >
                <View
                  style={{
                    width: s(20),
                    height: s(20),
                    borderRadius: s(6),
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.info + "18",
                    borderWidth: 1,
                    borderColor: colors.info + "35",
                  }}
                >
                  <ShoppingBag size={s(11)} color={colors.label} />
                </View>
                <Text
                  numberOfLines={1}
                  style={{
                    color: colors.heading,
                    fontSize: s(12),
                    fontWeight: "700",
                    flex: 1,
                  }}
                >
                  {displayId}
                </Text>
                {item.order_type ? (
                  <Text
                    numberOfLines={1}
                    style={{
                      color: colors.muted,
                      fontSize: s(10),
                      textTransform: "lowercase",
                    }}
                  >
                    {item.order_type}
                  </Text>
                ) : null}
              </View>
              <View
                style={{
                  paddingHorizontal: s(7),
                  paddingVertical: s(2),
                  borderRadius: 999,
                  backgroundColor: paidStatusColor + "20",
                  borderWidth: 1,
                  borderColor: paidStatusColor + "35",
                }}
              >
                <Text
                  style={{
                    color: paidStatusColor,
                    fontSize: s(9),
                    fontWeight: "700",
                  }}
                >
                  {formatPaymentStatus(effectivePaidStatus ?? item.paid_status)}
                </Text>
              </View>
            </View>

            <Text
              numberOfLines={1}
              style={{ color: colors.label, fontSize: s(10), marginTop: s(4) }}
            >
              {item.customer_name || "Walk-In"} • {itemCount} item
              {itemCount !== 1 ? "s" : ""}
            </Text>

            {!!openedAt && (
              <Text
                style={{ color: colors.muted, fontSize: s(9), marginTop: s(2) }}
              >
                {openedAt}
              </Text>
            )}

            <View style={{ flexDirection: "row", gap: s(6), marginTop: s(7) }}>
              <View
                style={{
                  paddingHorizontal: s(7),
                  paddingVertical: s(2),
                  borderRadius: 999,
                  backgroundColor: orderStatusColor + "20",
                  borderWidth: 1,
                  borderColor: orderStatusColor + "35",
                }}
              >
                <Text
                  style={{
                    color: orderStatusColor,
                    fontSize: s(9),
                    fontWeight: "700",
                  }}
                >
                  {statusLabel}
                </Text>
              </View>
              <View
                style={{
                  paddingHorizontal: s(7),
                  paddingVertical: s(2),
                  borderRadius: 999,
                  backgroundColor: colors.muted + "20",
                  borderWidth: 1,
                  borderColor: colors.muted + "30",
                }}
              >
                <Text
                  style={{
                    color: colors.label,
                    fontSize: s(9),
                    fontWeight: "600",
                  }}
                >
                  {item.check_status || "Opened"}
                </Text>
              </View>
            </View>
          </View>

          <View
            style={{
              paddingHorizontal: s(10),
              paddingVertical: s(6),
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.screen,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <Text style={{ color: colors.muted, fontSize: s(9) }}>
              Cash ${cashDue.toFixed(2)}
            </Text>
            <Text
              style={{
                color: colors.heading,
                fontSize: s(12),
                fontWeight: "700",
              }}
            >
              ${totalAmount.toFixed(2)}
            </Text>
          </View>

          <View style={{ paddingVertical: 3, backgroundColor: colors.screen }}>
            {canMarkDone && (
              <TouchableOpacity
                onPress={() => handleMarkDone(item.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: s(10),
                  paddingVertical: s(7),
                }}
              >
                <View
                  style={{
                    width: s(22),
                    height: s(22),
                    borderRadius: s(7),
                    backgroundColor: colors.success + "25",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: s(8),
                  }}
                >
                  <CheckCircle2 size={s(12)} color={colors.success} />
                </View>
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: "700",
                    color: colors.success,
                    flex: 1,
                  }}
                >
                  Mark as Done
                </Text>
                <ChevronRight size={s(13)} color={colors.label} />
              </TouchableOpacity>
            )}

            <TouchableOpacity
              onPress={() => handleViewItems(item.id)}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: s(10),
                paddingVertical: s(7),
              }}
            >
              <View
                style={{
                  width: s(22),
                  height: s(22),
                  borderRadius: s(7),
                  backgroundColor: colors.info + "20",
                  alignItems: "center",
                  justifyContent: "center",
                  marginRight: s(8),
                }}
              >
                <Eye size={s(12)} color={colors.info} />
              </View>
              <Text
                style={{
                  fontSize: s(11),
                  fontWeight: "700",
                  color: colors.heading,
                  flex: 1,
                }}
              >
                View Items
              </Text>
              <ChevronRight size={s(13)} color={colors.label} />
            </TouchableOpacity>

            {effectivePaidStatus === "Paid" && (
              <TouchableOpacity
                onPress={() => handlePrintReceipt(item)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: s(10),
                  paddingVertical: s(7),
                }}
              >
                <View
                  style={{
                    width: s(22),
                    height: s(22),
                    borderRadius: s(7),
                    backgroundColor: colors.muted + "20",
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: s(8),
                  }}
                >
                  <Printer size={s(12)} color={colors.muted} />
                </View>
                <Text
                  style={{
                    fontSize: s(11),
                    fontWeight: "700",
                    color: colors.heading,
                    flex: 1,
                  }}
                >
                  Print Receipt
                </Text>
                <ChevronRight size={s(13)} color={colors.label} />
              </TouchableOpacity>
            )}
          </View>
        </TouchableOpacity>
      );
    },
    [handleViewItems, handleMarkDone, handlePrintReceipt, handleSelectOrder],
  );

  return (
    <View
      key={colorScheme}
      className="flex-1 flex-col px-2 py-1"
      onTouchStart={markOrderProcessingActivity}
      style={{ backgroundColor: colors.screen }}
    >
      {/* <CashDrawerStatusBar
        onManagePress={handleManageDrawer}
        onNoSalePress={handleNoSale}
      /> */}
      <View
        className="flex-1 flex-row rounded-lg "
        style={{ backgroundColor: colors.screen }}
      >
        {/* Stage 1: BillSection (lighter — user sees their order first) */}
        {renderStage >= 1 ? (
          <BillSection
            key={`bill-${colorScheme}`}
            moreOptionsSheetRef={lazyMoreOptionsSheetRef}
            discountSheetRef={lazyDiscountSheetRef}
          />
        ) : (
          // BillSection skeleton: matches the 380px sidebar layout
          <View
            className="w-[38%] p-4"
            style={{ backgroundColor: colors.screen }}
          >
            <View
              className="h-10 w-48 rounded-lg mb-4"
              style={{ backgroundColor: colors.skeleton }}
            />
            <View
              className="h-6 w-32 rounded-md mb-3"
              style={{ backgroundColor: colors.skeleton }}
            />
            <View
              className="h-6 w-64 rounded-md mb-3"
              style={{ backgroundColor: colors.skeleton }}
            />
            <View
              className="h-6 w-52 rounded-md mb-3"
              style={{ backgroundColor: colors.skeleton }}
            />
            <View className="flex-1" />
            <View
              className="h-14 rounded-xl"
              style={{ backgroundColor: colors.skeleton }}
            />
          </View>
        )}

        <View className="flex-1 ml-0" style={{ backgroundColor: colors.card }}>
          {/* Stage 2: MenuSection (heavier — fills in after BillSection) */}
          {renderStage >= 2 ? (
            <MenuSection
              key={`menu-${colorScheme}`}
              showSearchButton={false}
              placeMenuSelectorInMenuRow={true}
              showMenuTabButton={false}
              showOpenItemButton={false}
              showTablesButton={false}
              showPreviousOrdersSection={false}
              forceOrdersView={isInlinePreviousOrdersOpen}
              toolbarSearchSlot={
                orderLineViewMode === "minimal" ? (
                  <TouchableOpacity
                    onPress={() => setIsOrdersModuleOpen(true)}
                    className="flex-row items-center rounded-lg px-3 py-2.5 justify-start"
                    style={{
                      backgroundColor: colors.panel,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(12),
                        fontWeight: "600",
                        color: colors.label,
                      }}
                    >
                      Orders
                    </Text>
                    {displayOrders.length > 0 && (
                      <View
                        style={{
                          minWidth: s(20),
                          height: s(20),
                          borderRadius: s(10),
                          marginLeft: s(6),
                          backgroundColor: colors.muted + "20",
                          borderWidth: 1,
                          borderColor: colors.border,
                          alignItems: "center",
                          justifyContent: "center",
                          paddingHorizontal: s(5),
                        }}
                      >
                        <Text
                          style={{
                            color: colors.label,
                            fontSize: s(10),
                            fontWeight: "700",
                          }}
                        >
                          {displayOrders.length}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                ) : undefined
              }
              rightToolbarSlot={
                <View className="flex-row items-center gap-2">
                  <TouchableOpacity
                    onPress={() => {
                      setIsInlinePreviousOrdersOpen(false);
                    }}
                    className="flex-row items-center rounded-lg p-3 justify-start"
                    style={{
                      borderWidth: 1,
                      borderColor: !isInlinePreviousOrdersOpen
                        ? colors.teal + "55"
                        : colors.border,
                      backgroundColor: !isInlinePreviousOrdersOpen
                        ? colors.teal + "18"
                        : colors.panel,
                    }}
                    accessibilityLabel="Switch to ordering view"
                  >
                    <UtensilsCrossed
                      color={
                        !isInlinePreviousOrdersOpen ? colors.teal : colors.label
                      }
                      size={s(14)}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => router.replace("/tables")}
                    className="flex-row items-center rounded-lg p-3 justify-start"
                    style={{
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.panel,
                    }}
                    accessibilityLabel="Go to tables"
                  >
                    <Sofa color={colors.label} size={s(14)} />
                    {activeSessionCount > 0 && (
                      <View
                        style={{
                          minWidth: s(18),
                          height: s(18),
                          borderRadius: s(9),
                          marginLeft: s(6),
                          backgroundColor: colors.warning + "25",
                          borderWidth: 1,
                          borderColor: colors.warning + "45",
                          alignItems: "center",
                          justifyContent: "center",
                          paddingHorizontal: s(4),
                        }}
                      >
                        <Text
                          style={{
                            color: colors.warning,
                            fontSize: s(9),
                            fontWeight: "800",
                          }}
                        >
                          {activeSessionCount}
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setIsInlinePreviousOrdersOpen(true)}
                    className="flex-row items-center rounded-lg p-3 justify-start"
                    style={{
                      borderWidth: 1,
                      borderColor: isInlinePreviousOrdersOpen
                        ? colors.teal + "55"
                        : colors.border,
                      backgroundColor: isInlinePreviousOrdersOpen
                        ? colors.teal + "18"
                        : colors.panel,
                    }}
                    accessibilityLabel="Open history"
                  >
                    <Logs
                      color={
                        isInlinePreviousOrdersOpen ? colors.teal : colors.label
                      }
                      size={s(14)}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => setIsCustomItemModuleOpen(true)}
                    className="flex-row items-center rounded-lg px-3 py-2.5 gap-2"
                    style={{
                      backgroundColor: colors.teal,
                      borderWidth: 1,
                      borderColor: colors.teal,
                    }}
                  >
                    <Plus
                      size={s(16)}
                      color={colors.onSolid}
                      strokeWidth={2.5}
                    />
                    <Text
                      style={{
                        color: colors.onSolid,
                        fontSize: s(12),
                        fontWeight: "700",
                      }}
                    >
                      Custom Item
                    </Text>
                  </TouchableOpacity>
                </View>
              }
              headerLeft={
                <View className="flex-row items-center gap-x-2">
                  <TouchableOpacity
                    onPress={openSearch}
                    className="flex-row items-center rounded-lg px-3 py-2.5 justify-start"
                    style={{
                      width: s(300),
                      borderWidth: 1,
                      borderColor: `${colors.teal}35`,
                      backgroundColor: colors.screen,
                    }}
                  >
                    <Search size={s(14)} color={colors.muted} />
                    <Text
                      style={{
                        marginLeft: s(7),
                        fontSize: s(12),
                        fontWeight: "500",
                        color: colors.label,
                      }}
                    >
                      Search menu...
                    </Text>
                  </TouchableOpacity>

                  {orderLineViewMode !== "minimal" &&
                    completableOrders.length > 0 && (
                      <TouchableOpacity
                        onPress={() => setBulkCompleteModalOpen(true)}
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: s(4),
                          backgroundColor: colors.success + "15",
                          borderWidth: 1,
                          borderColor: colors.success + "30",
                          borderRadius: s(20),
                          paddingHorizontal: s(6),
                          paddingVertical: s(2),
                        }}
                      >
                        <CheckCircle2 size={s(10)} color={colors.success} />
                        <Text
                          style={{
                            fontSize: s(10),
                            fontWeight: "600",
                            color: colors.success,
                          }}
                        >
                          Complete All ({completableOrders.length})
                        </Text>
                      </TouchableOpacity>
                    )}
                </View>
              }
              headerBelow={
                <>
                  {!isInlinePreviousOrdersOpen &&
                  orderLineViewMode !== "minimal" &&
                  !isAccordionOpen ? (
                    <View className="px-0 py-1.5 flex-row items-center">
                      <View style={{ gap: 4 }}>
                        <View className="flex-row items-center gap-x-2">
                          <Text
                            style={{
                              color: colors.heading,
                              fontSize: s(18),
                              fontWeight: "600",
                            }}
                          >
                            Order Line
                          </Text>
                          {displayOrders?.length > 0 && (
                            <View
                              className="ml-1 border rounded-full px-2.5 py-0.5 items-center justify-center"
                              style={{
                                backgroundColor: colors.info + "30",
                                borderColor: colors.info + "55",
                              }}
                            >
                              <Text
                                className="text-xs font-bold"
                                style={{ color: colors.info }}
                              >
                                {displayOrders.length}
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {displayOrders.length > 0 && (
                        <View
                          className="flex-1 ml-2 justify-center"
                          style={{ position: "relative" }}
                        >
                          <Animated.FlatList
                            ref={orderBadgeListRef}
                            horizontal
                            data={displayOrders}
                            keyExtractor={badgeKeyExtractor}
                            className="max-h-10"
                            contentContainerStyle={badgeContentStyle}
                            showsHorizontalScrollIndicator={false}
                            onScroll={(event) => {
                              const nextX = event.nativeEvent.contentOffset.x;
                              orderBadgeScrollXRef.current = nextX;
                              updateBadgeScrollAffordance(nextX);
                            }}
                            onLayout={(event) => {
                              orderBadgeViewportWidthRef.current =
                                event.nativeEvent.layout.width;
                              updateBadgeScrollAffordance(
                                orderBadgeScrollXRef.current,
                              );
                            }}
                            onContentSizeChange={(width) => {
                              orderBadgeContentWidthRef.current = width;
                              updateBadgeScrollAffordance(
                                orderBadgeScrollXRef.current,
                              );
                            }}
                            scrollEventThrottle={16}
                            itemLayoutAnimation={iosOnly(
                              LinearTransition.springify()
                                .damping(18)
                                .stiffness(120),
                            )}
                            initialNumToRender={10}
                            maxToRenderPerBatch={10}
                            windowSize={3}
                            renderItem={renderOrderBadge}
                          />

                          {/* Left fade overlay */}
                          <LinearGradient
                            colors={[colors.card, colors.card + "00"]}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={{
                              position: "absolute",
                              left: 0,
                              top: 0,
                              bottom: 0,
                              width: 40,
                              zIndex: 4,
                              pointerEvents: "none",
                            }}
                          />

                          {/* Right fade overlay */}
                          <LinearGradient
                            colors={[colors.card + "00", colors.card]}
                            start={{ x: 0, y: 0.5 }}
                            end={{ x: 1, y: 0.5 }}
                            style={{
                              position: "absolute",
                              right: 0,
                              top: 0,
                              bottom: 0,
                              width: 40,
                              zIndex: 4,
                              pointerEvents: "none",
                            }}
                          />

                          {canScrollBadgesLeft && (
                            <TouchableOpacity
                              onPress={scrollBadgesBackward}
                              style={{
                                position: "absolute",
                                left: -2,
                                top: "50%",
                                marginTop: s(-14),
                                width: s(28),
                                height: s(28),
                                borderRadius: s(14),
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: colors.panel,
                                zIndex: 5,
                                shadowColor: "#000",
                                shadowOpacity: 0.28,
                                shadowRadius: 6,
                                shadowOffset: { width: 0, height: 2 },
                                elevation: 4,
                              }}
                              activeOpacity={0.85}
                            >
                              <ChevronLeft size={s(14)} color={colors.label} />
                            </TouchableOpacity>
                          )}

                          {canScrollBadgesRight && (
                            <TouchableOpacity
                              onPress={scrollBadgesForward}
                              style={{
                                position: "absolute",
                                right: -2,
                                top: "50%",
                                marginTop: s(-14),
                                width: s(28),
                                height: s(28),
                                borderRadius: s(14),
                                alignItems: "center",
                                justifyContent: "center",
                                backgroundColor: colors.panel,
                                zIndex: 5,
                                shadowColor: "#000",
                                shadowOpacity: 0.28,
                                shadowRadius: 6,
                                shadowOffset: { width: 0, height: 2 },
                                elevation: 4,
                              }}
                              activeOpacity={0.85}
                            >
                              <ChevronRight size={s(14)} color={colors.label} />
                            </TouchableOpacity>
                          )}
                        </View>
                      )}
                    </View>
                  ) : null}
                </>
              }
            />
          ) : (
            // MenuSection skeleton: matches the grid layout
            <View className="flex-1 p-4">
              <View className="flex-row gap-x-2 mb-3">
                {[1, 2, 3, 4].map((i) => (
                  <View
                    key={i}
                    className="h-10 w-20 rounded-lg"
                    style={{ backgroundColor: colors.skeleton }}
                  />
                ))}
              </View>
              <View className="flex-row flex-wrap gap-2">
                {[1, 2, 3, 4, 5, 6, 7, 8].map((i) => (
                  <View
                    key={i}
                    className="h-24 w-28 rounded-xl"
                    style={{ backgroundColor: colors.skeleton }}
                  />
                ))}
              </View>
            </View>
          )}
        </View>
      </View>

      {/* Stage 2: Mount bottom sheets in a dedicated overlay layer above BillSection controls */}
      {renderStage >= 2 &&
        (moreOptionsOpenedOnce ||
          discountOpenedOnce ||
          serviceChargeOpenedOnce) && (
          <View
            pointerEvents="box-none"
            style={[styles.sheetOverlayLayer, { top: -overlayHeaderHeight }]}
          >
            {moreOptionsOpenedOnce && (
              <MoreOptionsBottomSheet
                ref={moreOptionsSheetRef as React.RefObject<BottomSheetMethods>}
                discountSheetRef={lazyDiscountSheetRef}
                serviceChargeSheetRef={lazyServiceChargeSheetRef}
                onCloseCheck={handleCloseCheck}
                onNoSale={handleNoSale}
                onManageDrawer={() => setCashDrawerSheetOpen(true)}
              />
            )}
            {discountOpenedOnce && (
              <DiscountBottomSheet
                ref={discountSheetRef as React.RefObject<BottomSheetMethods>}
                onClose={() => discountSheetRef?.current?.close()}
              />
            )}
            {serviceChargeOpenedOnce && (
              <ServiceChargeOverrideSheet
                ref={
                  serviceChargeSheetRef as React.RefObject<BottomSheetMethods>
                }
                onClose={() => serviceChargeSheetRef?.current?.close()}
              />
            )}
          </View>
        )}

      <CashDrawerSheet
        isOpen={isCashDrawerSheetOpen}
        onClose={() => setCashDrawerSheetOpen(false)}
      />
      <NoSaleModal
        isOpen={isNoSaleModalOpen}
        onClose={() => setNoSaleModalOpen(false)}
      />
      <BulkCompleteModal
        visible={bulkCompleteModalOpen}
        orders={completableOrders}
        onConfirm={handleBulkComplete}
        onCancel={() => setBulkCompleteModalOpen(false)}
      />

      <Modal
        visible={isOrdersModuleOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setIsOrdersModuleOpen(false)}
      >
        <View
          style={{
            flex: 1,
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            onPress={() => setIsOrdersModuleOpen(false)}
            style={{
              ...StyleSheet.absoluteFillObject,
              backgroundColor: "rgba(0,0,0,0.5)",
            }}
          />

          <Animated.View
            style={[
              {
                width: "100%",
                borderTopLeftRadius: s(18),
                borderTopRightRadius: s(18),
                borderWidth: 1,
                borderColor: colors.info + "35",
                backgroundColor: colors.screen,
                overflow: "hidden",
              },
              sheetAnimatedStyle,
            ]}
          >
            <View
              {...sheetResizePanResponder.panHandlers}
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingTop: 8,
                paddingBottom: 6,
                backgroundColor: colors.screen,
              }}
            >
              <View
                style={{
                  width: s(58),
                  height: s(5),
                  borderRadius: 999,
                  backgroundColor: colors.border,
                }}
              />
            </View>

            <View
              style={{
                paddingHorizontal: s(12),
                paddingTop: s(6),
                paddingBottom: s(10),
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(8),
                }}
              >
                <Text
                  style={{
                    color: colors.heading,
                    fontSize: s(15),
                    fontWeight: "800",
                  }}
                >
                  Orders
                </Text>
                <View
                  style={{
                    minWidth: s(22),
                    height: s(22),
                    borderRadius: s(11),
                    backgroundColor: colors.info + "30",
                    borderWidth: 1,
                    borderColor: colors.info + "55",
                    alignItems: "center",
                    justifyContent: "center",
                    paddingHorizontal: s(6),
                  }}
                >
                  <Text
                    style={{
                      color: colors.heading,
                      fontSize: s(11),
                      fontWeight: "800",
                    }}
                  >
                    {displayOrders.length}
                  </Text>
                </View>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(8),
                }}
              >
                {completableOrders.length > 0 && (
                  <TouchableOpacity
                    onPress={() => setBulkCompleteModalOpen(true)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(4),
                      backgroundColor: colors.success + "15",
                      borderWidth: 1,
                      borderColor: colors.success + "30",
                      borderRadius: s(20),
                      paddingHorizontal: s(8),
                      paddingVertical: s(4),
                    }}
                  >
                    <CheckCircle2 size={s(12)} color={colors.success} />
                    <Text
                      style={{
                        fontSize: s(11),
                        fontWeight: "600",
                        color: colors.success,
                      }}
                    >
                      Complete All ({completableOrders.length})
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => setIsOrdersModuleOpen(false)}
                  style={{
                    width: s(30),
                    height: s(30),
                    borderRadius: s(15),
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.panel,
                    borderWidth: 1,
                    borderColor: colors.border,
                  }}
                >
                  <X size={s(16)} color={colors.label} />
                </TouchableOpacity>
              </View>
            </View>

            {displayOrders.length > 0 ? (
              <Animated.FlatList
                data={displayOrders}
                keyExtractor={badgeKeyExtractor}
                numColumns={4}
                contentContainerStyle={{
                  paddingHorizontal: s(12),
                  paddingVertical: s(12),
                  gap: s(10),
                }}
                columnWrapperStyle={{
                  marginBottom: s(10),
                  justifyContent: "flex-start",
                  gap: s(10),
                }}
                showsVerticalScrollIndicator={false}
                initialNumToRender={12}
                maxToRenderPerBatch={12}
                windowSize={4}
                renderItem={renderOrderGridCard}
              />
            ) : (
              <View
                style={{
                  paddingVertical: s(28),
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ color: colors.muted, fontSize: s(12) }}>
                  No active orders.
                </Text>
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>

      {isItemsModalOpen && (
        <OrderLineItemsModal
          isOpen={isItemsModalOpen}
          onClose={handleCloseItemsModal}
          orderId={selectedOrderId}
          onRetrieve={
            selectedOrderId ? () => handleRetrieve(selectedOrderId) : undefined
          }
        />
      )}

      <Modal
        visible={isCustomItemModuleOpen}
        transparent
        animationType="fade"
        onRequestClose={handleCustomItemBackdropPress}
      >
        <Pressable
          onPress={handleCustomItemBackdropPress}
          style={{
            flex: 1,
            backgroundColor: "rgba(0,0,0,0.5)",
            justifyContent: "flex-start",
            paddingHorizontal: 24,
            paddingTop: customItemModalTop,
          }}
        >
          <Pressable
            onPress={() => {}}
            style={{
              width: s(500),
              maxWidth: "96%",
              height: customItemModalHeight,
              alignSelf: "center",
              maxHeight: customItemModalHeight,
              borderRadius: s(18),
              borderWidth: 1,
              borderColor: colors.teal + "45",
              backgroundColor: colors.screen,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                paddingHorizontal: s(12),
                paddingVertical: s(10),
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
              }}
            >
              <Text
                style={{
                  color: colors.heading,
                  fontSize: s(14),
                  fontWeight: "800",
                }}
              >
                Create Custom Item
              </Text>
              <TouchableOpacity
                onPress={() => setIsCustomItemModuleOpen(false)}
                style={{
                  width: s(30),
                  height: s(30),
                  borderRadius: s(15),
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.panel,
                  borderWidth: 1,
                  borderColor: colors.border,
                }}
              >
                <X size={s(16)} color={colors.label} />
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1 }}>
              <OpenItemAdder
                modalLayout
                onCreated={() => setIsCustomItemModuleOpen(false)}
              />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
};

export default OrderProcessing;

const styles = StyleSheet.create({
  sheetOverlayLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 20000,
    elevation: 20000,
  },
});
