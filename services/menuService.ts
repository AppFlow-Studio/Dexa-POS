import { SupabaseClient } from '@supabase/supabase-js'

// ============================================================
// MENU SERVICE - Price Update Functions
// ============================================================

export type EditingLevel = 2 | 4 | 5

export interface UpdateItemPriceParams {
  menuItemId: string
  categoryId?: string | null
  menuId?: string | null
  locationId: string
  price: number
  cashPrice?: number | null
  availability?: boolean
}

export interface ResetItemPriceParams {
  menuItemId: string
  categoryId?: string | null
  menuId?: string | null
  locationId: string
  targetLevel: 2 | 4
}

export interface UpdateItemPriceResult {
  success: boolean
  message?: string
}

export interface ResetItemPriceResult {
  success: boolean
  message?: string
}

export const LEVEL_CONFIGS = {
  2: {
    label: 'Location Price',
    icon: '📍',
    color: '#3b82f6',
    description: 'Applies to all menus at your location'
  },
  4: {
    label: 'Category Price',
    icon: '🏷️',
    color: '#a855f7',
    description: 'Applies to this category at your location'
  },
  5: {
    label: 'Menu Price',
    icon: '📋',
    color: '#f59e0b',
    description: 'Applies to this menu only'
  }
} as const

export class MenuService {
  /**
   * Determine which editing level based on context
   * Level 5: Has both menuId and categoryId (editing in a menu)
   * Level 4: Has categoryId only (editing in a category)
   * Level 2: Neither (editing in Items Library - location-wide)
   */
  static getEditingLevel ({
    categoryId,
    menuId
  }: {
    categoryId?: string | null
    menuId?: string | null
  }): EditingLevel {
    if (menuId && categoryId) {
      return 5
    }
    if (categoryId) {
      return 4
    }
    return 2
  }

  /**
   * Get the level config for display purposes
   */
  static getLevelConfig (level: EditingLevel) {
    return LEVEL_CONFIGS[level]
  }

  /**
   * Update item price at the appropriate level
   * Uses upsert_category_item_override RPC function
   */
  static async updateItemPrice (
    client: SupabaseClient,
    params: UpdateItemPriceParams
  ): Promise<{ data: UpdateItemPriceResult | null; error: any }> {
    const {
      menuItemId,
      categoryId,
      menuId,
      locationId,
      price,
      cashPrice,
      availability
    } = params
    console.log('this is working', params)

    const rpcParams: Record<string, any> = {
      p_menu_item_id: menuItemId,
      p_category_id: categoryId || null,
      p_menu_id: menuId || null,
      p_location_id: locationId,
      p_custom_price: price,
      p_custom_cash_price: cashPrice !== undefined ? cashPrice : null,
      p_is_available: availability !== undefined ? availability : null,
      p_custom_delivery_price: null
    }

    const { data, error } = await client.rpc(
      'upsert_category_item_override',
      rpcParams
    )

    if (error) {
      console.error('Failed to update item price:', error)
      return { data: null, error }
    }

    return {
      data: { success: true, message: 'Price updated successfully' },
      error: null
    }
  }

  /**
   * Reset item price to lower level
   * Uses reset_category_item_to_level RPC function
   *
   * Level 5 can reset to Level 4 (category) or Level 2 (location)
   * Level 4 can reset to Level 2 (location)
   * Level 2 cannot reset (would need merchant admin)
   */
  static async resetItemPrice (
    client: SupabaseClient,
    params: ResetItemPriceParams
  ): Promise<{ data: ResetItemPriceResult | null; error: any }> {
    const { menuItemId, categoryId, menuId, locationId, targetLevel } = params

    const { data, error } = await client.rpc('reset_category_item_to_level', {
      p_menu_item_id: menuItemId,
      p_category_id: categoryId || null,
      p_menu_id: menuId || null,
      p_location_id: locationId,
      p_target_level: targetLevel
    })

    if (error) {
      console.error('Failed to reset item price:', error)
      return { data: null, error }
    }

    return {
      data: { success: true, message: 'Price reset successfully' },
      error: null
    }
  }

  /**
   * Get the target level for reset based on current level
   * Returns null if reset is not possible (Level 2)
   */
  static getResetTargetLevel (currentLevel: EditingLevel): 2 | 4 | null {
    if (currentLevel === 5) {
      return 4 // Reset menu price to category price
    }
    if (currentLevel === 4) {
      return 2 // Reset category price to location price
    }
    return null // Level 2 cannot reset
  }

