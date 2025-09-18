import DatePicker from "@/components/date-picker";
import OrderNotesModal from "@/components/previous-orders/OrderNotesModal";
import PreviousOrderRow from "@/components/previous-orders/PreviousOrderRow";
import PrintReceiptModal from "@/components/previous-orders/PrintReceiptModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { CartItem, PreviousOrder } from "@/lib/types";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { Search } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { FlatList, Text, TextInput, View } from "react-native";

const TABLE_HEADERS = [
  "# Serial No",
  "Order Date",
  "Order ID",
  "Customer",
  "Payment Status",
  "Server/Cashier",
  "Items in order",
  "Dine In/Takout",
  "Total",
  "Order Notes",
  "",
];

const PreviousOrdersScreen = () => {
  // State for the notes modal
  const [activeModal, setActiveModal] = useState<
    "notes" | "print" | "delete" | "modifiers" | null
  >(null);

  const [selectedOrderItems, setSelectedOrderItems] = useState<CartItem[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<PreviousOrder | null>(
    null
  );
  const [selectedDate, setSelectedDate] = useState(new Date());

  // State for filters would go here
  const [searchText, setSearchText] = useState("");

  const { previousOrders } = usePreviousOrdersStore();

  // Get orders from the store
  const filteredOrders = useMemo(() => {
    // Start with all orders for the selected date
    const dateString = selectedDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    let orders = previousOrders.filter(
      (order) => order.orderDate === dateString
    );

    // If there is search text, further filter the date-filtered list
    if (searchText.trim()) {
      const lowerQuery = searchText.toLowerCase();
      orders = orders.filter(
        (order) =>
          order.orderId.toLowerCase().includes(lowerQuery) ||
          order.customer.toLowerCase().includes(lowerQuery)
      );
    }

    return orders;
  }, [previousOrders, searchText, selectedDate]);

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
    <View className="flex-1 p-6 bg-[#212121]">
      {/* Toolbar */}
      <View className="flex-row items-center justify-between mb-6">
        <View className="flex-row items-center bg-[#303030] border border-gray-700 rounded-lg px-4 w-[450px]">
          <Search color="#9CA3AF" size={24} />
          <TextInput
            placeholder="Search Order ID or Customer Name..."
            placeholderTextColor="#9CA3AF"
            value={searchText}
            onChangeText={setSearchText}
            className="ml-3 text-2xl h-16 flex-1 text-white"
          />
        </View>
        <DatePicker date={selectedDate} onDateChange={setSelectedDate} />
      </View>

      {/* Table */}
      <View className="flex-1 bg-[#303030] rounded-xl border border-gray-700">
        {/* Table Header */}
        <View className="flex-row p-6 border-b border-gray-700">
          {TABLE_HEADERS.map((header, index) => (
            <Text
              key={header}
              className="font-bold text-xl text-gray-400"
              style={{
                width:
                  header === "Order Notes"
                    ? "12%"
                    : header === "Customer"
                      ? "12%"
                      : header === ""
                        ? "5%"
                        : header === "Items"
                          ? "7%"
                          : "9%",
              }}
            >
              {header}
            </Text>
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
            <View className="items-center justify-center py-10">
              <Text className="text-2xl text-gray-500">
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
