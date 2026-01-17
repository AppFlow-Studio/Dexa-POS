import { CartItem, OrderProfile } from "@/lib/types";
import { useCoursingStore } from "@/stores/useCoursingStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import {
  ArrowLeft,
  Check,
  ChefHat,
  ChevronDown,
  ChevronUp,
  Clock,
  Flame,
  Inbox,
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
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// New Data Structure for Cards
interface KDSCardData {
  id: string;
  order: OrderProfile;
  courseNumber: number;
  items: CartItem[];
  status: "pending" | "cooking" | "ready";
  startTime: string | null;
  tableName: string | null; // Resolved table name from service_location_id
}

// Time elapsed helper
const getTimeElapsed = (timestamp: string | null): string => {
  if (!timestamp) return "Now";
  const now = new Date();
  const opened = new Date(timestamp);
  const diffMs = now.getTime() - opened.getTime();
  const diffMins = Math.floor(diffMs / 60000);

  if (diffMins < 1) return "Now";
  if (diffMins < 60) return `${diffMins}m`;
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  return `${hours}h${mins}m`;
};

// Get urgency color based on time elapsed
const getUrgencyColor = (timestamp: string | null): string => {
  if (!timestamp) return "#9ca3af";
  const now = new Date();
  const opened = new Date(timestamp);
  const diffMins = Math.floor((now.getTime() - opened.getTime()) / 60000);

  if (diffMins >= 15) return "#ef4444"; // Red
  if (diffMins >= 10) return "#f97316"; // Orange
  if (diffMins >= 5) return "#eab308"; // Yellow
  return "#22c55e"; // Green
};

interface KDSOrderCardProps {
  data: KDSCardData;
  onStartCooking: () => void;
  onMarkReady: () => void;
  onMarkServed: () => void;
}

