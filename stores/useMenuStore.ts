import { extractMenuItemPlaceholderIconKey } from '@/lib/menuItemPlaceholderIcon'
import {
  Category,
  CustomPricing,
  Menu,
  MenuItemType,
  ModifierCategory,
  Schedule
} from '@/lib/types'
import {
  MenuItemIngredientSync,
  MenuWithCategories,
  ModifierIngredientSync,
  PosSyncData,
  PosSyncState
} from '@/types/menu'
import { create } from 'zustand'

// Re-export Category for components that import it from here
export type { Category } from '@/lib/types'

interface MenuState {
  // ============================================================
  // SYNC STATE - Data from API
  // ============================================================
  posSyncData: PosSyncData | null
  syncState: PosSyncState

  // ============================================================
  // DERIVED/LOCAL STATE - For backward compatibility
  // These are populated from posSyncData or used for local CRUD
  // ============================================================
  menuItems: MenuItemType[]
  categories: Category[]
  menus: Menu[]
  modifierGroups: ModifierCategory[]

  // ============================================================
  // O(1) LOOKUP MAPS - For instant data access
  // ============================================================
  menuItemsById: Record<string, MenuItemType>
  categoriesById: Record<string, Category>
  categoriesByName: Record<string, Category>
  menusById: Record<string, Menu>
  modifierGroupsById: Record<string, ModifierCategory>

  // Global scheduling toggle
  isMenuSchedulingEnabled: boolean

  // Per-menu overrides for category availability (does not remove the category)
  // map: menuId -> (categoryId -> isActive)
  menuCategoryOverrides: Record<string, Record<string, boolean>>
  temporaryActiveMenus: string[] // IDs of menus unlocked by PIN
  temporaryActiveCategories: string[] // Names of categories unlocked by PIN

  // Last selected menu (persisted to avoid blank state on launch)
  lastSelectedMenuId: string | null
  setLastSelectedMenuId: (id: string | null) => void

  // ============================================================
  // SYNC ACTIONS
  // ============================================================
  setMenuData: (data: PosSyncData) => void
  setSyncState: (state: Partial<PosSyncState>) => void
  clearMenuData: () => void

  // ============================================================
  // GETTERS - Derive data from posSyncData
  // ============================================================
  getMenusFromSync: () => MenuWithCategories[]
  getAllMenuItems: () => MenuItemType[]
  getAllCategories: () => Category[]

  // ============================================================
  // O(1) GETTERS - Instant lookups from Maps
  // ============================================================
  getMenuItemById: (id: string) => MenuItemType | undefined
  getCategoryById: (id: string) => Category | undefined
  getCategoryByName: (name: string) => Category | undefined
  getMenuById: (id: string) => Menu | undefined
  getModifierGroupById: (id: string) => ModifierCategory | undefined
  getModifierGroupsByIds: (ids: string[]) => ModifierCategory[]

  // ============================================================
  // CRUD Operations for Items (Optimistic/Local)
  // ============================================================
  addMenuItem: (item: Omit<MenuItemType, 'id'>) => void
  updateMenuItem: (id: string, updates: Partial<MenuItemType>) => void
  deleteMenuItem: (id: string) => void
  toggleItemAvailability: (id: string) => void

  // CRUD Operations for Categories
  addCategory: (
    category: Omit<Category, 'id' | 'createdAt'> & { id?: string }
  ) => void
  updateCategory: (id: string, updates: Partial<Category>) => void
  deleteCategory: (id: string) => void
  toggleCategoryActive: (id: string) => void
  // Toggle category visibility within a specific menu (adds/removes the category from that menu)
  toggleMenuCategoryActive: (menuId: string, categoryId: string) => void
  // Query helpers
  isCategoryActiveForMenu: (menuId: string, categoryId: string) => boolean
  reorderCategories: (categories: Category[]) => void

  // Category-Item relationship management
  addItemToCategory: (itemId: string, categoryName: string) => void
  removeItemFromCategory: (itemId: string, categoryName: string) => void
  getItemsInCategory: (categoryName: string) => MenuItemType[]

  // CRUD Operations for Menus
  addMenu: (
    menu: Omit<Menu, 'id' | 'createdAt' | 'updatedAt'> & { id?: string }
  ) => void
  updateMenu: (id: string, updates: Partial<Menu>) => void
  deleteMenu: (id: string) => void
  toggleMenuActive: (id: string) => void
  reorderMenus: (fromIndex: number, toIndex: number) => void
  reorderCategoryItems: (
    categoryId: string,
    fromIndex: number,
    toIndex: number
  ) => void
  reorderModifierGroups: (fromIndex: number, toIndex: number) => void
  reorderModifierOptions: (
    groupId: string,
    fromIndex: number,
    toIndex: number
  ) => void
  getMenuItems: (menuId: string) => MenuItemType[]

  // CRUD Operations for Modifier Groups
  addModifierGroup: (
    modifierGroup: Omit<ModifierCategory, 'id'> & { id?: string }
  ) => void
  updateModifierGroup: (id: string, updates: Partial<ModifierCategory>) => void
  deleteModifierGroup: (id: string) => void
  getModifierGroup: (id: string) => ModifierCategory | undefined

  // Scheduling
  setMenuSchedules: (id: string, schedules: Schedule[]) => void
  setCategorySchedules: (id: string, schedules: Schedule[]) => void
  isMenuAvailableNow: (id: string, at?: Date) => boolean
  isCategoryAvailableNow: (name: string, at?: Date) => boolean
  setMenuSchedulingEnabled: (isEnabled: boolean) => void

  // MENU STOCK (optional per-menu-item)
  decreaseMenuItemStock: (itemId: string, quantity: number) => void
  increaseMenuItemStock: (itemId: string, quantity: number) => void
  getLowStockMenuItems: () => MenuItemType[]

  // Stock tracking mode helpers
  getMenuItemStockTrackingMode: (
    itemId: string
  ) => 'in_stock' | 'out_of_stock' | 'quantity'
  setMenuItemStockTrackingMode: (
    itemId: string,
    mode: 'in_stock' | 'out_of_stock' | 'quantity',
    stockQuantity?: number,
    reorderThreshold?: number
  ) => void

  // Custom Pricing Operations
  addCustomPricing: (
    itemId: string,
    customPricing: Omit<CustomPricing, 'id' | 'createdAt' | 'updatedAt'>
  ) => void
  updateCustomPricing: (
    itemId: string,
    pricingId: string,
    updates: Partial<CustomPricing>
  ) => void
  deleteCustomPricing: (itemId: string, pricingId: string) => void
  toggleCustomPricingActive: (itemId: string, pricingId: string) => void

  // Optimistic update after backend price edit
  updateItemPriceOptimistic: (
    itemId: string,
    newPrice: number,
    context: {
      categoryId: string | null
      menuId: string | null
      cashPrice?: number | null
      availability?: boolean
    }
  ) => void

  // Category schedule info helper
  getCategoryScheduleInfo: (
    name: string,
    at?: Date
  ) => {
    daysAvailable: string[]
    availableToday: boolean
    timeframe: string | null
  }

  addTemporaryMenuAccess: (menuName: string) => void
  addTemporaryCategoryAccess: (categoryName: string) => void
  clearTemporaryAccess: () => void // Call this on logout

  // Merge standalone entities (categories, items, modifiers, menus)
  mergeStandaloneData: (data: {
    categories?: any[]
    items?: any[]
    modifierGroups?: any[]
    menus?: any[]
    menu_item_ingredients?: any[]
    modifier_group_item_ingredients?: any[]
  }) => void

  // Update recipes for existing items
  mergeRecipeData: (data: {
    menuRecipes: {
      menu_item_id: string
      inventory_item_id: string
      quantity: number
    }[]
    modifierRecipes: {
      modifier_group_item_id: string
      inventory_item_id: string
      quantity: number
    }[]
  }) => void
}

// Helper function to generate unique IDs
let nextId = 1000
const generateId = () => `${nextId++}`

let categoryId = 100
const generateCategoryId = () => `cat_${categoryId++}`

let menuId = 200
const generateMenuId = () => `menu_${menuId++}`

let modifierGroupId = 300
const generateModifierGroupId = () => `mod_${modifierGroupId++}`

// ============================================================
// TRANSFORM FUNCTIONS: Convert API types to legacy types
// ============================================================

// [Legacy transform functions removed]

/**
 * Transform nested items from all menus to flat MenuItemType[] format
 */
