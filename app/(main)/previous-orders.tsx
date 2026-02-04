import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import OrderDetailsBottomSheet from "@/components/previous-orders/OrderDetailsBottomSheet";
import OrderNotesModal from "@/components/previous-orders/OrderNotesModal";
import OrderTypeFilterDropdown from "@/components/previous-orders/OrderTypeFilterDropdown";
import PreviousOrderRow from "@/components/previous-orders/PreviousOrderRow";
import SortControls from "@/components/previous-orders/SortControls";
import StatusFilterDropdown from "@/components/previous-orders/StatusFilterDropdown";
import ReceiptModal from "@/components/receipts/ReceiptModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { CartItem, OrderProfile, OrderType, PaymentStatus } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { filterPreviousOrders } from "@/utils/orderUtils";
import type { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Search } from "lucide-react-native";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  DimensionValue,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const columns: { label: string; width: DimensionValue }[] = [
  { label: "# Serial No", width: "8%" },
  { label: "Order Date", width: "22%" },
  // { label: "Order ID", width: "10%" },
  { label: "Customer", width: "12%" },
  { label: "Payment Status", width: "10%" },
  { label: "Server/Cashier", width: "10%" },
  { label: "Items", width: "7%" },
  { label: "Type", width: "10%" },
  { label: "Total", width: "8%" },
  { label: "Notes", width: "8%" },
  { label: "", width: "5%" },
];

const HeaderCell = ({
  label,
  width,
}: {
  label: string;
  width: DimensionValue;
}) => (
  <View style={{ width }} className="flex-row items-center justify-start pr-2">
    <Text className="font-bold text-base text-gray-400">{label}</Text>
    {label && <View className="w-px h-4 bg-gray-600 ml-auto" />}
  </View>
);

// Simple Skeleton Bar Component - uses Reanimated for UI-thread animations
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
          borderRadius: 4,
        },
        animatedStyle,
        style,
      ]}
    />
  );
};

// Skeleton Row Component
const SkeletonRow = () => (
  <View
    className="flex-row items-center p-4 border-b border-gray-700"
    style={{ height: 72 }}
  >
    <View style={{ width: "8%" }} className="pr-2">
      <SkeletonBar width={48} height={16} />
    </View>
    <View style={{ width: "22%" }} className="pr-2">
      <SkeletonBar width={120} height={16} style={{ marginBottom: 8 }} />
      <SkeletonBar width={80} height={12} />
    </View>
    <View style={{ width: "12%" }} className="pr-2">
      <SkeletonBar width={90} height={16} />
    </View>
    <View style={{ width: "10%" }} className="pr-2">
      <SkeletonBar width={70} height={24} style={{ borderRadius: 12 }} />
    </View>
    <View style={{ width: "10%" }} className="pr-2">
      <SkeletonBar width={70} height={16} />
    </View>
    <View style={{ width: "7%" }} className="pr-2">
      <SkeletonBar width={50} height={24} style={{ borderRadius: 6 }} />
    </View>
    <View style={{ width: "10%" }} className="pr-2">
      <SkeletonBar width={70} height={24} style={{ borderRadius: 12 }} />
    </View>
    <View style={{ width: "8%" }} className="pr-2">
      <SkeletonBar width={60} height={16} />
    </View>
    <View style={{ width: "8%" }} className="pr-2">
      <SkeletonBar width={32} height={32} style={{ borderRadius: 6 }} />
    </View>
    <View style={{ width: "5%" }} className="items-end">
      <SkeletonBar width={32} height={32} style={{ borderRadius: 16 }} />
    </View>
  </View>
);

