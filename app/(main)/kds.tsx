import DeliveryPlatformBadge from "@/components/order/DeliveryPlatformBadge";
import PinInputModal from "@/components/timeclock/PinInputModal";
import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";
import { useToast } from "@/contexts/ToastContext";
import {
    getBucketedElapsed,
    getUrgencyLevel,
    useKDSTimer,
    type UrgencyThresholds,
} from "@/hooks/useKDSTimer";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getDeviceId } from "@/lib/deviceId";
import { shouldAutoBump, shouldAutoFire } from "@/lib/kdsAutomation";
import { replaceRoute } from "@/lib/rootNavigation";
import { colors, URGENCY_COLORS } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { clearStationData } from "@/services/cacheService";
import KDSSoundService, {
    DEFAULT_SOUND_CONFIG,
} from "@/services/kds/kdsSoundService";
import { refreshLocationConfig } from "@/services/locationConfigSync";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useKDSStore } from "@/stores/useKDSStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { KDSTicket, KDSTicketItem } from "@/types/kds";
import { useRouter } from "expo-router";
import {
    ArrowUpToLine,
    CheckSquare,
    Flame,
    RotateCcw,
    Settings,
    ShoppingBag,
    Square,
    Star,
    Truck,
    UtensilsCrossed,
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
    GestureResponderEvent,
    Pressable,
    Animated as RNAnimated,
    ScrollView,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

// ─── Status Tab Config ────────────────────────────────────────────
type StatusFilter = "pending" | "cooking" | "ready" | "done";
type OrderTypeFilter = "all" | "delivery" | "takeout" | "dine_in";

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: "pending", label: "Pending" },
  { key: "cooking", label: "Cooking" },
  { key: "ready", label: "Served" },
  { key: "done", label: "Done" },
];

const TYPE_TABS: { key: OrderTypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "delivery", label: "Delivery" },
  { key: "takeout", label: "To Go" },
  { key: "dine_in", label: "Dine-In" },
];

const MODIFIER_ADD_COLOR = "#0B5E56";

function dedupeTicketsForRender(tickets: KDSTicket[]): KDSTicket[] {
  if (tickets.length <= 1) return tickets;
  const seen = new Set<string>();
  const unique: KDSTicket[] = [];
  for (const ticket of tickets) {
    if (seen.has(ticket.ticket_id)) continue;
    seen.add(ticket.ticket_id);
    unique.push(ticket);
  }
  return unique;
}

// ─── Manager roles for bulk operations ──────────────────────────
const MANAGER_ROLES = ["merchant.manager", "merchant.admin", "merchant.owner"];

// ─── Memoized animation configs (avoid re-allocation per render) ─
const KDS_DOUBLE_TAP_MS = 420;
const KDS_AUTOMATION_CHECK_MS = 30_000;
const DONE_TICKETS_TIME_WINDOW_MS = 60 * 60 * 1000;

// ─── Pulsing Dot (for connection status) ─────────────────────────
const PulsingDot = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const opacity = useRef(new RNAnimated.Value(0.4)).current;

  useEffect(() => {
    const animation = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
        RNAnimated.timing(opacity, {
          toValue: 0.4,
          duration: 1000,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <RNAnimated.View
      style={{
        width: s(8),
        height: s(8),
        borderRadius: s(4),
        backgroundColor: colors.teal,
        opacity,
        marginLeft: s(8),
      }}
    />
  );
};

// ─── Skeleton ─────────────────────────────────────────────────────
const SkeletonBar = ({
  width,
  height,
  style,
}: {
  width: number | string;
  height: number;
  style?: any;
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const opacity = useRef(new RNAnimated.Value(0.3)).current;

  useEffect(() => {
    const animation = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        RNAnimated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, []);

  return (
    <RNAnimated.View
      style={[
        {
          width: typeof width === "number" ? s(width) : undefined,
          height: s(height),
          backgroundColor: colors.muted,
          borderRadius: s(4),
          opacity,
        },
        style,
      ]}
    />
  );
};

const KDSSkeletonCard = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  return (
    <View
      style={{
        margin: s(4),
        borderRadius: s(10),
        overflow: "hidden",
        backgroundColor: colors.skeleton,
        borderWidth: 2,
        borderColor: colors.border,
        height: s(180),
      }}
    >
      <View
        style={{
          backgroundColor: colors.skeletonHighlight,
          paddingHorizontal: s(10),
          paddingVertical: s(12),
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          flexDirection: "row",
          justifyContent: "space-between",
        }}
      >
        <View>
          <SkeletonBar width={80} height={18} style={{ marginBottom: s(6) }} />
          <SkeletonBar width={60} height={12} />
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <SkeletonBar width={40} height={14} style={{ marginBottom: s(6) }} />
          <SkeletonBar width={50} height={14} />
        </View>
      </View>
      <View style={{ padding: s(12), flex: 1 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: s(12),
          }}
        >
          <SkeletonBar
            width={24}
            height={24}
            style={{ marginRight: s(8), borderRadius: s(4) }}
          />
          <SkeletonBar width={120} height={16} />
        </View>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            marginBottom: s(12),
          }}
        >
          <SkeletonBar
            width={24}
            height={24}
            style={{ marginRight: s(8), borderRadius: s(4) }}
          />
          <SkeletonBar width={100} height={16} />
        </View>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <SkeletonBar
            width={24}
            height={24}
            style={{ marginRight: s(8), borderRadius: s(4) }}
          />
          <SkeletonBar width={140} height={16} />
        </View>
      </View>
    </View>
  );
};

// ─── Order Type Helpers ───────────────────────────────────────────
function getOrderTypeLabel(type: string | null): string {
  const t = (type || "").toLowerCase();
  if (t === "delivery") return "DELIVERY";
  if (t === "takeout" || t === "to_go" || t === "to go") return "TO GO";
  return "DINE IN";
}

function getOrderTypeIcon(type: string | null) {
  const t = (type || "").toLowerCase();
  if (t === "delivery")
    return <Truck size={11} color={colors.orderTypeDelivery} />;
  if (t === "takeout" || t === "to_go" || t === "to go")
    return <ShoppingBag size={11} color={colors.orderTypeToGo} />;
  return <UtensilsCrossed size={11} color={colors.orderTypeDineIn} />;
}

function getDisplayTableName(tableName: string | null | undefined): string {
  const value = (tableName || "").trim();
  if (!value) return "";

  const isUuid =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );

  return isUuid ? "" : value;
}

function matchesTypeFilter(
  ticket: KDSTicket,
  filter: OrderTypeFilter,
): boolean {
  if (filter === "all") return true;
  const t = (ticket.order_type || "").toLowerCase();
  if (filter === "delivery") return t === "delivery";
  if (filter === "takeout")
    return t === "takeout" || t === "to_go" || t === "to go";
  // dine_in
  return t === "dine_in" || t === "dine in" || t === "" || !ticket.order_type;
}

function getTicketItems(ticket: KDSTicket | null | undefined): KDSTicketItem[] {
  return Array.isArray(ticket?.items) ? ticket.items : [];
}

// ─── Allergen Detection ────────────────────────────────────────────
const ALLERGEN_KEYWORDS: Record<string, { label: string; color: string }> = {
  shellfish: { label: "SHELLFISH", color: colors.danger },
  dairy: { label: "DAIRY", color: colors.warning },
  nuts: { label: "NUTS", color: "#8B5CF6" },
  gluten: { label: "GLUTEN", color: colors.warning },
  soy: { label: "SOY", color: colors.success },
};

function detectAllergen(
  modifierName: string | null | undefined,
): { label: string; color: string } | null {
  if (!modifierName) return null;
  const lower = modifierName.toLowerCase();
  for (const [keyword, allergen] of Object.entries(ALLERGEN_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return allergen;
    }
  }
  return null;
}

// ─── Display Settings Interface ───────────────────────────────────
interface KDSTicketDisplaySettings {
  highlightNotes: boolean;
  showOrderNotes: boolean;
  itemNameLines: number; // 0 = unlimited
  modifierGroupName: "for_group_priced" | "always" | "never";
  exclusionsAtTop: boolean;
  alphabeticalSort: boolean;
  aggregateIdenticalItems: boolean;
  showServerName: boolean;
}

// ─── Ticket Timer (isolated re-render boundary) ─────────────────
interface KDSTicketTimerProps {
  startTimeEpoch: number;
  textColor: string;
  doneTimeEpoch?: number;
}

const KDSTicketTimer = React.memo<KDSTicketTimerProps>(
  ({ startTimeEpoch, textColor, doneTimeEpoch }) => {
    const uiScale = useUiScale();
    const s = (n: number) => Math.round(n * uiScale);
    // Skip live subscription when timer is frozen at doneTimeEpoch
    const nowEpochMs = useKDSStore((s) => (doneTimeEpoch ? 0 : s.nowEpochMs));
    const timeElapsed = getBucketedElapsed(
      startTimeEpoch,
      doneTimeEpoch,
      doneTimeEpoch ? doneTimeEpoch : nowEpochMs,
    );
    return (
      <Text
        style={{
          color: textColor,
          fontSize: s(18),
          fontWeight: "800",
        }}
      >
        {timeElapsed}
      </Text>
    );
  },
);

// ─── Ticket Card ──────────────────────────────────────────────────
interface KDSTicketCardProps {
  ticket: KDSTicket;
  // D6: a pre-bucketed urgency level (0-3) computed at the page level instead
  // of the raw per-second nowEpochMs. The visible MM:SS timer lives in the
  // isolated KDSTicketTimer leaf (subscribes to nowEpochMs itself), so the card
  // body's only time-dependent output is the header urgency color — which only
  // changes at minute thresholds. Bucketing collapses the per-second prop churn
  // to a 0-3 value so the memo comparator skips the card body render between
  // threshold crossings (~3 over a ticket's life vs ~60/min).
  urgencyLevel: number;
  onAdvance: (
    ticketId: string,
    itemIds: string[],
    newStatus: "preparing" | "ready" | "served",
  ) => void;
  onToggleSelect: (id: string) => void;
  onLongPress?: (
    ticketId: string,
    ticket: KDSTicket,
    event: GestureResponderEvent,
  ) => void;
  onItemPress?: (ticketId: string, itemId: string) => void;
  onAcknowledgeNotice?: (ticketId: string, itemId: string) => void;
  hideDoneItems: boolean;
  displaySettings: KDSTicketDisplaySettings;
  // Interaction mode. "double-tap" (default) bumps on double tap. "single-select"
  // makes a single tap select the ticket so its actions appear in the KDS header.
  tapMode: "double-tap" | "single-select";
  isFocused: boolean;
  onSelectTicket?: (ticketId: string) => void;
  onRush?: (ticketId: string) => void;
  onPrioritize?: (ticketId: string) => void;
}

