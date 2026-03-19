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
import { colors, URGENCY_COLORS, KDS_STATUS_TAB_COLORS } from "@/lib/theme";
import { clearStationData } from "@/services/cacheService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useKDSStore } from "@/stores/useKDSStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import KDSSoundService, { DEFAULT_SOUND_CONFIG } from "@/services/kds/kdsSoundService";
import KDSSettingsModal from "@/components/kds/KDSSettingsModal";
import { KDSTicket, KDSTicketItem } from "@/types/kds";
import PinInputModal from "@/components/timeclock/PinInputModal";
import { replaceRoute } from "@/lib/rootNavigation";
import { useRouter } from "expo-router";
import {
  AlertTriangle,
  ArrowUpToLine,
  CheckSquare,
  ChefHat,
  CircleDotDashed,
  Clock,
  Eye,
  EyeOff,
  Flame,
  Layers,
  LogOut,
  RefreshCw,
  RotateCcw,
  Settings,
  ShoppingBag,
  Square,
  Star,
  Truck,
  Globe,
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
  GestureResponderEvent,
  InteractionManager,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

// ─── Status Tab Config ────────────────────────────────────────────
type StatusFilter = "pending" | "cooking" | "ready" | "done";
type OrderTypeFilter = "all" | "delivery" | "takeout" | "dine_in";

const STATUS_TABS: { key: StatusFilter; label: string; color: string }[] = [
  { key: "pending", label: "Pending", color: KDS_STATUS_TAB_COLORS.pending },
  { key: "cooking", label: "Cooking", color: KDS_STATUS_TAB_COLORS.cooking },
  { key: "ready", label: "Served", color: KDS_STATUS_TAB_COLORS.ready },
  { key: "done", label: "Done", color: KDS_STATUS_TAB_COLORS.done },
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

// ─── Display Settings Interface ───────────────────────────────────
interface KDSTicketDisplaySettings {
  highlightNotes: boolean;
  itemNameLines: number; // 0 = unlimited
  modifierGroupName: 'for_group_priced' | 'always' | 'never';
  exclusionsAtTop: boolean;
  alphabeticalSort: boolean;
  aggregateIdenticalItems: boolean;
}

// ─── Ticket Card ──────────────────────────────────────────────────
interface KDSTicketCardProps {
  ticket: KDSTicket;
  onAdvance: (ticketId: string, itemIds: string[], newStatus: "preparing" | "ready" | "served") => void;
  bulkMode: boolean;
  onToggleSelect: (id: string) => void;
  onLongPress?: (ticketId: string, ticket: KDSTicket, event: GestureResponderEvent) => void;
  onItemPress?: (ticketId: string, itemId: string) => void;
  hideDoneItems: boolean;
  displaySettings: KDSTicketDisplaySettings;
  urgencyThresholds: UrgencyThresholds;
}

const KDSTicketCard = React.memo<KDSTicketCardProps>(
  ({ ticket, onAdvance, bulkMode, onToggleSelect, onLongPress, onItemPress, hideDoneItems, displaySettings, urgencyThresholds }) => {
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
          return getBucketedElapsed(ticket.start_time_epoch);
        },
        [ticket.start_time_epoch],
      ),
    );

    // Urgency level — derived from timerTick, only changes at minute boundaries
    const urgencyLevel = useKDSStore(
      useCallback(
        (s) => {
          void s.timerTick;
          return getUrgencyLevel(ticket.start_time_epoch, urgencyThresholds);
        },
        [ticket.start_time_epoch, urgencyThresholds],
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

    const handleLongPress = (e: GestureResponderEvent) => {
      if (bulkMode) return;
      onLongPress?.(ticket.ticket_id, ticket, e);
    };

    const urgencyColor = URGENCY_BORDER_COLORS[urgencyLevel];
    const borderColor = bulkMode && isSelected
      ? colors.info
      : ticket.prioritized
        ? "#f59e0b" // amber for prioritized
        : urgencyColor;
    const orderTypeLabel = getOrderTypeLabel(ticket.order_type);
    const orderTypeIcon = getOrderTypeIcon(ticket.order_type);
    const hasRush = ticket.items.some((item) => item.rush);

    // Filter/track done items + apply display settings
    const doneItemCount = ticket.items.filter((i) => i.kitchen_status === "ready").length;
    let processedItems = hideDoneItems
      ? ticket.items.filter((i) => i.kitchen_status !== "ready")
      : [...ticket.items];

    // Aggregate identical items (same name + modifiers + notes)
    if (displaySettings.aggregateIdenticalItems) {
      const aggregated: (KDSTicketItem & { _aggregatedIds?: string[] })[] = [];
      const keyMap = new Map<string, number>();
      for (const item of processedItems) {
        const modKey = item.modifiers.map((m) => m.modifier_name).sort().join("|");
        const key = `${item.name}__${modKey}__${item.special_instructions ?? ""}`;
        const idx = keyMap.get(key);
        if (idx !== undefined) {
          const existing = aggregated[idx];
          aggregated[idx] = { ...existing, quantity: existing.quantity + item.quantity };
        } else {
          keyMap.set(key, aggregated.length);
          aggregated.push({ ...item });
        }
      }
      processedItems = aggregated;
    }

    // Alphabetical sort
    if (displaySettings.alphabeticalSort) {
      processedItems = [...processedItems].sort((a, b) => a.name.localeCompare(b.name));
    }

    const visibleItems = processedItems;
    const hasHiddenDoneItems = hideDoneItems && doneItemCount > 0;

    return (
      <Pressable onPress={handlePress} onLongPress={handleLongPress} delayLongPress={400}>
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

          {/* Priority badge */}
          {ticket.prioritized && (
            <View
              style={{
                position: "absolute",
                top: hasRush ? 18 : 0,
                right: bulkMode ? 30 : 6,
                zIndex: 10,
              }}
            >
              <Star size={16} color="#f59e0b" fill="#f59e0b" />
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
              {ticket.order_source === "online" && (
                <View style={{ flexDirection: "row", alignItems: "center", marginLeft: 6, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: "rgba(96,165,250,0.25)" }}>
                  <Globe color="#60a5fa" size={11} />
                  <Text style={{ color: "#60a5fa", fontSize: 10, fontWeight: "700", marginLeft: 2 }}>ONLINE</Text>
                </View>
              )}
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
            {visibleItems.map((item: KDSTicketItem, index: number) => {
              const isItemDone = item.kitchen_status === "ready";
              return (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    if (!isItemDone && onItemPress) {
                      onItemPress(ticket.ticket_id, item.id);
                    }
                  }}
                  style={index < visibleItems.length - 1 ? { marginBottom: 4 } : undefined}
                >
                  <View style={{ flexDirection: "row", alignItems: "flex-start", opacity: isItemDone ? 0.4 : 1 }}>
                    <View
                      style={{
                        backgroundColor: isItemDone ? colors.success : colors.border,
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
                      style={{
                        color: "#fff",
                        fontSize: 13,
                        fontWeight: "500",
                        flex: 1,
                        textDecorationLine: isItemDone ? "line-through" : "none",
                      }}
                      numberOfLines={displaySettings.itemNameLines || undefined}
                    >
                      {item.name}
                    </Text>
                  </View>
                  {/* Modifiers */}
                  {item.modifiers.length > 0 &&
                    (() => {
                      let mods = [...item.modifiers];
                      // Exclusions at top
                      if (displaySettings.exclusionsAtTop) {
                        mods.sort((a, b) => {
                          const aRemoval = a.modifier_group_name?.toLowerCase().includes("remove") || a.modifier_name?.toLowerCase().startsWith("no ") ? 0 : 1;
                          const bRemoval = b.modifier_group_name?.toLowerCase().includes("remove") || b.modifier_name?.toLowerCase().startsWith("no ") ? 0 : 1;
                          return aRemoval - bRemoval;
                        });
                      }
                      return mods.map((mod, mi) => {
                        const isRemoval =
                          mod.modifier_group_name?.toLowerCase().includes("remove") ||
                          mod.modifier_name?.toLowerCase().startsWith("no ");
                        // Modifier group name prefix
                        let prefix = isRemoval ? "- " : "+ ";
                        if (displaySettings.modifierGroupName === "always" && mod.modifier_group_name) {
                          prefix = `${prefix}${mod.modifier_group_name}: `;
                        } else if (displaySettings.modifierGroupName === "for_group_priced" && mod.modifier_group_name && mod.price_modifier !== 0) {
                          prefix = `${prefix}${mod.modifier_group_name}: `;
                        }
                        return (
                          <Text
                            key={`${item.id}_m${mi}`}
                            style={{
                              color: isRemoval ? colors.danger : colors.success,
                              fontSize: 11,
                              marginLeft: 28,
                              marginTop: 1,
                              opacity: isItemDone ? 0.4 : 1,
                              textDecorationLine: isItemDone ? "line-through" : "none",
                            }}
                          >
                            {prefix}
                            {mod.modifier_name}
                          </Text>
                        );
                      });
                    })()}
                  {/* Special instructions */}
                  {item.special_instructions && (
                    <Text
                      style={{
                        color: displaySettings.highlightNotes ? colors.warning : colors.label,
                        fontSize: 11,
                        fontStyle: "italic",
                        marginLeft: 28,
                        marginTop: 1,
                        opacity: isItemDone ? 0.4 : 1,
                        textDecorationLine: isItemDone ? "line-through" : "none",
                      }}
                      numberOfLines={2}
                    >
                      "{item.special_instructions}"
                    </Text>
                  )}
                </Pressable>
              );
            })}
            {/* Hidden done items indicator */}
            {hasHiddenDoneItems && (
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 4, textAlign: "center" }}>
                {doneItemCount} done
              </Text>
            )}
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
    prev.onToggleSelect === next.onToggleSelect &&
    prev.onLongPress === next.onLongPress &&
    prev.onItemPress === next.onItemPress &&
    prev.hideDoneItems === next.hideDoneItems &&
    prev.displaySettings === next.displaySettings &&
    prev.urgencyThresholds === next.urgencyThresholds,
);

// ─── Done Ticket Card (gray, muted, tap to recall) ───────────────
interface KDSDoneTicketCardProps {
  ticket: KDSTicket;
  onRecall: (ticketId: string) => void;
}

const KDSDoneTicketCard = React.memo<KDSDoneTicketCardProps>(
  ({ ticket, onRecall }) => {
    const timeElapsed = useKDSStore(
      useCallback(
        (s) => {
          void s.timerTick;
          return getBucketedElapsed(ticket.start_time_epoch);
        },
        [ticket.start_time_epoch],
      ),
    );

    const orderTypeLabel = getOrderTypeLabel(ticket.order_type);
    const orderTypeIcon = getOrderTypeIcon(ticket.order_type);

    return (
      <Pressable onPress={() => onRecall(ticket.ticket_id)}>
        <View
          style={{
            margin: 4,
            borderRadius: 10,
            overflow: "hidden",
            backgroundColor: colors.skeleton,
            borderWidth: 2,
            borderColor: colors.muted,
            opacity: 0.7,
          }}
        >
          {/* Top bar — gray */}
          <View
            style={{
              backgroundColor: colors.muted,
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
              backgroundColor: colors.skeletonHighlight,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
            }}
          >
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
              <Text style={{ color: colors.label, fontSize: 16, fontWeight: "700" }} numberOfLines={1}>
                {ticket.display_number || ticket.order_number?.slice(-4) || "----"}
                {ticket.course_number > 1 && (
                  <Text style={{ color: colors.muted }}> C{ticket.course_number}</Text>
                )}
              </Text>
              {ticket.table_name && (
                <Text style={{ color: colors.muted, fontSize: 12 }}>{ticket.table_name}</Text>
              )}
            </View>
          </View>

          {/* Items list */}
          <View style={{ padding: 8, backgroundColor: colors.screen }}>
            {ticket.items.map((item: KDSTicketItem, index: number) => (
              <View
                key={item.id}
                style={[
                  { flexDirection: "row", alignItems: "flex-start" },
                  index < ticket.items.length - 1 ? { marginBottom: 4 } : undefined,
                ]}
              >
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
                  <Text style={{ color: colors.label, fontSize: 12, fontWeight: "700" }}>
                    {item.quantity}
                  </Text>
                </View>
                <Text
                  style={{
                    color: colors.label,
                    fontSize: 13,
                    fontWeight: "500",
                    flex: 1,
                  }}
                  numberOfLines={1}
                >
                  {item.name}
                </Text>
              </View>
            ))}
          </View>

          {/* Tap to recall hint */}
          <View
            style={{
              backgroundColor: colors.screen,
              paddingVertical: 4,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              alignItems: "center",
            }}
          >
            <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "600" }}>
              Tap to Recall
            </Text>
          </View>
        </View>
      </Pressable>
    );
  },
  (prev, next) => prev.ticket === next.ticket && prev.onRecall === next.onRecall,
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
  const kdsHideDoneItems = useStoreSettingsStore((s) => s.kdsHideDoneItems);
  const updateField = useStoreSettingsStore((s) => s.updateField);

  const tickets = useKDSStore((s) => s.tickets);
  const counts = useKDSStore((s) => s.counts);
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
  const selectedTicketIds = useKDSStore((s) => s.selectedTicketIds);
  const toggleBulkMode = useKDSStore((s) => s.toggleBulkMode);
  const toggleTicketSelection = useKDSStore((s) => s.toggleTicketSelection);
  const selectAllVisible = useKDSStore((s) => s.selectAllVisible);
  const clearSelection = useKDSStore((s) => s.clearSelection);
  const bulkAdvanceTickets = useKDSStore((s) => s.bulkAdvanceTickets);
  const setOnNewOrderCallback = useKDSStore((s) => s.setOnNewOrderCallback);
  const recallTicket = useKDSStore((s) => s.recallTicket);
  const doneTickets = useKDSStore((s) => s.doneTickets);
  const doneCount = useKDSStore((s) => s.doneCount);
  const recallDoneTicket = useKDSStore((s) => s.recallDoneTicket);
  const prioritizeTicket = useKDSStore((s) => s.prioritizeTicket);
  const toggleRush = useKDSStore((s) => s.toggleRush);
  const markItemDone = useKDSStore((s) => s.markItemDone);
  const kdsCleanup = useKDSStore((s) => s._cleanup);

  // Cleanup retries + pending actions on unmount
  useEffect(() => () => kdsCleanup(), [kdsCleanup]);

  // Realtime connection status for adaptive polling
  const { orders: ordersChannel } = useLocationRealtime();
  const isRealtimeConnected = ordersChannel.isConnected;

  // Employee + toast for PIN verification
  const findEmployeeByPin = useEmployeeStore((s) => s.findEmployeeByPin);
  const toast = useToast();

  // KDS display settings
  const kdsHighlightNotes = useStoreSettingsStore((s) => s.kdsHighlightNotes);
  const kdsItemNameLines = useStoreSettingsStore((s) => s.kdsItemNameLines);
  const kdsDisplayModifierGroupName = useStoreSettingsStore((s) => s.kdsDisplayModifierGroupName);
  const kdsDisplayExclusionsAtTop = useStoreSettingsStore((s) => s.kdsDisplayExclusionsAtTop);
  const kdsAlphabeticalSort = useStoreSettingsStore((s) => s.kdsAlphabeticalSort);
  const kdsAggregateIdenticalItems = useStoreSettingsStore((s) => s.kdsAggregateIdenticalItems);
  const kdsYellowThresholdMinutes = useStoreSettingsStore((s) => s.kdsYellowThresholdMinutes);
  const kdsOrangeThresholdMinutes = useStoreSettingsStore((s) => s.kdsOrangeThresholdMinutes);
  const kdsRedThresholdMinutes = useStoreSettingsStore((s) => s.kdsRedThresholdMinutes);

  const urgencyThresholds = useMemo<UrgencyThresholds>(
    () => ({
      yellow: kdsYellowThresholdMinutes,
      orange: kdsOrangeThresholdMinutes,
      red: kdsRedThresholdMinutes,
    }),
    [kdsYellowThresholdMinutes, kdsOrangeThresholdMinutes, kdsRedThresholdMinutes],
  );

  const displaySettings = useMemo<KDSTicketDisplaySettings>(
    () => ({
      highlightNotes: kdsHighlightNotes,
      itemNameLines: kdsItemNameLines,
      modifierGroupName: kdsDisplayModifierGroupName,
      exclusionsAtTop: kdsDisplayExclusionsAtTop,
      alphabeticalSort: kdsAlphabeticalSort,
      aggregateIdenticalItems: kdsAggregateIdenticalItems,
    }),
    [kdsHighlightNotes, kdsItemNameLines, kdsDisplayModifierGroupName, kdsDisplayExclusionsAtTop, kdsAlphabeticalSort, kdsAggregateIdenticalItems],
  );

  const [activeStatus, setActiveStatus] = useState<StatusFilter>("pending");
  const [activeType, setActiveType] = useState<OrderTypeFilter>("all");
  const [refreshing, setRefreshing] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showDisconnected, setShowDisconnected] = useState(false);
  const [settingsVisible, setSettingsVisible] = useState(false);

  // PIN modal state
  const [showPinModal, setShowPinModal] = useState(false);
  const [pendingBulkAction, setPendingBulkAction] = useState<"selected" | "all" | null>(null);

  // Action menu state (long-press)
  const [actionMenu, setActionMenu] = useState<{
    ticketId: string;
    ticket: KDSTicket;
    position: { x: number; y: number };
  } | null>(null);

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
    replaceRoute('(auth)', 'pin-login');
  }, [stationSessionId, selectedStore?.id, supabase, clearStationSession]);

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
  // Display-filtered KDS stations use 30s polling as a safety net since
  // client-side broadcast filtering may miss items that server-side routing includes.
  const hasDisplayFilter = routingMode !== null && routingMode !== "all";
  useEffect(() => {
    if (!isReady || !locationId) return;

    fetchTickets(locationId);

    let timeoutId: ReturnType<typeof setTimeout>;
    const schedulePoll = () => {
      const interval = isRealtimeConnectedRef.current
        ? (hasDisplayFilter ? 30_000 : 120_000)
        : 15_000;
      timeoutId = setTimeout(() => {
        backgroundFetchTickets(locationId);
        schedulePoll();
      }, interval);
    };
    schedulePoll();

    return () => clearTimeout(timeoutId);
  }, [isReady, locationId, fetchTickets, backgroundFetchTickets, hasDisplayFilter]);

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
        if (ticket.start_time_epoch === 0) return;
        const elapsed = now - ticket.start_time_epoch;
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

  // ─── Sound notifications on new orders ────────────────────────
  const soundServiceRef = useRef<KDSSoundService | null>(null);

  // Initialize sound service and register callback
  useEffect(() => {
    const service = new KDSSoundService();
    soundServiceRef.current = service;
    service.init();

    setOnNewOrderCallback((orderSource) => {
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
    if (activeType === "all") return doneTickets;
    return doneTickets.filter((t) => matchesTypeFilter(t, activeType));
  }, [doneTickets, activeType]);

  const filteredByStatus: Record<StatusFilter, KDSTicket[]> = useMemo(
    () => ({ pending: filteredPending, cooking: filteredCooking, ready: filteredReady, done: filteredDone }),
    [filteredPending, filteredCooking, filteredReady, filteredDone],
  );

  // Active tab's filtered data — for bulk actions / select-all
  const activeFilteredTickets = filteredByStatus[activeStatus];

  // Type counts for badge display (active tab only)
  const activeRawTickets =
    activeStatus === "pending" ? pendingTickets
    : activeStatus === "cooking" ? cookingTickets
    : activeStatus === "ready" ? readyTickets
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

  const handleToggleHideDone = useCallback(() => {
    updateField("kdsHideDoneItems", !kdsHideDoneItems);
  }, [kdsHideDoneItems, updateField]);

  // ─── Render Helpers ─────────────────────────────────────────────
  const columnWidthPct = `${100 / columnCount}%` as const;
  const renderItem = useCallback(
    ({ item }: { item: KDSTicket }) => (
      <Animated.View
        style={{ width: columnWidthPct, paddingHorizontal: 2 }}
        exiting={EXIT_ANIM}
      >
        <KDSTicketCard
          ticket={item}
          onAdvance={advanceTicketStatus}
          bulkMode={bulkMode}
          onToggleSelect={toggleTicketSelection}
          onLongPress={handleTicketLongPress}
          onItemPress={handleItemPress}
          hideDoneItems={kdsHideDoneItems}
          displaySettings={displaySettings}
          urgencyThresholds={urgencyThresholds}
        />
      </Animated.View>
    ),
    [advanceTicketStatus, bulkMode, toggleTicketSelection, handleTicketLongPress, handleItemPress, kdsHideDoneItems, displaySettings, urgencyThresholds, columnWidthPct],
  );

  const renderDoneItem = useCallback(
    ({ item }: { item: KDSTicket }) => (
      <View style={{ width: columnWidthPct, paddingHorizontal: 2 }}>
        <KDSDoneTicketCard ticket={item} onRecall={recallDoneTicket} />
      </View>
    ),
    [recallDoneTicket, columnWidthPct],
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
            {/* Settings */}
            <TouchableOpacity
              onPress={() => {
                setActionMenu(null);
                setSettingsVisible(true);
              }}
              style={{
                padding: 8,
                backgroundColor: colors.skeletonHighlight,
                borderRadius: 8,
              }}
            >
              <Settings size={18} color={colors.label} />
            </TouchableOpacity>
            {/* Hide done items toggle */}
            <TouchableOpacity
              onPress={handleToggleHideDone}
              style={{
                padding: 8,
                backgroundColor: kdsHideDoneItems ? colors.info : colors.skeletonHighlight,
                borderRadius: 8,
              }}
            >
              {kdsHideDoneItems ? (
                <EyeOff size={18} color="#fff" />
              ) : (
                <Eye size={18} color={colors.label} />
              )}
            </TouchableOpacity>
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
                      {tab.key === "done" ? doneCount : counts[tab.key]}
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
      {bulkMode && activeStatus !== "done" && (
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

      {/* ─── Grid: 4 pre-mounted FlatLists stacked ─── */}
      {!isReady || (isInitialLoading && !hasHydrated) ? (
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
          {/* Done tab — separate FlatList with gray card renderer */}
          <View
            key="done"
            style={{
              position: "absolute",
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: activeStatus === "done" ? 1 : 0,
              zIndex: activeStatus === "done" ? 1 : 0,
            }}
            pointerEvents={activeStatus === "done" ? "auto" : "none"}
          >
            <Animated.FlatList
              key={columnCount}
              data={filteredDone}
              keyExtractor={keyExtractor}
              renderItem={renderDoneItem}
              numColumns={columnCount}
              contentContainerStyle={{ padding: 4, paddingBottom: 20 }}
              initialNumToRender={16}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={false}
              ListEmptyComponent={
                <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingVertical: 60 }}>
                  <Text style={{ color: colors.muted, fontSize: 14 }}>
                    No done tickets
                  </Text>
                </View>
              }
            />
          </View>
        </View>
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
          }}
        >
          <View
            style={{
              position: "absolute",
              top: Math.min(actionMenu.position.y, 400),
              left: Math.min(actionMenu.position.x, 600),
              backgroundColor: colors.panel,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              paddingVertical: 4,
              minWidth: 180,
              shadowColor: "#000",
              shadowOffset: { width: 0, height: 4 },
              shadowOpacity: 0.4,
              shadowRadius: 12,
              elevation: 10,
              zIndex: 101,
            }}
          >
            {/* Recall — only for ready tickets */}
            {actionMenu.ticket.status === "ready" && (
              <Pressable
                onPress={handleRecall}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  paddingHorizontal: 16,
                  paddingVertical: 12,
                  gap: 10,
                }}
              >
                <RotateCcw size={16} color={colors.info} />
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>Recall</Text>
              </Pressable>
            )}

            {/* Prioritize */}
            <Pressable
              onPress={handlePrioritize}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 12,
                gap: 10,
              }}
            >
              <ArrowUpToLine size={16} color="#f59e0b" />
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>Prioritize</Text>
            </Pressable>

            {/* Rush / Un-Rush */}
            <Pressable
              onPress={handleToggleRush}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingHorizontal: 16,
                paddingVertical: 12,
                gap: 10,
              }}
            >
              <Flame
                size={16}
                color={actionMenu.ticket.items.some((i) => i.rush) ? colors.danger : colors.label}
              />
              <Text style={{ color: "#fff", fontSize: 14, fontWeight: "500" }}>
                {actionMenu.ticket.items.some((i) => i.rush) ? "Un-Rush" : "Rush"}
              </Text>
            </Pressable>
          </View>
        </Pressable>
      )}

      {/* ─── PIN Modal ─── */}
      <PinInputModal
        isOpen={showPinModal}
        title="Manager PIN Required"
        subtitle="Enter a manager PIN to perform bulk operations"
        onConfirm={handlePinConfirm}
        onCancel={handlePinCancel}
      />

      {/* ─── KDS Settings Modal ─── */}
      <KDSSettingsModal visible={settingsVisible} onClose={() => setSettingsVisible(false)} />
    </View>
  );
};

export default KitchenDisplayScreen;
