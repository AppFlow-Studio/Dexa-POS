import { MenuItemType } from "@/lib/types";
import { useInventoryStore } from "@/stores/useInventoryStore";
import { useMenuStore } from "@/stores/useMenuStore";
import BottomSheet, { BottomSheetBackdrop, BottomSheetFlatList } from "@gorhom/bottom-sheet";
import { useLocalSearchParams, useRouter } from "expo-router";
import {
    AlertTriangle,
    ArrowLeft,
    CheckCircle,
    Edit,
    History,
    Minus,
    Plus,
    Save,
    X
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
    Modal,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

interface InventoryTransaction {
    id: string;
    itemId: string;
    type: "PO_RECEIPT" | "SALES_CONSUMPTION" | "SPOILAGE_WASTE" | "INTERNAL_TRANSFER" | "COUNT_CORRECTION";
    quantityChange: number;
    resultingQuantity: number;
    reason: string;
    notes?: string;
    timestamp: string;
    userId: string;
    reference?: string;
}

const MenuItemScreen = () => {
    const { itemId } = useLocalSearchParams();
    const router = useRouter();
    const { menuItems, updateMenuItem } = useMenuStore();
    const { vendors, inventoryItems } = useInventoryStore();

    const [item, setItem] = useState<MenuItemType | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [isLogUsageModalOpen, setIsLogUsageModalOpen] = useState(false);
    const [inventoryHistory, setInventoryHistory] = useState<InventoryTransaction[]>([]);
    const [isEditingRecipe, setIsEditingRecipe] = useState(false);

    // Bottom sheet refs
    const historySheetRef = React.useRef<BottomSheet>(null);
    const snapPoints = useMemo(() => ["90%"], []);

    // Edit form state
    const [editForm, setEditForm] = useState({
        name: "",
        sku: "",
        category: "",
        defaultVendor: "",
        unitOfMeasure: "",
        stockQuantity: "",
        reorderThreshold: "",
        price: ""
    });

    // Log usage form state
    const [logUsageForm, setLogUsageForm] = useState({
        quantityUsed: "",
        reason: "",
        notes: ""
    });

    // Recipe editing state
    const [recipeForm, setRecipeForm] = useState<{ inventoryItemId: string; quantity: string }[]>([]);
    const [stockTrackingMode, setStockTrackingMode] = useState<"in_stock" | "out_of_stock" | "quantity">("quantity");

    useEffect(() => {
        if (itemId) {
            const foundItem = menuItems.find(m => m.id === itemId);
            if (foundItem) {
                setItem(foundItem);
                setEditForm({
                    name: foundItem.name,
                    sku: "",
                    category: Array.isArray(foundItem.category) ? foundItem.category.join(", ") : foundItem.category || "",
                    defaultVendor: "",
                    unitOfMeasure: "",
                    stockQuantity: foundItem.stockQuantity?.toString() || "",
                    reorderThreshold: foundItem.reorderThreshold?.toString() || "",
                    price: foundItem.price.toString()
                });

                // Initialize recipe form
                if (foundItem.recipe && foundItem.recipe.length > 0) {
                    setRecipeForm(foundItem.recipe.map(recipeItem => ({
                        inventoryItemId: recipeItem.inventoryItemId,
                        quantity: recipeItem.quantity.toString()
                    })));
                } else {
                    setRecipeForm([]);
                }

                // Initialize stock tracking mode based on current stock settings
                if (foundItem.stockQuantity !== undefined && foundItem.stockQuantity > 0) {
                    setStockTrackingMode("quantity");
                } else if (foundItem.availability === true) {
                    setStockTrackingMode("in_stock");
                } else {
                    setStockTrackingMode("out_of_stock");
                }

                generateMockHistory(foundItem.id);
            }
        }

    }, []);

    const generateMockHistory = (id: string) => {
        const mockHistory: InventoryTransaction[] = [
            {
                id: "1",
                itemId: id,
                type: "PO_RECEIPT",
                quantityChange: 50,
                resultingQuantity: 50,
                reason: "Initial stock from purchase order",
                timestamp: "2024-01-15T10:30:00Z",
                userId: "user1",
                reference: "PO-2024-001"
            },
            {
                id: "2",
                itemId: id,
                type: "SALES_CONSUMPTION",
                quantityChange: -5,
                resultingQuantity: 45,
                reason: "Sales consumption",
                notes: "Used in 5 orders",
                timestamp: "2024-01-16T14:20:00Z",
                userId: "user2"
            },
            {
                id: "3",
                itemId: id,
                type: "COUNT_CORRECTION",
                quantityChange: 2,
                resultingQuantity: 47,
                reason: "Count correction",
                notes: "Found 2 additional units during inventory count",
                timestamp: "2024-01-17T09:15:00Z",
                userId: "user1"
            }
        ];
        setInventoryHistory(mockHistory);
    };

    const handleSave = () => {
        if (!item) return;

        // Update stock tracking based on mode
        let updatedItem = {
            ...item,
            name: editForm.name,
            category: editForm.category ? editForm.category.split(",").map(c => c.trim()) : [],
            price: parseFloat(editForm.price)
        };

        if (stockTrackingMode === "in_stock") {
            updatedItem.availability = true;
            updatedItem.stockQuantity = undefined;
            updatedItem.reorderThreshold = undefined;
        } else if (stockTrackingMode === "out_of_stock") {
            updatedItem.availability = false;
            updatedItem.stockQuantity = undefined;
            updatedItem.reorderThreshold = undefined;
        } else if (stockTrackingMode === "quantity") {
            updatedItem.availability = undefined;
            updatedItem.stockQuantity = editForm.stockQuantity ? parseInt(editForm.stockQuantity) : undefined;
            updatedItem.reorderThreshold = editForm.reorderThreshold ? parseInt(editForm.reorderThreshold) : undefined;
        }

        // Save recipe if it exists
        if (recipeForm.length > 0) {
            const recipe = recipeForm
                .filter(recipeItem => recipeItem.inventoryItemId && recipeItem.quantity)
                .map(recipeItem => ({
                    inventoryItemId: recipeItem.inventoryItemId,
                    quantity: parseFloat(recipeItem.quantity) || 0
                }));
            updatedItem.recipe = recipe;
        }

        updateMenuItem(item.id, updatedItem);
        setItem(updatedItem);
        setIsEditing(false);
    };

    const handleLogUsage = () => {
        if (!item || !logUsageForm.quantityUsed || !logUsageForm.reason) return;

        const quantityChange = -parseInt(logUsageForm.quantityUsed);
        const newQuantity = (item.stockQuantity || 0) + quantityChange;

        const newTransaction: InventoryTransaction = {
            id: Date.now().toString(),
            itemId: item.id,
            type: logUsageForm.reason as any,
            quantityChange,
            resultingQuantity: newQuantity,
            reason: logUsageForm.reason,
            notes: logUsageForm.notes,
            timestamp: new Date().toISOString(),
            userId: "current_user"
        };

        updateMenuItem(item.id, { stockQuantity: newQuantity });
        setInventoryHistory(prev => [newTransaction, ...prev]);
        setLogUsageForm({ quantityUsed: "", reason: "", notes: "" });
        setIsLogUsageModalOpen(false);
        setItem(prev => prev ? { ...prev, stockQuantity: newQuantity } : null);
    };

    const getTransactionTypeLabel = (type: string) => {
        switch (type) {
            case "PO_RECEIPT": return "PO Receipt";
            case "SALES_CONSUMPTION": return "Sales/Consumption";
            case "SPOILAGE_WASTE": return "Spoilage/Waste";
            case "INTERNAL_TRANSFER": return "Internal Transfer";
            case "COUNT_CORRECTION": return "Count Correction";
            default: return type;
        }
    };

    const getTransactionTypeColor = (type: string) => {
        switch (type) {
            case "PO_RECEIPT": return "bg-green-600";
            case "SALES_CONSUMPTION": return "bg-blue-600";
            case "SPOILAGE_WASTE": return "bg-red-600";
            case "INTERNAL_TRANSFER": return "bg-yellow-600";
            case "COUNT_CORRECTION": return "bg-purple-600";
            default: return "bg-gray-600";
        }
    };

    const renderBackdrop = useMemo(
        () => (props: any) => (
            <BottomSheetBackdrop
                {...props}
                appearsOnIndex={0}
                disappearsOnIndex={-1}
                opacity={0.7}
            />
        ),
        []
    );

    // Recipe helper functions
    const getInventoryItemName = (inventoryItemId: string) => {
        const inventoryItem = inventoryItems.find(item => item.id === inventoryItemId);
        return inventoryItem ? inventoryItem.name : "Unknown Item";
    };

    const getInventoryItemUnit = (inventoryItemId: string) => {
        const inventoryItem = inventoryItems.find(item => item.id === inventoryItemId);
        return inventoryItem ? inventoryItem.unit : "units";
    };

    const addRecipeItem = () => {
        setRecipeForm(prev => [...prev, { inventoryItemId: "", quantity: "" }]);
    };

    const removeRecipeItem = (index: number) => {
        setRecipeForm(prev => prev.filter((_, i) => i !== index));
    };

    const updateRecipeItem = (index: number, field: "inventoryItemId" | "quantity", value: string) => {
        setRecipeForm(prev => prev.map((item, i) =>
            i === index ? { ...item, [field]: value } : item
        ));
    };

    const handleSaveRecipe = () => {
        if (!item) return;

        const recipe = recipeForm
            .filter(recipeItem => recipeItem.inventoryItemId && recipeItem.quantity)
            .map(recipeItem => ({
                inventoryItemId: recipeItem.inventoryItemId,
                quantity: parseFloat(recipeItem.quantity) || 0
            }));

        // Update stock tracking based on mode
        let updatedItem = { ...item };

        if (stockTrackingMode === "in_stock") {
            updatedItem.availability = true;
            updatedItem.stockQuantity = undefined;
            updatedItem.reorderThreshold = undefined;
        } else if (stockTrackingMode === "out_of_stock") {
            updatedItem.availability = false;
            updatedItem.stockQuantity = undefined;
            updatedItem.reorderThreshold = undefined;
        } else if (stockTrackingMode === "quantity") {
            updatedItem.availability = undefined;
            // Keep existing stockQuantity and reorderThreshold from editForm
        }

        updatedItem.recipe = recipe;
        updateMenuItem(item.id, updatedItem);
        setItem(updatedItem);
        setIsEditingRecipe(false);
    };

    if (!item) {
        return (
            <View className="flex-1 justify-center items-center bg-[#212121]">
                <Text className="text-white text-xl">Item not found</Text>
            </View>
        );
    }

    return (
        <View className="flex-1 bg-[#212121]">
            {/* Header */}
            <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
                <TouchableOpacity onPress={() => router.back()} className="flex-row items-center">
                    <ArrowLeft color="#9CA3AF" size={24} />
                    <Text className="text-white text-xl ml-2">Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => setIsEditing(!isEditing)}
                    className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
                >
                    {isEditing ? (
                        <>
                            <Save color="white" size={20} />
                            <Text className="text-white ml-2">Save</Text>
                        </>
                    ) : (
                        <>
                            <Edit color="white" size={20} />
                            <Text className="text-white ml-2">Edit</Text>
                        </>
                    )}
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 p-4">
                {/* Item Overview */}
                <View className="bg-[#303030] rounded-xl p-6 mb-4">
                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-2xl font-bold text-white">{item.name}</Text>
                        <View className="flex-row items-center">
                            {item.stockQuantity !== undefined && item.reorderThreshold !== undefined &&
                                item.stockQuantity <= item.reorderThreshold ? (
                                <AlertTriangle color="#F87171" size={24} />
                            ) : (
                                <CheckCircle color="#10B981" size={24} />
                            )}
                        </View>
                    </View>

                    <View className="flex-row justify-between mb-2">
                        <Text className="text-gray-300">Current Stock:</Text>
                        <Text className="text-white font-semibold">
                            {item.stockQuantity || 0} units
                        </Text>
                    </View>

                    <View className="flex-row justify-between mb-2">
                        <Text className="text-gray-300">Reorder Threshold:</Text>
                        <Text className="text-white font-semibold">
                            {item.reorderThreshold || "Not set"}
                        </Text>
                    </View>

                    <View className="flex-row justify-between mb-2">
                        <Text className="text-gray-300">Price:</Text>
                        <Text className="text-white font-semibold">${item.price.toFixed(2)}</Text>
                    </View>

                    <View className="flex-row justify-between">
                        <Text className="text-gray-300">Status:</Text>
                        <Text className={`font-semibold ${item.availability !== false ? "text-green-400" : "text-red-400"}`}>
                            {item.availability !== false ? "Available" : "Unavailable"}
                        </Text>
                    </View>
                </View>

                {/* Quick Actions */}
                <View className="bg-[#303030] rounded-xl p-6 mb-4">
                    <Text className="text-xl font-bold text-white mb-4">Quick Actions</Text>
                    <View className="flex-row gap-3">
                        <TouchableOpacity
                            onPress={() => setIsLogUsageModalOpen(true)}
                            className="flex-1 bg-blue-600 py-3 px-4 rounded-lg flex-row items-center justify-center"
                        >
                            <Minus color="white" size={20} />
                            <Text className="text-white ml-2 font-semibold">Log Usage</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => historySheetRef.current?.expand()}
                            className="flex-1 bg-gray-600 py-3 px-4 rounded-lg flex-row items-center justify-center"
                        >
                            <History color="white" size={20} />
                            <Text className="text-white ml-2 font-semibold">View History</Text>
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Item Details Form */}
                <View className="bg-[#303030] rounded-xl p-6">
                    <Text className="text-xl font-bold text-white mb-4">Item Details</Text>

                    <View className="mb-4">
                        <Text className="text-gray-300 mb-2">Item Name</Text>
                        <TextInput
                            value={editForm.name}
                            onChangeText={(text) => setEditForm(prev => ({ ...prev, name: text }))}
                            editable={isEditing}
                            className={`p-3 rounded-lg ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                            placeholder="Enter item name"
                            placeholderTextColor="#9CA3AF"
                        />
                    </View>

                    <View className="mb-4">
                        <Text className="text-gray-300 mb-2">SKU / Barcode</Text>
                        <TextInput
                            value={editForm.sku}
                            onChangeText={(text) => setEditForm(prev => ({ ...prev, sku: text }))}
                            editable={isEditing}
                            className={`p-3 rounded-lg ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                            placeholder="Enter SKU or barcode"
                            placeholderTextColor="#9CA3AF"
                        />
                    </View>

                    <View className="mb-4">
                        <Text className="text-gray-300 mb-2">Category</Text>
                        <TextInput
                            value={editForm.category}
                            onChangeText={(text) => setEditForm(prev => ({ ...prev, category: text }))}
                            editable={isEditing}
                            className={`p-3 rounded-lg ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                            placeholder="Enter categories (comma separated)"
                            placeholderTextColor="#9CA3AF"
                        />
                    </View>

                    <View className="mb-4">
                        <Text className="text-gray-300 mb-2">Default Vendor</Text>
                        <TextInput
                            value={editForm.defaultVendor}
                            onChangeText={(text) => setEditForm(prev => ({ ...prev, defaultVendor: text }))}
                            editable={isEditing}
                            className={`p-3 rounded-lg ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                            placeholder="Select default vendor"
                            placeholderTextColor="#9CA3AF"
                        />
                    </View>

                    <View className="mb-4">
                        <Text className="text-gray-300 mb-2">Unit of Measure</Text>
                        <TextInput
                            value={editForm.unitOfMeasure}
                            onChangeText={(text) => setEditForm(prev => ({ ...prev, unitOfMeasure: text }))}
                            editable={isEditing}
                            className={`p-3 rounded-lg ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                            placeholder="e.g., Case, Bottle, Lbs, Gallon"
                            placeholderTextColor="#9CA3AF"
                        />
                    </View>

                    <View className="flex-row gap-4">
                        <View className="flex-1 mb-4">
                            <Text className="text-gray-300 mb-2">Stock Quantity</Text>
                            <TextInput
                                value={editForm.stockQuantity}
                                onChangeText={(text) => setEditForm(prev => ({ ...prev, stockQuantity: text }))}
                                editable={isEditing}
                                keyboardType="numeric"
                                className={`p-3 rounded-lg ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                                placeholder="0"
                                placeholderTextColor="#9CA3AF"
                            />
                        </View>

                        <View className="flex-1 mb-4">
                            <Text className="text-gray-300 mb-2">Reorder Threshold</Text>
                            <TextInput
                                value={editForm.reorderThreshold}
                                onChangeText={(text) => setEditForm(prev => ({ ...prev, reorderThreshold: text }))}
                                editable={isEditing}
                                keyboardType="numeric"
                                className={`p-3 rounded-lg ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                                placeholder="0"
                                placeholderTextColor="#9CA3AF"
                            />
                        </View>
                    </View>

                    <View className="mb-4">
                        <Text className="text-gray-300 mb-2">Price</Text>
                        <TextInput
                            value={editForm.price}
                            onChangeText={(text) => setEditForm(prev => ({ ...prev, price: text }))}
                            editable={isEditing}
                            keyboardType="numeric"
                            className={`p-3 rounded-lg ${isEditing ? "bg-[#212121] border border-gray-600 text-white" : "bg-gray-800 text-gray-400"}`}
                            placeholder="0.00"
                            placeholderTextColor="#9CA3AF"
                        />
                    </View>

                    {isEditing && (
                        <View className="flex-row gap-3 mt-4">
                            <TouchableOpacity
                                onPress={handleSave}
                                className="flex-1 bg-green-600 py-3 px-4 rounded-lg flex-row items-center justify-center"
                            >
                                <Save color="white" size={20} />
                                <Text className="text-white ml-2 font-semibold">Save Changes</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => setIsEditing(false)}
                                className="flex-1 bg-gray-600 py-3 px-4 rounded-lg flex-row items-center justify-center"
                            >
                                <X color="white" size={20} />
                                <Text className="text-white ml-2 font-semibold">Cancel</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Recipe Section */}
                <View className="bg-[#303030] rounded-xl p-6 mt-4">
                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-xl font-bold text-white">Recipe & Stock Tracking</Text>
                        {!isEditingRecipe && (
                            <TouchableOpacity
                                onPress={() => setIsEditingRecipe(true)}
                                className="bg-blue-600 px-4 py-2 rounded-lg flex-row items-center"
                            >
                                <Edit color="white" size={16} />
                                <Text className="text-white ml-2 font-semibold">Edit</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Stock Tracking Options */}
                    <View className="mb-6">
                        <Text className="text-gray-300 mb-3">Stock Tracking</Text>
                        <View className="flex-row gap-4">
                            <TouchableOpacity
                                onPress={() => setStockTrackingMode("in_stock")}
                                className={`flex-1 py-3 px-4 rounded-lg border-2 ${stockTrackingMode === "in_stock"
                                        ? "border-blue-500 bg-blue-500/20"
                                        : "border-gray-600 bg-gray-800"
                                    }`}
                            >
                                <View className="flex-row items-center justify-center">
                                    <View className={`w-4 h-4 rounded-full border-2 mr-2 ${stockTrackingMode === "in_stock"
                                            ? "border-blue-500 bg-blue-500"
                                            : "border-gray-400"
                                        }`}>
                                        {stockTrackingMode === "in_stock" && (
                                            <View className="w-2 h-2 bg-white rounded-full m-0.5" />
                                        )}
                                    </View>
                                    <Text className={`font-semibold ${stockTrackingMode === "in_stock" ? "text-blue-400" : "text-gray-300"
                                        }`}>
                                        In Stock
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => setStockTrackingMode("out_of_stock")}
                                className={`flex-1 py-3 px-4 rounded-lg border-2 ${stockTrackingMode === "out_of_stock"
                                        ? "border-blue-500 bg-blue-500/20"
                                        : "border-gray-600 bg-gray-800"
                                    }`}
                            >
                                <View className="flex-row items-center justify-center">
                                    <View className={`w-4 h-4 rounded-full border-2 mr-2 ${stockTrackingMode === "out_of_stock"
                                            ? "border-blue-500 bg-blue-500"
                                            : "border-gray-400"
                                        }`}>
                                        {stockTrackingMode === "out_of_stock" && (
                                            <View className="w-2 h-2 bg-white rounded-full m-0.5" />
                                        )}
                                    </View>
                                    <Text className={`font-semibold ${stockTrackingMode === "out_of_stock" ? "text-blue-400" : "text-gray-300"
                                        }`}>
                                        Out of Stock
                                    </Text>
                                </View>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={() => setStockTrackingMode("quantity")}
                                className={`flex-1 py-3 px-4 rounded-lg border-2 ${stockTrackingMode === "quantity"
                                        ? "border-blue-500 bg-blue-500/20"
                                        : "border-gray-600 bg-gray-800"
                                    }`}
                            >
                                <View className="flex-row items-center justify-center">
                                    <View className={`w-4 h-4 rounded-full border-2 mr-2 ${stockTrackingMode === "quantity"
                                            ? "border-blue-500 bg-blue-500"
                                            : "border-gray-400"
                                        }`}>
                                        {stockTrackingMode === "quantity" && (
                                            <View className="w-2 h-2 bg-white rounded-full m-0.5" />
                                        )}
                                    </View>
                                    <Text className={`font-semibold ${stockTrackingMode === "quantity" ? "text-blue-400" : "text-gray-300"
                                        }`}>
                                        Quantity
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Recipe Items */}
                    <View>
                        <View className="flex-row items-center justify-between mb-4">
                            <Text className="text-gray-300">Recipe Items</Text>
                            {isEditingRecipe && (
                                <TouchableOpacity
                                    onPress={addRecipeItem}
                                    className="bg-green-600 px-3 py-2 rounded-lg flex-row items-center"
                                >
                                    <Plus color="white" size={16} />
                                    <Text className="text-white ml-1 font-semibold">Add Item</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {recipeForm.length === 0 ? (
                            <View className="bg-gray-800 rounded-lg p-6 items-center">
                                <Text className="text-gray-400 text-center mb-2">No recipe items defined</Text>
                                <Text className="text-gray-500 text-sm text-center">
                                    Add inventory items to create a recipe for this menu item
                                </Text>
                            </View>
                        ) : (
                            <View className="space-y-3">
                                {recipeForm.map((recipeItem, index) => (
                                    <View key={index} className="bg-gray-800 rounded-lg p-4">
                                        <View className="flex-row items-center gap-3">
                                            <View className="flex-1">
                                                {isEditingRecipe ? (
                                                    <View className="mb-3">
                                                        <Text className="text-gray-300 text-sm mb-1">Inventory Item</Text>
                                                        <View className="bg-[#212121] border border-gray-600 rounded-lg">
                                                            <ScrollView className="max-h-32">
                                                                {inventoryItems.map((inventoryItem) => (
                                                                    <TouchableOpacity
                                                                        key={inventoryItem.id}
                                                                        onPress={() => updateRecipeItem(index, "inventoryItemId", inventoryItem.id)}
                                                                        className={`p-3 border-b border-gray-700 ${recipeItem.inventoryItemId === inventoryItem.id
                                                                                ? "bg-blue-600"
                                                                                : "bg-transparent"
                                                                            }`}
                                                                    >
                                                                        <Text className={`${recipeItem.inventoryItemId === inventoryItem.id
                                                                                ? "text-white font-semibold"
                                                                                : "text-gray-300"
                                                                            }`}>
                                                                            {inventoryItem.name}
                                                                        </Text>
                                                                    </TouchableOpacity>
                                                                ))}
                                                            </ScrollView>
                                                        </View>
                                                    </View>
                                                ) : (
                                                    <Text className="text-white font-semibold">
                                                        {getInventoryItemName(recipeItem.inventoryItemId)}
                                                    </Text>
                                                )}
                                            </View>

                                            <View className="w-20">
                                                {isEditingRecipe ? (
                                                    <TextInput
                                                        value={recipeItem.quantity}
                                                        onChangeText={(text) => updateRecipeItem(index, "quantity", text)}
                                                        keyboardType="numeric"
                                                        className="bg-[#212121] border border-gray-600 text-white p-2 rounded text-center"
                                                        placeholder="0"
                                                        placeholderTextColor="#9CA3AF"
                                                    />
                                                ) : (
                                                    <Text className="text-gray-300 text-center">
                                                        {recipeItem.quantity}
                                                    </Text>
                                                )}
                                                <Text className="text-gray-400 text-xs text-center mt-1">
                                                    {recipeItem.inventoryItemId ? getInventoryItemUnit(recipeItem.inventoryItemId) : "units"}
                                                </Text>
                                            </View>

                                            {isEditingRecipe && (
                                                <TouchableOpacity
                                                    onPress={() => removeRecipeItem(index)}
                                                    className="bg-red-600 p-2 rounded-lg"
                                                >
                                                    <X color="white" size={16} />
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    </View>
                                ))}
                            </View>
                        )}

                        {isEditingRecipe && (
                            <View className="flex-row gap-3 mt-6">
                                <TouchableOpacity
                                    onPress={handleSaveRecipe}
                                    className="flex-1 bg-green-600 py-3 px-4 rounded-lg flex-row items-center justify-center"
                                >
                                    <Save color="white" size={20} />
                                    <Text className="text-white ml-2 font-semibold">Save Recipe</Text>
                                </TouchableOpacity>

                                <TouchableOpacity
                                    onPress={() => setIsEditingRecipe(false)}
                                    className="flex-1 bg-gray-600 py-3 px-4 rounded-lg flex-row items-center justify-center"
                                >
                                    <X color="white" size={20} />
                                    <Text className="text-white ml-2 font-semibold">Cancel</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </View>
            </ScrollView>

            {/* Log Usage Modal */}
            <Modal
                visible={isLogUsageModalOpen}
                transparent
                animationType="fade"
                onRequestClose={() => setIsLogUsageModalOpen(false)}
            >
                <View className="flex-1 bg-black/50 justify-center items-center px-6">
                    <View className="bg-[#303030] rounded-xl p-6 w-full max-w-md">
                        <Text className="text-2xl font-bold text-white mb-4">Log Usage</Text>

                        <View className="mb-4">
                            <Text className="text-lg text-gray-300 mb-2">Item: {item.name}</Text>
                        </View>

                        <View className="mb-4">
                            <Text className="text-lg text-gray-300 mb-2">Quantity Used</Text>
                            <TextInput
                                value={logUsageForm.quantityUsed}
                                onChangeText={(text) => setLogUsageForm(prev => ({ ...prev, quantityUsed: text }))}
                                placeholder="Enter quantity used"
                                placeholderTextColor="#9CA3AF"
                                keyboardType="numeric"
                                className="bg-[#212121] border border-gray-600 rounded-lg px-4 py-3 text-white text-lg"
                            />
                        </View>

                        <View className="mb-4">
                            <Text className="text-lg text-gray-300 mb-2">Reason for Adjustment</Text>
                            <View className="bg-[#212121] border border-gray-600 rounded-lg">
                                <TouchableOpacity
                                    onPress={() => setLogUsageForm(prev => ({ ...prev, reason: "SALES_CONSUMPTION" }))}
                                    className={`p-3 ${logUsageForm.reason === "SALES_CONSUMPTION" ? "bg-blue-600" : ""}`}
                                >
                                    <Text className="text-white">Sales / Consumption</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setLogUsageForm(prev => ({ ...prev, reason: "SPOILAGE_WASTE" }))}
                                    className={`p-3 ${logUsageForm.reason === "SPOILAGE_WASTE" ? "bg-blue-600" : ""}`}
                                >
                                    <Text className="text-white">Spoilage / Waste</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setLogUsageForm(prev => ({ ...prev, reason: "INTERNAL_TRANSFER" }))}
                                    className={`p-3 ${logUsageForm.reason === "INTERNAL_TRANSFER" ? "bg-blue-600" : ""}`}
                                >
                                    <Text className="text-white">Internal Transfer</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={() => setLogUsageForm(prev => ({ ...prev, reason: "COUNT_CORRECTION" }))}
                                    className={`p-3 ${logUsageForm.reason === "COUNT_CORRECTION" ? "bg-blue-600" : ""}`}
                                >
                                    <Text className="text-white">Count Correction</Text>
                                </TouchableOpacity>
                            </View>
                        </View>

                        <View className="mb-6">
                            <Text className="text-lg text-gray-300 mb-2">Notes (Optional)</Text>
                            <TextInput
                                value={logUsageForm.notes}
                                onChangeText={(text) => setLogUsageForm(prev => ({ ...prev, notes: text }))}
                                placeholder="Additional details..."
                                placeholderTextColor="#9CA3AF"
                                multiline
                                numberOfLines={3}
                                className="bg-[#212121] border border-gray-600 rounded-lg px-4 py-3 text-white text-lg"
                            />
                        </View>

                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={() => setIsLogUsageModalOpen(false)}
                                className="flex-1 py-3 px-4 bg-gray-600 rounded-lg"
                            >
                                <Text className="text-white text-lg font-semibold text-center">Cancel</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={handleLogUsage}
                                className="flex-1 py-3 px-4 bg-blue-600 rounded-lg"
                            >
                                <Text className="text-white text-lg font-semibold text-center">Log Usage</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Inventory History Bottom Sheet */}
            <BottomSheet
                ref={historySheetRef}
                index={-1}
                snapPoints={snapPoints}
                enablePanDownToClose={true}
                backgroundStyle={{ backgroundColor: "#303030" }}
                handleIndicatorStyle={{ backgroundColor: "#9CA3AF" }}
                backdropComponent={renderBackdrop}
            >
                <View className="flex-1">
                    <View className="flex-row items-center justify-between p-4 border-b border-gray-700">
                        <Text className="text-xl font-bold text-white">Inventory History</Text>
                        <TouchableOpacity onPress={() => historySheetRef.current?.close()}>
                            <X color="#9CA3AF" size={24} />
                        </TouchableOpacity>
                    </View>

                    {inventoryHistory.length === 0 ? (
                        <View className="flex-1 justify-center items-center p-8">
                            <History color="#9CA3AF" size={48} />
                            <Text className="text-gray-400 text-lg mt-4 text-center">
                                No transaction history available
                            </Text>
                            <Text className="text-gray-500 text-sm mt-2 text-center">
                                Transaction history will appear here once you start logging usage or stock adjustments.
                            </Text>
                        </View>
                    ) : (
                        <BottomSheetFlatList
                            data={inventoryHistory}
                            keyExtractor={(item) => item.id}
                            renderItem={({ item: transaction }) => (
                                <View className="p-4 border-b border-gray-700">
                                    <View className="flex-row items-center justify-between mb-2">
                                        <View className={`px-2 py-1 rounded ${getTransactionTypeColor(transaction.type)}`}>
                                            <Text className="text-white text-sm font-semibold">
                                                {getTransactionTypeLabel(transaction.type)}
                                            </Text>
                                        </View>
                                        <Text className="text-gray-400 text-sm">
                                            {new Date(transaction.timestamp).toLocaleDateString()}
                                        </Text>
                                    </View>

                                    <View className="flex-row items-center justify-between mb-1">
                                        <Text className="text-white font-semibold">
                                            {transaction.quantityChange > 0 ? "+" : ""}{transaction.quantityChange} units
                                        </Text>
                                        <Text className="text-gray-300">
                                            Result: {transaction.resultingQuantity}
                                        </Text>
                                    </View>

                                    {transaction.notes && (
                                        <Text className="text-gray-400 text-sm mb-1">{transaction.notes}</Text>
                                    )}

                                    {transaction.reference && (
                                        <Text className="text-blue-400 text-sm">Ref: {transaction.reference}</Text>
                                    )}
                                </View>
                            )}
                            contentContainerStyle={{ paddingBottom: 20 }}
                        />
                    )}
                </View>
            </BottomSheet>
        </View>
    );
};

export default MenuItemScreen;
