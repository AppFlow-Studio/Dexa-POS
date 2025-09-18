import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Eye, Plus } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { FlatList, Pressable, Text, TouchableOpacity, View } from "react-native";
import OrderLineItemsModal from "../order/OrderLineItemsModal";

// Define types for props
type TabName = "All" | "Dine In" | "Take Away" | "Delivery";

interface Tab {
    name: TabName;
    count?: number;
}

interface OrderTabsProps {
    onTabChange: (tab: TabName) => void;
    totalOrder: number;
}

const OrderTabs: React.FC<OrderTabsProps> = ({ onTabChange, totalOrder }) => {
    const [activeWindow, setActiveWindow] = useState("All");
    const TABS: Tab[] = [
        { name: "All", count: totalOrder },
        { name: "Dine In" },
        { name: "Take Away" },
        { name: "Delivery" },
    ];

    const handlePress = (tabName: TabName) => {
        setActiveWindow(tabName);
        onTabChange(tabName);
    };

    return (
        <View className="bg-[#303030] border border-gray-600 p-1 rounded-xl flex-row self-start">
            {TABS.map((tab) => {
                const isActive = activeWindow === tab.name;
                return (
                    <Pressable
                        key={tab.name}
                        onPress={() => handlePress(tab.name)}
                        className={`py-2.5 px-4 rounded-lg flex-row items-center ${isActive ? "bg-[#212121]" : ""
                            }`}
                    >
                        <Text
                            className={`font-semibold ${isActive ? "text-blue-400" : "text-gray-400"
                                }`}
                        >
                            {tab.name}
                        </Text>
                        {tab.count !== undefined && tab.count > 0 && (
                            <View className="bg-blue-500 rounded-full w-6 h-6 items-center justify-center ml-2">
                                <Text className="text-white font-bold text-xs">
                                    {String(tab.count)}
                                </Text>
                            </View>
                        )}
                    </Pressable>
                );
            })}
        </View>
    );
};

interface OrderRowProps {
    order: any;
    onViewItems: () => void;
    onAssignToBill: () => void;
}

const OrderRow: React.FC<OrderRowProps> = ({ order, onViewItems, onAssignToBill }) => {
    const isReady = order.order_status === "Ready";
    const statusBg = isReady ? "bg-green-600" : "bg-yellow-600";
    const statusText = isReady ? "text-green-100" : "text-yellow-100";
    const paidBg =
        order.paid_status === "Paid"
            ? "bg-green-600"
            : order.paid_status === "Pending"
                ? "bg-yellow-600"
                : "bg-red-600";
    const paidText =
        order.paid_status === "Paid"
            ? "text-green-100"
            : order.paid_status === "Pending"
                ? "text-yellow-100"
                : "text-red-100";

    return (
        <View className="bg-[#303030] p-4 rounded-lg border border-gray-600 mb-2">
            <View className="flex-row items-center justify-between">
                <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-2">
                        <View className={`px-2.5 py-1 rounded-full ${statusBg}`}>
                            <Text className={`text-xs font-bold ${statusText}`}>
                                {order.order_status}
                            </Text>
                        </View>
                        <View className={`px-2.5 py-1 rounded-full ${paidBg}`}>
                            <Text className={`text-xs font-bold ${paidText}`}>
                                {order.paid_status}
                            </Text>
                        </View>
                    </View>
                    <Text className="text-lg font-bold text-white mb-1">
                        {order.customer_name || "Walk-In"} #{order.id.slice(-5)}
                    </Text>
                    <View className="flex-row justify-between items-center">
                        <Text className="text-sm text-gray-400">
                            {order.order_type}
                            {order.service_location_id && (
                                <> • Table {order.service_location_id}</>
                            )}
                        </Text>

                    </View>
                </View>
                <View className="flex-col flex items-center justify-center gap-y-2">
                    <View className="flex-row gap-2">
                        <TouchableOpacity
                            onPress={onViewItems}
                            className="flex-row items-center justify-center p-3 rounded-lg border border-gray-600 bg-[#212121]"
                        >
                            <Eye color="#9CA3AF" size={16} />
                            <Text className="font-semibold text-white ml-2">View Items</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={onAssignToBill}
                            className="flex-row items-center justify-center p-3 rounded-lg bg-blue-500"
                        >
                            <Plus color="#FFFFFF" size={16} />
                            <Text className="font-semibold text-white ml-2">Add to Bill</Text>
                        </TouchableOpacity>
                    </View>

                    {order.paid_status !== "Paid" && (
                        <View className="w-full">
                            <RetrieveButton orderId={order.id} />
                        </View>
                    )}

                    <Text className="text-sm text-gray-400 text-right w-full">
                        {new Date(order.opened_at).toLocaleTimeString("en-US", {
                            hour: "2-digit",
                            minute: "2-digit",
                        })}
                    </Text>
                </View>
            </View>
        </View>
    );
};

