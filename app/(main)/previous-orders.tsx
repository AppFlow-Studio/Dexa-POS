import { colors } from "@/lib/theme";
import OrderNotesModal from "@/components/previous-orders/OrderNotesModal";
import PreviousOrderRow from "@/components/previous-orders/PreviousOrderRow";
import ReceiptModal from "@/components/receipts/ReceiptModal";
import {
  useCloseCheck,
  useReopenCheck,
  useVoidOrder,
} from "@/hooks/orders/useOrderActions";
import { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  RefreshCw,
  RotateCcw,
  Search,
  ShoppingBag,
  Truck,
  Utensils,
} from "lucide-react-native";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  FadeIn,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

// ─── Skeleton Loading ───────────────────────────────────────
const SkeletonBar = ({
  width,
  height,
  style,
}: {
  width: number | string;
  height: number;
  style?: any;
}) => {
  const opacity = useSharedValue(0.3);

  useEffect(() => {
    opacity.value = withRepeat(
      withSequence(
        withTiming(0.7, { duration: 800 }),
        withTiming(0.3, { duration: 800 }),
      ),
      -1,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[
        {
          width: typeof width === "number" ? width : undefined,
          height,
          backgroundColor: "#4B5563",
          borderRadius: 8,
        },
        animatedStyle,
        style,
      ]}
    />
  );
};

const SkeletonRow = () => (
  <View className="bg-panel rounded-xl mx-2 mb-2 p-4">
    <View className="flex-row items-center gap-3">
      <SkeletonBar width={70} height={20} />
      <SkeletonBar width={50} height={14} />
      <View className="flex-1" />
      <SkeletonBar width={60} height={24} style={{ borderRadius: 6 }} />
      <SkeletonBar width={32} height={32} style={{ borderRadius: 16 }} />
      <SkeletonBar width={40} height={20} style={{ borderRadius: 10 }} />
      <SkeletonBar width={70} height={20} />
    </View>
    <SkeletonBar width={180} height={12} style={{ marginTop: 6 }} />
  </View>
);

// ─── Filter Pill Component ──────────────────────────────────
interface FilterPillProps {
  label: string;
  isActive: boolean;
  onPress: () => void;
  icon?: React.ReactNode;
  count?: number;
  activeBg?: string;
}

const FilterPill = ({
  label,
  isActive,
  onPress,
  icon,
  count,
  activeBg = "bg-blue-600",
}: FilterPillProps) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    className={`flex-row items-center gap-1.5 px-3 py-2 rounded-full border ${
      isActive
        ? `${activeBg} border-transparent`
        : "bg-panel border-gray-600"
    }`}
  >
    {icon}
    <Text
      className={`text-sm font-semibold ${isActive ? "text-white" : "text-gray-400"}`}
    >
      {label}
    </Text>
    {count != null && count > 0 && (
      <View
        className={`rounded-full px-1.5 min-w-[20px] items-center ${isActive ? "bg-white/20" : "bg-gray-600"}`}
      >
        <Text
          className={`text-xs font-bold ${isActive ? "text-white" : "text-gray-300"}`}
        >
          {count}
        </Text>
      </View>
    )}
  </TouchableOpacity>
);

// ─── Sort Segment Group ─────────────────────────────────────
const SortSegmentGroup = ({
  sortBy,
  sortOrder,
  onSortChange,
}: {
  sortBy: "date" | "total" | "status";
  sortOrder: "asc" | "desc";
  onSortChange: (field: "date" | "total" | "status") => void;
}) => {
  const segments: { key: "date" | "total" | "status"; label: string }[] = [
    { key: "date", label: "Date" },
    { key: "total", label: "Amount" },
    { key: "status", label: "Status" },
  ];

  return (
    <View
      className="flex-row items-center rounded-lg overflow-hidden border border-border"
      style={{ backgroundColor: "rgba(31, 41, 55, 0.5)" }}
    >
      {segments.map((seg, idx) => {
        const isActive = sortBy === seg.key;
        return (
          <React.Fragment key={seg.key}>
            {idx > 0 && (
              <View style={{ width: 1, backgroundColor: "#374151", alignSelf: "stretch" }} />
            )}
            <TouchableOpacity
              onPress={() => onSortChange(seg.key)}
              activeOpacity={0.7}
              className={`flex-row items-center gap-1 px-3 py-2 ${isActive ? "bg-blue-600" : ""}`}
            >
              <Text
                className={`text-sm ${isActive ? "font-bold text-white" : "text-gray-400"}`}
              >
                {seg.label}
              </Text>
              {isActive &&
                (sortOrder === "desc" ? (
                  <ArrowDown color="#FFFFFF" size={12} />
                ) : (
                  <ArrowUp color="#FFFFFF" size={12} />
                ))}
            </TouchableOpacity>
          </React.Fragment>
        );
      })}
    </View>
  );
};