const KDSOrderCard: React.FC<KDSOrderCardProps> = ({
  data,
  onStartCooking,
  onMarkReady,
  onMarkServed,
}) => {
  const { order, courseNumber, items, status, startTime, tableName } = data;

  const [timeElapsed, setTimeElapsed] = useState(getTimeElapsed(startTime));
  const [expandedItems, setExpandedItems] = useState<Set<string>>(new Set());

  // Double-tap detection
  const lastTapRef = useRef<number>(0);
  const DOUBLE_TAP_DELAY = 350;
  const firstTapTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animations
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(1)).current;

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
    if (now - lastTapRef.current < DOUBLE_TAP_DELAY) {
      triggerDoubleTapAnimation();
      if (status === "pending") onStartCooking();
      else if (status === "cooking") onMarkReady();
      else if (status === "ready") onMarkServed();
      lastTapRef.current = 0;
    } else {
      triggerFirstTapFeedback();
      lastTapRef.current = now;
    }
  };

  useEffect(() => {
    return () => {
      if (firstTapTimeoutRef.current) clearTimeout(firstTapTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    const interval = setInterval(() => {
      setTimeElapsed(getTimeElapsed(startTime));
    }, 30000);
    return () => clearInterval(interval);
  }, [startTime]);

  const getOrderTypeConfig = () => {
    const type = order.order_type?.toLowerCase() || "dine_in";
    if (type === "dine_in" || type === "dine in") {
      return {
        icon: <UtensilsCrossed size={11} color="#d97706" />,
        label: "DINE IN",
      };
    }
    if (type === "delivery") {
      return { icon: <Truck size={11} color="#22c55e" />, label: "DELIVERY" };
    }
    return {
      icon: <ShoppingBag size={11} color="#3b82f6" />,
      label: "TAKEOUT",
    };
  };

  const orderTypeConfig = getOrderTypeConfig();
  const itemCount = items.reduce((sum, i) => sum + i.quantity, 0);

  const getStatusColor = () => {
    switch (status) {
      case "pending":
        return "#d97706";
      case "cooking":
        return "#ea580c";
      case "ready":
        return "#16a34a";
      default:
        return "#6b7280";
    }
  };

  const getButtonConfig = () => {
    switch (status) {
      case "pending":
        return { label: "START", color: "#d97706", onPress: onStartCooking };
      case "cooking":
        return { label: "READY", color: "#ea580c", onPress: onMarkReady };
      case "ready":
        return { label: "SERVE", color: "#16a34a", onPress: onMarkServed };
      default:
        return { label: "", color: "#6b7280", onPress: () => {} };
    }
  };

  const buttonConfig = getButtonConfig();

  const toggleItemExpanded = (itemId: string) => {
    setExpandedItems((prev) => {
      const next = new Set(prev);
      if (next.has(itemId)) {
        next.delete(itemId);
      } else {
        next.add(itemId);
      }
      return next;
    });
  };

  const renderItemDetails = (item: CartItem) => {
    const details: React.ReactNode[] = [];

    // Size
    if (item.customizations?.size) {
      details.push(
        <Text key="size" className="text-blue-400 text-xs ml-6 mt-1">
          Size: {item.customizations.size.name}
        </Text>
      );
    }

    // Modifiers
    if (
      item.customizations?.modifiers &&
      item.customizations.modifiers.length > 0
    ) {
      item.customizations.modifiers.forEach((mod, modIndex) => {
        const optionNames = mod.options.map((opt) => opt.name).join(", ");
        details.push(
          <View key={`mod-${modIndex}`} className="ml-6 mt-1">
            <Text className="text-purple-400 text-xs">
              • {mod.categoryName}: {optionNames}
            </Text>
          </View>
        );
      });
    }

    // Add-ons
    if (item.customizations?.addOns && item.customizations.addOns.length > 0) {
      item.customizations.addOns.forEach((addon, addonIndex) => {
        details.push(
          <Text
            key={`addon-${addonIndex}`}
            className="text-green-400 text-xs ml-6 mt-1"
          >
            + {addon.name} (+${addon.price.toFixed(2)})
          </Text>
        );
      });
    }

    // Notes
    if (item.customizations?.notes) {
      details.push(
        <Text
          key="notes"
          className="text-yellow-500 text-xs italic ml-6 mt-1"
          numberOfLines={2}
        >
          "{item.customizations.notes}"
        </Text>
      );
    }

    return details.length > 0 ? (
      details
    ) : (
      <Text className="text-gray-500 text-xs ml-6 mt-1 italic">
        No special instructions
      </Text>
    );
  };

  return (
    <TouchableOpacity activeOpacity={1} onPress={handleDoubleTap}>
      <Animated.View
        style={{
          marginHorizontal: 6,
          marginVertical: 4,
          borderRadius: 10,
          overflow: "hidden",
          backgroundColor: "#2a2a2e",
          borderWidth: 2,
          borderColor: getStatusColor(),
          shadowColor: getStatusColor(),
          shadowOffset: { width: 0, height: 2 },
          shadowOpacity: 0.3,
          shadowRadius: 6,
          elevation: 4,
          transform: [{ scale: scaleAnim }],
          opacity: opacityAnim,
        }}
      >
        {/* Header */}
        <View
          style={{
            backgroundColor: "#333338",
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: "#444",
          }}
        >
          <View className="flex-row justify-between items-center">
            <View className="flex-1">
              <Text className="text-lg font-bold text-white" numberOfLines={1}>
                #
                {order.display_number ||
                  order.order_number?.slice(-4) ||
                  "----"}
                <Text className="text-amber-400"> C{courseNumber}</Text>
              </Text>
              {tableName && (
                <Text className="text-sm text-gray-400">{tableName}</Text>
              )}
            </View>
            <View className="items-end">
              <View className="flex-row items-center">
                <Clock size={10} color={getUrgencyColor(startTime)} />
                <Text
                  style={{
                    color: getUrgencyColor(startTime),
                    fontSize: 11,
                    fontWeight: "600",
                    marginLeft: 3,
                  }}
                >
                  {timeElapsed}
                </Text>
              </View>
              <View className="flex-row items-center mt-1">
                {orderTypeConfig.icon}
                <Text className="text-gray-400 text-xs ml-1">
                  {orderTypeConfig.label}
                </Text>
              </View>
            </View>
          </View>
        </View>

        {/* Items */}
        <View style={{ padding: 8, backgroundColor: "#252528" }}>
          {items.slice(0, 4).map((item, index) => {
            const itemKey = `${item.id}_${index}`;
            const isExpanded = expandedItems.has(itemKey);
            const hasDetails =
              item.customizations?.size ||
              (item.customizations?.modifiers &&
                item.customizations.modifiers.length > 0) ||
              (item.customizations?.addOns &&
                item.customizations.addOns.length > 0) ||
              item.customizations?.notes;

            return (
              <View
                key={itemKey}
                className={
                  index !== Math.min(items.length - 1, 3) ? "mb-2" : ""
                }
              >
                <TouchableOpacity
                  onPress={() => hasDetails && toggleItemExpanded(itemKey)}
                  activeOpacity={hasDetails ? 0.7 : 1}
                  className="flex-row items-start"
                >
                  <View
                    style={{
                      backgroundColor: "#3a3a40",
                      width: 24,
                      height: 24,
                      borderRadius: 5,
                      alignItems: "center",
                      justifyContent: "center",
                      marginRight: 6,
                    }}
                  >
                    <Text className="text-white text-sm font-bold">
                      {item.quantity}
                    </Text>
                  </View>
                  <View className="flex-1">
                    <Text
                      className="text-white text-sm font-medium"
                      numberOfLines={1}
                    >
                      {item.name}
                    </Text>
                  </View>
                  {hasDetails && (
                    <View style={{ paddingLeft: 4 }}>
                      {isExpanded ? (
                        <ChevronUp size={14} color="#9ca3af" />
                      ) : (
                        <ChevronDown size={14} color="#9ca3af" />
                      )}
                    </View>
                  )}
                </TouchableOpacity>
                {isExpanded && (
                  <View style={{ paddingBottom: 4 }}>
                    {renderItemDetails(item)}
                  </View>
                )}
              </View>
            );
          })}
          {items.length > 4 && (
            <Text className="text-gray-500 text-xs text-center mt-1">
              +{items.length - 4} more items
            </Text>
          )}
        </View>

        {/* Action Button */}
        <TouchableOpacity
          onPress={buttonConfig.onPress}
          style={{
            backgroundColor: buttonConfig.color,
            paddingVertical: 10,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Text className="text-white font-bold text-sm">
            {buttonConfig.label}
          </Text>
        </TouchableOpacity>
      </Animated.View>
    </TouchableOpacity>
  );
};

// Column Component
const MIN_CARD_HEIGHT = 140;
const MAX_VISIBLE_ROWS = 4;

interface KDSColumnProps {
  title: string;
  count: number;
  icon: React.ReactNode;
  backgroundColor: string;
  headerColor: string;
  cards: KDSCardData[];
  emptyMessage: string;
  isFocused: boolean;
  onHeaderPress: () => void;
  onStartCooking: (orderId: string, itemIds: string[]) => void;
  onMarkReady: (orderId: string, itemIds: string[]) => void;
  onMarkServed: (orderId: string, itemIds: string[]) => void;
}

const KDSColumn: React.FC<KDSColumnProps> = ({
  title,
  count,
  icon,
  backgroundColor,
  headerColor,
  cards,
  emptyMessage,
  isFocused,
  onHeaderPress,
  onStartCooking,
  onMarkReady,
  onMarkServed,
}) => {
  const [containerHeight, setContainerHeight] = useState(0);

  // Calculate card height based on number of cards and available space
  const getCardStyle = () => {
    if (cards.length === 0 || containerHeight === 0) return {};

    const availableHeight = containerHeight - 20; // Account for padding

    if (cards.length < MAX_VISIBLE_ROWS) {
      // Stretch cards to fill available space
      const cardHeight = Math.max(
        availableHeight / cards.length,
        MIN_CARD_HEIGHT
      );
      return { height: cardHeight };
    } else {
      // Fixed height when 4+ cards, allow scrolling
      const cardHeight = Math.max(
        availableHeight / MAX_VISIBLE_ROWS,
        MIN_CARD_HEIGHT
      );
      return { height: cardHeight };
    }
  };

  const renderCard = (card: KDSCardData) => (
    <KDSOrderCard
      data={card}
      onStartCooking={() =>
        onStartCooking(
          card.order.id,
          card.items.map((i) => i.id)
        )
      }
      onMarkReady={() =>
        onMarkReady(
          card.order.id,
          card.items.map((i) => i.id)
        )
      }
      onMarkServed={() =>
        onMarkServed(
          card.order.id,
          card.items.map((i) => i.id)
        )
      }
    />
  );

  return (
    <View
      style={{
        flex: 1,
        backgroundColor,
        borderRadius: 8,
        margin: 4,
        overflow: "hidden",
      }}
    >
      {/* Column Header - Tappable */}
      <TouchableOpacity
        onPress={onHeaderPress}
        activeOpacity={0.8}
        style={{
          backgroundColor: headerColor,
          paddingVertical: 10,
          paddingHorizontal: 12,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View className="flex-row items-center">
          {isFocused && (
            <ArrowLeft size={18} color="white" style={{ marginRight: 8 }} />
          )}
          {icon}
          <Text className="text-white font-bold text-base ml-2">{title}</Text>
        </View>
        <View
          style={{
            backgroundColor: "rgba(255,255,255,0.2)",
            paddingHorizontal: 8,
            paddingVertical: 2,
            borderRadius: 10,
          }}
        >
          <Text className="text-white font-bold text-sm">{count}</Text>
        </View>
      </TouchableOpacity>

      {/* Cards Container */}
      {isFocused ? (
        // Focused mode: 4-column grid using FlatList
        <FlatList
          data={cards}
          keyExtractor={(item) => item.id}
          numColumns={4}
          contentContainerStyle={{ padding: 8, paddingBottom: 20 }}
          columnWrapperStyle={{ gap: 8 }}
          renderItem={({ item }) => (
            <View style={{ flex: 1, marginBottom: 8 }}>{renderCard(item)}</View>
          )}
          ListEmptyComponent={
            <View className="flex-1 items-center justify-center py-8">
              <Text className="text-gray-500 text-sm text-center">
                {emptyMessage}
              </Text>
            </View>
          }
        />
      ) : (
        // Unfocused mode: Simple scrollable list
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ padding: 4, paddingBottom: 20 }}
          showsVerticalScrollIndicator={true}
        >
          {cards.length === 0 ? (
            <View className="items-center justify-center py-8">
              <Text className="text-gray-500 text-sm text-center">
                {emptyMessage}
              </Text>
            </View>
          ) : (
            cards.map((card) => <View key={card.id}>{renderCard(card)}</View>)
          )}
        </ScrollView>
      )}
    </View>
  );
};

const KitchenDisplayScreen = () => {
  const {
    ordersByDbId,
    markCourseItemsAsCooking,
    markCourseItemsAsReady,
    markCourseItemsAsServed,
  } = useOrderStore();
  const { tables } = useFloorPlanStore();
  const { getItemCourse, loadFromServer, byOrderId } = useCoursingStore();
  const [refreshing, setRefreshing] = useState(false);
  const [focusedColumn, setFocusedColumn] = useState<string | null>(null);

  // Load coursing data for all active orders
  useEffect(() => {
    Object.values(ordersByDbId).forEach((order) => {
      loadFromServer(order.db_order_id || "");
    });
  }, [ordersByDbId, loadFromServer]);

  // Helper to look up table name from service_location_id
  const getTableName = useCallback(
    (serviceLocationId: string | null) => {
      if (!serviceLocationId) return null;
      const table = tables.find((t) => t.id === serviceLocationId);
      return table?.name || null;
    },
    [tables]
  );

  // Transform orders to cards grouped by status
  const { pendingCards, cookingCards, readyCards, counts } = useMemo(() => {
    const pending: KDSCardData[] = [];
    const cooking: KDSCardData[] = [];
    const ready: KDSCardData[] = [];

    Object.values(ordersByDbId).forEach((order) => {
      const relevantItems = order.items.filter(
        (item) =>
          item.kitchen_status === "sent" ||
          item.kitchen_status === "preparing" ||
          item.kitchen_status === "ready"
      );

      if (relevantItems.length === 0) return;

      const itemsByCourse: Record<number, CartItem[]> = {};
      relevantItems.forEach((item) => {
        // Get course number from coursing store
        // Pass both item.id (local) and db_order_item_id (backend) for resilient lookup
        const course = getItemCourse(order.id, item.id, item.db_order_item_id);
        if (!itemsByCourse[course]) itemsByCourse[course] = [];
        itemsByCourse[course].push(item);
      });

      // Get table name for this order
      const tableName = getTableName(order.service_location_id);

      Object.entries(itemsByCourse).forEach(([courseStr, courseItems]) => {
        const courseNum = parseInt(courseStr);
        const hasSent = courseItems.some((i) => i.kitchen_status === "sent");
        const hasPreparing = courseItems.some(
          (i) => i.kitchen_status === "preparing"
        );
        const allReady = courseItems.every((i) => i.kitchen_status === "ready");

        let cardStatus: "pending" | "cooking" | "ready" = "pending";
        if (allReady) cardStatus = "ready";
        else if (hasSent) cardStatus = "pending";
        else if (hasPreparing) cardStatus = "cooking";

        const card: KDSCardData = {
          id: `${order.id}_c${courseNum}`,
          order,
          courseNumber: courseNum,
          items: courseItems,
          status: cardStatus,
          startTime: order.sent_to_kitchen_at || order.opened_at,
          tableName,
        };

        if (cardStatus === "pending") pending.push(card);
        else if (cardStatus === "cooking") cooking.push(card);
        else if (cardStatus === "ready") ready.push(card);
      });
    });

    // Sort by time (oldest first)
    const sortByTime = (a: KDSCardData, b: KDSCardData) => {
      const timeA = new Date(a.startTime || 0).getTime();
      const timeB = new Date(b.startTime || 0).getTime();
      return timeA - timeB;
    };

    pending.sort(sortByTime);
    cooking.sort(sortByTime);
    ready.sort(sortByTime);

    return {
      pendingCards: pending,
      cookingCards: cooking,
      readyCards: ready,
      counts: {
        pending: pending.reduce(
          (sum, c) => sum + c.items.reduce((s, i) => s + i.quantity, 0),
          0
        ),
        cooking: cooking.reduce(
          (sum, c) => sum + c.items.reduce((s, i) => s + i.quantity, 0),
          0
        ),
        ready: ready.reduce(
          (sum, c) => sum + c.items.reduce((s, i) => s + i.quantity, 0),
          0
        ),
      },
    };
  }, [ordersByDbId, byOrderId]);

  const handleStartCooking = useCallback(
    (orderId: string, itemIds: string[]) => {
      markCourseItemsAsCooking(orderId, itemIds);
    },
    [markCourseItemsAsCooking]
  );

  const handleMarkReady = useCallback(
    (orderId: string, itemIds: string[]) => {
      markCourseItemsAsReady(orderId, itemIds);
    },
    [markCourseItemsAsReady]
  );

  const handleMarkServed = useCallback(
    (orderId: string, itemIds: string[]) => {
      markCourseItemsAsServed(orderId, itemIds);
    },
    [markCourseItemsAsServed]
  );

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  return (
    <View className="flex-1 bg-[#1a1a1a]">
      {/* Header */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
          paddingHorizontal: 16,
          paddingVertical: 12,
          backgroundColor: "#222225",
          borderBottomWidth: 1,
          borderBottomColor: "#333",
        }}
      >
        <View className="flex-row items-center">
          <ChefHat size={26} color="#3b82f6" />
          <Text className="text-xl font-bold text-white ml-3">
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
            style={refreshing ? { opacity: 0.5 } : {}}
          />
        </TouchableOpacity>
      </View>

      {/* Columns */}
      <View style={{ flex: 1, flexDirection: "row", padding: 4 }}>
        {focusedColumn === "PENDING" ? (
          <KDSColumn
            title="PENDING"
            count={counts.pending}
            icon={<Inbox size={18} color="#60a5fa" />}
            backgroundColor="#1a1f2e"
            headerColor="#1e40af"
            cards={pendingCards}
            emptyMessage="No pending orders"
            isFocused={true}
            onHeaderPress={() => setFocusedColumn(null)}
            onStartCooking={handleStartCooking}
            onMarkReady={handleMarkReady}
            onMarkServed={handleMarkServed}
          />
        ) : focusedColumn === "COOKING" ? (
          <KDSColumn
            title="COOKING"
            count={counts.cooking}
            icon={<Flame size={18} color="#fb923c" />}
            backgroundColor="#1f1a18"
            headerColor="#c2410c"
            cards={cookingCards}
            emptyMessage="No orders cooking"
            isFocused={true}
            onHeaderPress={() => setFocusedColumn(null)}
            onStartCooking={handleStartCooking}
            onMarkReady={handleMarkReady}
            onMarkServed={handleMarkServed}
          />
        ) : focusedColumn === "READY" ? (
          <KDSColumn
            title="READY"
            count={counts.ready}
            icon={<Check size={18} color="#4ade80" />}
            backgroundColor="#1a1f1a"
            headerColor="#15803d"
            cards={readyCards}
            emptyMessage="No orders ready"
            isFocused={true}
            onHeaderPress={() => setFocusedColumn(null)}
            onStartCooking={handleStartCooking}
            onMarkReady={handleMarkReady}
            onMarkServed={handleMarkServed}
          />
        ) : (
          <>
            <KDSColumn
              title="PENDING"
              count={counts.pending}
              icon={<Inbox size={18} color="#60a5fa" />}
              backgroundColor="#1a1f2e"
              headerColor="#1e40af"
              cards={pendingCards}
              emptyMessage="No pending orders"
              isFocused={false}
              onHeaderPress={() => setFocusedColumn("PENDING")}
              onStartCooking={handleStartCooking}
              onMarkReady={handleMarkReady}
              onMarkServed={handleMarkServed}
            />
            <KDSColumn
              title="COOKING"
              count={counts.cooking}
              icon={<Flame size={18} color="#fb923c" />}
              backgroundColor="#1f1a18"
              headerColor="#c2410c"
              cards={cookingCards}
              emptyMessage="No orders cooking"
              isFocused={false}
              onHeaderPress={() => setFocusedColumn("COOKING")}
              onStartCooking={handleStartCooking}
              onMarkReady={handleMarkReady}
              onMarkServed={handleMarkServed}
            />
            <KDSColumn
              title="READY"
              count={counts.ready}
              icon={<Check size={18} color="#4ade80" />}
              backgroundColor="#1a1f1a"
              headerColor="#15803d"
              cards={readyCards}
              emptyMessage="No orders ready"
              isFocused={false}
              onHeaderPress={() => setFocusedColumn("READY")}
              onStartCooking={handleStartCooking}
              onMarkReady={handleMarkReady}
              onMarkServed={handleMarkServed}
            />
          </>
        )}
      </View>
    </View>
  );
};

export default KitchenDisplayScreen;
