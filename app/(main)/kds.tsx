import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";
import { useToast } from "@/contexts/ToastContext";
import {
  getBucketedElapsed,
  getUrgencyLevel,
  useKDSTimer,
} from "@/hooks/useKDSTimer";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getDeviceId } from "@/lib/deviceId";
import { colors, URGENCY_COLORS, KDS_STATUS_TAB_COLORS } from "@/lib/theme";
import { clearStationData } from "@/services/cacheService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useKDSStore } from "@/stores/useKDSStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { KDSTicket, KDSTicketItem } from "@/types/kds";
import PinInputModal from "@/components/timeclock/PinInputModal";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  CheckSquare,
  ChefHat,
  CircleDotDashed,
  Clock,
  Flame,
  Layers,
  LogOut,
  RefreshCw,
  ShoppingBag,
  Square,
  Truck,
  UtensilsCrossed,
  Wifi,
  WifiOff,
} from "lucide-react-native";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Animated as RNAnimated,
  InteractionManager,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

// ─── Status Tab Config ────────────────────────────────────────────
type StatusFilter = "pending" | "cooking" | "ready";
type OrderTypeFilter = "all" | "delivery" | "takeout" | "dine_in";

const STATUS_TABS: { key: StatusFilter; label: string; color: string }[] = [
  { key: "pending", label: "Pending", color: KDS_STATUS_TAB_COLORS.pending },
  { key: "cooking", label: "Cooking", color: KDS_STATUS_TAB_COLORS.cooking },
  { key: "ready", label: "Served", color: KDS_STATUS_TAB_COLORS.ready },
];

const TYPE_TABS: { key: OrderTypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "delivery", label: "Delivery" },
  { key: "takeout", label: "To Go" },
  { key: "dine_in", label: "Dine-In" },
];

// ─── Urgency border colors by level (from theme) ────────────────
const URGENCY_BORDER_COLORS = URGENCY_COLORS;

// ─── Manager roles for bulk operations ──────────────────────────
const MANAGER_ROLES = ["merchant.manager", "merchant.admin", "merchant.owner"];

// ─── Memoized animation configs (avoid re-allocation per render) ─
const ENTER_ANIM = FadeIn.duration(200);
const EXIT_ANIM = FadeOut.duration(150);
const LAYOUT_ANIM = LinearTransition.duration(300);

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
          width: typeof width === "number" ? width : undefined,
          height,
          backgroundColor: colors.muted,
          borderRadius: 4,
          opacity,
        },
        style,
      ]}
    />
  );
};

const KDSSkeletonCard = () => (
  <View
    style={{
      margin: 4,
      borderRadius: 10,
      overflow: "hidden",
      backgroundColor: colors.skeleton,
      borderWidth: 2,
      borderColor: colors.border,
      height: 180,
    }}
  >
    <View
      style={{
        backgroundColor: colors.skeletonHighlight,
        paddingHorizontal: 10,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        flexDirection: "row",
        justifyContent: "space-between",
      }}
    >
      <View>
        <SkeletonBar width={80} height={18} style={{ marginBottom: 6 }} />
        <SkeletonBar width={60} height={12} />
      </View>
      <View style={{ alignItems: "flex-end" }}>
        <SkeletonBar width={40} height={14} style={{ marginBottom: 6 }} />
        <SkeletonBar width={50} height={14} />
      </View>
    </View>
    <View style={{ padding: 12, flex: 1 }}>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
        <SkeletonBar width={24} height={24} style={{ marginRight: 8, borderRadius: 4 }} />
        <SkeletonBar width={120} height={16} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
        <SkeletonBar width={24} height={24} style={{ marginRight: 8, borderRadius: 4 }} />
        <SkeletonBar width={100} height={16} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        <SkeletonBar width={24} height={24} style={{ marginRight: 8, borderRadius: 4 }} />
        <SkeletonBar width={140} height={16} />
      </View>
    </View>
  </View>
);

// ─── Order Type Helpers ───────────────────────────────────────────
function getOrderTypeLabel(type: string | null): string {
  const t = (type || "").toLowerCase();
  if (t === "delivery") return "DELIVERY";
  if (t === "takeout" || t === "to_go" || t === "to go") return "TO GO";
  return "DINE IN";
}

