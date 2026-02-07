import {
  getBucketedElapsed,
  getUrgencyLevel,
  useKDSTimer,
} from "@/hooks/useKDSTimer";
import { useKDSStore } from "@/stores/useKDSStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { KDSTicket, KDSTicketItem } from "@/types/kds";
import {
  ChefHat,
  Clock,
  RefreshCw,
  ShoppingBag,
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
  Animated,
  FlatList,
  InteractionManager,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ─── Status Tab Config ────────────────────────────────────────────
type StatusFilter = "pending" | "cooking" | "ready";
type OrderTypeFilter = "all" | "delivery" | "takeout" | "dine_in";

const STATUS_TABS: { key: StatusFilter; label: string; color: string }[] = [
  { key: "pending", label: "Pending", color: "#d97706" },
  { key: "cooking", label: "Cooking", color: "#ea580c" },
  { key: "ready", label: "Served", color: "#16a34a" },
];

const TYPE_TABS: { key: OrderTypeFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "delivery", label: "Delivery" },
  { key: "takeout", label: "To Go" },
  { key: "dine_in", label: "Dine-In" },
];

// ─── Urgency border colors by level ──────────────────────────────
const URGENCY_BORDER_COLORS = ["#22c55e", "#eab308", "#f97316", "#ef4444"];

