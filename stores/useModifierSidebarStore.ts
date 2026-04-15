import { CartItem, MenuItemType, ModifierCategory } from '@/lib/types'
import { create } from 'zustand'
import { useMenuStore } from './useMenuStore'
import { useSeatingStore } from './useSeatingStore'

// ============================================================================
// SYNCHRONOUS TOUCH BLOCKING - For same-frame menu blocking
// ============================================================================
// Module-level ref for instant, same-frame touch blocking
// This blocks touches BEFORE React render cycle completes
let menuBlockedSyncRef = false

/** Set menu blocked state synchronously (same frame) */
export const setMenuBlockedSync = (blocked: boolean) => {
  menuBlockedSyncRef = blocked
}

/** Check if menu is blocked synchronously (O(1), no React) */
export const isMenuBlockedSync = () => menuBlockedSyncRef

// ============================================================================
// PRE-WARM CACHE - Precompute modifier data ahead of store open()
// OPTIMIZED: Persist entries with TTL (5 min) - no delete on consume for re-tap speed
// ============================================================================
const PREWARM_TTL_MS = 5 * 60 * 1000 // 5 minutes

type PreWarmEntry = {
  data: ReturnType<typeof precomputeModifierData>
  createdAt: number
}

const preWarmCache = new Map<string, PreWarmEntry>()

/** Clear all cached precomputed modifier data. Call after menu sync to avoid stale modifiers. */
export function clearModifierPreWarmCache () {
  preWarmCache.clear()
}

function getOrEvictCache (itemId: string): PreWarmEntry | undefined {
  const entry = preWarmCache.get(itemId)
  if (!entry) return undefined
  if (Date.now() - entry.createdAt > PREWARM_TTL_MS) {
    preWarmCache.delete(itemId)
    return undefined
  }
  return entry
}

// Pre-computed modifier selections for instant UI
interface ModifierSelection {
  [categoryId: string]: {
    [optionId: string]: boolean | 'no'
  }
}

// Position data for attached modifier panel
interface ItemPosition {
  y: number
  height: number
  absoluteY?: number // Absolute Y position on screen
}

interface ModifierSidebarState {
  isOpen: boolean
  mode: 'add' | 'edit' | 'view' | 'fullscreen'
  menuItem: MenuItemType | null
  cartItem: CartItem | null
  categoryId: string | null
  menuId: string | null // Menu context for price lookup

  // ============================================================
  // MENU BLOCKING & POSITION - For inline overlay pattern
  // ============================================================
  isMenuBlocked: boolean // Block menu input during modifier editing
  selectedItemPosition: ItemPosition | null // Position of selected item in bill
  activeEditingItemId: string | null // Track which cart item is being edited (for visual highlight)

  // ============================================================
  // PRE-COMPUTED DATA - For instant ModifierScreen render
  // ============================================================
  precomputedModifiers: ModifierCategory[] | null
  precomputedCategoriesById: Map<string, ModifierCategory> | null
  precomputedOptionsById: Map<
    string,
    { option: any; categoryId: string; categoryName: string }
  > | null
  initialSelections: ModifierSelection | null
  itemPrice: number
  itemCashPrice: number // Cash price for the item in current context
  activeModifierCategory: string | null
  precomputedForItemId: string | null // Track which item precomputed values are for (prevents race conditions)
  draftCreatedId: string | null // Draft item ID created by open(), null if not created

  seatOverride: number | null // null = shared / use active seat
  setSeatOverride: (seat: number | null) => void

  preWarm: (item: MenuItemType, categoryId?: string, menuId?: string) => void
  preWarmMany: (
    items: MenuItemType[],
    categoryId?: string,
    menuId?: string
  ) => void
  open: (config: {
    menuItem?: MenuItemType
    cartItem?: CartItem
    categoryId?: string
    menuId?: string
    includeMenuItemInState?: boolean
  }) => void
  openToAdd: (
    item: MenuItemType,
    orderId: string | null,
    categoryId?: string,
    menuId?: string
  ) => void
  openToEdit: (item: CartItem, orderId: string | null) => void
  openToView: (item: CartItem, orderId: string | null) => void
  openFullscreen: (
    item: MenuItemType,
    orderId: string | null,
    categoryId?: string,
    menuId?: string
  ) => void
  openFullscreenEdit: (item: CartItem, orderId: string | null) => void
  close: () => void
  cancelAndRemoveDraft: () => void // Cancel and remove draft item if adding new
  setSelectedItemPosition: (position: ItemPosition | null) => void
}

