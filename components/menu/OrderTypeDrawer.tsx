import { useToast } from "@/contexts/ToastContext";
import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { useCustomerStore } from "@/stores/useCustomerStore";
import { useDineInStore } from "@/stores/useDineInStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { FloorPlanObject } from "@/types/db-floor-plan-types";
import { useRouter } from "expo-router";
import { ChevronDown, Edit3, Plus, User } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import { formatAddress } from "../bill/CustomerSheet";
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

  // Use FloorPlanStore correctly
  const { floorPlans, activeFloorPlanId, setActiveFloorPlan, tables } =
    useFloorPlanStore();
  const { show } = useToast();

  const { selectedTable, setSelectedTable, clearSelectedTable } =
    useDineInStore();
  const activeOrder = useOrderStore((state) =>
    state.orders.find((order) => order.id === activeOrderId),
  );

  const { openSheet } = useCustomerSheetStore();

  // Floor selection state.
  // We sync selectedFloor with activeFloorPlanId roughly, or allow mismatch?
  // If we change selectedFloor, we should update activeFloorPlanId so 'tables' updates.

  const [showFloorModal, setShowFloorModal] = useState(false);
  const selectedFloor = activeFloorPlanId;
  // We use activeFloorPlanId directly as "selected floor".

  const [isGuestModalOpen, setGuestModalOpen] = useState(false);

  const orderTypes = [
    { value: "dine_in", label: "Dine In" },
    { value: "takeout", label: "Takeaway" },
    { value: "delivery", label: "Delivery" },
  ];

  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);

  // Tables are now just 'tables' from store (for active floor)
  const floorTables = tables;

  // Get available tables for the selected floor
  const availableFloorTables = useMemo(() => {
    return floorTables.filter(
      (table) => (table.session?.status || "available") === "available",
    );
  }, [floorTables]);

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

    show({
      title: "Customer Assigned",
      message: `${customer.name} has been successfully assigned to this order.`,
      type: "success",
    });
  };

  const handleFloorSelect = (floorId: string) => {
    setActiveFloorPlan(floorId);
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
        order_type: "dine_in",
        guest_count: guestCount,
      });
      // updateTableStatus(selectedTable.id, "In Use"); // Removed

      // Start a new order for the order-processing screen
      const newOrder = startNewOrder();
      setActiveOrder(newOrder.id);

      // Navigate to the table screen
      setGuestModalOpen(false);
      onClose();

      // Navigate to the table screen
      // Navigate to the table screen with source info
      router.push({
        pathname: "/tables/[tableId]",
        params: { tableId: selectedTable.id, source: "/menu" },
      });

      show({
        title: "Order Transferred",
        message: `The order has been successfully transferred to Table ${selectedTable.name}.`,
        type: "success",
      });
    } else {
      // Create a new order and assign it to the table (existing flow)
      const newOrder = startNewOrder({ guestCount, tableId: selectedTable.id });
      setActiveOrder(newOrder.id);
      // updateTableStatus(selectedTable.id, "In Use"); // Removed

      // Close all modals/drawers and navigate to the new table screen
      setGuestModalOpen(false);
      onClose();

      // Navigate to the table screen
      // Navigate to the table screen with source info
      router.push({
        pathname: "/tables/[tableId]",
        params: { tableId: selectedTable.id, source: "/menu" },
      });
    }
  };

  const handleTableSelect = (table: FloorPlanObject) => {
    if ((table.session?.status || "available") !== "available") {
      show({
        title: "Table Unavailable",
        message: `Table ${table.name} is currently occupied or unavailable.`,
        type: "error",
      });
      return;
    }

    setSelectedTable(table);
    setGuestModalOpen(true);

    show({
      title: "Table Selected",
      message: `Table ${table.name} has been selected. Please set the guest count.`,
      type: "success",
    });
  };

  // Function to assign the selected table to the active order
  const assignSelectedTableToOrder = () => {
    if (selectedTable && activeOrderId) {
      assignOrderToTable(activeOrderId, selectedTable.id);
      // updateTableStatus(selectedTable.id, "In Use"); // Removed
      return true;
    }
    return false;
  };

  if (!isVisible) return null;
  return (
    <View className="absolute inset-0 z-50">
      <TouchableOpacity
        className="flex-1 bg-black/50"
        onPress={onClose}
        activeOpacity={1}
      />
      <ScrollView
        bounces={false}
        className="absolute left-0 top-0 bottom-0 w-[85%] bg-[#303030] shadow-2xl"
      >
        <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
          <Text className="text-2xl font-bold text-white">Order Type</Text>
          <TouchableOpacity
            onPress={onClose}
            className="w-1/4 py-3 bg-green-600 rounded-lg items-center"
          >
            <Text className="text-xl font-semibold text-white">Done</Text>
          </TouchableOpacity>
        </View>

        <View className="flex-1 p-4">
          <View className="mb-4">
            <View className="gap-y-2">
              {orderTypes.map((orderType) => (
                <TouchableOpacity
                  key={orderType.value}
                  onPress={() => {
                    onOrderTypeSelect(orderType.value);
                    if (activeOrderId) {
                      updateActiveOrderDetails({
                        order_type: orderType.value as any,
                      });
                    }
                  }}
                  className="flex-row items-center p-3 rounded-lg"
                >
                  <View
                    className={`w-10 h-10 rounded-full border-2 border-gray-400 mr-3 items-center justify-center`}
                  >
                    {currentOrderType === orderType.value && (
                      <View className="w-6 h-6 bg-blue-500 rounded-full" />
                    )}
                  </View>
                  <Text className="text-white font-medium text-xl">
                    {orderType.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
          <View className="h-[1px] bg-gray-700 w-full mx-auto" />

          {(currentOrderType === "delivery" ||
            currentOrderType === "takeout") && (
            <View className="mt-4">
              <Text className="text-white font-semibold text-2xl mb-3">
                Customer Information
              </Text>
              <TouchableOpacity
                onPress={openSheet}
                className="flex-row items-center p-3 border-2 border-dashed border-gray-600 rounded-lg bg-[#212121] min-h-[70px]"
              >
                {activeOrder?.customer_name ? (
                  <>
                    <User color="#A5A5B5" size={24} />
                    <View className="ml-3 flex-1">
                      <Text
                        className="text-xl font-semibold text-white"
                        numberOfLines={1}
                      >
                        {activeOrder.customer_name}
                      </Text>
                      {activeOrder.customer_phone && (
                        <Text className="text-lg text-gray-400">
                          {activeOrder.customer_phone}
                        </Text>
                      )}
                    </View>
                    <Edit3 color="#60A5FA" size={20} />
                  </>
                ) : (
                  <>
                    <Plus color="#9CA3AF" size={20} />
                    <Text className="text-xl font-semibold text-gray-300 ml-2">
                      Add Customer
                    </Text>
                  </>
                )}
              </TouchableOpacity>
              {currentOrderType === "delivery" && (
                <View className="mt-3">
                  <Text className="text-gray-300 text-lg font-medium mb-1">
                    Delivery Address
                  </Text>
                  <View className="w-full p-3 border border-gray-600 rounded-lg bg-[#212121] h-16 justify-center">
                    <Text className="text-xl text-white">
                      {formatAddress(activeOrder?.delivery_address) ||
                        "No address set"}
                    </Text>
                  </View>
                </View>
              )}
            </View>
          )}

          {currentOrderType === "dine_in" && (
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
                      ? floorPlans.find((l) => l.id === selectedFloor)?.name ||
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
                    Floor:{" "}
                    {floorPlans.find((l) => l.id === selectedFloor)?.name}
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

      {/* Floor Selection Modal */}
      <Dialog open={showFloorModal} onOpenChange={setShowFloorModal}>
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
              {floorPlans.map((layout, index) => (
                <TouchableOpacity
                  key={layout.id}
                  onPress={() => handleFloorSelect(layout.id)}
                  className={`p-4 border-b border-gray-600 last:border-b-0 ${
                    selectedFloor === layout.id
                      ? "bg-blue-600/20 border-l-4 border-l-blue-500"
                      : ""
                  }`}
                >
                  <View className="flex-row items-center justify-between">
                    <View>
                      <Text
                        className={`text-lg font-semibold ${
                          selectedFloor === layout.id
                            ? "text-blue-400"
                            : "text-white"
                        }`}
                      >
                        {layout.name}
                      </Text>
                      {/* We don't have tables for inactive floors unless we fetch them. 
                          For now, just omit counts for inactive floors, or show '?' 
                          Or rely on 'tables' being correct if we switch. 
                          BUT here we are listing ALL floors.
                          The store only has tables for ONE.
                          So we can't show counts for others.
                      */}
                      <Text className="text-sm text-gray-400">
                        {selectedFloor === layout.id
                          ? `${tables.length} tables`
                          : "Select to view"}
                      </Text>
                    </View>
                    {selectedFloor === layout.id && (
                      <View className="w-6 h-6 bg-blue-500 rounded-full items-center justify-center">
                        <Text className="text-white text-sm font-bold">✓</Text>
                      </View>
                    )}
                  </View>
                  {index !== floorPlans.length - 1 && (
                    <Separator orientation="horizontal" />
                  )}
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
