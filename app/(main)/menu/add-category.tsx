import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { CustomPricing, MenuItemType } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { router } from "expo-router";
import { ArrowLeft, Check, DollarSign, Minus, Plus, Save, Utensils, X } from "lucide-react-native";
import React, { useState } from "react";
import {
    Alert,
    Image,
    Modal,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View
} from "react-native";

// Get image source for preview
const getImageSource = (image: string | undefined) => {
    if (image && image.length > 200) {
        return { uri: `data:image/jpeg;base64,${image}` };
    }

    if (image) {
        // Try to get image from assets
        return `${image}`
    }

    return undefined;
};

const AddCategoryScreen: React.FC = () => {
    const {
        menuItems,
        addCategory,
        addItemToCategory,
        addCustomPricing,
        updateCustomPricing,
        deleteCustomPricing,
        toggleCustomPricingActive
    } = useMenuStore();

    const [categoryName, setCategoryName] = useState("");
    const [selectedItems, setSelectedItems] = useState<string[]>([]);
    const [showConfirmation, setShowConfirmation] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [editingPricing, setEditingPricing] = useState<{ itemId: string; pricing: CustomPricing } | null>(null);
    const [newPricing, setNewPricing] = useState<{ itemId: string; price: number } | null>(null);
    const [customPricingRules, setCustomPricingRules] = useState<{ [itemId: string]: number }>({});

    // Get all items (since items can now be in multiple categories)
    const availableItems = menuItems;

    // Handle item selection
    const toggleItemSelection = (itemId: string) => {
        setSelectedItems(prev =>
            prev.includes(itemId)
                ? prev.filter(id => id !== itemId)
                : [...prev, itemId]
        );
    };

    // Custom pricing functions
    const handleAddCustomPricing = (itemId: string) => {
        const item = availableItems.find(i => i.id === itemId);
        if (item) {
            setNewPricing({ itemId, price: item.price });
        }
    };

    const handleSaveCustomPricing = () => {
        if (!newPricing || !categoryName.trim()) return;

        // Store the custom pricing rule
        setCustomPricingRules(prev => ({
            ...prev,
            [newPricing.itemId]: newPricing.price
        }));
        setNewPricing(null);
    };

    const handleRemoveCustomPricing = (itemId: string) => {
        setCustomPricingRules(prev => {
            const newRules = { ...prev };
            delete newRules[itemId];
            return newRules;
        });
    };

    const handleEditCustomPricing = (itemId: string) => {
        const currentPrice = customPricingRules[itemId];
        if (currentPrice) {
            setNewPricing({ itemId, price: currentPrice });
            handleRemoveCustomPricing(itemId);
        }
    };

    const handleUpdateCustomPricing = () => {
        if (!editingPricing) return;

        updateCustomPricing(editingPricing.itemId, editingPricing.pricing.id, {
            price: editingPricing.pricing.price,
        });
        setEditingPricing(null);
    };

    const handleDeleteCustomPricing = (itemId: string, pricingId: string) => {
        Alert.alert(
            "Delete Custom Pricing",
            "Are you sure you want to delete this custom pricing?",
            [
                { text: "Cancel", style: "cancel" },
                {
                    text: "Delete",
                    style: "destructive",
                    onPress: () => deleteCustomPricing(itemId, pricingId),
                },
            ]
        );
    };

    const handleToggleCustomPricingActive = (itemId: string, pricingId: string) => {
        toggleCustomPricingActive(itemId, pricingId);
    };

    // Handle form validation
    const validateForm = (): boolean => {
        if (!categoryName.trim()) {
            Alert.alert("Error", "Please enter a category name");
            return false;
        }

        if (selectedItems.length === 0) {
            Alert.alert("Error", "Please select at least one item for this category");
            return false;
        }

        return true;
    };

    // Handle save
    const handleSave = () => {
        if (!validateForm()) {
            return;
        }
        setShowConfirmation(true);
    };

    const confirmSave = async () => {
        setIsSaving(true);
        setShowConfirmation(false);

        try {
            // Create the category
            const newOrder = Math.max(...useMenuStore.getState().categories.map(cat => cat.order), 0) + 1;
            const newCategory = {
                name: categoryName.trim(),
                isActive: true,
                order: newOrder,
            };

            addCategory(newCategory);

            // Add selected items to this category
            selectedItems.forEach(itemId => {
                addItemToCategory(itemId, categoryName.trim());
            });

            // Add custom pricing for items that have it
            const createdCategory = useMenuStore.getState().categories.find(cat => cat.name === categoryName.trim());
            if (createdCategory) {
                Object.entries(customPricingRules).forEach(([itemId, price]) => {
                    addCustomPricing(itemId, {
                        categoryId: createdCategory.id,
                        categoryName: createdCategory.name,
                        price: price,
                        isActive: true,
                    });
                });
            }

            // Simulate a small delay for better UX
            await new Promise(resolve => setTimeout(resolve, 1000));

            router.back();
        } catch (error) {
            Alert.alert("Error", "Failed to save category. Please try again.");
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <View className="flex-1 bg-[#212121]">
            {/* Header */}
            <View className="flex-row items-center justify-between p-4 border-b border-gray-700 bg-[#303030]">
                <TouchableOpacity
                    onPress={() => router.back()}
                    className="flex-row items-center"
                >
                    <ArrowLeft size={20} color="#9CA3AF" />
                    <Text className="text-white font-medium ml-2">Back to Menu</Text>
                </TouchableOpacity>

                <TouchableOpacity
                    onPress={handleSave}
                    disabled={isSaving}
                    className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
                >
                    <Save size={16} color="white" />
                    <Text className="text-white font-medium ml-2">
                        {isSaving ? "Saving..." : "Save Category"}
                    </Text>
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1 p-6">
                <Text className="text-2xl font-bold text-white mb-6">Add New Category</Text>

                {/* Category Name Input */}
                <View className="mb-6">
                    <Text className="text-lg font-semibold text-white mb-4">Category Name</Text>
                    <TextInput
                        className="bg-[#303030] border border-gray-600 rounded-lg px-4 py-3 text-white"
                        placeholder="e.g., Appetizers, Main Course, Desserts"
                        placeholderTextColor="#9CA3AF"
                        value={categoryName}
                        onChangeText={setCategoryName}
                        autoFocus
                    />
                </View>

                {/* Available Items */}
                <View className="mb-6">
                    <View className="flex-row items-center justify-between mb-4">
                        <Text className="text-lg font-semibold text-white">Select Items</Text>
                        <Text className="text-gray-400 text-sm">
                            {selectedItems.length} of {availableItems.length} selected
                        </Text>
                    </View>

                    {availableItems.length === 0 ? (
                        <View className="bg-[#303030] border border-gray-600 rounded-lg p-6 items-center">
                            <Utensils size={48} color="#9CA3AF" />
                            <Text className="text-gray-400 text-center mt-4">
                                No menu items found.
                            </Text>
                            <Text className="text-gray-500 text-center text-sm mt-2">
                                Create some menu items first to add them to categories.
                            </Text>
                        </View>
                    ) : (
                        <View className="gap-3 flex flex-row flex-wrap">
                            {availableItems.map((item) => {
                                const isSelected = selectedItems.includes(item.id);
                                return (
                                    <TouchableOpacity
                                        key={item.id}
                                        onPress={() => toggleItemSelection(item.id)}
                                        className={`bg-[#303030] rounded-lg w-[32%] border p-4 ${isSelected ? "border-blue-500 bg-blue-900/20" : "border-gray-700"
                                            }`}
                                    >
                                        <View className="flex-row items-center gap-4">
                                            {/* Item Image */}
                                            <View className="h-24 aspect-square rounded-lg border border-gray-600 overflow-hidden">
                                                {getImageSource(item.image) ? (
                                                    <Image
                                                        source={typeof getImageSource(item.image) === "string" ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP] : getImageSource(item.image)}
                                                        className="w-full h-full object-cover"
                                                    />
                                                ) : (
                                                    <View className="w-full h-full bg-gray-600 items-center justify-center">
                                                        <Utensils color="#9ca3af" size={24} />
                                                    </View>
                                                )}
                                            </View>

                                            {/* Item Details */}
                                            <View className="flex-1">
                                                <Text className="text-white font-medium text-lg">
                                                    {item.name}
                                                </Text>
                                                {item.description && (
                                                    <Text className="text-gray-400 text-sm mt-1">
                                                        {item.description.length > 45 ? item.description.substring(0, 45) + "..." : item.description}
                                                    </Text>
                                                )}

                                                {/* Price Display */}
                                                <View className="flex-row items-center gap-2 mt-1">
                                                    <Text className="text-blue-400 font-semibold">
                                                        ${item.price.toFixed(2)}
                                                    </Text>
                                                    {categoryName.trim() && (
                                                        <Text className="text-yellow-400 text-xs">
                                                            (Will be: ${customPricingRules[item.id] ? customPricingRules[item.id].toFixed(2) : item.price.toFixed(2)})
                                                        </Text>
                                                    )}
                                                </View>

                                                {/* Custom Pricing Rules */}
                                                {customPricingRules[item.id] && (
                                                    <View className="mt-2">
                                                        <View className="flex-row items-center gap-2">
                                                            <View className="bg-yellow-900/30 border border-yellow-500 px-2 py-1 rounded">
                                                                <Text className="text-yellow-400 text-xs">
                                                                    ${customPricingRules[item.id].toFixed(2)}
                                                                </Text>
                                                            </View>
                                                            <TouchableOpacity
                                                                onPress={() => handleEditCustomPricing(item.id)}
                                                                className="p-1 bg-blue-600 rounded"
                                                            >
                                                                <Save size={12} color="white" />
                                                            </TouchableOpacity>
                                                            <TouchableOpacity
                                                                onPress={() => handleRemoveCustomPricing(item.id)}
                                                                className="p-1 bg-red-600 rounded"
                                                            >
                                                                <X size={12} color="white" />
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>
                                                )}

                                                {/* Add Custom Pricing Button */}
                                                {categoryName.trim() && !customPricingRules[item.id] && (
                                                    <TouchableOpacity
                                                        onPress={() => handleAddCustomPricing(item.id)}
                                                        className="flex-row items-center gap-1 mt-2 bg-yellow-900/30 border border-yellow-500 px-2 py-1 rounded self-start"
                                                    >
                                                        <DollarSign size={12} color="#FBBF24" />
                                                        <Text className="text-yellow-400 text-xs">Set Custom Price</Text>
                                                    </TouchableOpacity>
                                                )}

                                                {/* New Pricing Input */}
                                                {newPricing?.itemId === item.id && (
                                                    <View className="flex-row items-center gap-2 mt-2">
                                                        <TouchableOpacity
                                                            onPress={() => setNewPricing({ ...newPricing, price: Math.max(0, newPricing.price - 0.25) })}
                                                            className="p-1"
                                                        >
                                                            <Minus size={14} color="#9CA3AF" />
                                                        </TouchableOpacity>
                                                        <TextInput
                                                            className="flex-1 bg-[#212121] border border-gray-600 rounded px-2 py-1 text-white text-center"
                                                            value={newPricing.price.toString()}
                                                            onChangeText={(text) => setNewPricing({ ...newPricing, price: parseFloat(text) || 0 })}
                                                            keyboardType="numeric"
                                                            placeholder="0.00"
                                                            placeholderTextColor="#9CA3AF"
                                                        />
                                                        <TouchableOpacity
                                                            onPress={() => setNewPricing({ ...newPricing, price: newPricing.price + 0.25 })}
                                                            className="p-1"
                                                        >
                                                            <Plus size={14} color="#9CA3AF" />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            onPress={handleSaveCustomPricing}
                                                            className="p-1 bg-green-600 rounded"
                                                        >
                                                            <Save size={12} color="white" />
                                                        </TouchableOpacity>
                                                        <TouchableOpacity
                                                            onPress={() => setNewPricing(null)}
                                                            className="p-1 bg-gray-600 rounded"
                                                        >
                                                            <X size={12} color="white" />
                                                        </TouchableOpacity>
                                                    </View>
                                                )}

                                                {/* Show existing categories */}
                                                {Array.isArray(item.category) && item.category.length > 0 && (
                                                    <View className="flex-row flex-wrap gap-1 mt-2">
                                                        {item.category.map((cat: string, index: number) => (
                                                            <View key={index} className="bg-gray-600/30 border border-gray-500 px-2 py-1 rounded">
                                                                <Text className="text-xs text-gray-300">{cat}</Text>
                                                            </View>
                                                        ))}
                                                    </View>
                                                )}
                                            </View>

                                            {/* Selection Indicator */}
                                            <View className={`w-6 h-6 rounded-full border-2 items-center justify-center ${isSelected
                                                ? "bg-blue-600 border-blue-600"
                                                : "border-gray-500"
                                                }`}>
                                                {isSelected && (
                                                    <Check size={16} color="white" />
                                                )}
                                            </View>
                                        </View>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    )}
                </View>

                {/* Selected Items Summary */}
                {selectedItems.length > 0 && (
                    <View className="mb-6">
                        <Text className="text-lg font-semibold text-white mb-4">
                            Selected Items ({selectedItems.length})
                        </Text>
                        <View className="bg-[#303030] border border-gray-600 rounded-lg p-4">
                            <View className="flex-row flex-wrap gap-2">
                                {selectedItems.map((itemId) => {
                                    const item = availableItems.find((i: MenuItemType) => i.id === itemId);
                                    return item ? (
                                        <View key={itemId} className="flex-row items-center bg-blue-600/20 border border-blue-500 px-3 py-2 rounded-lg">
                                            <Text className="text-blue-400 text-sm font-medium">
                                                {item.name}
                                            </Text>
                                            <TouchableOpacity
                                                onPress={() => toggleItemSelection(itemId)}
                                                className="ml-2"
                                            >
                                                <X size={14} color="#60A5FA" />
                                            </TouchableOpacity>
                                        </View>
                                    ) : null;
                                })}
                            </View>
                        </View>
                    </View>
                )}

                {/* Custom Pricing Summary */}
                {Object.keys(customPricingRules).length > 0 && (
                    <View className="mb-6">
                        <Text className="text-lg font-semibold text-white mb-4">
                            Custom Pricing Rules ({Object.keys(customPricingRules).length})
                        </Text>
                        <View className="bg-[#303030] border border-gray-600 rounded-lg p-4">
                            <View className="gap-2">
                                {Object.entries(customPricingRules).map(([itemId, price]) => {
                                    const item = availableItems.find((i: MenuItemType) => i.id === itemId);
                                    return item ? (
                                        <View key={itemId} className="flex-row items-center justify-between bg-yellow-900/20 border border-yellow-500 px-3 py-2 rounded-lg">
                                            <View className="flex-1">
                                                <Text className="text-yellow-400 text-sm font-medium">
                                                    {item.name}
                                                </Text>
                                                <Text className="text-gray-400 text-xs">
                                                    ${item.price.toFixed(2)} → ${price.toFixed(2)}
                                                </Text>
                                            </View>
                                            <View className="flex-row items-center gap-2">
                                                <TouchableOpacity
                                                    onPress={() => handleEditCustomPricing(itemId)}
                                                    className="p-1 bg-blue-600 rounded"
                                                >
                                                    <Save size={12} color="white" />
                                                </TouchableOpacity>
                                                <TouchableOpacity
                                                    onPress={() => handleRemoveCustomPricing(itemId)}
                                                    className="p-1 bg-red-600 rounded"
                                                >
                                                    <X size={12} color="white" />
                                                </TouchableOpacity>
                                            </View>
                                        </View>
                                    ) : null;
                                })}
                            </View>
                        </View>
                    </View>
                )}
            </ScrollView>

            {/* Confirmation Modal */}
            <Modal
                visible={showConfirmation}
                transparent={true}
                animationType="fade"
                onRequestClose={() => setShowConfirmation(false)}
            >
                <View className="flex-1 bg-black/50 items-center justify-center p-6">
                    <View className="bg-[#303030] rounded-2xl p-6 w-full max-w-sm border border-gray-600">
                        {/* Header */}
                        <View className="items-center mb-6">
                            <View className="w-16 h-16 bg-blue-600/20 rounded-full items-center justify-center mb-4">
                                <Save size={32} color="#60A5FA" />
                            </View>
                            <Text className="text-xl font-bold text-white text-center">
                                Create Category?
                            </Text>
                            <Text className="text-gray-400 text-center mt-2">
                                Create "{categoryName}" with {selectedItems.length} items?
                            </Text>
                        </View>

                        {/* Category Preview */}
                        <View className="bg-[#212121] rounded-lg p-4 mb-6">
                            <Text className="text-white font-medium mb-2">{categoryName}</Text>
                            <Text className="text-gray-400 text-sm mb-2">
                                {selectedItems.length} items will be added to this category
                            </Text>
                            {Object.keys(customPricingRules).length > 0 && (
                                <Text className="text-yellow-400 text-sm">
                                    {Object.keys(customPricingRules).length} custom pricing rules will be applied
                                </Text>
                            )}
                        </View>

                        {/* Action Buttons */}
                        <View className="flex-row gap-3">
                            <TouchableOpacity
                                onPress={() => setShowConfirmation(false)}
                                className="flex-1 bg-[#212121] border border-gray-600 rounded-lg py-3 items-center"
                            >
                                <Text className="text-gray-300 font-medium">Cancel</Text>
                            </TouchableOpacity>

                            <TouchableOpacity
                                onPress={confirmSave}
                                disabled={isSaving}
                                className="flex-1 bg-blue-600 rounded-lg py-3 items-center"
                            >
                                <Text className="text-white font-medium">
                                    {isSaving ? "Creating..." : "Create Category"}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
        </View>
    );
};

export default AddCategoryScreen;