// ─── Fixed card height for getItemLayout optimization ───────────
const CARD_HEIGHT = 260;

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
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
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
    <Animated.View
      style={[
        {
          width: typeof width === "number" ? width : undefined,
          height,
          backgroundColor: "#4B5563",
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
      backgroundColor: "#2a2a2e",
      borderWidth: 2,
      borderColor: "#444",
      height: 180,
    }}
  >
    <View
      style={{
        backgroundColor: "#333338",
        paddingHorizontal: 10,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: "#444",
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
  if (t === "delivery") return <Truck size={11} color="#22c55e" />;
  if (t === "takeout" || t === "to_go" || t === "to go")
    return <ShoppingBag size={11} color="#3b82f6" />;
  return <UtensilsCrossed size={11} color="#d97706" />;
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
}

const KDSTicketCard = React.memo<KDSTicketCardProps>(
  ({ ticket, onAdvance }) => {
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

    // Double-tap detection
    const lastTapRef = useRef<number>(0);
    const DOUBLE_TAP_DELAY = 350;
    const firstTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Animations
    const scaleAnim = useRef(new Animated.Value(1)).current;
    const opacityAnim = useRef(new Animated.Value(1)).current;

    useEffect(() => {
      return () => {
        if (firstTapTimeoutRef.current) clearTimeout(firstTapTimeoutRef.current);
      };
    }, []);

    const triggerFirstTapFeedback = () => {
      Animated.sequence([
        Animated.timing(opacityAnim, {
          toValue: 0.7,
          duration: 100,
          useNativeDriver: true,
        }),
        Animated.timing(opacityAnim, {
          toValue: 0.85,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();

      if (firstTapTimeoutRef.current) clearTimeout(firstTapTimeoutRef.current);
      firstTapTimeoutRef.current = setTimeout(() => {
        Animated.timing(opacityAnim, {
          toValue: 1,
          duration: 150,
          useNativeDriver: true,
        }).start();
      }, 400);
    };

    const triggerDoubleTapAnimation = () => {
      if (firstTapTimeoutRef.current) clearTimeout(firstTapTimeoutRef.current);
      opacityAnim.setValue(1);
      Animated.sequence([
        Animated.timing(scaleAnim, {
          toValue: 0.96,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1.02,
          duration: 60,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 80,
          useNativeDriver: true,
        }),
      ]).start();
    };

    const handleDoubleTap = () => {
      const now = Date.now();
      const itemIds = ticket.items.map((i) => i.id);
      if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
        triggerDoubleTapAnimation();
        if (ticket.status === "pending") onAdvance(ticket.ticket_id, itemIds, "preparing");
        else if (ticket.status === "cooking") onAdvance(ticket.ticket_id, itemIds, "ready");
        else if (ticket.status === "ready") onAdvance(ticket.ticket_id, itemIds, "served");
        lastTapRef.current = 0;
      } else {
        triggerFirstTapFeedback();
        lastTapRef.current = now;
      }
    };

    const urgencyLevel = getUrgencyLevel(ticket.start_time);
    const urgencyColor = URGENCY_BORDER_COLORS[urgencyLevel];
    const orderTypeLabel = getOrderTypeLabel(ticket.order_type);
    const orderTypeIcon = getOrderTypeIcon(ticket.order_type);

    return (
      <TouchableOpacity activeOpacity={1} onPress={handleDoubleTap}>
        <Animated.View
          style={{
            margin: 4,
            borderRadius: 10,
            overflow: "hidden",
            backgroundColor: "#2a2a2e",
            borderWidth: 2,
            borderColor: urgencyColor,
            shadowColor: urgencyColor,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 6,
            elevation: 4,
            height: CARD_HEIGHT - 8,
            transform: [{ scale: scaleAnim }],
            opacity: opacityAnim,
          }}
        >
          {/* Top bar with urgency color */}
          <View
            style={{
              backgroundColor: urgencyColor,
              paddingHorizontal: 10,
              paddingVertical: 6,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
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
              backgroundColor: "#333338",
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderBottomWidth: 1,
              borderBottomColor: "#444",
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700" }} numberOfLines={1}>
                {ticket.display_number || ticket.order_number?.slice(-4) || "----"}
                {ticket.course_number > 1 && (
                  <Text style={{ color: "#fbbf24" }}> C{ticket.course_number}</Text>
                )}
              </Text>
              {ticket.table_name && (
                <Text style={{ color: "#9ca3af", fontSize: 12 }}>{ticket.table_name}</Text>
              )}
            </View>
          </View>

          {/* Items list */}
          <View style={{ padding: 8, backgroundColor: "#252528" }}>
            {ticket.items.slice(0, 6).map((item: KDSTicketItem, index: number) => (
              <View
                key={item.id}
                style={index < Math.min(ticket.items.length - 1, 5) ? { marginBottom: 4 } : undefined}
              >
                <View style={{ flexDirection: "row", alignItems: "flex-start" }}>
                  <View
                    style={{
                      backgroundColor: "#3a3a40",
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
                          color: isRemoval ? "#ef4444" : "#4ade80",
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
                      color: "#eab308",
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
            {ticket.items.length > 6 && (
              <Text style={{ color: "#6b7280", fontSize: 11, textAlign: "center", marginTop: 4 }}>
                +{ticket.items.length - 6} more items
              </Text>
            )}
          </View>

          {/* Customer name footer */}
          {ticket.customer_name && (
            <View
              style={{
                backgroundColor: "#1f1f22",
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderTopWidth: 1,
                borderTopColor: "#333",
              }}
            >
              <Text style={{ color: "#9ca3af", fontSize: 11 }} numberOfLines={1}>
                {ticket.customer_name}
              </Text>
            </View>
          )}
        </Animated.View>
      </TouchableOpacity>
    );
  },
  (prev, next) =>
    prev.ticket === next.ticket && prev.onAdvance === next.onAdvance,
);

// ─── Main Screen ──────────────────────────────────────────────────
const KitchenDisplayScreen = () => {
  const locationId = useStoreSettingsStore((s) => s.selectedStore?.id);
  const kdsAutoFireEnabled = useStoreSettingsStore((s) => s.kdsAutoFireEnabled);
  const kdsAutoFireDelayMinutes = useStoreSettingsStore((s) => s.kdsAutoFireDelayMinutes);

  const tickets = useKDSStore((s) => s.tickets);
  const ticketsByStatus = useKDSStore((s) => s.ticketsByStatus);
  const counts = useKDSStore((s) => s.counts);
  const isLoading = useKDSStore((s) => s.isLoading);
  const fetchTickets = useKDSStore((s) => s.fetchTickets);
  const advanceTicketStatus = useKDSStore((s) => s.advanceTicketStatus);
  const scheduleRefetch = useKDSStore((s) => s.scheduleRefetch);

  const [activeStatus, setActiveStatus] = useState<StatusFilter>("pending");
  const [activeType, setActiveType] = useState<OrderTypeFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [isReady, setIsReady] = useState(false);

  // Start the single global timer
  useKDSTimer();

  // Deferred loading after navigation animation
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setIsReady(true);
    });
    return () => handle.cancel();
  }, []);

  // Initial fetch + 120s polling fallback (realtime is now primary sync)
  useEffect(() => {
    if (!isReady || !locationId) return;

    fetchTickets(locationId);

    const pollId = setInterval(() => {
      fetchTickets(locationId);
    }, 120_000);

    return () => clearInterval(pollId);
  }, [isReady, locationId, fetchTickets]);

  // Auto-fire: pending → cooking after configured delay
  useEffect(() => {
    if (!kdsAutoFireEnabled || !isReady) return;

    const intervalId = setInterval(() => {
      const now = Date.now();
      const delayMs = kdsAutoFireDelayMinutes * 60 * 1000;

      ticketsByStatus.pending.forEach((ticket) => {
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
  }, [kdsAutoFireEnabled, kdsAutoFireDelayMinutes, ticketsByStatus.pending, isReady, advanceTicketStatus]);

  // Filter tickets by active status tab + order type
  const filteredTickets = useMemo(() => {
    const statusTickets = ticketsByStatus[activeStatus] || [];
    if (activeType === "all") return statusTickets;
    return statusTickets.filter((t) => matchesTypeFilter(t, activeType));
  }, [ticketsByStatus, activeStatus, activeType]);

  // Type counts for badge display
  const typeCounts = useMemo(() => {
    const statusTickets = ticketsByStatus[activeStatus] || [];
    const result: Record<OrderTypeFilter, number> = {
      all: statusTickets.length,
      delivery: 0,
      takeout: 0,
      dine_in: 0,
    };
    for (const t of statusTickets) {
      const ot = (t.order_type || "").toLowerCase();
      if (ot === "delivery") result.delivery++;
      else if (ot === "takeout" || ot === "to_go" || ot === "to go") result.takeout++;
      else result.dine_in++;
    }
    return result;
  }, [ticketsByStatus, activeStatus]);

  const handleAdvance = useCallback(
    (ticketId: string, itemIds: string[], newStatus: "preparing" | "ready" | "served") => {
      advanceTicketStatus(ticketId, itemIds, newStatus);
      // Schedule a refetch to sync with server after optimistic update
      if (locationId) {
        scheduleRefetch(locationId);
      }
    },
    [advanceTicketStatus, scheduleRefetch, locationId],
  );

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

  const renderItem = useCallback(
    ({ item }: { item: KDSTicket }) => (
      <View style={{ width: "25%", paddingHorizontal: 2 }}>
        <KDSTicketCard
          ticket={item}
          onAdvance={handleAdvance}
        />
      </View>
    ),
    [handleAdvance],
  );

  const getItemLayout = useCallback(
    (_: any, index: number) => ({
      length: CARD_HEIGHT,
      offset: CARD_HEIGHT * index,
      index,
    }),
    [],
  );

  const keyExtractor = useCallback((item: KDSTicket) => item.ticket_id, []);

  // Skeleton grid for loading state
  const renderSkeletons = () => (
    <View style={{ flex: 1, flexDirection: "row", flexWrap: "wrap", padding: 4 }}>
      {Array.from({ length: 16 }).map((_, i) => (
        <View key={`skel-${i}`} style={{ width: "25%", paddingHorizontal: 2 }}>
          <KDSSkeletonCard />
        </View>
      ))}
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#1a1a1a" }}>
      {/* ─── Header ─── */}
      <View
        style={{
          backgroundColor: "#222225",
          borderBottomWidth: 1,
          borderBottomColor: "#333",
          paddingHorizontal: 16,
          paddingVertical: 10,
        }}
      >
        {/* Top row: title + refresh */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center" }}>
            <ChefHat size={24} color="#3b82f6" />
            <Text style={{ color: "#fff", fontSize: 18, fontWeight: "700", marginLeft: 10 }}>
              Kitchen Display
            </Text>
          </View>
          <TouchableOpacity
            onPress={onRefresh}
            style={{
              padding: 8,
              backgroundColor: "#333338",
              borderRadius: 8,
            }}
          >
            <RefreshCw
              size={18}
              color="#9CA3AF"
              style={refreshing ? { opacity: 0.5 } : undefined}
            />
          </TouchableOpacity>
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
                  onPress={() => setActiveStatus(tab.key)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 6,
                    borderRadius: 20,
                    backgroundColor: isActive ? tab.color : "#333338",
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? "#fff" : "#9ca3af",
                      fontSize: 13,
                      fontWeight: isActive ? "700" : "500",
                    }}
                  >
                    {tab.label}
                  </Text>
                  <View
                    style={{
                      backgroundColor: isActive ? "rgba(255,255,255,0.25)" : "#444",
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
                        color: isActive ? "#fff" : "#9ca3af",
                        fontSize: 11,
                        fontWeight: "700",
                      }}
                    >
                      {isLoading ? "-" : counts[tab.key]}
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
                    backgroundColor: isActive ? "#3b82f6" : "#2a2a2e",
                    borderWidth: 1,
                    borderColor: isActive ? "#3b82f6" : "#444",
                    flexDirection: "row",
                    alignItems: "center",
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? "#fff" : "#9ca3af",
                      fontSize: 12,
                      fontWeight: isActive ? "600" : "400",
                    }}
                  >
                    {tab.label}
                  </Text>
                  {tab.key !== "all" && count > 0 && (
                    <View
                      style={{
                        backgroundColor: isActive ? "rgba(255,255,255,0.2)" : "#444",
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

      {/* ─── Grid ─── */}
      {!isReady || (isLoading && tickets.length === 0) ? (
        renderSkeletons()
      ) : (
        <FlatList
          data={filteredTickets}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          getItemLayout={getItemLayout}
          numColumns={4}
          contentContainerStyle={{ padding: 4, paddingBottom: 20 }}
          initialNumToRender={16}
          maxToRenderPerBatch={8}
          windowSize={3}
          removeClippedSubviews={true}
          ListEmptyComponent={
            <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
              <Text style={{ color: "#6b7280", fontSize: 14 }}>
                No {activeStatus} tickets
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
};

export default KitchenDisplayScreen;