  /**
   * Get a user-friendly description for the reset action
   */
  static getResetDescription (currentLevel: EditingLevel): string | null {
    if (currentLevel === 5) {
      return 'Reset to Category Price'
    }
    if (currentLevel === 4) {
      return 'Reset to Location Price'
    }
    return null
  }

  // ============================================================
  // MENU CRUD OPERATIONS (Location-Owned)
  // ============================================================

  /**
   * Create a new location-owned menu
   */
  static async createMenu (
    client: SupabaseClient,
    params: {
      merchantId: string
      locationId: string
      name: string
      description?: string
      isActive?: boolean
      displayOrder?: number
    }
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client
      .from('menus')
      .insert({
        merchant_id: params.merchantId,
        location_id: params.locationId, // Location-owned
        name: params.name,
        description: params.description || null,
        is_active: params.isActive ?? true,
        display_order: params.displayOrder ?? 0
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create menu:', error)
      return { data: null, error }
    }

    return { data, error: null }
  }

  /**
   * Update a menu
   */
  static async updateMenu (
    client: SupabaseClient,
    menuId: string,
    params: {
      name?: string
      description?: string
      isActive?: boolean
      displayOrder?: number
    }
  ): Promise<{ data: any; error: any }> {
    const updateData: Record<string, any> = {}
    if (params.name !== undefined) updateData.name = params.name
    if (params.description !== undefined)
      updateData.description = params.description
    if (params.isActive !== undefined) updateData.is_active = params.isActive
    if (params.displayOrder !== undefined)
      updateData.display_order = params.displayOrder

    const { data, error } = await client
      .from('menus')
      .update(updateData)
      .eq('id', menuId)
      .select()

    if (error) {
      console.error('Failed to update menu:', error)
      return { data: null, error }
    }

    if (!data?.length) {
      const noRowsError = new Error('No menu row was updated')
      console.error('Failed to update menu:', noRowsError)
      return { data: null, error: noRowsError }
    }

    return { data: data?.[0] ?? null, error: null }
  }

  /**
   * Delete a menu
   */
  static async deleteMenu (
    client: SupabaseClient,
    menuId: string
  ): Promise<{ success: boolean; error: any }> {
    const { error } = await client.from('menus').delete().eq('id', menuId)

    if (error) {
      console.error('Failed to delete menu:', error)
      return { success: false, error }
    }

    return { success: true, error: null }
  }

  // ============================================================
  // CATEGORY CRUD OPERATIONS (Location-Owned)
  // ============================================================

  /**
   * Create a new location-owned category
   */
  static async createCategory (
    client: SupabaseClient,
    params: {
      merchantId: string
      locationId: string
      name: string
      description?: string
      displayOrder?: number
      image?: string
      isActive?: boolean
    }
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client
      .from('categories')
      .insert({
        merchant_id: params.merchantId,
        location_id: params.locationId, // Location-owned
        name: params.name,
        description: params.description || null,
        display_order: params.displayOrder ?? 0,
        image: params.image || null,
        is_active: params.isActive ?? true,
        is_global: false // Location-specific
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create category:', error)
      return { data: null, error }
    }

    return { data, error: null }
  }

  /**
   * Update a category
   */
  static async updateCategory (
    client: SupabaseClient,
    categoryId: string,
    params: {
      name?: string
      description?: string
      displayOrder?: number
      image?: string
      isActive?: boolean
    }
  ): Promise<{ data: any; error: any }> {
    const updateData: Record<string, any> = {}
    if (params.name !== undefined) updateData.name = params.name
    if (params.description !== undefined)
      updateData.description = params.description
    if (params.displayOrder !== undefined)
      updateData.display_order = params.displayOrder
    if (params.image !== undefined) updateData.image = params.image
    if (params.isActive !== undefined) updateData.is_active = params.isActive

    const { error } = await client
      .from('categories')
      .update(updateData)
      .eq('id', categoryId)

    if (error) {
      console.error('Failed to update category:', error)
      return { data: null, error }
    }

    return { data: { id: categoryId, ...params }, error: null }
  }

  /**
   * Delete a category
   */
  static async deleteCategory (
    client: SupabaseClient,
    categoryId: string
  ): Promise<{ success: boolean; error: any }> {
    const { error } = await client
      .from('categories')
      .delete()
      .eq('id', categoryId)

    if (error) {
      console.error('Failed to delete category:', error)
      return { success: false, error }
    }

    return { success: true, error: null }
  }

  /**
   * Add an item to a category
   */
  static async addItemToCategory (
    client: SupabaseClient,
    params: {
      categoryId: string
      menuItemId: string
      merchantId: string
      displayOrder?: number
      customPrice?: number
      isFeatured?: boolean
    }
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client
      .from('category_items')
      .insert({
        category_id: params.categoryId,
        menu_item_id: params.menuItemId,
        merchant_id: params.merchantId,
        display_order: params.displayOrder ?? 0,
        custom_price: params.customPrice || null,
        is_featured: params.isFeatured ?? false,
        is_available: true
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to add item to category:', error)
      return { data: null, error }
    }

    return { data, error: null }
  }

  /**
   * Remove an item from a category using the RPC function
   * (Matches website implementation)
   */
  static async removeItemFromCategory (
    client: SupabaseClient,
    categoryId: string,
    menuItemId: string
  ): Promise<{ success: boolean; error: any }> {
    console.log('Removing item from category:', categoryId, menuItemId)

    const { error } = await client.rpc('remove_item_from_category', {
      p_category_id: categoryId,
      p_menu_item_id: menuItemId
    })

    if (error) {
      console.error('Failed to remove item from category:', error)
      return { success: false, error }
    }

    return { success: true, error: null }
  }

  /**
   * Add a category to a menu
   */
  static async addCategoryToMenu (
    client: SupabaseClient,
    params: {
      menuId: string
      categoryId: string
      merchantId: string
      displayOrder?: number
      customTitle?: string
    }
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client
      .from('menu_categories')
      .insert({
        menu_id: params.menuId,
        category_id: params.categoryId,
        merchant_id: params.merchantId,
        display_order: params.displayOrder ?? 0,
        custom_title: params.customTitle || null,
        is_active: true
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to add category to menu:', error)
      return { data: null, error }
    }

    return { data, error: null }
  }

  /**
   * Remove a category from a menu using the RPC function
   * (Matches website implementation)
   */
  static async removeCategoryFromMenu (
    client: SupabaseClient,
    menuId: string,
    categoryId: string
  ): Promise<{ success: boolean; error: any }> {
    console.log('Removing category from menu:', menuId, categoryId)

    const { error } = await client.rpc('remove_category_from_menu', {
      p_menu_id: menuId,
      p_category_id: categoryId
    })

    if (error) {
      console.error('Failed to remove category from menu:', error)
      return { success: false, error }
    }

    return { success: true, error: null }
  }

  // ============================================================
  // MENU ITEM CRUD OPERATIONS
  // ============================================================

  /**
   * Upload a menu item image to Bunny CDN via the cdn-upload edge function.
   * Returns the CDN URL on success, or throws on failure.
   */
  static async uploadMenuImage (
    client: SupabaseClient,
    params: {
      merchantId: string
      base64: string
      getToken: () => Promise<string | null>
    }
  ): Promise<string> {
    const token = await params.getToken()
    const { data, error } = await client.functions.invoke('cdn-upload', {
      body: {
        scope: 'merchant',
        merchantId: params.merchantId,
        category: 'menu-images',
        fileName: `menu_item_${Date.now()}.jpg`,
        fileBase64: params.base64,
        contentType: 'image/jpeg'
      },
      headers: { Authorization: `Bearer ${token}` }
    })
    if (error || !data?.cdnUrl) throw error ?? new Error('No CDN URL returned')
    return data.cdnUrl as string
  }

  /**
   * Create a new menu item
   */
  static async createMenuItem (
    client: SupabaseClient,
    params: {
      merchantId: string
      locationId?: string
      name: string
      description?: string
      price: number
      cashPrice?: number
      image?: string
      mealTypes?: ('Lunch' | 'Dinner' | 'Brunch' | 'Specials')[]
      allergens?: string[]
      availability?: boolean
      stockTrackingMode?: 'in_stock' | 'out_of_stock' | 'quantity'
      cardBgColor?: string
    }
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client
      .from('menu_items')
      .insert({
        merchant_id: params.merchantId,
        location_id: params.locationId || null,
        name: params.name,
        description: params.description || null,
        price: params.price,
        cash_price: params.cashPrice || null,
        image: params.image || null,
        meal_types: params.mealTypes || [],
        allergens: params.allergens || [],
        availability: params.availability ?? true,
        stock_tracking_mode: params.stockTrackingMode || null,
        card_bg_color: params.cardBgColor || null
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create menu item:', error)
      return { data: null, error }
    }

    return { data, error: null }
  }

  /**
   * Update a menu item
   */
  static async updateMenuItem (
    client: SupabaseClient,
    itemId: string,
    params: {
      name?: string
      description?: string
      price?: number
      cashPrice?: number
      image?: string | null
      mealTypes?: ('Lunch' | 'Dinner' | 'Brunch' | 'Specials')[]
      allergens?: string[]
      availability?: boolean
      stockTrackingMode?: 'in_stock' | 'out_of_stock' | 'quantity'
      cardBgColor?: string
    }
  ): Promise<{ data: any; error: any }> {
    const updateData: Record<string, any> = {}
    if (params.name !== undefined) updateData.name = params.name
    if (params.description !== undefined)
      updateData.description = params.description
    if (params.price !== undefined) updateData.price = params.price
    if (params.cashPrice !== undefined) updateData.cash_price = params.cashPrice
    if (params.image !== undefined) updateData.image = params.image
    if (params.mealTypes !== undefined) updateData.meal_types = params.mealTypes
    if (params.allergens !== undefined) updateData.allergens = params.allergens
    if (params.availability !== undefined)
      updateData.availability = params.availability
    if (params.stockTrackingMode !== undefined)
      updateData.stock_tracking_mode = params.stockTrackingMode
    if (params.cardBgColor !== undefined)
      updateData.card_bg_color = params.cardBgColor

    const { data, error } = await client
      .from('menu_items')
      .update(updateData)
      .eq('id', itemId)
      .select()

    if (error) {
      console.error('Failed to update menu item:', error)
      return { data: null, error }
    }

    return { data: data?.[0] ?? null, error: null }
  }

  /**
   * Delete a menu item
   */
  static async deleteMenuItem (
    client: SupabaseClient,
    itemId: string
  ): Promise<{ success: boolean; error: any }> {
    const { error } = await client.from('menu_items').delete().eq('id', itemId)

    if (error) {
      console.error('Failed to delete menu item:', error)
      return { success: false, error }
    }

    return { success: true, error: null }
  }

  /**
   * Assign modifier groups to a menu item
   */
  static async assignModifierToItem (
    client: SupabaseClient,
    params: {
      menuItemId: string
      modifierGroupId: string
      merchantId: string
      displayOrder?: number
    }
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client
      .from('menu_item_modifier_groups')
      .insert({
        menu_item_id: params.menuItemId,
        modifier_group_id: params.modifierGroupId,
        merchant_id: params.merchantId,
        display_order: params.displayOrder ?? 0
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to assign modifier to item:', error)
      return { data: null, error }
    }

    return { data, error: null }
  }

  /**
   * Remove modifier group from a menu item
   */
  static async removeModifierFromItem (
    client: SupabaseClient,
    menuItemId: string,
    modifierGroupId: string
  ): Promise<{ success: boolean; error: any }> {
    const { error } = await client
      .from('menu_item_modifier_groups')
      .delete()
      .eq('menu_item_id', menuItemId)
      .eq('modifier_group_id', modifierGroupId)

    if (error) {
      console.error('Failed to remove modifier from item:', error)
      return { success: false, error }
    }

    return { success: true, error: null }
  }

  // ============================================================
  // MODIFIER GROUP CRUD OPERATIONS (Location-Owned)
  // ============================================================

  /**
   * Create a new modifier group
   */
  static async createModifierGroup (
    client: SupabaseClient,
    params: {
      merchantId: string
      locationId: string
      name: string
      description?: string
      isRequired?: boolean
      minSelections?: number
      maxSelections?: number
      displayOrder?: number
    }
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client
      .from('modifier_groups')
      .insert({
        merchant_id: params.merchantId,
        location_id: params.locationId, // Location-owned
        name: params.name,
        description: params.description || null,
        is_required: params.isRequired ?? false,
        min_selections: params.minSelections ?? 0,
        max_selections: params.maxSelections ?? null,
        display_order: params.displayOrder ?? 0
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create modifier group:', error)
      return { data: null, error }
    }

    return { data, error: null }
  }

  /**
   * Update a modifier group
   */
  static async updateModifierGroup (
    client: SupabaseClient,
    groupId: string,
    params: {
      name?: string
      description?: string
      isRequired?: boolean
      minSelections?: number
      maxSelections?: number | null
      displayOrder?: number
    }
  ): Promise<{ data: any; error: any }> {
    const updateData: Record<string, any> = {}
    if (params.name !== undefined) updateData.name = params.name
    if (params.description !== undefined)
      updateData.description = params.description
    if (params.isRequired !== undefined)
      updateData.is_required = params.isRequired
    if (params.minSelections !== undefined)
      updateData.min_selections = params.minSelections
    if (params.maxSelections !== undefined)
      updateData.max_selections = params.maxSelections
    if (params.displayOrder !== undefined)
      updateData.display_order = params.displayOrder

    const { data, error } = await client
      .from('modifier_groups')
      .update(updateData)
      .eq('id', groupId)
      .select()

    if (error) {
      console.error('Failed to update modifier group:', error)
      return { data: null, error }
    }

    return { data: data?.[0] ?? null, error: null }
  }

  /**
   * Delete a modifier group
   */
  static async deleteModifierGroup (
    client: SupabaseClient,
    groupId: string
  ): Promise<{ success: boolean; error: any }> {
    const { error } = await client
      .from('modifier_groups')
      .delete()
      .eq('id', groupId)

    if (error) {
      console.error('Failed to delete modifier group:', error)
      return { success: false, error }
    }

    return { success: true, error: null }
  }

  /**
   * Create a modifier group item (option)
   */
  static async createModifierItem (
    client: SupabaseClient,
    params: {
      modifierGroupId: string
      name: string
      description?: string
      priceModifier: number
      displayOrder?: number
      isActive?: boolean
      isDefault?: boolean
      merchantId: string
    }
  ): Promise<{ data: any; error: any }> {
    const { data, error } = await client
      .from('modifier_group_items')
      .insert({
        modifier_group_id: params.modifierGroupId,
        name: params.name,
        description: params.description || null,
        price_modifier: params.priceModifier,
        display_order: params.displayOrder ?? 0,
        is_active: params.isActive ?? true,
        is_default: params.isDefault ?? false,
        merchant_id: params.merchantId
      })
      .select()
      .single()

    if (error) {
      console.error('Failed to create modifier item:', error)
      return { data: null, error }
    }

    return { data, error: null }
  }

  /**
   * Update a modifier group item
   */
  static async updateModifierItem (
    client: SupabaseClient,
    itemId: string,
    params: {
      name?: string
      description?: string
      priceModifier?: number
      displayOrder?: number
      isActive?: boolean
      isDefault?: boolean
    }
  ): Promise<{ data: any; error: any }> {
    const updateData: Record<string, any> = {}
    if (params.name !== undefined) updateData.name = params.name
    if (params.description !== undefined)
      updateData.description = params.description
    if (params.priceModifier !== undefined)
      updateData.price_modifier = params.priceModifier
    if (params.displayOrder !== undefined)
      updateData.display_order = params.displayOrder
    if (params.isActive !== undefined) updateData.is_active = params.isActive
    if (params.isDefault !== undefined) updateData.is_default = params.isDefault

    const { data, error } = await client
      .from('modifier_group_items')
      .update(updateData)
      .eq('id', itemId)
      .select()

    if (error) {
      console.error('Failed to update modifier item:', error)
      return { data: null, error }
    }

    return { data: data?.[0] ?? null, error: null }
  }

  /**
   * Delete a modifier group item
   */
  static async deleteModifierItem (
    client: SupabaseClient,
    itemId: string
  ): Promise<{ success: boolean; error: any }> {
    const { error } = await client
      .from('modifier_group_items')
      .delete()
      .eq('id', itemId)

    if (error) {
      console.error('Failed to delete modifier item:', error)
      return { success: false, error }
    }

    return { success: true, error: null }
  }

  // ============================================================
  // RECIPE MANAGEMENT
  // ============================================================

  /**
   * Upsert recipe for a menu item (replace all ingredients)
   */
  static async upsertMenuItemRecipe (
    client: SupabaseClient,
    menuItemId: string,
    locationId: string | null | undefined,
    ingredients: { inventoryItemId: string; quantity: number }[]
  ): Promise<{ success: boolean; error: any }> {
    const recipePayload = ingredients.map(i => ({
      inventoryItemId: i.inventoryItemId,
      inventory_item_id: i.inventoryItemId,
      quantity: i.quantity
    }))

    const { error } = await client.rpc('upsert_menu_item_with_recipe', {
      p_menu_item_id: menuItemId,
      p_location_id: locationId ?? null,
      p_recipe_items: recipePayload,
      p_ingredients: recipePayload
    })

    if (error) {
      console.error('Failed to upsert menu item recipe:', error)
      return { success: false, error }
    }

    return { success: true, error: null }
  }

  /**
   * Upsert recipe for a modifier option (replace all ingredients)
   */
  static async upsertModifierOptionRecipe (
    client: SupabaseClient,
    modifierOptionId: string,
    ingredients: { inventoryItemId: string; quantity: number }[]
  ): Promise<{ success: boolean; error: any }> {
    console.log('upsertModifierOptionRecipe', modifierOptionId, ingredients)

    const { error } = await client.rpc('upsert_modifier_item_with_recipe', {
      p_modifier_item_id: modifierOptionId,
      p_recipe_items: ingredients.map(i => ({
        inventoryItemId: i.inventoryItemId,
        quantity: i.quantity
      }))
    })

    if (error) {
      console.error('Failed to upsert modifier option recipe:', error)
      return { success: false, error }
    }

    return { success: true, error: null }
  }

  // ============================================================
  // REORDERING OPERATIONS
  // ============================================================

  /**
   * Reorder menus for a specific location.
   * The POS sync RPC reads location_menus.display_order before menus.display_order,
   * so inherited/global menus must be ordered through this location override table.
   */
  static async reorderLocationMenus (
    client: SupabaseClient,
    locationId: string,
    menuOrders: { menuId: string; displayOrder: number }[]
  ): Promise<{ success: boolean; error: any }> {
    if (!locationId) {
      const error = new Error('Missing location_id for menu reorder')
      console.error('Failed to reorder menus:', error)
      return { success: false, error }
    }

    if (menuOrders.some(order => !order.menuId)) {
      const error = new Error('Missing menu_id for menu reorder')
      console.error('Failed to reorder menus:', error)
      return { success: false, error }
    }

    const { error } = await client.rpc('reorder_location_menus', {
      p_location_id: locationId,
      p_menu_orders: menuOrders.map(order => ({
        menu_id: order.menuId,
        display_order: order.displayOrder
      }))
    })

    if (error) {
      console.error('Failed to reorder menus:', error)
      return { success: false, error }
    }

    return { success: true, error: null }
  }

  /**
   * Reorder categories within a menu
   */
  static async reorderMenuCategories (
    client: SupabaseClient,
    menuId: string,
    locationId: string,
    categoryOrders: {
      categoryId?: string
      category_id?: string
      displayOrder?: number
      display_order?: number
    }[]
  ): Promise<{ success: boolean; error: any }> {
    const normalizedCategoryOrders = categoryOrders.map(order => ({
      category_id: order.category_id ?? order.categoryId ?? null,
      display_order:
        order.display_order ?? order.displayOrder ?? null
    }))

    if (normalizedCategoryOrders.some(order => !order.category_id)) {
      const error = new Error('Missing category_id for menu category reorder')
      console.error('Failed to reorder menu categories:', error)
      return { success: false, error }
    }

    const { error } = await client.rpc('reorder_menu_categories', {
      p_menu_id: menuId,
      p_location_id: locationId,
      p_category_orders: normalizedCategoryOrders
    })

    if (error) {
      console.error('Failed to reorder menu categories:', error)
      return { success: false, error }
    }

    return { success: true, error: null }
  }

  /**
   * Reorder items within a category
   */
  static async reorderCategoryItems (
    client: SupabaseClient,
    categoryId: string,
    locationId: string,
    itemOrders: { menuItemId: string; displayOrder: number }[]
  ): Promise<{ success: boolean; error: any }> {
    const normalizedOrders = itemOrders
      .map(order => ({
        menu_item_id: order.menuItemId,
        display_order: order.displayOrder
      }))
      .filter(order => !!order.menu_item_id)

    const { error } = await client.rpc('reorder_category_items', {
      p_category_id: categoryId,
      p_location_id: locationId,
      p_item_orders: normalizedOrders
    })

    if (error) {
      console.error('Failed to reorder category items:', error)
      return { success: false, error }
    }

    return { success: true, error: null }
  }
}
