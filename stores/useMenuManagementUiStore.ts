/**
 * View state for the menu management screen.
 *
 * Lives outside the screen because `app/(main)/menu/_layout.tsx` renders its
 * routes through a `<Slot/>`: opening an edit screen unmounts the index screen,
 * so any `useState` there is lost on the way back. Keeping the tab, the
 * selected entity per tab and the item filters here means returning from
 * "Edit item" lands on the same tab, with the same thing selected and the same
 * search still applied.
 *
 * Not persisted — a fresh app start begins on Menus.
 */
import { create } from "zustand";

export type MenuManagementTab =
  | "menus"
  | "categories"
  | "items"
  | "modifiers"
  | "schedules";

export type ItemStatusFilter = "all" | "available" | "hidden" | "86";

type MenuManagementUiState = {
  activeTab: MenuManagementTab;
  selectedMenuId: string | null;
  selectedCategoryId: string | null;
  selectedModifierId: string | null;
  /**
   * The menu a category was opened from. While set, item prices edited in that
   * category's detail are that menu's prices (level 5), as they were when the
   * old screen nested categories under menus. Picking a category from the list
   * clears it, and prices go back to the category level.
   */
  categoryMenuContextId: string | null;
  itemStatusFilter: ItemStatusFilter;
  itemSearch: string;
  categorySearch: string;
  modifierSearch: string;
  scheduleView: "menus" | "categories";

  setActiveTab: (tab: MenuManagementTab) => void;
  selectMenu: (id: string | null) => void;
  selectCategory: (id: string | null) => void;
  selectModifier: (id: string | null) => void;
  /** Jump to the Categories tab with a category open (from a menu's detail). */
  openCategory: (id: string, fromMenuId?: string) => void;
  clearCategoryMenuContext: () => void;
  /** Jump to the Menus tab with a menu open (from a category's detail). */
  openMenu: (id: string) => void;
  setItemStatusFilter: (filter: ItemStatusFilter) => void;
  setItemSearch: (text: string) => void;
  setCategorySearch: (text: string) => void;
  setModifierSearch: (text: string) => void;
  setScheduleView: (view: "menus" | "categories") => void;
};

export const useMenuManagementUiStore = create<MenuManagementUiState>(
  (set) => ({
    activeTab: "menus",
    selectedMenuId: null,
    selectedCategoryId: null,
    selectedModifierId: null,
    categoryMenuContextId: null,
    itemStatusFilter: "all",
    itemSearch: "",
    categorySearch: "",
    modifierSearch: "",
    scheduleView: "menus",

    setActiveTab: (activeTab) => set({ activeTab }),
    selectMenu: (selectedMenuId) => set({ selectedMenuId }),
    selectCategory: (selectedCategoryId) =>
      set({ selectedCategoryId, categoryMenuContextId: null }),
    selectModifier: (selectedModifierId) => set({ selectedModifierId }),
    openCategory: (id, fromMenuId) =>
      set({
        activeTab: "categories",
        selectedCategoryId: id,
        categoryMenuContextId: fromMenuId ?? null,
      }),
    clearCategoryMenuContext: () => set({ categoryMenuContextId: null }),
    openMenu: (id) => set({ activeTab: "menus", selectedMenuId: id }),
    setItemStatusFilter: (itemStatusFilter) => set({ itemStatusFilter }),
    setItemSearch: (itemSearch) => set({ itemSearch }),
    setCategorySearch: (categorySearch) => set({ categorySearch }),
    setModifierSearch: (modifierSearch) => set({ modifierSearch }),
    setScheduleView: (scheduleView) => set({ scheduleView }),
  }),
);