/**
 * Pre-compute modifier data for instant UI rendering
 * This moves the heavy computation OUT of the render cycle
 *
 * OPTIMIZED:
 * - Uses item.price immediately (no O(n) menu search blocking)
 * - Menu-context price lookup deferred via queueMicrotask
 * - Lazy modifier selections (only true values set, component uses ?? false)
 */
function precomputeModifierData (
  item: MenuItemType,
  categoryId: string | undefined,
  menuId: string | undefined,
  cartItem: CartItem | null = null,
  setFn?: ((partial: Partial<ModifierSidebarState>) => void) | null
): {
  modifiers: ModifierCategory[]
  modifierCategoriesById: Map<string, ModifierCategory>
  optionsById: Map<
    string,
    { option: any; categoryId: string; categoryName: string }
  >
  initialSelections: ModifierSelection
  itemPrice: number
  itemCashPrice: number
  activeCategory: string | null
  forItemId: string
} {
  const { getModifierGroupsByIds, menusById } = useMenuStore.getState()

  // O(1) lookup for modifier groups instead of O(n) .find() calls
  const modifiers = item.modifierGroupIds
    ? getModifierGroupsByIds(item.modifierGroupIds)
    : []

  // OPTIMIZED: Use item price immediately (no blocking menu search)
  let itemPrice = item.price
  let itemCashPrice = item.cashPrice ?? item.price

  // OPTIMIZED: Defer menu-context price lookup to background
  // This prevents blocking the UI while still getting accurate prices
  if (menuId && setFn) {
    queueMicrotask(() => {
      const menu = menusById[menuId]
      if (menu?.categories) {
        for (const cat of menu.categories) {
          const menuItem = cat.items?.find(mi => mi.id === item.id)
          if (menuItem) {
            // Only update if price differs from item default
            if (menuItem.price !== item.price) {
              setFn({
                itemPrice: menuItem.price,
                itemCashPrice: menuItem.cashPrice ?? menuItem.price
              })
            }
            break
          }
        }
      }
    })
  }

  // OPTIMIZED: Lazy modifier selections - only set true values
  // Components use (selection ?? false) pattern for unset options
  const initialSelections: ModifierSelection = {}
  modifiers.forEach(category => {
    initialSelections[category.id] = {}

    if (cartItem) {
      // For edit mode, only restore existing TRUE selections from cart item
      const existingModifier = cartItem.customizations.modifiers?.find(
        mod => mod.categoryId === category.id
      )

      if (existingModifier) {
        existingModifier.options.forEach(selectedOption => {
          initialSelections[category.id][selectedOption.id] =
            selectedOption.isNo ? 'no' : true
        })
      }
      // OPTIMIZATION: Skip setting false values - component uses ?? false
    } else {
      // For add mode, auto-select defaults
      const defaultOptions = category.options.filter(
        option => option.isDefault === true && option.isAvailable !== false
      )

      if (defaultOptions.length > 0) {
        // For single-select, use the first default; for multiple, use all defaults
        if (category.selectionType === 'single') {
          initialSelections[category.id][defaultOptions[0].id] = true
        } else {
          // Multiple selection - select all defaults
          defaultOptions.forEach(option => {
            initialSelections[category.id][option.id] = true
          })
        }
      } else if (category.type === 'required') {
        // No defaults set on required category - select first available option with price $0
        const freeOption = category.options.find(
          option => option.isAvailable !== false && option.price === 0
        )

        if (freeOption) {
          initialSelections[category.id][freeOption.id] = true
        } else {
          // Priority 3: No free option - select first available option
          const firstAvailableOption = category.options.find(
            option => option.isAvailable !== false
          )
          if (firstAvailableOption) {
            initialSelections[category.id][firstAvailableOption.id] = true
          }
        }
      }
      // OPTIMIZATION: Skip setting false values - component uses ?? false
    }
  })

  // Set first category as active
  const activeCategory = modifiers.length > 0 ? modifiers[0].id : null

  // Build Maps once here — ModifierScreen uses them for O(1) lookups (no per-render work)
  const modifierCategoriesById = new Map<string, ModifierCategory>()
  const optionsById = new Map<
    string,
    { option: any; categoryId: string; categoryName: string }
  >()
  modifiers.forEach(category => {
    modifierCategoriesById.set(category.id, category)
    category.options.forEach(option => {
      optionsById.set(option.id, {
        option,
        categoryId: category.id,
        categoryName: category.name
      })
    })
  })

  return {
    modifiers,
    modifierCategoriesById,
    optionsById,
    initialSelections,
    itemPrice,
    itemCashPrice,
    activeCategory,
    forItemId: item.id
  }
}