const KDSTicketCard = React.memo<KDSTicketCardProps>(
  ({
    ticket,
    urgencyLevel,
    onAdvance,
    onToggleSelect,
    onLongPress,
    onItemPress,
    onAcknowledgeNotice,
    hideDoneItems,
    displaySettings,
    tapMode,
    isFocused,
    onSelectTicket,
    onRush,
    onPrioritize,
  }) => {
    const uiScale = useUiScale();
    const s = (n: number) => Math.round(n * uiScale);
    // D6 profile gate (TEMP — remove before merge): count card-body renders.
    // On a 50-card board, BEFORE the urgencyLevel bucketing this fires ~50x/sec
    // (raw nowEpochMs prop); AFTER it fires only on ticket data change + the ~3
    // urgency threshold crossings. Commit D6 only if this BEFORE number is a
    // measured cost (under React Compiler the body render may already be cheap).
    if (__DEV__) console.count("KDSTicketCard.render");
    const bulkMode = useKDSStore((s) => s.bulkMode);
    const isSelected = useKDSStore(
      useCallback(
        (s) => s.selectedTicketIds.has(ticket.ticket_id),
        [ticket.ticket_id],
      ),
    );
    const hasUrgencyColor = urgencyLevel > 0;

    const isRushPending = useKDSStore(
      useCallback((s) => s.isRushPending(ticket.ticket_id), [ticket.ticket_id]),
    );

    const ticketItems = getTicketItems(ticket);
    const unacknowledgedItems = ticketItems.filter(
      (i) => (i.is_voided || i.is_refunded) && !i.acknowledged,
    );
    const hasUnacknowledgedNotices = unacknowledgedItems.length > 0;
    const acknowledgmentMode = useLocationConfigStore(
      (s) => s.config.kds.acknowledgmentMode ?? "block-advance",
    );

    // Ack all unacknowledged items before advancing (ack-on-advance mode).
    const acknowledgeAllAndAdvance = useCallback(() => {
      if (!onAcknowledgeNotice) return;
      for (const item of unacknowledgedItems) {
        onAcknowledgeNotice(ticket.ticket_id, item.id);
      }
    }, [ticket.ticket_id, onAcknowledgeNotice, unacknowledgedItems]);

    // Shared advance logic — determines next status and calls onAdvance.
    const performAdvance = useCallback(() => {
      const refire = ticketItems.some((i) => i.recalled);
      const itemIds = ticketItems.map((i) => i.id);
      let newStatus: "preparing" | "ready" | "served" | undefined;
      if (refire) newStatus = "served";
      else if (ticket.status === "pending") newStatus = "preparing";
      else if (ticket.status === "cooking") newStatus = "ready";
      else if (ticket.status === "ready") newStatus = "served";
      if (!newStatus) return;
      onAdvance(ticket.ticket_id, itemIds, newStatus);
    }, [ticketItems, ticket.status, ticket.ticket_id, onAdvance]);

    // Double-tap detection
    const lastTapRef = useRef(0);
    const firstTapStatusRef = useRef<KDSTicket["status"] | null>(null);

    const handlePress = () => {
      if (bulkMode) {
        onToggleSelect(ticket.ticket_id);
        return;
      }

      // Single-select mode: a single tap selects the ticket so its actions
      // (Bump / Rush / Prioritize) appear in the KDS header. No double-tap advance.
      // While already focused, the card body is inert — the header's action
      // buttons handle taps, and tapping outside the card clears the selection.
      // (Without this, the root Pressable would re-fire and toggle focus off,
      // so a Rush/Unrush tap that grazed the card body couldn't be repeated.)
      if (tapMode === "single-select") {
        if (!isFocused) onSelectTicket?.(ticket.ticket_id);
        return;
      }

      // ── Unacknowledged notices handling ──────────────────────────
      if (hasUnacknowledgedNotices) {
        if (acknowledgmentMode === "ack-on-advance") {
          // Auto-acknowledge all, then proceed with the double-tap advance
          acknowledgeAllAndAdvance();
        } else {
          // block-advance: card is inert until notices are acknowledged manually
          return;
        }
      }

      const now = Date.now();
      const isDoubleTap = now - lastTapRef.current < KDS_DOUBLE_TAP_MS;

      if (!isDoubleTap) {
        lastTapRef.current = now;
        firstTapStatusRef.current = ticket.status;
        return;
      }

      lastTapRef.current = 0;
      const capturedStatus = firstTapStatusRef.current;
      firstTapStatusRef.current = null;

      // Re-check status in case acknowledgeAllAndAdvance mutated items.
      // If we already called acknowledgeAllAndAdvance above, this still
      // captures the correct status from before the ack, so the double-tap
      // transition is consistent.
      const currentItems = getTicketItems(
        useKDSStore.getState()._ticketsById[ticket.ticket_id] ?? ticket,
      );
      const refire = currentItems.some((i) => i.recalled);
      const itemIds = currentItems.map((i) => i.id);
      let newStatus: "preparing" | "ready" | "served" | undefined;
      if (refire) newStatus = "served";
      else if (capturedStatus === "pending") newStatus = "preparing";
      else if (capturedStatus === "cooking") newStatus = "ready";
      else if (capturedStatus === "ready") newStatus = "served";

      if (!newStatus) return;
      onAdvance(ticket.ticket_id, itemIds, newStatus);
    };

    const handleLongPress = (e: GestureResponderEvent) => {
      if (bulkMode) return;
      onLongPress?.(ticket.ticket_id, ticket, e);
    };

    // Bump one stage — shared by the focused-header "Bump" action.
    // In "ack-on-advance" mode: acknowledges all unacknowledged notices first,
    // then advances. In "block-advance" mode: blocked until acknowledged.
    const handleBumpOneStep = () => {
      if (hasUnacknowledgedNotices) {
        if (acknowledgmentMode === "ack-on-advance") {
          acknowledgeAllAndAdvance();
        } else {
          return;
        }
      }
      performAdvance();
    };

    // Determine border color based on state
    let borderColor = "#E5E7EB"; // default light gray
    if (bulkMode && isSelected) {
      borderColor = colors.info;
    } else if (isFocused) {
      borderColor = colors.info;
    }

    const isDineIn =
      ticket.order_type?.toLowerCase() === "dine_in" ||
      ticket.order_type?.toLowerCase() === "dine in" ||
      !ticket.order_type;
    const displayTableName = getDisplayTableName(ticket.table_name);
    const displayServerName =
      displaySettings.showServerName && ticket.server_name;
    const hasMetaInfo = Boolean(
      ticket.customer_name ||
      displayTableName ||
      ticket.course_number > 1 ||
      displayServerName,
    );

    const orderTypeLabel = getOrderTypeLabel(ticket.order_type);
    const hasRush = ticketItems.some((item) => item.rush);
    const hasRefire = ticketItems.some((item) => item.recalled);
    const orderNote = ticket.order_notes?.trim() ?? "";
    const headerUrgencyColor = hasUrgencyColor
      ? URGENCY_COLORS[urgencyLevel]
      : undefined;
    const headerBackgroundColor = headerUrgencyColor ?? "#F3F4F6";
    const headerBorderColor = headerUrgencyColor ?? "#E5E7EB";
    const headerPrimaryTextColor = hasUrgencyColor ? "#FFFFFF" : "#111827";
    const headerSecondaryTextColor = hasUrgencyColor ? "#FFFFFF" : "#374151";
    const headerDotColor = hasUrgencyColor
      ? "rgba(255,255,255,0.9)"
      : undefined;

    const shouldHideDoneItems = hideDoneItems && !onItemPress;

    // Memoize expensive item filtering/aggregation/sorting for large ticket volumes.
    type DisplayState = "active" | "voided" | "refunded" | "changed";
    type ExpandedItem = KDSTicketItem & { _displayState: DisplayState };

    const { doneItemCount, visibleItems } = useMemo(() => {
      // Done count excludes voided/refunded items — they're not "done", they're cancelled/returned
      const doneCount = ticketItems
        .filter(
          (i) => i.kitchen_status === "ready" && !i.is_voided && !i.is_refunded,
        )
        .reduce((sum, i) => sum + (i.quantity || 0), 0);

      // Hide done items setting — voided/refunded always stay visible as kitchen notifications
      let filtered: KDSTicketItem[] = shouldHideDoneItems
        ? ticketItems.filter(
            (i) => i.kitchen_status !== "ready" || i.is_voided || i.is_refunded,
          )
        : [...ticketItems];

      // Expand voided/refunded items into display rows with _displayState
      let processed: ExpandedItem[] = filtered.flatMap(
        (item): ExpandedItem[] => {
          if (item.is_voided) return [{ ...item, _displayState: "voided" }];
          if (!item.is_refunded || !item.refunded_quantity)
            return [{ ...item, _displayState: "active" }];
          if (item.refunded_quantity >= item.quantity) {
            return [{ ...item, _displayState: "refunded" }];
          }
          // Partial refund — split into refunded + changed rows
          return [
            {
              ...item,
              quantity: item.refunded_quantity,
              _displayState: "refunded",
            },
            {
              ...item,
              quantity: item.quantity - item.refunded_quantity,
              _displayState: "changed",
            },
          ];
        },
      );

      if (displaySettings.aggregateIdenticalItems) {
        const aggregated: ExpandedItem[] = [];
        const keyMap = new Map<string, number>();
        for (const item of processed) {
          const modKey = item.modifiers
            .map((m) => m.modifier_name)
            .sort()
            .join("|");
          const key = `${item.name}__${modKey}__${
            item.special_instructions ?? ""
          }__${item._displayState}`;
          const idx = keyMap.get(key);
          if (idx !== undefined) {
            const existing = aggregated[idx];
            aggregated[idx] = {
              ...existing,
              quantity: existing.quantity + item.quantity,
            };
          } else {
            keyMap.set(key, aggregated.length);
            aggregated.push({ ...item });
          }
        }
        processed = aggregated;
      }

      processed = [...processed].sort((a, b) => {
        if (displaySettings.alphabeticalSort) {
          const cmp = a.name.localeCompare(b.name);
          return cmp !== 0 ? cmp : a.id.localeCompare(b.id);
        }
        return a.id.localeCompare(b.id);
      });

      // Pre-sort modifiers and detect allergens per item — avoid repeating in render
      type ModWithMeta = {
        mod: KDSTicketItem["modifiers"][number];
        allergen: { label: string; color: string } | null;
      };
      type VisibleItem = {
        item: ExpandedItem;
        sortedModifiers: ModWithMeta[];
        representedItemIds: string[];
      };
      const withSortedMods = processed.map((item) => {
        const representedItemIds = displaySettings.aggregateIdenticalItems
          ? ticketItems
              .filter((orig) => {
                const itemModKey = item.modifiers
                  .map((m) => m.modifier_name)
                  .sort()
                  .join("|");
                const origModKey = orig.modifiers
                  .map((m) => m.modifier_name)
                  .sort()
                  .join("|");
                return (
                  orig.name === item.name &&
                  origModKey === itemModKey &&
                  (orig.special_instructions ?? "") ===
                    (item.special_instructions ?? "") &&
                  orig.kitchen_status === item.kitchen_status
                );
              })
              .map((orig) => orig.id)
          : [item.id];

        if (item.modifiers.length === 0)
          return {
            item,
            sortedModifiers: [] as ModWithMeta[],
            representedItemIds,
          } as VisibleItem;
        const sorted = displaySettings.exclusionsAtTop
          ? [...item.modifiers].sort((a, b) => {
              const aR =
                a.is_no ||
                a.modifier_group_name?.toLowerCase().includes("remove") ||
                a.modifier_name?.toLowerCase().startsWith("no ")
                  ? 0
                  : 1;
              const bR =
                b.is_no ||
                b.modifier_group_name?.toLowerCase().includes("remove") ||
                b.modifier_name?.toLowerCase().startsWith("no ")
                  ? 0
                  : 1;
              return aR - bR;
            })
          : item.modifiers;
        const sortedModifiers: ModWithMeta[] = sorted.map((mod) => ({
          mod,
          allergen: detectAllergen(mod.modifier_name),
        }));
        return { item, sortedModifiers, representedItemIds } as VisibleItem;
      });

      return { doneItemCount: doneCount, visibleItems: withSortedMods };
    }, [
      ticketItems,
      shouldHideDoneItems,
      displaySettings.aggregateIdenticalItems,
      displaySettings.alphabeticalSort,
      displaySettings.exclusionsAtTop,
    ]);

    const hasHiddenDoneItems = shouldHideDoneItems && doneItemCount > 0;

    return (
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={400}
      >
        <View
          style={{
            margin: 0,
            borderRadius: s(10),
            overflow: "hidden",
            backgroundColor: "#FFFFFF",
            borderTopWidth: 1,
            borderBottomWidth: 1,
            borderRightWidth: 1,
            borderLeftWidth: hasUnacknowledgedNotices || isDineIn ? s(4) : 1,
            borderTopColor: hasUnacknowledgedNotices ? "#FECACA" : borderColor,
            borderBottomColor: hasUnacknowledgedNotices
              ? "#FECACA"
              : borderColor,
            borderRightColor: hasUnacknowledgedNotices
              ? "#FECACA"
              : borderColor,
            borderLeftColor: hasUnacknowledgedNotices
              ? "#DC2626"
              : isDineIn
                ? colors.teal
                : borderColor,
            shadowColor: "#000",
            shadowOffset: { width: 0, height: s(2) },
            shadowOpacity: 0.08,
            shadowRadius: s(4),
            elevation: 2,
          }}
        >
          {/* Bulk mode checkbox overlay */}
          {bulkMode && (
            <View
              style={{
                position: "absolute",
                top: s(6),
                right: s(6),
                zIndex: 10,
              }}
            >
              {isSelected ? (
                <CheckSquare
                  size={s(20)}
                  color={colors.info}
                  fill={colors.info}
                />
              ) : (
                <Square size={s(20)} color={colors.label} />
              )}
            </View>
          )}

          {/* Card Header: Order Number + Order Type + Timer + Badges (darker background) */}
          <View
            style={{
              backgroundColor: headerBackgroundColor,
              paddingHorizontal: s(12),
              paddingVertical: s(10),
              borderBottomWidth: 1,
              borderBottomColor: headerBorderColor,
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: s(12),
            }}
          >
            {tapMode === "single-select" && isFocused ? (
              // Focused in single-select mode: header is replaced by quick actions.
              // Height matches the original two-row layout (order number + order type)
              // so the card doesn't jump when focusing/unfocusing.
              <View
                style={{
                  flex: 1,
                  height: s(44),
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(6),
                }}
              >
                <TouchableOpacity
                  onPress={handleBumpOneStep}
                  disabled={
                    acknowledgmentMode === "block-advance" &&
                    hasUnacknowledgedNotices
                  }
                  style={{
                    flex: 1,
                    height: s(32),
                    borderRadius: s(8),
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor:
                      hasUnacknowledgedNotices &&
                      acknowledgmentMode === "block-advance"
                        ? "#9CA3AF"
                        : colors.teal,
                    opacity:
                      hasUnacknowledgedNotices &&
                      acknowledgmentMode === "block-advance"
                        ? 0.5
                        : 1,
                  }}
                >
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: s(11),
                      fontWeight: "700",
                    }}
                  >
                    Bump
                  </Text>
                </TouchableOpacity>
                {(ticket.status === "pending" || ticket.status === "cooking") && (
                  <TouchableOpacity
                    onPress={() => onRush?.(ticket.ticket_id)}
                    disabled={isRushPending}
                    style={{
                      flex: 1,
                      height: s(32),
                      borderRadius: s(8),
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: isRushPending
                        ? colors.muted
                        : colors.warning,
                      opacity: isRushPending ? 0.6 : 1,
                    }}
                  >
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontSize: s(11),
                        fontWeight: "700",
                      }}
                    >
                      {isRushPending ? "..." : hasRush ? "Unrush" : "Rush"}
                    </Text>
                  </TouchableOpacity>
                )}
                {(ticket.status === "pending" || ticket.status === "cooking") && (
                  <TouchableOpacity
                    onPress={() => onPrioritize?.(ticket.ticket_id)}
                    style={{
                      flex: 1,
                      height: s(32),
                      borderRadius: s(8),
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: colors.info,
                    }}
                  >
                    <Text
                      style={{
                        color: "#FFFFFF",
                        fontSize: s(11),
                        fontWeight: "700",
                      }}
                    >
                      {ticket.prioritized ? "Unstar" : "Prioritize"}
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={() => onSelectTicket?.(ticket.ticket_id)}
                  style={{
                    width: s(32),
                    height: s(32),
                    borderRadius: s(8),
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.danger,
                  }}
                >
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: s(14),
                      fontWeight: "700",
                    }}
                  >
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={{ flex: 1, gap: s(4) }}>
                  {/* Order Number */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(6),
                    }}
                  >
                    <Text
                      style={{
                        color: headerPrimaryTextColor,
                        fontSize: s(16),
                        fontWeight: "700",
                      }}
                      numberOfLines={1}
                    >
                      {ticket.display_number ||
                        ticket.order_number?.slice(-4) ||
                        "----"}
                    </Text>
                    {(ticket.status === "pending" || ticket.status === "cooking") && ticket.prioritized && (
                      <Star
                        size={s(16)}
                        color={colors.warning}
                        fill={colors.warning}
                      />
                    )}
                    <DeliveryPlatformBadge
                      deliveryPlatform={ticket.delivery_platform}
                      orderSource={ticket.order_source}
                      size="kds"
                      uiScale={uiScale}
                      solidBackground={hasUrgencyColor}
                    />
                  </View>

                  {/* Order Type */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(4),
                    }}
                  >
                    {ticket.order_type?.toLowerCase() === "delivery" ? (
                      <View
                        style={{
                          width: s(6),
                          height: s(6),
                          borderRadius: s(3),
                          backgroundColor: headerDotColor ?? "#EF4444",
                        }}
                      />
                    ) : ticket.order_type?.toLowerCase() === "takeout" ||
                      ticket.order_type?.toLowerCase() === "to_go" ? (
                      <View
                        style={{
                          width: s(6),
                          height: s(6),
                          borderRadius: s(3),
                          backgroundColor: headerDotColor ?? "#3B82F6",
                        }}
                      />
                    ) : (
                      <View
                        style={{
                          width: s(6),
                          height: s(6),
                          borderRadius: s(3),
                          backgroundColor: headerDotColor ?? "#22C55E",
                        }}
                      />
                    )}
                    <Text
                      style={{
                        color: headerSecondaryTextColor,
                        fontSize: s(11),
                        fontWeight: "600",
                      }}
                    >
                      {orderTypeLabel}
                    </Text>
                  </View>
                </View>

                {/* Timer + Badges column (right side) */}
                <View style={{ alignItems: "flex-end", gap: s(4) }}>
                  <KDSTicketTimer
                    startTimeEpoch={ticket.start_time_epoch}
                    textColor={headerPrimaryTextColor}
                    doneTimeEpoch={
                      ticket.status === "ready"
                        ? ticket.ready_time_epoch
                        : undefined
                    }
                  />
                  {(ticket.status === "pending" || ticket.status === "cooking") && hasRush && (
                    <View
                      style={{
                        backgroundColor: "#FEF08A",
                        borderWidth: 1,
                        borderColor: colors.warning + "50",
                        paddingHorizontal: s(8),
                        paddingVertical: s(3),
                        borderRadius: s(12),
                        flexDirection: "row",
                        alignItems: "center",
                        gap: s(4),
                      }}
                    >
                      <Text
                        style={{
                          color: "#78350F",
                          fontSize: s(10),
                          fontWeight: "800",
                          letterSpacing: 0.5,
                        }}
                      >
                        RUSHED
                      </Text>
                    </View>
                  )}
                  {hasRefire && (
                    <View
                      style={{
                        backgroundColor: "#FEF3C7",
                        borderWidth: 1,
                        borderColor: "#F59E0B66",
                        paddingHorizontal: s(8),
                        paddingVertical: s(3),
                        borderRadius: s(12),
                      }}
                    >
                      <Text
                        style={{
                          color: "#92400E",
                          fontSize: s(10),
                          fontWeight: "800",
                          letterSpacing: 0.5,
                        }}
                      >
                        RECALLED
                      </Text>
                    </View>
                  )}
                </View>
              </>
            )}
          </View>

          {/* Row 3: Customer + Table + Course + Server (only shown when populated) */}
          {hasMetaInfo && (
            <View
              style={{
                backgroundColor: "#FFFFFF",
                paddingHorizontal: s(12),
                paddingVertical: s(5),
                borderBottomWidth: 1,
                borderBottomColor: "#E5E7EB",
              }}
            >
              <Text
                style={{ color: "#6B7280", fontSize: s(11), fontWeight: "500" }}
                numberOfLines={1}
              >
                {ticket.customer_name ? ticket.customer_name : ""}
                {ticket.customer_name && displayTableName ? " · " : ""}
                {displayTableName ? `Table ${displayTableName}` : ""}
                {(ticket.customer_name || displayTableName) && displayServerName
                  ? " · "
                  : ""}
                {displayServerName ? `Server: ${ticket.server_name}` : ""}
                {(ticket.customer_name ||
                  displayTableName ||
                  displayServerName) &&
                ticket.course_number > 1
                  ? ` · Course ${ticket.course_number}`
                  : ticket.course_number > 1
                    ? `Course ${ticket.course_number}`
                    : ""}
              </Text>
            </View>
          )}

          {displaySettings.showOrderNotes && orderNote.length > 0 && (
            <View
              style={{
                paddingHorizontal: s(12),
                paddingVertical: s(8),
                backgroundColor: displaySettings.highlightNotes
                  ? colors.warning + "14"
                  : "#F9FAFB",
                borderBottomWidth: 1,
                borderBottomColor: "#E5E7EB",
              }}
            >
              <Text
                style={{
                  color: displaySettings.highlightNotes ? "#92400E" : "#6B7280",
                  fontSize: s(10),
                  fontWeight: "800",
                  letterSpacing: 0.6,
                  marginBottom: s(2),
                }}
              >
                ORDER NOTE
              </Text>
              <Text
                style={{
                  color: "#111827",
                  fontSize: s(11),
                  lineHeight: s(16),
                  fontWeight: "600",
                }}
                numberOfLines={3}
              >
                {orderNote}
              </Text>
            </View>
          )}

          {/* Items list */}
          <View style={{ padding: s(10), backgroundColor: "#FFFFFF" }}>
            {visibleItems.map(
              ({ item, sortedModifiers, representedItemIds }, index) => {
                const rowKey = `${item.id}_${item._displayState}_${index}`;
                const isItemDone =
                  item.kitchen_status === "ready" &&
                  item._displayState === "active";
                const isVoided = item._displayState === "voided";
                const isRefunded = item._displayState === "refunded";
                const isChanged = item._displayState === "changed";
                const isInactive = isVoided || isRefunded;
                const isAcknowledged = isInactive && Boolean(item.acknowledged);
                const needsAck = isInactive && !isAcknowledged;
                const shouldStrike = isItemDone || isAcknowledged;
                const itemOpacity = isAcknowledged
                  ? 0.25
                  : isItemDone
                    ? 0.5
                    : 1;

                // Quantity badge color — unacknowledged notices stay vivid
                const qtyBg = isVoided
                  ? "#FCA5A5"
                  : isRefunded
                    ? "#FDBA74"
                    : isChanged
                      ? "#FDE68A"
                      : isItemDone
                        ? colors.success
                        : "#E5E7EB";
                const qtyColor = isItemDone
                  ? "#fff"
                  : isVoided
                    ? "#7F1D1D"
                    : isRefunded
                      ? "#7C2D12"
                      : "#111827";

                return (
                  <Pressable
                    key={rowKey}
                    onPress={() => {
                      if (
                        isInactive &&
                        !item.acknowledged &&
                        onAcknowledgeNotice
                      ) {
                        onAcknowledgeNotice(ticket.ticket_id, item.id);
                        return;
                      }
                      if (
                        !hasRefire &&
                        !isInactive &&
                        !isItemDone &&
                        !hasUnacknowledgedNotices &&
                        onItemPress
                      ) {
                        const idsToMark =
                          representedItemIds.length > 0
                            ? representedItemIds
                            : [item.id];
                        for (const id of idsToMark) {
                          onItemPress(ticket.ticket_id, id);
                        }
                      }
                    }}
                    style={
                      index < visibleItems.length - 1
                        ? { marginBottom: s(6) }
                        : undefined
                    }
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "flex-start",
                        opacity: itemOpacity,
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: qtyBg,
                          width: s(22),
                          height: s(22),
                          borderRadius: s(4),
                          alignItems: "center",
                          justifyContent: "center",
                          marginRight: s(8),
                          minWidth: s(22),
                        }}
                      >
                        <Text
                          style={{
                            color: qtyColor,
                            fontSize: s(12),
                            fontWeight: "700",
                          }}
                        >
                          {item.quantity}
                        </Text>
                      </View>
                      {/* Status badge pill for voided/refunded/changed */}
                      {isVoided && (
                        <View
                          style={{
                            backgroundColor: needsAck ? "#FEE2E2" : "#FEE2E2",
                            paddingHorizontal: s(5),
                            paddingVertical: s(1),
                            borderRadius: s(3),
                            marginRight: s(5),
                            alignSelf: "center",
                            flexDirection: "row",
                            alignItems: "center",
                            gap: s(3),
                          }}
                        >
                          <Text
                            style={{
                              color: "#DC2626",
                              fontSize: s(8),
                              fontWeight: "800",
                            }}
                          >
                            VOIDED
                          </Text>
                          {needsAck && (
                            <Text
                              style={{
                                color: "#DC2626",
                                fontSize: s(8),
                                fontWeight: "600",
                              }}
                            >
                              · TAP ✓
                            </Text>
                          )}
                        </View>
                      )}
                      {isRefunded && (
                        <View
                          style={{
                            backgroundColor: "#FEF3C7",
                            paddingHorizontal: s(5),
                            paddingVertical: s(1),
                            borderRadius: s(3),
                            marginRight: s(5),
                            alignSelf: "center",
                            flexDirection: "row",
                            alignItems: "center",
                            gap: s(3),
                          }}
                        >
                          <Text
                            style={{
                              color: "#D97706",
                              fontSize: s(8),
                              fontWeight: "800",
                            }}
                          >
                            REFUNDED
                          </Text>
                          {needsAck && (
                            <Text
                              style={{
                                color: "#D97706",
                                fontSize: s(8),
                                fontWeight: "600",
                              }}
                            >
                              · TAP ✓
                            </Text>
                          )}
                        </View>
                      )}
                      {isChanged && (
                        <View
                          style={{
                            backgroundColor: "#FEF9C3",
                            paddingHorizontal: s(5),
                            paddingVertical: s(1),
                            borderRadius: s(3),
                            marginRight: s(5),
                            alignSelf: "center",
                          }}
                        >
                          <Text
                            style={{
                              color: "#92400E",
                              fontSize: s(8),
                              fontWeight: "800",
                            }}
                          >
                            CHANGED
                          </Text>
                        </View>
                      )}
                      {item.seat_number != null && (
                        <Text
                          style={{
                            color: "#0D9488",
                            fontSize: s(11),
                            fontWeight: "700",
                            marginRight: s(6),
                          }}
                        >
                          [S{item.seat_number}]
                        </Text>
                      )}
                      {item.is_to_go && (
                        <View
                          style={{
                            backgroundColor: "#CCFBF1",
                            paddingHorizontal: s(5),
                            paddingVertical: s(1),
                            borderRadius: s(3),
                            marginRight: s(5),
                            alignSelf: "center",
                          }}
                        >
                          <Text
                            style={{
                              color: "#0D9488",
                              fontSize: s(8),
                              fontWeight: "800",
                            }}
                          >
                            TO GO
                          </Text>
                        </View>
                      )}
                      <Text
                        style={{
                          color: isInactive
                            ? "#9CA3AF"
                            : isItemDone
                              ? "#9CA3AF"
                              : "#111827",
                          fontSize: s(13),
                          fontWeight: "600",
                          flex: 1,
                          textDecorationLine: shouldStrike
                            ? "line-through"
                            : "none",
                        }}
                        numberOfLines={
                          displaySettings.itemNameLines || undefined
                        }
                      >
                        {item.name}
                      </Text>
                    </View>
                    {/* Modifiers */}
                    {sortedModifiers.length > 0 &&
                      sortedModifiers.map(({ mod, allergen }, mi) => {
                        const isRemoval =
                          mod.is_no ||
                          mod.modifier_group_name
                            ?.toLowerCase()
                            .includes("remove") ||
                          mod.modifier_name?.toLowerCase().startsWith("no ");
                        // Modifier group name prefix with ✕ or +
                        let prefix = isRemoval ? "✕ " : "+ ";
                        if (
                          displaySettings.modifierGroupName === "always" &&
                          mod.modifier_group_name
                        ) {
                          prefix = `${prefix}${mod.modifier_group_name}: `;
                        } else if (
                          displaySettings.modifierGroupName ===
                            "for_group_priced" &&
                          mod.modifier_group_name &&
                          mod.price_modifier !== 0
                        ) {
                          prefix = `${prefix}${mod.modifier_group_name}: `;
                        }
                        return (
                          <View
                            key={`${rowKey}_m${mi}`}
                            style={{
                              marginTop: s(2),
                              flexDirection: "row",
                              alignItems: "flex-start",
                              gap: s(6),
                            }}
                          >
                            <Text
                              style={{
                                color: isRemoval
                                  ? colors.danger
                                  : MODIFIER_ADD_COLOR,
                                fontSize: s(12),
                                fontWeight: "600",
                                lineHeight: s(16),
                                marginLeft: s(30),
                                opacity: shouldStrike ? 0.4 : 1,
                                textDecorationLine: shouldStrike
                                  ? "line-through"
                                  : "none",
                                flex: 1,
                              }}
                            >
                              {prefix}
                              {mod.modifier_name}
                            </Text>
                            {allergen && (
                              <View
                                style={{
                                  backgroundColor: allergen.color + "20",
                                  paddingHorizontal: s(6),
                                  paddingVertical: s(2),
                                  borderRadius: s(4),
                                  borderWidth: 1,
                                  borderColor: allergen.color,
                                }}
                              >
                                <Text
                                  style={{
                                    color: allergen.color,
                                    fontSize: s(8),
                                    fontWeight: "700",
                                  }}
                                >
                                  {allergen.label}
                                </Text>
                              </View>
                            )}
                          </View>
                        );
                      })}
                    {/* Special instructions */}
                    {item.special_instructions && (
                      <Text
                        style={{
                          color: displaySettings.highlightNotes
                            ? colors.heading
                            : colors.muted,
                          fontSize: s(10),
                          fontStyle: "italic",
                          fontWeight: displaySettings.highlightNotes
                            ? "700"
                            : "400",
                          marginLeft: s(30),
                          marginTop: s(3),
                          opacity: shouldStrike ? 0.4 : 1,
                          textDecorationLine: shouldStrike
                            ? "line-through"
                            : "none",
                        }}
                        numberOfLines={2}
                      >
                        "{item.special_instructions}"
                      </Text>
                    )}
                  </Pressable>
                );
              },
            )}
            {/* Hidden done items indicator */}
            {hasHiddenDoneItems && (
              <Text
                style={{
                  color: "#9CA3AF",
                  fontSize: s(11),
                  marginTop: s(6),
                  textAlign: "center",
                }}
              >
                {doneItemCount} done
              </Text>
            )}
          </View>

          {/* Acknowledge required banner — only shown in block-advance mode */}
          {hasUnacknowledgedNotices &&
            acknowledgmentMode === "block-advance" && (
              <View
                style={{
                  backgroundColor: "#FEF2F2",
                  borderTopWidth: 1,
                  borderTopColor: "#FECACA",
                  paddingHorizontal: s(10),
                  paddingVertical: s(5),
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(5),
                }}
              >
                <Text
                  style={{
                    fontSize: s(9),
                    color: "#DC2626",
                    fontWeight: "700",
                    letterSpacing: 0.4,
                  }}
                >
                  ACK REQUIRED — tap voided/refunded items before advancing
                </Text>
              </View>
            )}

          {/* Auto-acknowledge hint banner — shown in ack-on-advance mode */}
          {hasUnacknowledgedNotices &&
            acknowledgmentMode === "ack-on-advance" && (
              <View
                style={{
                  backgroundColor: "#FFFBEB",
                  borderTopWidth: 1,
                  borderTopColor: "#FDE68A",
                  paddingHorizontal: s(10),
                  paddingVertical: s(5),
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(5),
                }}
              >
                <Text
                  style={{
                    fontSize: s(9),
                    color: "#92400E",
                    fontWeight: "700",
                    letterSpacing: 0.4,
                  }}
                >
                  Void/refund items will be auto-acknowledged on bump
                </Text>
              </View>
            )}

          {/* Progress bar at bottom */}
          <View
            style={{
              height: s(4),
              backgroundColor: "#E5E7EB",
              overflow: "hidden",
            }}
          >
            <View
              style={{
                height: "100%",
                backgroundColor: colors.teal,
                width: `${(doneItemCount / ticket.item_count) * 100}%`,
              }}
            />
          </View>
        </View>
      </Pressable>
    );
  },
  (prev, next) => {
    // Skip re-render if callbacks and config are unchanged
    if (
      prev.urgencyLevel !== next.urgencyLevel ||
      prev.onAdvance !== next.onAdvance ||
      prev.onToggleSelect !== next.onToggleSelect ||
      prev.onLongPress !== next.onLongPress ||
      prev.onItemPress !== next.onItemPress ||
      prev.onAcknowledgeNotice !== next.onAcknowledgeNotice ||
      prev.hideDoneItems !== next.hideDoneItems ||
      prev.displaySettings !== next.displaySettings ||
      prev.tapMode !== next.tapMode ||
      prev.isFocused !== next.isFocused ||
      prev.onSelectTicket !== next.onSelectTicket ||
      prev.onRush !== next.onRush ||
      prev.onPrioritize !== next.onPrioritize
    )
      return false;

    // Same reference — nothing changed
    if (prev.ticket === next.ticket) return true;

    // Ticket reference changed — check if anything the card displays actually changed
    const pt = prev.ticket,
      nt = next.ticket;
    if (
      pt.status !== nt.status ||
      pt.prioritized !== nt.prioritized ||
      pt.item_count !== nt.item_count ||
      pt.display_number !== nt.display_number ||
      pt.order_number !== nt.order_number ||
      pt.table_name !== nt.table_name ||
      pt.customer_name !== nt.customer_name ||
      pt.order_notes !== nt.order_notes ||
      pt.order_type !== nt.order_type ||
      pt.start_time_epoch !== nt.start_time_epoch ||
      // Re-render when the frozen "Served" time lands/changes (optimistic
      // Date.now() → server completed_at) so the timer snaps to the shared value.
      pt.ready_time_epoch !== nt.ready_time_epoch ||
      pt.items.length !== nt.items.length
    )
      return false;

    for (let i = 0; i < pt.items.length; i++) {
      const pi = pt.items[i],
        ni = nt.items[i];
      if (
        pi.id !== ni.id ||
        pi.kitchen_status !== ni.kitchen_status ||
        pi.quantity !== ni.quantity ||
        pi.rush !== ni.rush ||
        Boolean(pi.is_to_go) !== Boolean(ni.is_to_go) ||
        pi.recalled !== ni.recalled ||
        Boolean(pi.acknowledged) !== Boolean(ni.acknowledged)
      )
        return false;
    }

    return true;
  },
);

