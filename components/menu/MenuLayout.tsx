import { MENU_SIDEBAR_DATA, MenuSidebarItem } from "@/lib/menu-sidebar-data";
import { useMenuStore } from "@/stores/useMenuStore";
import { usePathname, useRouter } from "expo-router";
import { Search } from "lucide-react-native";
import React, { useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

interface MenuLayoutProps {
  children: React.ReactNode;
}

const MenuLayout: React.FC<MenuLayoutProps> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { menuItems, categories, menus, modifierGroups } = useMenuStore();
  const [searchQuery, setSearchQuery] = useState("");

  const getItemCount = (itemId: string): number => {
    switch (itemId) {
      case "menus":
        return menus.length;
      case "categories":
        return categories.length;
      case "items":
        return menuItems.length;
      case "modifiers":
        return modifierGroups.length;
      case "schedules":
        return 0; // Schedules don't have a simple count
      default:
        return 0;
    }
  };

  const isActive = (href: string): boolean => {
    return pathname === href;
  };

  const handleNavigation = (item: MenuSidebarItem) => {
    if (item.href) {
      router.push(item.href);
    }
  };

  return (
    <View className="flex-1 bg-[#212121]">
      <View className="flex-row h-full">
        {/* Sidebar */}
        <View className="w-80 border-r border-gray-700 h-full bg-[#303030]">
          {/* Header */}
          <View className="p-4 border-b border-gray-700">
            <Text className="text-xl font-bold text-white">
              Menu Management
            </Text>
          </View>

          {/* Search */}
          <View className="p-4 border-b border-gray-700">
            <View className="flex-row items-center bg-[#212121] rounded-lg px-3 py-2">
              <Search size={16} color="#9CA3AF" />
              <TextInput
                className="flex-1 ml-2 text-white h-20"
                placeholder="Search items..."
                placeholderTextColor="#9CA3AF"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
            </View>
          </View>

          {/* Sidebar Navigation */}
          <View className="flex-1">
            {MENU_SIDEBAR_DATA.map((item) => (
              <TouchableOpacity
                key={item.id}
                className={`p-4 border-b border-gray-700 ${
                  isActive(item.href || "")
                    ? "bg-blue-600/20 border-blue-500"
                    : ""
                }`}
                onPress={() => handleNavigation(item)}
              >
                <View className="flex-row items-center justify-between">
                  <View className="flex-row items-center gap-3">
                    {item.icon && (
                      <item.icon
                        size={18}
                        color={
                          isActive(item.href || "") ? "#60A5FA" : "#9CA3AF"
                        }
                      />
                    )}
                    <Text
                      className={`font-medium ${
                        isActive(item.href || "")
                          ? "text-blue-400"
                          : "text-gray-300"
                      }`}
                    >
                      {item.label}
                    </Text>
                  </View>
                  {item.id !== "schedules" && (
                    <View className="bg-gray-600/30 px-2 py-1 rounded-full">
                      <Text className="text-xs text-gray-300">
                        {getItemCount(item.id)}
                      </Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Main Content */}
        <View className="flex-1">{children}</View>
      </View>
    </View>
  );
};

export default MenuLayout;