/**
 * Create a draft item immediately during open() for instant cart feedback.
 * Mirrors the logic from ModifierScreen's draft useEffect but runs synchronously in the store.
 * Returns the draft ID if created, null otherwise.
 */
function _createDraftInOpen (
  sourceItem: MenuItemType,
  itemPrice: number,
  itemCashPrice: number,
  categoryId: string | undefined,
  menuId: string | undefined
): string | null {
  const { useOrderStore } = require('./useOrderStore')
  const { activeOrderId, ordersById, addItemToActiveOrder } =
    useOrderStore.getState()

  const activeOrder = activeOrderId ? ordersById[activeOrderId] : null
  if (!activeOrder) return null

  const { useSeatingStore } = require('./useSeatingStore')
  const activeSeat = useSeatingStore.getState().getActiveSeat(activeOrderId)

  const stableDraftId = `draft_${sourceItem.id}`

  // Check if draft already exists
  const existingDraft = activeOrder.items.find(
    (i: any) => i.id === stableDraftId
  )
  if (existingDraft) return existingDraft.id

  // Check for existing identical unsent item (no modifiers, no notes, not sent)
  const existingItem = activeOrder.items.find((i: any) => {
    if (i.menuItemId !== sourceItem.id) return false
    const hasModifiers =
      i.customizations.modifiers && i.customizations.modifiers.length > 0
    const hasNotes =
      i.customizations.notes && i.customizations.notes.trim() !== ''
    const hasSent = i.kitchen_status === 'sent'
    return !hasModifiers && !hasNotes && !hasSent
  })

  if (existingItem) return null

  const cashPrice = itemCashPrice || itemPrice
  const draftItem = {
    id: stableDraftId,
    menuItemId: sourceItem.id,
    name: sourceItem.name,
    quantity: 1,
    originalPrice: cashPrice,
    price: itemPrice,
    unitPrice: sourceItem.price,
    cashPrice: cashPrice,
    image: sourceItem.image,
    isDraft: true,
    seatNumber: activeSeat ?? undefined,
    customizations: { modifiers: [], notes: '' },
    availableDiscount: sourceItem.availableDiscount,
    appliedDiscount: null,
    paidQuantity: 0,
    addedFromCategoryId: categoryId || null,
    addedFromMenuId: menuId || null
  }

  addItemToActiveOrder(draftItem)
  return stableDraftId
}