// ─── Done Ticket Card (gray, muted, tap to recall) ───────────────
interface KDSDoneTicketCardProps {
  ticket: KDSTicket;
  onRecall: (ticketId: string) => void;
  isFocused: boolean;
  onSelectTicket?: (ticketId: string) => void;
  showServerName?: boolean;
}

const KDSDoneTicketCard = React.memo<KDSDoneTicketCardProps>(
  ({ ticket, onRecall, isFocused, onSelectTicket, showServerName }) => {
    const uiScale = useUiScale();
    const s = (n: number) => Math.round(n * uiScale);
    const timeElapsed = useMemo(
      () => getBucketedElapsed(ticket.start_time_epoch, ticket.done_time_epoch),
      [ticket.start_time_epoch, ticket.done_time_epoch],
    );

    const orderTypeLabel = getOrderTypeLabel(ticket.order_type);
    const orderTypeIcon = getOrderTypeIcon(ticket.order_type);
    const displayTableName = getDisplayTableName(ticket.table_name);
    const displayServerName = showServerName && ticket.server_name;
    const hasMetaInfo = Boolean(
      ticket.customer_name ||
      displayTableName ||
      ticket.course_number > 1 ||
      displayServerName,
    );

    const handlePress = () => {
      // Single tap selects the ticket so a Recall button appears in the header
      if (isFocused) {
        // Already focused — tap again to dismiss
        return;
      }
      onSelectTicket?.(ticket.ticket_id);
    };

    return (
      <Pressable onPress={handlePress}>
        <View
          style={{
            margin: 0,
            borderRadius: s(10),
            overflow: "hidden",
            backgroundColor: "#FFFFFF",
            borderWidth: 1,
            borderColor: "#E5E7EB",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: s(1) },
            shadowOpacity: 0.05,
            shadowRadius: s(2),
            elevation: 1,
          }}
        >
          {/* Card Header: Order Number + Order Type + Time */}
          <View
            style={{
              backgroundColor: isFocused ? colors.teal + "15" : "#F3F4F6",
              paddingHorizontal: s(12),
              paddingVertical: s(10),
              borderBottomWidth: 1,
              borderBottomColor: isFocused ? colors.teal + "40" : "#D1D5DB",
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "flex-start",
              gap: s(12),
            }}
          >
            {isFocused ? (
              // Focused: show X button + prominent Recall button.
              <View
                style={{
                  flex: 1,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(6),
                }}
              >
                <TouchableOpacity
                  onPress={() => onRecall(ticket.ticket_id)}
                  style={{
                    flex: 1,
                    height: s(44),
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "center",
                    borderRadius: s(8),
                    backgroundColor: colors.teal,
                    gap: s(6),
                  }}
                >
                  <RotateCcw size={s(16)} color="#FFFFFF" />
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: s(13),
                      fontWeight: "700",
                    }}
                  >
                    Recall
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => onSelectTicket?.(ticket.ticket_id)}
                  style={{
                    width: s(44),
                    height: s(44),
                    borderRadius: s(8),
                    alignItems: "center",
                    justifyContent: "center",
                    backgroundColor: colors.danger,
                  }}
                >
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: s(18),
                      fontWeight: "700",
                    }}
                  >
                    ✕
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={{ flex: 1, gap: s(4) }}>
                  {/* Order Number */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(6),
                    }}
                  >
                    <Text
                      style={{
                        color: "#6B7280",
                        fontSize: s(16),
                        fontWeight: "700",
                      }}
                      numberOfLines={1}
                    >
                      #
                      {ticket.display_number ||
                        ticket.order_number?.slice(-4) ||
                        "----"}
                    </Text>
                    <DeliveryPlatformBadge
                      deliveryPlatform={ticket.delivery_platform}
                      orderSource={ticket.order_source}
                      size="kds"
                      uiScale={uiScale}
                    />
                  </View>

                  {/* Order Type */}
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(4),
                    }}
                  >
                    <View
                      style={{
                        width: s(6),
                        height: s(6),
                        borderRadius: s(3),
                        backgroundColor: "#D1D5DB",
                      }}
                    />
                    <Text
                      style={{
                        color: "#9CA3AF",
                        fontSize: s(11),
                        fontWeight: "600",
                      }}
                    >
                      {orderTypeLabel}
                    </Text>
                  </View>
                </View>

                {/* Timer */}
                <Text
                  style={{
                    color: "#9CA3AF",
                    fontSize: s(16),
                    fontWeight: "800",
                  }}
                >
                  {timeElapsed}
                </Text>
              </>
            )}
          </View>

          {/* Customer + Table + Course + Server Info (only shown when populated) */}
          {hasMetaInfo && (
            <View
              style={{
                paddingHorizontal: s(12),
                paddingVertical: s(5),
                borderBottomWidth: 1,
                borderBottomColor: "#D1D5DB",
              }}
            >
              <Text
                style={{ color: "#6B7280", fontSize: s(11), fontWeight: "500" }}
                numberOfLines={1}
              >
                {ticket.customer_name ? ticket.customer_name : ""}
                {ticket.customer_name && displayTableName ? " · " : ""}
                {displayTableName ? `Table ${displayTableName}` : ""}
                {(ticket.customer_name || displayTableName) && displayServerName
                  ? " · "
                  : ""}
                {displayServerName ? `Server: ${ticket.server_name}` : ""}
                {(ticket.customer_name ||
                  displayTableName ||
                  displayServerName) &&
                ticket.course_number > 1
                  ? ` · Course ${ticket.course_number}`
                  : ticket.course_number > 1
                    ? `Course ${ticket.course_number}`
                    : ""}
              </Text>
            </View>
          )}

          {/* Items list */}
          <View style={{ padding: s(12), gap: s(6) }}>
            {getTicketItems(ticket).map((item: KDSTicketItem, index) => (
              <View
                key={`${item.id}_${index}`}
                style={{
                  flexDirection: "column",
                  alignItems: "flex-start",
                  gap: s(2),
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "flex-start",
                    gap: s(6),
                    width: "100%",
                  }}
                >
                  <View
                    style={{
                      backgroundColor: "#E5E7EB",
                      width: s(22),
                      height: s(22),
                      borderRadius: s(4),
                      alignItems: "center",
                      justifyContent: "center",
                      minWidth: s(22),
                    }}
                  >
                    <Text
                      style={{
                        color: "#9CA3AF",
                        fontSize: s(12),
                        fontWeight: "700",
                      }}
                    >
                      {item.quantity}
                    </Text>
                  </View>
                  <Text
                    style={{
                      color: "#9CA3AF",
                      fontSize: s(13),
                      fontWeight: "500",
                      flex: 1,
                    }}
                    numberOfLines={2}
                  >
                    {item.name}
                  </Text>
                </View>
                {/* Special instructions */}
                {item.special_instructions && (
                  <Text
                    style={{
                      color: colors.heading,
                      fontSize: s(11),
                      fontStyle: "italic",
                      marginLeft: s(28),
                      fontWeight: "700",
                    }}
                    numberOfLines={2}
                  >
                    "{item.special_instructions}"
                  </Text>
                )}
              </View>
            ))}
          </View>
        </View>
      </Pressable>
    );
  },
  (prev, next) =>
    prev.ticket === next.ticket &&
    prev.onRecall === next.onRecall &&
    prev.isFocused === next.isFocused &&
    prev.onSelectTicket === next.onSelectTicket &&
    prev.showServerName === next.showServerName,
);

