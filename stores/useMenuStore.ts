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
  getItemPriceForCategory: (itemId: string, categoryId: string) => number;

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

/**
 * Transform MenuWithCategories[] from API to legacy Menu[] format
 */
const transformMenusFromSync = (
  syncMenus: MenuWithCategories[] | undefined | null
): Menu[] => {
  if (!syncMenus || !Array.isArray(syncMenus)) return [];

  // Helper to convert day_of_week number to day name
  // Assuming: 0 = Monday, 1 = Tuesday, ..., 6 = Sunday (confirm with backend)
  const dayNumberToName = (dayNum: number): string => {
    const days = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return days[dayNum] || "";
  };

  // Helper to convert HH:MM:SS to ISO string (for now, use today's date)
  // TODO: Backend should return ISO format directly
  const timeToISO = (timeStr: string): string => {
    if (!timeStr) return "";
    // If already ISO format, return as-is
    if (timeStr.includes("T")) return timeStr;
    // Convert HH:MM:SS to ISO
    const [hours, minutes] = timeStr.split(":");
    const date = new Date();
    date.setHours(parseInt(hours, 10), parseInt(minutes, 10), 0, 0);
    return date.toISOString();
  };

  return syncMenus.map((menu) => ({
    id: menu.id,
    name: menu.name,
    description: menu.description ?? undefined,
    isActive: menu.is_active,
    // Extract category names from the nested category object
    categories: (menu.categories || []).map(
      (catEntry) => catEntry.category?.name || ""
    ),
    // Transform nested schedule structure to legacy format
    schedules: (menu.schedules || []).map((schEntry) => {
      const schedule = schEntry.schedule;
      if (!schedule) {
        return {
          id: schEntry.id,
          name: "",
          startTime: "",
          endTime: "",
          days: [],
          isActive: false,
        };
      }

      // Extract unique days from time_slots
      const timeSlots = schedule.time_slots || [];
      const days = [
        ...new Set(timeSlots.map((slot) => dayNumberToName(slot.day_of_week))),
      ].filter(Boolean);

      // Use the first time slot's times (assuming consistent times across days)
      const firstSlot = timeSlots[0];

      return {
        id: schedule.id,
        name: schedule.name || "",
        startTime: firstSlot ? timeToISO(firstSlot.start_time) : "",
        endTime: firstSlot ? timeToISO(firstSlot.end_time) : "",
        days,
        isActive: schedule.is_active,
      };
    }),
    createdAt: menu.created_at,
    updatedAt: menu.updated_at,
  }));
};

/**
 * Transform nested categories from all menus to flat Category[] format
 */
const transformCategoriesFromSync = (
  syncMenus: MenuWithCategories[] | undefined | null
): Category[] => {
  if (!syncMenus || !Array.isArray(syncMenus)) return [];

  const categoryMap = new Map<string, Category>();

  syncMenus.forEach((menu) => {
    (menu.categories || []).forEach((catEntry) => {
      const cat = catEntry.category;
      if (!cat) return;

      if (!categoryMap.has(cat.id)) {
        categoryMap.set(cat.id, {
          id: cat.id,
          name: cat.name,
          isActive: catEntry.is_active,
          order: catEntry.display_order,
          createdAt: new Date().toISOString(), // API doesn't provide this
          schedules: [], // Categories in API don't have schedules at category level
        });
      }
    });
  });

  return Array.from(categoryMap.values());
};

/**
 * Transform nested items from all menus to flat MenuItemType[] format
 */
const transformMenuItemsFromSync = (
  syncMenus: MenuWithCategories[] | undefined | null
): MenuItemType[] => {
  if (!syncMenus || !Array.isArray(syncMenus)) return [];

  const itemMap = new Map<string, MenuItemType>();

  syncMenus.forEach((menu) => {
    (menu.categories || []).forEach((catEntry) => {
      const categoryName = catEntry.category?.name || "";

      (catEntry.items || []).forEach((catItem) => {
        const item = catItem.menu_item;
        if (!item) return;

        const existingItem = itemMap.get(item.id);

        // Build category array (item can be in multiple categories)
        const categoryNames = existingItem?.category
          ? Array.isArray(existingItem.category)
            ? existingItem.category
            : [existingItem.category]
          : [];

        if (categoryName && !categoryNames.includes(categoryName)) {
          categoryNames.push(categoryName);
        }

        itemMap.set(item.id, {
          id: item.id,
          name: item.name,
          description: item.description ?? undefined,
          price: item.effective_price,
          cashPrice: item.effective_cash_price ?? undefined,
          image: item.image ?? undefined,
          meal: (item.meal_types ?? []) as MenuItemType["meal"],
          category: categoryNames,
          allergens: item.allergens ?? undefined,
          cardBgColor: item.card_bg_color ?? undefined,
          availability: item.effective_availability,
          stockQuantity: item.current_stock ?? undefined,
          stockTrackingMode: item.stock_tracking_mode,
          // Map modifier groups to IDs (legacy format uses IDs)
          modifierGroupIds: (item.modifier_groups || []).map((mg) => mg.id),
        });
      });
    });
  });

  return Array.from(itemMap.values());
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
      // Transform API data to legacy formats for backward compatibility
      const menus = transformMenusFromSync(data.menus);
      const categories = transformCategoriesFromSync(data.menus);
      const menuItems = transformMenuItemsFromSync(data.menus);
      const modifierGroups = transformModifierGroupsFromSync(data.menus);

      // Build O(1) lookup Maps for instant access
      const menuItemsById: Record<string, MenuItemType> = {};
      for (const item of menuItems) {
        menuItemsById[item.id] = item;
      }

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
        categoriesById: { ...state.categoriesById, [newCategory.id]: newCategory },
        categoriesByName: { ...state.categoriesByName, [newCategory.name]: newCategory },
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
        if (updatedCategory && updates.name && existingCat.name !== updates.name) {
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
        const { [id]: removedById, ...restCategoriesById } = state.categoriesById;
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
      if (!menu || !menu.categories.includes(category.name)) return false;

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
          ? { ...state.menusById[id], ...updates, updatedAt: new Date().toISOString() }
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
        return menu.categories.some((categoryName) =>
          itemCategories.includes(categoryName)
        );
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

    getItemPriceForCategory: (itemId, categoryId) => {
      // OPTIMIZED: Use O(1) lookup via menuItemsById instead of O(n) find
      const baseId = itemId.split("|")[0];
      const item = get().menuItemsById[baseId];
      if (!item) return 0;

      // Check for custom pricing for this category
      if (item.customPricing) {
        const customPricing = item.customPricing.find(
          (pricing) => pricing.categoryId === categoryId && pricing.isActive
        );
        if (customPricing) {
          return customPricing.price;
        }
      }
      // Return default price if no custom pricing found
      return item.price;
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
