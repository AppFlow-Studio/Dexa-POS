import {
  Category,
  CustomPricing,
  Menu,
  MenuItemType,
  ModifierCategory,
  Schedule,
} from "@/lib/types";
import { MenuWithCategories, PosSyncData, PosSyncState } from "@/types/menu";
import { create } from "zustand";

// Re-export Category for components that import it from here
export type { Category } from "@/lib/types";

interface MenuState {
  // ============================================================
  // SYNC STATE - Data from API
  // ============================================================
  posSyncData: PosSyncData | null;
  syncState: PosSyncState;

  // ============================================================
  // DERIVED/LOCAL STATE - For backward compatibility
  // These are populated from posSyncData or used for local CRUD
  // ============================================================
  menuItems: MenuItemType[];
  categories: Category[];
  menus: Menu[];
  modifierGroups: ModifierCategory[];

  // ============================================================
  // O(1) LOOKUP MAPS - For instant data access
  // ============================================================
  menuItemsById: Record<string, MenuItemType>;
  categoriesById: Record<string, Category>;
  categoriesByName: Record<string, Category>;
  menusById: Record<string, Menu>;
  modifierGroupsById: Record<string, ModifierCategory>;

  // Global scheduling toggle
  isMenuSchedulingEnabled: boolean;

  // Per-menu overrides for category availability (does not remove the category)
  // map: menuId -> (categoryId -> isActive)
  menuCategoryOverrides: Record<string, Record<string, boolean>>;
  temporaryActiveMenus: string[]; // IDs of menus unlocked by PIN
  temporaryActiveCategories: string[]; // Names of categories unlocked by PIN

  // ============================================================
  // SYNC ACTIONS
  // ============================================================
  setMenuData: (data: PosSyncData) => void;
  setSyncState: (state: Partial<PosSyncState>) => void;
  clearMenuData: () => void;

  // ============================================================
  // GETTERS - Derive data from posSyncData
  // ============================================================
  getMenusFromSync: () => MenuWithCategories[];
  getAllMenuItems: () => MenuItemType[];
  getAllCategories: () => Category[];

  // ============================================================
  // O(1) GETTERS - Instant lookups from Maps
  // ============================================================
  getMenuItemById: (id: string) => MenuItemType | undefined;
  getCategoryById: (id: string) => Category | undefined;
  getCategoryByName: (name: string) => Category | undefined;
  getMenuById: (id: string) => Menu | undefined;
  getModifierGroupById: (id: string) => ModifierCategory | undefined;
  getModifierGroupsByIds: (ids: string[]) => ModifierCategory[];

  // ============================================================
  // CRUD Operations for Items (Optimistic/Local)
  // ============================================================
  addMenuItem: (item: Omit<MenuItemType, "id">) => void;
  updateMenuItem: (id: string, updates: Partial<MenuItemType>) => void;
  deleteMenuItem: (id: string) => void;
  toggleItemAvailability: (id: string) => void;

  // CRUD Operations for Categories
  addCategory: (category: Omit<Category, "id" | "createdAt">) => void;
  updateCategory: (id: string, updates: Partial<Category>) => void;
  deleteCategory: (id: string) => void;
  toggleCategoryActive: (id: string) => void;
  // Toggle category visibility within a specific menu (adds/removes the category from that menu)
  toggleMenuCategoryActive: (menuId: string, categoryId: string) => void;
  // Query helpers
  isCategoryActiveForMenu: (menuId: string, categoryId: string) => boolean;
  reorderCategories: (categories: Category[]) => void;

  // Category-Item relationship management
  addItemToCategory: (itemId: string, categoryName: string) => void;
  removeItemFromCategory: (itemId: string, categoryName: string) => void;
  getItemsInCategory: (categoryName: string) => MenuItemType[];

  // CRUD Operations for Menus
  addMenu: (menu: Omit<Menu, "id" | "createdAt" | "updatedAt">) => void;
  updateMenu: (id: string, updates: Partial<Menu>) => void;
  deleteMenu: (id: string) => void;
  toggleMenuActive: (id: string) => void;
  reorderMenus: (fromIndex: number, toIndex: number) => void;
  getMenuItems: (menuId: string) => MenuItemType[];

  // CRUD Operations for Modifier Groups
  addModifierGroup: (modifierGroup: Omit<ModifierCategory, "id">) => void;
  updateModifierGroup: (id: string, updates: Partial<ModifierCategory>) => void;
  deleteModifierGroup: (id: string) => void;
  getModifierGroup: (id: string) => ModifierCategory | undefined;

  // Scheduling
  setMenuSchedules: (id: string, schedules: Schedule[]) => void;
  setCategorySchedules: (id: string, schedules: Schedule[]) => void;
  isMenuAvailableNow: (id: string, at?: Date) => boolean;
  isCategoryAvailableNow: (name: string, at?: Date) => boolean;
  setMenuSchedulingEnabled: (isEnabled: boolean) => void;

  // MENU STOCK (optional per-menu-item)
  decreaseMenuItemStock: (itemId: string, quantity: number) => void;
  increaseMenuItemStock: (itemId: string, quantity: number) => void;
  getLowStockMenuItems: () => MenuItemType[];

  // Stock tracking mode helpers
  getMenuItemStockTrackingMode: (
    itemId: string
  ) => "in_stock" | "out_of_stock" | "quantity";
  setMenuItemStockTrackingMode: (
    itemId: string,
    mode: "in_stock" | "out_of_stock" | "quantity",
    stockQuantity?: number,
    reorderThreshold?: number
  ) => void;

  // Custom Pricing Operations
  addCustomPricing: (
    itemId: string,
    customPricing: Omit<CustomPricing, "id" | "createdAt" | "updatedAt">
  ) => void;
  updateCustomPricing: (
    itemId: string,
    pricingId: string,
    updates: Partial<CustomPricing>
  ) => void;
  deleteCustomPricing: (itemId: string, pricingId: string) => void;
  toggleCustomPricingActive: (itemId: string, pricingId: string) => void;

