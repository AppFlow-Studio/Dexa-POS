import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useOrderTypeDrawerStore } from "@/stores/useOrderTypeDrawerStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Edit3, Plus, User } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";
import { Label } from "../ui/label";

// Define a consistent type for our dropdown options
type SelectOption = { label: string; value: string };

// Static options for the Order Type dropdown
// const ORDER_TYPE_OPTIONS: SelectOption[] = [
//   { label: "Dine In", value: "Dine In" },
//   { label: "Take Away", value: "Take Away" },
//   { label: "Delivery", value: "Delivery" },
// ];

const OrderDetails: React.FC = () => {
  const { layouts } = useFloorPlanStore();

  const {
    activeOrderId,
    orders,
    updateActiveOrderDetails,
    updateOrderStatus,
    assignActiveOrderToTable,
    assignOrderToTable,
    addItemToActiveOrder,
    setPendingTableSelection,
  } = useOrderStore();
  const { openDrawer } = useOrderTypeDrawerStore();
  const { openSheet } = useCustomerSheetStore();
  // Find the full active order object
  const activeOrder = orders.find((o) => o.id === activeOrderId);
  const currentOrderType = activeOrder?.order_type || "Take Away";

  // The state now reflects the data from the global store
  const [selectedTable, setSelectedTable] = useState<SelectOption | undefined>(
    undefined
  );
  // Temporary storage for selected table (not yet assigned to order)
  const [pendingTableSelection, setLocalPendingTableSelection] = useState<
    SelectOption | undefined
  >(undefined);

  // Open Item Modal State
  const [isOpenItemModalVisible, setIsOpenItemModalVisible] = useState(false);
  const [openItemName, setOpenItemName] = useState("");
  const [openItemPrice, setOpenItemPrice] = useState("");

  // Order naming state
  const [customerName, setCustomerName] = useState("");
  const [isCustomerNameModalVisible, setIsCustomerNameModalVisible] =
    useState(false);
  const [tempCustomerName, setTempCustomerName] = useState("");

  const allTables = useMemo(
    () => layouts.flatMap((layout) => layout.tables),
    [layouts]
  );

  const availableTableOptions = useMemo(() => {
    return allTables
      .filter(
        (t) =>
          t.status === "Available" || t.id === activeOrder?.service_location_id
      )
      .map((t) => ({ label: t.name, value: t.id }));
  }, [allTables, activeOrder]);

  useEffect(() => {
    // Initialize selected table from active order if it exists (only for already assigned tables)
    if (
      activeOrder?.service_location_id &&
      activeOrder.order_status === "Preparing" &&
      !selectedTable
    ) {
      const tableOption = availableTableOptions.find(
        (option) => option.value === activeOrder.service_location_id
      );
      if (tableOption) {
        setSelectedTable(tableOption);
      }
    }

    // Initialize pending table selection from store
    if (pendingTableSelection && !selectedTable) {
      const tableOption = availableTableOptions.find(
        (option) => option.value === pendingTableSelection.value
      );
      if (tableOption) {
        setSelectedTable(tableOption);
      }
    }
  }, [
    activeOrder,
    availableTableOptions,
    selectedTable,
    pendingTableSelection,
  ]);

  useEffect(() => {
    setSelectedTable(undefined);
  }, [activeOrderId]);

  // Initialize customer name from active order
  useEffect(() => {
    if (activeOrder?.customer_name) {
      setCustomerName(activeOrder.customer_name);
    } else {
      setCustomerName("");
    }
  }, [activeOrderId, activeOrder?.customer_name]);

  const handleAddOpenItem = () => {
    if (!openItemName.trim()) {
      toast.error("Please enter an item name", {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    const price = parseFloat(openItemPrice);
    if (isNaN(price) || price <= 0) {
      toast.error("Please enter a valid price", {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    // Check if the active order is closed
    const activeOrder = orders.find((o) => o.id === activeOrderId);
    if (activeOrder?.order_status === "Closed") {
      toast.error("Order is closed. Please reopen the check to add items.", {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    // Create a new cart item for the open item
    const newOpenItem = {
      id: `open_item_${Date.now()}`,
      itemId: `open_item_${Date.now()}`,
      menuItemId: `open_item_${Date.now()}`,
      name: openItemName.trim(),
      quantity: 1,
      originalPrice: price,
      price: price,
      customizations: {
        notes: "Open Item",
      },
      availableDiscount: undefined,
      appliedDiscount: null,
    };

    addItemToActiveOrder(newOpenItem);

    toast.success(`${openItemName} ${price.toFixed(2)} added`, {
      duration: 4000,
      position: ToastPosition.BOTTOM,
    });

    // Reset form and close modal
    setOpenItemName("");
    setOpenItemPrice("");
    setIsOpenItemModalVisible(false);
  };

  const handleCancelOpenItem = () => {
    setOpenItemName("");
    setOpenItemPrice("");
    setIsOpenItemModalVisible(false);
  };

  // Customer name modal handlers
  const handleAddCustomerName = () => {
    setTempCustomerName(customerName);
    setIsCustomerNameModalVisible(true);
  };

  const handleSaveCustomerName = () => {
    if (activeOrderId) {
      const trimmedName = tempCustomerName.trim();
      setCustomerName(trimmedName);
      updateActiveOrderDetails({ customer_name: trimmedName });
      setIsCustomerNameModalVisible(false);
      toast.success(
        trimmedName ? "Customer name updated" : "Customer name removed",
        {
          duration: 2000,
          position: ToastPosition.BOTTOM,
        }
      );
    }
  };

  const handleCancelCustomerName = () => {
    setTempCustomerName(customerName);
    setIsCustomerNameModalVisible(false);
  };

  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: insets.bottom,
    left: 12,
    right: 12,
  };

  return (
    <View className=" px-6 bg-[#212121] overflow-hidden ">
      {/* Header */}
      <View className="flex-row flex items-center justify-center my-2 w-full gap-x-4">
        <View className="w-[50%] flex items-center justify-center flex-col gap-y-2">
          <Text className="text-white font-semibold text-xl mb-2">
            Customer
          </Text>
          <TouchableOpacity
            onPress={openSheet} // 3. Trigger the bottom sheet
            className="flex-row w-full items-center p-2 border-2 border-dashed border-gray-700 rounded-lg bg-[#303030] h-12"
          >
            {activeOrder?.customer_name ? (
              <>
                <User color="#A5A5B5" size={24} />
                <View className="ml-3 flex-1">
                  <Text
                    className="text-2xl font-semibold text-white overflow-ellipsis"
                    numberOfLines={1}
                  >
                    {activeOrder.customer_name}
                  </Text>
                  {activeOrder.customer_phone && (
                    <Text className="text-base text-gray-400">
                      {activeOrder.customer_phone}
                    </Text>
                  )}
                </View>
                <Edit3 color="#60A5FA" size={24} />
              </>
            ) : (
              <>
                <Plus color="#9CA3AF" size={24} />
                <Text className="text-xl font-semibold text-gray-300 ml-3">
                  Add Customer
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <View className="w-[50%] flex items-center justify-center flex-col gap-y-2">
          <Label className="text-white font-semibold text-xl mb-2">
            Order Type
          </Label>
          {/* --- Order Type Button --- */}
          <TouchableOpacity
            className="w-full flex-row items-center justify-between p-2 border border-background-400 rounded-lg bg-[#303030] h-12"
            onPress={openDrawer}
          >
            <Text className="text-xl font-semibold text-white">
              {currentOrderType}
            </Text>
            <Text className="text-gray-400">▼</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Customer Name Modal */}
      <Dialog
        open={isCustomerNameModalVisible}
        onOpenChange={setIsCustomerNameModalVisible}
      >
        <DialogContent className="p-0 rounded-t-lg rounded-b-2xl border w-[500px] bg-[#11111A] border-none">
          {/* Dark Header */}
          <View className="p-6 rounded-lg ">
            <DialogTitle className="text-[#F1F1F1] text-3xl font-bold text-center">
              {customerName ? "Edit Customer Name" : "Add Customer Name"}
            </DialogTitle>
          </View>

          {/* White Content */}
          <View className="rounded-t-lg rounded-b-lg p-6 bg-background-100">
            <DialogHeader>
              <Text className="text-accent-500 text-2xl text-center mb-4">
                Enter the customer's name for this order
              </Text>
            </DialogHeader>

            {/* Customer Name Input */}
            <View className="mb-6">
              <Text className="text-accent-500 text-xl font-semibold mb-2">
                Customer Name
              </Text>
              <TextInput
                className="w-full p-4 border border-background-400 rounded-lg text-2xl text-accent-500 h-20"
                placeholder="Enter customer name"
                placeholderTextColor="#9CA3AF"
                value={tempCustomerName}
                onChangeText={setTempCustomerName}
                autoFocus
              />
            </View>

            {/* Footer with Buttons */}
            <DialogFooter className="flex-row gap-4">
              <TouchableOpacity
                onPress={handleCancelCustomerName}
                className="flex-1 py-4 border border-gray-300 rounded-lg"
              >
                <Text className="font-bold text-2xl text-gray-700 text-center">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveCustomerName}
                className="flex-1 py-4 bg-white rounded-lg  border border-blue-400"
              >
                <Text className="font-bold text-2xl text-gray-800 text-center">
                  {customerName ? "Update" : "Add"}
                </Text>
              </TouchableOpacity>
            </DialogFooter>
          </View>
        </DialogContent>
      </Dialog>
    </View>
  );
};

export default OrderDetails;
