import { useCustomerStore } from "@/stores/useCustomerStore";
import { useDineInStore } from "@/stores/useDineInStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import React, { useEffect, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import TableLayoutView from "../tables/TableLayoutView";

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
  const { activeOrderId, updateActiveOrderDetails, assignOrderToTable } =
    useOrderStore();
  const {
    addCustomer,
    findCustomerByPhone,
    incrementOrderCount,
    searchCustomersByPhone,
  } = useCustomerStore();
  const { tables, updateTableStatus } = useFloorPlanStore();
  const { selectedTable, setSelectedTable, clearSelectedTable } =
    useDineInStore();
  const activeOrder = useOrderStore((state) =>
    state.orders.find((order) => order.id === activeOrderId)
  );
  const orderTypes = [
    { value: "Dine In", label: "Dine In" },
    { value: "Take Away", label: "Take Away" },
    { value: "Delivery", label: "Delivery" },
  ];

  // Customer info state
  const [customerName, setCustomerName] = useState("");
  const [phoneNumber, setPhoneNumber] = useState("");
  const [address, setAddress] = useState("");
  const [isExistingCustomer, setIsExistingCustomer] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [customerSuggestions, setCustomerSuggestions] = useState<any[]>([]);

  // Check for existing customer when phone number changes
  useEffect(() => {
    if (phoneNumber.length >= 3) {
      const suggestions = searchCustomersByPhone(phoneNumber);
      setCustomerSuggestions(suggestions);
      setShowSuggestions(suggestions.length > 0);
    } else {
      setShowSuggestions(false);
      setCustomerSuggestions([]);
    }

    if (phoneNumber.length >= 10) {
      const existingCustomer = findCustomerByPhone(phoneNumber);
      if (existingCustomer) {
        setCustomerName(existingCustomer.name);
        setAddress(existingCustomer.address || "");
        setIsExistingCustomer(true);
        setShowSuggestions(false);
      } else {
        setIsExistingCustomer(false);
      }
    }
  }, [phoneNumber, findCustomerByPhone, searchCustomersByPhone]);

  const handleSelectCustomer = (customer: any) => {
    setPhoneNumber(customer.phoneNumber);
    setCustomerName(customer.name);
    setAddress(customer.address || "");
    setIsExistingCustomer(true);
    setShowSuggestions(false);
    setCustomerSuggestions([]);

    // Assign customer to order immediately
    assignCustomerToOrder(customer);
  };

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

  const handleSaveNewCustomer = () => {
    if (!customerName.trim() || !phoneNumber.trim()) {
      toast.error("Please fill in name and phone number", {
        duration: 3000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    if (currentOrderType === "Delivery" && !address.trim()) {
      toast.error("Please provide delivery address", {
        duration: 3000,
        position: ToastPosition.BOTTOM,
      });
      return;
    }

    // Create new customer
    const newCustomer = addCustomer({
      name: customerName.trim(),
      phoneNumber: phoneNumber.trim(),
      address: currentOrderType === "Delivery" ? address.trim() : undefined,
    });

    // Assign customer to order
    assignCustomerToOrder(newCustomer);

    setIsExistingCustomer(true);
    setShowSuggestions(false);
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
      <View className="absolute left-0 top-0 bottom-0 w-[85%] bg-[#303030] shadow-2xl">
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
            <View className="space-y-3">
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

              {/* Existing Customer Indicator */}
              {isExistingCustomer && (
                <View className="mb-3 p-3 bg-green-600/20 border border-green-600 rounded-lg">
                  <Text className="text-2xl text-green-400 font-medium">
                    ✓ Existing Customer Found
                  </Text>
                </View>
              )}

              {/* Name Input */}
              <View className="mb-3">
                <Text className="text-gray-300 text-xl font-medium mb-1">
                  Customer Name
                </Text>
                <TextInput
                  className="w-full p-4 border border-gray-600 rounded-lg h-16 px-4 py-3 text-2xl text-white"
                  placeholder="Enter customer name"
                  placeholderTextColor="#9CA3AF"
                  value={customerName}
                  onChangeText={setCustomerName}
                  autoFocus
                />
              </View>

              {/* Phone Number Input */}
              <View className="mb-3">
                <Text className="text-gray-300 text-xl font-medium mb-1">
                  Phone Number
                </Text>
                <View className="relative">
                  <TextInput
                    className="w-full p-4 border border-gray-600 rounded-lg h-16 px-4 py-3 text-2xl text-white"
                    placeholder="(555) 123-4567"
                    placeholderTextColor="#9CA3AF"
                    value={phoneNumber}
                    onChangeText={setPhoneNumber}
                    keyboardType="number-pad"
                  />

                  {/* Customer Suggestions Dropdown */}
                  {showSuggestions && customerSuggestions.length > 0 && (
                    <View className="absolute top-full left-0 right-0 bg-[#212121] border border-gray-600 rounded-lg mt-1 max-h-32 z-10">
                      {customerSuggestions.map((customer) => (
                        <TouchableOpacity
                          key={customer.id}
                          onPress={() => handleSelectCustomer(customer)}
                          className="p-4 border-b border-gray-600 last:border-b-0"
                        >
                          <Text className="text-xl text-white font-medium">
                            {customer.name}
                          </Text>
                          <Text className="text-lg text-gray-400">
                            {customer.phoneNumber}
                          </Text>
                          {customer.address && (
                            <Text className="text-gray-500 text-xs">
                              {customer.address}
                            </Text>
                          )}
                        </TouchableOpacity>
                      ))}
                    </View>
                  )}
                </View>
              </View>

              {/* Address Input - Only for Delivery */}
              {currentOrderType === "Delivery" && (
                <View className="mb-4">
                  <Text className="text-gray-300 text-xl font-medium mb-1">
                    Delivery Address
                  </Text>
                  <TextInput
                    className="w-full p-4 border border-gray-600 rounded-lg h-20 px-4 py-3 text-2xl text-white"
                    placeholder="Enter delivery address"
                    placeholderTextColor="#9CA3AF"
                    value={address}
                    onChangeText={setAddress}
                    multiline
                    numberOfLines={2}
                  />
                </View>
              )}

              {/* Save Customer Info Button - Only show for new customers */}
              {!isExistingCustomer && (
                <TouchableOpacity
                  onPress={handleSaveNewCustomer}
                  className="w-full py-4 bg-blue-600 rounded-lg items-center mb-4"
                >
                  <Text className="text-2xl text-white font-semibold">
                    Save New Customer
                  </Text>
                </TouchableOpacity>
              )}

              {/* Customer Assigned Indicator */}
              {isExistingCustomer && (
                <View className="w-full py-4 bg-green-600 rounded-lg items-center mb-4">
                  <Text className="text-2xl text-white font-semibold">
                    ✓ Customer Assigned to Order
                  </Text>
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

              {/* Selected Table Info */}
              {selectedTable && (
                <View className="mb-4 p-4 bg-green-600/20 border border-green-600 rounded-lg">
                  <Text className="text-green-400 font-medium text-xl">
                    ✓ Selected: {selectedTable.name}
                  </Text>
                  <Text className="text-xl text-green-300">
                    Capacity: {selectedTable.capacity} people
                  </Text>
                </View>
              )}

              <View className="flex-1 border border-gray-600 rounded-lg">
                <TableLayoutView
                  tables={tables}
                  isSelectionMode={true}
                  selectedTableId={selectedTable?.id}
                  onTableSelect={handleTableSelect}
                  activeOrderId={activeOrderId}
                  showConnections={false}
                />
              </View>

              {tables.filter((table) => table.status === "Available").length ===
                0 && (
                <View className="p-4 bg-red-600/20 border border-red-600 rounded-lg">
                  <Text className="text-2xl text-red-400 font-medium">
                    No available tables
                  </Text>
                  <Text className="text-xl text-red-300">
                    All tables are currently in use
                  </Text>
                </View>
              )}
            </View>
          )}
        </View>
      </View>
    </View>
  );
};

export default OrderTypeDrawer;