function getOrderTypeIcon(type: string | null) {
  const t = (type || "").toLowerCase();
  if (t === "delivery") return <Truck size={11} color={colors.orderTypeDelivery} />;
  if (t === "takeout" || t === "to_go" || t === "to go")
    return <ShoppingBag size={11} color={colors.orderTypeToGo} />;
  return <UtensilsCrossed size={11} color={colors.orderTypeDineIn} />;
}

function matchesTypeFilter(ticket: KDSTicket, filter: OrderTypeFilter): boolean {
  if (filter === "all") return true;
  const t = (ticket.order_type || "").toLowerCase();
  if (filter === "delivery") return t === "delivery";
  if (filter === "takeout") return t === "takeout" || t === "to_go" || t === "to go";
  // dine_in
  return t === "dine_in" || t === "dine in" || t === "" || !ticket.order_type;
}

// ─── Ticket Card ──────────────────────────────────────────────────
interface KDSTicketCardProps {
  ticket: KDSTicket;
  onAdvance: (ticketId: string, itemIds: string[], newStatus: "preparing" | "ready" | "served") => void;
  bulkMode: boolean;
  onToggleSelect: (id: string) => void;
}

const KDSTicketCard = React.memo<KDSTicketCardProps>(
  ({ ticket, onAdvance, bulkMode, onToggleSelect }) => {
    // Subscribe to own selection state via Zustand selector — only the toggled card re-renders
    const isSelected = useKDSStore(
      useCallback(
        (s) => s.selectedTicketIds.has(ticket.ticket_id),
        [ticket.ticket_id],
      ),
    );

    // Subscribe to timerTick via Zustand selector — only re-renders when bucketed string changes
    const timeElapsed = useKDSStore(
      useCallback(
        (s) => {
          void s.timerTick;
          return getBucketedElapsed(ticket.start_time);
        },
        [ticket.start_time],
      ),
    );

    // Urgency level — derived from timerTick, only changes at minute boundaries
    const urgencyLevel = useKDSStore(
      useCallback(
        (s) => {
          void s.timerTick;
          return getUrgencyLevel(ticket.start_time);
        },
        [ticket.start_time],
      ),
    );

    // Animation (Reanimated — runs entirely on UI thread)
    const scaleValue = useSharedValue(1);

    const scaleStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scaleValue.value }],
    }));

    const handlePress = () => {
      if (bulkMode) {
        onToggleSelect(ticket.ticket_id);
        return;
      }

      // Single tap → advance immediately
      const itemIds = ticket.items.map((i) => i.id);
      if (ticket.status === "pending") onAdvance(ticket.ticket_id, itemIds, "preparing");
      else if (ticket.status === "cooking") onAdvance(ticket.ticket_id, itemIds, "ready");
      else if (ticket.status === "ready") onAdvance(ticket.ticket_id, itemIds, "served");

      // Brief scale pulse feedback
      scaleValue.value = withSequence(
        withTiming(0.95, { duration: 50 }),
        withTiming(1, { duration: 70 }),
      );
    };

    const urgencyColor = URGENCY_BORDER_COLORS[urgencyLevel];
    const borderColor = bulkMode && isSelected ? colors.info : urgencyColor;
    const orderTypeLabel = getOrderTypeLabel(ticket.order_type);
    const orderTypeIcon = getOrderTypeIcon(ticket.order_type);
    const hasRush = ticket.items.some((item) => item.rush);

    return (
      <Pressable onPress={handlePress}>
        <Animated.View
          style={[
            {
              margin: 4,
              borderRadius: 10,
              overflow: "hidden",
              backgroundColor: colors.skeleton,
              borderWidth: 2,
              borderColor,
              shadowColor: borderColor,
              shadowOffset: { width: 0, height: 2 },
              shadowOpacity: 0.3,
              shadowRadius: 6,
              elevation: 4,
            },
            scaleStyle,
          ]}
        >
          {/* Bulk mode checkbox overlay */}
          {bulkMode && (
            <View
              style={{
                position: "absolute",
                top: 6,
                right: 6,
                zIndex: 10,
              }}
            >
              {isSelected ? (
                <CheckSquare size={20} color={colors.info} fill={colors.info} />
              ) : (
                <Square size={20} color={colors.label} />
              )}
            </View>
          )}

          {/* Rush badge */}
          {hasRush && (
            <View
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                right: 0,
                backgroundColor: colors.danger,
                paddingVertical: 2,
                zIndex: 5,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 4,
              }}
            >
              <AlertTriangle size={10} color="#fff" />
              <Text style={{ color: "#fff", fontSize: 10, fontWeight: "800", letterSpacing: 1 }}>
                RUSH
              </Text>
            </View>
          )}

          {/* Top bar with urgency color */}
          <View
            style={{
              backgroundColor: urgencyColor,
              paddingHorizontal: 10,
              paddingVertical: 6,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              marginTop: hasRush ? 16 : 0,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center" }}>
              <Clock size={12} color="#fff" />
              <Text
                style={{
                  color: "#fff",
                  fontSize: 13,
                  fontWeight: "700",
                  marginLeft: 4,
                }}
              >
                {timeElapsed}
              </Text>
            </View>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Text style={{ color: "#fff", fontSize: 11, fontWeight: "600" }}>
                {ticket.item_count} items
              </Text>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: "rgba(0,0,0,0.2)",
                  paddingHorizontal: 6,
                  paddingVertical: 2,
                  borderRadius: 4,
                }}
              >
                {orderTypeIcon}
                <Text style={{ color: "#fff", fontSize: 10, marginLeft: 3, fontWeight: "600" }}>
                  {orderTypeLabel}
                </Text>
              </View>
            </View>
          </View>

          {/* Order info */}
          <View
            style={{
              backgroundColor: colors.skeletonHighlight,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }} numberOfLines={1}>
                {ticket.display_number || ticket.order_number?.slice(-4) || "----"}
                {ticket.course_number > 1 && (
                  <Text style={{ color: colors.warning }}> C{ticket.course_number}</Text>
                )}
              </Text>
              {ticket.table_name && (
                <Text style={{ color: colors.label, fontSize: 12 }}>{ticket.table_name}</Text>
              )}
            </View>
          </View>

          {/* Items list */}
          <View style={{ padding: 8, backgroundColor: colors.screen }}>
            {ticket.items.map((item: KDSTicketItem, index: number) => (
              <View
                key={item.id}
                style={index < ticket.items.length - 1 ? { marginBottom: 4 } : undefined}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <View
                    style={{
                      backgroundColor: colors.border,
                      width: 22,
                      height: 22,
                      borderRadius: 4,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 6,
                    }}
                  >
                    <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                      {item.quantity}
                    </Text>
                  </View>
                  <Text
                    style={{ color: "#fff", fontSize: 13, fontWeight: "500", flex: 1 }}
                    numberOfLines={1}
                  >
                    {item.name}
                  </Text>
                </View>
                {/* Modifiers */}
                {item.modifiers.length > 0 &&
                  item.modifiers.map((mod, mi) => {
                    const isRemoval =
                      mod.modifier_group_name?.toLowerCase().includes("remove") ||
                      mod.modifier_name?.toLowerCase().startsWith("no ");
                    return (
                      <Text
                        key={`${item.id}_m${mi}`}
                        style={{
                          color: isRemoval ? colors.danger : colors.success,
                          fontSize: 11,
                          marginLeft: 28,
                          marginTop: 1,
                        }}
                      >
                        {isRemoval ? "- " : "+ "}
                        {mod.modifier_name}
                      </Text>
                    );
                  })}
                {/* Special instructions */}
                {item.special_instructions && (
                  <Text
                    style={{
                      color: colors.warning,
                      fontSize: 11,
                      fontStyle: "italic",
                      marginLeft: 28,
                      marginTop: 1,
                    }}
                    numberOfLines={2}
                  >
                    "{item.special_instructions}"
                  </Text>
                )}
              </View>
            ))}
          </View>

          {/* Customer name footer */}
          {ticket.customer_name && (
            <View
              style={{
                backgroundColor: colors.screen,
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderTopWidth: 1,
                borderTopColor: colors.border,
              }}
            >
              <Text style={{ color: colors.label, fontSize: 11 }} numberOfLines={1}>
                {ticket.customer_name}
              </Text>
            </View>
          )}
        </Animated.View>
      </Pressable>
    );
  },
  (prev, next) =>
    prev.ticket === next.ticket &&
    prev.onAdvance === next.onAdvance &&
    prev.bulkMode === next.bulkMode &&
    prev.onToggleSelect === next.onToggleSelect,
);

