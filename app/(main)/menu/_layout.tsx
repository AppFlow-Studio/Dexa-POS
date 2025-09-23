import MenuSearchSheet from "@/components/menu/MenuSearchSheet";
import { useMenuManagementSearchStore } from "@/stores/useMenuManagementSearchStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { Slot } from "expo-router";
import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
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
  const searchSheetRef = useRef<BottomSheetMethods>(null);
  const { setSearchSheetRef } = useMenuManagementSearchStore();
  useEffect(() => {
    if (searchSheetRef.current) {
      setSearchSheetRef(searchSheetRef);
    }
  }, [searchSheetRef]);

  return (
    <MenuLayoutContext.Provider
      value={{
        activeTab,
        setActiveTab,
        searchQuery: "",
        setSearchQuery: () => {},
      }}
    >
      <View className="flex-1 bg-[#212121]">
        <View className="flex-row h-full">
          <MenuSidebar activeTab={activeTab} onTabChange={setActiveTab} />
          <View className="flex-1">
            <Slot />
          </View>
        </View>
      </View>
      <MenuSearchSheet ref={searchSheetRef} activeTab={activeTab} />
    </MenuLayoutContext.Provider>
  );
}
