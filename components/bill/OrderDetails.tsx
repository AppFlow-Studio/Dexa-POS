import { useToast } from "@/contexts/ToastContext";
import { useCustomerSheetStore } from "@/stores/useCustomerSheetStore";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useOrderTypeDrawerStore } from "@/stores/useOrderTypeDrawerStore";
import { Edit3, Plus, User } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
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

const OrderDetailsComponent: React.FC = () => {
  const { show } = useToast();

  // CRITICAL FIX: Only subscribe to primitives, not objects
  // Subscribe to individual fields instead of entire order object
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  const customerName = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.customer_name || null;
  });
  const customerPhone = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.customer_phone || null;
  });
  const orderType = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    const type = order?.order_type || "takeout";
    const labels: Record<string, string> = {
      dine_in: "Dine In",
      takeout: "Takeaway",
      delivery: "Delivery",
    };
    return labels[type] || type;
  });
  const serviceLocationId = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.service_location_id || null;
  });
  const orderStatus = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.order_status || "draft";
  });

  // Actions - stable function references
  const updateActiveOrderDetails = useOrderStore(
    (s) => s.updateActiveOrderDetails,
  );
  const addItemToActiveOrder = useOrderStore((s) => s.addItemToActiveOrder);

  const { openDrawer } = useOrderTypeDrawerStore();
  const { openSheet } = useCustomerSheetStore();

  // The state now reflects the data from the global store
  const [selectedTable, setSelectedTable] = useState<SelectOption | undefined>(
    undefined,
  );
  // Temporary storage for selected table (not yet assigned to order)
  const [pendingTableSelection, setLocalPendingTableSelection] = useState<
    SelectOption | undefined
  >(undefined);

  // Open Item Modal State
  const [isOpenItemModalVisible, setIsOpenItemModalVisible] = useState(false);
  const [openItemName, setOpenItemName] = useState("");
  const [openItemPrice, setOpenItemPrice] = useState("");

  // Local state for editing customer name
  const [localCustomerName, setLocalCustomerName] = useState("");
  const [isCustomerNameModalVisible, setIsCustomerNameModalVisible] =
    useState(false);
  const [tempCustomerName, setTempCustomerName] = useState("");

  // FIXED: Don't compute available tables at all - not used in this component
  // Only compute when actually needed for display
  const availableTableOptions = useMemo(() => {
    const tablesById = useFloorPlanStore.getState().tablesById;
    return Object.values(tablesById)
      .filter(
        (t) => t.session?.status === "available" || t.id === serviceLocationId,
      )
      .map((t) => ({ label: t.name, value: t.id }));
  }, [serviceLocationId]);

  // Track the last processed service location to avoid redundant updates
  const lastProcessedServiceLocationRef = useRef<string | null>(null);

  // FIXED: Only run when service location ID actually changes
  useEffect(() => {
    // Skip if we've already processed this service location
    if (lastProcessedServiceLocationRef.current === serviceLocationId) {
      return;
    }

    // Only update if conditions are met and value is different
    if (serviceLocationId && orderStatus === "preparing") {
      // Use O(1) lookup directly from store
      const table = useFloorPlanStore
        .getState()
        .getTableById(serviceLocationId);
      if (table) {
        setSelectedTable({ label: table.name, value: table.id });
        lastProcessedServiceLocationRef.current = serviceLocationId;
      }
    } else if (!serviceLocationId) {
      // Reset tracking when no service location
      lastProcessedServiceLocationRef.current = null;
    }
  }, [serviceLocationId, orderStatus]);

  // FIXED: Separate effect for pending table selection - also use ref to avoid loops
  const lastProcessedPendingRef = useRef<string | null>(null);

  useEffect(() => {
    const pendingValue = pendingTableSelection?.value;

    // Skip if we've already processed this pending value
    if (!pendingValue || lastProcessedPendingRef.current === pendingValue) {
      return;
    }

    const table = useFloorPlanStore.getState().getTableById(pendingValue);
    if (table) {
      setSelectedTable({ label: table.name, value: table.id });
      lastProcessedPendingRef.current = pendingValue;
    }
  }, [pendingTableSelection?.value]);

  useEffect(() => {
    setSelectedTable(undefined);
    // Reset refs when order changes
    lastProcessedServiceLocationRef.current = null;
    lastProcessedPendingRef.current = null;
  }, [activeOrderId]);

  // Initialize local customer name from store customer name
  useEffect(() => {
    setLocalCustomerName(customerName || "");
  }, [activeOrderId, customerName]);

  const handleAddOpenItem = () => {
    if (!openItemName.trim()) {
      show({
        title: "Item Name Required",
        message: "Please enter a name for the open item.",
        type: "error",
      });
      return;
    }

    const price = parseFloat(openItemPrice);
    if (isNaN(price) || price <= 0) {
      show({
        title: "Invalid Price",
        message: "Please enter a valid, positive price for the item.",
        type: "error",
      });
      return;
    }

    // Check if the active order is closed - O(1) lookup from store directly
    const ordersById = useOrderStore.getState().ordersById;
    const currentOrder = activeOrderId ? ordersById[activeOrderId] : undefined;
    if (currentOrder?.order_status === "completed") {
      show({
        title: "Order Closed",
        message: "Cannot add items to a closed order. Please reopen it first.",
        type: "error",
      });
      return;
    }

    // Create a new cart item for the open item
    const newOpenItem: any = {
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
      // Default missing properties to satisfy CartItem
      paidQuantity: 0,
      unitPrice: price,
      cashPrice: price,
      subtotal: price,
      baseCardPrice: price,
      baseCashPrice: price,
      cashSubtotal: price,
      taxRate: 0,
      taxAmount: 0,
      cashTaxAmount: 0,
    };

    addItemToActiveOrder(newOpenItem);

    show({
      title: "Item Added",
      message: `${openItemName.trim()} for $${price.toFixed(
        2,
      )} has been added to the order.`,
      type: "success",
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
    setTempCustomerName(localCustomerName);
    setIsCustomerNameModalVisible(true);
  };

  const handleSaveCustomerName = () => {
    if (activeOrderId) {
      const trimmedName = tempCustomerName.trim();
      setLocalCustomerName(trimmedName);
      updateActiveOrderDetails({ customer_name: trimmedName });
      setIsCustomerNameModalVisible(false);
      show({
        title: "Customer Name Updated",
        message: trimmedName
          ? `Order is now under the name: ${trimmedName}`
          : "Customer name has been removed from the order.",
        type: "success",
      });
    }
  };

  const handleCancelCustomerName = () => {
    setTempCustomerName(localCustomerName);
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
      <View className="flex-row flex items-center justify-center w-full gap-x-4">
        <View className="w-[50%] flex items-center justify-center flex-col gap-y-1">
          <Label className="text-white font-semibold text-xl">Customer</Label>
          <TouchableOpacity
            onPress={openSheet}
            className={`flex-row w-full items-center p-2 border-2 rounded-lg h-12 ${
              customerName
                ? "border-green-500 bg-[#303030] border-solid"
                : "border-dashed border-gray-700 bg-[#303030]"
            }`}
          >
            {customerName ? (
              <>
                <User color="#A5A5B5" size={24} />
                <View className="ml-3 flex-1">
                  <Text
                    className="text-xl font-semibold text-white overflow-ellipsis"
                    numberOfLines={1}
                  >
                    {customerName}
                  </Text>
                  {customerPhone && (
                    <Text className="text-sm text-gray-400">
                      {customerPhone}
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
          <Label className="text-white font-semibold text-xl">Order Type</Label>
          {/* --- Order Type Button --- */}
          <TouchableOpacity
            className="w-full flex-row items-center justify-between p-2 border border-background-400 rounded-lg bg-[#303030] h-12"
            onPress={openDrawer}
          >
            <Text className="text-xl font-semibold text-white">
              {orderType}
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
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            {/* Dark Header */}
            <View className="p-6 rounded-lg ">
              <DialogTitle className="text-[#F1F1F1] text-3xl font-bold text-center">
                {localCustomerName ? "Edit Customer Name" : "Add Customer Name"}
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
                    {localCustomerName ? "Update" : "Add"}
                  </Text>
                </TouchableOpacity>
              </DialogFooter>
            </View>
          </KeyboardAvoidingView>
        </DialogContent>
      </Dialog>
    </View>
  );
};

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const OrderDetails = React.memo(OrderDetailsComponent);

export default OrderDetails;
