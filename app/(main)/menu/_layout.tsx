import { Slot } from "expo-router";
import React, { createContext, useContext, useState } from "react";
import { View } from "react-native";
import MenuSidebar from "../../../components/menu/MenuSidebar";

// Sidebar Tab Types
type SidebarTab = "menus" | "categories" | "items" | "modifiers" | "schedules";

interface MenuLayoutContextType {
  activeTab: SidebarTab;
  setActiveTab: (tab: SidebarTab) => void;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
}

const MenuLayoutContext = createContext<MenuLayoutContextType | undefined>(
  undefined
);

export const useMenuLayout = () => {
  const context = useContext(MenuLayoutContext);
  if (!context) {
    throw new Error("useMenuLayout must be used within a MenuLayout");
  }
  return context;
};

export default function MenuLayout() {
  const [activeTab, setActiveTab] = useState<SidebarTab>("menus");
  const [searchQuery, setSearchQuery] = useState("");

  return (
    <MenuLayoutContext.Provider
      value={{ activeTab, setActiveTab, searchQuery, setSearchQuery }}
    >
      <View className="flex-1 bg-[#212121]">
        <View className="flex-row h-full">
          <MenuSidebar
            activeTab={activeTab}
            onTabChange={setActiveTab}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
          <View className="flex-1">
            <Slot />
          </View>
        </View>
      </View>
    </MenuLayoutContext.Provider>
  );
}
