import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ExternalExpenseLineItem } from "@/lib/types";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import BottomSheet, { BottomSheetFlatList, BottomSheetView } from "@gorhom/bottom-sheet";
import { useRouter } from "expo-router";
import { ChevronDown, Plus, Search, Trash2, User } from "lucide-react-native";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Alert, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { FlatList, TextInput } from "react-native-gesture-handler";
import { useSafeAreaInsets } from "react-native-safe-area-context";
const CreateExternalExpenseScreen = () => {
    const router = useRouter();
    const { inventoryItems, addExternalExpense, purchaseOrders, addInventoryItem } = useInventoryStore();
    const { activeEmployeeId, employees, loadMockEmployees } = useEmployeeStore();

    // Main expense state
    const [selectedEmployeeId, setSelectedEmployeeId] = useState<string | null>(activeEmployeeId);
    const [expenseItems, setExpenseItems] = useState<ExternalExpenseLineItem[]>([]);
    const [expenseNotes, setExpenseNotes] = useState("");
    const [selectedPOId, setSelectedPOId] = useState<string | null>(null);
    const [storeName, setStoreName] = useState("");
    const [storeLocation, setStoreLocation] = useState("");

    // Bottom sheet refs
    const itemsSheetRef = useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ["50%", "85%"], []);

    // Item selection state
    const [selectedInventoryItemId, setSelectedInventoryItemId] = useState<string | null>(null);
    const [selectedQuantity, setSelectedQuantity] = useState<string>("1");
    const [selectedUnitPrice, setSelectedUnitPrice] = useState<string>("");
    const [itemNotes, setItemNotes] = useState("");
    const [itemSearch, setItemSearch] = useState("");
    const filteredInventoryItems = useMemo(() => {
        const q = itemSearch.trim().toLowerCase();
        if (!q) return inventoryItems;
        return inventoryItems.filter((i) =>
            i.name.toLowerCase().includes(q) ||
            (i.unit ?? "").toString().toLowerCase().includes(q)
        );
    }, [inventoryItems, itemSearch]);

    // New item modal state
    const [newItemModalOpen, setNewItemModalOpen] = useState(false);
    const [newItemName, setNewItemName] = useState("");
    const [newItemUnit, setNewItemUnit] = useState("pcs");
    const [newItemCost, setNewItemCost] = useState("");
    const [newItemStock, setNewItemStock] = useState("");
    const [newItemReorder, setNewItemReorder] = useState("");
    const [newItemPOQty, setNewItemPOQty] = useState("1");

    // Load employees on component mount
    useEffect(() => {
        loadMockEmployees();
    }, [loadMockEmployees]);

    // Update selected employee when activeEmployeeId changes
    useEffect(() => {
        if (activeEmployeeId && !selectedEmployeeId) {
            setSelectedEmployeeId(activeEmployeeId);
        }
    }, [activeEmployeeId, selectedEmployeeId]);

    const addSelectedItemToExpense = () => {
        if (!selectedInventoryItemId || !selectedQuantity || !selectedUnitPrice) {
            Alert.alert("Missing Information", "Please select an item, enter quantity, and unit price.");
            return;
        }

        const quantity = parseFloat(selectedQuantity);
        const unitPrice = parseFloat(selectedUnitPrice);

        if (isNaN(quantity) || quantity <= 0 || isNaN(unitPrice) || unitPrice <= 0) {
            Alert.alert("Invalid Values", "Please enter valid quantity and unit price greater than 0.");
            return;
        }

        const selectedItem = inventoryItems.find(item => item.id === selectedInventoryItemId);
        if (!selectedItem) {
            Alert.alert("Error", "Selected item not found.");
            return;
        }

        const newItem: ExternalExpenseLineItem = {
            inventoryItemId: selectedInventoryItemId,
            itemName: selectedItem.name,
            quantity: quantity,
            unitPrice: unitPrice,
            totalAmount: quantity * unitPrice,
            notes: itemNotes.trim() || undefined,
        };

        setExpenseItems(prev => [...prev, newItem]);

        // Reset and close sheet
        setSelectedInventoryItemId(null);
        setSelectedQuantity("1");
        setSelectedUnitPrice("");
        setItemNotes("");
        itemsSheetRef.current?.close();

        toast.success(`Item added to expense`, {
            duration: 2000,
            position: ToastPosition.BOTTOM,
        });
    };

    const handleCreateNewItem = () => {
        if (!newItemName.trim()) {
            Alert.alert("Please enter item name");
            return;
        }
        const costNum = Number(newItemCost || 0);
        const stockNum = Math.max(0, Number(newItemStock || 0));
        const reorderNum = Math.max(0, Number(newItemReorder || 0));
        const poQty = Math.max(1, Number(newItemPOQty || 1));

        // Create inventory item (no vendor required for external expenses)
        addInventoryItem({
            name: newItemName.trim(),
            category: "Uncategorized",
            stockQuantity: stockNum,
            unit: newItemUnit as any,
            reorderThreshold: reorderNum,
            cost: costNum,
            vendorId: "", // No vendor for external expenses
            stockTrackingMode: "quantity",
        });

        // Retrieve the newly added item (latest by id timestamp)
        const created = useInventoryStore.getState().inventoryItems[0];
        if (created) {
            const newItem: ExternalExpenseLineItem = {
                inventoryItemId: created.id,
                itemName: created.name,
                quantity: poQty,
                unitPrice: costNum,
                totalAmount: poQty * costNum,
                notes: itemNotes.trim() || undefined,
            };
            setExpenseItems(prev => [...prev, newItem]);
        }

        // Reset and close
        setNewItemName("");
        setNewItemUnit("pcs");
        setNewItemCost("");
        setNewItemStock("");
        setNewItemReorder("");
        setNewItemPOQty("1");
        setNewItemModalOpen(false);
        itemsSheetRef.current?.close();

        toast.success(`New item created and added to expense`, {
            duration: 2000,
            position: ToastPosition.BOTTOM,
        });
    };

    const handleRemoveItemFromExpense = (index: number) => {
        setExpenseItems(prev => prev.filter((_, i) => i !== index));
    };

    const handleCreateExpense = () => {
        if (expenseItems.length === 0) {
            Alert.alert("No Items", "Please add at least one item to the expense.");
            return;
        }

        if (!selectedEmployeeId) {
            Alert.alert("Missing Information", "Please select an employee.");
            return;
        }

        const selectedEmployee = employees.find(emp => emp.id === selectedEmployeeId);
        if (!selectedEmployee) {
            Alert.alert("Error", "Selected employee not found.");
            return;
        }

        const totalAmount = expenseItems.reduce((sum, item) => sum + item.totalAmount, 0);
        const relatedPO = selectedPOId ? purchaseOrders.find(po => po.id === selectedPOId) : null;

        addExternalExpense({
            totalAmount: totalAmount,
            purchasedByEmployeeId: selectedEmployeeId,
            purchasedByEmployeeName: selectedEmployee.fullName,
            purchasedAt: new Date().toISOString(),
            items: expenseItems,
            notes: expenseNotes.trim() || undefined,
            relatedPOId: selectedPOId || undefined,
            relatedPONumber: relatedPO?.poNumber || undefined,
            storeName: storeName.trim() || undefined,
            storeLocation: storeLocation.trim() || undefined,
        });

        toast.success(`External expense created with ${expenseItems.length} items`, {
            duration: 3000,
            position: ToastPosition.BOTTOM,
        });

        router.back();
    };

    const insets = useSafeAreaInsets();
    const contentInsets = {
        top: insets.top,
        bottom: insets.bottom,
        left: 12,
        right: 12,
    };

    console.log(filteredInventoryItems.length);
    return (
        <View className="flex-1">
            <View className="flex-row justify-between items-center mb-6">
                <Text className="text-3xl font-bold text-white">Create External Expense</Text>
                <View className="flex-row gap-3">
                    <TouchableOpacity onPress={() => router.back()} className="py-4 px-6 bg-gray-700 rounded-lg">
                        <Text className="text-2xl font-bold text-white">Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={handleCreateExpense} className="py-4 px-6 bg-blue-600 rounded-lg">
                        <Text className="text-2xl font-bold text-white">Create Expense</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView className="flex-1">
                {/* Employee Selection */}
                <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 mb-6">
                    <Text className="text-xl font-medium text-gray-300 mb-2">Purchased By</Text>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <TouchableOpacity className="h-fit border border-gray-600 border-dashed rounded-lg p-4 flex-row items-center justify-between">
                                <View className="flex-row items-center">
                                    <User color="#9CA3AF" size={20} className="mr-2" />
                                    <Text className="text-2xl text-white">
                                        {selectedEmployeeId
                                            ? employees.find((e) => e.id === selectedEmployeeId)?.fullName
                                            : "Select an employee..."}
                                    </Text>
                                </View>
                                <ChevronDown color="#9CA3AF" size={20} />
                            </TouchableOpacity>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-80 bg-[#303030] border-gray-600">
                            {employees.map((employee) => (
                                <DropdownMenuItem
                                    key={employee.id}
                                    onPress={() => setSelectedEmployeeId(employee.id)}
                                    className="flex-row items-center p-3"
                                >
                                    <View className="flex-row items-center flex-1">
                                        <View className="w-8 h-8 bg-blue-600 rounded-full items-center justify-center mr-3">
                                            <Text className="text-white text-sm font-semibold">
                                                {employee.fullName.split(' ').map(n => n[0]).join('').toUpperCase()}
                                            </Text>
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-white text-lg font-medium">
                                                {employee.fullName}
                                            </Text>
                                            <Text className="text-gray-400 text-sm">
                                                {employee.shiftStatus === 'clocked_in' ? 'Currently Clocked In' : 'Clocked Out'}
                                            </Text>
                                        </View>
                                        {selectedEmployeeId === employee.id && (
                                            <View className="w-2 h-2 bg-blue-600 rounded-full" />
                                        )}
                                    </View>
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </View>

                {/* Items List */}
                <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 mb-6">
                    <Text className="text-2xl font-semibold text-white mb-2">Items</Text>
                    <FlatList
                        data={expenseItems}
                        keyExtractor={(item, index) => `${item.inventoryItemId}-${index}`}
                        renderItem={({ item, index }) => (
                            <View className="flex-row items-center justify-between p-4 border-b border-gray-600">
                                <View className="flex-1">
                                    <Text className="text-2xl text-white">
                                        {item.itemName}
                                    </Text>
                                    <Text className="text-xl text-gray-300">
                                        {item.quantity} × ${item.unitPrice.toFixed(2)} = ${item.totalAmount.toFixed(2)}
                                    </Text>
                                    {item.notes && (
                                        <Text className="text-lg text-gray-400">
                                            {item.notes}
                                        </Text>
                                    )}
                                </View>
                                <TouchableOpacity
                                    onPress={() => handleRemoveItemFromExpense(index)}
                                >
                                    <Trash2 color="#EF4444" size={24} />
                                </TouchableOpacity>
                            </View>
                        )}
                        ListEmptyComponent={
                            <Text className="text-xl text-gray-400 text-center py-6">
                                No items added yet.
                            </Text>
                        }
                    />
                    <TouchableOpacity
                        onPress={() => itemsSheetRef.current?.expand()}
                        className="mt-4 py-3 border border-dashed rounded-lg items-center border-gray-500"
                    >
                        <Text className="text-xl font-semibold text-gray-300">
                            + Add Item
                        </Text>
                    </TouchableOpacity>
                </View>

                {/* Related PO Selection */}
                <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 mb-6">
                    <Text className="text-xl font-medium text-gray-300 mb-2">Related Purchase Order (Optional)</Text>
                    <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                            <TouchableOpacity className="h-fit border border-gray-600 border-dashed rounded-lg p-4 flex-row items-center justify-between">
                                <Text className="text-2xl text-white">
                                    {selectedPOId
                                        ? purchaseOrders.find(po => po.id === selectedPOId)?.poNumber
                                        : "Select a PO (optional)..."}
                                </Text>
                                <ChevronDown color="#9CA3AF" size={20} />
                            </TouchableOpacity>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent className="w-80 bg-[#303030] border-gray-600">
                            <DropdownMenuItem
                                onPress={() => setSelectedPOId(null)}
                                className="flex-row items-center p-3"
                            >
                                <Text className="text-white text-lg font-medium">No related PO</Text>
                                {!selectedPOId && (
                                    <View className="w-2 h-2 bg-blue-600 rounded-full ml-auto" />
                                )}
                            </DropdownMenuItem>
                            {purchaseOrders.map((po) => (
                                <DropdownMenuItem
                                    key={po.id}
                                    onPress={() => setSelectedPOId(po.id)}
                                    className="flex-row items-center p-3"
                                >
                                    <View className="flex-1">
                                        <Text className="text-white text-lg font-medium">
                                            {po.poNumber}
                                        </Text>
                                        <Text className="text-gray-400 text-sm">
                                            {po.status} • ${po.items.reduce((sum, item) => sum + item.cost * item.quantity, 0).toFixed(2)}
                                        </Text>
                                    </View>
                                    {selectedPOId === po.id && (
                                        <View className="w-2 h-2 bg-blue-600 rounded-full" />
                                    )}
                                </DropdownMenuItem>
                            ))}
                        </DropdownMenuContent>
                    </DropdownMenu>
                </View>

                {/* Store Information */}
                <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 mb-6">
                    <Text className="text-xl font-medium text-gray-300 mb-4">Store Information (Optional)</Text>
                    <View className="gap-4">
                        <View>
                            <Text className="text-white text-lg mb-2">Store Name</Text>
                            <TextInput
                                value={storeName}
                                onChangeText={setStoreName}
                                placeholder="e.g., Fresh Market"
                                placeholderTextColor="#9CA3AF"
                                className="text-white text-lg bg-[#212121] border border-gray-700 rounded-lg px-3 py-2 h-12"
                            />
                        </View>
                        <View>
                            <Text className="text-white text-lg mb-2">Location</Text>
                            <TextInput
                                value={storeLocation}
                                onChangeText={setStoreLocation}
                                placeholder="e.g., 123 Main St"
                                placeholderTextColor="#9CA3AF"
                                className="text-white text-lg bg-[#212121] border border-gray-700 rounded-lg px-3 py-2 h-12"
                            />
                        </View>
                    </View>
                </View>

                {/* Notes */}
                <View className="bg-[#303030] border border-gray-700 rounded-xl p-6 mb-6">
                    <Text className="text-xl font-medium text-gray-300 mb-2">Expense Notes (Optional)</Text>
                    <TextInput
                        value={expenseNotes}
                        onChangeText={setExpenseNotes}
                        placeholder="e.g., Purchased from grocery store due to vendor delay"
                        placeholderTextColor="#9CA3AF"
                        multiline
                        className="text-white text-lg bg-[#212121] border border-gray-700 rounded-lg px-3 py-2 min-h-[100px]"
                    />
                </View>
            </ScrollView>

            {/* Bottom sheet for selecting items */}
            <BottomSheet
                ref={itemsSheetRef}
                index={-1}
                snapPoints={snapPoints}
                enablePanDownToClose
                backgroundStyle={{ backgroundColor: "#2b2b2b" }}
                handleIndicatorStyle={{ backgroundColor: "#666" }}
            >
                <View className="px-4 border-b border-gray-700 flex-row items-center justify-between">
                    <Text className="text-white text-xl font-bold">Select Item</Text>
                    <View className="mb-3 w-1/2 flex-row items-center gap-2 bg-[#2a2a2a] border border-gray-700 rounded-lg px-3 py-2">
                        <Search color="#9CA3AF" size={18} />
                        <TextInput
                            value={itemSearch}
                            onChangeText={setItemSearch}
                            placeholder="Search items..."
                            placeholderTextColor="#9CA3AF"
                            className=" text-white h-12 w-full"
                        />
                    </View>
                    <Button
                        onPress={() => setNewItemModalOpen(true)}
                        className="bg-blue-600 border flex-row items-center gap-2 border-blue-500"
                    >
                        <Plus color="#fff" size={24} />
                        <Text className="text-white">Add New Item</Text>
                    </Button>
                </View>

                <View className="px-4">
                    {inventoryItems.length === 0 ? (
                        <Text className="text-gray-400">No inventory items found.</Text>
                    ) : (
                        <>
                            {/* Item details form appears when an item is picked */}
                            {selectedInventoryItemId && (
                                <View className="mb-4 p-3 rounded-lg border border-gray-700 bg-[#8f8f8f]">
                                    <Text className="text-white mb-2 text-xl font-semibold">
                                        Enter Details - {inventoryItems.find((i) => i.id === selectedInventoryItemId)?.name}
                                    </Text>

                                    <View className="flex-row gap-3 mb-3">
                                        <View className="flex-1">
                                            <Text className="text-white text-sm mb-1">Quantity</Text>
                                            <TextInput
                                                keyboardType="number-pad"
                                                value={selectedQuantity}
                                                onChangeText={setSelectedQuantity}
                                                placeholder="1"
                                                placeholderTextColor="#9CA3AF"
                                                className="text-white text-lg bg-[#2a2a2a] border border-gray-700 rounded-lg px-3 py-2 h-12"
                                            />
                                        </View>
                                        <View className="flex-1">
                                            <Text className="text-white text-sm mb-1">Unit Price</Text>
                                            <TextInput
                                                keyboardType="decimal-pad"
                                                value={selectedUnitPrice}
                                                onChangeText={setSelectedUnitPrice}
                                                placeholder="0.00"
                                                placeholderTextColor="#9CA3AF"
                                                className="text-white text-lg bg-[#2a2a2a] border border-gray-700 rounded-lg px-3 py-2 h-12"
                                            />
                                        </View>
                                    </View>

                                    <View className="mb-3">
                                        <Text className="text-white text-sm mb-1">Item Notes (Optional)</Text>
                                        <TextInput
                                            value={itemNotes}
                                            onChangeText={setItemNotes}
                                            placeholder="e.g., Organic, Large size"
                                            placeholderTextColor="#9CA3AF"
                                            className="text-white text-lg bg-[#2a2a2a] border border-gray-700 rounded-lg px-3 py-2 h-12"
                                        />
                                    </View>

                                    <Button onPress={addSelectedItemToExpense} className="bg-blue-600 border border-blue-500">
                                        <Text className="text-white">Add to Expense</Text>
                                    </Button>
                                </View>
                            )}
                            <BottomSheetFlatList
                                data={filteredInventoryItems}
                                keyExtractor={(i: any) => i.id}
                                contentContainerStyle={{ paddingBottom: 70 }}
                                renderItem={({ item, index }: { item: any, index: number }) => (
                                    <TouchableOpacity
                                        onPress={() => {
                                            setSelectedInventoryItemId(item.id);
                                            setSelectedUnitPrice(item.cost.toString());
                                        }}
                                        className="p-4 border-b border-gray-700"
                                    >
                                        <View className="flex-row justify-between items-center">
                                            <View className="flex-1 pr-3">
                                                <Text className="text-white text-lg font-semibold">{index + 1}. {item.name}</Text>
                                                <Text className="text-gray-400 text-sm">Unit: {item.unit} • Cost: ${item.cost.toFixed(2)}</Text>
                                            </View>
                                            <Text className="text-gray-300">Stock: {item.stockQuantity}</Text>
                                        </View>
                                    </TouchableOpacity>
                                )}
                                ListEmptyComponent={
                                    <Text className="text-gray-400 px-4 py-6">No items match your search.</Text>
                                }
                            />
                        </>
                    )}
                </View>
            </BottomSheet>

            {/* Create New Inventory Item Modal */}
            <Dialog open={newItemModalOpen} onOpenChange={setNewItemModalOpen}>
                <DialogContent className="">
                    <ScrollView bounces={false} className="rounded-2xl h-fit p-6 w-[600px]" style={{ backgroundColor: "#2b2b2b", borderWidth: 1, borderColor: "#4b5563" }}>
                        <Text className="text-white text-2xl font-bold mb-4">Add Inventory Item</Text>
                        <View className="gap-y-3">
                            <Text className="text-gray-300">Item Name</Text>
                            <TextInput value={newItemName} onChangeText={setNewItemName} placeholder="e.g., Tomatoes" placeholderTextColor="#9CA3AF" className="text-white text-lg bg-[#303030] border border-gray-700 rounded-lg px-3 py-2" />

                            <Text className="text-gray-300 mt-3">Unit</Text>
                            <TextInput value={newItemUnit} onChangeText={setNewItemUnit} placeholder="e.g., kg, pcs" placeholderTextColor="#9CA3AF" className="text-white text-lg bg-[#303030] border border-gray-700 rounded-lg px-3 py-2" />

                            <Text className="text-gray-300 mt-3">Cost per Unit</Text>
                            <TextInput keyboardType="decimal-pad" value={newItemCost} onChangeText={setNewItemCost} placeholder="e.g., 2.50" placeholderTextColor="#9CA3AF" className="text-white text-lg bg-[#303030] border border-gray-700 rounded-lg px-3 py-2" />

                            <Text className="text-gray-300 mt-3">Stock Quantity</Text>
                            <TextInput keyboardType="number-pad" value={newItemStock} onChangeText={setNewItemStock} placeholder="e.g., 100" placeholderTextColor="#9CA3AF" className="text-white text-lg bg-[#303030] border border-gray-700 rounded-lg px-3 py-2" />

                            <Text className="text-gray-300 mt-3">Reorder Threshold</Text>
                            <TextInput keyboardType="number-pad" value={newItemReorder} onChangeText={setNewItemReorder} placeholder="e.g., 20" placeholderTextColor="#9CA3AF" className="text-white text-lg bg-[#303030] border border-gray-700 rounded-lg px-3 py-2" />

                            <Text className="text-gray-300 mt-3">Quantity for this Expense</Text>
                            <TextInput keyboardType="number-pad" value={newItemPOQty} onChangeText={setNewItemPOQty} placeholder="e.g., 10" placeholderTextColor="#9CA3AF" className="text-white text-lg bg-[#303030] border border-gray-700 rounded-lg px-3 py-2" />

                            <View className="flex-row gap-3 mt-4">
                                <TouchableOpacity onPress={() => setNewItemModalOpen(false)} className="flex-1 py-3 rounded-lg border border-gray-600 items-center">
                                    <Text className="text-gray-300 text-lg">Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={handleCreateNewItem} className="flex-1 py-3 rounded-lg bg-blue-600 border border-blue-500 items-center">
                                    <Text className="text-white text-lg font-semibold">Add Item</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </ScrollView>
                </DialogContent>
            </Dialog>
        </View>
    );
};

export default CreateExternalExpenseScreen;
