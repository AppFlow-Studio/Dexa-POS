import { MOCK_MENU_ITEMS } from "@/lib/mockData";
import { useModifierSidebarStore } from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { toast, ToastPosition } from "@backpackapp-io/react-native-toast";
import { Minus, Plus, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    Animated,
    Dimensions,
    Image,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";



interface ModifierSelection {
    [categoryId: string]: {
        [optionId: string]: boolean;
    };
}

const { width: screenWidth } = Dimensions.get("window");
const SIDEBAR_WIDTH = screenWidth * 0.4; // 60% of screen width

const ModifierSidebar = () => {
    const { isOpen, mode, menuItem, cartItem, close } = useModifierSidebarStore();
    const { addItemToActiveOrder, updateItemInActiveOrder, generateCartItemId } = useOrderStore();

    // Animation values
    const slideAnimation = useState(new Animated.Value(-SIDEBAR_WIDTH))[0];
    const overlayOpacity = useState(new Animated.Value(0))[0];

    // Internal state for the form
    const [quantity, setQuantity] = useState(1);
    const [modifierSelections, setModifierSelections] = useState<ModifierSelection>({});
    const [notes, setNotes] = useState("");

    const isReadOnly = mode === "view";
    const currentItem = mode === "edit" ? cartItem : menuItem;

    // Get the menu item for modifier access (either directly or from cart item)
    const menuItemForModifiers = mode === "edit" && cartItem ?
        MOCK_MENU_ITEMS.find(item => item.id === cartItem.menuItemId) :
        menuItem;

    // Animate sidebar in/out
    useEffect(() => {
        if (isOpen) {
            Animated.parallel([
                Animated.timing(slideAnimation, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(overlayOpacity, {
                    toValue: 1,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();
        } else {
            Animated.parallel([
                Animated.timing(slideAnimation, {
                    toValue: -SIDEBAR_WIDTH,
                    duration: 300,
                    useNativeDriver: true,
                }),
                Animated.timing(overlayOpacity, {
                    toValue: 0,
                    duration: 300,
                    useNativeDriver: true,
                }),
            ]).start();
        }
    }, [isOpen, slideAnimation, overlayOpacity]);

    // Initialize form when sidebar opens
    useEffect(() => {
        if (isOpen && currentItem) {
            setQuantity(mode === "edit" ? cartItem!.quantity : 1);
            setNotes(mode === "edit" ? cartItem!.customizations.notes || "" : "");

            // Initialize modifier selections with defaults
            const initialSelections: ModifierSelection = {};
            if (menuItemForModifiers?.modifiers) {
                menuItemForModifiers.modifiers.forEach((category) => {
                    initialSelections[category.id] = {};

                    // Set default selections for required categories
                    if (category.type === "required" && category.selectionType === "single") {
                        // For required single selection, select the first available option
                        const firstAvailableOption = category.options.find(option => option.isAvailable !== false);
                        if (firstAvailableOption) {
                            initialSelections[category.id][firstAvailableOption.id] = true;
                        }
                    }

                    // Initialize all other options as unselected
                    category.options.forEach((option) => {
                        if (!initialSelections[category.id][option.id]) {
                            initialSelections[category.id][option.id] = false;
                        }
                    });
                });
            }
            setModifierSelections(initialSelections);
        }
    }, [isOpen, currentItem, mode, cartItem]);

    // Calculate total price
    const total = useMemo(() => {
        if (!currentItem) return 0;

        let baseTotal = currentItem.price;

        // Add modifier costs
        Object.values(modifierSelections).forEach((categorySelections) => {
            Object.entries(categorySelections).forEach(([optionId, isSelected]) => {
                if (isSelected) {
                    // Find the option and add its price
                    menuItemForModifiers?.modifiers?.forEach((category) => {
                        const option = category.options.find((opt) => opt.id === optionId);
                        if (option) {
                            baseTotal += option.price;
                        }
                    });
                }
            });
        });

        return baseTotal * quantity;
    }, [quantity, modifierSelections, currentItem]);

    const handleModifierToggle = useCallback((categoryId: string, optionId: string) => {
        if (isReadOnly) return;

        setModifierSelections((prev) => {
            const category = menuItemForModifiers?.modifiers?.find((cat) => cat.id === categoryId);
            if (!category) return prev;

            const newSelections = { ...prev };
            if (!newSelections[categoryId]) {
                newSelections[categoryId] = {};
            }

            if (category.selectionType === "single") {
                // For single selection, clear all others in this category
                Object.keys(newSelections[categoryId]).forEach((key) => {
                    newSelections[categoryId][key] = false;
                });
                newSelections[categoryId][optionId] = !newSelections[categoryId][optionId];
            } else {
                // For multiple selection, check limits
                const currentSelected = Object.values(newSelections[categoryId]).filter(Boolean).length;
                const isCurrentlySelected = newSelections[categoryId][optionId];

                if (!isCurrentlySelected && category.maxSelections && currentSelected >= category.maxSelections) {
                    // Don't allow selection if max reached
                    return prev;
                }

                newSelections[categoryId][optionId] = !isCurrentlySelected;
            }

            return newSelections;
        });
    }, [isReadOnly, currentItem]);

    const handleSave = useCallback(() => {
        if (!currentItem) return;

        // Validate required selections (only if modifiers exist)
        if (menuItemForModifiers?.modifiers && menuItemForModifiers.modifiers.length > 0) {
            const hasRequiredSelections = menuItemForModifiers.modifiers.every((category) => {
                if (category.type === "required") {
                    return Object.values(modifierSelections[category.id] || {}).some(Boolean);
                }
                return true;
            });

            if (!hasRequiredSelections) {
                toast.error("Please select all required options", {
                    duration: 4000,
                    position: ToastPosition.BOTTOM,
                });
                return;
            }
        }

        // Convert modifier selections to the format expected by the order system
        const selectedModifiers = menuItemForModifiers?.modifiers ? Object.entries(modifierSelections).map(([categoryId, selections]) => {
            const category = menuItemForModifiers.modifiers?.find((cat) => cat.id === categoryId);
            const selectedOptions = Object.entries(selections)
                .filter(([_, isSelected]) => isSelected)
                .map(([optionId, _]) => {
                    const option = category?.options.find((opt) => opt.id === optionId);
                    return {
                        id: optionId,
                        name: option?.name || "",
                        price: option?.price || 0,
                    };
                });

            return {
                categoryId,
                categoryName: category?.name || "",
                options: selectedOptions,
            };
        }) : [];

        if (mode === "edit" && cartItem) {
            // Update existing item
            const updatedItem = {
                ...cartItem,
                quantity,
                price: total / quantity,
                customizations: {
                    ...cartItem.customizations,
                    modifiers: selectedModifiers,
                    notes,
                },
            };
            updateItemInActiveOrder(updatedItem);
        } else {
            // Add new item
            const newItem = {
                id: generateCartItemId(currentItem.id, {
                    modifiers: selectedModifiers,
                    notes,
                }),
                menuItemId: currentItem.id,
                name: currentItem.name,
                quantity,
                originalPrice: currentItem.price,
                price: total / quantity,
                image: currentItem.image,
                customizations: {
                    modifiers: selectedModifiers,
                    notes,
                },
                availableDiscount: currentItem.availableDiscount,
                appliedDiscount: null,
                paidQuantity: 0,
            };
            addItemToActiveOrder(newItem);
        }

        toast.success(`${mode == 'edit' ? 'Updated' : 'Added'} ${currentItem.name} $${total.toFixed(2)}`, {
            duration: 4000,
            position: ToastPosition.BOTTOM,
        });

        close();
    }, [
        currentItem,
        modifierSelections,
        quantity,
        notes,
        total,
        mode,
        cartItem,
        close,
        addItemToActiveOrder,
        updateItemInActiveOrder,
    ]);

    const handleOverlayPress = () => {
        if (!isReadOnly) {
            close();
        }
    };

    if (!isOpen || !currentItem) return null;

    return (
        <>
            {/* Overlay */}
            <Animated.View
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    backgroundColor: "rgba(0, 0, 0, 0.5)",
                    opacity: overlayOpacity,
                    zIndex: 1000,
                }}
            >
                <TouchableOpacity
                    style={{ flex: 1 }}
                    onPress={handleOverlayPress}
                    activeOpacity={1}
                />
            </Animated.View>

            {/* Sidebar */}
            <Animated.View
                style={{
                    position: "absolute",
                    top: 0,
                    left: 0,
                    width: SIDEBAR_WIDTH,
                    height: "100%",
                    backgroundColor: "white",
                    transform: [{ translateX: slideAnimation }],
                    zIndex: 1001,
                    shadowColor: "#000",
                    shadowOffset: { width: 2, height: 0 },
                    shadowOpacity: 0.25,
                    shadowRadius: 10,
                    elevation: 10,
                }}
            >
                <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                    {/* Header */}
                    <View className="p-6 border-b border-gray-200">
                        <View className="flex-row items-center justify-between mb-4">
                            <Text className="text-xl font-bold text-gray-800">Customize</Text>
                            <TouchableOpacity onPress={close} className="p-2">
                                <X color="#6b7280" size={24} />
                            </TouchableOpacity>
                        </View>

                        <View className="flex-row items-center gap-4">
                            <Image
                                source={require("@/assets/images/classic_burger.png")}
                                className="w-16 h-16 rounded-lg"
                            />
                            <View className="flex-1">
                                <Text className="text-lg font-bold text-gray-800">{currentItem.name}</Text>
                                <Text className="text-sm text-gray-600">{menuItemForModifiers?.description}</Text>
                                <Text className="text-lg font-semibold text-blue-600 mt-1">
                                    Base ${currentItem.price.toFixed(2)}
                                </Text>
                            </View>
                        </View>
                    </View>

                    {/* Quantity */}
                    <View className="p-6 border-b border-gray-200">
                        <Text className="text-lg font-medium text-gray-800 mb-3">Quantity</Text>
                        <View className="flex-row items-center justify-center">
                            <TouchableOpacity
                                disabled={isReadOnly}
                                onPress={() => setQuantity((q) => Math.max(1, q - 1))}
                                className="p-3 border border-gray-300 rounded-full bg-white"
                            >
                                <Minus color="#4b5563" size={20} />
                            </TouchableOpacity>
                            <Text className="text-2xl font-bold text-gray-800 mx-8 w-8 text-center">
                                {quantity}
                            </Text>
                            <TouchableOpacity
                                disabled={isReadOnly}
                                onPress={() => setQuantity((q) => q + 1)}
                                className="p-3 bg-blue-600 rounded-full"
                            >
                                <Plus color="#FFFFFF" size={20} />
                            </TouchableOpacity>
                        </View>
                    </View>

                    {/* Modifiers */}
                    {menuItemForModifiers?.modifiers?.map((category) => (
                        <View key={category.id} className="p-6 border-b border-gray-200">
                            <View className="mb-3">
                                <Text className="text-lg font-medium text-gray-800">
                                    {category.name}
                                    {category.type === "required" && (
                                        <Text className="text-red-500 ml-1">*</Text>
                                    )}
                                </Text>
                                {category.description && (
                                    <Text className="text-sm text-gray-600 mt-1">{category.description}</Text>
                                )}
                            </View>

                            <View className="gap-y-2 flex flex-col">
                                {category.options.map((option) => {
                                    const isSelected = modifierSelections[category.id]?.[option.id] || false;
                                    const isUnavailable = option.isAvailable === false;

                                    return (
                                        <TouchableOpacity
                                            key={option.id}
                                            disabled={isReadOnly || isUnavailable}
                                            onPress={() => handleModifierToggle(category.id, option.id)}
                                            className={`p-3 rounded-lg border ${isSelected
                                                ? "border-blue-500 bg-blue-50"
                                                : isUnavailable
                                                    ? "border-gray-200 bg-gray-100"
                                                    : "border-gray-200 bg-white"
                                                }`}
                                        >
                                            <View className="flex-row justify-between items-center">
                                                <Text
                                                    className={`font-medium ${isUnavailable ? "text-gray-400" : "text-gray-800"
                                                        }`}
                                                >
                                                    {option.name}
                                                    {isUnavailable && " (86'd)"}
                                                </Text>
                                                {option.price > 0 && (
                                                    <Text className="font-semibold text-blue-600">
                                                        +${option.price.toFixed(2)}
                                                    </Text>
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>
                        </View>
                    ))}

                    {/* Notes */}
                    <View className="p-6 border-b border-gray-200">
                        <Text className="text-lg font-medium text-gray-800 mb-3">
                            Notes (optional)
                        </Text>
                        <TextInput
                            editable={!isReadOnly}
                            value={notes}
                            onChangeText={setNotes}
                            placeholder="No onions, cut in half..."
                            multiline
                            maxLength={80}
                            className="p-3 border border-gray-200 rounded-lg bg-white min-h-[80px]"
                        />
                        <Text className="text-xs text-gray-500 mt-1 text-right">
                            {notes.length}/80
                        </Text>
                    </View>

                    {/* Allergens */}
                    {menuItemForModifiers?.allergens && menuItemForModifiers.allergens.length > 0 && (
                        <View className="p-6 border-b border-gray-200">
                            <Text className="text-lg font-medium text-gray-800 mb-3">Allergens</Text>
                            <View className="flex-row flex-wrap gap-2">
                                {menuItemForModifiers.allergens.map((allergen) => (
                                    <View
                                        key={allergen}
                                        className="px-3 py-1 bg-red-100 rounded-full"
                                    >
                                        <Text className="text-sm text-red-700">{allergen}</Text>
                                    </View>
                                ))}
                            </View>
                        </View>
                    )}

                    {/* Total */}
                    <View className="p-6 border-b border-gray-200">
                        <View className="flex-row justify-between items-center">
                            <Text className="text-lg font-medium text-gray-800">Total</Text>
                            <Text className="text-2xl font-bold text-gray-800">
                                ${total.toFixed(2)}
                            </Text>
                        </View>
                    </View>

                    {/* Action Buttons */}
                    <View className="p-6">
                        {isReadOnly ? (
                            <TouchableOpacity
                                onPress={close}
                                className="w-full py-4 bg-gray-200 rounded-lg"
                            >
                                <Text className="text-center font-bold text-gray-700">Close</Text>
                            </TouchableOpacity>
                        ) : (
                            <View className="gap-y-3">
                                <TouchableOpacity
                                    onPress={close}
                                    className="w-full py-4 border border-gray-300 rounded-lg"
                                >
                                    <Text className="text-center font-bold text-gray-700">Cancel</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    onPress={handleSave}
                                    className="w-full py-4 bg-blue-600 rounded-lg"
                                >
                                    <Text className="text-center font-bold text-white">
                                        Add to Cart - ${total.toFixed(2)}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>
                </ScrollView>
            </Animated.View>
        </>
    );
};

export default ModifierSidebar;