// ─── Main Screen ──────────────────────────────────────────────────
const KitchenDisplayScreen = () => {
  const router = useRouter();
  const supabase = useSupabaseClient();
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const locationId = selectedStore?.id;
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const stationSessionId = useStoreSettingsStore((s) => s.stationSessionId);
  const clearStationSession = useStoreSettingsStore((s) => s.clearStationSession);
  const kdsAutoFireEnabled = useStoreSettingsStore((s) => s.kdsAutoFireEnabled);
  const kdsAutoFireDelayMinutes = useStoreSettingsStore((s) => s.kdsAutoFireDelayMinutes);

  const tickets = useKDSStore((s) => s.tickets);
  const counts = useKDSStore((s) => s.counts);
  const isInitialLoading = useKDSStore((s) => s.isInitialLoading);
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
  const selectedTicketIds = useKDSStore((s) => s.selectedTicketIds);
  const toggleBulkMode = useKDSStore((s) => s.toggleBulkMode);
  const toggleTicketSelection = useKDSStore((s) => s.toggleTicketSelection);
  const selectAllVisible = useKDSStore((s) => s.selectAllVisible);
  const clearSelection = useKDSStore((s) => s.clearSelection);
  const bulkAdvanceTickets = useKDSStore((s) => s.bulkAdvanceTickets);

  // Realtime connection status for adaptive polling
  const { orders: ordersChannel } = useLocationRealtime();
  const isRealtimeConnected = ordersChannel.isConnected;

  // Employee + toast for PIN verification
  const findEmployeeByPin = useEmployeeStore((s) => s.findEmployeeByPin);
  const toast = useToast();

  const [activeStatus, setActiveStatus] = useState<StatusFilter>("pending");
  const [activeType, setActiveType] = useState<OrderTypeFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showDisconnected, setShowDisconnected] = useState(false);

  // PIN modal state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<"selected" | "all" | null>(null);

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
    router.replace("/pin-login");
  }, [stationSessionId, selectedStore?.id, supabase, clearStationSession, router]);

  // Subscribe to all 3 status arrays — all 3 FlatLists are always mounted
  const pendingTickets = useKDSStore((s) => s.ticketsByStatus.pending);
  const cookingTickets = useKDSStore((s) => s.ticketsByStatus.cooking);
  const readyTickets = useKDSStore((s) => s.ticketsByStatus.ready);

  // Start the single global timer
  useKDSTimer();

  // Initialize KDS display config for this station
  useEffect(() => {
    if (selectedStation?.id) {
      fetchKDSDisplay(selectedStation.id);
    }
  }, [selectedStation?.id, fetchKDSDisplay]);

  // Dynamic column count from KDS display config
  const columnCount = kdsDisplayConfig?.columns ?? 4;

  // Deferred loading after navigation animation
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });
    return () => handle.cancel();
  }, []);

  // Track realtime connection in a ref to avoid polling teardown on flaps
  const isRealtimeConnectedRef = useRef(isRealtimeConnected);
  const prevRealtimeConnectedRef = useRef(isRealtimeConnected);
  useEffect(() => {
    isRealtimeConnectedRef.current = isRealtimeConnected;
  }, [isRealtimeConnected]);

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
  useEffect(() => {
    if (!isReady || !locationId) return;

    fetchTickets(locationId);

    let timeoutId: ReturnType<typeof setTimeout>;
    const schedulePoll = () => {
      const interval = isRealtimeConnectedRef.current ? 120_000 : 15_000;
      timeoutId = setTimeout(() => {
        backgroundFetchTickets(locationId);
        schedulePoll();
      }, interval);
    };
    schedulePoll();

    return () => clearTimeout(timeoutId);
  }, [isReady, locationId, fetchTickets, backgroundFetchTickets]);

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

      pendingTickets.forEach((ticket) => {
        if (!ticket.start_time) return;
        const elapsed = now - new Date(ticket.start_time).getTime();
        if (elapsed >= delayMs) {
          advanceTicketStatus(
            ticket.ticket_id,
            ticket.items.map((i) => i.id),
            "preparing",
          );
        }
      });
    }, 15_000);

    return () => clearInterval(intervalId);
  }, [kdsAutoFireEnabled, kdsAutoFireDelayMinutes, pendingTickets, isReady, advanceTicketStatus]);

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

  const filteredByStatus: Record<StatusFilter, KDSTicket[]> = useMemo(
    () => ({ pending: filteredPending, cooking: filteredCooking, ready: filteredReady }),
    [filteredPending, filteredCooking, filteredReady],
  );

  // Active tab's filtered data — for bulk actions / select-all
  const activeFilteredTickets = filteredByStatus[activeStatus];

  // Type counts for badge display (active tab only)
  const activeRawTickets =
    activeStatus === "pending" ? pendingTickets
    : activeStatus === "cooking" ? cookingTickets
    : readyTickets;

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
      else if (ot === "takeout" || ot === "to_go" || ot === "to go") result.takeout++;
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
  const handleBulkAction = useCallback((action: "selected" | "all") => {
    setPendingBulkAction(action);
    setShowPinModal(true);
  }, []);

  const handlePinConfirm = useCallback(
    async (pin: string) => {
      const employee = await findEmployeeByPin(pin);
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
          message: "Only managers can perform bulk operations.",
          type: "error",
        });
        return;
      }

      // PIN is valid and employee is a manager — execute bulk action
      setShowPinModal(false);

      const ticketIdsToAdvance =
        pendingBulkAction === "all"
          ? activeFilteredTickets.map((t) => t.ticket_id)
          : Array.from(selectedTicketIds);

      if (ticketIdsToAdvance.length === 0) {
        toast.show({
          title: "No Tickets",
          message: "No tickets to advance.",
          type: "warning",
        });
        setPendingBulkAction(null);
        return;
      }

      bulkAdvanceTickets(ticketIdsToAdvance, locationId || "");

      toast.show({
        title: "Bulk Advance",
        message: `${ticketIdsToAdvance.length} ticket(s) advanced by ${employee.fullName}.`,
        type: "success",
      });
      setPendingBulkAction(null);
    },
    [findEmployeeByPin, pendingBulkAction, activeFilteredTickets, selectedTicketIds, bulkAdvanceTickets, locationId, toast],
  );

  const handlePinCancel = useCallback(() => {
    setShowPinModal(false);
    setPendingBulkAction(null);
  }, []);

  const handleSelectAll = useCallback(() => {
    selectAllVisible(activeFilteredTickets.map((t) => t.ticket_id));
  }, [selectAllVisible, activeFilteredTickets]);

  // ─── Render Helpers ─────────────────────────────────────────────
  const columnWidthPct = `${100 / columnCount}%` as const;
  const renderItem = useCallback(
    ({ item }: { item: KDSTicket }) => (
      <Animated.View
        style={{ width: columnWidthPct, paddingHorizontal: 2 }}
        entering={ENTER_ANIM}
        exiting={EXIT_ANIM}
      >
        <KDSTicketCard
          ticket={item}
          onAdvance={advanceTicketStatus}
          bulkMode={bulkMode}
          onToggleSelect={toggleTicketSelection}
        />
      </Animated.View>
    ),
    [advanceTicketStatus, bulkMode, toggleTicketSelection, columnWidthPct],
  );

  const keyExtractor = useCallback((item: KDSTicket) => item.ticket_id, []);

  // Skeleton grid for loading state
  const renderSkeletons = () => (
    <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", padding: 4 }}>
      {Array.from({ length: columnCount * 4 }).map((_, i) => (
        <View key={`skel-${i}`} style={{ width: columnWidthPct, paddingHorizontal: 2 }}>
          <KDSSkeletonCard />
        </View>
      ))}
    </View>
  );

  const selectionCount = selectedTicketIds.size;

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* ─── Header ─── */}
      <View
        style={{
          backgroundColor: colors.panel,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        {/* Top row: title + bulk toggle + refresh */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <ChefHat size={24} color={colors.teal} />
            <Text style={{ color: colors.heading, fontSize: 18, fontWeight: "700", marginLeft: 10 }}>
              Kitchen Display
            </Text>
            {showDisconnected ? (
              <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 8 }}>
                <WifiOff size={14} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 11, fontWeight: "600", marginLeft: 4 }}>
                  Reconnecting...
                </Text>
              </View>
            ) : (
              <Wifi size={14} color={colors.success} style={{ marginLeft: 8 }} />
            )}
            {/* KDS Display Badge */}
            {displayName && (
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  backgroundColor: colors.skeletonHighlight,
                  paddingHorizontal: 10,
                  paddingVertical: 4,
                  borderRadius: 12,
                  marginLeft: 12,
                }}
              >
                <Flame size={13} color={colors.urgencyElevated} />
                <Text
                  style={{
                    color: colors.heading,
                    fontSize: 12,
                    fontWeight: "600",
                    marginLeft: 4,
                  }}
                  numberOfLines={1}
                >
                  {displayName}
                </Text>
                {routingMode === "all" ? (
                  <>
                    <View
                      style={{
                        width: 1,
                        height: 14,
                        backgroundColor: colors.muted,
                        marginHorizontal: 8,
                      }}
                    />
                    <Text
                      style={{
                        color: colors.success,
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      EXPO
                    </Text>
                  </>
                ) : enrichedRules.length > 0 ? (
                  <>
                    <View
                      style={{
                        width: 1,
                        height: 14,
                        backgroundColor: colors.muted,
                        marginHorizontal: 8,
                      }}
                    />
                    <CircleDotDashed size={12} color={colors.label} />
                    <Text
                      style={{
                        color: colors.label,
                        fontSize: 11,
                        fontWeight: "500",
                        marginLeft: 4,
                      }}
                      numberOfLines={1}
                    >
                      {enrichedRules.map((r) => r.label).join(", ")}
                    </Text>
                  </>
                ) : null}
              </View>
            )}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* Bulk mode toggle */}
            <TouchableOpacity
              onPress={toggleBulkMode}
              style={{
                padding: 8,
                backgroundColor: bulkMode ? colors.info : colors.skeletonHighlight,
                borderRadius: 8,
              }}
            >
              <Layers size={18} color={bulkMode ? "#fff" : colors.label} />
            </TouchableOpacity>
            {/* Refresh */}
            <TouchableOpacity
              onPress={onRefresh}
              style={{
                padding: 8,
                backgroundColor: colors.skeletonHighlight,
                borderRadius: 8,
              }}
            >
              <RefreshCw
                size={18}
                color={isFetching ? colors.teal : colors.label}
                style={refreshing ? { opacity: 0.5 } : undefined}
              />
            </TouchableOpacity>
            {/* Logout */}
            <TouchableOpacity
              onPress={handleKDSLogout}
              style={{
                padding: 8,
                backgroundColor: colors.skeletonHighlight,
                borderRadius: 8,
              }}
            >
              <LogOut size={18} color={colors.label} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Filter rows */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          {/* Status tabs */}
          <View style={{ flexDirection: "row", gap: 6 }}>
            {STATUS_TABS.map((tab) => {
              const isActive = activeStatus === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => handleSetActiveStatus(tab.key)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: isActive ? tab.color : colors.skeletonHighlight,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? "#fff" : colors.label,
                      fontSize: 13,
                      fontWeight: isActive ? "700" : "500",
                    }}
                  >
                    {tab.label}
                  </Text>
                  <View
                    style={{
                      backgroundColor: isActive ? "rgba(255,255,255,0.25)" : colors.border,
                      paddingHorizontal: 6,
                      paddingVertical: 1,
                      borderRadius: 8,
                      marginLeft: 6,
                      minWidth: 22,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        color: isActive ? "#fff" : colors.label,
                        fontSize: 11,
                        fontWeight: "700",
                        opacity: isFetching ? 0.7 : 1,
                      }}
                    >
                      {counts[tab.key]}
                    </Text>
                  </View>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Order type filters */}
          <View style={{ flexDirection: "row", gap: 4 }}>
            {TYPE_TABS.map((tab) => {
              const isActive = activeType === tab.key;
              const count = typeCounts[tab.key];
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveType(tab.key)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 5,
                    borderRadius: 6,
                    backgroundColor: isActive ? colors.info : colors.skeleton,
                    borderWidth: 1,
                    borderColor: isActive ? colors.info : colors.border,
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? "#fff" : colors.label,
                      fontSize: 12,
                      fontWeight: isActive ? "600" : "400",
                    }}
                  >
                    {tab.label}
                  </Text>
                  {tab.key !== "all" && count > 0 && (
                    <View
                      style={{
                        backgroundColor: isActive ? "rgba(255,255,255,0.2)" : colors.border,
                        paddingHorizontal: 4,
                        borderRadius: 6,
                        marginLeft: 4,
                      }}
                    >
                      <Text style={{ color: "#fff", fontSize: 10, fontWeight: "600" }}>
                        {count}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>

      {/* ─── Bulk Action Bar ─── */}
      {bulkMode && (
        <View
          style={{
            backgroundColor: colors.skeleton,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingHorizontal: 16,
            paddingVertical: 8,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Text style={{ color: colors.label, fontSize: 13 }}>
              {selectionCount} selected
            </Text>
            <TouchableOpacity
              onPress={handleSelectAll}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: colors.skeletonHighlight,
                borderRadius: 6,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Select All</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={clearSelection}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: colors.skeletonHighlight,
                borderRadius: 6,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600" }}>Clear</Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TouchableOpacity
              onPress={() => handleBulkAction("selected")}
              disabled={selectionCount === 0}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: selectionCount > 0 ? colors.info : colors.skeletonHighlight,
                borderRadius: 6,
                opacity: selectionCount > 0 ? 1 : 0.5,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                Advance Selected
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleBulkAction("all")}
              disabled={activeFilteredTickets.length === 0}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor: activeFilteredTickets.length > 0 ? colors.danger : colors.skeletonHighlight,
                borderRadius: 6,
                opacity: activeFilteredTickets.length > 0 ? 1 : 0.5,
              }}
            >
              <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>
                Advance All in Tab
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── Grid: 3 pre-mounted FlatLists stacked ─── */}
      {!isReady || isInitialLoading ? (
        renderSkeletons()
      ) : (
        <View style={{ flex: 1, position: "relative" }}>
          {(["pending", "cooking", "ready"] as const).map((status) => {
            const isActive = activeStatus === status;
            return (
              <View
                key={status}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  opacity: isActive ? 1 : 0,
                  zIndex: isActive ? 1 : 0,
                }}
                pointerEvents={isActive ? "auto" : "none"}
              >
                <Animated.FlatList
                  key={columnCount}
                  data={filteredByStatus[status]}
                  keyExtractor={keyExtractor}
                  renderItem={renderItem}
                  numColumns={columnCount}
                  itemLayoutAnimation={LAYOUT_ANIM}
                  contentContainerStyle={{ padding: 4, paddingBottom: 20 }}
                  initialNumToRender={16}
                  maxToRenderPerBatch={8}
                  windowSize={5}
                  removeClippedSubviews={false}
                  extraData={bulkMode}
                  ListEmptyComponent={
                    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
                      <Text style={{ color: colors.muted, fontSize: 14 }}>
                        No {status} tickets
                      </Text>
                    </View>
                  }
                />
              </View>
            );
          })}
        </View>
      )}

      {/* ─── PIN Modal ─── */}
      <PinInputModal
        isOpen={showPinModal}
        title="Manager PIN Required"
        subtitle="Enter a manager PIN to perform bulk operations"
        onConfirm={handlePinConfirm}
        onCancel={handlePinCancel}
      />
    </View>
  );
};

export default KitchenDisplayScreen;
