import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import AdvancedRefundModal from "@/components/previous-orders/AdvancedRefundModal";
import OrderNotesModal from "@/components/previous-orders/OrderNotesModal";
import OrderTypeFilterDropdown from "@/components/previous-orders/OrderTypeFilterDropdown";
import PreviousOrderRow from "@/components/previous-orders/PreviousOrderRow";
import PrintReceiptModal from "@/components/previous-orders/PrintReceiptModal";
import SortControls from "@/components/previous-orders/SortControls";
import StatusFilterDropdown from "@/components/previous-orders/StatusFilterDropdown";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { getOrderStoreSupabaseClient } from "@/lib/supabase";
import { CartItem, OrderType, PaymentStatus, PreviousOrder } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { Search } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  DimensionValue,
  FlatList,
  Text,
  TextInput,
  View,
  KeyboardAvoidingView,
  Platform,
} from "react-native";

const columns: { label: string; width: DimensionValue }[] = [
  { label: "# Serial No", width: "8%" },
  { label: "Order Date", width: "12%" },
  { label: "Order ID", width: "10%" },
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

const PreviousOrdersScreen = () => {
  // State for the notes modal
  const [activeModal, setActiveModal] = useState<
    "notes" | "print" | "delete" | "modifiers" | "refund" | null
  >(null);

  const [selectedOrderItems, setSelectedOrderItems] = useState<CartItem[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PreviousOrder | null>(
    null
  );
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

  const { previousOrders } = usePreviousOrdersStore();
  console.log("previousOrders", previousOrders);

  // Get orders from the store with enhanced filtering and sorting
  const filteredOrders = useMemo(() => {
    let orders = [...previousOrders];

    // Date range filtering
    if (dateRange.from) {
      // Create start of day (00:00:00) for the from date
      const startDate = new Date(dateRange.from);
      startDate.setHours(0, 0, 0, 0);
      const startTimestamp = startDate.getTime();

      // Create end of day (23:59:59.999) for the to date
      const endDate = dateRange.to
        ? new Date(dateRange.to)
        : new Date(dateRange.from);
      endDate.setHours(23, 59, 59, 999);
      const endTimestamp = endDate.getTime();

      orders = orders.filter((order) => {
        // Use the timestamp field directly (no parsing needed!)
        let orderTimestamp: number;

        if (order.timestamp) {
          // New format: use timestamp directly
          orderTimestamp = new Date(order.timestamp).getTime();
        } else {
          // Old format: fallback to parsing orderDate for backward compatibility
          try {
            const dateParts = order.orderDate.split(" ");
            const monthNames = [
              "Jan",
              "Feb",
              "Mar",
              "Apr",
              "May",
              "Jun",
              "Jul",
              "Aug",
              "Sep",
              "Oct",
              "Nov",
              "Dec",
            ];
            const month = monthNames.indexOf(dateParts[0]);
            const day = parseInt(dateParts[1].replace(",", ""));
            const year = parseInt(dateParts[2]);
            orderTimestamp = new Date(year, month, day).getTime();
          } catch (err) {
            // If parsing fails, exclude from results
            return false;
          }
        }

        return orderTimestamp >= startTimestamp && orderTimestamp <= endTimestamp;
      });
    }

    // Search filtering
    if (searchText.trim()) {
      const lowerQuery = searchText.toLowerCase();
      orders = orders.filter(
        (order) =>
          order.orderId.toLowerCase().includes(lowerQuery) ||
          order.customer.toLowerCase().includes(lowerQuery)
      );
    }

    // Status filtering
    if (statusFilter.length > 0) {
      orders = orders.filter((o) => statusFilter.includes(o.paymentStatus));
    }

    // Order type filtering
    if (orderTypeFilter.length > 0) {
      orders = orders.filter((o) => orderTypeFilter.includes(o.type));
    }

    // Sorting
    orders.sort((a, b) => {
      let comparison = 0;
      switch (sortBy) {
        case "date":
          // Use timestamp field directly (more reliable than parsing orderDate)
          const aTimestamp = a.timestamp ? new Date(a.timestamp).getTime() : new Date(a.orderDate).getTime();
          const bTimestamp = b.timestamp ? new Date(b.timestamp).getTime() : new Date(b.orderDate).getTime();
          comparison = bTimestamp - aTimestamp;
          break;
        case "total":
          comparison = b.total - a.total;
          break;
        case "status":
          comparison = a.paymentStatus.localeCompare(b.paymentStatus);
          break;
      }
      return sortOrder === "asc" ? -comparison : comparison;
    });

    return orders;
  }, [previousOrders, searchText, dateRange, statusFilter, orderTypeFilter, sortBy, sortOrder]);

  const handleOpenNotes = (order: PreviousOrder) => {
    setSelectedOrder(order);
    setActiveModal("notes");
  };

  const handleOpenDelete = (order: PreviousOrder) => {
    setSelectedOrder(order);
    setActiveModal("delete");
  };

  const handleOpenPrint = (order: PreviousOrder) => {
    setSelectedOrder(order);
    setActiveModal("print");
  };

  const handleConfirmDelete = () => {
    if (selectedOrderItems) {
      // This needs to be implemented with actual state management for MOCK_PREVIOUS_ORDERS
      console.log("Deleting order:", selectedOrder?.orderId);
    }
    setActiveModal(null); // Close the modal
  };

  const handleCloseCheck = async (order: PreviousOrder) => {
    if (!order.db_order_id) {
      console.warn("Cannot close check - no db_order_id");
      return;
    }

    try {
      const supabase = getOrderStoreSupabaseClient();
      const { activeEmployeeId } = useEmployeeStore.getState();

      const { data, error } = await supabase?.rpc("close_check", {
        p_order_id: order.db_order_id,
        p_staff_id: activeEmployeeId,
      });

      if (error) throw error;

      console.log("Check closed successfully");
      // The store will update automatically via realtime sync
    } catch (err) {
      console.error("Failed to close check:", err);
    }
  };

  const handleReopenCheck = async (order: PreviousOrder) => {
    if (!order.db_order_id) {
      console.warn("Cannot reopen check - no db_order_id");
      return;
    }

    try {
      const supabase = getOrderStoreSupabaseClient();
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
  };

  const handleRefund = (order: PreviousOrder) => {
    setSelectedOrder(order);
    setActiveModal("refund");
  };

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
              <HeaderCell
                key={col.label}
                label={col.label}
                width={col.width}
              />
            ))}
          </View>

          {/* Table Body */}
          <FlatList
            data={filteredOrders}
            keyExtractor={(item) => item.serialNo}
            renderItem={({ item }) => (
              <PreviousOrderRow
                order={item}
                onViewNotes={handleOpenNotes}
                onDelete={() => handleOpenDelete(item)}
                onPrint={() => handleOpenPrint(item)}
                onCloseCheck={handleCloseCheck}
                onReopenCheck={handleReopenCheck}
                onRefund={handleRefund}
              />
            )}
            ListEmptyComponent={
              <View className="items-center justify-center py-8">
                <Text className="text-xl text-gray-500">
                  No orders found for this date.
                </Text>
              </View>
            }
          />
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

        <PrintReceiptModal
          isOpen={activeModal === "print"}
          onClose={() => setActiveModal(null)}
          order={selectedOrder}
        />

        <AdvancedRefundModal
          isOpen={activeModal === "refund"}
          onClose={() => setActiveModal(null)}
          order={selectedOrder}
        />
      </View>
    </KeyboardAvoidingView>
  );
};

export default PreviousOrdersScreen;