const RetrieveButton = ({ orderId }: { orderId: string }) => {
    const { setActiveOrder } = useOrderStore();
    return (
        <TouchableOpacity
            onPress={() => setActiveOrder(orderId)}
            className="flex-row items-center justify-center p-3 rounded-lg bg-green-600"
        >
            <Text className="font-semibold text-white ml-2">Retrieve to Pay</Text>
        </TouchableOpacity>
    );
};

const PreviousOrdersSection = () => {
    const { orders, activeOrderId, addItemToActiveOrder, generateCartItemId } = useOrderStore();
    const [activeTab, setActiveTab] = useState("All");
    const [isItemsModalOpen, setItemsModalOpen] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);

    // Get all orders (including completed ones)
    const allOrders = orders.filter((o) => o.order_status !== "Voided" && o.items.length > 0);

    const totalOrder = allOrders.length;

    // Filter orders based on active tab
    const filteredOrders = useMemo(() => {
        if (activeTab === "All") {
            return allOrders;
        }
        return allOrders.filter((o) => o.order_type === activeTab && o.items.length > 0);
    }, [allOrders, activeTab]);

    // Function passed to OrderTabs to update the state
    const handleTabChange = (tabName: string) => {
        setActiveTab(tabName);
    };

    const handleViewItems = (orderId: string) => {
        setSelectedOrderId(orderId);
        setItemsModalOpen(true);
    };

    const handleAssignToBill = (orderId: string) => {
        if (!activeOrderId) {
            toast.error("No active order found. Please start a new order first.", {
                duration: 3000,
                position: ToastPosition.BOTTOM,
            });
            return;
        }

        const previousOrder = orders.find((o) => o.id === orderId);
        if (!previousOrder) {
            toast.error("Previous order not found.", {
                duration: 3000,
                position: ToastPosition.BOTTOM,
            });
            return;
        }

        if (!previousOrder.items || previousOrder.items.length === 0) {
            toast.error("No items found in the previous order.", {
                duration: 3000,
                position: ToastPosition.BOTTOM,
            });
            return;
        }

        // Add items from the previous order to the current active order
        let addedCount = 0;
        previousOrder.items.forEach((item) => {
            // Create a new item with a unique ID for the current order
            const newItem = {
                ...item,
                id: generateCartItemId(item.menuItemId, item.customizations),
                isDraft: false,
            };
            addItemToActiveOrder(newItem);
            addedCount++;
        });

        toast.success(`Added ${addedCount} items from previous order to current bill.`, {
            duration: 3000,
            position: ToastPosition.BOTTOM,
        });
    };

    return (
        <View className="flex-1">
            <View className="flex-row justify-between items-center mb-4">
                <OrderTabs onTabChange={handleTabChange} totalOrder={totalOrder || 0} />
            </View>

            <FlatList
                data={filteredOrders}
                keyExtractor={(item) => item.id}
                showsVerticalScrollIndicator={false}
                className="flex-1"
                renderItem={({ item }) => (
                    <OrderRow
                        order={item}
                        onViewItems={() => handleViewItems(item.id)}
                        onAssignToBill={() => handleAssignToBill(item.id)}
                    />
                )}
                ListEmptyComponent={
                    <View className="h-40 items-center justify-center w-full">
                        <Text className="text-gray-400">No previous orders found.</Text>
                    </View>
                }
            />

            <OrderLineItemsModal
                isOpen={isItemsModalOpen}
                onClose={() => setItemsModalOpen(false)}
                orderId={selectedOrderId}
            />
        </View>
    );
};

export default PreviousOrdersSection;