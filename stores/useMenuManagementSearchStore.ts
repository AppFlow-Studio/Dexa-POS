// stores/useMenuManagementSearchStore.ts
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { create } from "zustand";

type SearchSheetRef = React.RefObject<BottomSheetMethods | null>;
type SidebarTab = "menus" | "categories" | "items" | "modifiers" | "schedules";

type MenuSearchStore = {
  searchSheetRef: SearchSheetRef | null;
  setSearchSheetRef: (ref: SearchSheetRef) => void;
  activeTab: SidebarTab;
  setActiveTab: (tab: SidebarTab) => void;
  openSearch: () => void;
  closeSearch: () => void;
};

export const useMenuManagementSearchStore = create<MenuSearchStore>((set) => ({
  searchSheetRef: null,
  setSearchSheetRef: (ref) => set({ searchSheetRef: ref }),
  activeTab: "menus",
  setActiveTab: (tab) => set({ activeTab: tab }),
  openSearch: () => {
    const { searchSheetRef } = useMenuManagementSearchStore.getState();
    if (searchSheetRef?.current) {
      searchSheetRef.current.expand();
    }
  },
  closeSearch: () => {
    const { searchSheetRef } = useMenuManagementSearchStore.getState();
    if (searchSheetRef?.current) {
      searchSheetRef.current.close();
    }
  },
}));
