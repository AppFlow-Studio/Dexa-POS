import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { useCustomerStore } from "@/stores/useCustomerStore";
import { useDineInStore } from "@/stores/useDineInStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { useRouter } from "expo-router";
import { ChevronDown, Edit3, Plus, User } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { GuestCountModal } from "../tables/GuestCountModal";
import TableLayoutView from "../tables/TableLayoutView";
import { Dialog, DialogContent } from "../ui/dialog";
import { Separator } from "../ui/separator";

interface OrderTypeDrawerProps {
  isVisible: boolean;
  onClose: () => void;
  onOrderTypeSelect: (orderType: string) => void;
  currentOrderType?: string;
}

const OrderTypeDrawer: React.FC<OrderTypeDrawerProps> = ({
  isVisible,
  onClose,
  onOrderTypeSelect,
  currentOrderType,
}) => {
  const router = useRouter();
  const {
    activeOrderId,
    updateActiveOrderDetails,
    assignOrderToTable,
    startNewOrder,
    setActiveOrder,
  } = useOrderStore();
  const {
    addCustomer,
    findCustomerByPhone,
    incrementOrderCount,
    searchCustomersByPhone,
  } = useCustomerStore();
  const { layouts, updateTableStatus } = useFloorPlanStore();

  const { selectedTable, setSelectedTable, clearSelectedTable } =
    useDineInStore();
  const activeOrder = useOrderStore((state) =>
    state.orders.find((order) => order.id === activeOrderId)
  );

  const { openSheet } = useCustomerSheetStore();

  // Floor selection state
  const [selectedFloor, setSelectedFloor] = useState<string | null>(null);
  const [showFloorModal, setShowFloorModal] = useState(false);
  const [isGuestModalOpen, setGuestModalOpen] = useState(false);

  const orderTypes = [
    { value: "Dine In", label: "Dine In" },
    { value: "Take Away", label: "Take Away" },
    { value: "Delivery", label: "Delivery" },
  ];

  // Customer info state
  // const [customerName, setCustomerName] = useState("");
  // const [phoneNumber, setPhoneNumber] = useState("");
  // const [address, setAddress] = useState("");
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);

  const allTables = useMemo(() => layouts.flatMap((l) => l.tables), [layouts]);

  // Get tables for the selected floor
  const floorTables = useMemo(() => {
    if (!selectedFloor) return [];
    const layout = layouts.find((l) => l.id === selectedFloor);
    return layout ? layout.tables : [];
  }, [selectedFloor, layouts]);

  // Get available tables for the selected floor
  const availableFloorTables = useMemo(() => {
    return floorTables.filter((table) => table.status === "Available");
  }, [floorTables]);

  // Check for existing customer when phone number changes
  // useEffect(() => {
  //   if (phoneNumber.length >= 3) {
  //     const suggestions = searchCustomersByPhone(phoneNumber);
  //     setCustomerSuggestions(suggestions);
  //     setShowSuggestions(suggestions.length > 0);
  //   } else {
  //     setShowSuggestions(false);
  //     setCustomerSuggestions([]);
  //   }

  //   if (phoneNumber.length >= 10) {
  //     const existingCustomer = findCustomerByPhone(phoneNumber);
  //     if (existingCustomer) {
  //       setCustomerName(existingCustomer.name);
  //       setAddress(existingCustomer.address || "");
  //       setIsExistingCustomer(true);
  //       setShowSuggestions(false);
  //     } else {
  //       setIsExistingCustomer(false);
  //     }
  //   }
  // }, [phoneNumber, findCustomerByPhone, searchCustomersByPhone]);

  // const handleSelectCustomer = (customer: any) => {
  //   setPhoneNumber(customer.phoneNumber);
  //   setCustomerName(customer.name);
  //   setAddress(customer.address || "");
  //   setIsExistingCustomer(true);
  //   setShowSuggestions(false);
  //   setCustomerSuggestions([]);

  //   // Assign customer to order immediately
  //   assignCustomerToOrder(customer);
  // };

  const assignCustomerToOrder = (customer: any) => {
    if (activeOrderId) {
      updateActiveOrderDetails({
        customer_name: customer.name,
        customer_phone: customer.phoneNumber,
        delivery_address:
          currentOrderType === "Delivery" ? customer.address : undefined,
      });
    }

    // Increment order count for existing customer
    incrementOrderCount(customer.id);

    toast.success("Customer assigned to order", {
      duration: 2000,
      position: ToastPosition.BOTTOM,
    });
  };

  // const handleSaveNewCustomer = () => {
  //   if (!customerName.trim() || !phoneNumber.trim()) {
  //     toast.error("Please fill in name and phone number", {
  //       duration: 3000,
  //       position: ToastPosition.BOTTOM,
  //     });
  //     return;
  //   }

  //   if (currentOrderType === "Delivery" && !address.trim()) {
  //     toast.error("Please provide delivery address", {
  //       duration: 3000,
  //       position: ToastPosition.BOTTOM,
  //     });
  //     return;
  //   }

  //   // Create new customer
  //   const newCustomer = addCustomer({
  //     name: customerName.trim(),
  //     phoneNumber: phoneNumber.trim(),
  //     address: currentOrderType === "Delivery" ? address.trim() : undefined,
  //   });

  //   // Assign customer to order
  //   assignCustomerToOrder(newCustomer);

  //   setIsExistingCustomer(true);
  //   setShowSuggestions(false);
  // };

  const handleFloorSelect = (floorId: string) => {
    setSelectedFloor(floorId);
    setShowFloorModal(false);
    // Clear selected table when changing floors
    setSelectedTable(null);
  };

  const handleGuestCountSubmit = (guestCount: number) => {
    if (!selectedTable) return;

    // Check if there's an active order with items
    if (activeOrderId && activeOrder && activeOrder.items.length > 0) {
      // Transfer existing order to the table
      assignOrderToTable(activeOrderId, selectedTable.id);
      updateActiveOrderDetails({
        order_type: "Dine In",
        guest_count: guestCount,
      });
      updateTableStatus(selectedTable.id, "In Use");

      // Start a new order for the order-processing screen
      const newOrder = startNewOrder();
      setActiveOrder(newOrder.id);

      // Navigate to the table screen
      setGuestModalOpen(false);
      onClose();

      // Navigate to the table screen
      router.push(`/tables/${selectedTable.id}`);

      toast.success(`Order transferred to Table ${selectedTable.name}`, {
        duration: 3000,
        position: ToastPosition.BOTTOM,
      });
    } else {
      // Create a new order and assign it to the table (existing flow)
      const newOrder = startNewOrder({ guestCount, tableId: selectedTable.id });
      setActiveOrder(newOrder.id);
      updateTableStatus(selectedTable.id, "In Use");

      // Close all modals/drawers and navigate to the new table screen
      setGuestModalOpen(false);
      onClose();

      // Navigate to the table screen
      router.push(`/tables/${selectedTable.id}`);
    }
  };

  const handleTableSelect = (table: any) => {
    if (table.status !== "Available") {
      toast.error(`Table ${table.name} is not available`, {
        duration: 3000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    setSelectedTable(table);
    setGuestModalOpen(true);

    // Just store the table selection - don't assign yet
    // Assignment will happen when user pays or sends to kitchen
    toast.success(`Table ${table.name} selected`, {
      duration: 2000,
      position: ToastPosition.BOTTOM,
    });
  };

  // Function to assign the selected table to the active order
  const assignSelectedTableToOrder = () => {
    if (selectedTable && activeOrderId) {
      assignOrderToTable(activeOrderId, selectedTable.id);
      updateTableStatus(selectedTable.id, "In Use");
      return true;
    }
    return false;
  };

  if (!isVisible) return null;
  return (
    <View className="absolute inset-0 z-50">
      {/* Backdrop */}
      <TouchableOpacity
        className="flex-1 bg-black/50"
        onPress={onClose}
        activeOpacity={1}
      />

      {/* Drawer */}
      <ScrollView
        bounces={false}
        className="absolute left-0 top-0 bottom-0 w-[85%] bg-[#303030] shadow-2xl"
      >
        {/* Header */}
        <View className="flex-row items-center justify-between p-6 border-b border-gray-200">
          <Text className="text-3xl font-bold text-white">Order Type</Text>
          {/* <TouchableOpacity
                        onPress={onClose}
                        className="p-2 rounded-full bg-gray-100"
                    >
                        <X color="#6B7280" size={24} />
                    </TouchableOpacity> */}
          {/* Footer */}
          <TouchableOpacity
            onPress={onClose}
            className="w-1/4 py-4 bg-green-600 rounded-lg items-center"
          >
            <Text className="text-2xl font-semibold text-white">Done</Text>
          </TouchableOpacity>
        </View>

        {/* Content */}
        <View className="flex-1 p-6">
          {/* Common Order Types */}
          <View className="mb-6">
            <View className="gap-y-3">
              {orderTypes.map((orderType) => (
                <TouchableOpacity
                  key={orderType.value}
                  onPress={() => {
                    onOrderTypeSelect(orderType.value);
                    // Update order type in the store
                    if (activeOrderId) {
                      updateActiveOrderDetails({
                        order_type: orderType.value as any,
                      });
                    }
                    // onClose();
                  }}
                  className="flex-row items-center p-4 rounded-lg hover:bg-gray-50"
                >
                  <View
                    className={`w-12 h-12 rounded-full border-2 border-gray-300 mr-4 items-center justify-center`}
                  >
                    {currentOrderType === orderType.value && (
                      <View className="w-7 h-7 bg-blue-600 rounded-full" />
                    )}
                  </View>
                  <Text className="text-white font-medium text-2xl">
                    {orderType.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View className="h-[1px] bg-gray-200 w-[90%] mx-auto " />

          {/* Customer Info Section for Delivery/Take Away */}
          {(currentOrderType === "Delivery" ||
            currentOrderType === "Take Away") && (
              <View className="mt-6">
                <Text className="text-white font-semibold text-3xl mb-4">
                  Customer Information
                </Text>

                <TouchableOpacity
                  onPress={openSheet} // 3. This now opens the global customer sheet
                  className="flex-row items-center p-4 border-2 border-dashed border-gray-700 rounded-lg bg-[#212121] min-h-[80px]"
                >
                  {activeOrder?.customer_name ? (
                    <>
                      <User color="#A5A5B5" size={32} />
                      <View className="ml-4 flex-1">
                        <Text
                          className="text-2xl font-semibold text-white"
                          numberOfLines={1}
                        >
                          {activeOrder.customer_name}
                        </Text>
                        {activeOrder.customer_phone && (
                          <Text className="text-xl text-gray-400">
                            {activeOrder.customer_phone}
                          </Text>
                        )}
                      </View>
                      <Edit3 color="#60A5FA" size={24} />
                    </>
                  ) : (
                    <>
                      <Plus color="#9CA3AF" size={24} />
                      <Text className="text-2xl font-semibold text-gray-300 ml-3">
                        Add Customer to Order
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* Address field is only shown for delivery and is now read-only */}
                {currentOrderType === "Delivery" && (
                  <View className="mt-4">
                    <Text className="text-gray-300 text-xl font-medium mb-1">
                      Delivery Address
                    </Text>
                    <View className="w-full p-4 border border-gray-600 rounded-lg bg-[#212121] h-20 justify-center">
                      <Text className="text-2xl text-white">
                        {activeOrder?.delivery_address || "No address set"}
                      </Text>
                    </View>
                  </View>
                )}
              </View>
            )}

          {/* Table Selection Section for Dine In */}
          {currentOrderType === "Dine In" && (
            <View className="mt-6 flex-1">
              <Text className="text-white font-semibold text-2xl mb-4">
                Select Table
              </Text>

              {/* Floor Selection Dropdown */}
              <View className="mb-4">
                <Text className="text-gray-300 text-lg font-medium mb-2">
                  Select Floor
                </Text>
                <TouchableOpacity
                  onPress={() => setShowFloorModal(true)}
                  className="flex-row items-center justify-between p-4 bg-[#404040] border border-gray-600 rounded-lg"
                >
                  <Text className="text-white text-lg">
                    {selectedFloor
                      ? layouts.find((l) => l.id === selectedFloor)?.name ||
                      "Select Floor"
                      : "Select Floor"}
                  </Text>
                  <ChevronDown color="#9CA3AF" size={20} />
                </TouchableOpacity>
              </View>

              {/* Selected Table Info */}
              {selectedTable && (
                <View className="mb-4 p-4 bg-green-600/20 border border-green-600 rounded-lg">
                  <Text className="text-green-400 font-medium text-xl">
                    ✓ Selected: {selectedTable.name}
                  </Text>
                  <Text className="text-xl text-green-300">
                    Capacity: {selectedTable.capacity} people
                  </Text>
                  <Text className="text-lg text-green-300">
                    Floor: {layouts.find((l) => l.id === selectedFloor)?.name}
                  </Text>
                </View>
              )}

              {/* Table Layout View - Only show if floor is selected */}
              {selectedFloor && (
                <View className="flex-1 min-h-[350px] border border-gray-600 rounded-lg">
                  <TableLayoutView
                    layoutId={selectedFloor!}
                    tables={floorTables}
                    isSelectionMode={true}
                    selectedTableId={selectedTable?.id}
                    onTableSelect={handleTableSelect}
                    activeOrderId={activeOrderId}
                    showConnections={false}
                  />
                </View>
              )}

              {/* No floor selected message */}
              {!selectedFloor && (
                <View className="flex-1 border border-gray-600 rounded-lg p-8 items-center justify-center">
                  <Text className="text-gray-400 text-lg text-center">
                    Please select a floor to view available tables
                  </Text>
                </View>
              )}

              {/* No available tables message */}
              {selectedFloor && availableFloorTables.length === 0 && (
                <View className="p-4 bg-red-600/20 border border-red-600 rounded-lg">
                  <Text className="text-2xl text-red-400 font-medium">
                    No available tables
                  </Text>
                  <Text className="text-xl text-red-300">
                    All tables on this floor are currently in use
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </ScrollView>

      <GuestCountModal
        isOpen={isGuestModalOpen}
        onClose={() => {
          setGuestModalOpen(false);
          clearSelectedTable(); // Deselect table if modal is cancelled
        }}
        onSubmit={handleGuestCountSubmit}
      />

      <GuestCountModal
        isOpen={isGuestModalOpen}
        onClose={() => {
          setGuestModalOpen(false);
          clearSelectedTable(); // Deselect table if modal is cancelled
        }}
        onSubmit={handleGuestCountSubmit}
      />

      {/* Floor Selection Modal */}
      <Dialog
        open={showFloorModal}
        onOpenChange={setShowFloorModal}
      >
        <DialogContent className="bg-[#303030] border-gray-700 h-[700px] w-[700px]">
          <View className="bg-[#303030] rounded-2xl border border-gray-600 w-full">
            {/* Modal Header */}
            <View className="flex-row items-center w-full justify-between p-6 border-b border-gray-600">
              <Text className="text-xl font-bold text-white">Select Floor</Text>
              <TouchableOpacity
                onPress={() => setShowFloorModal(false)}
                className="p-2"
              >
                <Text className="text-gray-400 text-lg">Cancel</Text>
              </TouchableOpacity>
            </View>

            {/* Floor List */}
            <ScrollView className="h-[87%]">
              {layouts.map((layout, index) => (
                <TouchableOpacity
                  key={layout.id}
                  onPress={() => handleFloorSelect(layout.id)}
                  className={`p-4 border-b border-gray-600 last:border-b-0 ${selectedFloor === layout.id
                    ? "bg-blue-600/20 border-l-4 border-l-blue-500"
                    : ""
                    }`}
                >
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text
                        className={`text-lg font-semibold ${selectedFloor === layout.id
                          ? "text-blue-400"
                          : "text-white"
                          }`}
                      >
                        {layout.name}
                      </Text>
                      <Text className="text-sm text-gray-400">
                        {layout.tables.length} tables
                      </Text>
                      <Text className="text-sm text-gray-400">
                        {
                          layout.tables.filter((t) => t.status === "Available")
                            .length
                        }{" "}
                        available
                      </Text>
                    </View>
                    {selectedFloor === layout.id && (
                      <View className="w-6 h-6 bg-blue-500 rounded-full items-center justify-center">
                        <Text className="text-white text-sm font-bold">✓</Text>
                      </View>
                    )}
                  </View>
                  {index !== layouts.length - 1 && <Separator orientation="horizontal" />}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </DialogContent>
      </Dialog>
    </View>
  );
};

export default OrderTypeDrawer;