  // Optimistic update after backend price edit
  updateItemPriceOptimistic: (
    itemId: string,
    newPrice: number,
    context: { categoryId: string | null; menuId: string | null }
  ) => void;

  // Category schedule info helper
  getCategoryScheduleInfo: (
    name: string,
    at?: Date
  ) => {
    daysAvailable: string[];
    availableToday: boolean;
    timeframe: string | null;
  };

  addTemporaryMenuAccess: (menuName: string) => void;
  addTemporaryCategoryAccess: (categoryName: string) => void;
  clearTemporaryAccess: () => void; // Call this on logout

  // Merge standalone entities (categories, items, modifiers not in any menu)
  mergeStandaloneData: (data: {
    categories?: any[];
    items?: any[];
    modifierGroups?: any[];
  }) => void;
}

// Helper function to generate unique IDs
let nextId = 1000;
const generateId = () => `${nextId++}`;

let categoryId = 100;
const generateCategoryId = () => `cat_${categoryId++}`;

let menuId = 200;
const generateMenuId = () => `menu_${menuId++}`;

let modifierGroupId = 300;
const generateModifierGroupId = () => `mod_${modifierGroupId++}`;

// ============================================================
// TRANSFORM FUNCTIONS: Convert API types to legacy types
// ============================================================

// [Legacy transform functions removed]

/**
 * Transform nested items from all menus to flat MenuItemType[] format
 */
const transformMenuItemsFromSync = (
  syncMenus: MenuWithCategories[] | undefined | null
): {
  menus: Menu[];
  categories: Category[];
  menuItems: MenuItemType[];
  menuItemsById: Record<string, MenuItemType>;
} => {
  if (!syncMenus || !Array.isArray(syncMenus))
    return { menus: [], categories: [], menuItems: [], menuItemsById: {} };

  const globalItemMap = new Map<string, MenuItemType>();

  // Helper to map Sync Item to Internal Item
  // This uses the "effective_price" which is ALREADY computed for the specific context by the backend
  const mapSyncItem = (
    syncItem: any,
    context: { menuId?: string; categoryId?: string }
  ): MenuItemType => {
    const dbItem = syncItem.menu_item || syncItem; // Handle both wrapper and direct item

    return {
      id: dbItem.id,
      name: dbItem.name,
      description: dbItem.description ?? undefined,
      // CRITICAL: specific price for this context
      price: dbItem.effective_price,
      cashPrice: dbItem.effective_cash_price ?? undefined,
      image: dbItem.image ?? undefined,
      meal: (dbItem.meal_types ?? []) as MenuItemType["meal"],
      category: (dbItem.categories || []).map((c: any) => c.name || c), // Fallback if categories logic differs
      allergens: dbItem.allergens ?? undefined,
      cardBgColor: dbItem.card_bg_color ?? undefined,
      availability: dbItem.effective_availability,
      stockQuantity: dbItem.current_stock ?? undefined,
      stockTrackingMode: dbItem.stock_tracking_mode,
      modifierGroupIds: (dbItem.modifier_groups || []).map((mg: any) => mg.id),
      priceLevels: dbItem.price_levels,
      priceSource: dbItem.price_source as MenuItemType["priceSource"],
      location_id: dbItem.location_id,
      // Map override fields for reference (though effective_price is what matters)
      menuPriceOverrides: context.menuId
        ? { [context.menuId]: dbItem.effective_price }
        : undefined,
      categoryPriceOverrides: context.categoryId
        ? { [context.categoryId]: dbItem.effective_price }
        : undefined,
    };
  };

  // 1. Build the Menu Tree (Menu -> Category -> Item)
  const menus: Menu[] = syncMenus.map((menu) => {
    const categories: Category[] = (menu.categories || []).map((catEntry) => {
      // Map items specifically for this menu/category context
      const items = (catEntry.items || []).map((itemEntry) =>
        mapSyncItem(itemEntry, {
          menuId: menu.id,
          categoryId: catEntry.category_id,
        })
      );

      return {
        id: catEntry.category.id, // Use actual Category ID
        name: catEntry.category.name,
        isActive: catEntry.is_active,
        order: catEntry.display_order,
        createdAt: new Date().toISOString(),
        location_id: catEntry.category.location_id,
        location_name: undefined, // Could map if available
        items: items, // NESTED ITEMS specific to this context
      };
    });

    return {
      id: menu.id,
      name: menu.name,
      description: menu.description || undefined,
      isActive: menu.is_active,
      categories: categories, // Full Category Objects
      schedules: (menu.schedules || []).map((s) => ({
        id: s.id,
        name: s.schedule.name,
        startTime: s.schedule.time_slots[0]?.start_time || "00:00:00", // Simplified for now
        endTime: s.schedule.time_slots[0]?.end_time || "23:59:59",
        days: s.schedule.time_slots.map((ts: any) => ts.day_of_week.toString()), // TODO: map days correctly
        isActive: s.schedule.is_active,
      })),
      createdAt: menu.created_at,
      updatedAt: menu.updated_at,
      location_id: menu.location_id,
    };
  });

  // 2. Build Global Item Map (for "Item Library"/Inventory view)
  // We perform a second pass or extract from a specific "All Items" list if available
  // Assuming syncMenus covers all items is risky if there are orphan items.
  // Ideally, `pos_sync_data` has a top-level `items` array. checking types/menu.ts... it does NOT.
  // So we collect all unique items encountered in menus + categories.

  // Actually, wait. The user might want an "Item Library" that is distinct from menus.
  // But for now, let's populate the global map from the menu tree to ensure consistency.
  menus.forEach((menu) => {
    menu.categories.forEach((cat) => {
      (cat.items || []).forEach((item) => {
        if (!globalItemMap.has(item.id)) {
          // Clone and strip context overrides for the "Base" item?
          // No, we want the base price. `dbItem` has `price_levels.level_1_base`.
          // Let's rely on the fact that mapSyncItem sets `price` to `effective_price`.
          // For the GLOBAL item, we want Level 2 (Location Item) or Level 1 (Base).

          // BETTER STRATEGY:
          // The `mapSyncItem` returns an instance with specific price.
          // We should find the "Base" version.
          // `item.priceLevels.level_2_location_item` ?? `item.priceLevels.level_1_base`
          const basePrice =
            item.priceLevels?.level_2_location_item ??
            item.priceLevels?.level_1_base ??
            item.price;

          globalItemMap.set(item.id, {
            ...item,
            price: basePrice, // Reset to base price for global view
            menuPriceOverrides: undefined,
            categoryPriceOverrides: undefined,
          });
        }
      });
    });
  });

  // 3. Extract Categories (Unique List)
  const categoryMap = new Map<string, Category>();
  menus.forEach((menu) => {
    menu.categories.forEach((cat) => {
      if (!categoryMap.has(cat.id)) {
        categoryMap.set(cat.id, { ...cat, items: undefined }); // Store categories flat without items for generic management
      }
    });
  });

  return {
    menus,
    categories: Array.from(categoryMap.values()),
    menuItems: Array.from(globalItemMap.values()),
    menuItemsById: Object.fromEntries(globalItemMap),
  };
};

