import ClaimOrderModal from "@/components/order/ClaimOrderModal";
import ReadOnlyBanner from "@/components/order/ReadOnlyBanner";
import { useLoading } from "@/contexts/LoadingContext";
import { useToast } from "@/contexts/ToastContext";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { getDeviceId } from "@/lib/deviceId";
import {
  findLatestReusableEmptyDraftId,
  getRefreshedReusableDraftNumbers,
  isReusableEmptyDraftOrder,
} from "@/lib/reusableEmptyDraft";
import { useIsActiveOrderReadOnly } from "@/lib/orderAccessControlHooks";
import { colors, TABLE_STATUS_COLORS } from "@/lib/theme";
import { CartItem } from "@/lib/types";
import {
    getAutoRetryCount,
    isAutoRetryInProgress,
} from "@/services/offlineSyncService";
import { useActiveOrder } from "@/stores/selectors/orderSelectors";
import { useDineInStore } from "@/stores/useDineInStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { useReservationStore } from "@/stores/useReservationStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useOrderSyncCounts } from "@/stores/useSyncStatusStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { useTimeclockStore } from "@/stores/useTimeclockStore";
import type {
    FloorPlanObject,
    ServerSection,
    TableSession,
} from "@/types/db-floor-plan-types";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { useRouter } from "expo-router";
import {
    AlertTriangle,
    Check,
    Clock,
    CreditCard,
    MoreHorizontal,
    NotebookPen,
    Plus,
    Printer,
    RefreshCw,
    Trash2,
    WifiOff,
    X,
} from "lucide-react-native";
import React, {
    useCallback,
    useEffect,
    useRef,
    useMemo,
    useState,
} from "react";
import {
    ActivityIndicator,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
import { useShallow } from "zustand/react/shallow";
import {
    Dialog,
    DialogContent,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "../ui/dialog";
import BillSummary from "./BillSummary";
import DiscountOverlay from "./DiscountOverlay";
import OrderDetails from "./OrderDetails";
import OrderSyncBanner from "./OrderSyncBanner";
import Totals from "./Totals";

// OPTIMIZED: Memoize to prevent re-renders when parent updates.
// Subscribes to ONLY the active order's items array — re-renders when the
// items reference changes (Immer mutates items on add) but not when other
// order fields change. Parent's re-render no longer cascades here.
const EMPTY_CART_ITEMS: CartItem[] = [];

const BillItemsAndTotals = React.memo(
  ({
    orderNote,
    isNetworkDegraded,
    onSaveOrderNote,
  }: {
    orderNote?: string;
    isNetworkDegraded: boolean;
    onSaveOrderNote: (value: string) => void;
  }) => {
    const cart = useOrderStore<CartItem[]>((s) => {
      const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
      return (order?.items ?? EMPTY_CART_ITEMS) as CartItem[];
    });
    const activeOrderPaymentInfo = useOrderStore(
      useShallow((s) => {
        const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
        const payments = order?.payments ?? null;
        return {
          orderHasPayments: !!payments?.some(
            (payment: any) => !payment.isVoided,
          ),
          payments,
        };
      }),
    );
    const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
    const [isOrderNoteEditorOpen, setIsOrderNoteEditorOpen] = useState(false);
    const [orderNoteDraft, setOrderNoteDraft] = useState(orderNote ?? "");
    const [orderNoteModalDraft, setOrderNoteModalDraft] = useState(
      orderNote ?? "",
    );
    const orderNoteInputRef = useRef<TextInput>(null);
    const orderNoteFocusTimeoutsRef = useRef<ReturnType<typeof setTimeout>[]>(
      [],
    );

    const clearOrderNoteFocusTimeouts = useCallback(() => {
      orderNoteFocusTimeoutsRef.current.forEach(clearTimeout);
      orderNoteFocusTimeoutsRef.current = [];
    }, []);

    useEffect(() => {
      const nextNote = orderNote ?? "";
      setOrderNoteDraft(nextNote);
      if (!isOrderNoteEditorOpen) {
        setOrderNoteModalDraft(nextNote);
      }
    }, [isOrderNoteEditorOpen, orderNote]);

    useEffect(() => clearOrderNoteFocusTimeouts, [clearOrderNoteFocusTimeouts]);

    const handleToggleExpand = useCallback((itemId: string) => {
      setExpandedItemId((prev) => (prev === itemId ? null : itemId));
    }, []);

    const openOrderNoteEditor = useCallback(() => {
      setOrderNoteModalDraft(orderNoteDraft);
      setIsOrderNoteEditorOpen(true);
    }, [orderNoteDraft]);

    const closeOrderNoteEditor = useCallback(() => {
      clearOrderNoteFocusTimeouts();
      setIsOrderNoteEditorOpen(false);
      setOrderNoteModalDraft(orderNoteDraft);
    }, [clearOrderNoteFocusTimeouts, orderNoteDraft]);

    const handleDoneOrderNoteEditor = useCallback(() => {
      clearOrderNoteFocusTimeouts();
      const nextNote = orderNoteModalDraft;
      setOrderNoteDraft(nextNote);
      setIsOrderNoteEditorOpen(false);
      onSaveOrderNote(nextNote);
    }, [clearOrderNoteFocusTimeouts, onSaveOrderNote, orderNoteModalDraft]);

    const focusOrderNoteEditor = useCallback(() => {
      clearOrderNoteFocusTimeouts();

      const focusInput = () => {
        orderNoteInputRef.current?.focus();
      };

      [350, 650].forEach((delay) => {
        const timeoutId = setTimeout(focusInput, delay);
        orderNoteFocusTimeoutsRef.current.push(timeoutId);
      });
    }, [clearOrderNoteFocusTimeouts]);

    const renderOrderNoteButton = () => (
      <TouchableOpacity activeOpacity={0.9} onPress={openOrderNoteEditor}>
        <View
          className="h-9 rounded-lg flex-row items-center mb-1"
          style={{
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 10,
            gap: 7,
          }}
        >
          <NotebookPen size={13} color={colors.muted} />
          <Text
            numberOfLines={1}
            style={{
              flex: 1,
              color: orderNoteDraft.trim() ? colors.heading : colors.muted,
              fontSize: 12,
              lineHeight: 16,
              fontFamily: "System",
            }}
          >
            {orderNoteDraft.trim() || "Add order note..."}
          </Text>
        </View>
      </TouchableOpacity>
    );

    return (
      <View style={{ flex: 1, position: "relative" }}>
        {/* Wave 3.0e-2: order-bound dead-letter banner. Renders nothing when
            the active order has no order-bound failures. Mounted at the top
            of the bill so failed ops are visible before the operator scrolls. */}
        <OrderSyncBanner />
        <BillSummary
          cart={cart}
          expandedItemId={expandedItemId}
          onToggleExpand={handleToggleExpand}
          orderHasPayments={activeOrderPaymentInfo.orderHasPayments}
          payments={activeOrderPaymentInfo.payments}
          isNetworkDegraded={isNetworkDegraded}
        />
        <View className="px-3 pb-1">
          {renderOrderNoteButton()}
        </View>

        <Modal
          transparent
          visible={isOrderNoteEditorOpen}
          animationType="fade"
          onShow={focusOrderNoteEditor}
          onRequestClose={closeOrderNoteEditor}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: "rgba(0,0,0,0.28)",
              justifyContent: "center",
              paddingHorizontal: 16,
            }}
            onPress={closeOrderNoteEditor}
          >
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              keyboardVerticalOffset={Platform.OS === "ios" ? 12 : 0}
              style={{
                width: "50%",
                alignSelf: "center",
              }}
            >
              <Pressable
                onPress={() => {}}
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: 18,
                  borderWidth: 1,
                  borderColor: colors.border,
                  padding: 16,
                  gap: 14,
                }}
              >
                <View style={{ gap: 6 }}>
                  <Text
                    style={{
                      color: colors.heading,
                      fontSize: 18,
                      fontWeight: "700",
                    }}
                  >
                    Order Note
                  </Text>
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: 13,
                      lineHeight: 18,
                    }}
                  >
                    Add a note for this order.
                  </Text>
                </View>
                <TextInput
                  ref={orderNoteInputRef}
                  value={orderNoteModalDraft}
                  onChangeText={setOrderNoteModalDraft}
                  placeholder="Add order note..."
                  placeholderTextColor={colors.muted}
                  multiline
                  showSoftInputOnFocus
                  style={{
                    minHeight: 104,
                    color: colors.heading,
                    fontSize: 14,
                    lineHeight: 20,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                    textAlignVertical: "top",
                  }}
                />
                <View style={{ flexDirection: "row", gap: 12 }}>
                  <TouchableOpacity
                    onPress={closeOrderNoteEditor}
                    className="flex-1 h-11 rounded-xl items-center justify-center"
                    style={{
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.heading,
                        fontSize: 14,
                        fontWeight: "700",
                      }}
                    >
                      Cancel
                    </Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={handleDoneOrderNoteEditor}
                    className="flex-1 h-11 rounded-xl items-center justify-center"
                    style={{ backgroundColor: colors.teal }}
                  >
                    <Text
                      style={{
                        color: colors.onSolid,
                        fontSize: 14,
                        fontWeight: "700",
                      }}
                    >
                      Done
                    </Text>
                  </TouchableOpacity>
                </View>
              </Pressable>
            </KeyboardAvoidingView>
          </Pressable>
        </Modal>
      </View>
    );
  },
  (prev, next) =>
    prev.orderNote === next.orderNote &&
    prev.isNetworkDegraded === next.isNetworkDegraded &&
    prev.onSaveOrderNote === next.onSaveOrderNote,
);

