import AdvancedRefundModal, { AdvancedRefundModalRef } from "@/components/previous-orders/AdvancedRefundModal";
import OrderDetailsBottomSheet from "@/components/previous-orders/OrderDetailsBottomSheet";
import OrderNotesModal from "@/components/previous-orders/OrderNotesModal";
import PreviousOrderRow from "@/components/previous-orders/PreviousOrderRow";
import TipAdjustSheet, { TipAdjustSheetRef } from "@/components/previous-orders/detail/TipAdjustSheet";
import ReceiptModal from "@/components/receipts/ReceiptModal";
import { useOrderHistory } from "@/hooks/orders/useOrderHistory";
import {
  useCloseCheck,
  useReopenCheck,
  useVoidOrder,
} from "@/hooks/orders/useOrderActions";
import { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  RotateCcw,
  Search,
  ShoppingBag,
  Truck,
  Utensils,
} from "lucide-react-native";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  LayoutAnimation,
  Platform,
  RefreshControl,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
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
  <View className="bg-[#303030] rounded-xl mx-2 mb-2 p-4">
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
        : "bg-[#303030] border-gray-600"
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

// ─── Sort Button ────────────────────────────────────────────
const SortButton = ({
  label,
  isActive,
  sortOrder,
  onPress,
}: {
  label: string;
  isActive: boolean;
  sortOrder: "asc" | "desc";
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    className="flex-row items-center gap-1"
  >
    <Text
      className={`text-sm ${isActive ? "font-bold text-white" : "text-gray-500"}`}
    >
      {label}
    </Text>
    {isActive &&
      (sortOrder === "desc" ? (
        <ArrowDown color="#FFFFFF" size={12} />
      ) : (
        <ArrowUp color="#FFFFFF" size={12} />
      ))}
  </TouchableOpacity>
);

// ─── Main Screen ────────────────────────────────────────────
const PreviousOrdersScreen = () => {
  // Modal state
  const [activeModal, setActiveModal] = useState<"notes" | null>(null);
  const [selectedOrder, setSelectedOrder] = useState<OrderProfile | null>(null);
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] =
    useState<OrderProfile | null>(null);
  const [selectedOrderForDetails, setSelectedOrderForDetails] =
    useState<OrderProfile | null>(null);
  const orderDetailsSheetRef = useRef<BottomSheetMethods>(null);
  const refundModalRef = useRef<AdvancedRefundModalRef>(null);
  const tipAdjustRef = useRef<TipAdjustSheetRef>(null);
  const [selectedOrderForRefund, setSelectedOrderForRefund] =
    useState<OrderProfile | null>(null);
  const [selectedOrderForTip, setSelectedOrderForTip] =
    useState<OrderProfile | null>(null);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  // Expand/collapse state
  const [expandedOrderId, setExpandedOrderId] = useState<string | null>(null);

  // Filter & sort state
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "total" | "status">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());

  // Derive filter props from active filter pills
  const statusFilter = useMemo(() => {
    const statuses: string[] = [];
    if (activeFilters.has("refunded")) {
      statuses.push("Refunded", "Partially Refunded");
    }
    return statuses;
  }, [activeFilters]);

  const orderTypeFilter = useMemo(() => {
    const types: string[] = [];
    if (activeFilters.has("dine-in")) types.push("Dine In");
    if (activeFilters.has("takeaway")) types.push("Takeaway");
    if (activeFilters.has("delivery")) types.push("Delivery");
    return types;
  }, [activeFilters]);

  // Data layer
  const {
    orders,
    needsAttentionCount,
    isLoading,
    isFetchingNextPage,
    hasNextPage,
    fetchNextPage,
    refetch,
    isRefetching,
  } = useOrderHistory({
    searchText,
    statusFilter,
    orderTypeFilter,
    sortBy,
    sortOrder,
    needsAttention: activeFilters.has("needs-attention"),
    refundedOnly: activeFilters.has("refunded"),
  });

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

  const handleDoublePress = useCallback((order: OrderProfile) => {
    // Ensure the order is in the order store so PaymentDetailBottomSheet can find it
    const existing = useOrderStore.getState().ordersById[order.id];
    if (!existing) {
      useOrderStore.setState((state) => ({
        ordersById: { ...state.ordersById, [order.id]: order },
      }));
    }
    usePaymentDetailSheetStore.getState().open(order.id);
  }, []);

  const handleOpenNotes = useCallback((order: OrderProfile) => {
    setSelectedOrder(order);
    setActiveModal("notes");
  }, []);

  const handleOpenPrint = useCallback((order: OrderProfile) => {
    setSelectedOrderForReceipt(order);
  }, []);

  const handleViewTimeline = useCallback((order: OrderProfile) => {
    setSelectedOrderForDetails(order);
    orderDetailsSheetRef.current?.snapToIndex?.(0);
  }, []);

  const handleTipAdjust = useCallback((order: OrderProfile) => {
    setSelectedOrderForTip(order);
    tipAdjustRef.current?.open();
  }, []);

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

  const handleRefund = useCallback((order: OrderProfile) => {
    setSelectedOrderForRefund(order);
    refundModalRef.current?.open();
  }, []);

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

  const handleEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage) {
      fetchNextPage();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const renderFooter = useCallback(() => {
    if (!isFetchingNextPage) return null;
    return (
      <View className="py-4 items-center">
        <ActivityIndicator size="small" color="#3B82F6" />
      </View>
    );
  }, [isFetchingNextPage]);

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1"
    >
      <View className="flex-1 p-4 bg-[#212121]">
        {/* ─── Toolbar ─────────────────────────────────── */}
        <View className="mb-4 gap-3">
          {/* Search bar */}
          <View className="flex-row items-center justify-between">
            <View className="flex-row items-center bg-[#303030] border border-gray-700 rounded-lg px-3 w-[450px]">
              <Search color="#9CA3AF" size={20} />
              <TextInput
                placeholder="Search Order ID or Customer..."
                placeholderTextColor="#9CA3AF"
                value={searchText}
                onChangeText={setSearchText}
                className="ml-2 text-lg px-4 py-3 h-16 flex-1 text-white"
              />
            </View>
          </View>

          {/* ─── Filter Pills + Sort ───────────────────── */}
          <View className="flex-row items-center gap-2 flex-wrap">
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
              count={needsAttentionCount}
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
              activeBg="bg-cyan-600"
            />

            {/* Sort controls */}
            <View className="ml-auto flex-row items-center gap-3">
              <Text className="text-xs text-gray-500">Sort:</Text>
              <SortButton
                label="Date"
                isActive={sortBy === "date"}
                sortOrder={sortOrder}
                onPress={() => handleSortChange("date")}
              />
              <SortButton
                label="Amount"
                isActive={sortBy === "total"}
                sortOrder={sortOrder}
                onPress={() => handleSortChange("total")}
              />
              <SortButton
                label="Status"
                isActive={sortBy === "status"}
                sortOrder={sortOrder}
                onPress={() => handleSortChange("status")}
              />
            </View>
          </View>
        </View>

        {/* ─── Order List ──────────────────────────────── */}
        <View className="flex-1 rounded-xl overflow-hidden">
          {isLoading ? (
            <View className="flex-1 pt-2">
              {Array.from({ length: 10 }).map((_, index) => (
                <SkeletonRow key={`skeleton-${index}`} />
              ))}
            </View>
          ) : (
            <FlatList
              data={orders}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              onEndReached={handleEndReached}
              onEndReachedThreshold={0.3}
              ListFooterComponent={renderFooter}
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
                  refreshing={isRefetching}
                  onRefresh={refetch}
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
          )}
        </View>

        {/* ─── Modals ──────────────────────────────────── */}
        <OrderNotesModal
          isOpen={activeModal === "notes"}
          onClose={() => setActiveModal(null)}
          order={selectedOrder}
        />

        <OrderDetailsBottomSheet
          ref={orderDetailsSheetRef}
          order={selectedOrderForDetails}
          onClose={() => setSelectedOrderForDetails(null)}
          onPrint={handleOpenPrint}
          onRefund={handleRefund}
        />

        <ReceiptModal
          isOpen={!!selectedOrderForReceipt}
          onClose={() => setSelectedOrderForReceipt(null)}
          order={selectedOrderForReceipt}
          location={selectedStore}
        />

        <AdvancedRefundModal
          ref={refundModalRef}
          order={selectedOrderForRefund}
          onClose={() => setSelectedOrderForRefund(null)}
        />

        <TipAdjustSheet
          ref={tipAdjustRef}
          order={selectedOrderForTip}
        />
      </View>
    </KeyboardAvoidingView>
  );
};

export default PreviousOrdersScreen;