/**
 * Transform modifier groups from all menu items to flat ModifierCategory[] format
 */
const transformModifierGroupsFromSync = (
  syncMenus: MenuWithCategories[] | undefined | null
): ModifierCategory[] => {
  if (!syncMenus || !Array.isArray(syncMenus)) return [];

  const modifierMap = new Map<string, ModifierCategory>();

  syncMenus.forEach((menu) => {
    (menu.categories || []).forEach((catEntry) => {
      (catEntry.items || []).forEach((catItem) => {
        const menuItem = catItem.menu_item;
        if (!menuItem) return;

        (menuItem.modifier_groups || []).forEach((mg) => {
          if (!modifierMap.has(mg.id)) {
            // Map API structure to legacy ModifierCategory format
            modifierMap.set(mg.id, {
              id: mg.id,
              name: mg.name,
              // Map is_required + min/max_selections to legacy type/selectionType
              type: mg.is_required ? "required" : "optional",
              selectionType: mg.max_selections === 1 ? "single" : "multiple",
              maxSelections: mg.max_selections,
              description: undefined, // API doesn't have description in this format
              // Map items (API) to options (legacy)
              options: (mg.items || []).map((opt) => ({
                id: opt.id,
                name: opt.name,
                price: opt.price_modifier, // API uses price_modifier
                isAvailable: opt.is_active,
                isDefault: false, // API doesn't have this
              })),
            });
          }
        });
      });
    });
  });

  return Array.from(modifierMap.values());
};

// ============================================================
// STORE CREATION
// ============================================================

