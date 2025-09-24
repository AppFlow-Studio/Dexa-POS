import { DateRangePicker } from "@/components/ui/DateRangePicker";
import { useInventoryStore } from "@/stores/useInventoryStore";
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList, BottomSheetTextInput } from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Link, useLocalSearchParams } from "expo-router";
import { Plus, Search } from "lucide-react-native";
import React, { useMemo, useRef, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

const StatCard = ({ label, value }: { label: string; value: string | number }) => (
    <View className="flex-1 bg-[#303030] border border-gray-700 rounded-2xl p-4 mr-3">
        <Text className="text-lg font-semibold text-gray-400">{label}</Text>
        <Text className="text-2xl font-bold text-white mt-1">{value}</Text>
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
        const received = vendorPOs.filter((po) => po.status === "Awaiting Payment").length;
        const inDraft = vendorPOs.filter((po) => po.status === "Draft").length;
        const sent = vendorPOs.filter((po) => po.status === "Pending Delivery").length;
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

    // Bottom sheet refs and search states
    const poSearchRef = useRef<BottomSheetMethods>(null);
    const itemSearchRef = useRef<BottomSheetMethods>(null);
    const [poSearchText, setPoSearchText] = useState("");
    const [itemSearchText, setItemSearchText] = useState("");
    const [poStartDate, setPoStartDate] = useState("");
    const [poEndDate, setPoEndDate] = useState("");
    const snapPoints = useMemo(() => ["70%", "95%"], []);

    const filteredPOs = useMemo(() => {
        const q = poSearchText.trim().toLowerCase();
        const sd = poStartDate ? new Date(poStartDate + "T00:00:00") : null;
        const ed = poEndDate ? new Date(poEndDate + "T23:59:59") : null;
        return vendorPOs.filter((po) => {
            const inDates = (!sd || new Date(po.createdAt) >= sd) && (!ed || new Date(po.createdAt) <= ed);
            if (!q) return inDates;
            const poNum = po.poNumber?.toLowerCase() || "";
            const status = po.status?.toLowerCase() || "";
            const created = new Date(po.createdAt).toLocaleString().toLowerCase();
            const emp = `${po.createdByEmployeeName || ""}`.toLowerCase();
            return inDates && (poNum.includes(q) || status.includes(q) || created.includes(q) || emp.includes(q));
        });
    }, [poSearchText, vendorPOs, poStartDate, poEndDate]);

    const filteredItems = useMemo(() => {
        const q = itemSearchText.trim().toLowerCase();
        if (!q) return associatedItems;
        return associatedItems.filter((it) => {
            const name = it.name?.toLowerCase() || "";
            const category = it.category?.toLowerCase() || "";
            return name.includes(q) || category.includes(q);
        });
    }, [itemSearchText, associatedItems]);

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
        <>
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
                        <StatCard label="Ordered" value={stats.sent} />
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
                                <View className="flex-row gap-2 items-center justify-center">
                                    <TouchableOpacity className="border border-gray-700 rounded-lg p-2" onPress={() => poSearchRef.current?.snapToIndex?.(1)}>
                                        <Search className="bg-gray-700" size={24} color={'#9CA3AF'} />
                                    </TouchableOpacity>
                                    <TouchableOpacity className="flex-row items-center gap-2 justify-center w-fit bg-blue-500 rounded-lg px-4 py-2">
                                        <Plus className="text-white bg-white" size={24} color={'white'} />
                                        <Text className="text-white">Create Purchase</Text>
                                    </TouchableOpacity>
                                </View>
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
                                        po.status === "Awaiting Payment"
                                            ? "bg-green-600 text-green-100"
                                            : po.status === "Pending Delivery"
                                                ? "bg-blue-600"
                                                : "bg-yellow-600";
                                    return (
                                        <Link
                                            key={po.id}
                                            href={`/inventory/purchase-orders/${po.id}`}
                                            className="border border-gray-700 py-3 rounded-lg my-2"
                                        >
                                            <View className="flex-row justify-between items-center p-2">
                                                <View className="flex-1 pr-3">
                                                    <View className="flex-row items-center gap-2">
                                                        <Text className="text-white text-2xl font-semibold">{po.poNumber}</Text>
                                                        <View className={`px-2 py-0.5 rounded-full ${statusColor}`}>
                                                            <Text className="text-[10px] font-bold text-xl text-white">{po.status}</Text>
                                                        </View>
                                                    </View>
                                                    <Text className="text-gray-400 mt-1 text-lg">
                                                        Created {new Date(po.createdAt).toLocaleString()}
                                                        {po?.deliveryLoggedAt ? ` • Received ${new Date(po.deliveryLoggedAt).toLocaleString()}` : ""}
                                                    </Text>
                                                </View>
                                                <View className="items-end">
                                                    <Text className="text-white font-semibold text-2xl">${amount.toFixed(2)}</Text>
                                                    <Text className="text-gray-400 text-lg mt-1">{itemsCount} lines • {qty} qty</Text>
                                                </View>
                                            </View>
                                        </Link>
                                    );
                                })
                            )}
                        </View>
                    )}

                    {activeTab === 'associated-items' && (
                        <View className="bg-[#303030] border border-gray-700 rounded-2xl p-4">
                            <View className="flex-row justify-between items-center">
                                <Text className="text-lg font-bold text-white mb-3">Associated Items</Text>
                                <View className="flex-row gap-2 items-center justify-center">
                                    <TouchableOpacity className="border border-gray-700 rounded-lg p-2" onPress={() => itemSearchRef.current?.snapToIndex?.(0)}>
                                        <Search className="bg-gray-700" size={24} color={'#9CA3AF'} />
                                    </TouchableOpacity>
                                </View>
                            </View>
                            {associatedItems.length === 0 ? (
                                <View className="py-10 items-center">
                                    <Text className="text-gray-400">No inventory items linked to this vendor yet.</Text>
                                </View>
                            ) : (
                                associatedItems.map((item) => {
                                    const isLowStock = item.stockQuantity <= item.reorderThreshold;
                                    return (
                                        <Link
                                            key={item.id}
                                            href={`/inventory/ingredient-items/${item.id}`}
                                            className="border border-gray-700 py-3 rounded-lg my-1"
                                        >
                                            <View className="flex-row justify-between items-center px-4">
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
                                        </Link>
                                    );
                                })
                            )}
                        </View>
                    )}
                </ScrollView>
            </View>
            {/* Purchase Orders Search Bottom Sheet */}
            <BottomSheet
                ref={poSearchRef as any}
                index={-1}
                snapPoints={snapPoints}
                enablePanDownToClose
                backgroundStyle={{ backgroundColor: "#303030" }}
                handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
                backdropComponent={(props) => (
                    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.7} />
                )}
            >
                <View className="flex-row items-center rounded-2xl px-6">
                    <View className="flex-row items-center flex-1 border rounded-lg p-2 border-gray-700">
                        <Search color="#6b7280" size={24} />
                        <BottomSheetTextInput
                            value={poSearchText}
                            onChangeText={setPoSearchText}
                            placeholder="Search Purchase Orders"
                            className="flex-1 py-4 ml-3 text-2xl text-gray-900"
                            placeholderTextColor="#6b7280"
                        />
                    </View>
                    <TouchableOpacity onPress={() => { setPoSearchText(""); poSearchRef.current?.close(); }} className="flex-row items-center ml-4 p-2">
                        <Text className="ml-1.5 text-xl font-semibold text-gray-400">Cancel</Text>
                    </TouchableOpacity>
                </View>
                <View className="px-6 py-3">
                    <Text className="text-white mb-2">Date Range</Text>
                    <DateRangePicker
                        startDate={poStartDate}
                        endDate={poEndDate}
                        onDateRangeChange={(start, end) => {
                            setPoStartDate(start);
                            setPoEndDate(end);
                        }}
                        placeholder="Select date range for POs"
                    />
                </View>

                <BottomSheetFlatList
                    data={filteredPOs}
                    keyExtractor={(po) => po.id}
                    renderItem={({ item: po }) => (
                        <Link href={`/inventory/purchase-orders/${po.id}`} className="px-6 py-4 border-b border-gray-700">
                            <View className="flex-row justify-between items-center">
                                <View className="flex-1 pr-3">
                                    <Text className="text-white text-xl font-semibold">{po.poNumber}</Text>
                                    <Text className="text-gray-300 mt-1">{po.status} • {new Date(po.createdAt).toLocaleString()}</Text>
                                    {po.createdByEmployeeName ? (
                                        <Text className="text-gray-400 mt-1">Employee: {po.createdByEmployeeName}</Text>
                                    ) : null}
                                </View>
                                <Text className="text-white font-semibold">
                                    ${po.items.reduce((a, li) => a + li.quantity * li.cost, 0).toFixed(2)}
                                </Text>
                            </View>
                        </Link>
                    )}
                    ListEmptyComponent={
                        <View className="items-center justify-center h-48">
                            <Text className="text-2xl text-gray-400">No purchase orders found</Text>
                        </View>
                    }
                />
            </BottomSheet>

            {/* Associated Items Search Bottom Sheet */}
            <BottomSheet
                ref={itemSearchRef as any}
                index={-1}
                snapPoints={snapPoints}
                enablePanDownToClose
                backgroundStyle={{ backgroundColor: "#303030" }}
                handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
                backdropComponent={(props) => (
                    <BottomSheetBackdrop {...props} appearsOnIndex={0} disappearsOnIndex={-1} opacity={0.7} />
                )}
            >
                <View className="flex-row items-center  rounded-2xl px-6">
                    <View className="flex-row items-center flex-1 border rounded-lg p-2 border-gray-700">
                        <Search color="#6b7280" size={24} />
                        <BottomSheetTextInput
                            value={itemSearchText}
                            onChangeText={setItemSearchText}
                            placeholder="Search Associated Items"
                            className="flex-1 py-4 ml-3 text-2xl text-gray-900"
                            placeholderTextColor="#6b7280"
                        />
                    </View>
                    <TouchableOpacity onPress={() => { setItemSearchText(""); itemSearchRef.current?.close(); }} className="flex-row items-center ml-4 p-2">
                        <Text className="ml-1.5 text-xl font-semibold text-gray-400">Cancel</Text>
                    </TouchableOpacity>
                </View>
                <BottomSheetFlatList
                    data={filteredItems}
                    keyExtractor={(it) => it.id}
                    renderItem={({ item: it }) => (
                        <Link href={`/inventory/ingredient-items/${it.id}`} className="px-6 py-4 border-b border-gray-700">
                            <View className="flex-row justify-between items-center">
                                <View className="flex-1 pr-3">
                                    <Text className="text-white text-xl font-semibold">{it.name}</Text>
                                    <Text className="text-gray-300 mt-1">{it.category} • {it.stockQuantity} {it.unit}</Text>
                                </View>
                                <Text className="text-white font-semibold">${it.cost.toFixed(2)}</Text>
                            </View>
                        </Link>
                    )}
                    ListEmptyComponent={
                        <View className="items-center justify-center h-48">
                            <Text className="text-2xl text-gray-400">No items found</Text>
                        </View>
                    }
                    enableFooterMarginAdjustment={true}
                />
            </BottomSheet>
        </>
    );
};

export default VendorDetailsScreen;