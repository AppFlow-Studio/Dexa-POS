import { ALL_MODIFIER_GROUPS, MOCK_MENU_ITEMS } from "@/lib/mockData";
import { CustomPricing, Menu, MenuItemType, ModifierCategory, Schedule } from "@/lib/types";
import { create } from "zustand";

export interface Category {
  id: string;
  name: string;
  isActive: boolean;
  order: number;
  createdAt: string;
  schedules?: Schedule[];
}

interface MenuState {
  // Core menu data
  menuItems: MenuItemType[];
  categories: Category[];
  menus: Menu[];
  modifierGroups: ModifierCategory[];

  // Global scheduling toggle
  isMenuSchedulingEnabled: boolean;

  // Per-menu overrides for category availability (does not remove the category)
  // map: menuId -> (categoryId -> isActive)
  menuCategoryOverrides: Record<string, Record<string, boolean>>;

  // CRUD Operations for Items
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
  getMenuItemStockTrackingMode: (itemId: string) => "in_stock" | "out_of_stock" | "quantity";
  setMenuItemStockTrackingMode: (itemId: string, mode: "in_stock" | "out_of_stock" | "quantity", stockQuantity?: number, reorderThreshold?: number) => void;
  // Custom Pricing Operations
  addCustomPricing: (itemId: string, customPricing: Omit<CustomPricing, "id" | "createdAt" | "updatedAt">) => void;
  updateCustomPricing: (itemId: string, pricingId: string, updates: Partial<CustomPricing>) => void;
  deleteCustomPricing: (itemId: string, pricingId: string) => void;
  toggleCustomPricingActive: (itemId: string, pricingId: string) => void;
  getItemPriceForCategory: (itemId: string, categoryId: string) => number;

  // Category schedule info helper
  getCategoryScheduleInfo: (
    name: string,
    at?: Date
  ) => { daysAvailable: string[]; availableToday: boolean; timeframe: string | null };

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

// Initial categories from existing menu items
const getInitialCategories = (): Category[] => {
  // Flatten all categories from items (since category is now an array)
  const allCategories = MOCK_MENU_ITEMS.flatMap((item) =>
    Array.isArray(item.category) ? item.category : [item.category]
  );
  const uniqueCategories = Array.from(new Set(allCategories));
  return uniqueCategories.map((categoryName, index) => ({
    id: generateCategoryId(),
    name: categoryName,
    isActive: true,
    order: index + 1,
    createdAt: new Date().toISOString(),
    schedules: [],
  }));
};

// Initial menus
const getInitialMenus = (): Menu[] => {
  return [
    {
      id: generateMenuId(),
      name: "Main Menu",
      description: "Our complete dining experience",
      isActive: true,
      categories: ["Appetizers", "Main Course", "Dessert"],
      schedules: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: generateMenuId(),
      name: "Lunch Specials",
      description: "Quick and delicious lunch options",
      isActive: true,
      categories: ["Main Course", "Sides"],
      schedules: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
};

export const useMenuStore = create<MenuState>((set, get) => {
  // Initial state from mock data
  const initialCategories = getInitialCategories();
  const initialMenus = getInitialMenus();
  const initialModifierGroups = ALL_MODIFIER_GROUPS;
  return {
    menuItems: MOCK_MENU_ITEMS,
    categories: initialCategories,
    menus: initialMenus,
    modifierGroups: initialModifierGroups,
    isMenuSchedulingEnabled: true,
    menuCategoryOverrides: {},
    // // CRUD Operations
    addMenuItem: (itemData) => {
      const newItem: MenuItemType = {
        ...itemData,
        id: generateId(),
        // Default to "in_stock" mode (availability: true) unless explicitly set
        availability: itemData.availability !== undefined ? itemData.availability : true,
        // Default stock tracking mode to "in_stock" unless explicitly set
        stockTrackingMode: itemData.stockTrackingMode || "in_stock",
      };

      set((state) => ({
        menuItems: [...state.menuItems, newItem],
      }));

      // console.log("Menu item added:", newItem);
    },

    updateMenuItem: (id, updates) => {
      set((state) => ({
        menuItems: state.menuItems.map((item) =>
          item.id === id ? { ...item, ...updates } : item
        ),
      }));

      // console.log("Menu item updated:", id, updates);
    },

    deleteMenuItem: (id) => {
      set((state) => ({
        menuItems: state.menuItems.filter((item) => item.id !== id),
      }));

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
      }));

      console.log("Category added:", newCategory);
    },

    updateCategory: (id, updates) => {
      set((state) => ({
        categories: state.categories.map((category) =>
          category.id === id ? { ...category, ...updates } : category
        ),
      }));

      console.log("Category updated:", id, updates);
    },

    deleteCategory: (id) => {
      set((state) => ({
        categories: state.categories.filter((category) => category.id !== id),
      }));

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
        console.warn("toggleMenuCategoryActive: category not found", { menuId, categoryId });
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

      console.log("Menu-specific category availability toggled:", { menuId, categoryId, value: nextValue });
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
      }));