const transformMenuItemsFromSync = (
  syncMenus: MenuWithCategories[] | undefined | null,
  menuItemIngredients: MenuItemIngredientSync[] = []
): {
  menus: Menu[]
  categories: Category[]
  menuItems: MenuItemType[]
  menuItemsById: Record<string, MenuItemType>
} => {
  if (!syncMenus || !Array.isArray(syncMenus))
    return { menus: [], categories: [], menuItems: [], menuItemsById: {} }

  // Helper map for ingredients
  const ingredientsMap = new Map<
    string,
    { inventoryItemId: string; quantity: number }[]
  >()
  menuItemIngredients.forEach(ing => {
    let list = ingredientsMap.get(ing.menu_item_id)
    if (!list) {
      list = []
      ingredientsMap.set(ing.menu_item_id, list)
    }
    list.push({
      inventoryItemId: ing.inventory_item_id,
      quantity: ing.quantity
    })
  })

  const globalItemMap = new Map<string, MenuItemType>()

  // Helper to map Sync Item to Internal Item
  // This uses the "effective_price" which is ALREADY computed for the specific context by the backend
  const mapSyncItem = (
    syncItem: any,
    context: { menuId?: string; categoryId?: string }
  ): MenuItemType => {
    const dbItem = syncItem.menu_item || syncItem // Handle both wrapper and direct item
    const orderedModifierGroups = [...(dbItem.modifier_groups || [])].sort(
      (a: any, b: any) => {
        const orderDiff =
          getModifierDisplayOrder(a.display_order) -
          getModifierDisplayOrder(b.display_order)
        if (orderDiff !== 0) return orderDiff
        return (a.name || '').localeCompare(b.name || '')
      }
    )

    return {
      id: dbItem.id,
      name: dbItem.name,
      description: dbItem.description ?? undefined,
      // CRITICAL: specific price for this context
      price: dbItem.effective_price,
      cashPrice: dbItem.effective_cash_price ?? undefined,
      image: dbItem.image ?? undefined,
      meal: (dbItem.meal_types ?? []) as MenuItemType['meal'],
      category: (dbItem.categories || []).map((c: any) => c.name || c), // Fallback if categories logic differs
      allergens: dbItem.allergens ?? undefined,
      cardBgColor: dbItem.card_bg_color ?? undefined,
      placeholderIcon: extractMenuItemPlaceholderIconKey(
        dbItem.card_bg_color ?? undefined
      ),
      availability: dbItem.effective_availability,
      stockQuantity: dbItem.current_stock ?? undefined,
      stockTrackingMode: dbItem.stock_tracking_mode,
      modifierGroupIds: orderedModifierGroups.map((mg: any) => mg.id),
      priceLevels: dbItem.price_levels,
      priceSource: dbItem.price_source as MenuItemType['priceSource'],
      location_id: dbItem.location_id,
      // Map display order from the join table (syncItem) if available, or fallback
      displayOrder: syncItem.display_order ?? dbItem.display_order,
      // Map override fields for reference (though effective_price is what matters)
      menuPriceOverrides: context.menuId
        ? { [context.menuId]: dbItem.effective_price }
        : undefined,
      categoryPriceOverrides: context.categoryId
        ? { [context.categoryId]: dbItem.effective_price }
        : undefined,
      recipe: ingredientsMap.get(dbItem.id)
    }
  }

  // 1. Build the Menu Tree (Menu -> Category -> Item)
  const menus: Menu[] = syncMenus
    .map(menu => {
      const categories: Category[] = (menu.categories || []).map(catEntry => {
        // Map items specifically for this menu/category context
        const items = (catEntry.items || [])
          .sort((a, b) => {
            // Website Logic: Missing display_order goes to the BOTTOM
            const aOrder = a.display_order ?? 999999
            const bOrder = b.display_order ?? 999999
            const orderDiff = aOrder - bOrder
            if (orderDiff !== 0) return orderDiff
            // Fallback to name if order is missing or equal
            const nameA = a.menu_item?.name || ''
            const nameB = b.menu_item?.name || ''
            return nameA.localeCompare(nameB)
          })
          .map(itemEntry =>
            mapSyncItem(itemEntry, {
              menuId: menu.id,
              categoryId: catEntry.category_id
            })
          )

        return {
          id: catEntry.category.id, // Use actual Category ID
          name: catEntry.category.name,
          isActive: catEntry.is_active,
          order: catEntry.display_order,
          createdAt: new Date().toISOString(),
          location_id: catEntry.category.location_id,
          location_name: undefined, // Could map if available
          items: items // NESTED ITEMS specific to this context
        }
      })

      return {
        id: menu.id,
        name: menu.name,
        description: menu.description || undefined,
        isActive: menu.is_active,
        displayOrder: menu.display_order ?? undefined,
        categories: categories.sort((a, b) => {
          // Website Logic: Missing order goes to the BOTTOM
          const aOrder = a.displayOrder ?? a.order ?? 999999
          const bOrder = b.displayOrder ?? b.order ?? 999999
          const orderDiff = aOrder - bOrder
          if (orderDiff !== 0) return orderDiff
          return a.name.localeCompare(b.name)
        }), // Full Category Objects, sorted
        schedules: (menu.schedules || []).flatMap(s => {
          if (!s.schedule.is_active || !s.schedule.time_slots?.length) return []

          // API day_of_week: 0=Monday..6=Sunday → JS getDay(): 0=Sunday..6=Saturday
          const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
          const apiDayToJsDay = (apiDay: number): number => (apiDay + 1) % 7

          // Group time slots by start/end time to create Schedule objects
          const timeSlotGroups = new Map<
            string,
            { startTime: string; endTime: string; days: Set<string> }
          >()

          s.schedule.time_slots.forEach((ts: any) => {
            const startTime = ts.start_time || '00:00:00'
            const endTime = ts.end_time || '23:59:59'
            const key = `${startTime}-${endTime}`

            if (!timeSlotGroups.has(key)) {
              timeSlotGroups.set(key, { startTime, endTime, days: new Set() })
            }
            const jsDay = apiDayToJsDay(ts.day_of_week)
            timeSlotGroups.get(key)!.days.add(dayNames[jsDay])
          })

          return Array.from(timeSlotGroups.values()).map(group => ({
            id: `${s.id}-${group.startTime}-${group.endTime}`,
            name: s.schedule.name,
            startTime: group.startTime,
            endTime: group.endTime,
            days: Array.from(group.days),
            isActive: s.schedule.is_active
          }))
        }),
        createdAt: menu.created_at,
        updatedAt: menu.updated_at,
        location_id: menu.location_id
      }
    })
    .sort((a, b) => {
      // Website Logic: Missing display_order goes to the BOTTOM (Infinity/999999)
      const aOrder = a.displayOrder ?? 999999
      const bOrder = b.displayOrder ?? 999999
      const orderDiff = aOrder - bOrder
      if (orderDiff !== 0) return orderDiff
      return a.name.localeCompare(b.name)
    })

  // 2. Build Global Item Map (for "Item Library"/Inventory view)
  // We perform a second pass or extract from a specific "All Items" list if available
  // Assuming syncMenus covers all items is risky if there are orphan items.
  // Ideally, `pos_sync_data` has a top-level `items` array. checking types/menu.ts... it does NOT.
  // So we collect all unique items encountered in menus + categories.

  // Actually, wait. The user might want an "Item Library" that is distinct from menus.
  // But for now, let's populate the global map from the menu tree to ensure consistency.
  menus.forEach(menu => {
    menu.categories.forEach(cat => {
      ;(cat.items || []).forEach(item => {
        const existing = globalItemMap.get(item.id)
        if (!existing) {
          const basePrice =
            item.priceLevels?.level_2_location_item ??
            item.priceLevels?.level_1_base ??
            item.price

          globalItemMap.set(item.id, {
            ...item,
            price: basePrice,
            category: [cat.name],
            menuPriceOverrides: undefined,
            categoryPriceOverrides: undefined
          })
        } else {
          // Item already seen in another category — accumulate category name
          const cats = Array.isArray(existing.category) ? existing.category : []
          if (!cats.includes(cat.name)) {
            existing.category = [...cats, cat.name]
          }
        }
      })
    })
  })

  // 3. Extract Categories (Unique List)
  const categoryMap = new Map<string, Category>()
  menus.forEach(menu => {
    menu.categories.forEach(cat => {
      if (!categoryMap.has(cat.id)) {
        categoryMap.set(cat.id, { ...cat, items: undefined }) // Store categories flat without items for generic management
      }
    })
  })

  return {
    menus,
    categories: Array.from(categoryMap.values()),
    menuItems: Array.from(globalItemMap.values()),
    menuItemsById: Object.fromEntries(globalItemMap)
  }
}

