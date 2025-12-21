import {
    Accordion,
    AccordionContent,
    AccordionItem,
    AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/contexts/ToastContext";
import { CartItem, Discount, OrderProfile, PaymentType } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import {
    ChevronDown,
    ChevronUp,
    Download,
    RefreshCw,
    Trash2,
    Upload
} from "lucide-react-native";
import React, { useState } from "react";
import {
    Alert,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";
// Clipboard functionality - using Alert for now

interface TestLog {
    id: string;
    timestamp: string;
    operation: string;
    request?: any;
    response?: any;
    error?: string;
    success: boolean;
}

const OrderStoreTest = () => {
    const { show } = useToast();
    const router = useRouter();
    const [logs, setLogs] = useState<TestLog[]>([]);

    // Subscribe to store state using individual selectors to avoid object recreation
    const ordersById = useOrderStore((state) => state.ordersById);
    const orderIds = useOrderStore((state) => state.orderIds);
    const activeOrderId = useOrderStore((state) => state.activeOrderId);
    const orders = useOrderStore((state) => state.orders);
    const isOnline = useOrderStore((state) => state.isOnline);
    const pendingSyncCount = useOrderStore((state) => state.pendingSyncCount);
    const activeOrderSubtotal = useOrderStore((state) => state.activeOrderSubtotal);
    const activeOrderTax = useOrderStore((state) => state.activeOrderTax);
    const activeOrderTotal = useOrderStore((state) => state.activeOrderTotal);
    const activeOrderDiscount = useOrderStore((state) => state.activeOrderDiscount);
    const activeOrderOutstandingSubtotal = useOrderStore((state) => state.activeOrderOutstandingSubtotal);
    const activeOrderOutstandingTax = useOrderStore((state) => state.activeOrderOutstandingTax);
    const activeOrderOutstandingTotal = useOrderStore((state) => state.activeOrderOutstandingTotal);
    const pendingTableSelection = useOrderStore((state) => state.pendingTableSelection);

    // Get store actions - these are stable references, so we can use the object form
    const setActiveOrder = useOrderStore((state) => state.setActiveOrder);
    const startNewOrder = useOrderStore((state) => state.startNewOrder);
    const addItemToActiveOrder = useOrderStore((state) => state.addItemToActiveOrder);
    const updateItemInActiveOrder = useOrderStore((state) => state.updateItemInActiveOrder);
    const removeItemFromActiveOrder = useOrderStore((state) => state.removeItemFromActiveOrder);
    const confirmDraftItem = useOrderStore((state) => state.confirmDraftItem);
    const updateItemStatusInActiveOrder = useOrderStore((state) => state.updateItemStatusInActiveOrder);
    const setOpenedAt = useOrderStore((state) => state.setOpenedAt);
    const setClosedAt = useOrderStore((state) => state.setClosedAt);
    const updateActiveOrderDetails = useOrderStore((state) => state.updateActiveOrderDetails);
    const applyDiscountToCheck = useOrderStore((state) => state.applyDiscountToCheck);
    const removeCheckDiscount = useOrderStore((state) => state.removeCheckDiscount);
    const applyDiscountToItem = useOrderStore((state) => state.applyDiscountToItem);
    const removeDiscountFromItem = useOrderStore((state) => state.removeDiscountFromItem);
    const assignOrderToTable = useOrderStore((state) => state.assignOrderToTable);
    const assignActiveOrderToTable = useOrderStore((state) => state.assignActiveOrderToTable);
    const updateOrderStatus = useOrderStore((state) => state.updateOrderStatus);
    const addPaymentToOrder = useOrderStore((state) => state.addPaymentToOrder);
    const setOrders = useOrderStore((state) => state.setOrders);
    const markOrderAsPaid = useOrderStore((state) => state.markOrderAsPaid);
    const setPendingTableSelection = useOrderStore((state) => state.setPendingTableSelection);
    const syncOrderStatus = useOrderStore((state) => state.syncOrderStatus);
    const archiveOrder = useOrderStore((state) => state.archiveOrder);
    const markAllItemsAsReady = useOrderStore((state) => state.markAllItemsAsReady);
    const markAllItemsAsServed = useOrderStore((state) => state.markAllItemsAsServed);
    const consolidateOrdersForTables = useOrderStore((state) => state.consolidateOrdersForTables);
    const fireActiveOrderToKitchen = useOrderStore((state) => state.fireActiveOrderToKitchen);
    const sendNewItemsToKitchen = useOrderStore((state) => state.sendNewItemsToKitchen);
    const sendNewItemsToKitchenForOrder = useOrderStore((state) => state.sendNewItemsToKitchenForOrder);
    const transferOrderToTable = useOrderStore((state) => state.transferOrderToTable);
    const generateCartItemId = useOrderStore((state) => state.generateCartItemId);
    const deleteOrder = useOrderStore((state) => state.deleteOrder);
    const clearCart = useOrderStore((state) => state.clearCart);
    const voidOrder = useOrderStore((state) => state.voidOrder);
    const setOnlineStatus = useOrderStore((state) => state.setOnlineStatus);
    const setPendingSyncCount = useOrderStore((state) => state.setPendingSyncCount);

    // Create memoized storeState object for display purposes only
    const storeState = React.useMemo(
        () => ({
            ordersById,
            orderIds,
            activeOrderId,
            orders,
            isOnline,
            pendingSyncCount,
            activeOrderSubtotal,
            activeOrderTax,
            activeOrderTotal,
            activeOrderDiscount,
            activeOrderOutstandingSubtotal,
            activeOrderOutstandingTax,
            activeOrderOutstandingTotal,
            pendingTableSelection,
        }),
        [
            ordersById,
            orderIds,
            activeOrderId,
            orders,
            isOnline,
            pendingSyncCount,
            activeOrderSubtotal,
            activeOrderTax,
            activeOrderTotal,
            activeOrderDiscount,
            activeOrderOutstandingSubtotal,
            activeOrderOutstandingTax,
            activeOrderOutstandingTotal,
            pendingTableSelection,
        ]
    );

    // Create memoized storeActions object
    const storeActions = React.useMemo(
        () => ({
            setActiveOrder,
            startNewOrder,
            addItemToActiveOrder,
            updateItemInActiveOrder,
            removeItemFromActiveOrder,
            confirmDraftItem,
            updateItemStatusInActiveOrder,
            setOpenedAt,
            setClosedAt,
            updateActiveOrderDetails,
            applyDiscountToCheck,
            removeCheckDiscount,
            applyDiscountToItem,
            removeDiscountFromItem,
            assignOrderToTable,
            assignActiveOrderToTable,
            updateOrderStatus,
            addPaymentToOrder,
            setOrders,
            markOrderAsPaid,
            setPendingTableSelection,
            syncOrderStatus,
            archiveOrder,
            markAllItemsAsReady,
            markAllItemsAsServed,
            consolidateOrdersForTables,
            fireActiveOrderToKitchen,
            sendNewItemsToKitchen,
            sendNewItemsToKitchenForOrder,
            transferOrderToTable,
            generateCartItemId,
            deleteOrder,
            clearCart,
            voidOrder,
            setOnlineStatus,
            setPendingSyncCount,
        }),
        [
            setActiveOrder,
            startNewOrder,
            addItemToActiveOrder,
            updateItemInActiveOrder,
            removeItemFromActiveOrder,
            confirmDraftItem,
            updateItemStatusInActiveOrder,
            setOpenedAt,
            setClosedAt,
            updateActiveOrderDetails,
            applyDiscountToCheck,
            removeCheckDiscount,
            applyDiscountToItem,
            removeDiscountFromItem,
            assignOrderToTable,
            assignActiveOrderToTable,
            updateOrderStatus,
            addPaymentToOrder,
            setOrders,
            markOrderAsPaid,
            setPendingTableSelection,
            syncOrderStatus,
            archiveOrder,
            markAllItemsAsReady,
            markAllItemsAsServed,
            consolidateOrdersForTables,
            fireActiveOrderToKitchen,
            sendNewItemsToKitchen,
            sendNewItemsToKitchenForOrder,
            transferOrderToTable,
            generateCartItemId,
            deleteOrder,
            clearCart,
            voidOrder,
            setOnlineStatus,
            setPendingSyncCount,
        ]
    );

    // Form states
    const [selectedOrderId, setSelectedOrderId] = useState<string>("");
    const [selectedItemId, setSelectedItemId] = useState<string>("");
    const [newOrderTableId, setNewOrderTableId] = useState<string>("");
    const [newOrderGuestCount, setNewOrderGuestCount] = useState<string>("1");
    const [tableIdInput, setTableIdInput] = useState<string>("");
    const [discountValue, setDiscountValue] = useState<string>("0.1");
    const [paymentAmount, setPaymentAmount] = useState<string>("");
    const [paymentMethod, setPaymentMethod] = useState<PaymentType>("Cash");
    const [tipAmount, setTipAmount] = useState<string>("");
    const [itemQuantity, setItemQuantity] = useState<string>("1");
    const [itemPrice, setItemPrice] = useState<string>("");
    const [itemStatus, setItemStatus] = useState<"preparing" | "ready" | "served">("preparing");
    const [orderStatus, setOrderStatus] = useState<string>("preparing");
    const [importStateJson, setImportStateJson] = useState<string>("");
    const [expandedOrders, setExpandedOrders] = useState<Set<string>>(new Set());

    // Helper function to add log
    const addLog = (
        operation: string,
        request?: any,
        response?: any,
        error?: string
    ) => {
        const log: TestLog = {
            id: Date.now().toString(),
            timestamp: new Date().toISOString(),
            operation,
            request,
            response,
            error,
            success: !error,
        };
        setLogs((prev) => [log, ...prev].slice(0, 100)); // Keep last 100 logs
    };

    // Helper to format JSON
    const formatJSON = (obj: any): string => {
        try {
            return JSON.stringify(obj, null, 2);
        } catch {
            return String(obj);
        }
    };

    // Helper to get active order
    const activeOrder = activeOrderId ? ordersById[activeOrderId] : null;

    // Action handlers
    const handleStartNewOrder = () => {
        try {
            const order = storeActions.startNewOrder({
                tableId: newOrderTableId || undefined,
                guestCount: parseInt(newOrderGuestCount) || 1,
            });
            addLog("startNewOrder", { tableId: newOrderTableId, guestCount: newOrderGuestCount }, order);
            show({ title: "Success", message: "New order created", type: "success" });
            setSelectedOrderId(order.id);
        } catch (error: any) {
            addLog("startNewOrder", { tableId: newOrderTableId, guestCount: newOrderGuestCount }, null, error.message);
            show({ title: "Error", message: error.message, type: "error" });
        }
    };

    const handleSetActiveOrder = () => {
        if (!selectedOrderId) {
            show({ title: "Error", message: "Please select an order", type: "error" });
            return;
        }
        try {
            storeActions.setActiveOrder(selectedOrderId);
            addLog("setActiveOrder", { orderId: selectedOrderId }, { success: true });
            show({ title: "Success", message: "Active order set", type: "success" });
        } catch (error: any) {
            addLog("setActiveOrder", { orderId: selectedOrderId }, null, error.message);
            show({ title: "Error", message: error.message, type: "error" });
        }
    };

    const handleDeleteOrder = () => {
        if (!selectedOrderId) {
            show({ title: "Error", message: "Please select an order", type: "error" });
            return;
        }
        Alert.alert("Confirm Delete", "Are you sure you want to delete this order?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Delete",
                style: "destructive",
                onPress: () => {
                    try {
                        storeActions.deleteOrder(selectedOrderId);
                        addLog("deleteOrder", { orderId: selectedOrderId }, { success: true });
                        show({ title: "Success", message: "Order deleted", type: "success" });
                        setSelectedOrderId("");
                    } catch (error: any) {
                        addLog("deleteOrder", { orderId: selectedOrderId }, null, error.message);
                        show({ title: "Error", message: error.message, type: "error" });
                    }
                },
            },
        ]);
    };

    const handleVoidOrder = () => {
        if (!selectedOrderId) {
            show({ title: "Error", message: "Please select an order", type: "error" });
            return;
        }
        Alert.alert("Confirm Void", "Are you sure you want to void this order?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Void",
                style: "destructive",
                onPress: () => {
                    try {
                        storeActions.voidOrder(selectedOrderId);
                        addLog("voidOrder", { orderId: selectedOrderId }, { success: true });
                        show({ title: "Success", message: "Order voided", type: "success" });
                        setSelectedOrderId("");
                    } catch (error: any) {
                        addLog("voidOrder", { orderId: selectedOrderId }, null, error.message);
                        show({ title: "Error", message: error.message, type: "error" });
                    }
                },
            },
        ]);
    };

    const handleAddItem = () => {
        if (!storeState.activeOrderId) {
            show({ title: "Error", message: "No active order", type: "error" });
            return;
        }
        try {
            const newItem: CartItem = {
                id: storeActions.generateCartItemId("test-item", { notes: "" }),
                menuItemId: "test-item",
                name: "Test Item",
                price: parseFloat(itemPrice) || 10.0,
                originalPrice: parseFloat(itemPrice) || 10.0,
                quantity: parseInt(itemQuantity) || 1,
                customizations: {
                    notes: "Test item from debug screen",
                },
                isDraft: false,
            };
            storeActions.addItemToActiveOrder(newItem);
            addLog("addItemToActiveOrder", newItem, { success: true });
            show({ title: "Success", message: "Item added", type: "success" });
        } catch (error: any) {
            addLog("addItemToActiveOrder", null, null, error.message);
            show({ title: "Error", message: error.message, type: "error" });
        }
    };

    const handleUpdateItem = () => {
        if (!storeState.activeOrderId || !selectedItemId) {
            show({ title: "Error", message: "No active order or item selected", type: "error" });
            return;
        }
        try {
            const order = storeState.ordersById[storeState.activeOrderId];
            const item = order.items.find((i) => i.id === selectedItemId);
            if (!item) {
                show({ title: "Error", message: "Item not found", type: "error" });
                return;
            }
            const updatedItem: CartItem = {
                ...item,
                quantity: parseInt(itemQuantity) || item.quantity,
                price: parseFloat(itemPrice) || item.price,
            };
            storeActions.updateItemInActiveOrder(updatedItem);
            addLog("updateItemInActiveOrder", updatedItem, { success: true });
            show({ title: "Success", message: "Item updated", type: "success" });
        } catch (error: any) {
            addLog("updateItemInActiveOrder", null, null, error.message);
            show({ title: "Error", message: error.message, type: "error" });
        }
    };

    const handleRemoveItem = () => {
        if (!storeState.activeOrderId || !selectedItemId) {
            show({ title: "Error", message: "No active order or item selected", type: "error" });
            return;
        }
        try {
            storeActions.removeItemFromActiveOrder(selectedItemId);
            addLog("removeItemFromActiveOrder", { itemId: selectedItemId }, { success: true });
            show({ title: "Success", message: "Item removed", type: "success" });
            setSelectedItemId("");
        } catch (error: any) {
            addLog("removeItemFromActiveOrder", { itemId: selectedItemId }, null, error.message);
            show({ title: "Error", message: error.message, type: "error" });
        }
    };

    const handleUpdateItemStatus = () => {
        if (!storeState.activeOrderId || !selectedItemId) {
            show({ title: "Error", message: "No active order or item selected", type: "error" });
            return;
        }
        try {
            storeActions.updateItemStatusInActiveOrder(selectedItemId, itemStatus);
            addLog("updateItemStatusInActiveOrder", { itemId: selectedItemId, status: itemStatus }, { success: true });
            show({ title: "Success", message: "Item status updated", type: "success" });
        } catch (error: any) {
            addLog("updateItemStatusInActiveOrder", { itemId: selectedItemId, status: itemStatus }, null, error.message);
            show({ title: "Error", message: error.message, type: "error" });
        }
    };

    const handleUpdateOrderStatus = () => {
        if (!selectedOrderId) {
            show({ title: "Error", message: "Please select an order", type: "error" });
            return;
        }
        try {
            storeActions.updateOrderStatus(selectedOrderId, orderStatus as OrderProfile["order_status"]);
            addLog("updateOrderStatus", { orderId: selectedOrderId, status: orderStatus }, { success: true });
            show({ title: "Success", message: "Order status updated", type: "success" });
        } catch (error: any) {
            addLog("updateOrderStatus", { orderId: selectedOrderId, status: orderStatus }, null, error.message);
            show({ title: "Error", message: error.message, type: "error" });
        }
    };

    const handleAssignOrderToTable = () => {
        if (!selectedOrderId || !tableIdInput) {
            show({ title: "Error", message: "Please select order and enter table ID", type: "error" });
            return;
        }
        try {
            storeActions.assignOrderToTable(selectedOrderId, tableIdInput);
            addLog("assignOrderToTable", { orderId: selectedOrderId, tableId: tableIdInput }, { success: true });
            show({ title: "Success", message: "Order assigned to table", type: "success" });
        } catch (error: any) {
            addLog("assignOrderToTable", { orderId: selectedOrderId, tableId: tableIdInput }, null, error.message);
            show({ title: "Error", message: error.message, type: "error" });
        }
    };

    const handleApplyDiscount = () => {
        if (!selectedOrderId) {
            show({ title: "Error", message: "Please select an order", type: "error" });
            return;
        }
        try {
            const discount: Discount = {
                id: "test-discount",
                label: "Test Discount",
                value: parseFloat(discountValue) || 0.1,
                type: "percentage",
            };
            storeActions.applyDiscountToCheck(selectedOrderId, discount);
            addLog("applyDiscountToCheck", { orderId: selectedOrderId, discount }, { success: true });
            show({ title: "Success", message: "Discount applied", type: "success" });
        } catch (error: any) {
            addLog("applyDiscountToCheck", { orderId: selectedOrderId }, null, error.message);
            show({ title: "Error", message: error.message, type: "error" });
        }
    };

    const handleAddPayment = () => {
        if (!selectedOrderId || !paymentAmount) {
            show({ title: "Error", message: "Please select order and enter amount", type: "error" });
            return;
        }
        try {
            storeActions.addPaymentToOrder({
                orderId: selectedOrderId,
                amount: parseFloat(paymentAmount),
                method: paymentMethod,
                tipAmount: tipAmount ? parseFloat(tipAmount) : undefined,
            });
            addLog("addPaymentToOrder", { orderId: selectedOrderId, amount: paymentAmount, method: paymentMethod }, { success: true });
            show({ title: "Success", message: "Payment added", type: "success" });
            setPaymentAmount("");
            setTipAmount("");
        } catch (error: any) {
            addLog("addPaymentToOrder", { orderId: selectedOrderId, amount: paymentAmount }, null, error.message);
            show({ title: "Error", message: error.message, type: "error" });
        }
    };

    const handleExportState = () => {
        try {
            const stateToExport = {
                ordersById: storeState.ordersById,
                orderIds: storeState.orderIds,
                activeOrderId: storeState.activeOrderId,
                timestamp: new Date().toISOString(),
            };
            const jsonString = formatJSON(stateToExport);
            // Show in Alert for now - user can copy manually
            Alert.alert("Exported State", jsonString?.substring(0, 500) + (jsonString.length > 500 ? "..." : ""), [
                { text: "OK" },
            ]);
            addLog("exportState", null, { exported: true, length: jsonString.length });
            show({ title: "Success", message: "State exported (see alert)", type: "success" });
        } catch (error: any) {
            addLog("exportState", null, null, error.message);
            show({ title: "Error", message: error.message, type: "error" });
        }
    };

    const handleImportState = () => {
        if (!importStateJson) {
            show({ title: "Error", message: "Please paste JSON state", type: "error" });
            return;
        }
        try {
            const parsed = JSON.parse(importStateJson);
            if (parsed.ordersById && parsed.orderIds) {
                const ordersArray = Object.values(parsed.ordersById) as OrderProfile[];
                storeActions.setOrders(ordersArray);
                if (parsed.activeOrderId) {
                    storeActions.setActiveOrder(parsed.activeOrderId);
                }
                addLog("importState", { orderCount: ordersArray.length }, { success: true });
                show({ title: "Success", message: "State imported", type: "success" });
                setImportStateJson("");
            } else {
                throw new Error("Invalid state format");
            }
        } catch (error: any) {
            addLog("importState", null, null, error.message);
            show({ title: "Error", message: error.message, type: "error" });
        }
    };

    const handleClearStore = () => {
        Alert.alert("Confirm Clear", "Are you sure you want to clear all orders?", [
            { text: "Cancel", style: "cancel" },
            {
                text: "Clear",
                style: "destructive",
                onPress: () => {
                    try {
                        storeState.orderIds.forEach((id) => {
                            storeActions.deleteOrder(id);
                        });
                        storeActions.setActiveOrder(null);
                        addLog("clearStore", null, { cleared: true });
                        show({ title: "Success", message: "Store cleared", type: "success" });
                    } catch (error: any) {
                        addLog("clearStore", null, null, error.message);
                        show({ title: "Error", message: error.message, type: "error" });
                    }
                },
            },
        ]);
    };

    const toggleOrderExpansion = (orderId: string) => {
        setExpandedOrders((prev) => {
            const next = new Set(prev);
            if (next.has(orderId)) {
                next.delete(orderId);
            } else {
                next.add(orderId);
            }
            return next;
        });
    };

    const orderAge = (order: OrderProfile) => {
        if (!order.opened_at) return "N/A";
        const opened = new Date(order.opened_at);
        const now = new Date();
        const diffMs = now.getTime() - opened.getTime();
        const diffMins = Math.floor(diffMs / 60000);
        if (diffMins < 60) return `${diffMins}m`;
        const diffHours = Math.floor(diffMins / 60);
        return `${diffHours}h ${diffMins % 60}m`;
    };

    return (
        <View className="flex-1 bg-[#212121]">
            <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
                {/* Header */}
                <View className="mb-4">
                    <View className="flex-row items-center justify-between mb-2">
                        <Text className="text-3xl font-bold text-white">
                            Order Store Test & Debug
                        </Text>
                        <TouchableOpacity
                            onPress={() => router.back()}
                            className="bg-gray-700 px-4 py-2 rounded-lg"
                        >
                            <Text className="text-white font-semibold">Back</Text>
                        </TouchableOpacity>
                    </View>
                    <Text className="text-gray-400 text-sm">
                        Test and debug useOrderStore - View state, test actions, track changes
                    </Text>
                </View>

                {/* State Display Section */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="state-display">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">
                                Store State ({Object.keys(storeState.ordersById).length} orders)
                            </Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-3">
                                <View className="bg-[#303030] p-3 rounded-lg">
                                    <Text className="text-white font-semibold mb-2">Basic State</Text>
                                    <Text className="text-gray-300 text-xs">
                                        Orders Count: {Object.keys(storeState.ordersById).length}
                                    </Text>
                                    <Text className="text-gray-300 text-xs">
                                        Order IDs: {storeState.orderIds.length}
                                    </Text>
                                    <Text className="text-gray-300 text-xs">
                                        Active Order ID: {storeState.activeOrderId || "None"}
                                    </Text>
                                    <Text className="text-gray-300 text-xs">
                                        Is Online: {storeState.isOnline ? "Yes" : "No"}
                                    </Text>
                                    <Text className="text-gray-300 text-xs">
                                        Pending Sync: {storeState.pendingSyncCount}
                                    </Text>
                                    <Text className="text-gray-300 text-xs">
                                        Pending Table Selection: {storeState.pendingTableSelection || "None"}
                                    </Text>
                                </View>

                                <View className="bg-[#303030] p-3 rounded-lg">
                                    <Text className="text-white font-semibold mb-2">Active Order Totals</Text>
                                    <Text className="text-gray-300 text-xs">
                                        Subtotal: ${storeState.activeOrderSubtotal.toFixed(2)}
                                    </Text>
                                    <Text className="text-gray-300 text-xs">
                                        Tax: ${storeState.activeOrderTax.toFixed(2)}
                                    </Text>
                                    <Text className="text-gray-300 text-xs">
                                        Discount: ${storeState.activeOrderDiscount.toFixed(2)}
                                    </Text>
                                    <Text className="text-gray-300 text-xs">
                                        Total: ${storeState.activeOrderTotal.toFixed(2)}
                                    </Text>
                                    <Text className="text-gray-300 text-xs">
                                        Outstanding Subtotal: ${storeState.activeOrderOutstandingSubtotal.toFixed(2)}
                                    </Text>
                                    <Text className="text-gray-300 text-xs">
                                        Outstanding Tax: ${storeState.activeOrderOutstandingTax.toFixed(2)}
                                    </Text>
                                    <Text className="text-gray-300 text-xs">
                                        Outstanding Total: ${storeState.activeOrderOutstandingTotal.toFixed(2)}
                                    </Text>
                                </View>

                                <View className="bg-[#303030] p-3 rounded-lg">
                                    <Text className="text-white font-semibold mb-2">Orders By ID Keys</Text>
                                    <ScrollView className="max-h-40">
                                        <Text className="text-gray-300 text-xs font-mono">
                                            {Object.keys(storeState.ordersById).join(", ") || "None"}
                                        </Text>
                                    </ScrollView>
                                </View>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Orders List Section */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="orders-list">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">
                                Orders List ({storeState.orders.length})
                            </Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-2">
                                {storeState.orders.length === 0 ? (
                                    <Text className="text-gray-400 text-center py-4">No orders</Text>
                                ) : (
                                    storeState.orders.map((order) => (
                                        <View
                                            key={order.id}
                                            className={`p-3 rounded-lg border ${order.id === storeState.activeOrderId
                                                ? "bg-blue-900/20 border-blue-600"
                                                : "bg-[#303030] border-gray-600"
                                                }`}
                                        >
                                            <TouchableOpacity
                                                onPress={() => toggleOrderExpansion(order.id)}
                                                className="flex-row items-center justify-between"
                                            >
                                                <View className="flex-1">
                                                    <Text className="text-white font-semibold">
                                                        {order.id === storeState.activeOrderId && "⭐ "}
                                                        Order: {order?.id?.substring(0, 20)}...
                                                    </Text>
                                                    <Text className="text-gray-400 text-xs">
                                                        DB ID: {order.db_order_id || "None"} | Status: {order.order_status} | Table: {order.service_location_id || "None"}
                                                    </Text>
                                                    <Text className="text-gray-400 text-xs">
                                                        Items: {order?.items?.length} | Total: ${(order?.total_amount || 0).toFixed(2)} | Age: {orderAge(order)}
                                                    </Text>
                                                </View>
                                                {expandedOrders.has(order.id) ? (
                                                    <ChevronUp color="#9CA3AF" size={20} />
                                                ) : (
                                                    <ChevronDown color="#9CA3AF" size={20} />
                                                )}
                                            </TouchableOpacity>

                                            {expandedOrders.has(order.id) && (
                                                <View className="mt-2 pt-2 border-t border-gray-600">
                                                    <ScrollView className="max-h-60">
                                                        <Text className="text-gray-300 text-xs font-mono">
                                                            {formatJSON(order)}
                                                        </Text>
                                                    </ScrollView>
                                                </View>
                                            )}
                                        </View>
                                    ))
                                )}
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Active Order Details Section */}
                {activeOrder && (
                    <Accordion type="single" collapsible className="mb-4">
                        <AccordionItem value="active-order">
                            <AccordionTrigger className="py-3">
                                <Text className="text-xl font-bold text-white">
                                    Active Order Details
                                </Text>
                            </AccordionTrigger>
                            <AccordionContent>
                                <View className="space-y-3">
                                    <View className="bg-[#303030] p-3 rounded-lg">
                                        <Text className="text-white font-semibold mb-2">Order Info</Text>
                                        <ScrollView className="max-h-60">
                                            <Text className="text-gray-300 text-xs font-mono">
                                                {formatJSON(activeOrder)}
                                            </Text>
                                        </ScrollView>
                                    </View>

                                    <View className="bg-[#303030] p-3 rounded-lg">
                                        <Text className="text-white font-semibold mb-2">
                                            Items ({activeOrder?.items?.length})
                                        </Text>
                                        {activeOrder.items.map((item) => (
                                            <View key={item.id} className="mb-2 p-2 bg-[#212121] rounded">
                                                <Text className="text-white text-sm font-semibold">{item.name}</Text>
                                                <Text className="text-gray-400 text-xs">
                                                    Qty: {item.quantity} | Price: ${item.price.toFixed(2)} | Status: {item.item_status || "N/A"}
                                                </Text>
                                                <Text className="text-gray-400 text-xs">
                                                    ID: {item.id}
                                                </Text>
                                            </View>
                                        ))}
                                    </View>

                                    {activeOrder.payments && activeOrder.payments.length > 0 && (
                                        <View className="bg-[#303030] p-3 rounded-lg">
                                            <Text className="text-white font-semibold mb-2">
                                                Payments ({activeOrder.payments.length})
                                            </Text>
                                            {activeOrder.payments.map((payment, idx) => (
                                                <View key={idx} className="mb-2 p-2 bg-[#212121] rounded">
                                                    <Text className="text-white text-sm">
                                                        ${payment.amount.toFixed(2)} via {payment.method}
                                                    </Text>
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </View>
                            </AccordionContent>
                        </AccordionItem>
                    </Accordion>
                )}

                {/* Order Management Actions */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="order-management">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">Order Management</Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">Start New Order</Text>
                                    <Input
                                        value={newOrderTableId}
                                        onChangeText={setNewOrderTableId}
                                        placeholder="Table ID (optional)"
                                        className="bg-[#303030] border-gray-600 text-white mb-2"
                                    />
                                    <Input
                                        value={newOrderGuestCount}
                                        onChangeText={setNewOrderGuestCount}
                                        placeholder="Guest Count"
                                        keyboardType="numeric"
                                        className="bg-[#303030] border-gray-600 text-white mb-2"
                                    />
                                    <Button onPress={handleStartNewOrder} className="bg-green-600">
                                        <Text className="text-white font-semibold">Start New Order</Text>
                                    </Button>
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">Select Order</Text>
                                    <Select
                                        value={
                                            selectedOrderId
                                                ? {
                                                    value: selectedOrderId,
                                                    label: selectedOrderId?.substring(0, 30) + "...",
                                                }
                                                : undefined
                                        }
                                        onValueChange={(option) => setSelectedOrderId(option?.value || "")}
                                    >
                                        <SelectTrigger className="bg-[#303030] border-gray-600">
                                            <SelectValue placeholder="Select order" className="text-white" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#212121] border-gray-600">
                                            {storeState.orders.map((order) => (
                                                <SelectItem
                                                    key={order.id}
                                                    value={order.id}
                                                    label={`${order?.id?.substring(0, 20)}... (${order.order_status})`}
                                                />
                                            ))}
                                        </SelectContent>
                                    </Select>
                                </View>

                                <View className="flex-row gap-2">
                                    <Button onPress={handleSetActiveOrder} className="bg-blue-600 flex-1">
                                        <Text className="text-white font-semibold">Set Active</Text>
                                    </Button>
                                    <Button onPress={handleDeleteOrder} className="bg-red-600 flex-1">
                                        <Text className="text-white font-semibold">Delete</Text>
                                    </Button>
                                    <Button onPress={handleVoidOrder} className="bg-orange-600 flex-1">
                                        <Text className="text-white font-semibold">Void</Text>
                                    </Button>
                                </View>

                                <Button onPress={storeActions.clearCart} className="bg-yellow-600">
                                    <Text className="text-white font-semibold">Clear Cart</Text>
                                </Button>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Item Management Actions */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="item-management">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">Item Management</Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">Add Item</Text>
                                    <Input
                                        value={itemPrice}
                                        onChangeText={setItemPrice}
                                        placeholder="Price"
                                        keyboardType="decimal-pad"
                                        className="bg-[#303030] border-gray-600 text-white mb-2"
                                    />
                                    <Input
                                        value={itemQuantity}
                                        onChangeText={setItemQuantity}
                                        placeholder="Quantity"
                                        keyboardType="numeric"
                                        className="bg-[#303030] border-gray-600 text-white mb-2"
                                    />
                                    <Button onPress={handleAddItem} className="bg-green-600">
                                        <Text className="text-white font-semibold">Add Item</Text>
                                    </Button>
                                </View>

                                {activeOrder && activeOrder?.items?.length > 0 && (
                                    <>
                                        <View>
                                            <Text className="text-sm font-semibold text-gray-300 mb-2">Select Item</Text>
                                            <Select
                                                value={
                                                    selectedItemId
                                                        ? {
                                                            value: selectedItemId,
                                                            label: activeOrder.items.find((i) => i.id === selectedItemId)?.name || selectedItemId?.substring(0, 30),
                                                        }
                                                        : undefined
                                                }
                                                onValueChange={(option) => setSelectedItemId(option?.value || "")}
                                            >
                                                <SelectTrigger className="bg-[#303030] border-gray-600">
                                                    <SelectValue placeholder="Select item" className="text-white" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#212121] border-gray-600">
                                                    {activeOrder.items.map((item) => (
                                                        <SelectItem
                                                            key={item.id}
                                                            value={item.id}
                                                            label={`${item.name} (Qty: ${item.quantity})`}
                                                        />
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </View>

                                        <View className="flex-row gap-2">
                                            <Button onPress={handleUpdateItem} className="bg-blue-600 flex-1">
                                                <Text className="text-white font-semibold">Update</Text>
                                            </Button>
                                            <Button onPress={handleRemoveItem} className="bg-red-600 flex-1">
                                                <Text className="text-white font-semibold">Remove</Text>
                                            </Button>
                                        </View>

                                        <View>
                                            <Text className="text-sm font-semibold text-gray-300 mb-2">Update Item Status</Text>
                                            <Select
                                                value={{
                                                    value: itemStatus,
                                                    label: itemStatus,
                                                }}
                                                onValueChange={(option) => setItemStatus(option?.value as any)}
                                            >
                                                <SelectTrigger className="bg-[#303030] border-gray-600">
                                                    <SelectValue placeholder="Select item status" className="text-white" />
                                                </SelectTrigger>
                                                <SelectContent className="bg-[#212121] border-gray-600">
                                                    <SelectItem value="preparing" label="Preparing" />
                                                    <SelectItem value="ready" label="Ready" />
                                                    <SelectItem value="served" label="Served" />
                                                </SelectContent>
                                            </Select>
                                            <Button onPress={handleUpdateItemStatus} className="bg-purple-600 mt-2">
                                                <Text className="text-white font-semibold">Update Status</Text>
                                            </Button>
                                        </View>
                                    </>
                                )}
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Order Status & Table Assignment */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="status-table">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">Status & Table Assignment</Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">Update Order Status</Text>
                                    <Select
                                        value={{
                                            value: orderStatus,
                                            label: orderStatus,
                                        }}
                                        onValueChange={(option) => setOrderStatus(option?.value || "")}
                                    >
                                        <SelectTrigger className="bg-[#303030] border-gray-600">
                                            <SelectValue placeholder="Select order status" className="text-white" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#212121] border-gray-600">
                                            <SelectItem value="draft" label="Draft" />
                                            <SelectItem value="pending" label="Pending" />
                                            <SelectItem value="preparing" label="Preparing" />
                                            <SelectItem value="ready" label="Ready" />
                                            <SelectItem value="completed" label="Completed" />
                                            <SelectItem value="cancelled" label="Cancelled" />
                                            <SelectItem value="void" label="Void" />
                                        </SelectContent>
                                    </Select>
                                    <Button onPress={handleUpdateOrderStatus} className="bg-blue-600 mt-2">
                                        <Text className="text-white font-semibold">Update Status</Text>
                                    </Button>
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">Assign Order to Table</Text>
                                    <Input
                                        value={tableIdInput}
                                        onChangeText={setTableIdInput}
                                        placeholder="Table ID"
                                        className="bg-[#303030] border-gray-600 text-white mb-2"
                                    />
                                    <Button onPress={handleAssignOrderToTable} className="bg-green-600">
                                        <Text className="text-white font-semibold">Assign to Table</Text>
                                    </Button>
                                </View>

                                <Button
                                    onPress={() => {
                                        if (tableIdInput) {
                                            storeActions.assignActiveOrderToTable(tableIdInput);
                                            addLog("assignActiveOrderToTable", { tableId: tableIdInput }, { success: true });
                                            show({ title: "Success", message: "Active order assigned", type: "success" });
                                        }
                                    }}
                                    className="bg-blue-600"
                                >
                                    <Text className="text-white font-semibold">Assign Active Order to Table</Text>
                                </Button>

                                <Button
                                    onPress={() => {
                                        if (selectedOrderId && tableIdInput) {
                                            storeActions.transferOrderToTable(selectedOrderId, tableIdInput);
                                            addLog("transferOrderToTable", { orderId: selectedOrderId, newTableId: tableIdInput }, { success: true });
                                            show({ title: "Success", message: "Order transferred", type: "success" });
                                        }
                                    }}
                                    className="bg-purple-600"
                                >
                                    <Text className="text-white font-semibold">Transfer Order to Table</Text>
                                </Button>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Discounts & Payments */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="discounts-payments">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">Discounts & Payments</Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">Apply Discount</Text>
                                    <Input
                                        value={discountValue}
                                        onChangeText={setDiscountValue}
                                        placeholder="Discount Value (0.1 = 10%)"
                                        keyboardType="decimal-pad"
                                        className="bg-[#303030] border-gray-600 text-white mb-2"
                                    />
                                    <View className="flex-row gap-2">
                                        <Button onPress={handleApplyDiscount} className="bg-green-600 flex-1">
                                            <Text className="text-white font-semibold">Apply</Text>
                                        </Button>
                                        <Button
                                            onPress={() => {
                                                if (selectedOrderId) {
                                                    storeActions.removeCheckDiscount(selectedOrderId);
                                                    addLog("removeCheckDiscount", { orderId: selectedOrderId }, { success: true });
                                                    show({ title: "Success", message: "Discount removed", type: "success" });
                                                }
                                            }}
                                            className="bg-red-600 flex-1"
                                        >
                                            <Text className="text-white font-semibold">Remove</Text>
                                        </Button>
                                    </View>
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">Add Payment</Text>
                                    <Input
                                        value={paymentAmount}
                                        onChangeText={setPaymentAmount}
                                        placeholder="Amount"
                                        keyboardType="decimal-pad"
                                        className="bg-[#303030] border-gray-600 text-white mb-2"
                                    />
                                    <Select
                                        value={{
                                            value: paymentMethod,
                                            label: paymentMethod,
                                        }}
                                        onValueChange={(option) => setPaymentMethod(option?.value as PaymentType)}
                                    >
                                        <SelectTrigger className="bg-[#303030] border-gray-600">
                                            <SelectValue placeholder="Select payment method" className="text-white" />
                                        </SelectTrigger>
                                        <SelectContent className="bg-[#212121] border-gray-600">
                                            <SelectItem value="Cash" label="Cash" />
                                            <SelectItem value="Card" label="Card" />
                                        </SelectContent>
                                    </Select>
                                    <Input
                                        value={tipAmount}
                                        onChangeText={setTipAmount}
                                        placeholder="Tip Amount (optional)"
                                        keyboardType="decimal-pad"
                                        className="bg-[#303030] border-gray-600 text-white mb-2 mt-2"
                                    />
                                    <Button onPress={handleAddPayment} className="bg-green-600">
                                        <Text className="text-white font-semibold">Add Payment</Text>
                                    </Button>
                                </View>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Kitchen Actions */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="kitchen-actions">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">Kitchen Actions</Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-2">
                                <Button
                                    onPress={() => {
                                        storeActions.fireActiveOrderToKitchen();
                                        addLog("fireActiveOrderToKitchen", null, { success: true });
                                        show({ title: "Success", message: "Order sent to kitchen", type: "success" });
                                    }}
                                    className="bg-orange-600"
                                >
                                    <Text className="text-white font-semibold">Fire Active Order to Kitchen</Text>
                                </Button>
                                <Button
                                    onPress={() => {
                                        storeActions.sendNewItemsToKitchen();
                                        addLog("sendNewItemsToKitchen", null, { success: true });
                                        show({ title: "Success", message: "New items sent", type: "success" });
                                    }}
                                    className="bg-orange-600"
                                >
                                    <Text className="text-white font-semibold">Send New Items to Kitchen</Text>
                                </Button>
                                <Button
                                    onPress={() => {
                                        if (selectedOrderId) {
                                            storeActions.sendNewItemsToKitchenForOrder(selectedOrderId);
                                            addLog("sendNewItemsToKitchenForOrder", { orderId: selectedOrderId }, { success: true });
                                            show({ title: "Success", message: "Items sent", type: "success" });
                                        }
                                    }}
                                    className="bg-orange-600"
                                >
                                    <Text className="text-white font-semibold">Send New Items (Selected Order)</Text>
                                </Button>
                                <Button
                                    onPress={() => {
                                        if (selectedOrderId) {
                                            storeActions.markAllItemsAsReady(selectedOrderId);
                                            addLog("markAllItemsAsReady", { orderId: selectedOrderId }, { success: true });
                                            show({ title: "Success", message: "All items marked ready", type: "success" });
                                        }
                                    }}
                                    className="bg-green-600"
                                >
                                    <Text className="text-white font-semibold">Mark All Items Ready</Text>
                                </Button>
                                <Button
                                    onPress={() => {
                                        if (selectedOrderId) {
                                            storeActions.markAllItemsAsServed(selectedOrderId);
                                            addLog("markAllItemsAsServed", { orderId: selectedOrderId }, { success: true });
                                            show({ title: "Success", message: "All items marked served", type: "success" });
                                        }
                                    }}
                                    className="bg-blue-600"
                                >
                                    <Text className="text-white font-semibold">Mark All Items Served</Text>
                                </Button>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Debug Tools */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="debug-tools">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">Debug Tools</Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-4">
                                <View className="flex-row gap-2">
                                    <Button onPress={handleExportState} className="bg-blue-600 flex-1">
                                        <Download color="white" size={20} />
                                        <Text className="text-white font-semibold ml-2">Export State</Text>
                                    </Button>
                                    <Button
                                        onPress={() => {
                                            addLog("forceRefresh", null, { success: true });
                                            show({ title: "Refreshed", message: "State refreshed", type: "success" });
                                        }}
                                        className="bg-purple-600 flex-1"
                                    >
                                        <RefreshCw color="white" size={20} />
                                        <Text className="text-white font-semibold ml-2">Refresh</Text>
                                    </Button>
                                </View>

                                <View>
                                    <Text className="text-sm font-semibold text-gray-300 mb-2">Import State (JSON)</Text>
                                    <TextInput
                                        value={importStateJson}
                                        onChangeText={setImportStateJson}
                                        placeholder="Paste JSON state here"
                                        multiline
                                        numberOfLines={6}
                                        className="bg-[#303030] border border-gray-600 rounded-lg px-3 py-2 text-white text-xs font-mono"
                                        placeholderTextColor="#9CA3AF"
                                    />
                                    <Button onPress={handleImportState} className="bg-green-600 mt-2">
                                        <Upload color="white" size={20} />
                                        <Text className="text-white font-semibold ml-2">Import State</Text>
                                    </Button>
                                </View>

                                <Button onPress={handleClearStore} className="bg-red-600">
                                    <Trash2 color="white" size={20} />
                                    <Text className="text-white font-semibold ml-2">Clear All Orders</Text>
                                </Button>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>

                {/* Logging Section */}
                <Accordion type="single" collapsible className="mb-4">
                    <AccordionItem value="logging">
                        <AccordionTrigger className="py-3">
                            <Text className="text-xl font-bold text-white">
                                Operation Logs ({logs.length})
                            </Text>
                        </AccordionTrigger>
                        <AccordionContent>
                            <View className="space-y-2">
                                <View className="flex-row justify-between items-center mb-2">
                                    <Text className="text-gray-300 text-sm">
                                        Last {logs.length} operations
                                    </Text>
                                    <Button
                                        onPress={() => {
                                            setLogs([]);
                                            show({ title: "Success", message: "Logs cleared", type: "success" });
                                        }}
                                        className="bg-gray-600"
                                    >
                                        <Text className="text-white text-xs">Clear Logs</Text>
                                    </Button>
                                </View>
                                <ScrollView className="max-h-96">
                                    {logs.length === 0 ? (
                                        <Text className="text-gray-400 text-center py-4">No logs</Text>
                                    ) : (
                                        logs.map((log) => (
                                            <View
                                                key={log.id}
                                                className={`p-3 rounded-lg mb-2 border ${log.success
                                                    ? "bg-green-900/20 border-green-600"
                                                    : "bg-red-900/20 border-red-600"
                                                    }`}
                                            >
                                                <View className="flex-row items-center justify-between mb-1">
                                                    <Text className="text-white font-semibold text-sm">
                                                        {log.operation}
                                                    </Text>
                                                    <Text className="text-gray-400 text-xs">
                                                        {new Date(log.timestamp).toLocaleTimeString()}
                                                    </Text>
                                                </View>
                                                {log.request && (
                                                    <Text className="text-gray-300 text-xs font-mono mb-1">
                                                        Request: {formatJSON(log.request)}
                                                    </Text>
                                                )}
                                                {log.response && (
                                                    <Text className="text-green-300 text-xs font-mono mb-1">
                                                        Response: {formatJSON(log.response)}
                                                    </Text>
                                                )}
                                                {log.error && (
                                                    <Text className="text-red-300 text-xs font-mono">
                                                        Error: {log.error}
                                                    </Text>
                                                )}
                                            </View>
                                        ))
                                    )}
                                </ScrollView>
                            </View>
                        </AccordionContent>
                    </AccordionItem>
                </Accordion>
            </ScrollView>
        </View>
    );
};

export default OrderStoreTest;

