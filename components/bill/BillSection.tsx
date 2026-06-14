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
import { getFloorPlanClient, useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { usePendingTableOverlay } from "@/stores/usePendingTableOverlay";
import { useReservationStore } from "@/stores/useReservationStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { SendToKitchenButton } from "@/components/bill/SendToKitchenButton";
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
    ChevronRight,
    Clock,
    CreditCard,
    Minus,
    MoreHorizontal,
    NotebookPen,
    Plus,
    RefreshCw,
    Trash2,
    Users,
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
// Subscribes to only the active order's item IDs. Item mutations keep this
// container stable while each BillSummaryRow subscribes to its own CartItem.
const EMPTY_CART_ITEMS: CartItem[] = [];
const EMPTY_CART_ITEM_IDS: string[] = [];

const BillItemsAndTotals = React.memo(
  function BillItemsAndTotals({
    orderNote,
    isNetworkDegraded,
    onSaveOrderNote,
  }: {
    orderNote?: string;
    isNetworkDegraded: boolean;
    onSaveOrderNote: (value: string) => void;
  }) {
    const activeOrderId = useOrderStore((s) => s.activeOrderId);
    const itemIds = useOrderStore(
      useShallow((s) => {
        const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
        return (order?.items ?? EMPTY_CART_ITEMS).map((item) => item.id);
      }),
    );
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
          orderId={activeOrderId}
          itemIds={itemIds.length > 0 ? itemIds : EMPTY_CART_ITEM_IDS}
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
  const refreshTableSessions = useFloorPlanStore((s) => s.refreshTableSessions);
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
  // Prevents overlapping session calls when user rapidly re-opens the panel
  // and picks a different table before the previous async op completes.
  const pendingTableSessionRef = useRef<{ cancelled: boolean } | null>(null);
  const [tableDrawerAnchor, setTableDrawerAnchor] = useState({
    left: 0,
    top: 0,
    height: 0,
  });
  const openTableSelector = useCallback(() => {
    setIsTableSelectorOpen(true);
  }, []);

  const closeTableSelector = useCallback(() => {
    setIsTableSelectorOpen(false);
  }, []);

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
      tables.find((table) => table.name === activeOrderServiceLocation) ??
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
        openTableSelector();
      });
      return;
    }

    openTableSelector();
  }, [
    activeFloorPlanId,
    activeOrder?.guest_count,
    displayedTable?.floor_plan_id,
    displayedTable?.section_id,
    floorPlans,
    openTableSelector,
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
    return (
      liveSessions[linkedTableId] ??
      Object.values(liveSessions).find((session) =>
        isSessionLinkedToOrder(session),
      ) ??
      useTableSessionStore
        .getState()
        .getSessionBySessionId(linkedTableId)?.session ??
      null
    );
  }, [isSessionLinkedToOrder, linkedTableId, liveSessions]);

  const linkedSessionTableId = useMemo(() => {
    if (!linkedTableSession) return linkedTableId;
    const sessionEntry = Object.entries(liveSessions).find(
      ([, session]) => session?.id === linkedTableSession.id,
    );
    return sessionEntry?.[0] ?? linkedTableId;
  }, [linkedTableId, linkedTableSession, liveSessions]);

  useEffect(() => {
    if (
      activeOrderType !== "dine_in" ||
      activeOrderPaidStatus !== "Paid" ||
      !linkedSessionTableId ||
      !linkedTableSession ||
      linkedTableSession.status === "paid" ||
      linkedTableSession.status === "cleaning"
    ) {
      return;
    }

    void useTableSessionStore
      .getState()
      .dispatchAction({
        type: "FULL_PAYMENT",
        tableId: linkedSessionTableId,
      })
      .then((result) => {
        if (!result.success) {
          console.warn(
            `[BillSection] Failed to mark table ${linkedSessionTableId} paid after payment: ${result.error}`,
          );
        }
      });
  }, [
    activeOrderPaidStatus,
    activeOrderType,
    linkedSessionTableId,
    linkedTableSession,
  ]);

  const ensureDineInOrderTableSession = useCallback(
    async (table: FloorPlanObject, token?: { cancelled: boolean }): Promise<boolean> => {
      if (token?.cancelled) return false;
      if (activeOrderType !== "dine_in" || !activeOrderId) {
        return true;
      }

      try {
        await refreshTableSessions();
      } catch (error) {
        console.error("[BillSection] Failed to refresh table sessions:", {
          error,
          targetTableId: table.id,
        });
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

      if (activeLinkedSourceEntries.length > 0) {
        if (!isOnline) {
          show({
            title: "Offline",
            message: "Table transfer requires connection.",
            type: "warning",
          });
          return false;
        }

        const [, sourceSession] = activeLinkedSourceEntries[0];
        try {
          console.log("[BillSection][TableSelect] Transfer table session", {
            activeOrderId,
            activeDbOrderId: activeOrder?.db_order_id ?? null,
            sessionId: sourceSession.id,
            targetTableId: table.id,
          });

          if (token?.cancelled) return false;

          await useTableSessionStore
            .getState()
            .transferSession(sourceSession.id, [table.id]);

          if (token?.cancelled) return false;

          assignOrderToTable(activeOrderId, table.id);
          show({
            title: "Table Transferred",
            message: `Order moved to ${table.name}.`,
            type: "success",
          });
          return true;
        } catch (error) {
          console.error("[BillSection] Failed to transfer table session:", {
            error,
            activeOrderId,
            activeDbOrderId: activeOrder?.db_order_id ?? null,
            sessionId: sourceSession.id,
            targetTableId: table.id,
          });
          show({
            title: "Transfer Failed",
            message:
              error instanceof Error
                ? error.message
                : typeof error === "object" &&
                    error !== null &&
                    "message" in error &&
                    typeof error.message === "string"
                  ? error.message
                  : "Could not move the order to that table.",
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

          if (token?.cancelled) return false;

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

          if (token?.cancelled) {
            // We seated a session but the user has already moved on — clear it.
            if (seatingResult?.sessionId) {
              void useTableSessionStore.getState().clearTableSession(table.id);
            }
            return false;
          }

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
      refreshTableSessions,
      selectedStation?.id,
      selectorPartySize,
      show,
    ],
  );

  const handleSelectTable = useCallback(
    (table: FloorPlanObject) => {
      const isCurrentlyAssigned =
        table.id === activeOrderServiceLocation ||
        table.name === activeOrderServiceLocation;
      const isEmpty = cart.length === 0;
      const canTryDineInTableTransfer = activeOrderType === "dine_in";

      // Switching tables is blocked once items have been sent to the kitchen
      if (
        !isCurrentlyAssigned &&
        hasNonDraftItems &&
        !canTryDineInTableTransfer
      ) {
        show({
          title: "Cannot Switch Table",
          message: "Items have already been sent to the kitchen. Void the order to move to a different table.",
          type: "error",
        });
        return;
      }

      // Same table + empty order → close the session and unlink the table
      if (isCurrentlyAssigned && isEmpty && linkedTableId) {
        closeTableSelector();
        void useTableSessionStore.getState().dispatchAction({
          type: "CLEAR_TABLE",
          tableId: linkedTableId,
          orderId: activeOrderId ?? undefined,
        });
        clearSelectedTable();
        return;
      }

      // Cancel any in-flight session op from a previous selection so it doesn't
      // create a stale session after we've already moved on to this table.
      if (pendingTableSessionRef.current) {
        pendingTableSessionRef.current.cancelled = true;
      }
      const token = { cancelled: false };
      pendingTableSessionRef.current = token;

      // Optimistically close and select immediately — no waiting.
      // Session wiring (network calls) runs in background.
      // On failure the toast already shows; revert the optimistic selection.
      const previousTable = useDineInStore.getState().selectedTable;
      setSelectedTable(table);
      closeTableSelector();
      ensureDineInOrderTableSession(table, token).then((ok) => {
        if (token.cancelled) return;
        pendingTableSessionRef.current = null;
        if (!ok) setSelectedTable(previousTable);
      });
    },
    [
      activeOrderId,
      activeOrderServiceLocation,
      activeOrderType,
      cart.length,
      clearSelectedTable,
      closeTableSelector,
      ensureDineInOrderTableSession,
      hasNonDraftItems,
      linkedTableId,
      setSelectedTable,
      show,
    ],
  );

  // When the order type is switched away from dine_in, unlink the table and
  // clear the session if one was started (but not yet paid/sent to kitchen).
  const prevOrderTypeRef = useRef(activeOrderType);
  useEffect(() => {
    const prev = prevOrderTypeRef.current;
    prevOrderTypeRef.current = activeOrderType;

    if (prev !== "dine_in" || activeOrderType === "dine_in") return;

    // Snapshot table/session before any state changes alter them.
    const ordStore = useOrderStore.getState();
    const snapOrderId = ordStore.activeOrderId;
    const snapOrder = snapOrderId ? ordStore.ordersById[snapOrderId] : null;
    const snapTableId =
      useDineInStore.getState().selectedTable?.id ??
      snapOrder?.service_location_id ??
      null;

    clearSelectedTable();

    if (snapOrder) {
      // Clear locally in ordersById.
      useOrderStore.getState().updateActiveOrderDetails({ service_location_id: null });

      // Clear in previousOrders store immediately so the order list updates
      // without waiting for a backend round-trip.
      const dbId = snapOrder.db_order_id;
      if (dbId) {
        usePreviousOrdersStore.setState((state) => {
          const updated = state.previousOrders.map((o) =>
            o.db_order_id === dbId
              ? { ...o, service_location_id: undefined, service_location_name: undefined }
              : o,
          );
          // Rebuild the lookup map inline (buildOrderLookupMap is not exported).
          const lookup: Record<string, typeof updated[number]> = {};
          for (const o of updated) {
            if (o.db_order_id) lookup[o.db_order_id] = o;
            if (o.orderId) lookup[o.orderId] = o;
          }
          return { previousOrders: updated, _orderLookup: lookup };
        });
      }

      // Clear on backend — updateActiveOrderDetails RPC doesn't include
      // table_number, so we need a direct update mirroring assignOrderToTable.
      if (dbId) {
        const supabase = getFloorPlanClient();
        if (supabase) {
          supabase
            .from("orders")
            .update({ table_number: null, order_type: activeOrderType ?? "takeout" })
            .eq("id", dbId)
            .then(({ error }) => {
              if (error) {
                console.error("[BillSection] Failed to unlink order from table:", error);
              }
            });
        }
      }
    }

    if (snapTableId) {
      const sessionStore = useTableSessionStore.getState();
      const session = sessionStore.getSession(snapTableId);
      if (session && session.status !== "available") {
        // Force-clear regardless of state machine position — bypass dispatchAction
        // since CLEAR_TABLE is only valid from paid/served/check_presented.
        // Directly mark backend session as available, then remove locally.
        sessionStore.dispatch(snapTableId, { type: "CLEAR" });
        const supabase = getFloorPlanClient();
        if (supabase) {
          const { FloorPlanService } = require(
            "@/services/floorPlanService",
          ) as typeof import("@/services/floorPlanService");
          const staffId =
            useEmployeeStore.getState().loggedInEmployee?.profileId;
          FloorPlanService.updateTableSessionStatus(supabase, {
            p_session_id: session.id,
            p_status: "available",
            p_staff_id: staffId,
          }).catch(() => {});
        }
        useFloorPlanStore.getState().loadFloorPlanStatus().catch(() => {});
      }
    }
  // Only re-run when order type actually changes — don't include linkedTableId
  // since clearing it would re-trigger the effect.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOrderType, clearSelectedTable]);

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
    clearSelectedTable();

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
      useOrderStore.setState((state) => {
        const draft = state.ordersById[reusableEmptyDraftId];
        if (!draft) return;
        // Reset any stale dine-in fields from a previous session.
        draft.order_type = "takeout";
        draft.service_location_id = null;
        draft.session_id = undefined;
        draft.local_session_id = undefined;
        if (selectedStore) {
          const refreshedNumbers = getRefreshedReusableDraftNumbers({
            draftId: reusableEmptyDraftId,
            ordersById,
            orderIds,
            locationId: selectedStore.id,
            stationNumber: selectedStation?.station_number ?? null,
          });
          if (refreshedNumbers) {
            draft.order_number = refreshedNumbers.orderNumber;
            draft.display_number = refreshedNumbers.displayNumber;
          }
        }
      });
      setActiveOrder(reusableEmptyDraftId);
      return;
    }

    const newOrder = startNewOrder();
    setActiveOrder(newOrder.id);
  }, [
    activeOrder?.id,
    clearSelectedTable,
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
            <SendToKitchenButton
              onPress={handleSendToKitchen}
              extraDisabled={
                newItemsCount === 0 || hasDraftItems || isReadOnly
              }
            />
            {activeOrderType === "dine_in" && linkedTableId ? (
              (() => {
                const sessionAlreadyClosed =
                  !linkedTableSession ||
                  linkedTableSession.status === "available" ||
                  linkedTableSession.status === "cleaning";
                const canClose =
                  activeOrderPaidStatus === "Paid" && !sessionAlreadyClosed;
                return (
                  <TouchableOpacity
                    onPress={handleCloseSession}
                    disabled={!canClose}
                    className="h-8 px-3 rounded-lg flex-row items-center justify-center"
                    style={{
                      backgroundColor: canClose ? colors.warning : colors.card,
                      borderWidth: canClose ? 0 : 1,
                      borderColor: colors.border,
                      opacity: canClose ? 1 : 0.5,
                    }}
                  >
                    <Text
                      style={{
                        color: canClose ? colors.onSolid : colors.label,
                        fontSize: 12,
                        fontWeight: "500",
                      }}
                    >
                      {sessionAlreadyClosed ? "Session Closed" : "Close Session"}
                    </Text>
                  </TouchableOpacity>
                );
              })()
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
          onOpenTableSelector={
            activeOrderType === "dine_in" && activeOrderPaidStatus !== "Paid"
              ? handleOpenTableSelector
              : undefined
          }
          onViewTable={
            displayedTable
              ? () => {
                  usePendingTableOverlay.getState().openTable(displayedTable.id)
                  router.push(`/tables` as any)
                }
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
        onRequestClose={closeTableSelector}
      >
        <View style={{ flex: 1 }}>
          {/* Scrim */}
          <TouchableOpacity
            activeOpacity={1}
            onPress={closeTableSelector}
            style={{ position: "absolute", inset: 0, backgroundColor: "rgba(0,0,0,0.55)" } as any}
          />

          {/* Panel */}
          <View
            style={{
              position: "absolute",
              top: tableDrawerAnchor.top > 0 ? tableDrawerAnchor.top : 0,
              left: tableDrawerAnchor.left > 0 ? tableDrawerAnchor.left : "38%",
              height: tableDrawerAnchor.height > 0 ? tableDrawerAnchor.height : "100%",
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
            {/* ── Header ── */}
            <View style={{ paddingHorizontal: 16, paddingTop: 14, paddingBottom: 10 }}>
              {/* Title row */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.heading, fontSize: 15, fontWeight: "700", letterSpacing: -0.3 }}>
                    Select Table
                  </Text>
                  {(() => {
                    const available = filteredTableOptions.filter(
                      (t) => (liveSessions[t.id]?.status ?? t.session?.status ?? "available") === "available"
                    ).length;
                    const occupied = filteredTableOptions.length - available;
                    return (
                      <Text style={{ color: colors.muted, fontSize: 11, marginTop: 2 }}>
                        {available} available{occupied > 0 ? ` · ${occupied} occupied` : ""}
                      </Text>
                    );
                  })()}
                </View>
                <TouchableOpacity
                  onPress={closeTableSelector}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={{
                    width: 28, height: 28, borderRadius: 14,
                    backgroundColor: colors.inset,
                    alignItems: "center", justifyContent: "center",
                  }}
                >
                  <X size={13} color={colors.muted} />
                </TouchableOpacity>
              </View>

              {/* Floor plan tabs */}
              {floorPlanOptions.length > 1 && (
                <View style={{ flexDirection: "row", backgroundColor: colors.inset, borderRadius: 10, padding: 3, marginBottom: 10 }}>
                  {floorPlanOptions.map((plan) => {
                    const isActive = (pendingFloorPlanId ?? activeFloorPlanId) === plan.id;
                    return (
                      <TouchableOpacity
                        key={plan.id}
                        onPress={() => { void handleSelectFloorPlan(plan.id); }}
                        style={{
                          flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: "center",
                          backgroundColor: isActive ? colors.teal : "transparent",
                        }}
                      >
                        <Text style={{ color: isActive ? colors.onSolid : colors.muted, fontSize: 12, fontWeight: isActive ? "700" : "500" }}>
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
                  style={{ marginHorizontal: -16, marginBottom: 10 }}
                  contentContainerStyle={{ paddingHorizontal: 16, gap: 6, flexDirection: "row" }}
                >
                  {[{ id: null, name: "All" }, ...sectionOptions.map((s: ServerSection) => ({ id: s.id, name: s.name }))].map((item) => {
                    const isActive = selectedSectionId === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id ?? "__all__"}
                        onPress={() => setSelectedSectionId(item.id)}
                        style={{
                          paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20,
                          backgroundColor: isActive ? colors.teal : colors.inset,
                          borderWidth: 1,
                          borderColor: isActive ? colors.teal : "transparent",
                        }}
                      >
                        <Text style={{ color: isActive ? colors.onSolid : colors.label, fontSize: 11, fontWeight: "600" }}>
                          {item.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Guests row */}
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <View>
                  <Text style={{ color: colors.label, fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }}>Party Size</Text>
                  <Text style={{ color: colors.heading, fontSize: 22, fontWeight: "700", letterSpacing: -0.5, lineHeight: 26 }}>
                    {selectorPartySize}{" "}
                    <Text style={{ fontSize: 13, fontWeight: "500", color: colors.muted, letterSpacing: 0 }}>
                      {selectorPartySize === 1 ? "guest" : "guests"}
                    </Text>
                  </Text>
                </View>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.inset, borderRadius: 8, padding: 3 }}>
                  <TouchableOpacity
                    onPress={() => setSelectorPartySize((p) => Math.max(1, p - 1))}
                    disabled={selectorPartySize <= 1}
                    style={{
                      width: 32, height: 32, borderRadius: 7, alignItems: "center", justifyContent: "center",
                      backgroundColor: selectorPartySize <= 1 ? "transparent" : colors.card,
                      opacity: selectorPartySize <= 1 ? 0.35 : 1,
                    }}
                  >
                    <Minus size={14} color={colors.heading} strokeWidth={2.5} />
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => setSelectorPartySize((p) => Math.min(99, p + 1))}
                    style={{ width: 32, height: 32, borderRadius: 7, alignItems: "center", justifyContent: "center", backgroundColor: colors.card }}
                  >
                    <Plus size={14} color={colors.heading} strokeWidth={2.5} />
                  </TouchableOpacity>
                </View>
              </View>
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: colors.border }} />

            {/* ── Table grid ── */}
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 10, paddingBottom: 32 }}
              showsVerticalScrollIndicator={false}
            >
              {filteredTableOptions.length === 0 ? (
                <View style={{ alignItems: "center", paddingTop: 56 }}>
                  <Text style={{ color: colors.heading, fontSize: 14, fontWeight: "600" }}>No tables found</Text>
                  <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4 }}>Try a different section</Text>
                </View>
              ) : (
                <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, justifyContent: "center" }}>
                  {[...filteredTableOptions]
                    .sort((a, b) => {
                      // Current/linked always first, then available, then occupied
                      const aAssigned = a.id === activeOrderServiceLocation || a.name === activeOrderServiceLocation;
                      const bAssigned = b.id === activeOrderServiceLocation || b.name === activeOrderServiceLocation;
                      if (aAssigned !== bAssigned) return aAssigned ? -1 : 1;
                      const aLinked = isSessionLinkedToOrder(liveSessions[a.id]);
                      const bLinked = isSessionLinkedToOrder(liveSessions[b.id]);
                      if (aLinked !== bLinked) return aLinked ? -1 : 1;
                      const aAvail = (liveSessions[a.id]?.status ?? a.session?.status ?? "available") === "available";
                      const bAvail = (liveSessions[b.id]?.status ?? b.session?.status ?? "available") === "available";
                      if (aAvail !== bAvail) return aAvail ? -1 : 1;
                      return a.name.localeCompare(b.name, undefined, { numeric: true });
                    })
                    .map((table) => {
                      const liveStatusKey = liveSessions[table.id]?.status ?? table.session?.status ?? "available";
                      const statusLabel = getTableStatusLabel(table);
                      const statusColor = TABLE_STATUS_COLORS[liveStatusKey] || colors.muted;
                      const isCurrentlyAssigned =
                        table.id === activeOrderServiceLocation ||
                        table.name === activeOrderServiceLocation;
                      const tableSession = liveSessions[table.id];
                      const isLinkedToThisOrder = isSessionLinkedToOrder(tableSession);
                      const isSelected = selectedTable?.id === table.id || (!selectedTable && isCurrentlyAssigned);
                      const isAvailable = liveStatusKey === "available";
                      const isOfflineTransferLocked =
                        activeOrderType === "dine_in" &&
                        !!linkedTableId &&
                        !isOnline &&
                        !isCurrentlyAssigned &&
                        isAvailable;
                      const isSelectable =
                        ((activeOrderType === "dine_in" && isAvailable) ||
                        isAvailable ||
                        isCurrentlyAssigned ||
                        isLinkedToThisOrder) &&
                        !isOfflineTransferLocked;
                      const cap = table.capacity;
                      return (
                        <TouchableOpacity
                          key={table.id}
                          onPress={() => {
                            if (isOfflineTransferLocked) {
                              show({
                                title: "Offline",
                                message:
                                  "Table transfer requires a live connection to validate availability.",
                                type: "warning",
                              });
                              return;
                            }
                            handleSelectTable(table);
                          }}
                          disabled={!isSelectable && !isOfflineTransferLocked}
                          activeOpacity={isSelectable ? 0.7 : 1}
                          style={{
                            width: "45%",
                            borderRadius: 12,
                            borderWidth: isSelected ? 2 : 1,
                            borderColor: isSelected ? colors.teal : isCurrentlyAssigned ? `${colors.teal}50` : colors.border,
                            backgroundColor: isSelected
                              ? `${colors.teal}18`
                              : isCurrentlyAssigned
                              ? `${colors.teal}08`
                              : colors.card,
                            opacity: isSelectable ? 1 : 0.35,
                            padding: 10,
                          }}
                        >
                          {/* Status dot */}
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                            <View
                              style={{
                                width: 8, height: 8, borderRadius: 4,
                                backgroundColor: isSelected ? colors.teal : statusColor,
                              }}
                            />
                            {isSelected && (
                              <View style={{ width: 16, height: 16, borderRadius: 8, backgroundColor: colors.teal, alignItems: "center", justifyContent: "center" }}>
                                <Check size={9} color={colors.onSolid} strokeWidth={3} />
                              </View>
                            )}
                          </View>
                          {/* Table name */}
                          <Text
                            style={{ color: isSelected ? colors.teal : colors.heading, fontSize: 16, fontWeight: "700", letterSpacing: -0.3 }}
                            numberOfLines={1}
                          >
                            {table.name}
                          </Text>
                          {/* Status + capacity */}
                          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 3 }}>
                            <Text
                              style={{ color: isSelected ? colors.teal : statusColor, fontSize: 9, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.4, flexShrink: 1 }}
                              numberOfLines={1}
                            >
                              {isCurrentlyAssigned && !isSelected ? "current" : statusLabel}
                            </Text>
                            {cap != null && cap > 0 && (
                              <View style={{ flexDirection: "row", alignItems: "center", gap: 2, marginLeft: 4 }}>
                                <Users size={8} color={colors.muted} />
                                <Text style={{ color: colors.muted, fontSize: 9, fontWeight: "600" }}>{cap}</Text>
                              </View>
                            )}
                          </View>
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