export const useModifierSidebarStore = create<ModifierSidebarState>(
  (set, get) => ({
    isOpen: false,
    mode: 'add',
    menuItem: null,
    cartItem: null,
    categoryId: null,
    menuId: null,

    // Menu blocking & position
    isMenuBlocked: false,
    selectedItemPosition: null,
    activeEditingItemId: null, // Track which bill item is being edited

    // Seat override for per-seat ordering
    seatOverride: null,
    setSeatOverride: (seat: number | null) => set({ seatOverride: seat }),

    // Pre-computed data starts empty
    precomputedModifiers: null,
    precomputedCategoriesById: null,
    precomputedOptionsById: null,
    initialSelections: null,
    itemPrice: 0,
    itemCashPrice: 0,
    activeModifierCategory: null,
    precomputedForItemId: null,
    draftCreatedId: null,

    preWarm: (item, categoryId, menuId) => {
      const existing = getOrEvictCache(item.id)
      if (existing) return
      // Compute WITHOUT setFn — no deferred price update yet; open() will handle it
      const result = precomputeModifierData(
        item,
        categoryId,
        menuId,
        null,
        null
      )
      preWarmCache.set(item.id, { data: result, createdAt: Date.now() })
    },

    preWarmMany: (items, categoryId, menuId) => {
      const now = Date.now()
      for (const item of items) {
        if (item.modifierGroupIds && item.modifierGroupIds.length > 0) {
          const existing = getOrEvictCache(item.id)
          if (existing) continue
          const result = precomputeModifierData(
            item,
            categoryId,
            menuId,
            null,
            null
          )
          preWarmCache.set(item.id, { data: result, createdAt: now })
        }
      }
    },

    open: config => {
      const {
        menuItem: menuItemParam,
        cartItem: cartItemParam,
        categoryId: catId,
        menuId: mId,
        includeMenuItemInState
      } = config

      // CRITICAL: Block touches synchronously FIRST (same frame, before React)
      setMenuBlockedSync(true)

      // Resolve the source menu item
      let sourceItem: MenuItemType | null = menuItemParam ?? null
      if (!sourceItem && cartItemParam) {
        const { getMenuItemById } = useMenuStore.getState()
        sourceItem = getMenuItemById(cartItemParam.menuItemId) ?? null
      }

      if (sourceItem) {
        // Resolve category/menu from cart item context if not provided directly
        const resolvedCatId =
          catId || cartItemParam?.addedFromCategoryId || undefined
        const resolvedMenuId =
          mId || cartItemParam?.addedFromMenuId || undefined

        // Check preWarm cache first (persisted, not deleted on consume for re-tap speed)
        const cachedEntry = getOrEvictCache(sourceItem.id)
        let precomputed: ReturnType<typeof precomputeModifierData>

        if (cachedEntry) {
          precomputed = cachedEntry.data

          // Edit mode: cache was built without cartItem → initialSelections are defaults.
          // Override with the actual cart item modifier selections.
          if (cartItemParam) {
            const cartItemSelections: ModifierSelection = {}
            precomputed.modifiers.forEach(category => {
              cartItemSelections[category.id] = {}
              const existingMod = cartItemParam.customizations.modifiers?.find(
                mod => mod.categoryId === category.id
              )
              if (existingMod) {
                existingMod.options.forEach(opt => {
                  cartItemSelections[category.id][opt.id] = opt.isNo
                    ? 'no'
                    : true
                })
              }
            })
            precomputed = {
              ...precomputed,
              initialSelections: cartItemSelections
            }
          }

          // PreWarm skipped setFn, so schedule deferred price lookup if menuId exists
          if (resolvedMenuId) {
            const { menusById } = useMenuStore.getState()
            const itemRef = sourceItem
            queueMicrotask(() => {
              const menu = menusById[resolvedMenuId]
              if (menu?.categories) {
                for (const cat of menu.categories) {
                  const mi = cat.items?.find(i => i.id === itemRef.id)
                  if (mi) {
                    if (mi.price !== itemRef.price) {
                      set({
                        itemPrice: mi.price,
                        itemCashPrice: mi.cashPrice ?? mi.price
                      })
                    }
                    break
                  }
                }
              }
            })
          }
        } else {
          precomputed = precomputeModifierData(
            sourceItem,
            resolvedCatId,
            resolvedMenuId,
            cartItemParam ?? null,
            set
          )
        }

        // Resolve initial seat override
        const { useOrderStore } = require('./useOrderStore')
        const { activeOrderId } = useOrderStore.getState()
        let initialSeatOverride: number | null = null
        if (activeOrderId) {
          if (cartItemParam) {
            // Edit mode: use the item's current seat
            initialSeatOverride = useSeatingStore
              .getState()
              .getItemSeat(
                activeOrderId,
                cartItemParam.id,
                cartItemParam.db_order_item_id
              )
          } else {
            // Add mode: use the active seat
            initialSeatOverride = useSeatingStore
              .getState()
              .getActiveSeat(activeOrderId)
          }
        }

        // Determine menuItem field: include sourceItem in state if adding from menu or explicitly requested
        const stateMenuItem =
          menuItemParam || includeMenuItemInState ? sourceItem : null

        set({
          isOpen: true,
          isMenuBlocked: true,
          mode: 'fullscreen',
          menuItem: stateMenuItem,
          cartItem: cartItemParam ?? null,
          categoryId: resolvedCatId || null,
          menuId: resolvedMenuId || null,
          precomputedModifiers: precomputed.modifiers,
          precomputedCategoriesById: precomputed.modifierCategoriesById,
          precomputedOptionsById: precomputed.optionsById,
          initialSelections: precomputed.initialSelections,
          itemPrice: precomputed.itemPrice,
          itemCashPrice: precomputed.itemCashPrice,
          activeModifierCategory: precomputed.activeCategory,
          precomputedForItemId: precomputed.forItemId,
          activeEditingItemId: cartItemParam?.id ?? null,
          draftCreatedId: null,
          seatOverride: initialSeatOverride
        })

        // Draft creation is intentionally deferred so the modifier UI opens first.
        if (menuItemParam && !cartItemParam) {
          queueMicrotask(() => {
            const draftCreatedId = _createDraftInOpen(
              sourceItem,
              precomputed.itemPrice,
              precomputed.itemCashPrice,
              resolvedCatId,
              resolvedMenuId
            )

            const state = get()
            if (
              state.isOpen &&
              !state.cartItem &&
              state.precomputedForItemId === precomputed.forItemId
            ) {
              set({ draftCreatedId })
            }
          })
        }
      } else if (cartItemParam) {
        // Fallback: no menu item found, use cart item data directly
        const { useOrderStore: uos } = require('./useOrderStore')
        const { activeOrderId: fallbackOrderId } = uos.getState()
        const fallbackSeat = fallbackOrderId
          ? useSeatingStore
              .getState()
              .getItemSeat(
                fallbackOrderId,
                cartItemParam.id,
                cartItemParam.db_order_item_id
              )
          : null

        set({
          isOpen: true,
          isMenuBlocked: true,
          mode: 'fullscreen',
          menuItem: null,
          cartItem: cartItemParam,
          categoryId: cartItemParam.addedFromCategoryId || null,
          menuId: cartItemParam.addedFromMenuId || null,
          precomputedModifiers: null,
          precomputedCategoriesById: null,
          precomputedOptionsById: null,
          initialSelections: null,
          itemPrice: cartItemParam.price,
          itemCashPrice: cartItemParam.cashPrice ?? cartItemParam.price,
          activeModifierCategory: null,
          precomputedForItemId: cartItemParam.menuItemId,
          activeEditingItemId: cartItemParam.id,
          seatOverride: fallbackSeat
        })
      }
    },

    openToAdd: (item, _orderId, categoryId, menuId) =>
      get().open({ menuItem: item, categoryId, menuId }),

    openToEdit: (item, _orderId) => get().open({ cartItem: item }),

    openToView: (item, _orderId) => get().open({ cartItem: item }),

    openFullscreen: (item, _orderId, categoryId, menuId) =>
      get().open({ menuItem: item, categoryId, menuId }),

    openFullscreenEdit: (item, _orderId) =>
      get().open({ cartItem: item, includeMenuItemInState: true }),

    close: () => {
      // Cache persisted for re-tap speed; TTL evicts stale entries

      // CRITICAL: Unblock touches synchronously FIRST (same frame)
      setMenuBlockedSync(false)

      // Phase 1: hide immediately so UI responds in the same frame.
      set({
        isOpen: false,
        isMenuBlocked: false, // Unblock menu on close
        selectedItemPosition: null, // Clear position tracking
        activeEditingItemId: null // Clear active item highlight
      })

      // Phase 2: clear heavier payload if still closed next tick.
      queueMicrotask(() => {
        const state = get()
        if (state.isOpen) return
        set({
          mode: 'add',
          menuItem: null,
          cartItem: null,
          categoryId: null,
          menuId: null,
          precomputedModifiers: null,
          precomputedCategoriesById: null,
          precomputedOptionsById: null,
          initialSelections: null,
          itemPrice: 0,
          itemCashPrice: 0,
          activeModifierCategory: null,
          precomputedForItemId: null,
          draftCreatedId: null,
          seatOverride: null
        })
      })
    },

    cancelAndRemoveDraft: () => {
      // Cache persisted for re-tap speed; TTL evicts stale entries

      // CRITICAL: Unblock touches synchronously FIRST (same frame)
      setMenuBlockedSync(false)

      // Get current state to check if we need to remove draft items
      const state = useModifierSidebarStore.getState()
      const { mode, menuItem, cartItem } = state

      // If in add mode (not editing an existing cart item), remove any draft items
      // This matches the cancel logic in ModifierScreen
      if (mode !== 'edit' && !cartItem && menuItem) {
        // Import dynamically to avoid circular dependency
        const { useOrderStore } = require('./useOrderStore')
        const { activeOrderId, ordersById, removeItemFromActiveOrder } =
          useOrderStore.getState()
        const activeOrder = activeOrderId ? ordersById[activeOrderId] : null

        // Find and remove draft items with matching menuItemId
        const draftItems = activeOrder?.items?.filter(
          (i: any) => i.isDraft && i.menuItemId === menuItem.id
        )

        if (draftItems && draftItems.length > 0) {
          draftItems.forEach((draftItem: any) => {
            removeItemFromActiveOrder(draftItem.id)
          })
        }
      }

      // Close the modal
      set({
        isOpen: false,
        isMenuBlocked: false,
        selectedItemPosition: null,
        activeEditingItemId: null,
        mode: 'add',
        menuItem: null,
        cartItem: null,
        categoryId: null,
        menuId: null,
        precomputedModifiers: null,
        precomputedCategoriesById: null,
        precomputedOptionsById: null,
        initialSelections: null,
        itemPrice: 0,
        itemCashPrice: 0,
        activeModifierCategory: null,
        precomputedForItemId: null,
        draftCreatedId: null,
        seatOverride: null
      })
    },

    setSelectedItemPosition: (position: ItemPosition | null) => {
      set({ selectedItemPosition: position })
    }
  })
)

