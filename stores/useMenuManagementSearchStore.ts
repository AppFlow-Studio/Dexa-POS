// stores/useMenuManagementSearchStore.ts
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { create } from "zustand";

type SearchSheetRef = React.RefObject<BottomSheetMethods | null>;

type MenuSearchStore = {
  searchSheetRef: SearchSheetRef | null;
  setSearchSheetRef: (ref: SearchSheetRef) => void;
  openSearch: () => void;
  closeSearch: () => void;
};

export const useMenuManagementSearchStore = create<MenuSearchStore>((set) => ({
  searchSheetRef: null,
  setSearchSheetRef: (ref) => set({ searchSheetRef: ref }),
  openSearch: () => {
    const { searchSheetRef } = useMenuManagementSearchStore.getState();
    // Safely access the .current property
    if (searchSheetRef?.current) {
      searchSheetRef.current.snapToIndex(0);
    }
  },
  closeSearch: () => {
    const { searchSheetRef } = useMenuManagementSearchStore.getState();
    // Safely access the .current property
    if (searchSheetRef?.current) {
      searchSheetRef.current.close();
    }
  },
}));