const PreviousOrdersScreen = () => {
  // State for the notes modal
  const [activeModal, setActiveModal] = useState<
    "notes" | "print" | "delete" | "modifiers" | "refund" | null
  >(null);

  // DEFERRED LOADING STATE
  const [isReady, setIsReady] = useState(false);

  // Trigger deferred loading - 500ms to show skeleton visibly
  useEffect(() => {
    const timer = setTimeout(() => {
      setIsReady(true);
    }, 500); // 500ms delay so user sees the skeleton loader
    return () => clearTimeout(timer);
  }, []);

  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const [selectedOrderItems, setSelectedOrderItems] = useState<CartItem[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<OrderProfile | null>(null);
  const [selectedOrderForReceipt, setSelectedOrderForReceipt] =
    useState<OrderProfile | null>(null);
  const [selectedOrderForDetails, setSelectedOrderForDetails] =
    useState<OrderProfile | null>(null);
  const orderDetailsSheetRef = useRef<BottomSheetMethods>(null);
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(),
    to: new Date(),
  });

  // Enhanced filtering and sorting state
  const [searchText, setSearchText] = useState("");
  const [sortBy, setSortBy] = useState<"date" | "total" | "status">("date");
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc");
  const [statusFilter, setStatusFilter] = useState<PaymentStatus[]>([]);
  const [orderTypeFilter, setOrderTypeFilter] = useState<OrderType[]>([]);

  // CRITICAL FIX: Use proper selector instead of destructuring entire store
  const ordersById = useOrderStore((s) => s.ordersById);

  // Process orders: deduplicate, filter, and apply search/sort
  // OPTIMIZED: Only calculate when isReady is true to prevent blocking navigation
  const filteredOrders = useMemo(() => {
    if (!isReady) return []; // Return empty during initial render

    // Filter to show only relevant orders
    let filtered = filterPreviousOrders(Object.values(ordersById));

    // Step 3: Apply search filter
    if (searchText.trim()) {
      const lowerQuery = searchText.toLowerCase();
      filtered = filtered.filter(
        (order) =>
          (order.display_number || order.order_number || order.id)
            .toLowerCase()
            .includes(lowerQuery) ||
          (order.customer_name || "walk-in").toLowerCase().includes(lowerQuery),
      );
    }

    // Step 4: Apply status filter
    if (statusFilter.length > 0) {
      filtered = filtered.filter((o) =>
        statusFilter.includes(o.paid_status as PaymentStatus),
      );
    }

    // Step 5: Apply order type filter
    if (orderTypeFilter.length > 0) {
      filtered = filtered.filter((o) =>
        orderTypeFilter.includes(o.order_type as OrderType),
      );
    }

    // Step 6: Sort orders
    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "date":
          const aTime = a.opened_at ? new Date(a.opened_at).getTime() : 0;
          const bTime = b.opened_at ? new Date(b.opened_at).getTime() : 0;
          comparison = bTime - aTime;
          break;
        case "total":
          comparison = (b.total_amount || 0) - (a.total_amount || 0);
          break;
        case "status":
          comparison = (a.paid_status || "").localeCompare(b.paid_status || "");
          break;
      }
      return sortOrder === "asc" ? -comparison : comparison;
    });

    return filtered;
  }, [
    ordersById,
    searchText,
    statusFilter,
    orderTypeFilter,
    sortBy,
    sortOrder,
    isReady, // Add isReady dep
  ]);

  // Wrappers for callbacks (no changes needed)
  const handleOpenNotes = useCallback((order: OrderProfile) => {
    setSelectedOrder(order);
    setActiveModal("notes");
  }, []);

  const handleOpenDelete = useCallback((order: OrderProfile) => {
    setSelectedOrder(order);
    setActiveModal("delete");
  }, []);

  const handleOpenPrint = useCallback((order: OrderProfile) => {
    setSelectedOrderForReceipt(order);
  }, []);

  // ... (keep handleConfirmDelete, handleCloseCheck, handleReopenCheck, handleRefund, handleDoublePress as is)
  const handleConfirmDelete = () => {
    if (selectedOrderItems) {
      // This needs to be implemented with actual state management for MOCK_PREVIOUS_ORDERS
      console.log("Deleting order:", selectedOrder?.id);
    }
    setActiveModal(null); // Close the modal
  };

  const handleCloseCheck = useCallback(async (order: OrderProfile) => {
    if (!order.db_order_id) {
      console.warn("Cannot close check - no db_order_id");
      return;
    }

    try {
      const supabase = useSupabaseClient();
      const { loggedInEmployee } = useEmployeeStore.getState();
      console.log("loggedInEmployee", loggedInEmployee);
      const { data, error } = await supabase?.rpc("close_check", {
        p_order_id: order.db_order_id,
        p_staff_id: loggedInEmployee?.profileId ?? null,
      });

      if (error) throw error;

      console.log("Check closed successfully");
      // The store will update automatically via realtime sync
    } catch (err) {
      console.error("Failed to close check:", err);
    }
  }, []);

  const handleReopenCheck = useCallback(async (order: OrderProfile) => {
    if (!order.db_order_id) {
      console.warn("Cannot reopen check - no db_order_id");
      return;
    }

    try {
      const supabase = useSupabaseClient();
      const { activeEmployeeId } = useEmployeeStore.getState();

      const { data, error } = await supabase?.rpc("reopen_check", {
        p_order_id: order.db_order_id,
        p_staff_id: activeEmployeeId,
      });

      if (error) throw error;

      console.log("Check reopened successfully");
      // The store will update automatically via realtime sync
    } catch (err) {
      console.error("Failed to reopen check:", err);
    }
  }, []);

  const handleRefund = useCallback((order: OrderProfile) => {
    setSelectedOrder(order);
    setActiveModal("refund");
  }, []);

  const handleDoublePress = useCallback((order: OrderProfile) => {
    setSelectedOrderForDetails(order);
    orderDetailsSheetRef.current?.snapToIndex?.(0);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: OrderProfile }) => (
      <PreviousOrderRow
        order={item}
        onViewNotes={handleOpenNotes}
        onDelete={handleOpenDelete}
        onPrint={handleOpenPrint}
        onCloseCheck={handleCloseCheck}
        onReopenCheck={handleReopenCheck}
        onRefund={handleRefund}
        onDoublePress={handleDoublePress}
      />
    ),
    [
      handleOpenNotes,
      handleOpenDelete,
      handleOpenPrint,
      handleCloseCheck,
      handleReopenCheck,
      handleRefund,
      handleDoublePress,
    ],
  );

  const getItemLayout = useCallback(
    (_data: any, index: number) => ({
      length: 72,
      offset: 72 * index,
      index,
    }),
    [],
  );

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="flex-1" // Ensure it takes full height
    >
      <View className="flex-1 p-4 bg-[#212121]">
        {/* Toolbar */}
        <View className="mb-4 gap-3">
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
            <DateRangePicker range={dateRange} onRangeChange={setDateRange} />
          </View>

          {/* Filters and Sort Controls */}
          <View className="flex-row items-center gap-3">
            <StatusFilterDropdown
              selected={statusFilter}
              onChange={setStatusFilter}
            />
            <OrderTypeFilterDropdown
              selected={orderTypeFilter}
              onChange={setOrderTypeFilter}
            />
            <SortControls
              sortBy={sortBy}
              sortOrder={sortOrder}
              onSortByChange={setSortBy}
              onSortOrderChange={setSortOrder}
            />
          </View>
        </View>

        {/* Table */}
        <View className="flex-1 bg-[#303030] rounded-xl border border-gray-700">
          {/* Table Header */}
          <View className="flex-row p-4 border-b border-gray-700">
            {columns.map((col) => (
              <HeaderCell key={col.label} label={col.label} width={col.width} />
            ))}
          </View>

          {/* Table Body */}
          {/* Conditional Rendering: Skeletons vs Data */}
          {!isReady ? (
            <View className="flex-1">
              {/* Render 10 skeleton rows */}
              {Array.from({ length: 12 }).map((_, index) => (
                <SkeletonRow key={`skeleton-${index}`} />
              ))}
            </View>
          ) : (
            <FlatList
              data={filteredOrders}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              getItemLayout={getItemLayout}
              ListEmptyComponent={
                <View className="items-center justify-center py-8">
                  <Text className="text-xl text-gray-500">
                    No orders found for this date.
                  </Text>
                </View>
              }
              // Performance optimizations
              initialNumToRender={10}
              maxToRenderPerBatch={10}
              windowSize={5}
              removeClippedSubviews={true}
            />
          )}
        </View>

        <OrderNotesModal
          isOpen={activeModal === "notes"}
          onClose={() => setActiveModal(null)}
          order={selectedOrder}
        />
        <ConfirmationModal
          isOpen={activeModal === "delete"}
          onClose={() => setActiveModal(null)}
          onConfirm={handleConfirmDelete}
          title="Delete Order"
          description="This will remove the order from the list and delete the data."
          confirmText="Delete"
          variant="destructive"
        />

        {/* <PrintReceiptModal
          isOpen={activeModal === "print"}
          onClose={() => setActiveModal(null)}
          order={selectedOrder}
        />

        <AdvancedRefundModal
          isOpen={activeModal === "refund"}
          onClose={() => setActiveModal(null)}
          order={selectedOrder}
        /> */}

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
      </View>
    </KeyboardAvoidingView>
  );
};

export default PreviousOrdersScreen;
