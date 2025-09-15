import { useMenuStore } from "@/stores/useMenuStore";
import { router, usePathname } from "expo-router";
import {
    ChevronRight,
    Plus,
    Search,
} from "lucide-react-native";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";
import { Button } from "@/components/ui/button";

// Sidebar Tab Types
type SidebarTab = "menus" | "categories" | "items" | "modifiers" | "schedules";

interface MenuSidebarProps {
    searchQuery?: string;
    onSearchChange?: (query: string) => void;
    activeTab?: SidebarTab;
    onTabChange?: (tab: SidebarTab) => void;
}

const MenuSidebar: React.FC<MenuSidebarProps> = ({
    searchQuery: externalSearchQuery,
    onSearchChange,
    activeTab: externalActiveTab,
    onTabChange,
}) => {
    const { menuItems, categories: storeCategories, menus: storeMenus, modifierGroups } = useMenuStore();
    const [internalSearchQuery, setInternalSearchQuery] = useState("");
    const pathname = usePathname();

    // Use external search query if provided, otherwise use internal
    const searchQuery = externalSearchQuery !== undefined ? externalSearchQuery : internalSearchQuery;
    const handleSearchChange = onSearchChange || setInternalSearchQuery;

    // Determine active tab based on current route or external prop
    const getActiveTab = (): SidebarTab => {
        if (pathname.includes("/menu/add-menu") || pathname.includes("/menu/edit-menu")) {
            return "menus";
        }
        if (pathname.includes("/menu/add-category") || pathname.includes("/menu/edit-category")) {
            return "categories";
        }
        if (pathname.includes("/menu/add-item") || pathname.includes("/menu/edit-item")) {
            return "items";
        }
        if (pathname.includes("/menu/add-modifier") || pathname.includes("/menu/edit-modifier")) {
            return "modifiers";
        }
        if (pathname.includes("/menu") && pathname.endsWith("/menu")) {
            return "menus"; // Default to menus for main menu page
        }
        return "menus";
    };

    // Use external activeTab if provided, otherwise determine from route
    const activeTab = externalActiveTab !== undefined ? externalActiveTab : getActiveTab();

    // Convert store menus to display format
    const menus = storeMenus.map(storeMenu => ({
        ...storeMenu,
        categories: storeMenu.categories.map(categoryName => {
            const category = storeCategories.find(cat => cat.name === categoryName);
            return {
                id: category?.id || `cat_${categoryName}`,
                name: categoryName,
                isActive: category?.isActive ?? true,
                items: [],
                schedules: [],
                order: category?.order || 1
            };
        }),
        schedules: storeMenu.schedules || [],
    }));

    // Get unique categories from menu items
    const categories = Array.from(new Set(menuItems.flatMap(item =>
        Array.isArray(item.category) ? item.category : [item.category]
    ))).sort();

    const handleTabPress = (tab: SidebarTab) => {
        // If onTabChange is provided, use it (for main menu page)
        if (onTabChange) {
            if(pathname.includes('/menu/') && pathname.split('/').length > 2){
                router.push(`/menu`);
            }
            onTabChange(tab);
            return;
        }

        // Otherwise, navigate to the main menu page (for other screens)
        router.push("/menu");
    };

    const handleAddPress = () => {
        switch (activeTab) {
            case "menus":
                router.push("/menu/add-menu");
                break;
            case "categories":
                router.push("/menu/add-category");
                break;
            case "items":
                router.push("/menu/add-item");
                break;
            case "modifiers":
                router.push("/menu/add-modifier");
                break;
            default:
                break;
        }
    };

    return (
        <View className="w-80 border-r border-gray-700 h-full bg-[#303030]">
            {/* Header */}
            <View className="p-4 border-b border-gray-700 flex-row items-center justify-between">
                <Text className="text-xl font-bold text-white">Menu Management</Text>
                <TouchableOpacity
                    onPress={handleAddPress}
                    className="p-2 bg-blue-600 rounded-lg"
                >
                    <Plus size={16} color="white" />
                </TouchableOpacity>
            </View>

            {/* Search */}
            <View className="p-4 border-b border-gray-700">
                <View className="flex-row items-center bg-[#212121] rounded-lg px-3 py-2">
                    <Search size={16} color="#9CA3AF" />
                    <TextInput
                        className="flex-1 ml-2 text-white"
                        placeholder="Search items..."
                        placeholderTextColor="#9CA3AF"
                        value={searchQuery}
                        onChangeText={handleSearchChange}
                    />
                </View>
            </View>

            {/* Sidebar Tabs */}
            <View className="flex-1 flex flex-col gap-y-2">
                <Button
                    className={`p-4 border-b border-gray-700 ${activeTab === "menus" ? "bg-blue-600/20 border-blue-500" : ""}`}
                    onPress={() => handleTabPress("menus")}
                >
                    <View className="flex-row items-center justify-between">
                        <Text className={`font-medium ${activeTab === "menus" ? "text-blue-400" : "text-gray-300"}`}>
                            Menus ({menus.length})
                        </Text>
                        <ChevronRight size={16} color="#9CA3AF" />
                    </View>
                </Button>

                <Button
                    className={`p-4 border-b border-gray-700 ${activeTab === "categories" ? "bg-blue-600/20 border-blue-500" : ""}`}
                    onPress={() => handleTabPress("categories")}
                >
                    <View className="flex-row items-center justify-between">
                        <Text className={`font-medium ${activeTab === "categories" ? "text-blue-400" : "text-gray-300"}`}>
                            Categories ({categories.length})
                        </Text>
                        <ChevronRight size={16} color="#9CA3AF" />
                    </View>
                </Button>

                <Button
                    className={`p-4 border-b border-gray-700 ${activeTab === "items" ? "bg-blue-600/20 border-blue-500" : ""}`}
                    onPress={() => handleTabPress("items")}
                >
                    <View className="flex-row items-center justify-between">
                        <Text className={`font-medium ${activeTab === "items" ? "text-blue-400" : "text-gray-300"}`}>
                            Items ({menuItems.length})
                        </Text>
                        <ChevronRight size={16} color="#9CA3AF" />
                    </View>
                </Button>

                <Button
                    className={`p-4 border-b border-gray-700 ${activeTab === "modifiers" ? "bg-blue-600/20 border-blue-500" : ""}`}
                    onPress={() => handleTabPress("modifiers")}
                >
                    <View className="flex-row items-center justify-between">
                        <Text className={`font-medium ${activeTab === "modifiers" ? "text-blue-400" : "text-gray-300"}`}>
                            Modifiers ({modifierGroups.length})
                        </Text>
                        <ChevronRight size={16} color="#9CA3AF" />
                    </View>
                </Button>

                <Button
                    className={`p-4 border-b border-gray-700 ${activeTab === "schedules" ? "bg-blue-600/20 border-blue-500" : ""}`}
                    onPress={() => handleTabPress("schedules")}
                >
                    <View className="flex-row items-center justify-between">
                        <Text className={`font-medium ${activeTab === "schedules" ? "text-blue-400" : "text-gray-300"}`}>
                            Schedules
                        </Text>
                        <ChevronRight size={16} color="#9CA3AF" />
                    </View>
                </Button>
            </View>
        </View>
    );
};

export default MenuSidebar;
