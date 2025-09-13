import { ALL_MODIFIER_GROUPS, MOCK_MENU_ITEMS } from "@/lib/mockData";
import { Menu, MenuItemType, ModifierCategory, Schedule } from "@/lib/types";
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

  // INVENTORY ACTIONS
  decreaseStock: (itemId: string, quantity: number) => void;
  increaseStock: (itemId: string, quantity: number) => void;
  getLowStockItems: () => MenuItemType[];
}

// Helper function to generate unique IDs
let nextId = 1000;
const generateId = () => `menu_${nextId++}`;

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
    // // CRUD Operations
    addMenuItem: (itemData) => {
      const newItem: MenuItemType = {
        ...itemData,
        id: generateId(),
      };

      set((state) => ({
        menuItems: [...state.menuItems, newItem],
      }));

      console.log("Menu item added:", newItem);
    },

    updateMenuItem: (id, updates) => {
      set((state) => ({
        menuItems: state.menuItems.map((item) =>
          item.id === id ? { ...item, ...updates } : item
        ),
      }));

      console.log("Menu item updated:", id, updates);
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
      if (!menu.schedules || menu.schedules.length === 0) return true;
      return isNowInAnySchedule(menu.schedules, at);
    },
    isCategoryAvailableNow: (name: string, at?: Date): boolean => {
      const state = get();
      const cat = state.categories.find((c: Category) => c.name === name);
      if (!cat) return false;
      if (!cat.isActive) return false;
      if (!cat.schedules || cat.schedules.length === 0) return true;
      return isNowInAnySchedule(cat.schedules, at);
    },
    decreaseStock: (itemId, quantity) => {
      set((state) => ({
        menuItems: state.menuItems.map((item) => {
          if (item.id === itemId) {
            const newStock = Math.max(0, item.stock - quantity);
            return {
              ...item,
              stock: newStock,
              status: newStock === 0 ? "Out of Stock" : item.status,
            };
          }
          return item;
        }),
      }));
    },

    increaseStock: (itemId, quantity) => {
      set((state) => ({
        menuItems: state.menuItems.map((item) => {
          if (item.id === itemId) {
            const newStock = item.stock + quantity;
            return {
              ...item,
              stock: newStock,
              status:
                item.status === "Out of Stock" && newStock > 0
                  ? "Active"
                  : item.status,
            };
          }
          return item;
        }),
      }));
    },

    getLowStockItems: () => {
      return get().menuItems.filter(
        (item) => item.parLevel && item.stock < item.parLevel
      );
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