// ─── Main Screen ──────────────────────────────────────────────────
const KitchenDisplayScreen = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const router = useRouter();
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const locationId = selectedStore?.id;
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const stationSessionId = useStoreSettingsStore((s) => s.stationSessionId);
  const clearStationSession = useStoreSettingsStore(
    (s) => s.clearStationSession,
  );
  const kdsConfig = useLocationConfigStore((s) => s.config.kds);
  const kdsAutoFireEnabled = kdsConfig.autoFireEnabled;
  const kdsAutoFireDelayMinutes = kdsConfig.autoFireDelayMinutes;
  const kdsHideDoneItems = kdsConfig.hideDoneItems;
  const kdsServedOrderSort = kdsConfig.servedOrderSort ?? "newest-first";
  const kdsTicketTapMode = kdsConfig.ticketTapMode ?? "double-tap";

  const countPending = useKDSStore((s) => s.counts.pending);
  const countCooking = useKDSStore((s) => s.counts.cooking);
  const countReady = useKDSStore((s) => s.counts.ready);
  const isInitialLoading = useKDSStore((s) => s.isInitialLoading);
  const hasHydrated = useKDSStore((s) => s._hasHydrated);
  const isFetching = useKDSStore((s) => s.isFetching);
  const fetchTickets = useKDSStore((s) => s.fetchTickets);
  const backgroundFetchTickets = useKDSStore((s) => s._backgroundFetchTickets);
  const advanceTicketStatus = useKDSStore((s) => s.advanceTicketStatus);
  const fetchKDSDisplay = useKDSStore((s) => s.fetchKDSDisplay);
  const kdsDisplayConfig = useKDSStore((s) => s.kdsDisplayConfig);
  const enrichedRules = useKDSStore((s) => s.enrichedRules);
  const routingMode = useKDSStore((s) => s.routingMode);
  const displayName = useKDSStore((s) => s.kdsDisplayConfig?.displayName);
  // Bulk mode state from store
  const bulkMode = useKDSStore((s) => s.bulkMode);
  const selectionCount = useKDSStore((s) => s.selectedTicketIds.size);
  const toggleBulkMode = useKDSStore((s) => s.toggleBulkMode);
  const toggleTicketSelection = useKDSStore((s) => s.toggleTicketSelection);
  const selectAllVisible = useKDSStore((s) => s.selectAllVisible);
  const clearSelection = useKDSStore((s) => s.clearSelection);
  const bulkAdvanceTickets = useKDSStore((s) => s.bulkAdvanceTickets);
  const bulkMarkTicketsDone = useKDSStore((s) => s.bulkMarkTicketsDone);
  const setOnNewOrderCallback = useKDSStore((s) => s.setOnNewOrderCallback);
  const recallTicket = useKDSStore((s) => s.recallTicket);
  const doneTickets = useKDSStore((s) => s.doneTickets);
  const doneCount = useKDSStore((s) => s.doneCount);
  const timerTick = useKDSStore((s) => s.timerTick);
  const recallDoneTicket = useKDSStore((s) => s.recallDoneTicket);
  const prioritizeTicket = useKDSStore((s) => s.prioritizeTicket);
  const toggleRush = useKDSStore((s) => s.toggleRush);
  const focusedTicketId = useKDSStore((s) => s.focusedTicketId);
  const setFocusedTicketId = useKDSStore((s) => s.setFocusedTicketId);
  const markItemDone = useKDSStore((s) => s.markItemDone);
  const acknowledgeNoticeItem = useKDSStore((s) => s.acknowledgeNoticeItem);
  const isTicketRecalled = useKDSStore((s) => s.isTicketRecalled);
  const kdsCleanup = useKDSStore((s) => s._cleanup);

  // Cleanup retries + pending actions on unmount
  useEffect(() => () => kdsCleanup(), [kdsCleanup]);

  // Realtime connection status for adaptive polling
  const { orders: ordersChannel } = useLocationRealtime();
  const isRealtimeConnected = ordersChannel.isConnected;

  // Employee + toast for PIN verification
  const findEmployeeByPin = useEmployeeStore((s) => s.findEmployeeByPin);
  const toast = useToast();

  // KDS display settings (from unified config)
  const kdsHighlightNotes = kdsConfig.highlightNotes;
  const kdsShowOrderNotes = (kdsConfig as any).showOrderNotes ?? true;
  const kdsItemNameLines = kdsConfig.itemNameLines;
  const kdsDisplayModifierGroupName = kdsConfig.displayModifierGroupName;
  const kdsDisplayExclusionsAtTop = kdsConfig.displayExclusionsAtTop;
  const kdsAlphabeticalSort = kdsConfig.alphabeticalSort;
  const kdsAggregateIdenticalItems = kdsConfig.aggregateIdenticalItems;
  const kdsYellowThresholdMinutes = kdsConfig.yellowThresholdMinutes;
  const kdsOrangeThresholdMinutes = kdsConfig.orangeThresholdMinutes;
  const kdsRedThresholdMinutes = kdsConfig.redThresholdMinutes;

  const urgencyThresholds = useMemo<UrgencyThresholds>(
    () => ({
      yellow: kdsYellowThresholdMinutes,
      orange: kdsOrangeThresholdMinutes,
      red: kdsRedThresholdMinutes,
    }),
    [
      kdsYellowThresholdMinutes,
      kdsOrangeThresholdMinutes,
      kdsRedThresholdMinutes,
    ],
  );

  const kdsShowServerName = kdsDisplayConfig?.showServerName ?? false;

  const displaySettings = useMemo<KDSTicketDisplaySettings>(
    () => ({
      highlightNotes: kdsHighlightNotes,
      showOrderNotes: kdsShowOrderNotes !== false,
      itemNameLines: kdsItemNameLines,
      modifierGroupName: kdsDisplayModifierGroupName,
      exclusionsAtTop: kdsDisplayExclusionsAtTop,
      alphabeticalSort: kdsAlphabeticalSort,
      aggregateIdenticalItems: kdsAggregateIdenticalItems,
      showServerName: kdsShowServerName,
    }),
    [
      kdsHighlightNotes,
      kdsShowOrderNotes,
      kdsItemNameLines,
      kdsDisplayModifierGroupName,
      kdsDisplayExclusionsAtTop,
      kdsAlphabeticalSort,
      kdsAggregateIdenticalItems,
      kdsShowServerName,
    ],
  );

  const workflowMode =
    useLocationConfigStore((s) => s.config.kds.workflowMode) ?? "3-step";

  const visibleStatusTabs = useMemo(
    () =>
      workflowMode === "2-step"
        ? STATUS_TABS.filter((t) => t.key !== "pending")
        : STATUS_TABS,
    [workflowMode],
  );

  const [activeStatus, setActiveStatus] = useState<StatusFilter>(
    workflowMode === "2-step" ? "cooking" : "pending",
  );

  // Reset active tab when workflow mode changes (e.g. via broadcast from another device)
  useEffect(() => {
    if (workflowMode === "2-step" && activeStatus === "pending") {
      setActiveStatus("cooking");
    }
  }, [workflowMode]);

  const [activeType, setActiveType] = useState<OrderTypeFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showDisconnected, setShowDisconnected] = useState(false);
  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    }),
  );

  // PIN modal state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<
    "selected" | "all" | "done-selected" | "done-all" | "settings" | null
  >(null);

  // Action menu state (long-press)
  const [actionMenu, setActionMenu] = useState<{
    ticketId: string;
    ticket: KDSTicket;
    position: { x: number; y: number };
  } | null>(null);
  const isActionMenuRushPending = useKDSStore(
    useCallback(
      (s) => (actionMenu ? s.isRushPending(actionMenu.ticketId) : false),
      [actionMenu?.ticketId],
    ),
  );

  // KDS logout handler
  const handleKDSLogout = useCallback(async () => {
    if (stationSessionId && selectedStore?.id) {
      try {
        await supabase.rpc("pos_staff_logout", {
          p_session_id: stationSessionId,
          p_location_id: selectedStore.id,
          p_pin_code: "",
          p_device_id: getDeviceId(),
          p_clock_out: false,
        });
      } catch (e) {
        console.error("KDS logout RPC error:", e);
      }
    }
    clearStationSession();
    clearStationData();
    replaceRoute("(auth)", "pin-login");
  }, [stationSessionId, selectedStore?.id, supabase, clearStationSession]);

  // Triple-tap station name → logout
  const stationTapCountRef = useRef(0);
  const stationTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleStationTripleTap = useCallback(() => {
    stationTapCountRef.current += 1;
    if (stationTapTimerRef.current) clearTimeout(stationTapTimerRef.current);
    if (stationTapCountRef.current >= 3) {
      stationTapCountRef.current = 0;
      handleKDSLogout();
      return;
    }
    stationTapTimerRef.current = setTimeout(() => {
      stationTapCountRef.current = 0;
    }, 600);
  }, [handleKDSLogout]);

  // Refresh button handler — fetches tickets + latest KDS config
  const handleRefresh = useCallback(async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const promises: Promise<void>[] = [];
      if (selectedStore?.id) promises.push(fetchTickets(selectedStore.id));
      if (selectedStation?.id)
        promises.push(fetchKDSDisplay(selectedStation.id));
      if (supabase && selectedStore?.id)
        promises.push(refreshLocationConfig(supabase, selectedStore.id));
      await Promise.all(promises);
    } finally {
      setRefreshing(false);
    }
  }, [
    refreshing,
    selectedStore?.id,
    selectedStation?.id,
    fetchTickets,
    fetchKDSDisplay,
    supabase,
  ]);

  // Subscribe to all 3 status arrays — all 3 FlatLists are always mounted
  const pendingTickets = useKDSStore((s) => s.ticketsByStatus.pending);
  const cookingTickets = useKDSStore((s) => s.ticketsByStatus.cooking);
  const readyTickets = useKDSStore((s) => s.ticketsByStatus.ready);

  // Start the single global timer (each KDSTicketTimer subscribes to timerTick directly)
  useKDSTimer();

  // One shared timestamp per global KDS tick to keep all cards in sync.
  const nowEpochMs = useMemo(() => Date.now(), [timerTick]);

  // Initialize KDS display config for this station
  useEffect(() => {
    if (selectedStation?.id) {
      fetchKDSDisplay(selectedStation.id);
    }
  }, [selectedStation?.id, fetchKDSDisplay]);

  // Update time display every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString("en-US", {
          hour: "numeric",
          minute: "2-digit",
          hour12: true,
        }),
      );
    }, 30000);
    return () => clearInterval(timer);
  }, []);

  // Dynamic column count from KDS display config
  const columnCount = kdsDisplayConfig?.columns ?? 4;

  // With animation: 'none', navigation is synchronous — no transition to wait for.
  // Single rAF yields to Fabric's commit phase, then mark ready.
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      setIsReady(true);
    });
    return () => cancelAnimationFrame(id);
  }, []);

  // Track realtime connection in a ref to avoid polling teardown on flaps
  const isRealtimeConnectedRef = useRef(isRealtimeConnected);
  const prevRealtimeConnectedRef = useRef(isRealtimeConnected);
  useEffect(() => {
    isRealtimeConnectedRef.current = isRealtimeConnected;
  }, [isRealtimeConnected]);

  // Cleanup KDS store module-level state on unmount
  useEffect(() => {
    return () => {
      useKDSStore.getState()._cleanup();
    };
  }, []);

  // Debounce disconnected indicator — only show after 2s of being disconnected
  useEffect(() => {
    if (isRealtimeConnected) {
      setShowDisconnected(false);
      return;
    }
    const timer = setTimeout(() => setShowDisconnected(true), 2000);
    return () => clearTimeout(timer);
  }, [isRealtimeConnected]);

  // Initial fetch + adaptive polling via setTimeout chain
  // Display-filtered KDS stations use 30s polling as a safety net since
  // client-side broadcast filtering may miss items that server-side routing includes.
  const hasDisplayFilter = routingMode !== null && routingMode !== "all";
  useEffect(() => {
    if (!isReady || !locationId) return;

    fetchTickets(locationId);

    let timeoutId: ReturnType<typeof setTimeout> | null = null;
    let cancelled = false;
    const schedulePoll = () => {
      // No poll needed when realtime is healthy and no display filter —
      // broadcasts cover all updates. Only poll when offline or display-filtered.
      if (isRealtimeConnectedRef.current && !hasDisplayFilter) return;
      const interval = isRealtimeConnectedRef.current ? 30_000 : 15_000;
      timeoutId = setTimeout(() => {
        if (cancelled) return;
        backgroundFetchTickets(locationId);
        if (!cancelled) {
          schedulePoll();
        }
      }, interval);
    };
    schedulePoll();

    return () => {
      cancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [
    isReady,
    locationId,
    fetchTickets,
    backgroundFetchTickets,
    hasDisplayFilter,
  ]);

  // On reconnection (false -> true), trigger a single background fetch
  useEffect(() => {
    const wasDisconnected = !prevRealtimeConnectedRef.current;
    prevRealtimeConnectedRef.current = isRealtimeConnected;
    if (isRealtimeConnected && wasDisconnected && isReady && locationId) {
      backgroundFetchTickets(locationId);
    }
  }, [isRealtimeConnected, isReady, locationId, backgroundFetchTickets]);

  // Auto-fire: pending → cooking after configured delay
  useEffect(() => {
    if (!kdsAutoFireEnabled || !isReady) return;

    const intervalId = setInterval(() => {
      const now = Date.now();
      const delayMs = kdsAutoFireDelayMinutes * 60 * 1000;

      // Read the live pending bucket at fire time. Subscribing to it via the
      // identity-selected `pendingTickets` and listing it in deps re-armed this
      // 30s interval on every bucket change — and on a busy board where the
      // bucket changes faster than 30s, the timer reset starved auto-fire.
      const pendingTickets = useKDSStore.getState().ticketsByStatus.pending;
      pendingTickets.forEach((ticket) => {
        if (!shouldAutoFire(ticket.start_time_epoch, now, delayMs)) return;
        const displayNum =
          ticket.display_number ?? ticket.order_number?.slice(-4) ?? "?";
        toast.show({
          title: `${displayNum} auto-fired`,
          message: `Started preparing after ${kdsAutoFireDelayMinutes}m`,
          type: "success",
          duration: 3000,
        });
        advanceTicketStatus(
          ticket.ticket_id,
          getTicketItems(ticket).map((i) => i.id),
          "preparing",
        );
      });
    }, KDS_AUTOMATION_CHECK_MS);

    return () => clearInterval(intervalId);
    // pendingTickets intentionally NOT a dep — read via getState() inside the
    // interval so a bucket change doesn't re-arm (and reset) the 30s timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    kdsAutoFireEnabled,
    kdsAutoFireDelayMinutes,
    isReady,
    advanceTicketStatus,
    toast,
  ]);

  // Auto-bump: ready → served after configured delay
  const autoBumpMinutes = kdsDisplayConfig?.autoBumpMinutes;
  useEffect(() => {
    if (!autoBumpMinutes || !isReady) return;

    const intervalId = setInterval(() => {
      const now = Date.now();
      const delayMs = autoBumpMinutes * 60 * 1000;

      // Read the live ready bucket at fire time (see auto-fire above) so a
      // bucket change doesn't re-arm/reset this 30s interval and starve it.
      const readyTickets = useKDSStore.getState().ticketsByStatus.ready;
      readyTickets.forEach((ticket) => {
        // Skip recalled tickets — check item-level flag (persisted in MMKV, survives
        // hot-reloads) + module-level Set (fast path) as belt-and-suspenders
        const recalled =
          getTicketItems(ticket).some((i) => i.recalled) ||
          isTicketRecalled(ticket.ticket_id);
        if (!shouldAutoBump(ticket.start_time_epoch, now, delayMs, recalled))
          return;
        const displayNum =
          ticket.display_number ?? ticket.order_number?.slice(-4) ?? "?";
        toast.show({
          title: `${displayNum} auto-bumped`,
          message: `Ticket served after ${autoBumpMinutes}m`,
          type: "success",
          duration: 3000,
        });
        advanceTicketStatus(
          ticket.ticket_id,
          getTicketItems(ticket).map((i) => i.id),
          "served",
        );
      });
    }, KDS_AUTOMATION_CHECK_MS);

    return () => clearInterval(intervalId);
    // readyTickets intentionally NOT a dep — read via getState() inside the
    // interval so a bucket change doesn't re-arm (and reset) the 30s timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoBumpMinutes, isReady, advanceTicketStatus, isTicketRecalled, toast]);

  // ─── Sound notifications on new orders ────────────────────────
  const soundServiceRef = useRef<KDSSoundService | null>(null);

  // Initialize sound service and register callback
  useEffect(() => {
    const service = new KDSSoundService();
    soundServiceRef.current = service;
    service.init();

    setOnNewOrderCallback((orderSource) => {
      console.log("[KDS Sound] trigger", { orderSource });
      service.playForSource(orderSource);
    });

    return () => {
      setOnNewOrderCallback(null);
      service.dispose();
      soundServiceRef.current = null;
    };
  }, [setOnNewOrderCallback]);

  // Sync display config into sound service
  useEffect(() => {
    const service = soundServiceRef.current;
    if (!service) return;

    const soundEnabled = kdsDisplayConfig?.soundOnNewOrder ?? false;
    service.setEnabled(soundEnabled);

    if (kdsDisplayConfig?.soundConfig) {
      service.updateConfig(kdsDisplayConfig.soundConfig);
    } else {
      service.updateConfig(DEFAULT_SOUND_CONFIG);
    }
  }, [kdsDisplayConfig?.soundOnNewOrder, kdsDisplayConfig?.soundConfig]);

  // Clear selection on tab switch
  const handleSetActiveStatus = useCallback(
    (status: StatusFilter) => {
      setActiveStatus(status);
      if (bulkMode) clearSelection();
    },
    [bulkMode, clearSelection],
  );

  // Pre-filter ALL 3 status arrays by order type (so all FlatLists stay current)
  const filteredPending = useMemo(() => {
    if (activeType === "all") return pendingTickets;
    return pendingTickets.filter((t) => matchesTypeFilter(t, activeType));
  }, [pendingTickets, activeType]);

  const filteredCooking = useMemo(() => {
    if (activeType === "all") return cookingTickets;
    return cookingTickets.filter((t) => matchesTypeFilter(t, activeType));
  }, [cookingTickets, activeType]);

  const filteredReady = useMemo(() => {
    if (activeType === "all") return readyTickets;
    return readyTickets.filter((t) => matchesTypeFilter(t, activeType));
  }, [readyTickets, activeType]);

  const filteredDone = useMemo(() => {
    const now = Date.now();
    const base =
      activeType === "all"
        ? doneTickets
        : doneTickets.filter((t) => matchesTypeFilter(t, activeType));
    return base.filter(
      (t) => (t.done_time_epoch ?? 0) > now - DONE_TICKETS_TIME_WINDOW_MS,
    );
  }, [doneTickets, activeType]);

  const countDone = filteredDone.length;

  const filteredByStatus: Record<StatusFilter, KDSTicket[]> = useMemo(
    () => ({
      pending: filteredPending,
      cooking: filteredCooking,
      ready: filteredReady,
      done: filteredDone,
    }),
    [filteredPending, filteredCooking, filteredReady, filteredDone],
  );

  // Deferred data for inactive FlatLists — active tab updates instantly,
  // inactive tabs update after the frame so they don't block the active render.
  const [deferredByStatus, setDeferredByStatus] = useState(filteredByStatus);
  useEffect(() => {
    const id = requestAnimationFrame(() =>
      setDeferredByStatus(filteredByStatus),
    );
    return () => cancelAnimationFrame(id);
  }, [filteredByStatus]);

  // Active tab always uses live data; inactive tabs use deferred
  const listDataByStatus = useMemo<Record<StatusFilter, KDSTicket[]>>(
    () => ({
      pending:
        activeStatus === "pending"
          ? filteredByStatus.pending
          : deferredByStatus.pending,
      cooking:
        activeStatus === "cooking"
          ? filteredByStatus.cooking
          : deferredByStatus.cooking,
      ready:
        activeStatus === "ready"
          ? filteredByStatus.ready
          : deferredByStatus.ready,
      done:
        activeStatus === "done" ? filteredByStatus.done : deferredByStatus.done,
    }),
    [activeStatus, filteredByStatus, deferredByStatus],
  );

  // Active tab's filtered data — for bulk actions / select-all
  const activeFilteredTickets = filteredByStatus[activeStatus];

  // Type counts for badge display (active tab only)
  const activeRawTickets =
    activeStatus === "pending"
      ? pendingTickets
      : activeStatus === "cooking"
        ? cookingTickets
        : activeStatus === "ready"
          ? readyTickets
          : doneTickets;

  const typeCounts = useMemo(() => {
    const result: Record<OrderTypeFilter, number> = {
      all: activeRawTickets.length,
      delivery: 0,
      takeout: 0,
      dine_in: 0,
    };
    for (const t of activeRawTickets) {
      const ot = (t.order_type || "").toLowerCase();
      if (ot === "delivery") result.delivery++;
      else if (ot === "takeout" || ot === "to_go" || ot === "to go")
        result.takeout++;
      else result.dine_in++;
    }
    return result;
  }, [activeRawTickets]);

  const onRefresh = useCallback(async () => {
    if (!locationId) return;
    setRefreshing(true);
    try {
      await fetchTickets(locationId);
    } catch (error) {
      console.error("KDS Refresh Failed:", error);
    } finally {
      setRefreshing(false);
    }
  }, [locationId, fetchTickets]);

  // ─── Bulk Action Handlers ───────────────────────────────────────
  const handleBulkAction = useCallback(
    (action: "selected" | "all" | "done-selected" | "done-all") => {
      setPendingBulkAction(action);
      setShowPinModal(true);
    },
    [],
  );

  const handlePinConfirm = useCallback(
    async (pin: string) => {
      const employee = findEmployeeByPin(pin);
      if (!employee) {
        toast.show({
          title: "Invalid PIN",
          message: "No employee found with that PIN.",
          type: "error",
        });
        return;
      }

      if (!MANAGER_ROLES.includes(employee.role)) {
        toast.show({
          title: "Unauthorized",
          message:
            pendingBulkAction === "settings"
              ? "Only managers can open Settings."
              : "Only managers can perform bulk operations.",
          type: "error",
        });
        return;
      }

      // PIN is valid and employee is a manager.
      setShowPinModal(false);

      // Settings navigation is gated by the same manager PIN as bulk ops.
      // KDS devices navigate to a standalone page that bypasses the settings
      // layout (which has the sidebar). Non-KDS devices use the normal path.
      if (pendingBulkAction === "settings") {
        setPendingBulkAction(null);
        router.push("/kds-settings");
        return;
      }

      const ticketIdsToAdvance =
        pendingBulkAction === "all" || pendingBulkAction === "done-all"
          ? activeFilteredTickets.map((t) => t.ticket_id)
          : Array.from(useKDSStore.getState().selectedTicketIds as Set<string>);
      const isForceDoneAction =
        pendingBulkAction === "done-selected" ||
        pendingBulkAction === "done-all";

      if (ticketIdsToAdvance.length === 0) {
        toast.show({
          title: "No Tickets",
          message: "No tickets to advance.",
          type: "warning",
        });
        setPendingBulkAction(null);
        return;
      }

      if (isForceDoneAction) {
        // In ack-on-advance mode: pre-acknowledge all unacknowledged notices
        // so bulkMarkTicketsDone doesn't skip those tickets.
        const acknowledgmentMode =
          useLocationConfigStore.getState().config.kds.acknowledgmentMode ??
          "block-advance";
        if (acknowledgmentMode === "ack-on-advance") {
          const ticketsById = useKDSStore.getState()._ticketsById;
          for (const tid of ticketIdsToAdvance) {
            const ticket = ticketsById[tid];
            if (!ticket) continue;
            for (const item of ticket.items) {
              if (
                (item.is_voided || item.refunded_quantity) &&
                !item.acknowledged
              ) {
                acknowledgeNoticeItem(tid, item.id);
              }
            }
          }
        }

        const { done, skippedNotice } = bulkMarkTicketsDone(ticketIdsToAdvance);
        if (skippedNotice > 0) {
          toast.show({
            title: "Some tickets kept",
            message: `${done} marked done by ${employee.fullName}. ${skippedNotice} kept — unacknowledged void/refund needs review.`,
            type: "warning",
          });
        } else {
          toast.show({
            title: "Marked Done",
            message: `${done} ticket(s) marked done by ${employee.fullName}.`,
            type: "success",
          });
        }
      } else {
        bulkAdvanceTickets(ticketIdsToAdvance, locationId || "");
        toast.show({
          title: "Bulk Advance",
          message: `${ticketIdsToAdvance.length} ticket(s) advanced by ${employee.fullName}.`,
          type: "success",
        });
      }
      setPendingBulkAction(null);
    },
    [
      findEmployeeByPin,
      pendingBulkAction,
      activeFilteredTickets,
      bulkMarkTicketsDone,
      bulkAdvanceTickets,
      acknowledgeNoticeItem,
      locationId,
      toast,
      router,
    ],
  );

  const handlePinCancel = useCallback(() => {
    setShowPinModal(false);
    setPendingBulkAction(null);
  }, []);

  const handleSelectAll = useCallback(() => {
    selectAllVisible(activeFilteredTickets.map((t) => t.ticket_id));
  }, [selectAllVisible, activeFilteredTickets]);

  // ─── Long-Press Action Menu Handlers ────────────────────────────
  const handleTicketLongPress = useCallback(
    (ticketId: string, ticket: KDSTicket, event: GestureResponderEvent) => {
      const { pageX, pageY } = event.nativeEvent;
      setActionMenu({ ticketId, ticket, position: { x: pageX, y: pageY } });
    },
    [],
  );

  const handleDismissActionMenu = useCallback(() => {
    setActionMenu(null);
  }, []);

  const handleRecall = useCallback(() => {
    if (!actionMenu) return;
    recallTicket(actionMenu.ticketId);
    setActionMenu(null);
  }, [actionMenu, recallTicket]);

  const handlePrioritize = useCallback(() => {
    if (!actionMenu) return;
    prioritizeTicket(actionMenu.ticketId);
    // Play alert sound for prioritize
    soundServiceRef.current?.playPreview("alert");
    setActionMenu(null);
  }, [actionMenu, prioritizeTicket]);

  const handleToggleRush = useCallback(() => {
    if (!actionMenu) return;
    toggleRush(actionMenu.ticketId);
    setActionMenu(null);
  }, [actionMenu, toggleRush]);

  const handleItemPress = useCallback(
    (ticketId: string, itemId: string) => {
      markItemDone(ticketId, itemId);
    },
    [markItemDone],
  );

  const handleAcknowledgeNotice = useCallback(
    (ticketId: string, itemId: string) => {
      acknowledgeNoticeItem(ticketId, itemId);
    },
    [acknowledgeNoticeItem],
  );

  // Wrap advanceTicketStatus with undo toast
  const advanceWithUndo = useCallback(
    (
      ticketId: string,
      itemIds: string[],
      newStatus: "preparing" | "ready" | "served",
    ) => {
      // Read ticket data before advancing (advance mutates the store)
      const ticket = useKDSStore.getState()._ticketsById[ticketId];
      const displayNum =
        ticket?.display_number || ticket?.order_number?.slice(-4) || "----";
      const statusLabel =
        newStatus === "preparing"
          ? "Cooking"
          : newStatus === "ready"
            ? "Served"
            : "Done";
      // Fire store update FIRST — this is the critical path
      advanceTicketStatus(ticketId, itemIds, newStatus);

      // Clear single-select focus if the bumped ticket was the focused one.
      if (useKDSStore.getState().focusedTicketId === ticketId) {
        setFocusedTicketId(null);
      }

      // Build rich context for undo toast subtitle
      const displayTableName = getDisplayTableName(ticket?.table_name);
      const tablePart = displayTableName ? `Table ${displayTableName}` : "";
      const typePart = getOrderTypeLabel(ticket?.order_type ?? null);
      const itemPart = `${ticket?.item_count ?? itemIds.length} items`;
      const parts = [tablePart, typePart, itemPart].filter(Boolean);
      const message = parts.join(" · ");

      toast.show({
        title: `Ticket ${displayNum} → ${statusLabel}`,
        message,
        type: "success",
        duration: 5000,
        onUndo: () => {
          if (newStatus === "served") {
            recallDoneTicket(ticketId);
          } else {
            recallTicket(ticketId);
          }
        },
      });
    },
    [
      advanceTicketStatus,
      recallTicket,
      recallDoneTicket,
      toast,
      setFocusedTicketId,
    ],
  );

  // ─── Single-Select Mode (header action bar) ─────────────────────
  // Tapping a ticket focuses it; tapping the focused ticket again clears it.
  const handleSelectTicket = useCallback(
    (ticketId: string) => {
      setFocusedTicketId(
        useKDSStore.getState().focusedTicketId === ticketId ? null : ticketId,
      );
    },
    [setFocusedTicketId],
  );

  // Rush / Prioritize from the focused-card header. Mirror the long-press menu,
  // including its prioritize "alert" sound, so both entry points behave alike.
  const handleFocusedRush = useCallback(
    (ticketId: string) => {
      toggleRush(ticketId);
      setFocusedTicketId(null);
    },
    [toggleRush, setFocusedTicketId],
  );

  const handleFocusedPrioritize = useCallback(
    (ticketId: string) => {
      prioritizeTicket(ticketId);
      soundServiceRef.current?.playPreview("alert");
      setFocusedTicketId(null);
    },
    [prioritizeTicket, setFocusedTicketId],
  );

  // Clear focus when leaving single-select mode, switching tabs, or when the
  // focused ticket leaves the active list (e.g. bumped from another station).
  useEffect(() => {
    if (kdsTicketTapMode !== "single-select" && focusedTicketId) {
      setFocusedTicketId(null);
    }
  }, [kdsTicketTapMode, focusedTicketId, setFocusedTicketId]);

  const _updateKdsConfig = useLocationConfigStore((s) => s.updateConfig);
  const handleToggleHideDone = useCallback(() => {
    _updateKdsConfig("kds", { hideDoneItems: !kdsHideDoneItems });
  }, [kdsHideDoneItems, _updateKdsConfig]);

  // ─── Render Helpers ─────────────────────────────────────────────
  const renderTicketCard = useCallback(
    (item: KDSTicket) => (
      <KDSTicketCard
        ticket={item}
        // D6: bucket the per-second nowEpochMs into a 0-3 urgency level here so
        // the card only re-renders its body when a ticket crosses a threshold.
        urgencyLevel={getUrgencyLevel(
          item.start_time_epoch,
          urgencyThresholds,
          // Freeze urgency at the server completion time for ready ("Served")
          // tickets so the header color stops escalating in lockstep with the
          // frozen timer, instead of drifting per-device on live nowEpochMs.
          item.status === "ready" && item.ready_time_epoch
            ? item.ready_time_epoch
            : nowEpochMs,
        )}
        onAdvance={advanceWithUndo}
        onToggleSelect={toggleTicketSelection}
        onLongPress={handleTicketLongPress}
        onItemPress={workflowMode === "2-step" ? handleItemPress : undefined}
        onAcknowledgeNotice={handleAcknowledgeNotice}
        hideDoneItems={kdsHideDoneItems}
        displaySettings={displaySettings}
        tapMode={kdsTicketTapMode}
        isFocused={
          kdsTicketTapMode === "single-select" &&
          focusedTicketId === item.ticket_id
        }
        onSelectTicket={handleSelectTicket}
        onRush={handleFocusedRush}
        onPrioritize={handleFocusedPrioritize}
      />
    ),
    [
      advanceWithUndo,
      toggleTicketSelection,
      handleTicketLongPress,
      handleItemPress,
      handleAcknowledgeNotice,
      workflowMode,
      kdsHideDoneItems,
      displaySettings,
      urgencyThresholds,
      nowEpochMs,
      kdsTicketTapMode,
      focusedTicketId,
      handleSelectTicket,
      handleFocusedRush,
      handleFocusedPrioritize,
    ],
  );

  const renderDoneTicketCard = useCallback(
    (item: KDSTicket) => (
      <KDSDoneTicketCard
        ticket={item}
        onRecall={recallDoneTicket}
        isFocused={focusedTicketId === item.ticket_id}
        onSelectTicket={handleSelectTicket}
        showServerName={kdsShowServerName}
      />
    ),
    [recallDoneTicket, focusedTicketId, handleSelectTicket, kdsShowServerName],
  );

  const activeTabTickets = listDataByStatus[activeStatus];
  const isDoneTab = activeStatus === "done";
  const ticketsForLayout = useMemo(
    () =>
      [...dedupeTicketsForRender(activeTabTickets)].sort((a, b) => {
        // For non-active tabs, use ticket_id tiebreaker only (don't re-sort)
        const aTs =
          activeStatus === "done"
            ? (a.done_time_epoch ?? a.start_time_epoch ?? 0)
            : (a.start_time_epoch ?? 0);
        const bTs =
          activeStatus === "done"
            ? (b.done_time_epoch ?? b.start_time_epoch ?? 0)
            : (b.start_time_epoch ?? 0);
        if (aTs !== bTs) {
          // "Served" tab (ready) — used in both 2-step and 3-step modes
          if (activeStatus === "ready") {
            return kdsServedOrderSort === "newest-first"
              ? bTs - aTs // newest first (descending)
              : aTs - bTs; // oldest first (ascending)
          }
          return aTs - bTs; // default: oldest first
        }
        return a.ticket_id.localeCompare(b.ticket_id);
      }),
    [activeTabTickets, activeStatus, kdsServedOrderSort],
  );

  const columnizedTickets = useMemo(() => {
    const cols: KDSTicket[][] = Array.from({ length: columnCount }, () => []);

    // Always distribute in row-major order so removal reflows left-to-right.
    ticketsForLayout.forEach((ticket, index) => {
      cols[index % columnCount].push(ticket);
    });

    return cols;
  }, [ticketsForLayout, columnCount]);

  // Skeleton grid for loading state
  const renderSkeletons = () => (
    <View
      style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", padding: s(4) }}
    >
      {Array.from({ length: columnCount * 4 }).map((_, i) => (
        <View
          key={`skel-${i}`}
          style={{
            flex: 1,
            minWidth: `${100 / columnCount}%`,
            paddingHorizontal: s(2),
          }}
        >
          <KDSSkeletonCard />
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* ─── Header ─── */}
      <View
        style={{
          backgroundColor: colors.panel,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingHorizontal: s(16),
          paddingVertical: s(10),
        }}
      >
        {/* Single row: status tabs (left) — order types + station info (right) */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* LEFT: Status tabs */}
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}
          >
            {visibleStatusTabs.map((tab) => {
              const isActive = activeStatus === tab.key;
              return (
                <View key={tab.key}>
                  <TouchableOpacity
                    onPress={() => handleSetActiveStatus(tab.key)}
                    style={{
                      paddingHorizontal: s(12),
                      paddingVertical: s(6),
                      borderRadius: s(16),
                      backgroundColor: isActive
                        ? colors.teal + "20"
                        : "transparent",
                      borderWidth: 1,
                      borderColor: isActive
                        ? colors.teal + "50"
                        : colors.border,
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(6),
                    }}
                  >
                    <Text
                      style={{
                        color: isActive ? colors.teal : colors.label,
                        fontSize: s(13),
                        fontWeight: isActive ? "700" : "500",
                      }}
                    >
                      {tab.label}
                    </Text>
                    <View
                      style={{
                        backgroundColor: isActive
                          ? colors.teal + "50"
                          : colors.border,
                        paddingHorizontal: s(6),
                        paddingVertical: s(1),
                        borderRadius: s(8),
                        minWidth: s(22),
                        alignItems: "center",
                      }}
                    >
                      <Text
                        style={{
                          color: isActive ? colors.teal : colors.label,
                          fontSize: s(11),
                          fontWeight: "700",
                          opacity: isFetching ? 0.7 : 1,
                        }}
                      >
                        {tab.key === "done"
                          ? countDone
                          : tab.key === "pending"
                            ? countPending
                            : tab.key === "cooking"
                              ? countCooking
                              : countReady}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              );
            })}
          </View>

          {/* RIGHT: Order types + display badge + station/time */}
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}
          >
            {/* Order type filters */}
            {TYPE_TABS.map((tab) => {
              const isActive = activeType === tab.key;
              const count = typeCounts[tab.key];
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveType(tab.key)}
                  style={{
                    paddingHorizontal: s(12),
                    paddingVertical: s(6),
                    borderRadius: s(14),
                    backgroundColor: isActive
                      ? colors.teal + "20"
                      : "transparent",
                    borderWidth: 1,
                    borderColor: isActive ? colors.teal + "50" : colors.border,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: s(4),
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? colors.teal : colors.label,
                      fontSize: s(12),
                      fontWeight: isActive ? "600" : "500",
                    }}
                  >
                    {tab.label}
                  </Text>
                  {count > 0 && (
                    <View
                      style={{
                        backgroundColor: isActive
                          ? colors.teal + "50"
                          : colors.border,
                        paddingHorizontal: s(5),
                        paddingVertical: s(1),
                        borderRadius: s(6),
                      }}
                    >
                      <Text
                        style={{
                          color: isActive ? colors.teal : colors.label,
                          fontSize: s(10),
                          fontWeight: "600",
                        }}
                      >
                        {count}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}

            {activeStatus !== "done" && (
              <>
                <View
                  style={{
                    width: 1,
                    height: s(20),
                    backgroundColor: colors.border,
                  }}
                />
                <TouchableOpacity
                  onPress={toggleBulkMode}
                  style={{
                    paddingHorizontal: s(12),
                    paddingVertical: s(6),
                    borderRadius: s(14),
                    backgroundColor: bulkMode
                      ? colors.info + "20"
                      : "transparent",
                    borderWidth: 1,
                    borderColor: bulkMode ? colors.info + "50" : colors.border,
                    flexDirection: "row",
                    alignItems: "center",
                    gap: s(4),
                  }}
                >
                  <Text
                    style={{
                      color: bulkMode ? colors.info : colors.label,
                      fontSize: s(12),
                      fontWeight: bulkMode ? "700" : "600",
                    }}
                  >
                    {bulkMode ? "Exit Bulk" : "Bulk"}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => handleBulkAction("done-all")}
                  disabled={activeFilteredTickets.length === 0}
                  style={{
                    paddingHorizontal: s(12),
                    paddingVertical: s(6),
                    borderRadius: s(14),
                    backgroundColor:
                      activeFilteredTickets.length > 0
                        ? colors.warning + "18"
                        : "transparent",
                    borderWidth: 1,
                    borderColor:
                      activeFilteredTickets.length > 0
                        ? colors.warning + "45"
                        : colors.border,
                    opacity: activeFilteredTickets.length > 0 ? 1 : 0.5,
                  }}
                >
                  <Text
                    style={{
                      color:
                        activeFilteredTickets.length > 0
                          ? colors.warning
                          : colors.label,
                      fontSize: s(12),
                      fontWeight: "700",
                    }}
                  >
                    Mark All Done
                  </Text>
                </TouchableOpacity>
              </>
            )}

            {/* Divider */}
            <View
              style={{
                width: 1,
                height: s(20),
                backgroundColor: colors.border,
              }}
            />

            {/* Refresh Button — tap = fetch latest tickets + config.
                Settings are accessed via the Settings button (PIN-gated). */}
            <TouchableOpacity
              onPress={handleRefresh}
              delayLongPress={400}
              accessibilityLabel="Refresh KDS"
              style={{
                padding: s(6),
                borderRadius: s(8),
                backgroundColor: refreshing
                  ? colors.teal + "15"
                  : "transparent",
                borderWidth: 1,
                borderColor: refreshing ? colors.teal + "30" : colors.border,
              }}
            >
              <RotateCcw
                size={s(14)}
                color={refreshing ? colors.teal : colors.label}
              />
            </TouchableOpacity>

            {/* Settings Button — opens the real app Settings page,
                gated behind a manager PIN (see handlePinConfirm). */}
            <TouchableOpacity
              onPress={() => {
                setPendingBulkAction("settings");
                setShowPinModal(true);
              }}
              accessibilityLabel="Open Settings"
              style={{
                padding: s(6),
                borderRadius: s(8),
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
              }}
            >
              <Settings size={s(14)} color={colors.label} />
            </TouchableOpacity>

            {/* Auto-fire badge */}
            {kdsAutoFireEnabled && kdsAutoFireDelayMinutes ? (
              <>
                <View
                  style={{
                    width: 1,
                    height: s(20),
                    backgroundColor: colors.border,
                  }}
                />
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.info + "15",
                    paddingHorizontal: s(8),
                    paddingVertical: s(4),
                    borderRadius: s(10),
                    borderWidth: 1,
                    borderColor: colors.info + "30",
                    gap: s(4),
                  }}
                >
                  <Flame size={s(11)} color={colors.info} />
                  <Text
                    style={{
                      color: colors.info,
                      fontSize: s(11),
                      fontWeight: "600",
                    }}
                  >
                    Fire {kdsAutoFireDelayMinutes}m
                  </Text>
                </View>
              </>
            ) : null}

            {/* Auto-bump badge */}
            {autoBumpMinutes ? (
              <>
                <View
                  style={{
                    width: 1,
                    height: s(20),
                    backgroundColor: colors.border,
                  }}
                />
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    backgroundColor: colors.warning + "15",
                    paddingHorizontal: s(8),
                    paddingVertical: s(4),
                    borderRadius: s(10),
                    borderWidth: 1,
                    borderColor: colors.warning + "30",
                    gap: s(4),
                  }}
                >
                  <ArrowUpToLine size={s(11)} color={colors.warning} />
                  <Text
                    style={{
                      color: colors.warning,
                      fontSize: s(11),
                      fontWeight: "600",
                    }}
                  >
                    Auto {autoBumpMinutes}m
                  </Text>
                </View>
              </>
            ) : null}

            {/* Divider */}
            <View
              style={{
                width: 1,
                height: s(20),
                backgroundColor: colors.border,
              }}
            />

            {/* Station Name + EXPO tag | Time + Dot */}
            <View
              style={{ flexDirection: "row", alignItems: "center", gap: s(4) }}
            >
              {selectedStation?.station_name && (
                <TouchableOpacity
                  onPress={handleStationTripleTap}
                  activeOpacity={1}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: s(4),
                  }}
                >
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: s(12),
                      fontWeight: "500",
                    }}
                  >
                    {selectedStation.station_name}
                  </Text>
                  {routingMode === "all" && (
                    <Text
                      style={{
                        color: colors.success,
                        fontSize: s(11),
                        fontWeight: "700",
                      }}
                    >
                      EXPO
                    </Text>
                  )}
                </TouchableOpacity>
              )}
              {selectedStation?.station_name && (
                <Text style={{ color: colors.muted, fontSize: s(12) }}>|</Text>
              )}
              <Text
                style={{
                  color: colors.label,
                  fontSize: s(12),
                  fontWeight: "500",
                }}
              >
                {currentTime}
              </Text>
              {showDisconnected ? (
                <View
                  style={{
                    width: s(8),
                    height: s(8),
                    borderRadius: s(4),
                    backgroundColor: colors.danger,
                    marginLeft: s(4),
                  }}
                />
              ) : (
                <PulsingDot />
              )}
            </View>
          </View>
        </View>
      </View>

      {/* ─── Bulk Action Bar ─── */}
      {bulkMode && activeStatus !== "done" && (
        <View
          style={{
            backgroundColor: colors.panel,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingHorizontal: s(16),
            paddingVertical: s(8),
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: s(12) }}
          >
            <Text style={{ color: colors.label, fontSize: s(13) }}>
              {selectionCount} selected
            </Text>
            <TouchableOpacity
              onPress={handleSelectAll}
              style={{
                paddingHorizontal: s(10),
                paddingVertical: s(4),
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "50",
                borderRadius: s(6),
              }}
            >
              <Text
                style={{
                  color: colors.teal,
                  fontSize: s(12),
                  fontWeight: "600",
                }}
              >
                Select All
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={clearSelection}
              style={{
                paddingHorizontal: s(10),
                paddingVertical: s(4),
                backgroundColor: "transparent",
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: s(6),
              }}
            >
              <Text
                style={{
                  color: colors.label,
                  fontSize: s(12),
                  fontWeight: "600",
                }}
              >
                Clear
              </Text>
            </TouchableOpacity>
          </View>
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: s(8) }}
          >
            <TouchableOpacity
              onPress={() => handleBulkAction("selected")}
              disabled={selectionCount === 0}
              style={{
                paddingHorizontal: s(12),
                paddingVertical: s(6),
                backgroundColor:
                  selectionCount > 0 ? colors.teal + "20" : "transparent",
                borderWidth: 1,
                borderColor:
                  selectionCount > 0 ? colors.teal + "50" : colors.border,
                borderRadius: s(6),
                opacity: selectionCount > 0 ? 1 : 0.5,
              }}
            >
              <Text
                style={{
                  color: selectionCount > 0 ? colors.teal : colors.label,
                  fontSize: s(12),
                  fontWeight: "700",
                }}
              >
                Advance Selected
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleBulkAction("done-selected")}
              disabled={selectionCount === 0}
              style={{
                paddingHorizontal: s(12),
                paddingVertical: s(6),
                backgroundColor:
                  selectionCount > 0 ? colors.warning + "18" : "transparent",
                borderWidth: 1,
                borderColor:
                  selectionCount > 0 ? colors.warning + "45" : colors.border,
                borderRadius: s(6),
                opacity: selectionCount > 0 ? 1 : 0.5,
              }}
            >
              <Text
                style={{
                  color: selectionCount > 0 ? colors.warning : colors.label,
                  fontSize: s(12),
                  fontWeight: "700",
                }}
              >
                Mark Selected Done
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleBulkAction("all")}
              disabled={activeFilteredTickets.length === 0}
              style={{
                paddingHorizontal: s(12),
                paddingVertical: s(6),
                backgroundColor:
                  activeFilteredTickets.length > 0
                    ? colors.danger + "20"
                    : "transparent",
                borderWidth: 1,
                borderColor:
                  activeFilteredTickets.length > 0
                    ? colors.danger + "50"
                    : colors.border,
                borderRadius: s(6),
                opacity: activeFilteredTickets.length > 0 ? 1 : 0.5,
              }}
            >
              <Text
                style={{
                  color:
                    activeFilteredTickets.length > 0
                      ? colors.danger
                      : colors.label,
                  fontSize: s(12),
                  fontWeight: "700",
                }}
              >
                Advance All in Tab
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleBulkAction("done-all")}
              disabled={activeFilteredTickets.length === 0}
              style={{
                paddingHorizontal: s(12),
                paddingVertical: s(6),
                backgroundColor:
                  activeFilteredTickets.length > 0
                    ? colors.warning + "18"
                    : "transparent",
                borderWidth: 1,
                borderColor:
                  activeFilteredTickets.length > 0
                    ? colors.warning + "45"
                    : colors.border,
                borderRadius: s(6),
                opacity: activeFilteredTickets.length > 0 ? 1 : 0.5,
              }}
            >
              <Text
                style={{
                  color:
                    activeFilteredTickets.length > 0
                      ? colors.warning
                      : colors.label,
                  fontSize: s(12),
                  fontWeight: "700",
                }}
              >
                Mark All Done
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── Single Active FlatList ─── */}
      {!isReady || (isInitialLoading && !hasHydrated) ? (
        renderSkeletons()
      ) : activeTabTickets.length === 0 ? (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingVertical: s(60),
          }}
        >
          <Text style={{ color: colors.muted, fontSize: s(14) }}>
            {isDoneTab ? "No done tickets" : `No ${activeStatus} tickets`}
          </Text>
        </View>
      ) : (
        <ScrollView
          key={`kds-${activeStatus}-${columnCount}`}
          contentContainerStyle={{
            padding: s(4),
            paddingBottom: s(20),
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={true}
        >
          {/* Tapping empty space clears the single-select focus. Card Pressables
              capture their own taps, so this only fires for the surrounding area. */}
          <Pressable
            style={{ flex: 1 }}
            onPress={() => {
              if (focusedTicketId) setFocusedTicketId(null);
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
              {columnizedTickets.map((colTickets, col) => (
                <View
                  key={`col-${activeStatus}-${col}`}
                  style={{ flex: 1, paddingHorizontal: s(2) }}
                >
                  {colTickets.map((ticket) => (
                    <View key={ticket.ticket_id}>
                      {isDoneTab
                        ? renderDoneTicketCard(ticket)
                        : renderTicketCard(ticket)}
                    </View>
                  ))}
                </View>
              ))}
            </View>
          </Pressable>
        </ScrollView>
      )}

      {/* ─── Action Menu Overlay ─── */}
      {actionMenu && (
        <Pressable
          onPress={handleDismissActionMenu}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100,
            backgroundColor: "rgba(0,0,0,0.18)",
          }}
        >
          {(() => {
            const orderLabel =
              actionMenu.ticket.display_number ||
              actionMenu.ticket.order_number?.slice(-4) ||
              "----";
            const statusText =
              actionMenu.ticket.status === "pending"
                ? "Pending"
                : actionMenu.ticket.status === "cooking"
                  ? "Cooking"
                  : actionMenu.ticket.status === "ready"
                    ? "Ready"
                    : "Done";
            const statusColor =
              actionMenu.ticket.status === "pending"
                ? colors.warning
                : actionMenu.ticket.status === "cooking"
                  ? colors.info
                  : actionMenu.ticket.status === "ready"
                    ? colors.success
                    : colors.muted;
            const menuWidth = 236;
            const screen = Dimensions.get("window");
            const left = Math.max(
              12,
              Math.min(
                actionMenu.position.x - 10,
                screen.width - menuWidth - 12,
              ),
            );
            const top = Math.max(
              12,
              Math.min(actionMenu.position.y - 10, screen.height - 210),
            );

            return (
              <View
                style={{
                  position: "absolute",
                  top,
                  left,
                  width: s(menuWidth),
                  backgroundColor: "#FFFFFF",
                  borderRadius: s(12),
                  borderWidth: 1,
                  borderColor: "#E5E7EB",
                  padding: s(8),
                  shadowColor: "#000",
                  shadowOffset: { width: 0, height: s(8) },
                  shadowOpacity: 0.14,
                  shadowRadius: s(16),
                  elevation: 12,
                  zIndex: 101,
                }}
              >
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    marginBottom: s(6),
                  }}
                >
                  <Text
                    style={{
                      color: "#111827",
                      fontSize: s(14),
                      fontWeight: "800",
                    }}
                  >
                    Order #{orderLabel}
                  </Text>
                  <View
                    style={{
                      backgroundColor: statusColor + "20",
                      borderWidth: 1,
                      borderColor: statusColor + "55",
                      borderRadius: 999,
                      paddingHorizontal: s(8),
                      paddingVertical: s(2),
                    }}
                  >
                    <Text
                      style={{
                        color: statusColor,
                        fontSize: s(10),
                        fontWeight: "700",
                      }}
                    >
                      {statusText}
                    </Text>
                  </View>
                </View>

                <Text
                  style={{
                    color: "#6B7280",
                    fontSize: s(10),
                    marginBottom: s(8),
                  }}
                  numberOfLines={1}
                >
                  {getOrderTypeLabel(actionMenu.ticket.order_type)}
                  {getDisplayTableName(actionMenu.ticket.table_name)
                    ? ` · Table ${getDisplayTableName(
                        actionMenu.ticket.table_name,
                      )}`
                    : ""}
                  {actionMenu.ticket.item_count
                    ? ` · ${actionMenu.ticket.item_count} items`
                    : ""}
                </Text>

                {/* Recall — only for ready tickets */}
                {actionMenu.ticket.status === "ready" && (
                  <Pressable
                    onPress={handleRecall}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      justifyContent: "space-between",
                      paddingHorizontal: s(12),
                      paddingVertical: s(8),
                      borderRadius: s(8),
                      borderWidth: 1,
                      borderColor: colors.teal + "66",
                      backgroundColor: colors.teal + "16",
                      marginBottom: s(6),
                    }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: s(8),
                      }}
                    >
                      <RotateCcw size={s(15)} color={colors.teal} />
                      <Text
                        style={{
                          color: "#111827",
                          fontSize: s(13),
                          fontWeight: "700",
                        }}
                      >
                        Recall
                      </Text>
                    </View>
                  </Pressable>
                )}

                {/* Recall — only for ready tickets */}
                {(actionMenu.ticket.status === "pending" || actionMenu.ticket.status === "cooking") && (
                  <>
                    {/* Prioritize */}
                    <Pressable
                      onPress={handlePrioritize}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingHorizontal: s(12),
                        paddingVertical: s(8),
                        borderRadius: s(8),
                        borderWidth: 1,
                        borderColor: colors.teal + "66",
                        backgroundColor: colors.teal + "16",
                        marginBottom: s(6),
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: s(8),
                        }}
                      >
                        <ArrowUpToLine size={s(15)} color={colors.teal} />
                        <Text
                          style={{
                            color: "#111827",
                            fontSize: s(13),
                            fontWeight: "700",
                          }}
                        >
                          {actionMenu.ticket.prioritized
                            ? "Unprioritize"
                            : "Prioritize"}
                        </Text>
                      </View>
                    </Pressable>

                    {/* Rush / Un-Rush */}
                    <Pressable
                      onPress={handleToggleRush}
                      disabled={isActionMenuRushPending}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        justifyContent: "space-between",
                        paddingHorizontal: s(12),
                        paddingVertical: s(8),
                        borderRadius: s(8),
                        borderWidth: 1,
                        borderColor: colors.teal + "66",
                        backgroundColor: colors.teal + "16",
                        marginBottom: s(6),
                        opacity: isActionMenuRushPending ? 0.5 : 1,
                      }}
                    >
                      <View
                        style={{
                          flexDirection: "row",
                          alignItems: "center",
                          gap: s(8),
                        }}
                      >
                        <Flame size={s(15)} color={colors.teal} />
                        <Text
                          style={{
                            color: "#111827",
                            fontSize: s(13),
                            fontWeight: "700",
                          }}
                        >
                          {getTicketItems(actionMenu.ticket).some((i) => i.rush)
                            ? "Remove Rush"
                            : "Mark Rush"}
                        </Text>
                      </View>
                    </Pressable>
                  </>
                )}

                {/* Bump Order */}
                <Pressable
                  onPress={() => {
                    const ticket = actionMenu.ticket;
                    if (ticket) {
                      const itemIds = getTicketItems(ticket).map((i) => i.id);
                      const isRecalledTicket = getTicketItems(ticket).some(
                        (i) => i.recalled,
                      );
                      let newStatus:
                        | "preparing"
                        | "ready"
                        | "served"
                        | undefined;
                      if (isRecalledTicket) newStatus = "served";
                      else if (ticket.status === "pending")
                        newStatus = "preparing";
                      else if (ticket.status === "cooking") newStatus = "ready";
                      else if (ticket.status === "ready") newStatus = "served";
                      if (newStatus) {
                        advanceTicketStatus(
                          ticket.ticket_id,
                          itemIds,
                          newStatus,
                        );
                        handleDismissActionMenu();
                      }
                    }
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    justifyContent: "space-between",
                    paddingHorizontal: s(12),
                    paddingVertical: s(8),
                    borderRadius: s(8),
                    borderWidth: 1,
                    borderColor: colors.success + "66",
                    backgroundColor: colors.success + "16",
                  }}
                >
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: s(8),
                    }}
                  >
                    <CheckSquare size={s(15)} color={colors.success} />
                    <Text
                      style={{
                        color: "#111827",
                        fontSize: s(13),
                        fontWeight: "700",
                      }}
                    >
                      {getTicketItems(actionMenu.ticket).some((i) => i.recalled)
                        ? "Mark Done"
                        : "Bump Order"}
                    </Text>
                  </View>
                </Pressable>
              </View>
            );
          })()}
        </Pressable>
      )}

      {/* ─── KDS Settings Modal ─── */}
      {/* Settings are now accessed via the Settings button in the header,
          which opens the full KDS settings page (gated by manager PIN). */}

      {/* ─── PIN Modal ─── */}
      <PinInputModal
        isOpen={showPinModal}
        title="Manager PIN Required"
        subtitle={
          pendingBulkAction === "settings"
            ? "Enter a manager PIN to open Settings"
            : "Enter a manager PIN to perform bulk operations"
        }
        onConfirm={handlePinConfirm}
        onCancel={handlePinCancel}
      />
    </View>
  );
};

export default KitchenDisplayScreen;
