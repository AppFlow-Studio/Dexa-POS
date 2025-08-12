import OrderNotesModal from "@/components/previous-orders/OrderNotesModal";
import PreviousOrderRow from "@/components/previous-orders/PreviousOrderRow";
import PrintReceiptModal from "@/components/previous-orders/PrintReceiptModal";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { MOCK_PREVIOUS_ORDERS } from "@/lib/mockData";
import { CartItem, PreviousOrder } from "@/lib/types";
import { Calendar, Search } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import {
  FlatList,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

const TABLE_HEADERS = [
  "# Serial No",
  "Order Date",
  "Order ID",
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

  // State for filters would go here
  const [searchText, setSearchText] = useState("");
  const filteredOrders = useMemo(() => MOCK_PREVIOUS_ORDERS, []); // Add filtering logic later

  const handleViewNotes = (items: PreviousOrder["items"]) => {
    setSelectedOrderItems(items);
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
    <View className="flex-1 p-6 bg-white">
      {/* Toolbar */}
      <View className="flex-row items-center justify-between my-4">
        <View className="flex-row items-center bg-gray-100 rounded-lg p-3 w-[300px]">
          <Search color="#6b7280" size={20} />
          <TextInput
            placeholder="Search Order"
            className="ml-2 text-base flex-1"
          />
        </View>
        <TouchableOpacity className="flex-row items-center p-3 bg-gray-100 rounded-lg">
          <Text className="font-semibold text-gray-600 mr-2">
            Date: 02/03/25
          </Text>
          <Calendar color="#6b7280" size={20} />
        </TouchableOpacity>
      </View>

      {/* Table */}
      <View className="flex-1 border border-gray-200 rounded-xl">
        {/* Table Header */}
        <View className="flex-row p-4 bg-gray-50 rounded-t-xl border-b border-gray-200">
          {TABLE_HEADERS.map((header, index) => {
            const widths: Record<number, string> = {
              0: "w-[8%]",
              1: "w-[12%]",
              2: "w-[10%]",
              3: "w-[12%]",
              4: "w-[12%]",
              5: "w-[10%]",
              6: "w-[10%]",
              7: "w-[10%]",
              8: "w-[10%]",
              9: "w-[6%]",
            };
            return (
              <Text
                key={header}
                className={`font-bold text-sm text-gray-500 ${widths[index]}`}
              >
                {header}
              </Text>
            );
          })}
        </View>
        {/* Table Body */}
        <FlatList
          data={filteredOrders}
          keyExtractor={(item) => item.serialNo}
          renderItem={({ item }) => (
            <PreviousOrderRow
              order={item}
              onViewNotes={handleViewNotes}
              onDelete={() => handleOpenDelete(item)}
              onPrint={() => handleOpenPrint(item)}
            />
          )}
        />
      </View>

      <OrderNotesModal
        isOpen={activeModal === "notes"}
        onClose={() => setActiveModal(null)}
        items={selectedOrderItems}
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