export const useMenuStore = create<MenuState>((set, get) => {
  return {
    // ============================================================
    // SYNC STATE - Initially empty, populated by API
    // ============================================================
    posSyncData: null,
    syncState: {
      isLoading: false,
      isError: false,
      error: null,
      lastSyncedAt: null,
    },

    // ============================================================
    // DERIVED/LOCAL STATE - Start empty, populated from sync
    // ============================================================
    menuItems: [],
    categories: [],
    menus: [],
    modifierGroups: [],

    // ============================================================
    // O(1) LOOKUP MAPS - Start empty, built on sync
    // ============================================================
    menuItemsById: {},
    categoriesById: {},
    categoriesByName: {},
    menusById: {},
    modifierGroupsById: {},

    isMenuSchedulingEnabled: true,
    menuCategoryOverrides: {},
    temporaryActiveMenus: [],
    temporaryActiveCategories: [],

    // ============================================================
    // SYNC ACTIONS
    // ============================================================
    setMenuData: (data: PosSyncData) => {
      // 1. Transform Menus, Categories, and Items (Tree Structure)
      const { menus, categories, menuItems, menuItemsById } =
        transformMenuItemsFromSync(data.menus);

      // 2. Transform Modifier Groups
      const modifierGroups = transformModifierGroupsFromSync(data.menus);

      // 3. Build O(1) lookup Maps
      const categoriesById: Record<string, Category> = {};
      const categoriesByName: Record<string, Category> = {};
      for (const cat of categories) {
        categoriesById[cat.id] = cat;
        categoriesByName[cat.name] = cat;
      }

      const menusById: Record<string, Menu> = {};
      for (const menu of menus) {
        menusById[menu.id] = menu;
      }

      const modifierGroupsById: Record<string, ModifierCategory> = {};
      for (const mg of modifierGroups) {
        modifierGroupsById[mg.id] = mg;
      }

      set({
        posSyncData: data,
        menus,
        categories,
        menuItems,
        modifierGroups,
        // O(1) lookup Maps
        menuItemsById,
        categoriesById,
        categoriesByName,
        menusById,
        modifierGroupsById,
        syncState: {
          isLoading: false,
          isError: false,
          error: null,
          lastSyncedAt: data.synced_at,
        },
      });

      console.log("Menu data set from sync:", {
        menusCount: menus.length,
        categoriesCount: categories.length,
        menuItemsCount: menuItems.length,
        modifierGroupsCount: modifierGroups.length,
      });
    },

    setSyncState: (state: Partial<PosSyncState>) => {
      set((current) => ({
        syncState: { ...current.syncState, ...state },
      }));
    },

    clearMenuData: () => {
      set({
        posSyncData: null,
        menus: [],
        categories: [],
        menuItems: [],
        modifierGroups: [],
        // Clear O(1) lookup Maps
        menuItemsById: {},
        categoriesById: {},
        categoriesByName: {},
        menusById: {},
        modifierGroupsById: {},
        syncState: {
          isLoading: false,
          isError: false,
          error: null,
          lastSyncedAt: null,
        },
      });
    },

    // ============================================================
    // GETTERS
    // ============================================================
    getMenusFromSync: () => {
      return get().posSyncData?.menus ?? [];
    },

    getAllMenuItems: () => {
      return get().menuItems;
    },

    getAllCategories: () => {
      return get().categories;
    },

    // ============================================================
    // O(1) GETTERS - Instant lookups from Maps
    // ============================================================
    getMenuItemById: (id: string) => {
      return get().menuItemsById[id];
    },

    getCategoryById: (id: string) => {
      return get().categoriesById[id];
    },

    getCategoryByName: (name: string) => {
      return get().categoriesByName[name];
    },

    getMenuById: (id: string) => {
      return get().menusById[id];
    },

    getModifierGroupById: (id: string) => {
      return get().modifierGroupsById[id];
    },

    getModifierGroupsByIds: (ids: string[]) => {
      const map = get().modifierGroupsById;
      return ids
        .map((id) => map[id])
        .filter((mg): mg is ModifierCategory => mg !== undefined);
    },

    // ============================================================
    // CRUD Operations (Optimistic/Local)
    // ============================================================
    addMenuItem: (itemData) => {
      const newItem: MenuItemType = {
        ...itemData,
        id: generateId(),
        // Default to "in_stock" mode (availability: true) unless explicitly set
        availability:
          itemData.availability !== undefined ? itemData.availability : true,
        // Default stock tracking mode to "in_stock" unless explicitly set
        stockTrackingMode: itemData.stockTrackingMode || "in_stock",
      };

      set((state) => ({
        menuItems: [...state.menuItems, newItem],
        // Keep O(1) Map in sync
        menuItemsById: { ...state.menuItemsById, [newItem.id]: newItem },
      }));

      // console.log("Menu item added:", newItem);
    },

    updateMenuItem: (id, updates) => {
      set((state) => {
        const updatedItem = state.menuItemsById[id]
          ? { ...state.menuItemsById[id], ...updates }
          : undefined;
        return {
          menuItems: state.menuItems.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
          // Keep O(1) Map in sync
          menuItemsById: updatedItem
            ? { ...state.menuItemsById, [id]: updatedItem }
            : state.menuItemsById,
        };
      });

      // console.log("Menu item updated:", id, updates);
    },

    deleteMenuItem: (id) => {
      set((state) => {
        const { [id]: removed, ...restMenuItemsById } = state.menuItemsById;
        return {
          menuItems: state.menuItems.filter((item) => item.id !== id),
          // Keep O(1) Map in sync
          menuItemsById: restMenuItemsById,
        };
      });

      console.log("Menu item deleted:", id);
    },

    toggleItemAvailability: (id) => {
      set((state) => ({
        menuItems: state.menuItems.map((item) =>
          item.id === id ? { ...item, availability: !item.availability } : item
        ),
      }));

      console.log("Menu item availability toggled:", id);
    },

    // Category CRUD Operations
    addCategory: (categoryData) => {
      const newCategory: Category = {
        ...categoryData,
        id: generateCategoryId(),
        createdAt: new Date().toISOString(),
      };

      set((state) => ({
        categories: [...state.categories, newCategory],
        // Keep O(1) Maps in sync
        categoriesById: {
          ...state.categoriesById,
          [newCategory.id]: newCategory,
        },
        categoriesByName: {
          ...state.categoriesByName,
          [newCategory.name]: newCategory,
        },
      }));

      console.log("Category added:", newCategory);
    },

    updateCategory: (id, updates) => {
      set((state) => {
        const existingCat = state.categoriesById[id];
        const updatedCategory = existingCat
          ? { ...existingCat, ...updates }
          : undefined;

        // Handle name change - remove old name from categoriesByName
        let newCategoriesByName = { ...state.categoriesByName };
        if (
          updatedCategory &&
          updates.name &&
          existingCat.name !== updates.name
        ) {
          delete newCategoriesByName[existingCat.name];
          newCategoriesByName[updates.name] = updatedCategory;
        } else if (updatedCategory) {
          newCategoriesByName[updatedCategory.name] = updatedCategory;
        }

        return {
          categories: state.categories.map((category) =>
            category.id === id ? { ...category, ...updates } : category
          ),
          // Keep O(1) Maps in sync
          categoriesById: updatedCategory
            ? { ...state.categoriesById, [id]: updatedCategory }
            : state.categoriesById,
          categoriesByName: newCategoriesByName,
        };
      });

      console.log("Category updated:", id, updates);
    },

    deleteCategory: (id) => {
      set((state) => {
        const categoryToRemove = state.categoriesById[id];
        const { [id]: removedById, ...restCategoriesById } =
          state.categoriesById;
        const newCategoriesByName = categoryToRemove
          ? Object.fromEntries(
              Object.entries(state.categoriesByName).filter(
                ([name]) => name !== categoryToRemove.name
              )
            )
          : state.categoriesByName;

        return {
          categories: state.categories.filter((category) => category.id !== id),
          // Keep O(1) Maps in sync
          categoriesById: restCategoriesById,
          categoriesByName: newCategoriesByName,
        };
      });

      console.log("Category deleted:", id);
    },

    toggleCategoryActive: (id) => {
      set((state) => ({
        categories: state.categories.map((category) =>
          category.id === id
            ? { ...category, isActive: !category.isActive }
            : category
        ),
      }));

      console.log("Category active status toggled:", id);
    },

    // Toggle category availability only for a specific menu without removing the category
    toggleMenuCategoryActive: (menuId, categoryId) => {
      const state = get();
      const category = state.categories.find((c) => c.id === categoryId);
      if (!category) {
        console.warn("toggleMenuCategoryActive: category not found", {
          menuId,
          categoryId,
        });
        return;
      }

      const currentOverrides = state.menuCategoryOverrides[menuId] || {};
      const currentValue = currentOverrides[categoryId];
      const nextValue = currentValue === undefined ? false : !currentValue; // default to false (off) when first toggled

      set((current) => ({
        menuCategoryOverrides: {
          ...current.menuCategoryOverrides,
          [menuId]: {
            ...(current.menuCategoryOverrides[menuId] || {}),
            [categoryId]: nextValue,
          },
        },
      }));

      console.log("Menu-specific category availability toggled:", {
        menuId,
        categoryId,
        value: nextValue,
      });
    },

    isCategoryActiveForMenu: (menuId, categoryId) => {
      const state = get();
      // global category must be active
      const category = state.categories.find((c) => c.id === categoryId);
      if (!category || !category.isActive) return false;

      // if category isn't part of the menu, treat as inactive for that menu
      const menu = state.menus.find((m) => m.id === menuId);
      if (!menu || !menu.categories.some((c) => c.id === category.id))
        return false;

      const override = state.menuCategoryOverrides[menuId]?.[categoryId];
      // undefined means no override -> active; false means explicitly off
      return override !== false;
    },

    reorderCategories: (newCategories) => {
      set(() => ({
        categories: newCategories,
      }));

      console.log("Categories reordered");
    },

    // Category-Item relationship management
    addItemToCategory: (itemId, categoryName) => {
      set((state) => ({
        menuItems: state.menuItems.map((item) => {
          if (item.id === itemId) {
            // Convert single category to array if needed
            const currentCategories = Array.isArray(item.category)
              ? item.category
              : item.category
              ? [item.category]
              : [];

            // Only add if not already present
            if (!currentCategories.includes(categoryName)) {
              return {
                ...item,
                category: [...currentCategories, categoryName],
              };
            }
          }
          return item;
        }),
      }));

      console.log("Item added to category:", itemId, categoryName);
    },

    removeItemFromCategory: (itemId, categoryName) => {
      set((state) => ({
        menuItems: state.menuItems.map((item) => {
          if (item.id === itemId) {
            // Convert single category to array if needed
            const currentCategories = Array.isArray(item.category)
              ? item.category
              : item.category
              ? [item.category]
              : [];

            return {
              ...item,
              category: currentCategories.filter((cat) => cat !== categoryName),
            };
          }
          return item;
        }),
      }));

      console.log("Item removed from category:", itemId, categoryName);
    },

    getItemsInCategory: (categoryName: string): MenuItemType[] => {
      const state = useMenuStore.getState();
      return state.menuItems.filter((item: MenuItemType) => {
        const categories = Array.isArray(item.category)
          ? item.category
          : item.category
          ? [item.category]
          : [];
        return categories.includes(categoryName);
      });
    },

    // CRUD Operations for Menus
    addMenu: (menuData) => {
      const newMenu: Menu = {
        ...menuData,
        id: generateMenuId(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      set((state) => ({
        menus: [...state.menus, newMenu],
        // Keep O(1) Map in sync
        menusById: { ...state.menusById, [newMenu.id]: newMenu },
      }));

      console.log("Menu added:", newMenu);
    },

    updateMenu: (id, updates) => {
      set((state) => {
        const updatedMenu = state.menusById[id]
          ? {
              ...state.menusById[id],
              ...updates,
              updatedAt: new Date().toISOString(),
            }
          : undefined;
        return {
          menus: state.menus.map((menu) =>
            menu.id === id
              ? { ...menu, ...updates, updatedAt: new Date().toISOString() }
              : menu
          ),
          // Keep O(1) Map in sync
          menusById: updatedMenu
            ? { ...state.menusById, [id]: updatedMenu }
            : state.menusById,
        };
      });

      console.log("Menu updated:", id, updates);
    },

    deleteMenu: (id) => {
      set((state) => {
        const { [id]: removed, ...restMenusById } = state.menusById;
        return {
          menus: state.menus.filter((menu) => menu.id !== id),
          // Keep O(1) Map in sync
          menusById: restMenusById,
        };
      });

      console.log("Menu deleted:", id);
    },

    toggleMenuActive: (id) => {
      set((state) => ({
        menus: state.menus.map((menu) =>
          menu.id === id ? { ...menu, isActive: !menu.isActive } : menu
        ),
      }));

      console.log("Menu active status toggled:", id);
    },

    reorderMenus: (fromIndex: number, toIndex: number) => {
      set((state) => {
        const newMenus = [...state.menus];
        const [movedItem] = newMenus.splice(fromIndex, 1);
        newMenus.splice(toIndex, 0, movedItem);
        return { menus: newMenus };
      });
    },

    getMenuItems: (menuId: string): MenuItemType[] => {
      const state = useMenuStore.getState();
      const menu = state.menus.find((m) => m.id === menuId);
      if (!menu) return [];

      // Get all items that belong to any of the menu's categories
      return state.menuItems.filter((item: MenuItemType) => {
        const itemCategories = Array.isArray(item.category)
          ? item.category
          : item.category
          ? [item.category]
          : [];
        return menu.categories.some((cat) => itemCategories.includes(cat.name));
      });
    },

    // CRUD Operations for Modifier Groups
    addModifierGroup: (modifierGroupData) => {
      const newModifierGroup: ModifierCategory = {
        ...modifierGroupData,
        id: generateModifierGroupId(),
      };

      set((state) => ({
        modifierGroups: [...state.modifierGroups, newModifierGroup],
        // Keep O(1) Map in sync
        modifierGroupsById: {
          ...state.modifierGroupsById,
          [newModifierGroup.id]: newModifierGroup,
        },
      }));

      console.log("Modifier group added:", newModifierGroup);
    },

    updateModifierGroup: (id, updates) => {
      set((state) => {
        const updatedModifierGroup = state.modifierGroupsById[id]
          ? { ...state.modifierGroupsById[id], ...updates }
          : undefined;
        return {
          modifierGroups: state.modifierGroups.map((modifierGroup) =>
            modifierGroup.id === id
              ? { ...modifierGroup, ...updates }
              : modifierGroup
          ),
          // Keep O(1) Map in sync
          modifierGroupsById: updatedModifierGroup
            ? { ...state.modifierGroupsById, [id]: updatedModifierGroup }
            : state.modifierGroupsById,
        };
      });

      console.log("Modifier group updated:", id, updates);
    },

    deleteModifierGroup: (id) => {
      set((state) => {
        const { [id]: removed, ...restModifierGroupsById } =
          state.modifierGroupsById;

        // Also update menuItemsById for any items that reference this modifier group
        const updatedMenuItemsById = { ...state.menuItemsById };
        const updatedMenuItems = state.menuItems.map((item) => {
          if (!item.modifierGroupIds || item.modifierGroupIds.length === 0) {
            return item;
          }

          const filteredIds = item.modifierGroupIds.filter(
            (modId) => modId !== id
          );

          if (filteredIds.length !== item.modifierGroupIds.length) {
            const updatedItem = { ...item, modifierGroupIds: filteredIds };
            updatedMenuItemsById[item.id] = updatedItem;
            return updatedItem;
          }

          return item;
        });

        return {
          // Remove the modifier group from the central registry
          modifierGroups: state.modifierGroups.filter(
            (modifierGroup) => modifierGroup.id !== id
          ),
          // Keep O(1) Map in sync
          modifierGroupsById: restModifierGroupsById,
          // Cascade remove the ID reference from all menu items
          menuItems: updatedMenuItems,
          menuItemsById: updatedMenuItemsById,
        };
      });

      console.log("Modifier group deleted (with cascade):", id);
    },

    getModifierGroup: (id: string): ModifierCategory | undefined => {
      // Use O(1) lookup instead of .find()
      return useMenuStore.getState().modifierGroupsById[id];
    },

    // Scheduling
    setMenuSchedules: (id: string, schedules: Schedule[]) => {
      set((state) => ({
        menus: state.menus.map((m: Menu) =>
          m.id === id ? { ...m, schedules } : m
        ),
      }));
    },
    setCategorySchedules: (id: string, schedules: Schedule[]) => {
      set((state) => ({
        categories: state.categories.map((c: Category) =>
          c.id === id ? { ...c, schedules } : c
        ),
      }));
    },
    isMenuAvailableNow: (id: string, at?: Date): boolean => {
      const state = get();
      const menu = state.menus.find((m: Menu) => m.id === id);
      if (!menu) return false;
      if (!menu.isActive) return false;
      // If global scheduling is disabled, treat as always available when active
      if (!state.isMenuSchedulingEnabled) return true;
      if (!menu.schedules || menu.schedules.length === 0) return true;
      return isNowInAnySchedule(menu.schedules, at);
    },
    isCategoryAvailableNow: (name: string, at?: Date): boolean => {
      const state = get();
      const cat = state.categories.find((c: Category) => c.name === name);
      if (!cat) return false;
      if (!cat.isActive) return false;
      // If global scheduling is disabled, treat as always available when active
      if (!state.isMenuSchedulingEnabled) return true;
      if (!cat.schedules || cat.schedules.length === 0) return true;
      return isNowInAnySchedule(cat.schedules, at);
    },
    setMenuSchedulingEnabled: (isEnabled: boolean) =>
      set(() => ({ isMenuSchedulingEnabled: isEnabled })),

    // Custom Pricing Operations
    addCustomPricing: (itemId, customPricing) => {
      const now = new Date().toISOString();
      const newPricing: CustomPricing = {
        ...customPricing,
        id: `pricing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: now,
        updatedAt: now,
      };

      set((state) => ({
        menuItems: state.menuItems.map((item) => {
          if (item.id === itemId) {
            const existingPricing = item.customPricing || [];
            return {
              ...item,
              customPricing: [...existingPricing, newPricing],
            };
          }
          return item;
        }),
      }));
    },

    decreaseMenuItemStock: (itemId, quantity) => {
      set((state) => ({
        menuItems: state.menuItems.map((item) => {
          if (item.id === itemId) {
            // Only decrease stock if item is in "quantity" tracking mode
            if (typeof item.stockQuantity === "number") {
              const newStock = Math.max(0, item.stockQuantity - quantity);
              return {
                ...item,
                stockQuantity: newStock,
                // If stock reaches 0, set availability to false
                availability: newStock === 0 ? false : item.availability,
              } as typeof item;
            }
            // For "in_stock" mode, just return the item unchanged
            // For "out_of_stock" mode, item remains out of stock
            return item;
          }
          return item;
        }),
      }));
    },

    updateCustomPricing: (itemId, pricingId, updates) => {
      set((state) => ({
        menuItems: state.menuItems.map((item) => {
          if (item.id === itemId && item.customPricing) {
            return {
              ...item,
              customPricing: item.customPricing.map((pricing) => {
                if (pricing.id === pricingId) {
                  return {
                    ...pricing,
                    ...updates,
                    updatedAt: new Date().toISOString(),
                  };
                }
                return pricing;
              }),
            };
          }
          return item;
        }),
      }));
    },

    increaseMenuItemStock: (itemId, quantity) => {
      set((state) => ({
        menuItems: state.menuItems.map((item) => {
          if (item.id === itemId) {
            // Only increase stock if item is in "quantity" tracking mode
            if (typeof item.stockQuantity === "number") {
              const newStock = item.stockQuantity + quantity;
              return {
                ...item,
                stockQuantity: newStock,
                // If stock becomes > 0, set availability to true
                availability: newStock > 0 ? true : item.availability,
              } as typeof item;
            }
            // For "in_stock" mode, just return the item unchanged
            // For "out_of_stock" mode, item remains out of stock
            return item;
          }
          return item;
        }),
      }));
    },

    deleteCustomPricing: (itemId, pricingId) => {
      set((state) => ({
        menuItems: state.menuItems.map((item) => {
          if (item.id === itemId && item.customPricing) {
            return {
              ...item,
              customPricing: item.customPricing.filter(
                (pricing) => pricing.id !== pricingId
              ),
            };
          }
          return item;
        }),
      }));
    },

    toggleCustomPricingActive: (itemId, pricingId) => {
      set((state) => ({
        menuItems: state.menuItems.map((item) => {
          if (item.id === itemId && item.customPricing) {
            return {
              ...item,
              customPricing: item.customPricing.map((pricing) => {
                if (pricing.id === pricingId) {
                  return {
                    ...pricing,
                    isActive: !pricing.isActive,
                    updatedAt: new Date().toISOString(),
                  };
                }
                return pricing;
              }),
            };
          }
          return item;
        }),
      }));
    },

    // NEW: Optimistic update after backend price edit
    updateItemPriceOptimistic: (itemId, newPrice, context) => {
      set((state) => {
        let updatedMenuItems = state.menuItems;
        const updatedMenuItemsById = { ...state.menuItemsById };

        // 1. Update Global Item (Library) if Level 2 (No Context)
        if (!context.menuId && !context.categoryId) {
          const item = state.menuItemsById[itemId];
          if (item) {
            const updatedItem = { ...item, price: newPrice };
            // Also update base price / level_2
            if (updatedItem.priceLevels) {
              updatedItem.priceLevels = {
                ...updatedItem.priceLevels,
                level_2_location_item: newPrice,
              };
            }

            updatedMenuItems = state.menuItems.map((i) =>
              i.id === itemId ? updatedItem : i
            );
            updatedMenuItemsById[itemId] = updatedItem;
          }
        }

        // 2. Update Tree Instances (Menu -> Category -> Item)
        const updatedMenus = state.menus.map((menu) => {
          if (context.menuId && menu.id !== context.menuId) return menu;

          const updatedCategories = menu.categories.map((cat) => {
            if (context.categoryId && cat.id !== context.categoryId) return cat;
            if (!cat.items) return cat;

            const updatedItems = cat.items.map((item) => {
              if (item.id === itemId) {
                return { ...item, price: newPrice };
              }
              return item;
            });

            if (updatedItems === cat.items) return cat;
            return { ...cat, items: updatedItems };
          });

          if (updatedCategories === menu.categories) return menu;
          return { ...menu, categories: updatedCategories };
        });

        return {
          menuItems: updatedMenuItems,
          menuItemsById: updatedMenuItemsById,
          menus: updatedMenus,
        };
      });

      console.log(
        `[useMenuStore] Optimistically updated price for item ${itemId} to ${newPrice}`,
        context
      );
    },

    getLowStockMenuItems: () => {
      return get().menuItems.filter(
        (item) =>
          typeof item.reorderThreshold === "number" &&
          typeof item.stockQuantity === "number" &&
          item.stockQuantity <= item.reorderThreshold
      );
    },

    // Stock tracking mode helpers
    getMenuItemStockTrackingMode: (itemId: string) => {
      const item = get().menuItems.find((item) => item.id === itemId);
      if (!item) return "in_stock"; // Default fallback

      // Return stored stockTrackingMode if it exists
      if (item.stockTrackingMode) {
        return item.stockTrackingMode;
      }

      // Fallback: Determine mode based on item properties for backward compatibility
      if (typeof item.stockQuantity === "number" && item.stockQuantity > 0) {
        return "quantity";
      } else if (item.availability === false) {
        return "out_of_stock";
      } else {
        return "in_stock";
      }
    },

    setMenuItemStockTrackingMode: (
      itemId: string,
      mode: "in_stock" | "out_of_stock" | "quantity",
      stockQuantity?: number,
      reorderThreshold?: number
    ) => {
      set((state) => ({
        menuItems: state.menuItems.map((item) => {
          if (item.id === itemId) {
            let updatedItem = { ...item };

            // Store the stock tracking mode
            updatedItem.stockTrackingMode = mode;

            if (mode === "in_stock") {
              updatedItem.availability = true;
              updatedItem.stockQuantity = undefined;
              updatedItem.reorderThreshold = undefined;
            } else if (mode === "out_of_stock") {
              updatedItem.availability = false;
              updatedItem.stockQuantity = undefined;
              updatedItem.reorderThreshold = undefined;
            } else if (mode === "quantity") {
              updatedItem.availability = undefined;
              updatedItem.stockQuantity = stockQuantity;
              updatedItem.reorderThreshold = reorderThreshold;
            }

            return updatedItem;
          }
          return item;
        }),
      }));
    },

    // Category schedule info helper
    getCategoryScheduleInfo: (name: string, at?: Date) => {
      const state = get();
      const cat = state.categories.find((c) => c.name === name);
      const schedules = (cat?.schedules || []).filter((r) => r.isActive);
      const daysAvailable = Array.from(
        new Set(schedules.flatMap((r) => r.days))
      ) as string[];
      const now = at ?? new Date();
      const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
      const todayKey = dayNames[now.getDay()];
      const todays = schedules.filter((r) => r.days.includes(todayKey as any));
      const availableToday = todays.length > 0;

      // If multiple windows today, return the first window as timeframe (or join)
      const formatTime = (t: string) => {
        return new Date(t).toLocaleTimeString([], {
          hour: "numeric",
          minute: "2-digit",
        });
      };
      let timeframe: string | null = null;
      if (availableToday) {
        // Combine all windows into comma-separated ranges
        timeframe = todays
          .map((r) => `${formatTime(r.startTime)} to ${formatTime(r.endTime)}`)
          .join(", ");
      }

      return { daysAvailable, availableToday, timeframe };
    },
    addTemporaryMenuAccess: (menuName) => {
      set((state) => ({
        temporaryActiveMenus: [
          ...new Set([...state.temporaryActiveMenus, menuName]),
        ],
      }));
    },

    addTemporaryCategoryAccess: (categoryName) => {
      set((state) => ({
        temporaryActiveCategories: [
          ...new Set([...state.temporaryActiveCategories, categoryName]),
        ],
      }));
    },

    clearTemporaryAccess: () => {
      set({ temporaryActiveMenus: [], temporaryActiveCategories: [] });
    },

    // Merge standalone entities (categories, items, modifiers not in any menu)
    mergeStandaloneData: (data) => {
      set((state) => {
        const newCategories = [...state.categories];
        const newCategoriesById = { ...state.categoriesById };
        const newCategoriesByName = { ...state.categoriesByName };

        const newMenuItems = [...state.menuItems];
        const newMenuItemsById = { ...state.menuItemsById };

        const newModifierGroups = [...state.modifierGroups];
        const newModifierGroupsById = { ...state.modifierGroupsById };

        // Merge standalone categories AND their nested items
        if (data.categories) {
          for (const cat of data.categories) {
            // Skip category if already exists, but still process its items below
            if (!newCategoriesById[cat.id]) {
              const mappedCategory: Category = {
                id: cat.id,
                name: cat.name,
                isActive: cat.is_active ?? true,
                order: cat.item_count ?? 0,
                createdAt: new Date().toISOString(),
                schedules: [],
                location_id: cat.location_id,
                location_name: cat.location_name ?? undefined,
              };

              newCategories.push(mappedCategory);
              newCategoriesById[cat.id] = mappedCategory;
              newCategoriesByName[cat.name] = mappedCategory;
            }

            // Extract items from this category's items array
            const categoryItems = cat.items || [];
            for (const catItem of categoryItems) {
              const menuItem = catItem.menu_item;
              if (!menuItem) continue;

              const itemId = menuItem.id || catItem.menu_item_id;

              // If item already exists, add this category name to its categories
              if (newMenuItemsById[itemId]) {
                const existingItem = newMenuItemsById[itemId];
                const existingCategories = Array.isArray(existingItem.category)
                  ? existingItem.category
                  : existingItem.category
                  ? [existingItem.category]
                  : [];

                // Add category name if not already present
                if (!existingCategories.includes(cat.name)) {
                  existingItem.category = [...existingCategories, cat.name];
                }
              } else {
                // New item - create with this category name
                const mappedItem: MenuItemType = {
                  id: itemId,
                  name: menuItem.name,
                  description: (menuItem as any).description ?? undefined,
                  price: menuItem.effective_price ?? 0,
                  cashPrice: menuItem.effective_cash_price ?? undefined,
                  availability: menuItem.effective_availability ?? true,
                  category: [cat.name], // Start with this category
                  meal: (menuItem as any).meal_types ?? [],
                  stockTrackingMode:
                    ((menuItem as any)
                      .stock_tracking_mode as MenuItemType["stockTrackingMode"]) ??
                    "in_stock",
                };

                newMenuItems.push(mappedItem);
                newMenuItemsById[itemId] = mappedItem;
              }
            }
          }
        }

        // Merge standalone items
        if (data.items) {
          for (const item of data.items) {
            // Skip if already exists
            if (newMenuItemsById[item.id]) continue;

            // Map category names from the item
            const categoryNames = (item.categories || []).map(
              (c: { name: string }) => c.name
            );

            const mappedItem: MenuItemType = {
              id: item.id,
              name: item.name,
              description: item.description ?? undefined,
              price: item.effective_price ?? item.base_price ?? 0,
              cashPrice:
                item.effective_cash_price ?? item.base_cash_price ?? undefined,
              availability: item.effective_availability ?? true,
              category: categoryNames,
              meal: item.meal_types ?? [],
              stockTrackingMode:
                (item.stock_tracking_mode as MenuItemType["stockTrackingMode"]) ??
                "in_stock",
            };

            newMenuItems.push(mappedItem);
            newMenuItemsById[item.id] = mappedItem;
          }
        }

        // Merge standalone modifier groups
        if (data.modifierGroups) {
          for (const mg of data.modifierGroups) {
            // Skip if already exists
            if (newModifierGroupsById[mg.id]) continue;

            const mappedModifier: ModifierCategory = {
              id: mg.id,
              name: mg.name,
              description: mg.description ?? undefined,
              type: mg.is_required ? "required" : "optional",
              selectionType: mg.max_selections === 1 ? "single" : "multiple",
              maxSelections: mg.max_selections ?? undefined,
              options: (mg.modifier_group_items || []).map((opt: any) => ({
                id: opt.id,
                name: opt.name,
                price: opt.price_modifier ?? 0,
                isAvailable: opt.is_active ?? true,
                isDefault: opt.is_default ?? false,
              })),
              location_id: mg.location_id,
              location_name: mg.location_name?.name,
              items: (mg.menu_item_modifier_groups || []).map((mimg: any) => ({
                id: mimg.menu_item.id,
                name: mimg.menu_item.name,
                price: mimg.menu_item.price,
                image: mimg.menu_item.image,
                availability: mimg.menu_item.availability ?? true,
                category: [], // Minimal data needed for display
                meal: [],
              })),
            };

            newModifierGroups.push(mappedModifier);
            newModifierGroupsById[mg.id] = mappedModifier;
          }
        }

        return {
          categories: newCategories,
          categoriesById: newCategoriesById,
          categoriesByName: newCategoriesByName,
          menuItems: newMenuItems,
          menuItemsById: newMenuItemsById,
          modifierGroups: newModifierGroups,
          modifierGroupsById: newModifierGroupsById,
        };
      });
    },
  };
});

// No selector hooks - use the store directly to avoid recursion

function isNowInAnySchedule(schedules: Schedule[], at?: Date): boolean {
  const now = at ?? new Date();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const day = dayNames[now.getDay()];
  const minutes = now.getHours() * 60 + now.getMinutes();
  return schedules.some((rule) => {
    if (!rule.isActive) return false;
    if (!rule.days.includes(day)) return false;

    // Parse ISO strings
    const start = new Date(rule.startTime);
    const end = new Date(rule.endTime);

    // Get minutes from beginning of day (Local Time) to match current time check
    const startM = start.getHours() * 60 + start.getMinutes();
    let endM = end.getHours() * 60 + end.getMinutes();

    // Handle crossing midnight (e.g. 2 AM < 10 PM)
    // If endM is less than startM, we assume it's next day, so add 24h
    if (endM < startM) {
      endM += 24 * 60;
    }

    // Now simply check range
    // Note: If current time 'minutes' is very small (e.g. 1 AM), and schedule is 10PM-2AM,
    // we need to handle "being in the late night window".
    // 1 AM = 60 mins. 10 PM = 1320. 2 AM (next day) = 1560.
    // 60 is NOT >= 1320.
    // So 'minutes' also needs to adjust if we are early morning?
    // OR, simpler approach:
    // Check if we are >= start OR <= end (if overnight).

    if (endM >= 1440) {
      // It's an overnight shift (e.g. 22:00 to 26:00/02:00)
      // We are in it if we are >= 22:00 (today) OR <= 02:00 (today)
      const visibleEndM = endM % 1440;
      return minutes >= startM || minutes < visibleEndM;
    } else {
      // Normal day shift
      return minutes >= startM && minutes < endM;
    }
  });
}