// ============================================================================
// GRANULAR SELECTORS - For optimized component subscriptions
// Components should use these to avoid re-renders from unrelated state changes
// ============================================================================

/** Selector for isOpen state - use in overlay/wrapper components */
export const selectIsOpen = (state: ModifierSidebarState) => state.isOpen

/** Selector for mode - use when you only need to check the current mode */
export const selectMode = (state: ModifierSidebarState) => state.mode

/** Selector for menu item - use when you need the base menu item data */
export const selectMenuItem = (state: ModifierSidebarState) => state.menuItem

/** Selector for cart item - use when editing existing cart items */
export const selectCartItem = (state: ModifierSidebarState) => state.cartItem

/** Selector for precomputed modifiers - use for instant modifier rendering */
export const selectPrecomputedModifiers = (state: ModifierSidebarState) =>
  state.precomputedModifiers

/** Selector for precomputed category map - O(1) lookup, no per-render build */
export const selectPrecomputedCategoriesById = (state: ModifierSidebarState) =>
  state.precomputedCategoriesById

/** Selector for precomputed options map - O(1) lookup, no per-render build */
export const selectPrecomputedOptionsById = (state: ModifierSidebarState) =>
  state.precomputedOptionsById

/** Selector for initial selections - use for instant form initialization */
export const selectInitialSelections = (state: ModifierSidebarState) =>
  state.initialSelections

