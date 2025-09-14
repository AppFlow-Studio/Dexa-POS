import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { Menu, MenuItemType } from "@/lib/types";
import { useMenuStore } from "@/stores/useMenuStore";
import { Link, router } from "expo-router";
import {
    ChevronDown,
    ChevronUp,
    Clock,
    Edit,
    Eye,
    EyeOff,
    GripVertical,
    Plus,
    Settings,
    Trash2,
    Utensils
} from "lucide-react-native";
import React, { useState } from "react";
import { Alert, Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import { Gesture, GestureDetector } from "react-native-gesture-handler";
import Animated, {
    Extrapolate,
    interpolate,
    runOnJS,
    useAnimatedStyle,
    useSharedValue,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { useMenuLayout } from "./_layout";
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
// Menu Management Types
// Using Menu interface from types.ts
// Note: The store Menu interface has categories as string[] (category names)
// while the local display needs Category objects with items

interface Category {
    id: string;
    name: string;
    isActive: boolean;
    items: MenuItemType[];
    schedules: any[];
    order: number;
}

interface ExtendedModifierGroup {
    id: string;
    name: string;
    type: "required" | "optional";
    selectionType: "single" | "multiple";
    maxSelections?: number;
    description?: string;
    options: any[];
    items: MenuItemType[];
    source: "menuItem" | "store";
}


// Draggable Menu Component
interface DraggableMenuProps {
    menu: any;
    index: number;
    onReorder: (fromIndex: number, toIndex: number) => void;
    onReorderCategories: (menuId: string, fromIndex: number, toIndex: number) => void;
    onToggleActive: (menuId: string) => void;
    onSchedule: () => void;
    onEdit: () => void;
}

const DraggableMenu: React.FC<DraggableMenuProps> = ({
    menu,
    index,
    onReorder,
    onReorderCategories,
    onToggleActive,
    onSchedule,
    onEdit,
}) => {
    const translateY = useSharedValue(0);
    const scale = useSharedValue(1);
    const isDragging = useSharedValue(false);

    const panGesture = Gesture.Pan()
        .onStart(() => {
            isDragging.value = true;
            scale.value = withSpring(1.05);
        })
        .onUpdate((event) => {
            translateY.value = event.translationY;
        })
        .onEnd((event) => {
            const itemHeight = 200; // Approximate height of each menu item
            const newIndex = Math.round(index + event.translationY / itemHeight);

            if (newIndex !== index && newIndex >= 0) {
                runOnJS(onReorder)(index, newIndex);
            }

            translateY.value = withSpring(0);
            scale.value = withSpring(1);
            isDragging.value = false;
        });

    const animatedStyle = useAnimatedStyle(() => {
        const shadowOpacity = interpolate(
            scale.value,
            [1, 1.05],
            [0, 0.3],
            Extrapolate.CLAMP
        );

        return {
            transform: [
                { translateY: translateY.value },
                { scale: scale.value },
            ],
            shadowOpacity,
            elevation: isDragging.value ? 8 : 0,
            zIndex: isDragging.value ? 1000 : 1,
        };
    });

    return (
        <GestureDetector gesture={panGesture}>
            <Animated.View style={animatedStyle} className="bg-[#303030] rounded-lg border border-gray-700 p-4 mb-4">
                <View className="flex-row items-center justify-between mb-4">
                    <View className="flex-row items-center gap-3">
                        <GripVertical size={20} color="#9CA3AF" />
                        <Text className="text-2xl font-semibold text-white">
                            {menu.name}
                        </Text>
                        <View className={`px-2 py-1 rounded-full ${menu.isActive && menu.isAvailableNow ? "bg-green-900/30 border border-green-500" : "bg-red-900/30 border border-red-500"}`}>
                            <Text className={`text-xs font-medium ${menu.isActive && menu.isAvailableNow ? "text-green-400" : "text-red-400"}`}>
                                {menu.isActive ? (menu.isAvailableNow ? "Available Now" : "Unavailable Now") : "Inactive"}
                            </Text>
                        </View>
                    </View>

                    <View className="flex-row items-center gap-2">
                        <TouchableOpacity
                            onPress={onSchedule}
                            className="p-2 bg-[#212121] rounded border border-gray-600"
                        >
                            <Clock size={24} color="#9CA3AF" />
                        </TouchableOpacity>

                        <TouchableOpacity
                            onPress={() => onToggleActive(menu.id)}
                            className="p-2 bg-[#212121] rounded border border-gray-600"
                        >
                            {menu.isActive ? <Eye size={24} color="#10B981" /> : <EyeOff size={24} color="#EF4444" />}
                        </TouchableOpacity>

                        <TouchableOpacity onPress={onEdit} className="p-2 bg-[#212121] rounded border border-gray-600">
                            <Settings size={24} color="#9CA3AF" />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Categories within menu */}
                <View className="ml-6">
                    <Text className="text-sm font-medium text-gray-300 mb-2">
                        Categories ({menu.categories.length})
                    </Text>
                    <View className="gap-2">
                        {menu.categories.map((category: any, categoryIndex: number) => (
                            <DraggableMenuCategory
                                key={category.id}
                                category={category}
                                menuId={menu.id}
                                index={categoryIndex}
                                onReorder={(fromIndex, toIndex) => onReorderCategories(menu.id, fromIndex, toIndex)}
                                onToggleActive={onToggleActive}
                            />
                        ))}
                    </View>
                </View>
            </Animated.View>
        </GestureDetector>
    );
};

// Draggable Menu Category Component
interface DraggableMenuCategoryProps {
    category: any;
    menuId: string;
    index: number;
    onReorder: (fromIndex: number, toIndex: number) => void;
    onToggleActive: (categoryId: string) => void;
}

const DraggableMenuCategory: React.FC<DraggableMenuCategoryProps> = ({
    category,
    menuId,
    index,
    onReorder,
    onToggleActive,
}) => {
    const translateY = useSharedValue(0);
    const scale = useSharedValue(1);
    const isDragging = useSharedValue(false);

    const panGesture = Gesture.Pan()
        .onStart(() => {
            isDragging.value = true;
            scale.value = withSpring(1.05);
        })
        .onUpdate((event) => {
            translateY.value = event.translationY;
        })
        .onEnd((event) => {
            const itemHeight = 60; // Approximate height of each category item
            const newIndex = Math.round(index + event.translationY / itemHeight);

            if (newIndex !== index && newIndex >= 0) {
                runOnJS(onReorder)(index, newIndex);
            }

            translateY.value = withTiming(2);
            scale.value = withSpring(1);
            isDragging.value = false;
        });

    const animatedStyle = useAnimatedStyle(() => {
        const shadowOpacity = interpolate(
            scale.value,
            [1, 1.05],
            [0, 0.2],
            Extrapolate.CLAMP
        );

        return {
            transform: [
                { translateY: translateY.value },
                { scale: scale.value },
            ],
            shadowOpacity,
            elevation: isDragging.value ? 4 : 0,
            zIndex: isDragging.value ? 500 : 1,
        };
    });

    return (
        <GestureDetector gesture={panGesture}>
            <Animated.View style={animatedStyle} className="flex-row items-center justify-between bg-[#212121] p-3 rounded border border-gray-700">
                <View className="flex-row items-center gap-2">
                    <GripVertical size={16} color="#6B7280" />
                    <Text className="text-gray-200">{category.name}</Text>
                    <View className={`px-2 py-1 rounded-full ${category.isActive ? "bg-green-900/30 border border-green-500" : "bg-red-900/30 border border-red-500"}`}>
                        <Text className={`text-xs ${category.isActive ? "text-green-400" : "text-red-400"}`}>
                            {category.isActive ? "Available Now" : "Unavailable"}
                        </Text>
                    </View>
                </View>

                <View className="flex-row items-center gap-1">
                    <TouchableOpacity
                        onPress={() => onToggleActive(category.id)}
                        className="p-1"
                    >
                        {category.isActive ? <Eye size={14} color="#10B981" /> : <EyeOff size={14} color="#EF4444" />}
                    </TouchableOpacity>
                </View>
            </Animated.View>
        </GestureDetector>
    );
};

const MenuPage: React.FC = () => {
    const { menuItems, categories: storeCategories, menus: storeMenus, modifierGroups: storeModifierGroups, deleteMenuItem, toggleItemAvailability, getItemsInCategory, getMenuItems, toggleMenuActive, toggleCategoryActive, isMenuAvailableNow, isCategoryAvailableNow, updateMenu, getItemPriceForCategory } = useMenuStore();
    const { activeTab, searchQuery } = useMenuLayout();

    const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
    const [selectedCategory, setSelectedCategory] = useState<Category | null>(null);
    const [showScheduleModal, setShowScheduleModal] = useState(false);
    const [expandedCategories, setExpandedCategories] = useState<Record<string, boolean>>({});
    const [scheduleViewType, setScheduleViewType] = useState<"menus" | "categories">("menus");

    // Convert store menus to display format
    const menus = storeMenus.map(storeMenu => ({
        ...storeMenu,
        // Add display properties for compatibility
        categories: storeMenu.categories.map(categoryName => {
            const category = storeCategories.find(cat => cat.name === categoryName);
            return {
                id: category?.id || `cat_${categoryName}`,
                name: categoryName,
                isActive: (category?.isActive ?? true) && isCategoryAvailableNow(categoryName),
                items: getItemsInCategory(categoryName),
                schedules: [],
                order: category?.order || 1
            };
        }),
        schedules: storeMenu.schedules || [],
        // Add computed availability
        isAvailableNow: isMenuAvailableNow(storeMenu.id)
    }));

    // Get unique categories from menu items (flatten arrays)
    const categories = Array.from(new Set(menuItems.flatMap(item =>
        Array.isArray(item.category) ? item.category : [item.category]
    ))).sort();

    // Get unique meals
    const meals = Array.from(new Set(menuItems.flatMap(item => item.meal))).sort();

    // Get unique modifier groups from both menu items and store
    const menuItemModifierGroups: ExtendedModifierGroup[] = Array.from(new Set(
        menuItems.flatMap(item =>
            item.modifiers?.map(modifier => modifier.id) || []
        )
    )).map(modifierId => {
        const modifier = menuItems.find(item =>
            item.modifiers?.some(m => m.id === modifierId)
        )?.modifiers?.find(m => m.id === modifierId);

        const itemsUsingModifier = menuItems.filter(item =>
            item.modifiers?.some(m => m.id === modifierId)
        );

        return {
            id: modifierId,
            name: modifier?.name || modifierId,
            type: modifier?.type || "optional",
            selectionType: modifier?.selectionType || "single",
            description: modifier?.description,
            options: modifier?.options || [],
            items: itemsUsingModifier,
            source: "menuItem" as const
        };
    });

    // Get modifier groups from store
    const storeModifierGroupsData: ExtendedModifierGroup[] = storeModifierGroups.map(modifierGroup => {
        const itemsUsingModifier = menuItems.filter(item =>
            item.modifiers?.some(m => m.id === modifierGroup.id)
        );

        return {
            ...modifierGroup,
            items: itemsUsingModifier,
            source: "store" as const
        };
    });

    // Combine and deduplicate modifier groups
    const allModifierGroups = [...menuItemModifierGroups, ...storeModifierGroupsData];
    const uniqueModifierGroups = allModifierGroups.reduce((acc: ExtendedModifierGroup[], current) => {
        const existing = acc.find(item => item.id === current.id);
        if (!existing) {
            acc.push(current);
        } else {
            // Merge items from both sources
            const combinedItems = [...new Set([...existing.items, ...current.items])];
            existing.items = combinedItems;
        }
        return acc;
    }, []);

    const modifierGroups: ExtendedModifierGroup[] = uniqueModifierGroups.sort((a, b) => a.name.localeCompare(b.name));

    // Filter menu items based on search
    const filteredItems = menuItems.filter(item => {
        const matchesSearch = !searchQuery ||
            item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
            item.description?.toLowerCase().includes(searchQuery.toLowerCase());
        return matchesSearch;
    });

    const handleAddMenu = () => {
        router.push("/menu/add-menu");
    };

    const handleAddCategory = () => {
        router.push("/menu/add-category");
    };

    const handleAddItem = () => {
        router.push("/menu/add-item");
    };

    const handleEditItem = (item: MenuItemType) => {
        router.push(`/menu/edit-item?itemId=${item.id}`);
    };

    const handleDeleteItem = (id: string) => {
        Alert.alert(
            "Delete Item",
            "Are you sure you want to delete this item?",
            [
                { text: "Cancel", style: "cancel" },
                { text: "Delete", style: "destructive", onPress: () => deleteMenuItem(id) }
            ]
        );
    };

    const handleToggleAvailability = (id: string) => {
        toggleItemAvailability(id);
    };

    const handleToggleMenuActive = (menuId: string) => {
        toggleMenuActive(menuId);
    };

    const handleToggleCategoryActive = (categoryId: string) => {
        toggleCategoryActive(categoryId);
    };

    const handleReorderMenus = (fromIndex: number, toIndex: number) => {
        // For now, we'll just reorder in the display
        // In a real implementation, you'd want to persist this order
        console.log(`Reorder menu from ${fromIndex} to ${toIndex}`);
    };

    const handleReorderMenuCategories = (menuId: string, fromIndex: number, toIndex: number) => {
        const menu = storeMenus.find(m => m.id === menuId);
        if (!menu) return;

        const newCategories = [...menu.categories];
        const [movedCategory] = newCategories.splice(fromIndex, 1);
        newCategories.splice(toIndex, 0, movedCategory);

        updateMenu(menuId, { categories: newCategories });
    };


    const renderMenusContent = () => (
        <View className="flex-1 p-6 bg-[#212121]">
            <View className="flex-row justify-between items-center mb-6">
                <Text className="text-2xl font-bold text-white">Menus</Text>
                <TouchableOpacity
                    onPress={handleAddMenu}
                    className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
                >
                    <Plus size={16} color="white" />
                    <Text className="text-white font-medium ml-2">Add Menu</Text>
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1">
                <View className="gap-4">
                    {menus.map((menu, index) => (
                        <DraggableMenu
                            key={menu.id}
                            menu={menu}
                            index={index}
                            onReorder={handleReorderMenus}
                            onReorderCategories={handleReorderMenuCategories}
                            onToggleActive={handleToggleMenuActive}
                            onSchedule={() => {
                                // Find the original menu from storeMenus to avoid type issues
                                const originalMenu = storeMenus.find(m => m.id === menu.id);
                                if (originalMenu) {
                                    setSelectedMenu(originalMenu);
                                    setScheduleViewType("menus");
                                    setShowScheduleModal(true);
                                }
                            }}
                            onEdit={() => router.push(`/menu/edit-menu?id=${menu.id}`)}
                        />
                    ))}
                </View>
            </ScrollView>
        </View>
    );

    const renderCategoriesContent = () => (
        <View className="flex-1 p-6 bg-[#212121]">
            <View className="flex-row justify-between items-center mb-6">
                <Text className="text-2xl font-bold text-white">Categories</Text>
                <TouchableOpacity
                    onPress={handleAddCategory}
                    className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
                >
                    <Plus size={16} color="white" />
                    <Text className="text-white font-medium ml-2">Add Category</Text>
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1">
                <View className="gap-3">
                    {categories.map((categoryName) => {
                        const categoryItems = getItemsInCategory(categoryName);
                        const isExpanded = !!expandedCategories[categoryName];
                        return (
                            <View key={categoryName} className="bg-[#303030] rounded-lg border border-gray-700 p-4">
                                <View className="flex-row justify-between items-center">
                                    <TouchableOpacity
                                        onPress={() => setExpandedCategories(prev => ({ ...prev, [categoryName]: !isExpanded }))}
                                        className="flex-row items-center gap-3 flex-1"
                                    >
                                        {isExpanded ? <ChevronUp size={18} color="#9CA3AF" /> : <ChevronDown size={18} color="#9CA3AF" />}
                                        {/* <GripVertical size={24} color="#9CA3AF" /> */}
                                        <Text className="font-medium text-white text-2xl">{categoryName}</Text>
                                        <View className="bg-blue-900/30 border border-blue-500 px-2 py-1 rounded">
                                            <Text className="text-xs text-blue-400">{categoryItems.length} items</Text>
                                        </View>
                                    </TouchableOpacity>

                                    <View className="flex-row items-center gap-2">
                                        <TouchableOpacity className="p-2 bg-[#212121] rounded border border-gray-600">
                                            <Clock size={24} color="#9CA3AF" />
                                        </TouchableOpacity>
                                        <TouchableOpacity className="p-2 bg-[#212121] rounded border border-gray-600">
                                            <Eye size={24} color="#10B981" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            onPress={() => {
                                                const cat = storeCategories.find(c => c.name === categoryName);
                                                if (cat) router.push(`/menu/edit-category?id=${cat.id}`);
                                            }}
                                            className="p-2 bg-[#212121] rounded border border-gray-600"
                                        >
                                            <Settings size={20} color="#9CA3AF" />
                                        </TouchableOpacity>
                                    </View>
                                </View>

                                {isExpanded && (
                                    <View className="mt-4 gap-2">
                                        {categoryItems.length === 0 ? (
                                            <Text className="text-gray-400 text-sm">No items in this category.</Text>
                                        ) : (
                                            <View className="gap-2 flex flex-row flex-wrap">
                                                {categoryItems.map((item) => {
                                                    const category = storeCategories.find(c => c.name === categoryName);
                                                    const categoryPrice = category ? getItemPriceForCategory(item.id, category.id) : item.price;
                                                    const hasCustomPricing = item.customPricing && item.customPricing.some(p => p.categoryId === category?.id && p.isActive);

                                                    return (
                                                        <View key={item.id} className="flex-row items-center justify-between bg-[#212121] border border-gray-700 rounded-lg px-3 py-2">
                                                            <View className="flex-row items-center gap-2 flex-1">
                                                                <Text className="text-white text-sm">{item.name}</Text>
                                                                {hasCustomPricing && (
                                                                    <View className="bg-yellow-900/30 border border-yellow-500 px-1 py-0.5 rounded">
                                                                        <Text className="text-yellow-400 text-xs">Custom</Text>
                                                                    </View>
                                                                )}
                                                            </View>
                                                            <View className="flex-row items-center gap-2">
                                                                <Text className={`text-sm ${hasCustomPricing ? 'text-yellow-400' : 'text-gray-300'}`}>
                                                                    ${categoryPrice.toFixed(2)}
                                                                </Text>
                                                                {hasCustomPricing && (
                                                                    <Text className="text-gray-500 text-xs line-through">
                                                                        ${item.price.toFixed(2)}
                                                                    </Text>
                                                                )}
                                                            </View>
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        )}
                                    </View>
                                )}
                            </View>
                        );
                    })}
                </View>
            </ScrollView>
        </View>
    );

    const renderItemsContent = () => (
        <View className="flex-1 p-6 bg-[#212121]">
            <View className="flex-row justify-between items-center mb-6">
                <Text className="text-2xl font-bold text-white">
                    Menu Items ({filteredItems.length})
                </Text>
                <TouchableOpacity
                    onPress={handleAddItem}
                    className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
                >
                    <Plus size={16} color="white" />
                    <Text className="text-white font-medium ml-2">Add Item</Text>
                </TouchableOpacity>
            </View>

            {filteredItems.length === 0 ? (
                <View className="flex-1 items-center justify-center">
                    <Text className="text-gray-400 text-center">
                        No menu items found matching your criteria.
                    </Text>
                </View>
            ) : (
                <ScrollView className="flex-1">
                    <View className="gap-4 flex-row flex-wrap">
                        {filteredItems.map((item, index) => {
                            return (
                                <View className="w-[49%]" key={index}>
                                    <MenuItemCard
                                        key={item.id}
                                        item={item}
                                        onEdit={handleEditItem}
                                        onDelete={handleDeleteItem}
                                        onToggleAvailability={handleToggleAvailability}
                                    />
                                </View>
                            )
                        })}
                    </View>
                </ScrollView>
            )}
        </View>
    );

    const renderModifiersContent = () => (
        <View className="flex-1 p-6 bg-[#212121]">
            <View className="flex-row justify-between items-center mb-6">
                <Text className="text-2xl font-bold text-white">Modifier Groups</Text>
                <TouchableOpacity
                    onPress={() => router.push("/menu/add-modifier")}
                    className="flex-row items-center bg-blue-600 px-4 py-2 rounded-lg"
                >
                    <Plus size={16} color="white" />
                    <Text className="text-white font-medium ml-2">Add Modifier Group</Text>
                </TouchableOpacity>
            </View>

            <ScrollView className="flex-1">
                <View className="gap-4">
                    {modifierGroups.map((modifierGroup) => (
                        <View key={modifierGroup.id} className="bg-[#303030] rounded-lg border border-gray-700 p-4">
                            <View className="flex-row items-center justify-between mb-4">
                                <View className="flex-row items-center gap-3">
                                    <GripVertical size={20} color="#9CA3AF" />
                                    <Text className="text-lg font-semibold text-white">
                                        {modifierGroup.name}
                                    </Text>
                                    <View className={`px-2 py-1 rounded-full ${modifierGroup.type === "required" ? "bg-red-900/30 border border-red-500" : "bg-blue-900/30 border border-blue-500"}`}>
                                        <Text className={`text-xs font-medium ${modifierGroup.type === "required" ? "text-red-400" : "text-blue-400"}`}>
                                            {modifierGroup.type === "required" ? "Required" : "Optional"}
                                        </Text>
                                    </View>
                                    <View className="bg-gray-600/30 border border-gray-500 px-2 py-1 rounded-full">
                                        <Text className="text-xs text-gray-300">
                                            {modifierGroup.selectionType === "single" ? "Single" : "Multiple"}
                                        </Text>
                                    </View>
                                    <View className={`px-2 py-1 rounded-full ${modifierGroup.source === "store" ? "bg-green-900/30 border border-green-500" : "bg-yellow-900/30 border border-yellow-500"}`}>
                                        <Text className={`text-xs ${modifierGroup.source === "store" ? "text-green-400" : "text-yellow-400"}`}>
                                            {modifierGroup.source === "store" ? "Custom" : "Built-in"}
                                        </Text>
                                    </View>
                                </View>

                                <View className="flex-row items-center gap-2">
                                    <Link href={`/menu/edit-modifier?id=${modifierGroup.id}`} asChild className="p-2 bg-[#212121] rounded border border-gray-600">
                                        <Settings size={16} color="#9CA3AF" />
                                    </Link>
                                </View>
                            </View>

                            {/* Modifier Options */}
                            <View className="mb-4">
                                <Text className="text-sm font-medium text-gray-300 mb-2">
                                    Options ({modifierGroup.options.length})
                                </Text>
                                <View className="flex-row flex-wrap gap-2">
                                    {modifierGroup.options.slice(0, 5).map((option, index) => (
                                        <View key={index} className="bg-[#212121] border border-gray-600 px-3 py-2 rounded-lg">
                                            <Text className="text-gray-200 text-sm">
                                                {option.name}
                                                {option.price > 0 && (
                                                    <Text className="text-green-400"> (+${option.price.toFixed(2)})</Text>
                                                )}
                                            </Text>
                                        </View>
                                    ))}
                                    {modifierGroup.options.length > 5 && (
                                        <View className="bg-[#212121] border border-gray-600 px-3 py-2 rounded-lg">
                                            <Text className="text-gray-400 text-sm">
                                                +{modifierGroup.options.length - 5} more
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>

                            {/* Items using this modifier */}
                            <View className="ml-6">
                                <Text className="text-sm font-medium text-gray-300 mb-2">
                                    Used by Items ({modifierGroup.items.length})
                                </Text>
                                <View className="gap-2">
                                    {modifierGroup.items.slice(0, 3).map((item) => (
                                        <View key={item.id} className="flex-row items-center justify-between bg-[#212121] p-3 rounded border border-gray-700">
                                            <View className="flex-row items-center gap-3">
                                                <View className="w-8 h-8 rounded border border-gray-600 overflow-hidden">
                                                    {getImageSource(item.image) ? (
                                                        <Image
                                                            source={typeof getImageSource(item.image) === "string" ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP] : getImageSource(item.image)}
                                                            className="w-full h-full object-cover"
                                                        />
                                                    ) : (
                                                        <View className="w-full h-full bg-gray-600 items-center justify-center">
                                                            <Utensils color="#9ca3af" size={16} />
                                                        </View>
                                                    )}
                                                </View>
                                                <View>
                                                    <Text className="text-gray-200 font-medium">{item.name}</Text>
                                                    <Text className="text-gray-400 text-xs">
                                                        {Array.isArray(item.category) ? item.category.join(", ") : item.category} • ${item.price.toFixed(2)}
                                                    </Text>
                                                </View>
                                            </View>
                                            <View className={`px-2 py-1 rounded-full ${item.availability !== false ? "bg-green-900/30 border border-green-500" : "bg-red-900/30 border border-red-500"}`}>
                                                <Text className={`text-xs ${item.availability !== false ? "text-green-400" : "text-red-400"}`}>
                                                    {item.availability !== false ? "Available" : "Unavailable"}
                                                </Text>
                                            </View>
                                        </View>
                                    ))}
                                    {modifierGroup.items.length > 3 && (
                                        <View className="bg-[#212121] p-3 rounded border border-gray-700 items-center">
                                            <Text className="text-gray-400 text-sm">
                                                +{modifierGroup.items.length - 3} more items use this modifier
                                            </Text>
                                        </View>
                                    )}
                                </View>
                            </View>
                        </View>
                    ))}
                </View>
            </ScrollView>
        </View>
    );

    const renderSchedulesContent = () => (
        <View className="flex-1 p-6 bg-[#212121]">
            <View className="flex-row items-center justify-between mb-6">
                <Text className="text-2xl font-bold text-white">Schedules</Text>
                <View className="flex-row bg-[#303030] border border-gray-600 rounded-lg p-1">
                    <TouchableOpacity
                        onPress={() => setScheduleViewType("menus")}
                        className={`px-4 py-2 rounded-md ${scheduleViewType === "menus" ? "bg-blue-600" : ""}`}
                    >
                        <Text className={`font-medium ${scheduleViewType === "menus" ? "text-white" : "text-gray-300"}`}>
                            Menus
                        </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        onPress={() => setScheduleViewType("categories")}
                        className={`px-4 py-2 rounded-md ${scheduleViewType === "categories" ? "bg-blue-600" : ""}`}
                    >
                        <Text className={`font-medium ${scheduleViewType === "categories" ? "text-white" : "text-gray-300"}`}>
                            Categories
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>
            <ScrollView className="flex-1">
                <View className="gap-4">
                    {scheduleViewType === "menus" ? (
                        menus.map((menu) => (
                            <View key={menu.id} className="bg-[#303030] rounded-lg border border-gray-700 p-4">
                                <View className="flex-row items-center justify-between mb-2">
                                    <Text className="text-white font-semibold">{menu.name}</Text>
                                    <View className={`px-2 py-1 rounded-full ${menu.isActive && menu.isAvailableNow ? "bg-green-900/30 border border-green-500" : "bg-red-900/30 border border-red-500"}`}>
                                        <Text className={`text-xs ${menu.isActive && menu.isAvailableNow ? "text-green-400" : "text-red-400"}`}>
                                            {menu.isActive ? (menu.isAvailableNow ? "Available Now" : "Unavailable Now") : "Inactive"}
                                        </Text>
                                    </View>
                                </View>
                                {(menu.schedules ?? []).length === 0 ? (
                                    <View>
                                        <Text className="text-gray-400">Always available (no schedule rules)</Text>
                                    </View>
                                ) : (
                                    <View className="gap-2">
                                        {menu.schedules!.map((r) => (
                                            <View key={r.id} className="flex-row justify-between bg-[#212121] p-3 rounded border border-gray-700">
                                                <Text className="text-gray-200">{r.name || r.id}</Text>
                                                <Text className="text-gray-400">{r.days.join(", ")} • {r.startTime} - {r.endTime}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                                <View className="mt-3">
                                    <TouchableOpacity onPress={() => router.push(`/menu/edit-menu?id=${menu.id}`)} className="self-start px-3 py-2 rounded-lg bg-blue-600">
                                        <Text className="text-white">Edit Schedules</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))
                    ) : (
                        storeCategories.map((category) => (
                            <View key={category.id} className="bg-[#303030] rounded-lg border border-gray-700 p-4">
                                <View className="flex-row items-center justify-between mb-2">
                                    <Text className="text-white font-semibold">{category.name}</Text>
                                    <View className={`px-2 py-1 rounded-full ${category.isActive && isCategoryAvailableNow(category.name) ? "bg-green-900/30 border border-green-500" : "bg-red-900/30 border border-red-500"}`}>
                                        <Text className={`text-xs ${category.isActive && isCategoryAvailableNow(category.name) ? "text-green-400" : "text-red-400"}`}>
                                            {category.isActive ? (isCategoryAvailableNow(category.name) ? "Available Now" : "Unavailable Now") : "Inactive"}
                                        </Text>
                                    </View>
                                </View>
                                {(category.schedules ?? []).length === 0 ? (
                                    <View>
                                        <Text className="text-gray-400">Always available (no schedule rules)</Text>
                                    </View>
                                ) : (
                                    <View className="gap-2">
                                        {category.schedules!.map((r) => (
                                            <View key={r.id} className="flex-row justify-between bg-[#212121] p-3 rounded border border-gray-700">
                                                <Text className="text-gray-200">{r.name || r.id}</Text>
                                                <Text className="text-gray-400">{r.days.join(", ")} • {r.startTime} - {r.endTime}</Text>
                                            </View>
                                        ))}
                                    </View>
                                )}
                                <View className="mt-3">
                                    <TouchableOpacity onPress={() => router.push(`/menu/edit-category?id=${category.id}`)} className="self-start px-3 py-2 rounded-lg bg-blue-600">
                                        <Text className="text-white">Edit Schedules</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        ))
                    )}
                </View>
            </ScrollView>
        </View>
    );

    const renderContent = () => {
        switch (activeTab) {
            case "menus":
                return renderMenusContent();
            case "categories":
                return renderCategoriesContent();
            case "items":
                return renderItemsContent();
            case "modifiers":
                return renderModifiersContent();
            case "schedules":
                return renderSchedulesContent();
            default:
                return null;
        }
    };


    return (
        <View className="flex-1 bg-[#212121]">
            {renderContent()}
        </View>
    );
};

// Menu Item Card Component
interface MenuItemCardProps {
    item: MenuItemType;
    onEdit: (item: MenuItemType) => void;
    onDelete: (id: string) => void;
    onToggleAvailability: (id: string) => void;
}


const MenuItemCard: React.FC<MenuItemCardProps> = ({
    item,
    onEdit,
    onDelete,
    onToggleAvailability,
}) => {
    return (
        <View className="bg-[#303030] max-h-44 rounded-lg border border-gray-700 p-4">
            <View className="flex-row items-start gap-4">
                <View className="h-full aspect-square rounded-lg border">
                    {getImageSource(item.image) ? (
                        <Image
                            source={typeof getImageSource(item.image) === "string" ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP] : getImageSource(item.image)}
                            className="w-full h-full rounded-lg object-cover"
                        />
                    ) :
                        (
                            <View className="w-full h-full rounded-lg bg-gray-100 items-center justify-center">
                                <Utensils color="#9ca3af" size={32} />
                            </View>
                        )}
                </View>
                <View className="flex-1">
                    <View className="flex-row items-center gap-2 mb-2">
                        {/* <GripVertical size={16} color="#6B7280" /> */}
                        <Text className="text-lg font-semibold text-white">
                            {item.name}
                        </Text>
                        <TouchableOpacity
                            onPress={() => onToggleAvailability(item.id)}
                            className="p-1"
                        >
                            {item.availability !== false ? (
                                <Eye size={16} color="#10B981" />
                            ) : (
                                <EyeOff size={16} color="#EF4444" />
                            )}
                        </TouchableOpacity>
                    </View>

                    {item.description && (
                        <Text className="text-gray-300 text-sm mb-2">
                            {item.description.length > 45 ? item.description.substring(0, 45) + "..." : item.description}
                        </Text>
                    )}

                    <View className="flex-row gap-4">
                        <Text className="text-sm text-gray-400">
                            Categories: {Array.isArray(item.category) ? item.category.join(", ") : item.category}
                        </Text>
                        <Text className="text-sm text-gray-400">
                            Price: ${item.price.toFixed(2)}
                        </Text>
                    </View>

                    {/* Custom Pricing Info */}
                    {item.customPricing && item.customPricing.length > 0 && (
                        <View className="mt-2">
                            <Text className="text-xs text-yellow-400 mb-1">
                                Custom Pricing: {item.customPricing.filter(p => p.isActive).length} active rules
                            </Text>
                            <View className="flex-row flex-wrap gap-1">
                                {item.customPricing.slice(0, 2).map((pricing) => (
                                    <View key={pricing.id} className="bg-yellow-900/30 border border-yellow-500 px-2 py-1 rounded">
                                        <Text className="text-xs text-yellow-400">
                                            {pricing.categoryName}: ${pricing.price.toFixed(2)}
                                        </Text>
                                    </View>
                                ))}
                                {item.customPricing.length > 2 && (
                                    <View className="bg-gray-600/30 border border-gray-500 px-2 py-1 rounded">
                                        <Text className="text-xs text-gray-400">
                                            +{item.customPricing.length - 2} more
                                        </Text>
                                    </View>
                                )}
                            </View>
                        </View>
                    )}

                    <View className="flex-row gap-2 mt-2">
                        {item.meal.map((meal, index) => (
                            <View key={index} className="bg-blue-900/30 border border-blue-500 px-2 py-1 rounded">
                                <Text className="text-xs text-blue-400">{meal}</Text>
                            </View>
                        ))}
                    </View>
                </View>

                <View className="flex-row gap-2 ml-4">
                    <TouchableOpacity
                        onPress={() => onEdit(item)}
                        className="p-2 bg-blue-900/30 border border-blue-500 rounded"
                    >
                        <Edit size={16} color="#60A5FA" />
                    </TouchableOpacity>

                    <TouchableOpacity
                        onPress={() => onDelete(item.id)}
                        className="p-2 bg-red-900/30 border border-red-500 rounded"
                    >
                        <Trash2 size={16} color="#F87171" />
                    </TouchableOpacity>
                </View>
            </View>
        </View>
    );
};

export default MenuPage;