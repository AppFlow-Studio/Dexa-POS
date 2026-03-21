import { useToast } from "@/contexts/ToastContext";
import { colors } from "@/lib/theme";
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
import { useShallow } from "zustand/react/shallow";
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

  // PERF: Single useShallow selector - runs 1 function instead of 11
  // useShallow compares values shallowly, so primitive returns prevent unnecessary re-renders
  const {
    activeOrderId,
    customerName,
    customerPhone,
    orderType,
    serviceLocationId,
    orderStatus,
    paidStatus,
    checkStatus,
    hasRefunds,
    isSplitPayment,
    hasAnyPayments,
  } = useOrderStore(
    useShallow((s) => {
      const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
      const type = order?.order_type || "takeout";
      const labels: Record<string, string> = {
        dine_in: "Dine In",
        takeout: "Takeaway",
        delivery: "Delivery",
      };
      const activePayments = order?.payments?.filter((p) => !p.isVoided) ?? [];
      return {
        activeOrderId: s.activeOrderId,
        customerName: order?.customer_name || null,
        customerPhone: order?.customer_phone || null,
        orderType: labels[type] || type,
        serviceLocationId: order?.service_location_id || null,
        orderStatus: order?.order_status || "draft",
        paidStatus: order?.paid_status || "Unpaid",
        checkStatus: order?.check_status || "Opened",
        hasRefunds: (order?.order_refund_items?.length ?? 0) > 0,
        isSplitPayment: activePayments.some((p) => p.method === "Cash") && activePayments.some((p) => p.method === "Card"),
        hasAnyPayments: activePayments.length > 0,
      };
    })
  );

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
    <View className=" px-4 overflow-hidden ">
      {/* Header */}
      <View className="flex-row flex items-center justify-center w-full gap-x-4">
        <View className="w-[50%] flex items-start justify-center flex-col gap-y-1">
          <Label className="text-label font-small text-xs ml-2 mt-1">Customer</Label>
          <TouchableOpacity
            onPress={openSheet}
            className={`flex-row w-full items-center p-2 rounded-xl h-10 ${
              customerName
                ? "bg-surface"
                : "bg-surface"
            }`}
          >
            {customerName ? (
              <>
                <User color={colors.label} size={16} />
                <View className="ml-2 flex-1">
                  <Text
                    className="text-sm font-semibold text-white overflow-ellipsis"
                    numberOfLines={1}
                  >
                    {customerName}
                  </Text>
                  {customerPhone && (
                    <Text className="text-xs text-gray-400">
                      {customerPhone}
                    </Text>
                  )}
                </View>
                <Edit3 color={colors.info} size={14} />
              </>
            ) : (
              <>
                <Plus color={colors.teal} size={24} />
                <Text className="text-sm font-medium text-teal-400 ml-2">
                  Add Customer
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
        <View className="w-[50%] flex items-start justify-center flex-col gap-y-1">
          <Label className="text-label font-medium text-xs ml-2 mt-1">Order Type</Label>
          {/* --- Order Type Button --- */}
          <TouchableOpacity
            className="w-full flex-row items-center justify-between p-2 rounded-xl h-10 bg-surface"
            onPress={openDrawer}
          >
            <Text className="ml-2 text-sm font-medium text-white">
              {orderType}
            </Text>
            <Text className="text-white text-sm">▼</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Status Badge Row - skip for draft orders with no payments */}
      {(orderStatus !== "draft" || hasAnyPayments) && (
        <View className="flex-row flex-wrap gap-2 mt-2 mb-1 px-1">
          {paidStatus === "Paid" && !hasRefunds && (
            <View className="bg-green-600/30 px-2 py-0.5 rounded">
              <Text className="text-green-400 text-xs font-bold">✓ PAID</Text>
            </View>
          )}
          {paidStatus === "Paid" && hasRefunds && (
            <View className="bg-amber-600/30 px-2 py-0.5 rounded">
              <Text className="text-amber-400 text-xs font-bold">⚠ PAID (With Refunds)</Text>
            </View>
          )}
          {paidStatus === "Partial" && (
            <View className="bg-yellow-600/30 px-2 py-0.5 rounded">
              <Text className="text-yellow-400 text-xs font-bold">PARTIAL</Text>
            </View>
          )}
          {paidStatus === "Unpaid" && orderStatus !== "draft" && (
            <View className="bg-red-600/30 px-2 py-0.5 rounded">
              <Text className="text-red-400 text-xs font-bold">UNPAID</Text>
            </View>
          )}
          {checkStatus === "Closed" && (
            <View className="bg-gray-600/30 px-2 py-0.5 rounded">
              <Text className="text-gray-400 text-xs font-bold">CHECK CLOSED</Text>
            </View>
          )}
          {isSplitPayment && (
            <View className="bg-blue-600/30 px-2 py-0.5 rounded">
              <Text className="text-blue-400 text-xs font-bold">SPLIT PAYMENT</Text>
            </View>
          )}
          {orderStatus === "preparing" && (
            <View className="bg-blue-600/30 px-2 py-0.5 rounded">
              <Text className="text-blue-400 text-xs font-bold">PREPARING</Text>
            </View>
          )}
          {orderStatus === "ready" && (
            <View className="bg-green-600/30 px-2 py-0.5 rounded">
              <Text className="text-green-400 text-xs font-bold">READY</Text>
            </View>
          )}
        </View>
      )}

      {/* Customer Name Modal */}
      <Dialog
        open={isCustomerNameModalVisible}
        onOpenChange={setIsCustomerNameModalVisible}
      >
        <DialogContent className="p-0 rounded-t-lg rounded-b-2xl border w-[500px] bg-screen border-none">
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            {/* Dark Header */}
            <View className="p-6 rounded-lg ">
              <DialogTitle className="text-heading text-3xl font-bold text-center">
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
                  placeholderTextColor={colors.muted}
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
