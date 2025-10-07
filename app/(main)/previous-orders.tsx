import DateRangePicker, { DateRange } from "@/components/DateRangePicker";
import OrderNotesModal from "@/components/previous-orders/OrderNotesModal";
import PreviousOrderRow from "@/components/previous-orders/PreviousOrderRow";
import PrintReceiptModal from "@/components/previous-orders/PrintReceiptModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { CartItem, PreviousOrder } from "@/lib/types";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { Search } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { DimensionValue, FlatList, Text, TextInput, View } from "react-native";

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
    "notes" | "print" | "delete" | "modifiers" | null
  >(null);

  const [selectedOrderItems, setSelectedOrderItems] = useState<CartItem[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PreviousOrder | null>(
    null
  );
  const [dateRange, setDateRange] = useState<DateRange>({
    from: new Date(),
    to: new Date(),
  });

  // State for filters would go here
  const [searchText, setSearchText] = useState("");

  const { previousOrders } = usePreviousOrdersStore();

  // Get orders from the store
  const filteredOrders = useMemo(() => {
    let orders = [...previousOrders];

    if (dateRange.from) {
      // 1. Create a UTC start date for comparison
      const startDate = new Date(dateRange.from);
      startDate.setUTCHours(0, 0, 0, 0);

      // 2. Create a UTC end date for comparison
      const endDate = dateRange.to
        ? new Date(dateRange.to)
        : new Date(dateRange.from);
      endDate.setUTCHours(23, 59, 59, 999);

      orders = orders.filter((order) => {
        // Parse the date string manually
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

        // Create date as UTC
        const orderDate = new Date(Date.UTC(year, month, day));

        return orderDate >= startDate && orderDate <= endDate;
      });
    }

    if (searchText.trim()) {
      const lowerQuery = searchText.toLowerCase();
      orders = orders.filter(
        (order) =>
          order.orderId.toLowerCase().includes(lowerQuery) ||
          order.customer.toLowerCase().includes(lowerQuery)
      );
    }

    return orders.sort(
      (a, b) =>
        new Date(b.orderDate).getTime() - new Date(a.orderDate).getTime()
    );
  }, [previousOrders, searchText, dateRange]);

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

  return (
    <View className="flex-1 p-4 bg-[#212121]">
      {/* Toolbar */}
      <View className="flex-row items-center justify-between mb-4">
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

      {/* Table */}
      <View className="flex-1 bg-[#303030] rounded-xl border border-gray-700">
        {/* Table Header */}
        <View className="flex-row p-4 border-b border-gray-700">
          {columns.map((col) => (
            <HeaderCell key={col.label} label={col.label} width={col.width} />
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
    </View>
  );
};

export default PreviousOrdersScreen;