      console.log("Menu added:", newMenu);
    },

    updateMenu: (id, updates) => {
      set((state) => ({
        menus: state.menus.map((menu) =>
          menu.id === id
            ? { ...menu, ...updates, updatedAt: new Date().toISOString() }
            : menu
        ),
      }));

      console.log("Menu updated:", id, updates);
    },

    deleteMenu: (id) => {
      set((state) => ({
        menus: state.menus.filter((menu) => menu.id !== id),
      }));

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
      }));

      console.log("Modifier group added:", newModifierGroup);
    },

    updateModifierGroup: (id, updates) => {
      set((state) => ({
        modifierGroups: state.modifierGroups.map((modifierGroup) =>
          modifierGroup.id === id
            ? { ...modifierGroup, ...updates }
            : modifierGroup
        ),
      }));

      console.log("Modifier group updated:", id, updates);
    },

    deleteModifierGroup: (id) => {
      set((state) => ({
        // Remove the modifier group from the registry
        modifierGroups: state.modifierGroups.filter(
          (modifierGroup) => modifierGroup.id !== id
        ),
        // Cascade remove from all menu items that reference it
        menuItems: state.menuItems.map((item) => {
          if (!item.modifiers || item.modifiers.length === 0) return item;
          const filtered = item.modifiers.filter((m) => m.id !== id);
          // Only change object if something was removed
          if (filtered.length !== item.modifiers.length) {
            return {
              ...item,
              modifiers: filtered.length > 0 ? filtered : undefined,
            } as typeof item;
          }
          return item;
        }),
      }));

      console.log("Modifier group deleted (with cascade):", id);
    },

    getModifierGroup: (id: string): ModifierCategory | undefined => {
      const state = useMenuStore.getState();
      return state.modifierGroups.find(
        (modifierGroup) => modifierGroup.id === id
      );
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
      const item = get().menuItems.find((item) => item.id === itemId.split('|')[0]);
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
      const item = get().menuItems.find(item => item.id === itemId);
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

    setMenuItemStockTrackingMode: (itemId: string, mode: "in_stock" | "out_of_stock" | "quantity", stockQuantity?: number, reorderThreshold?: number) => {
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
        const [h, m] = t.split(":").map(Number);
        const d = new Date();
        d.setHours(h, m || 0, 0, 0);
        return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
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
    const [sh, sm] = rule.startTime.split(":").map(Number);
    const [eh, em] = rule.endTime.split(":").map(Number);
    const startM = sh * 60 + (sm || 0);
    const endM = eh * 60 + (em || 0);
    if (endM >= startM) {
      return minutes >= startM && minutes < endM;
    }
    // overnight window case
    return minutes >= startM || minutes < endM;
  });
}
