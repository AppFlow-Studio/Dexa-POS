// Types for get_pos_full_sync API response
// These types match the ACTUAL structure returned by the Supabase RPC

// ============================================================================
// 1. ENUMS / LITERAL TYPES
// ============================================================================

export type StockTrackingMode = "in_stock" | "out_of_stock" | "quantity";

export type PriceSource =
  | "base"
  | "location_item"
  | "category"
  | "location_category"
  | "location_menu";

// ============================================================================
// 2. PRICE LEVELS (matches actual API)
// ============================================================================

export interface PriceLevels {
  level_1_base: number;
  level_2_location_item: number | null;
  level_2_modifier: number | null;
  level_2_modifier_type: string | null;
  level_3_category: number | null;
  level_4_location_category: number | null;
  level_5_location_menu: number | null;
}

// ============================================================================
// 3. MODIFIER TYPES (matches actual API)
// ============================================================================

export interface ModifierItem {
  id: string;
  name: string;
  price_modifier: number;
  is_active: boolean;
  stock_tracking_mode: StockTrackingMode;
  current_stock: number | null;
}

export interface ModifierGroup {
  id: string;
  name: string;
  min_selections: number;
  max_selections: number;
  is_required: boolean;
  is_active: boolean;
  items: ModifierItem[];
}

// ============================================================================
// 4. MENU ITEM TYPES (matches actual API)
// ============================================================================

export interface MenuItemDetails {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  allergens: string[];
  meal_types: string[];
  card_bg_color: string | null;

  // Price cascade
  price_levels: PriceLevels;
  effective_price: number;
  effective_cash_price: number | null;
  effective_availability: boolean;

  // Price source tracking
  price_source: PriceSource;
  has_location_item_override: boolean;
  has_category_override: boolean;
  has_location_category_override: boolean;
  has_location_menu_override: boolean;

  // Stock
  stock_tracking_mode: StockTrackingMode;
  current_stock: number | null;

  // Modifiers (resolved, full objects)
  modifier_groups: ModifierGroup[];
}

// Junction table entry: category_item
export interface MenuCategoryItem {
  id: string; // category_items.id (junction table)
  menu_item_id: string; // menu_items.id
  category_id: string; // categories.id
  display_order: number;
  is_featured: boolean;

  // The full menu item with price cascade resolved
  menu_item: MenuItemDetails;
}

// ============================================================================
// 5. CATEGORY TYPES (matches actual API)
// ============================================================================

export interface CategoryDetails {
  id: string;
  name: string;
  description: string | null;
  image: string | null;
  has_location_override: boolean;
  has_menu_category_override: boolean;
}

// Menu-category junction with nested category and items
export interface MenuCategoryEntry {
  id: string; // menu_categories.id (junction table)
  category_id: string;
  display_order: number;
  is_active: boolean;

  // The category details
  category: CategoryDetails;

  // Items within this category for this menu
  items: MenuCategoryItem[];
}

// ============================================================================
// 6. SCHEDULE TYPES (matches actual API)
// ============================================================================

// Individual time slot for a specific day
export interface ScheduleTimeSlot {
  id: string;
  day_of_week: number; // 0 = Monday, 1 = Tuesday, ..., 6 = Sunday (confirm with backend)
  start_time: string; // Currently "HH:MM:SS" format - should be ISO (see backend message)
  end_time: string; // Currently "HH:MM:SS" format - should be ISO (see backend message)
}

// The schedule definition
export interface ScheduleDetails {
  id: string;
  name: string;
  description: string | null;
  is_active: boolean;
  time_slots: ScheduleTimeSlot[];
}

// Menu-schedule junction entry (returned in menu.schedules array)
export interface MenuScheduleEntry {
  id: string; // Junction table ID
  schedule: ScheduleDetails;
}

// ============================================================================
// 7. MENU WITH CATEGORIES (Main return type)
// ============================================================================

export interface MenuWithCategories {
  id: string;
  merchant_id: string;
  location_id: string | null; // NULL if global menu

  name: string;
  description: string | null;

  is_active: boolean;
  is_global: boolean; // location_id IS NULL
  is_location_owned: boolean; // location_id IS NOT NULL

  created_at: string;
  updated_at: string;

  // Categories with nested items (actual API structure)
  categories: MenuCategoryEntry[];

  // Schedules (nested structure with time_slots)
  schedules: MenuScheduleEntry[];
}

// ============================================================================
// 8. POS SYNC RESPONSE
// ============================================================================

export interface PosSyncData {
  synced_at: string;
  location_id: string;
  menus: MenuWithCategories[];
}

// ============================================================================
// 9. SYNC STATE
// ============================================================================

export interface PosSyncState {
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
  lastSyncedAt: string | null;
}