const getModifierDisplayOrder = (value: number | null | undefined) =>
  value ?? 999999

const sortModifierGroups = <T extends { displayOrder?: number | null; name: string }>(
  groups: T[]
): T[] =>
  [...groups].sort((a, b) => {
    const orderDiff =
      getModifierDisplayOrder(a.displayOrder) -
      getModifierDisplayOrder(b.displayOrder)
    if (orderDiff !== 0) return orderDiff
    return a.name.localeCompare(b.name)
  })

const sortModifierOptions = <T extends { displayOrder?: number | null; name: string }>(
  options: T[]
): T[] =>
  [...options].sort((a, b) => {
    const orderDiff =
      getModifierDisplayOrder(a.displayOrder) -
      getModifierDisplayOrder(b.displayOrder)
    if (orderDiff !== 0) return orderDiff
    return a.name.localeCompare(b.name)
  })

/**
 * Transform modifier groups from all menu items to flat ModifierCategory[] format
 */
const transformModifierGroupsFromSync = (
  syncMenus: MenuWithCategories[] | undefined | null,
  modifierIngredients: ModifierIngredientSync[] = []
): ModifierCategory[] => {
  if (!syncMenus || !Array.isArray(syncMenus)) return []

  const ingredientsMap = new Map<
    string,
    { inventoryItemId: string; quantity: number }[]
  >()
  modifierIngredients.forEach(ing => {
    let list = ingredientsMap.get(ing.modifier_group_item_id)
    if (!list) {
      list = []
      ingredientsMap.set(ing.modifier_group_item_id, list)
    }
    list.push({
      inventoryItemId: ing.inventory_item_id,
      quantity: ing.quantity
    })
  })

  const modifierMap = new Map<string, ModifierCategory>()

  syncMenus.forEach(menu => {
    ;(menu.categories || []).forEach(catEntry => {
      ;(catEntry.items || []).forEach(catItem => {
        const menuItem = catItem.menu_item
        if (!menuItem) return
        ;(menuItem.modifier_groups || []).forEach(mg => {
          if (!modifierMap.has(mg.id)) {
            // Map API structure to legacy ModifierCategory format
            modifierMap.set(mg.id, {
              id: mg.id,
              name: mg.name,
              displayOrder: (mg as any).display_order ?? undefined,
              // Map is_required + min/max_selections to legacy type/selectionType
              type: mg.is_required ? 'required' : 'optional',
              selectionType: mg.max_selections === 1 ? 'single' : 'multiple',
              maxSelections: mg.max_selections,
              description: undefined, // API doesn't have description in this format
              // Map items (API) to options (legacy)
              options: sortModifierOptions(
                (mg.items || []).map(opt => ({
                  id: opt.id,
                  name: opt.name,
                  price: opt.price_modifier, // API uses price_modifier
                  displayOrder: opt.display_order ?? undefined,
                  isAvailable: opt.is_active,
                  isDefault: opt.is_default ?? false,
                  recipe: ingredientsMap.get(opt.id)
                }))
              ),
              location_id: (mg as any).location_id ?? undefined,
              location_name: (mg as any).location_name?.name ?? undefined
            })
          }
        })
      })
    })
  })

  return sortModifierGroups(Array.from(modifierMap.values()))
}

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
      lastSyncedAt: null
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

    // Last selected menu (persisted to avoid blank state)
    lastSelectedMenuId: null,
    setLastSelectedMenuId: id => set({ lastSelectedMenuId: id }),

    // ============================================================
    // SYNC ACTIONS
    // ============================================================
    setMenuData: (data: PosSyncData) => {
      // 1. Transform Menus, Categories, and Items (Tree Structure)
      const { menus, categories, menuItems, menuItemsById } =
        transformMenuItemsFromSync(
          data.menus,
          data.menu_item_ingredients as MenuItemIngredientSync[]
        )

      // 2. Transform Modifier Groups
      const modifierGroups = transformModifierGroupsFromSync(
        data.menus,
        data.modifier_group_item_ingredients as ModifierIngredientSync[]
      )

      // 3. Build O(1) lookup Maps
      const categoriesById: Record<string, Category> = {}
      const categoriesByName: Record<string, Category> = {}
      for (const cat of categories) {
        categoriesById[cat.id] = cat
        categoriesByName[cat.name] = cat
      }

      const menusById: Record<string, Menu> = {}
      for (const menu of menus) {
        menusById[menu.id] = menu
      }

      const modifierGroupsById: Record<string, ModifierCategory> = {}
      for (const mg of modifierGroups) {
        modifierGroupsById[mg.id] = mg
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
          lastSyncedAt: data.synced_at
        }
      })

      // Clear stale precomputed modifier cache so newly synced modifiers are picked up
      // Lazy require to avoid circular import: useMenuStore ↔ useModifierSidebarStore
      const { clearModifierPreWarmCache } = require('./useModifierSidebarStore')
      clearModifierPreWarmCache()

      console.log('Menu data set from sync:', {
        menusCount: menus.length,
        categoriesCount: categories.length,
        menuItemsCount: menuItems.length,
        modifierGroupsCount: modifierGroups.length
      })
    },

    setSyncState: (state: Partial<PosSyncState>) => {
      set(current => ({
        syncState: { ...current.syncState, ...state }
      }))
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
          lastSyncedAt: null
        }
      })
    },

    // ============================================================
    // GETTERS
    // ============================================================
    getMenusFromSync: () => {
      return get().posSyncData?.menus ?? []
    },

    getAllMenuItems: () => {
      return get().menuItems
    },

    getAllCategories: () => {
      return get().categories
    },

    // ============================================================
    // O(1) GETTERS - Instant lookups from Maps
    // ============================================================
    getMenuItemById: (id: string) => {
      return get().menuItemsById[id]
    },

    getCategoryById: (id: string) => {
      return get().categoriesById[id]
    },

    getCategoryByName: (name: string) => {
      return get().categoriesByName[name]
    },

    getMenuById: (id: string) => {
      return get().menusById[id]
    },

    getModifierGroupById: (id: string) => {
      return get().modifierGroupsById[id]
    },

    getModifierGroupsByIds: (ids: string[]) => {
      const map = get().modifierGroupsById
      return ids
        .map(id => map[id])
        .filter((mg): mg is ModifierCategory => mg !== undefined)
    },

    // ============================================================
    // CRUD Operations (Optimistic/Local)
    // ============================================================
    addMenuItem: itemData => {
      const newItem: MenuItemType = {
        ...itemData,
        // Use provided ID (from backend) if available, otherwise generate local ID
        id: (itemData as any).id || generateId(),
        // Default to "in_stock" mode (availability: true) unless explicitly set
        availability:
          itemData.availability !== undefined ? itemData.availability : true,
        // Default stock tracking mode to "in_stock" unless explicitly set
        stockTrackingMode: itemData.stockTrackingMode || 'in_stock'
      }

      set(state => ({
        menuItems: [...state.menuItems, newItem],
        // Keep O(1) Map in sync
        menuItemsById: { ...state.menuItemsById, [newItem.id]: newItem }
      }))

      // console.log("Menu item added:", newItem);
    },

    updateMenuItem: (id, updates) => {
      set(state => {
        const updatedItem = state.menuItemsById[id]
          ? { ...state.menuItemsById[id], ...updates }
          : undefined
        return {
          menuItems: state.menuItems.map(item =>
            item.id === id ? { ...item, ...updates } : item
          ),
          // Keep O(1) Map in sync
          menuItemsById: updatedItem
            ? { ...state.menuItemsById, [id]: updatedItem }
            : state.menuItemsById
        }
      })

      // console.log("Menu item updated:", id, updates);
    },

    deleteMenuItem: id => {
      set(state => {
        const { [id]: removed, ...restMenuItemsById } = state.menuItemsById
        return {
          menuItems: state.menuItems.filter(item => item.id !== id),
          // Keep O(1) Map in sync
          menuItemsById: restMenuItemsById
        }
      })

      console.log('Menu item deleted:', id)
    },

    toggleItemAvailability: id => {
      set(state => ({
        menuItems: state.menuItems.map(item =>
          item.id === id
            ? {
                ...item,
                availability: item.availability === false ? true : false
              }
            : item
        )
      }))

      console.log('Menu item availability toggled:', id)
    },

    // Category CRUD Operations
    addCategory: categoryData => {
      const newCategory: Category = {
        ...categoryData,
        id: (categoryData as any).id || generateCategoryId(),
        createdAt: new Date().toISOString()
      }

      set(state => ({
        categories: [...state.categories, newCategory],
        // Keep O(1) Maps in sync
        categoriesById: {
          ...state.categoriesById,
          [newCategory.id]: newCategory
        },
        categoriesByName: {
          ...state.categoriesByName,
          [newCategory.name]: newCategory
        }
      }))

      console.log('Category added:', newCategory)
    },

    updateCategory: (id, updates) => {
      set(state => {
        const existingCat = state.categoriesById[id]
        const updatedCategory = existingCat
          ? { ...existingCat, ...updates }
          : undefined

        // Handle name change - remove old name from categoriesByName
        let newCategoriesByName = { ...state.categoriesByName }
        if (
          updatedCategory &&
          updates.name &&
          existingCat.name !== updates.name
        ) {
          delete newCategoriesByName[existingCat.name]
          newCategoriesByName[updates.name] = updatedCategory
        } else if (updatedCategory) {
          newCategoriesByName[updatedCategory.name] = updatedCategory
        }

        return {
          categories: state.categories.map(category =>
            category.id === id ? { ...category, ...updates } : category
          ),
          // Keep O(1) Maps in sync
          categoriesById: updatedCategory
            ? { ...state.categoriesById, [id]: updatedCategory }
            : state.categoriesById,
          categoriesByName: newCategoriesByName
        }
      })

      console.log('Category updated:', id, updates)
    },

    deleteCategory: id => {
      set(state => {
        const categoryToRemove = state.categoriesById[id]
        const { [id]: removedById, ...restCategoriesById } =
          state.categoriesById
        const newCategoriesByName = categoryToRemove
          ? Object.fromEntries(
              Object.entries(state.categoriesByName).filter(
                ([name]) => name !== categoryToRemove.name
              )
            )
          : state.categoriesByName

        return {
          categories: state.categories.filter(category => category.id !== id),
          // Keep O(1) Maps in sync
          categoriesById: restCategoriesById,
          categoriesByName: newCategoriesByName
        }
      })

      console.log('Category deleted:', id)
    },

    toggleCategoryActive: id => {
      set(state => ({
        categories: state.categories.map(category =>
          category.id === id
            ? { ...category, isActive: !category.isActive }
            : category
        )
      }))

      console.log('Category active status toggled:', id)
    },

    // Toggle category availability only for a specific menu without removing the category
    toggleMenuCategoryActive: (menuId, categoryId) => {
      const state = get()
      const category = state.categories.find(c => c.id === categoryId)
      if (!category) {
        console.warn('toggleMenuCategoryActive: category not found', {
          menuId,
          categoryId
        })
        return
      }

      const currentOverrides = state.menuCategoryOverrides[menuId] || {}
      const currentValue = currentOverrides[categoryId]
      const nextValue = currentValue === undefined ? false : !currentValue // default to false (off) when first toggled

      set(current => ({
        menuCategoryOverrides: {
          ...current.menuCategoryOverrides,
          [menuId]: {
            ...(current.menuCategoryOverrides[menuId] || {}),
            [categoryId]: nextValue
          }
        }
      }))

      console.log('Menu-specific category availability toggled:', {
        menuId,
        categoryId,
        value: nextValue
      })
    },

    isCategoryActiveForMenu: (menuId, categoryId) => {
      const state = get()
      // global category must be active
      const category = state.categories.find(c => c.id === categoryId)
      if (!category || !category.isActive) return false

      // if category isn't part of the menu, treat as inactive for that menu
      const menu = state.menus.find(m => m.id === menuId)
      if (!menu || !menu.categories.some(c => c.id === category.id))
        return false

      const override = state.menuCategoryOverrides[menuId]?.[categoryId]
      // undefined means no override -> active; false means explicitly off
      return override !== false
    },

    reorderCategories: newCategories => {
      set(() => ({
        categories: newCategories
      }))

      console.log('Categories reordered')
    },

    // Category-Item relationship management
    addItemToCategory: (itemId, categoryName) => {
      set(state => ({
        menuItems: state.menuItems.map(item => {
          if (item.id === itemId) {
            // Convert single category to array if needed
            const currentCategories = Array.isArray(item.category)
              ? item.category
              : item.category
              ? [item.category]
              : []

            // Only add if not already present
            if (!currentCategories.includes(categoryName)) {
              return {
                ...item,
                category: [...currentCategories, categoryName]
              }
            }
          }
          return item
        })
      }))

      console.log('Item added to category:', itemId, categoryName)
    },

    removeItemFromCategory: (itemId, categoryName) => {
      set(state => ({
        menuItems: state.menuItems.map(item => {
          if (item.id === itemId) {
            // Convert single category to array if needed
            const currentCategories = Array.isArray(item.category)
              ? item.category
              : item.category
              ? [item.category]
              : []

            return {
              ...item,
              category: currentCategories.filter(cat => cat !== categoryName)
            }
          }
          return item
        })
      }))

      console.log('Item removed from category:', itemId, categoryName)
    },

    getItemsInCategory: (categoryName: string): MenuItemType[] => {
      const state = useMenuStore.getState()
      return state.menuItems.filter((item: MenuItemType) => {
        const categories = Array.isArray(item.category)
          ? item.category
          : item.category
          ? [item.category]
          : []
        return categories.includes(categoryName)
      })
    },

    // CRUD Operations for Menus
    addMenu: menuData => {
      const state = get()

      // Transform category names (strings) to full Category objects
      // The form passes strings, but the store needs objects
      const fullCategories = (menuData.categories || []).map(
        (catInput: any) => {
          if (typeof catInput === 'string') {
            // Look up by name
            const foundCat = state.categoriesByName[catInput]
            // If not found locally (rare), create a temporary stub or skip
            // Ideally we accept that we might not have it yet if it's brand new?
            // But add-menu flow ensures categories exist before selecting.
            return (
              foundCat || {
                id: `temp_${Math.random()}`,
                name: catInput,
                isActive: true,
                items: [],
                order: 0,
                schedules: []
              }
            )
          }
          return catInput
        }
      )

      const newMenu: Menu = {
        ...menuData,
        id: (menuData as any).id || generateMenuId(),
        categories: fullCategories,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        // Ensure location_id is passed through from menuData
        location_id: menuData.location_id
      }

      set(state => ({
        menus: [...state.menus, newMenu],
        // Keep O(1) Map in sync
        menusById: { ...state.menusById, [newMenu.id]: newMenu }
      }))

      console.log('Menu added with transformed categories:', newMenu)
    },

    updateMenu: (id, updates) => {
      set(state => {
        // Transform category names (strings) to full Category objects if present in updates
        let updatedCategories = undefined
        if (updates.categories) {
          updatedCategories = (updates.categories as any[]).map(
            (catInput: any) => {
              if (typeof catInput === 'string') {
                // Look up by name
                const foundCat = state.categoriesByName[catInput]
                return (
                  foundCat || {
                    id: `temp_${Math.random()}`,
                    name: catInput,
                    isActive: true,
                    items: [],
                    order: 0,
                    schedules: []
                  }
                )
              }
              return catInput
            }
          )
        }

        const finalUpdates = {
          ...updates,
          ...(updatedCategories ? { categories: updatedCategories } : {}),
          updatedAt: new Date().toISOString()
        }

        const updatedMenu = state.menusById[id]
          ? {
              ...state.menusById[id],
              ...finalUpdates
            }
          : undefined

        return {
          menus: state.menus.map(menu =>
            menu.id === id ? { ...menu, ...finalUpdates } : menu
          ),
          // Keep O(1) Map in sync
          menusById: updatedMenu
            ? { ...state.menusById, [id]: updatedMenu }
            : state.menusById
        }
      })

      console.log('Menu updated with transformed categories:', id)
    },

    deleteMenu: id => {
      set(state => {
        const { [id]: removed, ...restMenusById } = state.menusById
        return {
          menus: state.menus.filter(menu => menu.id !== id),
          // Keep O(1) Map in sync
          menusById: restMenusById
        }
      })

      console.log('Menu deleted:', id)
    },

    toggleMenuActive: id => {
      set(state => ({
        menus: state.menus.map(menu =>
          menu.id === id ? { ...menu, isActive: !menu.isActive } : menu
        )
      }))

      console.log('Menu active status toggled:', id)
    },

    reorderMenus: (fromIndex: number, toIndex: number) => {
      set(state => {
        const newMenus = [...state.menus]
        const [movedItem] = newMenus.splice(fromIndex, 1)
        newMenus.splice(toIndex, 0, movedItem)
        const normalizedMenus = newMenus.map((menu, idx) => ({
          ...menu,
          displayOrder: idx
        }))
        return { menus: normalizedMenus }
      })
    },

    reorderCategoryItems: (
      categoryId: string,
      fromIndex: number,
      toIndex: number
    ) => {
      set(state => {
        // Deep update: Find the category in ALL menus and reorder items
        // Since categories are shared across menus, reordering items in a Category usually affects that Category everywhere
        // (unless it's a menu-specific override, BUT `category_items` is the table, which is per-category).
        // `reorderCategoryItems` RPC updates `category_items` display_order.
        // So we should update the item order in EVERY menu instance that contains this category.

        const newMenus = state.menus.map(menu => {
          const catIndex = menu.categories.findIndex(c => c.id === categoryId)
          if (catIndex === -1) return menu

          const category = menu.categories[catIndex]
          if (!category.items) return menu

          const newItems = [...category.items]
          const [movedItem] = newItems.splice(fromIndex, 1)
          newItems.splice(toIndex, 0, movedItem)

          const newCategories = [...menu.categories]
          newCategories[catIndex] = {
            ...category,
            items: newItems
          }

          return { ...menu, categories: newCategories }
        })

        // Also update the global categories map if we track items there (we don't currently, they are undefined)

        return { menus: newMenus }
      })
    },

    reorderModifierGroups: (fromIndex, toIndex) => {
      set(state => {
        const nextGroups = [...state.modifierGroups]
        const [movedGroup] = nextGroups.splice(fromIndex, 1)
        if (!movedGroup) return {}
        nextGroups.splice(toIndex, 0, movedGroup)

        const normalizedGroups = nextGroups.map((group, index) => ({
          ...group,
          displayOrder: index
        }))

        return {
          modifierGroups: normalizedGroups,
          modifierGroupsById: Object.fromEntries(
            normalizedGroups.map(group => [group.id, group])
          )
        }
      })
    },

    reorderModifierOptions: (groupId, fromIndex, toIndex) => {
      set(state => {
        const existingGroup = state.modifierGroupsById[groupId]
        if (!existingGroup?.options?.length) return {}

        const nextOptions = [...existingGroup.options]
        const [movedOption] = nextOptions.splice(fromIndex, 1)
        if (!movedOption) return {}
        nextOptions.splice(toIndex, 0, movedOption)

        const normalizedOptions = nextOptions.map((option, index) => ({
          ...option,
          displayOrder: index
        }))

        const updatedGroup = {
          ...existingGroup,
          options: normalizedOptions
        }

        return {
          modifierGroups: state.modifierGroups.map(group =>
            group.id === groupId ? updatedGroup : group
          ),
          modifierGroupsById: {
            ...state.modifierGroupsById,
            [groupId]: updatedGroup
          }
        }
      })
    },

    getMenuItems: (menuId: string): MenuItemType[] => {
      const state = useMenuStore.getState()
      const menu = state.menus.find(m => m.id === menuId)
      if (!menu) return []

      // Get all items that belong to any of the menu's categories
      return state.menuItems.filter((item: MenuItemType) => {
        const itemCategories = Array.isArray(item.category)
          ? item.category
          : item.category
          ? [item.category]
          : []
        return menu.categories.some(cat => itemCategories.includes(cat.name))
      })
    },

    // CRUD Operations for Modifier Groups
    addModifierGroup: modifierGroupData => {
      const state = get()
      const newModifierGroup: ModifierCategory = {
        ...modifierGroupData,
        id: (modifierGroupData as any).id || generateModifierGroupId(),
        displayOrder:
          modifierGroupData.displayOrder ?? state.modifierGroups.length,
        options: (modifierGroupData.options || []).map((option, index) => ({
          ...option,
          displayOrder: option.displayOrder ?? index
        }))
      }

      const nextModifierGroups = sortModifierGroups([
        ...state.modifierGroups,
        newModifierGroup
      ])

      set(() => ({
        modifierGroups: nextModifierGroups,
        modifierGroupsById: Object.fromEntries(
          nextModifierGroups.map(group => [group.id, group])
        )
      }))

      console.log('Modifier group added:', newModifierGroup)
    },

    updateModifierGroup: (id, updates) => {
      set(state => {
        const updatedModifierGroup = state.modifierGroupsById[id]
          ? {
              ...state.modifierGroupsById[id],
              ...updates,
              options: updates.options
                ? sortModifierOptions(
                    updates.options.map((option, index) => ({
                      ...option,
                      displayOrder: option.displayOrder ?? index
                    }))
                  )
                : state.modifierGroupsById[id].options
            }
          : undefined
        const nextModifierGroups = updatedModifierGroup
          ? sortModifierGroups(
              state.modifierGroups.map(modifierGroup =>
                modifierGroup.id === id ? updatedModifierGroup : modifierGroup
              )
            )
          : state.modifierGroups
        return {
          modifierGroups: nextModifierGroups,
          // Keep O(1) Map in sync
          modifierGroupsById: updatedModifierGroup
            ? Object.fromEntries(
                nextModifierGroups.map(group => [group.id, group])
              )
            : state.modifierGroupsById
        }
      })

      console.log('Modifier group updated:', id, updates)
    },

    deleteModifierGroup: id => {
      set(state => {
        const { [id]: removed, ...restModifierGroupsById } =
          state.modifierGroupsById

        // Also update menuItemsById for any items that reference this modifier group
        const updatedMenuItemsById = { ...state.menuItemsById }
        const updatedMenuItems = state.menuItems.map(item => {
          if (!item.modifierGroupIds || item.modifierGroupIds.length === 0) {
            return item
          }

          const filteredIds = item.modifierGroupIds.filter(
            modId => modId !== id
          )

          if (filteredIds.length !== item.modifierGroupIds.length) {
            const updatedItem = { ...item, modifierGroupIds: filteredIds }
            updatedMenuItemsById[item.id] = updatedItem
            return updatedItem
          }

          return item
        })

        return {
          // Remove the modifier group from the central registry
          modifierGroups: state.modifierGroups.filter(
            modifierGroup => modifierGroup.id !== id
          ),
          // Keep O(1) Map in sync
          modifierGroupsById: restModifierGroupsById,
          // Cascade remove the ID reference from all menu items
          menuItems: updatedMenuItems,
          menuItemsById: updatedMenuItemsById
        }
      })

      console.log('Modifier group deleted (with cascade):', id)
    },

    getModifierGroup: (id: string): ModifierCategory | undefined => {
      // Use O(1) lookup instead of .find()
      return useMenuStore.getState().modifierGroupsById[id]
    },

    // Scheduling
    setMenuSchedules: (id: string, schedules: Schedule[]) => {
      set(state => ({
        menus: state.menus.map((m: Menu) =>
          m.id === id ? { ...m, schedules } : m
        )
      }))
    },
    setCategorySchedules: (id: string, schedules: Schedule[]) => {
      set(state => ({
        categories: state.categories.map((c: Category) =>
          c.id === id ? { ...c, schedules } : c
        )
      }))
    },
    isMenuAvailableNow: (id: string, at?: Date): boolean => {
      const state = get()
      const menu = state.menus.find((m: Menu) => m.id === id)
      if (!menu) return false
      if (!menu.isActive) return false
      // If global scheduling is disabled, treat as always available when active
      if (!state.isMenuSchedulingEnabled) return true
      if (!menu.schedules || menu.schedules.length === 0) return true
      return isNowInAnySchedule(menu.schedules, at)
    },
    isCategoryAvailableNow: (name: string, at?: Date): boolean => {
      const state = get()
      const cat = state.categories.find((c: Category) => c.name === name)
      if (!cat) return false
      if (!cat.isActive) return false
      // If global scheduling is disabled, treat as always available when active
      if (!state.isMenuSchedulingEnabled) return true
      if (!cat.schedules || cat.schedules.length === 0) return true
      return isNowInAnySchedule(cat.schedules, at)
    },
    setMenuSchedulingEnabled: (isEnabled: boolean) =>
      set(() => ({ isMenuSchedulingEnabled: isEnabled })),

    // Custom Pricing Operations
    addCustomPricing: (itemId, customPricing) => {
      const now = new Date().toISOString()
      const newPricing: CustomPricing = {
        ...customPricing,
        id: `pricing_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
        createdAt: now,
        updatedAt: now
      }

      set(state => ({
        menuItems: state.menuItems.map(item => {
          if (item.id === itemId) {
            const existingPricing = item.customPricing || []
            return {
              ...item,
              customPricing: [...existingPricing, newPricing]
            }
          }
          return item
        })
      }))
    },

    decreaseMenuItemStock: (itemId, quantity) => {
      set(state => ({
        menuItems: state.menuItems.map(item => {
          if (item.id === itemId) {
            // Only decrease stock if item is in "quantity" tracking mode
            if (typeof item.stockQuantity === 'number') {
              const newStock = Math.max(0, item.stockQuantity - quantity)
              return {
                ...item,
                stockQuantity: newStock,
                // If stock reaches 0, set availability to false
                availability: newStock === 0 ? false : item.availability
              } as typeof item
            }
            // For "in_stock" mode, just return the item unchanged
            // For "out_of_stock" mode, item remains out of stock
            return item
          }
          return item
        })
      }))
    },

    updateCustomPricing: (itemId, pricingId, updates) => {
      set(state => ({
        menuItems: state.menuItems.map(item => {
          if (item.id === itemId && item.customPricing) {
            return {
              ...item,
              customPricing: item.customPricing.map(pricing => {
                if (pricing.id === pricingId) {
                  return {
                    ...pricing,
                    ...updates,
                    updatedAt: new Date().toISOString()
                  }
                }
                return pricing
              })
            }
          }
          return item
        })
      }))
    },

    increaseMenuItemStock: (itemId, quantity) => {
      set(state => ({
        menuItems: state.menuItems.map(item => {
          if (item.id === itemId) {
            // Only increase stock if item is in "quantity" tracking mode
            if (typeof item.stockQuantity === 'number') {
              const newStock = item.stockQuantity + quantity
              return {
                ...item,
                stockQuantity: newStock,
                // If stock becomes > 0, set availability to true
                availability: newStock > 0 ? true : item.availability
              } as typeof item
            }
            // For "in_stock" mode, just return the item unchanged
            // For "out_of_stock" mode, item remains out of stock
            return item
          }
          return item
        })
      }))
    },

    deleteCustomPricing: (itemId, pricingId) => {
      set(state => ({
        menuItems: state.menuItems.map(item => {
          if (item.id === itemId && item.customPricing) {
            return {
              ...item,
              customPricing: item.customPricing.filter(
                pricing => pricing.id !== pricingId
              )
            }
          }
          return item
        })
      }))
    },

    toggleCustomPricingActive: (itemId, pricingId) => {
      set(state => ({
        menuItems: state.menuItems.map(item => {
          if (item.id === itemId && item.customPricing) {
            return {
              ...item,
              customPricing: item.customPricing.map(pricing => {
                if (pricing.id === pricingId) {
                  return {
                    ...pricing,
                    isActive: !pricing.isActive,
                    updatedAt: new Date().toISOString()
                  }
                }
                return pricing
              })
            }
          }
          return item
        })
      }))
    },

    // NEW: Optimistic update after backend price edit
    updateItemPriceOptimistic: (itemId, newPrice, context) => {
      set(state => {
        let updatedMenuItems = state.menuItems
        const updatedMenuItemsById = { ...state.menuItemsById }

        // Build partial update object
        const itemUpdates: Partial<MenuItemType> = { price: newPrice }
        if (context.cashPrice !== undefined) {
          itemUpdates.cashPrice = context.cashPrice ?? undefined
        }
        if (context.availability !== undefined) {
          itemUpdates.availability = context.availability
        }

        // 1. Update Global Item (Library) if Level 2 (No Context)
        if (!context.menuId && !context.categoryId) {
          const item = state.menuItemsById[itemId]
          if (item) {
            const updatedItem = { ...item, ...itemUpdates }
            // Also update base price / level_2
            if (updatedItem.priceLevels) {
              updatedItem.priceLevels = {
                ...updatedItem.priceLevels,
                level_2_location_item: newPrice
              }
            }

            updatedMenuItems = state.menuItems.map(i =>
              i.id === itemId ? updatedItem : i
            )
            updatedMenuItemsById[itemId] = updatedItem
          }
        }

        // Always sync availability to menuItems/menuItemsById regardless of context level
        if (context.availability !== undefined) {
          const item =
            updatedMenuItemsById[itemId] ?? state.menuItemsById[itemId]
          if (item) {
            const updatedItem = { ...item, availability: context.availability }
            updatedMenuItems = (
              updatedMenuItems === state.menuItems
                ? state.menuItems
                : updatedMenuItems
            ).map(i => (i.id === itemId ? updatedItem : i))
            updatedMenuItemsById[itemId] = updatedItem
          }
        }

        // 2. Update Tree Instances (Menu -> Category -> Item)
        const updatedMenus = state.menus.map(menu => {
          if (context.menuId && menu.id !== context.menuId) return menu

          const updatedCategories = menu.categories.map(cat => {
            if (context.categoryId && cat.id !== context.categoryId) return cat
            if (!cat.items) return cat

            const updatedItems = cat.items.map(item => {
              if (item.id === itemId) {
                return { ...item, ...itemUpdates }
              }
              return item
            })

            if (updatedItems === cat.items) return cat
            return { ...cat, items: updatedItems }
          })

          if (updatedCategories === menu.categories) return menu
          return { ...menu, categories: updatedCategories }
        })

        return {
          menuItems: updatedMenuItems,
          menuItemsById: updatedMenuItemsById,
          menus: updatedMenus
        }
      })

      console.log(
        `[useMenuStore] Optimistically updated price for item ${itemId} to ${newPrice}`,
        context
      )
    },

    getLowStockMenuItems: () => {
      return get().menuItems.filter(
        item =>
          typeof item.reorderThreshold === 'number' &&
          typeof item.stockQuantity === 'number' &&
          item.stockQuantity <= item.reorderThreshold
      )
    },

    // Stock tracking mode helpers
    getMenuItemStockTrackingMode: (itemId: string) => {
      const item = get().menuItems.find(item => item.id === itemId)
      if (!item) return 'in_stock' // Default fallback

      // Return stored stockTrackingMode if it exists
      if (item.stockTrackingMode) {
        return item.stockTrackingMode
      }

      // Fallback: Determine mode based on item properties for backward compatibility
      if (typeof item.stockQuantity === 'number' && item.stockQuantity > 0) {
        return 'quantity'
      } else if (item.availability === false) {
        return 'out_of_stock'
      } else {
        return 'in_stock'
      }
    },

    setMenuItemStockTrackingMode: (
      itemId: string,
      mode: 'in_stock' | 'out_of_stock' | 'quantity',
      stockQuantity?: number,
      reorderThreshold?: number
    ) => {
      set(state => ({
        menuItems: state.menuItems.map(item => {
          if (item.id === itemId) {
            let updatedItem = { ...item }

            // Store the stock tracking mode
            updatedItem.stockTrackingMode = mode

            if (mode === 'in_stock') {
              updatedItem.availability = true
              updatedItem.stockQuantity = undefined
              updatedItem.reorderThreshold = undefined
            } else if (mode === 'out_of_stock') {
              updatedItem.availability = false
              updatedItem.stockQuantity = undefined
              updatedItem.reorderThreshold = undefined
            } else if (mode === 'quantity') {
              updatedItem.availability = undefined
              updatedItem.stockQuantity = stockQuantity
              updatedItem.reorderThreshold = reorderThreshold
            }

            return updatedItem
          }
          return item
        })
      }))
    },

    // Category schedule info helper
    getCategoryScheduleInfo: (name: string, at?: Date) => {
      const state = get()
      const cat = state.categories.find(c => c.name === name)
      const schedules = (cat?.schedules || []).filter(r => r.isActive)
      const daysAvailable = Array.from(
        new Set(schedules.flatMap(r => r.days))
      ) as string[]
      const now = at ?? new Date()
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      const todayKey = dayNames[now.getDay()]
      const todays = schedules.filter(r => r.days.includes(todayKey as any))
      const availableToday = todays.length > 0

      // If multiple windows today, return the first window as timeframe (or join)
      const formatTime = (t: string) => {
        return new Date(t).toLocaleTimeString([], {
          hour: 'numeric',
          minute: '2-digit'
        })
      }
      let timeframe: string | null = null
      if (availableToday) {
        // Combine all windows into comma-separated ranges
        timeframe = todays
          .map(r => `${formatTime(r.startTime)} to ${formatTime(r.endTime)}`)
          .join(', ')
      }

      return { daysAvailable, availableToday, timeframe }
    },
    addTemporaryMenuAccess: menuName => {
      set(state => ({
        temporaryActiveMenus: [
          ...new Set([...state.temporaryActiveMenus, menuName])
        ]
      }))
    },

    addTemporaryCategoryAccess: categoryName => {
      set(state => ({
        temporaryActiveCategories: [
          ...new Set([...state.temporaryActiveCategories, categoryName])
        ]
      }))
    },

    clearTemporaryAccess: () => {
      set({ temporaryActiveMenus: [], temporaryActiveCategories: [] })
    },

    // Merge standalone entities (categories, items, modifiers not in any menu)
    mergeStandaloneData: data => {
      set(state => {
        const newCategories = [...state.categories]
        const newCategoriesById = { ...state.categoriesById }
        const newCategoriesByName = { ...state.categoriesByName }

        const newMenuItems = [...state.menuItems]
        const newMenuItemsById = { ...state.menuItemsById }

        const newModifierGroups = [...state.modifierGroups]
        const newModifierGroupsById = { ...state.modifierGroupsById }

        // Merge standalone categories AND their nested items
        // First map ingredients if provided
        const menuItemIngredientsMap = new Map<string, any[]>()
        if (data.menu_item_ingredients) {
          data.menu_item_ingredients.forEach((ing: any) => {
            if (!menuItemIngredientsMap.has(ing.menu_item_id)) {
              menuItemIngredientsMap.set(ing.menu_item_id, [])
            }
            menuItemIngredientsMap.get(ing.menu_item_id)?.push({
              inventoryItemId: ing.inventory_item_id,
              quantity: ing.quantity
            })
          })
        }

        const modifierIngredientsMap = new Map<string, any[]>()
        if (data.modifier_group_item_ingredients) {
          data.modifier_group_item_ingredients.forEach((ing: any) => {
            if (!modifierIngredientsMap.has(ing.modifier_group_item_id)) {
              modifierIngredientsMap.set(ing.modifier_group_item_id, [])
            }
            modifierIngredientsMap.get(ing.modifier_group_item_id)?.push({
              inventoryItemId: ing.inventory_item_id,
              quantity: ing.quantity
            })
          })
        }

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
                location_name: cat.location_name ?? undefined
              }

              newCategories.push(mappedCategory)
              newCategoriesById[cat.id] = mappedCategory
              newCategoriesByName[cat.name] = mappedCategory
            }

            // Extract items from this category's items array
            const categoryItems = cat.items || []
            for (const catItem of categoryItems) {
              const menuItem = catItem.menu_item
              if (!menuItem) continue

              const itemId = menuItem.id || catItem.menu_item_id

              // If item already exists, add this category name to its categories
              if (newMenuItemsById[itemId]) {
                const existingItem = newMenuItemsById[itemId]
                const existingCategories = Array.isArray(existingItem.category)
                  ? existingItem.category
                  : existingItem.category
                  ? [existingItem.category]
                  : []

                // Add category name if not already present
                if (!existingCategories.includes(cat.name)) {
                  existingItem.category = [...existingCategories, cat.name]
                }

                // Patch location_id if missing
                if (
                  !existingItem.location_id &&
                  (menuItem as any).location_id
                ) {
                  existingItem.location_id = (menuItem as any).location_id
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
                      .stock_tracking_mode as MenuItemType['stockTrackingMode']) ??
                    'in_stock',
                  location_id: (menuItem as any).location_id ?? null,
                  recipe: menuItemIngredientsMap.get(itemId) // Attach recipe
                }

                newMenuItems.push(mappedItem)
                newMenuItemsById[itemId] = mappedItem
              }
            }
          }
        }

        // Merge standalone items
        if (data.items) {
          for (const item of data.items) {
            // Update existing item with location_id if missing (category items may lack this field)
            if (newMenuItemsById[item.id]) {
              const existing = newMenuItemsById[item.id]
              if (existing.location_id === null && item.location_id !== null) {
                existing.location_id = item.location_id
              }
              continue
            }

            // Map category names from the item
            const categoryNames = (item.categories || []).map(
              (c: { name: string }) => c.name
            )

            const mappedItem: MenuItemType = {
              id: item.id,
              name: item.name,
              description: item.description ?? undefined,
              price: item.effective_price ?? item.base_price ?? 0,
              cashPrice:
                item.effective_cash_price ?? item.base_cash_price ?? undefined,
              availability: item.effective_availability ?? true,
              category: categoryNames,
              meal: (item as any).meal_types ?? [],
              stockTrackingMode:
                (item.stock_tracking_mode as MenuItemType['stockTrackingMode']) ??
                'in_stock',
              location_id: item.location_id ?? null,
              recipe: menuItemIngredientsMap.get(item.id) // Attach recipe
            }

            newMenuItems.push(mappedItem)
            newMenuItemsById[item.id] = mappedItem
          }
        }

        // Merge standalone modifier groups
        if (data.modifierGroups) {
          for (const mg of data.modifierGroups) {
            const existingModifier = newModifierGroupsById[mg.id]

            // Existing groups from menu sync can miss ownership metadata.
            // Backfill those fields from standalone payload to avoid mislabeling locals as global.
            if (existingModifier) {
              const standaloneOptions = (mg.modifier_group_items || []).map(
                (opt: any) => ({
                  id: opt.id,
                  name: opt.name,
                  price: opt.price_modifier ?? 0,
                  displayOrder: opt.display_order ?? undefined,
                  isAvailable: opt.is_active ?? true,
                  isDefault: opt.is_default ?? false,
                  recipe: modifierIngredientsMap.get(opt.id)
                })
              )

              const shouldPatchLocationId =
                (existingModifier.location_id === undefined ||
                  existingModifier.location_id === null) &&
                mg.location_id !== undefined &&
                mg.location_id !== null
              const shouldPatchLocationName =
                !existingModifier.location_name && !!mg.location_name?.name
              const shouldPatchDisplayOrder =
                existingModifier.displayOrder !==
                (mg.display_order ?? existingModifier.displayOrder)
              const shouldPatchItems =
                (!existingModifier.items ||
                  existingModifier.items.length === 0) &&
                Array.isArray(mg.menu_item_modifier_groups) &&
                mg.menu_item_modifier_groups.length > 0
              const shouldPatchOptions =
                standaloneOptions.length > 0 &&
                (existingModifier.options.length === 0 ||
                  standaloneOptions.some((standaloneOpt: any) => {
                    const existingOpt = existingModifier.options.find(
                      opt => opt.id === standaloneOpt.id
                    )
                    return (
                      !existingOpt ||
                      (existingOpt.displayOrder ?? null) !==
                        (standaloneOpt.displayOrder ?? null) ||
                      (existingOpt.isDefault ?? false) !==
                        standaloneOpt.isDefault
                    )
                  }))

              if (
                shouldPatchLocationId ||
                shouldPatchLocationName ||
                shouldPatchDisplayOrder ||
                shouldPatchItems ||
                shouldPatchOptions
              ) {
                const patchedModifier: ModifierCategory = {
                  ...existingModifier,
                  displayOrder: shouldPatchDisplayOrder
                    ? mg.display_order ?? existingModifier.displayOrder
                    : existingModifier.displayOrder,
                  location_id: shouldPatchLocationId
                    ? mg.location_id
                    : existingModifier.location_id,
                  location_name: shouldPatchLocationName
                    ? mg.location_name?.name
                    : existingModifier.location_name,
                  items: shouldPatchItems
                    ? (mg.menu_item_modifier_groups || []).map((mimg: any) => ({
                        id: mimg.menu_item.id,
                        name: mimg.menu_item.name,
                        price: mimg.menu_item.price,
                        image: mimg.menu_item.image,
                        availability: mimg.menu_item.availability ?? true,
                        category: [],
                        meal: []
                      }))
                    : existingModifier.items,
                  options: shouldPatchOptions
                    ? sortModifierOptions(standaloneOptions)
                    : existingModifier.options
                }

                newModifierGroupsById[mg.id] = patchedModifier

                const idx = newModifierGroups.findIndex(
                  modifierGroup => modifierGroup.id === mg.id
                )
                if (idx !== -1) {
                  newModifierGroups[idx] = patchedModifier
                }
              }

              continue
            }

            const mappedModifier: ModifierCategory = {
              id: mg.id,
              name: mg.name,
              displayOrder: mg.display_order ?? undefined,
              description: mg.description ?? undefined,
              type: mg.is_required ? 'required' : 'optional',
              selectionType: mg.max_selections === 1 ? 'single' : 'multiple',
              maxSelections: mg.max_selections ?? undefined,
              options: sortModifierOptions(
                (mg.modifier_group_items || []).map((opt: any) => ({
                  id: opt.id,
                  name: opt.name,
                  price: opt.price_modifier ?? 0,
                  displayOrder: opt.display_order ?? undefined,
                  isAvailable: opt.is_active ?? true,
                  isDefault: opt.is_default ?? false,
                  recipe: modifierIngredientsMap.get(opt.id) // Attach recipe
                }))
              ),
              location_id: mg.location_id,
              location_name: mg.location_name?.name,
              items: (mg.menu_item_modifier_groups || []).map((mimg: any) => ({
                id: mimg.menu_item.id,
                name: mimg.menu_item.name,
                price: mimg.menu_item.price,
                image: mimg.menu_item.image,
                availability: mimg.menu_item.availability ?? true,
                category: [], // Minimal data needed for display
                meal: []
              }))
            }

            newModifierGroups.push(mappedModifier)
            newModifierGroupsById[mg.id] = mappedModifier
          }
        }

        // Merge standalone menus (includes inactive menus not in main sync)
        if (data.menus) {
          const newMenus = [...state.menus]
          const newMenusById = { ...state.menusById }

          for (const menu of data.menus) {
            // Skip if already exists (was in main sync)
            if (newMenusById[menu.id]) continue

            // Map menu_categories to actual Category objects from store
            const menuCategories = (menu.menu_categories || [])
              .map(
                (mc: {
                  category_id: string
                  display_order: number | null
                  is_active: boolean
                }) => {
                  const category = newCategoriesById[mc.category_id]
                  if (!category) return null
                  return {
                    ...category,
                    isActive: mc.is_active,
                    order: mc.display_order ?? category.order
                  }
                }
              )
              .filter(Boolean) as Category[]

            const mappedMenu: Menu = {
              id: menu.id,
              name: menu.name,
              description: menu.description ?? '',
              isActive: menu.is_active ?? true,
              categories: menuCategories, // Now populated with actual categories!
              schedules: [],
              createdAt: menu.created_at ?? new Date().toISOString(),
              updatedAt: menu.created_at ?? new Date().toISOString(),
              location_id: menu.location_id ?? null
            }

            newMenus.push(mappedMenu)
            newMenusById[menu.id] = mappedMenu
          }

          return {
            categories: newCategories,
            categoriesById: newCategoriesById,
            categoriesByName: newCategoriesByName,
            menuItems: newMenuItems,
            menuItemsById: newMenuItemsById,
            modifierGroups: sortModifierGroups(newModifierGroups),
            modifierGroupsById: Object.fromEntries(
              sortModifierGroups(newModifierGroups).map(group => [
                group.id,
                group
              ])
            ),
            menus: newMenus,
            menusById: newMenusById
          }
        }

        return {
          categories: newCategories,
          categoriesById: newCategoriesById,
          categoriesByName: newCategoriesByName,
          menuItems: newMenuItems,
          menuItemsById: newMenuItemsById,
          modifierGroups: sortModifierGroups(newModifierGroups),
          modifierGroupsById: Object.fromEntries(
            sortModifierGroups(newModifierGroups).map(group => [
              group.id,
              group
            ])
          )
        }
      })
    },

    mergeRecipeData: data => {
      set(state => {
        // 1. Create Lookup Maps
        const menuRecipeMap = new Map<
          string,
          { inventoryItemId: string; quantity: number }[]
        >()
        if (data.menuRecipes) {
          data.menuRecipes.forEach(r => {
            if (!menuRecipeMap.has(r.menu_item_id)) {
              menuRecipeMap.set(r.menu_item_id, [])
            }
            menuRecipeMap.get(r.menu_item_id)?.push({
              inventoryItemId: r.inventory_item_id,
              quantity: r.quantity
            })
          })
        }

        const modRecipeMap = new Map<
          string,
          { inventoryItemId: string; quantity: number }[]
        >()
        if (data.modifierRecipes) {
          data.modifierRecipes.forEach(r => {
            if (!modRecipeMap.has(r.modifier_group_item_id)) {
              modRecipeMap.set(r.modifier_group_item_id, [])
            }
            modRecipeMap.get(r.modifier_group_item_id)?.push({
              inventoryItemId: r.inventory_item_id,
              quantity: r.quantity
            })
          })
        }

        // 2. Update Menu Items
        let menuItemsChanged = false
        const newMenuItems = state.menuItems.map(item => {
          const recipe = menuRecipeMap.get(item.id)
          if (recipe) {
            menuItemsChanged = true
            return { ...item, recipe }
          }
          return item
        })

        const newMenuItemsById = { ...state.menuItemsById }
        if (menuItemsChanged) {
          newMenuItems.forEach(item => {
            newMenuItemsById[item.id] = item
          })
        }

        // 3. Update Modifier Groups
        let modifierGroupsChanged = false
        const newModifierGroups = state.modifierGroups.map(mg => {
          let optionsChanged = false
          const newOptions = mg.options.map(opt => {
            const recipe = modRecipeMap.get(opt.id)
            if (recipe) {
              optionsChanged = true
              return { ...opt, recipe }
            }
            return opt
          })

          if (optionsChanged) {
            modifierGroupsChanged = true
            return { ...mg, options: newOptions }
          }
          return mg
        })

        const newModifierGroupsById = { ...state.modifierGroupsById }
        if (modifierGroupsChanged) {
          newModifierGroups.forEach(mg => {
            newModifierGroupsById[mg.id] = mg
          })
        }

        console.log('DEBUG: mergeRecipeData complete', {
          menuItemsChanged,
          modifierGroupsChanged,
          menuRecipesMapped: menuRecipeMap.size,
          modRecipesMapped: modRecipeMap.size
        })

        return {
          menuItems: newMenuItems,
          menuItemsById: newMenuItemsById,
          modifierGroups: newModifierGroups,
          modifierGroupsById: newModifierGroupsById
        }
      })
    }
  }
})

// No selector hooks - use the store directly to avoid recursion

function isNowInAnySchedule (schedules: Schedule[], at?: Date): boolean {
  const now = at ?? new Date()
  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const day = dayNames[now.getDay()]
  const minutes = now.getHours() * 60 + now.getMinutes()

  // Helper to parse time string (HH:MM:SS or HH:MM format) to minutes since midnight
  const parseTimeToMinutes = (timeStr: string): number => {
    if (!timeStr) return 0

    // Handle ISO date strings (if timeStr contains 'T' or is a full ISO date)
    if (timeStr.includes('T') || timeStr.includes('-')) {
      const date = new Date(timeStr)
      if (!isNaN(date.getTime())) {
        return date.getHours() * 60 + date.getMinutes()
      }
    }

    // Handle HH:MM:SS or HH:MM format
    const parts = timeStr.split(':')
    if (parts.length >= 2) {
      const hours = parseInt(parts[0], 10) || 0
      const mins = parseInt(parts[1], 10) || 0
      return hours * 60 + mins
    }

    return 0
  }

  return schedules.some(rule => {
    if (!rule.isActive) return false
    if (!rule.days || rule.days.length === 0) return false
    if (!rule.days.includes(day)) return false

    // Parse time strings to minutes since midnight
    const startM = parseTimeToMinutes(rule.startTime)
    let endM = parseTimeToMinutes(rule.endTime)

    // Handle crossing midnight (e.g. 2 AM < 10 PM)
    // If endM is less than startM, we assume it's next day, so add 24h
    if (endM < startM) {
      endM += 24 * 60
    }

    // Check if current time falls within the schedule
    if (endM >= 1440) {
      // It's an overnight shift (e.g. 22:00 to 26:00/02:00)
      // We are in it if we are >= start (today) OR < end (today)
      const visibleEndM = endM % 1440
      return minutes >= startM || minutes < visibleEndM
    } else {
      // Normal day shift
      return minutes >= startM && minutes < endM
    }
  })
}
