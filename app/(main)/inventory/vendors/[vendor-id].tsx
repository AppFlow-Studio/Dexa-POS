import { useInventoryStore } from "@/stores/useInventoryStore";
import { useLocalSearchParams } from "expo-router";
import { Plus } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const StatCard = ({ label, value }: { label: string; value: string | number }) => (
    <View className="flex-1 bg-[#303030] border border-gray-700 rounded-2xl p-4 mr-3">
        <Text className="text-xs font-semibold text-gray-400">{label}</Text>
        <Text className="text-xl font-bold text-white mt-1">{value}</Text>
    </View>
);

const VendorDetailsScreen = () => {
    const params = useLocalSearchParams();
    const rawId = (params as any).vendorId || (params as any)["vendor-id"];
    const vendorId = Array.isArray(rawId) ? rawId[0] : rawId;
    const [activeTab, setActiveTab] = useState<'purchase-orders' | 'associated-items'>('purchase-orders');

    const { vendors, purchaseOrders, inventoryItems } = useInventoryStore();
    const vendor = vendors.find((v) => v.id === vendorId);

    const vendorPOs = useMemo(
        () => purchaseOrders.filter((po) => po.vendorId === vendorId),
        [purchaseOrders, vendorId]
    );

    const associatedItems = useMemo(
        () => inventoryItems.filter((item) => item.vendorId === vendorId),
        [inventoryItems, vendorId]
    );

    const stats = useMemo(() => {
        const totalPOs = vendorPOs.length;
        const received = vendorPOs.filter((po) => po.status === "Received").length;
        const inDraft = vendorPOs.filter((po) => po.status === "Draft").length;
        const sent = vendorPOs.filter((po) => po.status === "Sent").length;
        const totalLines = vendorPOs.reduce((acc, po) => acc + po.items.length, 0);
        const totalQty = vendorPOs.reduce(
            (acc, po) => acc + po.items.reduce((a, li) => a + li.quantity, 0),
            0
        );
        const estSpend = vendorPOs.reduce(
            (acc, po) => acc + po.items.reduce((a, li) => a + li.quantity * li.cost, 0),
            0
        );
        return { totalPOs, received, inDraft, sent, totalLines, totalQty, estSpend };
    }, [vendorPOs]);

    if (!vendor) {
        return (
            <View className="flex-1 justify-center items-center bg-[#212121] px-6">
                <Text className="text-3xl font-bold text-white mb-4">Vendor Not Found</Text>
                <Text className="text-lg text-gray-400 mb-8 text-center">
                    The vendor you are looking for does not exist or may have been removed.
                </Text>
                <TouchableOpacity
                    className="bg-blue-600 px-6 py-3 rounded-lg"
                    onPress={() => {
                        if (typeof window !== "undefined" && window.history.length > 1) {
                            window.history.back();
                        }
                    }}
                >
                    <Text className="text-white text-lg font-semibold">Go Back</Text>
                </TouchableOpacity>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#212121]">
            <ScrollView className="flex-1" contentContainerStyle={{ padding: 16 }}>
                {/* Header */}
                <View className="bg-[#303030] border border-gray-700 rounded-2xl p-5 mb-4">
                    <View className="flex-row justify-between items-start">
                        <View className="flex-1 pr-3 flex flex-row items-center">
                            <Text className="text-3xl font-bold text-white">{vendor.name}</Text>
                            {!!vendor.description && (
                                <Text className="text-gray-300 mt-1 text-xl"> - {vendor.description}</Text>
                            )}
                        </View>
                    </View>
                    <View className="flex-row mt-4">
                        <View className="mr-6">
                            <Text className="text-xl font-semibold text-gray-400">Contact</Text>
                            <Text className="text-white text-lg mt-1">{vendor.contactPerson}</Text>
                        </View>
                        <View className="mr-6">
                            <Text className="text-xl font-semibold text-gray-400">Phone</Text>
                            <Text className="text-white text-lg mt-1">{vendor.phone}</Text>
                        </View>
                        <View>
                            <Text className="text-xl font-semibold text-gray-400">Email</Text>
                            <Text className="text-white text-lg mt-1">{vendor.email}</Text>
                        </View>
                    </View>
                </View>

                {/* Stats */}
                <View className="flex-row mb-4">
                    <StatCard label="Total POs" value={stats.totalPOs} />
                    <StatCard label="Received" value={stats.received} />
                    <StatCard label="Sent" value={stats.sent} />
                    <StatCard label="Draft" value={stats.inDraft} />
                </View>
                <View className="flex-row mb-6">
                    <StatCard label="Line Items" value={stats.totalLines} />
                    <StatCard label="Total Qty" value={stats.totalQty} />
                    <StatCard label="Est. Spend" value={`$${stats.estSpend.toFixed(2)}`} />
                </View>

                {/* Tab Bar */}
                <View className="bg-[#303030] border border-gray-700 rounded-2xl p-1 mb-4">
                    <View className="flex-row">
                        <TouchableOpacity
                            onPress={() => setActiveTab('purchase-orders')}
                            className={`flex-1 py-3 px-4 rounded-xl ${activeTab === 'purchase-orders' ? 'bg-blue-500' : 'bg-transparent'}`}
                        >
                            <Text className={`text-center font-semibold ${activeTab === 'purchase-orders' ? 'text-white' : 'text-gray-400'}`}>
                                Purchase Orders
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            onPress={() => setActiveTab('associated-items')}
                            className={`flex-1 py-3 px-4 rounded-xl ${activeTab === 'associated-items' ? 'bg-blue-500' : 'bg-transparent'}`}
                        >
                            <Text className={`text-center font-semibold ${activeTab === 'associated-items' ? 'text-white' : 'text-gray-400'}`}>
                                Associated Items
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Tab Content */}
                {activeTab === 'purchase-orders' && (
                    <View className="bg-[#303030] border border-gray-700 rounded-2xl p-4">
                        <View className="flex-row justify-between items-center">
                            <Text className="text-lg font-bold text-white mb-3">Purchase Orders</Text>
                            <TouchableOpacity className="flex-row items-center gap-2 justify-center w-fit bg-blue-500 rounded-lg px-4 py-2">
                                <Plus className="text-white bg-white" size={22} color={'white'} />
                                <Text className="text-white">Create Purchase</Text>
                            </TouchableOpacity>
                        </View>
                        {vendorPOs.length === 0 ? (
                            <View className="py-10 items-center">
                                <Text className="text-gray-400">No purchase orders for this vendor yet.</Text>
                            </View>
                        ) : (
                            vendorPOs.map((po) => {
                                const itemsCount = po.items.length;
                                const qty = po.items.reduce((a, li) => a + li.quantity, 0);
                                const amount = po.items.reduce((a, li) => a + li.quantity * li.cost, 0);
                                const statusColor =
                                    po.status === "Received"
                                        ? "bg-green-600 text-green-100"
                                        : po.status === "Sent"
                                            ? "bg-blue-600 text-blue-100"
                                            : "bg-yellow-600 text-yellow-100";
                                return (
                                    <View
                                        key={po.id}
                                        className="border-t border-gray-700 py-3 first:border-t-0"
                                    >
                                        <View className="flex-row justify-between items-center">
                                            <View className="flex-1 pr-3">
                                                <View className="flex-row items-center gap-2">
                                                    <Text className="text-white font-semibold">{po.poNumber}</Text>
                                                    <View className={`px-2 py-0.5 rounded-full ${statusColor}`}>
                                                        <Text className="text-[10px] font-bold">{po.status}</Text>
                                                    </View>
                                                </View>
                                                <Text className="text-gray-400 mt-1">
                                                    Created {new Date(po.createdAt).toLocaleString()}
                                                    {po.receivedAt ? ` • Received ${new Date(po.receivedAt).toLocaleString()}` : ""}
                                                </Text>
                                            </View>
                                            <View className="items-end">
                                                <Text className="text-white font-semibold">${amount.toFixed(2)}</Text>
                                                <Text className="text-gray-400 text-xs mt-1">{itemsCount} lines • {qty} qty</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </View>
                )}

                {activeTab === 'associated-items' && (
                    <View className="bg-[#303030] border border-gray-700 rounded-2xl p-4">
                        <Text className="text-lg font-bold text-white mb-3">Associated Items</Text>
                        {associatedItems.length === 0 ? (
                            <View className="py-10 items-center">
                                <Text className="text-gray-400">No inventory items linked to this vendor yet.</Text>
                            </View>
                        ) : (
                            associatedItems.map((item) => {
                                const isLowStock = item.stockQuantity <= item.reorderThreshold;
                                return (
                                    <View
                                        key={item.id}
                                        className="border-t border-gray-700 py-3 first:border-t-0"
                                    >
                                        <View className="flex-row justify-between items-center">
                                            <View className="flex-1 pr-3">
                                                <View className="flex-row items-center gap-2">
                                                    <Text className="text-white font-semibold">{item.name}</Text>
                                                    <View className={`px-2 py-0.5 rounded-full ${isLowStock ? "bg-red-600 text-red-100" : "bg-green-600 text-green-100"}`}>
                                                        <Text className="text-[10px] font-bold">{isLowStock ? "Low Stock" : "In Stock"}</Text>
                                                    </View>
                                                </View>
                                                <Text className="text-gray-400 mt-1">
                                                    {item.category} • {item.stockQuantity} {item.unit} • Reorder at {item.reorderThreshold}
                                                </Text>
                                            </View>
                                            <View className="items-end">
                                                <Text className="text-white font-semibold">${item.cost.toFixed(2)}</Text>
                                                <Text className="text-gray-400 text-xs mt-1">per {item.unit}</Text>
                                            </View>
                                        </View>
                                    </View>
                                );
                            })
                        )}
                    </View>
                )}
            </ScrollView>
        </View>
    );
};

export default VendorDetailsScreen;