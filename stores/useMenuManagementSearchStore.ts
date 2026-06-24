// stores/useMenuManagementSearchStore.ts
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { create } from "zustand";

type SearchSheetRef = React.RefObject<BottomSheetMethods | null>;
type SidebarTab = "menus" | "categories" | "items" | "modifiers" | "schedules";

type MenuSearchStore = {
  searchSheetRef: SearchSheetRef | null;
  setSearchSheetRef: (ref: SearchSheetRef) => void;
  clearSearchSheetRef: (ref: SearchSheetRef) => void;
  activeTab: SidebarTab;
  setActiveTab: (tab: SidebarTab) => void;
  openSearch: () => void;
  closeSearch: () => void;
};

export const useMenuManagementSearchStore = create<MenuSearchStore>((set, get) => ({
  searchSheetRef: null,
  setSearchSheetRef: (ref) => set({ searchSheetRef: ref }),
  // Only clear if the stored ref is still the one this owner registered, so a
  // stale owner unmounting after a newer owner mounted doesn't wipe the live ref.
  clearSearchSheetRef: (ref) => {
    if (get().searchSheetRef === ref) set({ searchSheetRef: null });
  },
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