/** Selector for precomputed item price - use for instant price display */
export const selectItemPrice = (state: ModifierSidebarState) => state.itemPrice

/** Selector for precomputed item cash price - use for cash pricing display */
export const selectItemCashPrice = (state: ModifierSidebarState) =>
  state.itemCashPrice

/** Selector for menu ID - use to track which menu the item was added from */
export const selectMenuId = (state: ModifierSidebarState) => state.menuId

/** Selector for active modifier category - use for tab highlighting */
export const selectActiveModifierCategory = (state: ModifierSidebarState) =>
  state.activeModifierCategory

/** Selector for precomputed item ID - use to verify data freshness */
export const selectPrecomputedForItemId = (state: ModifierSidebarState) =>
  state.precomputedForItemId

/** Selector for close action - stable reference, no re-renders */
export const selectClose = (state: ModifierSidebarState) => state.close

/** Selector for cancelAndRemoveDraft action - use for overlay cancel that removes draft items */
export const selectCancelAndRemoveDraft = (state: ModifierSidebarState) =>
  state.cancelAndRemoveDraft

/** Combined selector for fullscreen mode check */
export const selectIsFullscreen = (state: ModifierSidebarState) =>
  state.isOpen && state.mode === 'fullscreen'

// ============================================================================
// MENU BLOCKING SELECTORS - For inline overlay pattern
// ============================================================================

/** Selector for menu blocked state - use in MenuSection for blocking overlay */
export const selectIsMenuBlocked = (state: ModifierSidebarState) =>
  state.isMenuBlocked

/** Selector for selected item position - use for attached modifier panel positioning */
export const selectSelectedItemPosition = (state: ModifierSidebarState) =>
  state.selectedItemPosition

/** Selector for setSelectedItemPosition action - stable reference */
export const selectSetSelectedItemPosition = (state: ModifierSidebarState) =>
  state.setSelectedItemPosition

/** Selector for activeEditingItemId - use for bill item highlight */
export const selectActiveEditingItemId = (state: ModifierSidebarState) =>
  state.activeEditingItemId

/** Selector for seatOverride - use in ModifierScreen for per-seat ordering */
export const selectSeatOverride = (state: ModifierSidebarState) =>
  state.seatOverride

/** Selector for setSeatOverride action */
export const selectSetSeatOverride = (state: ModifierSidebarState) =>
  state.setSeatOverride
