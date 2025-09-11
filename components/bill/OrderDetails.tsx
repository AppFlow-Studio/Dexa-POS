import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Edit3, Plus } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "../ui/dialog";

// Define a consistent type for our dropdown options
type SelectOption = { label: string; value: string };

// Static options for the Order Type dropdown
const ORDER_TYPE_OPTIONS: SelectOption[] = [
  { label: "Dine In", value: "Dine In" },
  { label: "Take Away", value: "Take Away" },
  { label: "Delivery", value: "Delivery" },
];

const OrderDetails: React.FC = () => {
  const { tables, updateTableStatus } = useFloorPlanStore();
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

  // Find the full active order object
  const activeOrder = orders.find((o) => o.id === activeOrderId);

  // The state now reflects the data from the global store
  const [selectedTable, setSelectedTable] = useState<SelectOption | undefined>(
    undefined
  );

  const [selectedOrderType, setSelectedOrderType] = useState<
    SelectOption | undefined
  >();
  const [tableSelectKey, setTableSelectKey] = useState(Date.now());
  const [orderTypeSelectKey, setOrderTypeSelectKey] = useState(Date.now());

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

  const availableTableOptions = useMemo(() => {
    // Show the currently assigned table PLUS all available tables
    return tables
      .filter(
        (t) =>
          t.status === "Available" || t.id === activeOrder?.service_location_id
      )
      .map((t) => ({ label: t.name, value: t.id }));
  }, [tables, activeOrder]);

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
    setSelectedOrderType(undefined);
    setOrderTypeSelectKey(Date.now());
    setSelectedTable(undefined);
    setTableSelectKey(Date.now());
  }, [activeOrderId]);

  // Initialize customer name from active order
  useEffect(() => {
    if (activeOrder?.customer_name) {
      setCustomerName(activeOrder.customer_name);
    } else {
      setCustomerName("");
    }
  }, [activeOrderId, activeOrder?.customer_name]);

  const handleTableSelect = (option: SelectOption | undefined) => {
    if (!option) return;

    if (selectedOrderType?.value === "Take Away") {
      toast.error("Order type is take away can't assign table", {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      setTableSelectKey(Date.now());
      return;
    }

    // For dine-in orders, just store the table selection temporarily (not yet assigned)
    if (selectedOrderType?.value === "Dine In") {
      setLocalPendingTableSelection(option);
      setPendingTableSelection(option.value);
      // Only update order type, don't assign table yet
      if (activeOrderId) {
        updateActiveOrderDetails({
          order_type: "Dine In",
        });
      }
      toast.success(`Table ${option.label} selected`, {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    // For non-dine-in orders, proceed with normal assignment
    const tableId = option.value;
    assignOrderToTable(activeOrderId!, tableId);
    updateTableStatus(tableId, "In Use");

    // 2. After successfully assigning, change the key of the Select component
    // This will force it to re-mount and reset to its initial placeholder state.
    setTableSelectKey(Date.now());

    toast.success(`Order assigned to ${option.label}`, {
      duration: 4000,
      position: ToastPosition.BOTTOM,
    });
  };

  const handleOrderTypeSelect = (option: SelectOption | undefined) => {
    if (!option || !activeOrderId) return;

    updateActiveOrderDetails({ order_type: option.value as any });
    setSelectedOrderType(option);
  };

  const handleOpenItemPress = () => {
    if (!activeOrder?.order_type) {
      toast.error("Please select an Order Type", {
        duration: 4000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }
    setIsOpenItemModalVisible(true);
  };

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

    toast.success(`${openItemName} $${price.toFixed(2)} added`, {
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
    <View className="pb-4 px-4 bg-[#212121] overflow-hidden ">
      {/* Header */}
      <View className="flex-row items-center justify-between my-2 w-full">
        <View className="flex-1">
          {/* Customer Name Button */}
          {customerName && customerName !== "Walk-In Customer" ? (
            // Edit Mode - Show customer name with edit icon
            <TouchableOpacity
              onPress={handleAddCustomerName}
              className="flex-row items-center justify-between py-3 px-4 rounded-lg border border-white bg-accent-50 w-full"
            >
              <View className="flex-row items-center flex-1">
                <Text className="text-lg font-semibold text-accent-500 flex-1">
                  {customerName}
                </Text>
              </View>
              <Edit3 color="#3B82F6" size={18} />
            </TouchableOpacity>
          ) : (
            // Add Mode - Show add button with plus icon
            <TouchableOpacity
              onPress={handleAddCustomerName}
              className="flex-row items-center justify-center py-3 px-4 gap-x-2 rounded-lg border-2 border-dashed border-gray-800 bg-[#303030] w-full"
            >
              <Plus
                color="#9CA3AF"
                size={20}
              />
              <Text className="font-semibold text-white">
                Add Customer Name
              </Text>
            </TouchableOpacity>
          )}

          {/* Order Number */}
          <Text className="text-sm text-accent-500 mt-2 text-center">
            Order Number #{activeOrderId?.slice(-5) || "00000"}
          </Text>
        </View>
      </View>

      {/* Selectors */}
      <View className="flex-row gap-2">
        {/* --- Select Table Dropdown --- */}
        <View className="flex-1">
          <Select key={tableSelectKey} value={selectedTable}>
            <SelectTrigger className="w-full flex-row justify-between items-center p-3 border border-background-400 rounded-lg">
              <SelectValue
                placeholder="Select Table"
                className="font-semibold text-white"
              />
            </SelectTrigger>
            <SelectContent insets={contentInsets} className="max-h-64">
              <ScrollView>
                <SelectGroup>
                  {availableTableOptions.map((tableOption) => (
                    <SelectItem
                      key={tableOption.value}
                      label={tableOption.label}
                      value={tableOption.value}
                      onPress={() => handleTableSelect(tableOption)}
                    >
                      {tableOption.label}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </ScrollView>
            </SelectContent>
          </Select>
        </View>

        {/* --- Order Type Dropdown --- */}
        <View className="flex-1">
          <Select
            key={orderTypeSelectKey}
            value={selectedOrderType}
            onValueChange={handleOrderTypeSelect}
          >
            <SelectTrigger className="w-full flex-row justify-between items-center p-3 border border-background-400 rounded-lg">
              <SelectValue
                placeholder="Order Type"
                className="font-semibold text-white"
              />
            </SelectTrigger>
            <SelectContent insets={contentInsets}>
              <SelectGroup>
                {ORDER_TYPE_OPTIONS.map((typeOption) => (
                  <SelectItem
                    key={typeOption.value}
                    label={typeOption.label}
                    value={typeOption.value}
                    className="text-start"
                  >
                    {typeOption.label}
                  </SelectItem>
                ))}
              </SelectGroup>
            </SelectContent>
          </Select>
        </View>
      </View>

      {/* Open Item Button */}
      <TouchableOpacity
        className="mt-2 w-full items-center py-3 border border-background-400 rounded-lg"
        onPress={handleOpenItemPress}
      >
        <Text className="font-bold text-white">Add Custom Item</Text>
      </TouchableOpacity>

      {/* Open Item Modal */}
      <Dialog open={isOpenItemModalVisible} onOpenChange={setIsOpenItemModalVisible}>
        <DialogContent className="p-0 rounded-[36px] max-w-2xl w-full bg-[#11111A] border-none">
          {/* Dark Header */}
          <View className="p-6 rounded-t-2xl">
            <DialogTitle className="text-[#F1F1F1] text-2xl font-bold text-center">
              Add Custom Item
            </DialogTitle>
          </View>

          {/* White Content */}
          <View className="rounded-[36px] p-6 bg-background-100">
            <DialogHeader>
              <Text className="text-accent-500 text-center mb-4">
                Enter the details for your custom item
              </Text>
            </DialogHeader>

            {/* Item Name Input */}
            <View className="mb-4">
              <Text className="text-accent-500 font-semibold mb-2">
                Item Name
              </Text>
              <TextInput
                className="w-full p-3 border border-background-400 rounded-lg text-accent-500"
                placeholder="Enter item name"
                placeholderTextColor="#9CA3AF"
                value={openItemName}
                onChangeText={setOpenItemName}
                autoFocus
              />
            </View>

            {/* Item Price Input */}
            <View className="mb-6">
              <Text className="text-accent-500 font-semibold mb-2">Price</Text>
              <TextInput
                className="w-full p-3 border border-background-400 rounded-lg text-accent-500"
                placeholder="0.00"
                placeholderTextColor="#9CA3AF"
                value={openItemPrice}
                onChangeText={setOpenItemPrice}
                keyboardType="decimal-pad"
              />
            </View>

            {/* Footer with Buttons */}
            <DialogFooter className="flex-row gap-3">
              <TouchableOpacity
                onPress={handleCancelOpenItem}
                className="flex-1 py-3 border border-gray-300 rounded-lg"
              >
                <Text className="font-bold text-gray-700 text-center">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleAddOpenItem}
                className="flex-1 py-3 bg-white rounded-lg"
              >
                <Text className="font-bold text-white text-center">
                  Add Item
                </Text>
              </TouchableOpacity>
            </DialogFooter>
          </View>
        </DialogContent>
      </Dialog>

      {/* Customer Name Modal */}
      <Dialog
        open={isCustomerNameModalVisible}
        onOpenChange={setIsCustomerNameModalVisible}
      >
        <DialogContent className="p-0 rounded-t-lg rounded-b-2xl border w-[500px] bg-[#11111A] border-none">
          {/* Dark Header */}
          <View className="p-6 rounded-lg ">
            <DialogTitle className="text-[#F1F1F1] text-2xl font-bold text-center">
              {customerName ? "Edit Customer Name" : "Add Customer Name"}
            </DialogTitle>
          </View>

          {/* White Content */}
          <View className="rounded-t-lg rounded-b-lg p-6 bg-background-100">
            <DialogHeader>
              <Text className="text-accent-500 text-center mb-4">
                Enter the customer's name for this order
              </Text>
            </DialogHeader>

            {/* Customer Name Input */}
            <View className="mb-6">
              <Text className="text-accent-500 font-semibold mb-2">
                Customer Name
              </Text>
              <TextInput
                className="w-full p-3 border border-background-400 rounded-lg text-accent-500"
                placeholder="Enter customer name"
                placeholderTextColor="#9CA3AF"
                value={tempCustomerName}
                onChangeText={setTempCustomerName}
                autoFocus
              />
            </View>

            {/* Footer with Buttons */}
            <DialogFooter className="flex-row gap-3">
              <TouchableOpacity
                onPress={handleCancelCustomerName}
                className="flex-1 py-3 border border-gray-300 rounded-lg"
              >
                <Text className="font-bold text-gray-700 text-center">
                  Cancel
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleSaveCustomerName}
                className="flex-1 py-3 bg-white rounded-lg"
              >
                <Text className="font-bold text-white text-center">
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