const BillSectionContent = ({
  showOrderDetails = true,
  showPlaymentActions = true,
  moreOptionsSheetRef,
  discountSheetRef,
}: {
  showOrderDetails?: boolean;
  showPlaymentActions?: boolean;
  moreOptionsSheetRef?: React.RefObject<BottomSheetMethods>;
  discountSheetRef?: React.RefObject<BottomSheetMethods>;
}) => {
  const router = useRouter();
  // Wave 2 §C: primitive selectors only — no shallow object, no full-order
  // subscription. Each primitive triggers a re-render of this component
  // ONLY when that specific field changes, decoupled from items-array churn
  // during rapid adds and from the deferred totals microtask.
  const activeOrderId = useOrderStore((state) => state.activeOrderId);
  const activeOrderPaidStatus = useOrderStore((s) =>
    s.activeOrderId
      ? (s.ordersById[s.activeOrderId]?.paid_status ?? null)
      : null,
  );
  const activeOrderType = useOrderStore((s) =>
    s.activeOrderId
      ? (s.ordersById[s.activeOrderId]?.order_type ?? null)
      : null,
  );
  const activeOrderServiceLocation = useOrderStore((s) =>
    s.activeOrderId
      ? (s.ordersById[s.activeOrderId]?.service_location_id ?? null)
      : null,
  );
  const activeOrderDisplayNumber = useOrderStore((s) => {
    const o = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return o?.display_number ?? o?.order_number ?? null;
  });
  const activeOrderHasPayments = useOrderStore((s) => {
    const o = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return !!o?.payments?.some((p: any) => !p.isVoided);
  });
  const activeOrderHasPendingPaymentSync = useOrderStore((s) => {
    const o = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return !!o?.payments?.some((p: any) => p.sync_status === "pending");
  });
  // Cached totals: refreshed by the deferred setTimeout(0) microtask in
  // _scheduleTotalsRecompute (and synchronously by _ensureTotalsFresh at
  // commit-points). Reading these is O(1) per render and doesn't trigger
  // calculateOrderTotals on the parent.
  const activeOrderTotal = useOrderStore((s) => s.activeOrderTotal ?? 0);
  const activeOrderOutstandingTotal = useOrderStore(
    (s) => s.activeOrderOutstandingTotal ?? 0,
  );
  // Items-array reference: used for the cart-derived useMemos below. This
  // selector still re-renders on every add (intentional — the component
  // updates badges and button-disabled state). Memoized children skip via
  // their own subscriptions.
  const activeOrderItems = useOrderStore(
    (s) =>
      (s.activeOrderId ? s.ordersById[s.activeOrderId]?.items : null) ?? null,
  );

  const {
    startNewOrder,
    sendNewItemsToKitchen,
    assignOrderToTable,
    setActiveOrder,
    retryFailedSyncs,
    clearCart,
    voidOrder,
    updateActiveOrderDetails,
  } = useOrderStore(
    useShallow((s) => ({
      startNewOrder: s.startNewOrder,
      sendNewItemsToKitchen: s.sendNewItemsToKitchen,
      assignOrderToTable: s.assignOrderToTable,
      setActiveOrder: s.setActiveOrder,
      retryFailedSyncs: s.retryFailedSyncs,
      clearCart: s.clearCart,
      voidOrder: s.voidOrder,
      updateActiveOrderDetails: s.updateActiveOrderDetails,
    })),
  );
  const activeOrder = useOrderStore((s) =>
    s.activeOrderId ? s.ordersById[s.activeOrderId] : null,
  );

  // Offline sync state — subscribe directly to offlineSyncService for reliable updates.
  // `isOnline` is the effective status (false during connection-quality slow-mode, used
  // for routing decisions). `rawIsOnline` is raw NetInfo (used for UI affordances so
  // slow-mode queues silently in the background).
  const { isOnline, rawIsOnline, pendingSyncCount } = useNetworkStatus();

  const { selectedTable, clearSelectedTable } = useDineInStore();
  const setSelectedTable = useDineInStore((s) => s.setSelectedTable);
  const floorPlans = useFloorPlanStore((s) => s.floorPlans);
  const tables = useFloorPlanStore((s) => s.tables);
  const sections = useFloorPlanStore((s) => s.sections);
  const activeFloorPlanId = useFloorPlanStore((s) => s.activeFloorPlanId);
  const setActiveFloorPlan = useFloorPlanStore((s) => s.setActiveFloorPlan);
  const liveSessions = useTableSessionStore((s) => s.sessions);
  const { activeEmployeeId } = useEmployeeStore();
  const { checkEmployeeInShift, showClockInWall } = useTimeclockStore();
  const { hideLoading, showLoading } = useLoading();
  const { show } = useToast();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const autoPrintKitchenTickets = useLocationConfigStore(
    (s) => s.config.printing.autoPrintKitchenTickets,
  );
  const deviceId = useMemo(() => getDeviceId(), []);

  // Memoize computed values to prevent unnecessary recalculations
  const cart = useMemo(() => activeOrderItems || [], [activeOrderItems]);
  const hasDraftItems = useMemo(
    () => cart.some((item) => item.isDraft),
    [cart],
  );
  const hasNonDraftItems = useMemo(
    () =>
      cart.some((item) =>
        ["sent", "preparing", "ready", "served"].includes(
          item.kitchen_status ?? "",
        ),
      ),
    [cart],
  );
  const newItemsCount = useMemo(
    () =>
      cart.filter(
        (item) => item.kitchen_status === "new" || !item.kitchen_status,
      ).length,
    [cart],
  );

  // Get sync counts for the active order's non-draft items.
  // useOrderSyncCounts only re-renders BillSection when the actual counts change,
  // not on every individual item sync status transition.
  const nonDraftItemIds = useMemo(
    () => cart.filter((item) => !item.isDraft).map((item) => item.id),
    [cart],
  );
  const syncStatus = useOrderSyncCounts(nonDraftItemIds);
  const hasPendingSyncs = syncStatus.pending > 0;
  const hasFailedSyncs = syncStatus.failed > 0;

  // Track auto-retry state for UI indicator
  const [autoRetryState, setAutoRetryState] = useState({
    isRetrying: false,
    count: 0,
  });

  // Poll for auto-retry status when there are failed syncs
  useEffect(() => {
    if (!hasFailedSyncs && !hasPendingSyncs) {
      setAutoRetryState((prev) =>
        prev.isRetrying || prev.count !== 0
          ? { isRetrying: false, count: 0 }
          : prev,
      );
      return;
    }

    // Check auto-retry status periodically
    const checkAutoRetry = () => {
      const isRetrying = isAutoRetryInProgress();
      const count = getAutoRetryCount();
      setAutoRetryState((prev) =>
        prev.isRetrying === isRetrying && prev.count === count
          ? prev
          : { isRetrying, count },
      );
    };

    checkAutoRetry();
    const interval = setInterval(checkAutoRetry, 5000); // PERF: 5s - informational, not action-critical

    return () => clearInterval(interval);
  }, [hasFailedSyncs, hasPendingSyncs]);

  // Calculate the amount to display on the Pay button.
  // Wave 2 §C: reads cached totals (refreshed by _scheduleTotalsRecompute /
  // _ensureTotalsFresh) instead of running calculateOrderTotals on every
  // parent render. For new orders without payments, the outstanding equals
  // the total; after payments, the outstanding is what's left.
  const displayBalanceDue = activeOrderHasPayments
    ? activeOrderOutstandingTotal
    : activeOrderTotal;

  // Check if order is partially paid (has payments but not fully paid)
  const isPartiallyPaid =
    activeOrderHasPayments &&
    (activeOrderPaidStatus !== "Paid" || activeOrderOutstandingTotal > 0.01);

  const isCurrentOrderEmptyDraft = useMemo(() => {
    if (!activeOrder) return false;
    if (cart.length > 0) return false;
    return isReusableEmptyDraftOrder(activeOrder);
  }, [activeOrder, cart]);

  const [isProcessing, setIsProcessing] = useState(false);
  const isPaymentSheetOpen = usePaymentStore((state) => state.isOpen);

  const currentOrderNote = useMemo(
    () => activeOrder?.notes?.trim() ?? "",
    [activeOrder?.notes],
  );

  const handleSaveOrderNote = useCallback(
    async (nextNote: string) => {
      const trimmed = nextNote.trim();
      await updateActiveOrderDetails({
        notes: trimmed.length > 0 ? trimmed : undefined,
      });
    },
    [updateActiveOrderDetails],
  );

  // Effect to reset processing state when payment sheet opens
  useEffect(() => {
    if (isPaymentSheetOpen) {
      setIsProcessing(false);
    }
  }, [isPaymentSheetOpen]);

  // Lever 2: read-only when the active order belongs to another station.
  const isReadOnly = useIsActiveOrderReadOnly();
  const activeOrderForReadOnly = useActiveOrder();
  // Wave 2.7: prefer `station_name` (current owner — refreshed by broadcast,
  // hydrate, and the focus-time recheck) over `_sourceStationName` (original
  // creator — never changes after order creation). Fallback chain so the
  // banner still has a label on legacy orders that pre-date Wave 2.7.
  const sourceStationName =
    activeOrderForReadOnly?.station_name ??
    activeOrderForReadOnly?._sourceStationName ??
    null;
  const claimActiveOrder = useOrderStore((s) => s.claimActiveOrder);
  const [isClaimModalOpen, setClaimModalOpen] = useState(false);
  const [isClaiming, setClaiming] = useState(false);

  const handleTakeOver = useCallback(() => {
    setClaimModalOpen(true);
  }, []);

  const handleCancelClaim = useCallback(() => {
    if (isClaiming) return;
    setClaimModalOpen(false);
  }, [isClaiming]);

  const handleConfirmClaim = useCallback(async () => {
    if (isClaiming) return;
    setClaiming(true);
    try {
      await claimActiveOrder();
    } finally {
      setClaiming(false);
      setClaimModalOpen(false);
    }
  }, [claimActiveOrder, isClaiming]);

  // Memoize pay button disabled state - prevents clicking when balance due is 0 or no items
  const isPayButtonDisabled = useMemo(
    () =>
      !activeOrderId ||
      cart.length === 0 ||
      displayBalanceDue <= 0 ||
      isProcessing ||
      isReadOnly,
    [activeOrderId, cart.length, displayBalanceDue, isProcessing, isReadOnly],
  );
  const [isDiscountOverlayVisible, setDiscountOverlayVisible] = useState(false);
  const [isVoidConfirmOpen, setIsVoidConfirmOpen] = useState(false);
  const [clearCartDialogMode, setClearCartDialogMode] = useState<
    "clear" | "voidNonDraft"
  >("clear");
  const [isTableSelectorOpen, setIsTableSelectorOpen] = useState(false);
  const [selectorPartySize, setSelectorPartySize] = useState(1);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(
    null,
  );
  const [pendingFloorPlanId, setPendingFloorPlanId] = useState<string | null>(
    null,
  );
  const billSectionRef = useRef<View>(null);
  const [tableDrawerAnchor, setTableDrawerAnchor] = useState({
    left: 0,
    top: 0,
    height: 0,
  });
  // OPTIMIZED: Wrap callbacks with useCallback to prevent recreation on each render
  const handleOpenDiscounts = useCallback(() => {
    setDiscountOverlayVisible(true);
  }, []);

  const handleCloseDiscounts = useCallback(() => {
    setDiscountOverlayVisible(false);
  }, []);

  const handleOpenMoreOptions = useCallback(() => {
    moreOptionsSheetRef?.current?.expand();
  }, [moreOptionsSheetRef]);

  const isMoreButtonDisabled =
    !activeOrderId || activeOrder?.check_status === "Closed" || isReadOnly;

  const displayedTable = useMemo(
    () =>
      selectedTable ??
      tables.find((table) => table.id === activeOrderServiceLocation) ??
      null,
    [activeOrderServiceLocation, selectedTable, tables],
  );

  const liveTableStatus = useMemo((): string | null => {
    if (!displayedTable) return null;
    return (
      liveSessions[displayedTable.id]?.status ??
      displayedTable.session?.status ??
      "available"
    );
  }, [displayedTable, liveSessions]);

  const handleOpenTableSelector = useCallback(() => {
    setSelectedSectionId(
      selectedTable?.section_id ?? displayedTable?.section_id ?? null,
    );
    setPendingFloorPlanId(
      displayedTable?.floor_plan_id ??
        selectedTable?.floor_plan_id ??
        activeFloorPlanId ??
        floorPlans[0]?.id ??
        null,
    );
    setSelectorPartySize(Math.max(1, activeOrder?.guest_count ?? 1));

    if (billSectionRef.current?.measureInWindow) {
      billSectionRef.current.measureInWindow((x, y, width, height) => {
        setTableDrawerAnchor({ left: x + width, top: y, height });
        setIsTableSelectorOpen(true);
      });
      return;
    }

    setIsTableSelectorOpen(true);
  }, [
    activeFloorPlanId,
    activeOrder?.guest_count,
    displayedTable?.floor_plan_id,
    displayedTable?.section_id,
    floorPlans,
    selectedTable?.floor_plan_id,
    selectedTable?.section_id,
  ]);

  const activeFloorPlan = useMemo(
    () => floorPlans.find((plan) => plan.id === activeFloorPlanId) ?? null,
    [activeFloorPlanId, floorPlans],
  );

  const tableOptions = useMemo(
    () =>
      tables
        .filter(
          (table) =>
            table.is_active !== false &&
            table.is_visible !== false &&
            (table.category === "table" || table.category === "booth"),
        )
        .sort((left, right) => left.name.localeCompare(right.name)),
    [tables],
  );

  const floorPlanOptions = useMemo(
    () =>
      [...floorPlans].sort((left, right) =>
        left.name.localeCompare(right.name),
      ),
    [floorPlans],
  );

  const sectionOptions = useMemo(() => {
    const sectionsById = new Map(
      sections.map((section) => [section.id, section]),
    );
    const uniqueSectionIds = Array.from(
      new Set(tableOptions.map((table) => table.section_id).filter(Boolean)),
    ) as string[];

    return uniqueSectionIds
      .map((sectionId) => {
        const existingSection = sectionsById.get(sectionId);

        return (
          existingSection ?? {
            id: sectionId,
            name: "Section",
            color: colors.muted,
            assigned_staff_id: null,
            floor_plan_id:
              tableOptions.find((table) => table.section_id === sectionId)
                ?.floor_plan_id || "",
          }
        );
      })
      .sort((left, right) => left.name.localeCompare(right.name));
  }, [sections, tableOptions]);

  const filteredTableOptions = useMemo(() => {
    if (!selectedSectionId) {
      return tableOptions;
    }

    return tableOptions.filter(
      (table) => table.section_id === selectedSectionId,
    );
  }, [selectedSectionId, tableOptions]);

  const selectedSection = useMemo(
    () =>
      sectionOptions.find((section) => section.id === selectedSectionId) ??
      null,
    [sectionOptions, selectedSectionId],
  );

  const handleOpenFloorPlanSelector = useCallback(() => {
    void handleOpenTableSelector();
  }, [handleOpenTableSelector]);

  const handleOpenSectionSelector = useCallback(() => {
    void handleOpenTableSelector();
  }, [handleOpenTableSelector]);

  const handleSelectFloorPlan = useCallback(
    async (floorPlanId: string) => {
      if (floorPlanId === activeFloorPlanId) {
        setPendingFloorPlanId(floorPlanId);
        return;
      }

      setPendingFloorPlanId(floorPlanId);
      setSelectedSectionId(null);
      await setActiveFloorPlan(floorPlanId);
    },
    [activeFloorPlanId, setActiveFloorPlan],
  );

  useEffect(() => {
    if (!selectedSectionId) {
      return;
    }

    const hasSelectedSection = sectionOptions.some(
      (section) => section.id === selectedSectionId,
    );

    if (!hasSelectedSection) {
      setSelectedSectionId(null);
    }
  }, [sectionOptions, selectedSectionId]);

  const getTableStatusLabel = useCallback((table: FloorPlanObject) => {
    const liveStatus =
      useTableSessionStore.getState().sessions[table.id]?.status ??
      table.session?.status ??
      "available";
    const status = liveStatus;
    const labelMap: Record<string, string> = {
      available: "Available",
      reserved: "Reserved",
      seating: "Seating",
      seated: "Seated",
      ordering: "Ordering",
      ordered: "Ordered",
      served: "Served",
      check_presented: "Check Presented",
      paying: "Paying",
      paid: "Paid",
      closing: "Closing",
      cleaning: "Cleaning",
      blocked: "Blocked",
      not_in_service: "Not in Service",
    };

    return labelMap[status] || status;
  }, []);

  const isSessionLinkedToOrder = useCallback(
    (session: TableSession | undefined) => {
      if (!session?.order_id || !activeOrderId) return false;
      if (session.order_id === activeOrderId) return true;
      return (
        !!activeOrder?.db_order_id &&
        session.order_id === activeOrder.db_order_id
      );
    },
    [activeOrder?.db_order_id, activeOrderId],
  );

  const linkedTableId = useMemo(() => {
    if (displayedTable?.id) {
      return displayedTable.id;
    }

    const linkedEntry = Object.entries(liveSessions).find(([, session]) =>
      isSessionLinkedToOrder(session),
    );

    return linkedEntry?.[0] ?? activeOrderServiceLocation ?? null;
  }, [
    activeOrderServiceLocation,
    displayedTable?.id,
    isSessionLinkedToOrder,
    liveSessions,
  ]);

  const linkedTableSession = useMemo(() => {
    if (!linkedTableId) return null;
    return liveSessions[linkedTableId] ?? null;
  }, [linkedTableId, liveSessions]);

  const ensureDineInOrderTableSession = useCallback(
    async (table: FloorPlanObject): Promise<boolean> => {
      if (activeOrderType !== "dine_in" || !activeOrderId) {
        return true;
      }

      const sessionStore = useTableSessionStore.getState();
      const destinationSession = sessionStore.sessions[table.id];
      const destinationStatus =
        destinationSession?.status ?? table.session?.status ?? "available";
      const linkedSessionEntries = Object.entries(sessionStore.sessions).filter(
        ([, session]) => isSessionLinkedToOrder(session),
      );
      const hasLinkedSessionOnDestination = linkedSessionEntries.some(
        ([tableId]) => tableId === table.id,
      );
      const activeLinkedSourceEntries = linkedSessionEntries.filter(
        ([tableId, session]) =>
          tableId !== table.id && session.status !== "available",
      );

      if (destinationStatus !== "available" && !hasLinkedSessionOnDestination) {
        show({
          title: "Table Unavailable",
          message: `${table.name} is currently ${getTableStatusLabel(
            table,
          ).toLowerCase()}.`,
          type: "error",
        });
        return false;
      }

      if (activeLinkedSourceEntries.length > 1) {
        show({
          title: "Multiple Session Conflict",
          message:
            "This order appears on multiple active table sessions. Please clear the extra table sessions before moving this order.",
          type: "error",
        });
        return false;
      }

      const sourceEntry = activeLinkedSourceEntries[0];
      const sourceSession = sourceEntry?.[1];
      const shouldTransfer = !!sourceSession;

      if (shouldTransfer && sourceSession) {
        if (
          destinationStatus !== "available" &&
          !hasLinkedSessionOnDestination
        ) {
          show({
            title: "Table Unavailable",
            message: `${table.name} is currently ${getTableStatusLabel(
              table,
            ).toLowerCase()}.`,
            type: "error",
          });
          return false;
        }

        if (!isOnline) {
          show({
            title: "Offline Transfer Blocked",
            message:
              "You are offline. Reassigning an active dine-in table requires a live connection to transfer the session safely.",
            type: "warning",
          });
          return false;
        }

        try {
          await sessionStore.transferSession(sourceSession.id, [table.id]);
        } catch (error) {
          console.error(
            "[BillSection] Failed to transfer table session:",
            error,
          );
          show({
            title: "Transfer Failed",
            message:
              "Could not move this order to the selected table. Please try again.",
            type: "error",
          });
          return false;
        }
      }

      assignOrderToTable(activeOrderId, table.id);

      const refreshedDestinationSession =
        useTableSessionStore.getState().sessions[table.id];
      const hasActiveDestinationSession =
        !!refreshedDestinationSession &&
        refreshedDestinationSession.status !== "available";

      if (!hasActiveDestinationSession) {
        try {
          const shouldCreateSessionOrder = !activeOrder?.db_order_id;
          console.log(
            "[BillSection][TableSelect] Seating table session request",
            {
              activeOrderId,
              activeDbOrderId: activeOrder?.db_order_id ?? null,
              selectedTableId: table.id,
              shouldCreateSessionOrder,
              selectorPartySize,
            },
          );

          const seatingResult = await useTableSessionStore
            .getState()
            .seatGuests({
              tableIds: [table.id],
              partySize: Math.max(1, selectorPartySize),
              createOrder: shouldCreateSessionOrder,
              localOrderId: activeOrderId,
              selected_station: selectedStation?.id,
              device_id: deviceId,
            });

          console.log("[BillSection][TableSelect] seatGuests result", {
            activeOrderId,
            activeDbOrderId: activeOrder?.db_order_id ?? null,
            sessionId: seatingResult?.sessionId,
            returnedOrderId: seatingResult?.orderId,
            shouldCreateSessionOrder,
          });

          // If this order already exists in backend, seat the table session without
          // creating a second backend order, then explicitly link the existing order.
          if (
            !shouldCreateSessionOrder &&
            activeOrder?.db_order_id &&
            seatingResult?.sessionId
          ) {
            console.log(
              "[BillSection][TableSelect] Linking existing order to new session",
              {
                sessionId: seatingResult.sessionId,
                dbOrderId: activeOrder.db_order_id,
                localOrderId: activeOrderId,
              },
            );
            await useTableSessionStore
              .getState()
              .linkOrderToSession(
                seatingResult.sessionId,
                activeOrder.db_order_id,
              );
          }
        } catch (error) {
          console.error(
            "[BillSection] Failed to start table session for dine-in order:",
            error,
          );
          show({
            title: "Session Start Failed",
            message:
              "Table was selected, but we could not start the table session. Please try again.",
            type: "error",
          });
          return false;
        }
      }

      return true;
    },
    [
      activeOrder?.db_order_id,
      activeOrder?.guest_count,
      activeOrderId,
      activeOrderType,
      assignOrderToTable,
      deviceId,
      getTableStatusLabel,
      isOnline,
      isSessionLinkedToOrder,
      selectedStation?.id,
      selectorPartySize,
      show,
    ],
  );

  const handleSelectTable = useCallback(
    async (table: FloorPlanObject) => {
      if (!(await ensureDineInOrderTableSession(table))) {
        return;
      }

      setSelectedTable(table);
      setIsTableSelectorOpen(false);
    },
    [ensureDineInOrderTableSession, setSelectedTable, show],
  );

  useEffect(() => {
    if (
      activeOrderType !== "dine_in" ||
      activeOrderPaidStatus !== "Paid" ||
      !linkedTableId ||
      !linkedTableSession ||
      linkedTableSession.status === "paid" ||
      linkedTableSession.status === "cleaning"
    ) {
      return;
    }

    void useTableSessionStore
      .getState()
      .dispatchAction({ type: "FULL_PAYMENT", tableId: linkedTableId });
  }, [
    activeOrderPaidStatus,
    activeOrderType,
    linkedTableId,
    linkedTableSession,
  ]);

  const handleCloseSession = useCallback(async () => {
    if (!activeOrderId || !activeOrder) return;

    const isDineInOrder =
      activeOrder.order_type === "dine_in" ||
      activeOrder.order_type === "Dine In";

    if (!isDineInOrder) {
      show({
        title: "Session Not Available",
        message: "Only dine-in orders have table sessions.",
        type: "warning",
      });
      return;
    }

    if (activeOrder.paid_status !== "Paid") {
      show({
        title: "Cannot Close Session",
        message: "Order must be fully paid before closing the table session.",
        type: "error",
      });
      return;
    }

    if (!linkedTableId) {
      show({
        title: "No Table Linked",
        message: "This order is not linked to an active table session.",
        type: "warning",
      });
      return;
    }

    showLoading("Closing session...");

    try {
      const sessionStore = useTableSessionStore.getState();

      if (activeOrder.check_status !== "Closed") {
        if (!activeOrder.db_order_id) {
          throw new Error(
            "Order must be synced to close check before closing session",
          );
        }

        if (
          linkedTableSession &&
          !["check_presented", "paying", "paid", "cleaning"].includes(
            linkedTableSession.status,
          )
        ) {
          const presentCheckResult = await sessionStore.dispatchAction({
            type: "PRESENT_CHECK",
            tableId: linkedTableId,
          });

          if (!presentCheckResult.success) {
            throw new Error(
              presentCheckResult.error || "Failed to present check",
            );
          }
        }

        const closeCheckResult = await sessionStore.dispatchAction({
          type: "CLOSE_CHECK",
          tableId: linkedTableId,
          orderId: activeOrder.id,
          dbOrderId: activeOrder.db_order_id,
        });

        if (!closeCheckResult.success) {
          throw new Error(closeCheckResult.error || "Failed to close check");
        }

        useOrderStore
          .getState()
          .updateActiveOrderDetails({ check_status: "Closed" });
      }

      const currentSession = sessionStore.getSession(linkedTableId);
      if (
        currentSession &&
        currentSession.status !== "paid" &&
        currentSession.status !== "cleaning"
      ) {
        const paymentTransition = await sessionStore.dispatchAction({
          type: "FULL_PAYMENT",
          tableId: linkedTableId,
        });

        if (!paymentTransition.success) {
          throw new Error(
            paymentTransition.error ||
              "Failed to finalize table session before closing",
          );
        }
      }

      const clearResult = await sessionStore.dispatchAction({
        type: "CLEAR_TABLE",
        tableId: linkedTableId,
        orderId: activeOrderId,
      });

      if (!clearResult.success) {
        throw new Error(clearResult.error || "Failed to close session");
      }

      show({
        title: "Session Closed",
        message: "Table marked for cleaning.",
        type: "success",
      });
    } catch (error: any) {
      show({
        title: "Failed to Close Session",
        message: error.message || "An unexpected error occurred.",
        type: "error",
      });
    } finally {
      hideLoading();
    }
  }, [
    activeOrder,
    activeOrderId,
    hideLoading,
    linkedTableId,
    linkedTableSession,
    show,
    showLoading,
  ]);

  const handleClearCart = useCallback(() => {
    if (!activeOrderId || !activeOrder) return;
    setClearCartDialogMode(hasNonDraftItems ? "voidNonDraft" : "clear");
    setIsVoidConfirmOpen(true);
  }, [activeOrder, activeOrderId, hasNonDraftItems]);

  const handleConfirmVoidOrder = useCallback(async () => {
    if (!activeOrderId || !activeOrder) return;

    const sessionStore = useTableSessionStore.getState();
    const sessionId = activeOrder.session_id;
    const tableId = sessionId
      ? sessionStore.sessionTableIndex[sessionId]?.[0] ??
        sessionStore.getSessionBySessionId(sessionId)?.tableId ??
        ""
      : "";

    if (tableId) {
      await sessionStore.dispatchAction({
        type: "VOID_ORDER",
        tableId,
        orderId: activeOrder.id,
        dbOrderId: activeOrder.db_order_id,
      });
      if (activeOrder.session_id) {
        await useReservationStore
          .getState()
          .completeReservationForSession(activeOrder.session_id);
      }
    } else {
      voidOrder(activeOrderId);
    }

    setIsVoidConfirmOpen(false);
    setClearCartDialogMode("clear");
    show({
      title: "Order Voided",
      message: "The current order has been successfully voided.",
      type: "success",
    });
  }, [activeOrder, activeOrderId, show, voidOrder]);

  const handleConfirmClearCart = useCallback(async () => {
    if (!activeOrderId || !activeOrder) return;

    if (clearCartDialogMode === "voidNonDraft") {
      await handleConfirmVoidOrder();
      return;
    }

    clearCart();

    setIsVoidConfirmOpen(false);
    setClearCartDialogMode("clear");
  }, [
    activeOrder,
    activeOrderId,
    clearCart,
    clearCartDialogMode,
    handleConfirmVoidOrder,
  ]);

  const handlePayClick = () => {
    // Safety guard: Prevent payment if button should be disabled
    if (isPayButtonDisabled || isProcessing) {
      return;
    }

    // Set processing state immediately to prevent double taps
    setIsProcessing(true);

    // Failsafe: Reset processing state after 2 seconds if sheet fails to open
    setTimeout(() => {
      setIsProcessing(false);
    }, 2000);

    if (!checkEmployeeInShift(activeEmployeeId!)) {
      showClockInWall();
      setIsProcessing(false);
      return;
    }
    if (hasDraftItems) {
      show({
        title: "Unconfirmed Items",
        message:
          "Please confirm or remove any customized items before proceeding to payment.",
        type: "error",
      });
      setIsProcessing(false);
      return;
    }
    // Additional safety check for zero balance due
    if (displayBalanceDue <= 0) {
      show({
        title: "Invalid Amount",
        message:
          activeOrderPaidStatus === "Paid"
            ? "This order is already fully paid."
            : "Cannot process payment for $0.00. Please add items to the order.",
        type: "error",
      });
      setIsProcessing(false);
      return;
    }

    if (
      activeOrderType === "dine_in" &&
      linkedTableId &&
      linkedTableSession &&
      !["check_presented", "paying", "paid", "cleaning"].includes(
        linkedTableSession.status,
      )
    ) {
      void useTableSessionStore
        .getState()
        .dispatchAction({ type: "PRESENT_CHECK", tableId: linkedTableId });
    }

    // Flush any pending totals recompute (rapid-add coalescer) so the payment
    // sheet reads fresh totals on its first frame instead of the stale
    // pre-add value. No-op when nothing is queued.
    if (activeOrderId) {
      useOrderStore.getState()._ensureTotalsFresh(activeOrderId);
    }

    // Directly open the payment bottom sheet to the method selection
    usePaymentStore
      .getState()
      .open(
        "Card",
        linkedTableId || activeOrderServiceLocation || null,
        "payment-method-selection",
      );
  };

  const handleSendToKitchen = async () => {
    if (!checkEmployeeInShift(activeEmployeeId!)) {
      showClockInWall();
      return;
    }
    if (hasDraftItems) {
      show({
        title: "Unconfirmed Items",
        message:
          "Please confirm or remove any customized items before sending the order to the kitchen.",
        type: "error",
      });
      return;
    }

    const dineInTargetTable = selectedTable ?? displayedTable;
    const pendingKitchenItems = cart.filter(
      (item) => !item.kitchen_status || item.kitchen_status === "new",
    );

    if (activeOrderType === "dine_in" && dineInTargetTable) {
      const sessionReady =
        await ensureDineInOrderTableSession(dineInTargetTable);
      if (!sessionReady) {
        show({
          title: "Session Required",
          message:
            "Could not confirm a valid table session for this order. Please reselect the table and try again.",
          type: "error",
        });
        return;
      }

      if (pendingKitchenItems.length > 0) {
        useTableSessionStore.getState().dispatch(dineInTargetTable.id, {
          type: "PATCH",
          updates: {
            status: "ordered",
            order_id: activeOrder?.db_order_id ?? activeOrderId,
          },
        });
      }

      clearSelectedTable();
    }
    // Auto-print is now handled centrally inside sendNewItemsToKitchen
    await sendNewItemsToKitchen();
  };

  // OPTIMIZED: Wrap callback with useCallback
  // Explicit New Order action should always create a fresh order number.
  const handleStartNewOrder = useCallback(() => {
    if (isCurrentOrderEmptyDraft && activeOrder?.id) {
      setActiveOrder(activeOrder.id);
      return;
    }

    const { activeOrderId: currentActiveOrderId, orderIds, ordersById } =
      useOrderStore.getState();
    const reusableEmptyDraftId = findLatestReusableEmptyDraftId(
      ordersById,
      orderIds,
      currentActiveOrderId,
      selectedStation?.id ?? null,
    );

    if (reusableEmptyDraftId) {
      if (selectedStore) {
        const refreshedNumbers = getRefreshedReusableDraftNumbers({
          draftId: reusableEmptyDraftId,
          ordersById,
          orderIds,
          locationId: selectedStore.id,
          stationNumber: selectedStation?.station_number ?? null,
        });
        if (refreshedNumbers) {
          useOrderStore.setState((state) => {
            const draft = state.ordersById[reusableEmptyDraftId];
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
  }, [
    activeOrder?.id,
    isCurrentOrderEmptyDraft,
    startNewOrder,
    setActiveOrder,
  ]);

  if (!activeOrderId)
    return (
      <View
        className="w-[38%] px-4 py-5"
        style={{
          backgroundColor: colors.screen,
          borderRightWidth: 2,
          borderColor: colors.border,
        }}
      >
        <View style={{ flex: 1 }}>
          <View
            style={{
              flex: 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <View
              style={{
                width: "100%",
                maxWidth: 320,
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 22,
                paddingHorizontal: 22,
                paddingVertical: 24,
                alignItems: "center",
              }}
            >
              <View
                style={{
                  width: 54,
                  height: 54,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: colors.tealMuted,
                  borderWidth: 1,
                  borderColor: colors.border,
                  marginBottom: 14,
                }}
              >
                <Plus size={22} color={colors.teal} />
              </View>

              <Text
                style={{
                  color: colors.heading,
                  fontSize: 19,
                  fontWeight: "700",
                  textAlign: "center",
                }}
              >
                No Active Order
              </Text>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 12,
                  lineHeight: 18,
                  textAlign: "center",
                  marginTop: 8,
                  marginBottom: 18,
                }}
              >
                Start a fresh ticket or jump back into the latest empty draft.
              </Text>

              <TouchableOpacity
                className="h-11 px-4 rounded-xl flex-row items-center justify-center gap-2 active:opacity-80"
                style={{
                  backgroundColor: colors.teal,
                  minWidth: 176,
                }}
                onPress={() => {
                  const { orderIds, ordersById } = useOrderStore.getState();
                  const reusableEmptyDraftId = findLatestReusableEmptyDraftId(
                    ordersById,
                    orderIds,
                    null,
                    selectedStation?.id ?? null,
                  );

                  if (reusableEmptyDraftId) {
                    if (selectedStore) {
                      const refreshedNumbers = getRefreshedReusableDraftNumbers({
                        draftId: reusableEmptyDraftId,
                        ordersById,
                        orderIds,
                        locationId: selectedStore.id,
                        stationNumber: selectedStation?.station_number ?? null,
                      });
                      if (refreshedNumbers) {
                        useOrderStore.setState((state) => {
                          const draft = state.ordersById[reusableEmptyDraftId];
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
                }}
              >
                <Plus color={colors.onSolid} size={14} />
                <Text
                  style={{
                    color: colors.onSolid,
                    fontSize: 14,
                    fontWeight: "700",
                  }}
                >
                  Start New Order
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  // Handle retry failed syncs
  const handleRetryFailedSyncs = async () => {
    if (activeOrderId) {
      await retryFailedSyncs(activeOrderId);
    }
  };

  return (
    <View
      ref={billSectionRef}
      className="w-[38%] relative"
      style={{
        backgroundColor: colors.screen,
        borderRightWidth: 2,
        borderColor: colors.border,
      }}
    >
      <View
        className="px-3 pt-2 pb-1"
        style={{ backgroundColor: colors.screen }}
      >
        <View className="flex-row items-center justify-between mb-2">
          <View className="flex-row items-center gap-2">
            <Text
              style={{ color: colors.heading, fontWeight: "700", fontSize: 18 }}
            >
              {activeOrderDisplayNumber
                ? `Order ${activeOrderDisplayNumber}`
                : "New Order"}
            </Text>
            <TouchableOpacity
              className={`h-8 px-3 rounded-lg flex-row items-center justify-center gap-1 ${
                newItemsCount === 0 || hasDraftItems || isReadOnly
                  ? "opacity-50"
                  : ""
              }`}
              style={{ backgroundColor: colors.teal }}
              disabled={newItemsCount === 0 || hasDraftItems || isReadOnly}
              onPress={handleSendToKitchen}
            >
              <Printer size={12} color={colors.onSolid} />
              <Text
                style={{
                  color: colors.onSolid,
                  fontSize: 12,
                  fontWeight: "500",
                }}
              >
                Send
              </Text>
            </TouchableOpacity>
            {activeOrderType === "dine_in" && linkedTableId ? (
              <TouchableOpacity
                onPress={handleCloseSession}
                disabled={activeOrderPaidStatus !== "Paid"}
                className="h-8 px-3 rounded-lg flex-row items-center justify-center"
                style={{
                  backgroundColor:
                    activeOrderPaidStatus === "Paid"
                      ? colors.warning
                      : colors.card,
                  borderWidth: activeOrderPaidStatus === "Paid" ? 0 : 1,
                  borderColor: colors.border,
                  opacity: activeOrderPaidStatus === "Paid" ? 1 : 0.5,
                }}
              >
                <Text
                  style={{
                    color:
                      activeOrderPaidStatus === "Paid"
                        ? colors.onSolid
                        : colors.label,
                    fontSize: 12,
                    fontWeight: "500",
                  }}
                >
                  Close Session
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>

          <View className="flex-row items-center gap-1.5">
            <TouchableOpacity
              onPress={handleStartNewOrder}
              className="h-8 px-3 rounded-lg flex-row items-center justify-center gap-1"
              style={{ backgroundColor: colors.teal }}
            >
              <Plus color={colors.onSolid} size={12} />
              <Text
                style={{
                  color: colors.onSolid,
                  fontSize: 12,
                  fontWeight: "500",
                }}
              >
                New Order
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleClearCart}
              disabled={!activeOrderId || cart.length === 0 || isReadOnly}
              className="h-8 w-8 rounded-lg items-center justify-center"
              style={{
                backgroundColor: "#F87171",
                opacity:
                  !activeOrderId || cart.length === 0 || isReadOnly ? 0.45 : 1,
              }}
            >
              <Trash2 color={colors.screen} size={13} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {showOrderDetails && (
        <OrderDetails
          tableLabel={
            displayedTable?.name
              ? `Table ${displayedTable.name}`
              : "Select Table"
          }
          tableStatus={liveTableStatus}
          onOpenTableSelector={handleOpenTableSelector}
          onViewTable={
            displayedTable
              ? () => router.push(`/tables/${displayedTable.id}` as any)
              : undefined
          }
        />
      )}

      {isReadOnly && (
        <ReadOnlyBanner
          sourceStationName={sourceStationName}
          isClaiming={isClaiming}
          onTakeOver={handleTakeOver}
        />
      )}

      <Modal
        transparent
        visible={isTableSelectorOpen && activeOrderType === "dine_in"}
        animationType="fade"
        onRequestClose={() => setIsTableSelectorOpen(false)}
      >
        <View style={{ flex: 1 }}>
          {/* Scrim */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setIsTableSelectorOpen(false)}
            style={
              {
                position: "absolute",
                inset: 0,
                backgroundColor: "rgba(0,0,0,0.55)",
              } as any
            }
          />

          {/* Panel */}
          <View
            style={{
              position: "absolute",
              top: tableDrawerAnchor.top > 0 ? tableDrawerAnchor.top : 0,
              left: tableDrawerAnchor.left > 0 ? tableDrawerAnchor.left : "38%",
              height:
                tableDrawerAnchor.height > 0
                  ? tableDrawerAnchor.height
                  : "100%",
              width: 380,
              backgroundColor: colors.screen,
              borderLeftWidth: 0,
              borderTopWidth: 1,
              borderBottomWidth: 1,
              borderRightWidth: 1,
              borderColor: colors.border,
              borderTopRightRadius: 16,
              borderBottomRightRadius: 16,
              overflow: "hidden",
              flexDirection: "column",
            }}
          >
            {/* ── Top header ── */}
            <View
              style={{
                paddingHorizontal: 18,
                paddingTop: 16,
                paddingBottom: 12,
              }}
            >
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={{
                      color: colors.heading,
                      fontSize: 16,
                      fontWeight: "700",
                      letterSpacing: -0.2,
                    }}
                  >
                    Select Table
                  </Text>
                  <Text
                    style={{ color: colors.muted, fontSize: 11, marginTop: 1 }}
                  >
                    {
                      filteredTableOptions.filter(
                        (t) =>
                          (liveSessions[t.id]?.status ??
                            t.session?.status ??
                            "available") === "available",
                      ).length
                    }{" "}
                    of {filteredTableOptions.length} available
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setIsTableSelectorOpen(false)}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    width: 28,
                    height: 28,
                    borderRadius: 14,
                    backgroundColor: colors.inset,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <X size={13} color={colors.muted} />
                </TouchableOpacity>
              </View>

              {/* Floor plan tabs — only shown when >1 plan */}
              {floorPlanOptions.length > 1 && (
                <View
                  style={{
                    flexDirection: "row",
                    backgroundColor: colors.inset,
                    borderRadius: 10,
                    padding: 3,
                    marginTop: 12,
                  }}
                >
                  {floorPlanOptions.map((plan) => {
                    const isActive =
                      (pendingFloorPlanId ?? activeFloorPlanId) === plan.id;
                    return (
                      <TouchableOpacity
                        key={plan.id}
                        onPress={() => {
                          void handleSelectFloorPlan(plan.id);
                        }}
                        style={{
                          flex: 1,
                          paddingVertical: 6,
                          borderRadius: 8,
                          alignItems: "center",
                          backgroundColor: isActive
                            ? colors.teal
                            : "transparent",
                          shadowColor: isActive ? colors.teal : "transparent",
                          shadowOffset: { width: 0, height: 1 },
                          shadowOpacity: isActive ? 0.3 : 0,
                          shadowRadius: 3,
                          elevation: isActive ? 2 : 0,
                        }}
                      >
                        <Text
                          style={{
                            color: isActive ? colors.onSolid : colors.muted,
                            fontSize: 12,
                            fontWeight: isActive ? "600" : "500",
                          }}
                        >
                          {plan.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Section chips */}
              {sectionOptions.length > 0 && (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ marginTop: 10, marginHorizontal: -18 }}
                  contentContainerStyle={{
                    paddingHorizontal: 18,
                    gap: 6,
                    flexDirection: "row",
                  }}
                >
                  {[
                    { id: null, name: "All" },
                    ...sectionOptions.map((s: ServerSection) => ({
                      id: s.id,
                      name: s.name,
                    })),
                  ].map((item) => {
                    const isActive = selectedSectionId === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id ?? "__all__"}
                        onPress={() => setSelectedSectionId(item.id)}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 5,
                          borderRadius: 8,
                          backgroundColor: isActive ? colors.teal : colors.card,
                          borderWidth: 1,
                          borderColor: isActive ? colors.teal : colors.border,
                        }}
                      >
                        <Text
                          style={{
                            color: isActive ? colors.onSolid : colors.label,
                            fontSize: 11,
                            fontWeight: "600",
                          }}
                        >
                          {item.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Party size stepper */}
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "space-between",
                  marginTop: 10,
                  paddingHorizontal: 2,
                }}
              >
                <Text
                  style={{
                    color: colors.label,
                    fontSize: 12,
                    fontWeight: "600",
                  }}
                >
                  Guests
                </Text>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 10,
                    backgroundColor: colors.inset,
                    borderRadius: 8,
                    paddingHorizontal: 4,
                    paddingVertical: 2,
                  }}
                >
                  <TouchableOpacity
                    onPress={() =>
                      setSelectorPartySize((p) => Math.max(1, p - 1))
                    }
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor:
                        selectorPartySize <= 1 ? "transparent" : colors.card,
                      opacity: selectorPartySize <= 1 ? 0.4 : 1,
                    }}
                    disabled={selectorPartySize <= 1}
                  >
                    <Text
                      style={{
                        color: colors.heading,
                        fontSize: 16,
                        fontWeight: "600",
                        lineHeight: 20,
                      }}
                    >
                      −
                    </Text>
                  </TouchableOpacity>
                  <Text
                    style={{
                      color: colors.heading,
                      fontSize: 14,
                      fontWeight: "700",
                      minWidth: 20,
                      textAlign: "center",
                    }}
                  >
                    {selectorPartySize}
                  </Text>
                  <TouchableOpacity
                    onPress={() =>
                      setSelectorPartySize((p) => Math.min(99, p + 1))
                    }
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: 6,
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.card,
                    }}
                  >
                    <Text
                      style={{
                        color: colors.heading,
                        fontSize: 16,
                        fontWeight: "600",
                        lineHeight: 20,
                      }}
                    >
                      +
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: colors.border }} />

            {/* ── Table grid ── */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 12, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              {filteredTableOptions.length === 0 ? (
                <View style={{ alignItems: "center", paddingTop: 56 }}>
                  <Text
                    style={{
                      color: colors.heading,
                      fontSize: 14,
                      fontWeight: "600",
                    }}
                  >
                    No tables found
                  </Text>
                  <Text
                    style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}
                  >
                    Try a different section
                  </Text>
                </View>
              ) : (
                <View
                  style={{
                    flexDirection: "row",
                    flexWrap: "wrap",
                    gap: 8,
                    justifyContent: "center",
                  }}
                >
                  {filteredTableOptions.map((table) => {
                    const liveStatusKey =
                      liveSessions[table.id]?.status ??
                      table.session?.status ??
                      "available";
                    const statusLabel = getTableStatusLabel(table);
                    const statusColor =
                      TABLE_STATUS_COLORS[liveStatusKey] || colors.muted;
                    const isCurrentlyAssigned =
                      table.id === activeOrderServiceLocation;
                    const tableSession = liveSessions[table.id];
                    const isLinkedToThisOrder =
                      isSessionLinkedToOrder(tableSession);
                    const isSelected =
                      selectedTable?.id === table.id ||
                      (!selectedTable && isCurrentlyAssigned);
                    const isAvailable = liveStatusKey === "available";
                    const isSelectable =
                      isAvailable || isCurrentlyAssigned || isLinkedToThisOrder;
                    return (
                      <TouchableOpacity
                        key={table.id}
                        onPress={() => handleSelectTable(table)}
                        activeOpacity={isSelectable ? 0.7 : 1}
                        style={{
                          width: "45%",
                          borderRadius: 12,
                          borderWidth: 1,
                          borderColor: isSelected ? colors.teal : colors.border,
                          backgroundColor: isSelected
                            ? `${colors.teal}12`
                            : colors.card,
                          opacity: isSelectable ? 1 : 0.4,
                          paddingHorizontal: 12,
                          paddingVertical: 12,
                        }}
                      >
                        {/* Name + check */}
                        <View
                          style={{
                            flexDirection: "row",
                            alignItems: "center",
                            justifyContent: "space-between",
                          }}
                        >
                          <Text
                            style={{
                              color: colors.heading,
                              fontSize: 17,
                              fontWeight: "700",
                              letterSpacing: -0.3,
                              flexShrink: 1,
                            }}
                            numberOfLines={1}
                          >
                            {table.name}
                          </Text>
                          {isSelected ? (
                            <View
                              style={{
                                width: 20,
                                height: 20,
                                borderRadius: 10,
                                backgroundColor: colors.teal,
                                alignItems: "center",
                                justifyContent: "center",
                                marginLeft: 6,
                              }}
                            >
                              <Check
                                size={11}
                                color={colors.onSolid}
                                strokeWidth={3}
                              />
                            </View>
                          ) : (
                            <View
                              style={{
                                width: 10,
                                height: 10,
                                borderRadius: 5,
                                backgroundColor: statusColor,
                                marginLeft: 6,
                                opacity: 0.85,
                              }}
                            />
                          )}
                        </View>

                        {/* Status */}
                        <Text
                          style={{
                            color: isSelected ? colors.teal : statusColor,
                            fontSize: 10,
                            fontWeight: "600",
                            marginTop: 5,
                            textTransform: "uppercase",
                            letterSpacing: 0.3,
                          }}
                        >
                          {isCurrentlyAssigned && !isSelected
                            ? "Current"
                            : statusLabel}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Offline / Sync Status Banner — only for errors or issues, not routine sync.
          Uses rawIsOnline (NetInfo) so connection-quality slow-mode silently queues
          in the background instead of surfacing scary "Offline Mode" UX. */}
      {(!rawIsOnline || hasFailedSyncs || activeOrderHasPendingPaymentSync) && (
        <View
          className="px-3 py-1.5 gap-y-1"
          style={{ backgroundColor: colors.background }}
        >
          {!rawIsOnline && (
            <View className="flex-row items-center justify-center bg-amber-600 px-2.5 py-1.5 rounded-md">
              <WifiOff size={12} color="#FFFFFF" />
              <Text
                className="text-white font-medium ml-1.5"
                style={{ fontSize: 11 }}
              >
                Offline Mode
                {pendingSyncCount > 0 ? ` • ${pendingSyncCount} pending` : ""}
              </Text>
            </View>
          )}

          {rawIsOnline && hasFailedSyncs && (
            <TouchableOpacity
              onPress={handleRetryFailedSyncs}
              disabled={autoRetryState.isRetrying}
              className={`flex-row items-center justify-between px-2.5 py-1.5 rounded-md ${
                autoRetryState.isRetrying ? "bg-amber-600/80" : "bg-red-600/80"
              }`}
              activeOpacity={0.7}
            >
              <View className="flex-row items-center">
                {autoRetryState.isRetrying ? (
                  <>
                    <ActivityIndicator size="small" color="#FFFFFF" />
                    <Text
                      className="text-white font-medium ml-1.5"
                      style={{ fontSize: 11 }}
                    >
                      Retrying {autoRetryState.count} op
                      {autoRetryState.count > 1 ? "s" : ""}...
                    </Text>
                  </>
                ) : (
                  <>
                    <AlertTriangle size={12} color="#FFFFFF" />
                    <Text
                      className="text-white font-medium ml-1.5"
                      style={{ fontSize: 11 }}
                    >
                      {syncStatus.failed} failed to sync
                    </Text>
                  </>
                )}
              </View>
              {!autoRetryState.isRetrying && (
                <View className="flex-row items-center">
                  <RefreshCw size={11} color="#FFFFFF" />
                  <Text className="text-white ml-1" style={{ fontSize: 10 }}>
                    Retry
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          )}

          {rawIsOnline &&
            !hasFailedSyncs &&
            activeOrderHasPendingPaymentSync && (
              <View className="flex-row items-center justify-center bg-amber-600/70 px-2.5 py-1.5 rounded-md">
                <Clock size={12} color="#FFFFFF" />
                <Text
                  className="text-white font-medium ml-1.5"
                  style={{ fontSize: 11 }}
                >
                  Payment syncing...
                </Text>
              </View>
            )}
        </View>
      )}

      <BillItemsAndTotals
        orderNote={currentOrderNote}
        isNetworkDegraded={!rawIsOnline || !isOnline}
        onSaveOrderNote={handleSaveOrderNote}
      />
      <View
        className="mt-auto w-full overflow-hidden"
        style={{
          marginLeft: -3,
          marginRight: -3,
          backgroundColor: colors.panel,
          borderTopWidth: 1,
          borderLeftWidth: 1,
          borderRightWidth: 1,
          borderColor: colors.border,
          borderTopLeftRadius: 28,
          borderTopRightRadius: 28,
          shadowColor: "#000000",
          shadowOffset: { width: 0, height: -10 },
          shadowOpacity: 0.16,
          shadowRadius: 18,
          elevation: 2,
        }}
      >
        <Totals />

        {showPlaymentActions && (
          <View className="px-3 pt-1 pb-1">
            <View className="flex-row gap-2">
              <TouchableOpacity
                onPress={handleOpenMoreOptions}
                disabled={isMoreButtonDisabled}
                className="w-[34%] h-10 items-center justify-center rounded-xl flex-row gap-1.5 shrink-0"
                style={{
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  opacity: isMoreButtonDisabled ? 0.4 : 1,
                }}
              >
                <MoreHorizontal size={14} color={colors.label} />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: colors.heading,
                  }}
                >
                  More
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handlePayClick}
                disabled={isPayButtonDisabled}
                className="flex-1 h-10 rounded-xl flex-row items-center justify-center gap-1.5"
                style={{
                  backgroundColor: isPayButtonDisabled
                    ? colors.muted
                    : colors.teal,
                  opacity: isPayButtonDisabled ? 0.6 : 1,
                }}
              >
                {hasPendingSyncs || isProcessing ? (
                  <ActivityIndicator size={12} color="#FFFFFF" />
                ) : null}
                <CreditCard size={14} color={colors.onSolid} />
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "700",
                    color: isPayButtonDisabled ? colors.muted : colors.onSolid,
                  }}
                >
                  Pay
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
      <DiscountOverlay
        isVisible={isDiscountOverlayVisible}
        onClose={handleCloseDiscounts}
      />
      <ClaimOrderModal
        visible={isClaimModalOpen}
        sourceStationName={sourceStationName}
        isClaiming={isClaiming}
        onConfirm={handleConfirmClaim}
        onCancel={handleCancelClaim}
      />
      <Dialog
        open={isVoidConfirmOpen}
        onOpenChange={(open) => {
          setIsVoidConfirmOpen(open);
          if (!open) setClearCartDialogMode("clear");
        }}
      >
        <DialogContent
          className="w-[420px] rounded-2xl p-0 overflow-hidden"
          style={{
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        >
          <View
            className="px-5 pt-5 pb-4"
            style={{ backgroundColor: colors.panel }}
          >
            <DialogHeader>
              <DialogTitle
                style={{
                  fontSize: 20,
                  fontWeight: "700",
                  color: colors.heading,
                }}
              >
                {clearCartDialogMode === "voidNonDraft"
                  ? "Void Order Instead?"
                  : "Clear Cart"}
              </DialogTitle>
            </DialogHeader>
            <Text
              style={{
                color: colors.label,
                fontSize: 14,
                marginTop: 8,
                lineHeight: 20,
              }}
            >
              {clearCartDialogMode === "voidNonDraft"
                ? "The current order has non-draft items. Clear Cart can only remove draft items safely. Do you want to void the order instead?"
                : "Are you sure you want to clear this cart? This action cannot be undone."}
            </Text>
          </View>

          <DialogFooter className="flex-row px-5 pb-5 pt-1 gap-3">
            <TouchableOpacity
              onPress={() => setIsVoidConfirmOpen(false)}
              className="flex-1 h-11 rounded-xl items-center justify-center"
              style={{
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Text
                style={{
                  color: colors.heading,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleConfirmClearCart}
              className="flex-1 h-11 rounded-xl items-center justify-center"
              style={{ backgroundColor: colors.danger }}
            >
              <Text
                style={{
                  color: colors.onSolid,
                  fontSize: 14,
                  fontWeight: "700",
                }}
              >
                {clearCartDialogMode === "voidNonDraft"
                  ? "Void Order"
                  : "Clear Cart"}
              </Text>
            </TouchableOpacity>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </View>
  );
};

const BillSection = React.memo(BillSectionContent);
export default BillSection;