// ─── Main Screen ────────────────────────────────────────────
const PreviousOrdersScreen = () => {
  // Modal state
  const [activeModal, setActiveModal] = useState<"notes" | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderProfile | null>(null);
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] =
    useState<OrderProfile | null>(null);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  // Expand/collapse state
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Filter & sort state
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "total" | "status">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ─── Store-based data layer (mirrors PreviousOrdersSection pattern) ───
  const ordersById = useOrderStore((s) => s.ordersById);
  const {
    refreshPreviousOrders,
    previousOrders,
    newOrdersCount,
    checkForNewOrders,
    clearNewOrdersCount,
  } = usePreviousOrdersStore();

  // Initial load + 15s polling for new orders
  useEffect(() => {
    refreshPreviousOrders();

    const intervalId = setInterval(() => {
      checkForNewOrders();
    }, 15000);

    return () => {
      clearInterval(intervalId);
      clearNewOrdersCount();
    };
  }, []);

  // Handle refresh (pull-to-refresh or banner tap)
  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await refreshPreviousOrders();
    setIsRefreshing(false);
  }, [refreshPreviousOrders]);

  // Combine active orders + history orders with dedup (same as PreviousOrdersSection)
  const allOrders: OrderProfile[] = useMemo(() => {
    const activeOrders = Object.values(ordersById).filter(
      (o: OrderProfile) =>
        o.order_status !== "draft" ||
        (o.order_status === "draft" && o.items.length > 0),
    );

    const activeIds = new Set(activeOrders.map((o) => o.id));
    const activeDbIds = new Set(
      activeOrders.map((o) => o.db_order_id).filter(Boolean),
    );

    const mappedHistoryOrders: OrderProfile[] = previousOrders
      .filter((po) => {
        if (activeIds.has(po.orderId)) return false;
        if (po.db_order_id && activeDbIds.has(po.db_order_id)) return false;
        return true;
      })
      .map(
        (po) =>
          ({
            id: po.orderId,
            db_order_id: po.db_order_id,
            display_number: po.display_number,
            order_number: po.display_number,
            customer_name: po.customer,
            server_name: po.server,
            order_status: po.refunded
              ? "refunded"
              : po.closed_at
                ? "completed"
                : "pending",
            check_status: po.checkStatus || "Opened",
            paid_status: po.paymentStatus,
            order_type: po.type,
            items: po.items,
            total_amount: po.total,
            amount_paid: po.amount_paid,
            amount_due: po.amount_due,
            opened_at: po.timestamp || po.opened_at,
            created_at: po.timestamp,
            closed_at: po.closed_at,
            service_location_id: po.service_location_id || null,
            service_location_name: po.service_location_name,
            station_id: po.station_id || null,
            _sourceStationName: po.station_name,
            notes: po.notes,
            payments: po.payments,
            order_source: po.order_source ?? null,
            reversals: po.reversals,
            order_refund_items: po.order_refund_items,
          }) as OrderProfile,
      );

    return [...activeOrders, ...mappedHistoryOrders];
  }, [ordersById, previousOrders]);

  // ─── Compute filter counts from allOrders ──────────────
  const filterCounts = useMemo(() => {
    let needsAttention = 0;
    let refunded = 0;
    let dineIn = 0;
    let takeaway = 0;
    let delivery = 0;

    for (const o of allOrders) {
      if (o.paid_status === "Pending") needsAttention++;
      if (o.order_status === "refunded" || (o.payments || []).some((p) => (p.refundedAmount ?? 0) > 0)) {
        refunded++;
      }
      switch (o.order_type) {
        case "Dine In":
          dineIn++;
          break;
        case "Takeaway":
          takeaway++;
          break;
        case "Delivery":
          delivery++;
          break;
      }
    }

    return { needsAttention, refunded, dineIn, takeaway, delivery };
  }, [allOrders]);

  // ─── Client-side filtering + sorting ───────────────────
  const filteredOrders = useMemo(() => {
    let filtered = allOrders;

    // Search by display_number or customer_name
    if (searchText.trim()) {
      const query = searchText.toLowerCase().trim();
      filtered = filtered.filter((o) => {
        const customerName = (o.customer_name || "walk-in").toLowerCase();
        const displayNumber = String(o.display_number || "").toLowerCase();
        return customerName.includes(query) || displayNumber.includes(query);
      });
    }

    // Status filters
    if (activeFilters.has("needs-attention")) {
      filtered = filtered.filter((o) => o.paid_status === "Pending");
    }
    if (activeFilters.has("refunded")) {
      filtered = filtered.filter(
        (o) =>
          o.order_status === "refunded" ||
          (o.payments || []).some((p) => (p.refundedAmount ?? 0) > 0),
      );
    }

    // Order type filters
    if (activeFilters.has("dine-in")) {
      filtered = filtered.filter((o) => o.order_type === "Dine In");
    }
    if (activeFilters.has("takeaway")) {
      filtered = filtered.filter((o) => o.order_type === "Takeaway");
    }
    if (activeFilters.has("delivery")) {
      filtered = filtered.filter((o) => o.order_type === "Delivery");
    }

    // Sorting
    const sortMultiplier = sortOrder === "asc" ? 1 : -1;
    filtered = [...filtered].sort((a, b) => {
      switch (sortBy) {
        case "date": {
          const dateA = new Date(a.opened_at || 0).getTime();
          const dateB = new Date(b.opened_at || 0).getTime();
          return (dateA - dateB) * sortMultiplier;
        }
        case "total":
          return ((a.total_amount || 0) - (b.total_amount || 0)) * sortMultiplier;
        case "status": {
          const statusA = (a.paid_status || "").toLowerCase();
          const statusB = (b.paid_status || "").toLowerCase();
          return statusA.localeCompare(statusB) * sortMultiplier;
        }
        default:
          return 0;
      }
    });

    return filtered;
  }, [allOrders, searchText, activeFilters, sortBy, sortOrder]);

  // Mutation hooks
  const closeCheckMutation = useCloseCheck();
  const reopenCheckMutation = useReopenCheck();
  const voidOrderMutation = useVoidOrder();

  // ─── Filter toggle ──────────────────────────────────────
  const toggleFilter = useCallback((filter: string) => {
    setActiveFilters((prev) => {
      const next = new Set(prev);
      if (next.has(filter)) {
        next.delete(filter);
      } else {
        next.add(filter);
      }
      return next;
    });
  }, []);

  // ─── Sort toggle ────────────────────────────────────────
  const handleSortChange = useCallback(
    (field: "date" | "total" | "status") => {
      if (sortBy === field) {
        setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortBy(field);
        setSortOrder("desc");
      }
    },
    [sortBy],
  );

  // ─── Row callbacks ──────────────────────────────────────
  const handlePress = useCallback((order: OrderProfile) => {
    setExpandedOrderId((prev) => (prev === order.id ? null : order.id));
  }, []);

  /** Ensure order is in store then open PaymentDetailBottomSheet to the given view */
  const openPaymentSheet = useCallback(
    (order: OrderProfile, view: "summary" | "refund" | "tipAdjust") => {
      const existing = useOrderStore.getState().ordersById[order.id];
      if (!existing) {
        useOrderStore.setState((state) => ({
          ordersById: { ...state.ordersById, [order.id]: order },
        }));
      }
      usePaymentDetailSheetStore.getState().open(order.id, view);
    },
    [],
  );

  const handleDoublePress = useCallback(
    (order: OrderProfile) => openPaymentSheet(order, "summary"),
    [openPaymentSheet],
  );

  const handleOpenNotes = useCallback((order: OrderProfile) => {
    setSelectedOrder(order);
    setActiveModal("notes");
  }, []);

  const handleOpenPrint = useCallback((order: OrderProfile) => {
    setSelectedOrderForReceipt(order);
  }, []);

  const handleViewTimeline = useCallback(
    (order: OrderProfile) => openPaymentSheet(order, "summary"),
    [openPaymentSheet],
  );

  const handleTipAdjust = useCallback(
    (order: OrderProfile) => openPaymentSheet(order, "tipAdjust"),
    [openPaymentSheet],
  );

  const handleCloseCheck = useCallback(
    (order: OrderProfile) => {
      if (!order.db_order_id) return;
      closeCheckMutation.mutate(order.db_order_id);
    },
    [closeCheckMutation],
  );

  const handleReopenCheck = useCallback(
    (order: OrderProfile) => {
      if (!order.db_order_id) return;
      reopenCheckMutation.mutate({ dbOrderId: order.db_order_id });
    },
    [reopenCheckMutation],
  );

  const handleRefund = useCallback(
    (order: OrderProfile) => openPaymentSheet(order, "refund"),
    [openPaymentSheet],
  );

  const handleVoidOrder = useCallback(
    (order: OrderProfile) => {
      if (!order.db_order_id) return;
      voidOrderMutation.mutate({ dbOrderId: order.db_order_id });
    },
    [voidOrderMutation],
  );

  // ─── FlatList render ────────────────────────────────────
  const renderItem = useCallback(
    ({ item }: { item: OrderProfile }) => (
      <PreviousOrderRow
        order={item}
        isExpanded={item.id === expandedOrderId}
        onPress={handlePress}
        onDoublePress={handleDoublePress}
        onPrint={handleOpenPrint}
        onViewTimeline={handleViewTimeline}
        onTipAdjust={handleTipAdjust}
        onViewNotes={handleOpenNotes}
        onCloseCheck={handleCloseCheck}
        onReopenCheck={handleReopenCheck}
        onRefund={handleRefund}
        onVoid={handleVoidOrder}
      />
    ),
    [
      expandedOrderId,
      handlePress,
      handleDoublePress,
      handleOpenPrint,
      handleViewTimeline,
      handleTipAdjust,
      handleOpenNotes,
      handleCloseCheck,
      handleReopenCheck,
      handleRefund,
      handleVoidOrder,
    ],
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <View className="flex-1 p-4 bg-screen">
        {/* ─── Toolbar ─────────────────────────────────── */}
        <View className="mb-4 flex-row items-center gap-2 flex-wrap">
          {/* Search bar */}
          <View className="flex-row items-center bg-panel border border-gray-700 rounded-lg px-3 w-[350px]">
            <Search color={colors.label} size={20} />
            <TextInput
              placeholder="Search Order ID or Customer..."
              placeholderTextColor={colors.label}
              value={searchText}
              onChangeText={setSearchText}
              className="ml-2 text-lg px-4 py-3 h-14 flex-1 text-white"
            />
          </View>

          {/* Filter Pills */}
          <FilterPill
            label="Needs Attention"
            isActive={activeFilters.has("needs-attention")}
            onPress={() => toggleFilter("needs-attention")}
            icon={
              <AlertTriangle
                color={
                  activeFilters.has("needs-attention")
                    ? "#FFFFFF"
                    : "#EAB308"
                }
                size={14}
              />
            }
            count={filterCounts.needsAttention}
            activeBg="bg-yellow-600"
          />
          <FilterPill
            label="Refunded"
            isActive={activeFilters.has("refunded")}
            onPress={() => toggleFilter("refunded")}
            icon={
              <RotateCcw
                color={
                  activeFilters.has("refunded") ? "#FFFFFF" : "#EF4444"
                }
                size={14}
              />
            }
            count={filterCounts.refunded}
            activeBg="bg-red-600"
          />
          <FilterPill
            label="Dine-In"
            isActive={activeFilters.has("dine-in")}
            onPress={() => toggleFilter("dine-in")}
            icon={
              <Utensils
                color={
                  activeFilters.has("dine-in") ? "#FFFFFF" : "#A78BFA"
                }
                size={14}
              />
            }
            count={filterCounts.dineIn}
            activeBg="bg-purple-600"
          />
          <FilterPill
            label="Takeaway"
            isActive={activeFilters.has("takeaway")}
            onPress={() => toggleFilter("takeaway")}
            icon={
              <ShoppingBag
                color={
                  activeFilters.has("takeaway") ? "#FFFFFF" : "#FB923C"
                }
                size={14}
              />
            }
            count={filterCounts.takeaway}
            activeBg="bg-orange-600"
          />
          <FilterPill
            label="Delivery"
            isActive={activeFilters.has("delivery")}
            onPress={() => toggleFilter("delivery")}
            icon={
              <Truck
                color={
                  activeFilters.has("delivery") ? "#FFFFFF" : "#22D3EE"
                }
                size={14}
              />
            }
            count={filterCounts.delivery}
            activeBg="bg-cyan-600"
          />

          {/* Sort controls — cohesive pill group */}
          <View className="ml-auto flex-row items-center gap-2">
            <Text className="text-xs text-gray-500">Sort:</Text>
            <SortSegmentGroup
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortChange={handleSortChange}
            />
          </View>
        </View>

        {/* ─── Order List ──────────────────────────────── */}
        <View className="flex-1 rounded-xl overflow-hidden relative">
          <FlatList
            data={filteredOrders}
            keyExtractor={(item) => item.id}
            renderItem={renderItem}
            ListEmptyComponent={
              <View className="items-center justify-center py-16">
                <Text className="text-xl text-gray-500">
                  No orders found
                </Text>
                <Text className="text-sm text-gray-600 mt-2">
                  Try adjusting your filters or search
                </Text>
              </View>
            }
            refreshControl={
              <RefreshControl
                refreshing={isRefreshing}
                onRefresh={handleRefresh}
                tintColor="#3B82F6"
                colors={["#3B82F6"]}
              />
            }
            contentContainerStyle={{ paddingTop: 4, paddingBottom: 16 }}
            initialNumToRender={10}
            maxToRenderPerBatch={10}
            windowSize={5}
            removeClippedSubviews={true}
          />

          {/* New Orders Banner */}
          {newOrdersCount > 0 && (
            <Animated.View
              entering={FadeIn.duration(200)}
              exiting={FadeOut.duration(200)}
              className="absolute top-4 left-0 right-0 items-center z-10"
              pointerEvents="box-none"
            >
              <TouchableOpacity
                onPress={handleRefresh}
                activeOpacity={0.8}
                className="flex-row items-center gap-2 px-5 py-3 rounded-full bg-green-600 shadow-lg"
                style={{
                  shadowColor: "#22c55e",
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.3,
                  shadowRadius: 8,
                  elevation: 8,
                }}
              >
                <RefreshCw size={16} color="#fff" />
                <Text className="text-white font-semibold text-sm">
                  {newOrdersCount} New Order{newOrdersCount > 1 ? "s" : ""} - Tap
                  to Refresh
                </Text>
              </TouchableOpacity>
            </Animated.View>
          )}
        </View>

        {/* ─── Modals ──────────────────────────────────── */}
        <OrderNotesModal
          isOpen={activeModal === "notes"}
          onClose={() => setActiveModal(null)}
          order={selectedOrder}
        />

        <ReceiptModal
          isOpen={!!selectedOrderForReceipt}
          onClose={() => setSelectedOrderForReceipt(null)}
          order={selectedOrderForReceipt}
          location={selectedStore}
        />

      </View>
    </KeyboardAvoidingView>
  );
};

export default PreviousOrdersScreen;
