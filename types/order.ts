// types/order.ts

// ==========================================
// OPEN ITEM TYPES
// ==========================================

export interface OpenItemInput {
    name: string;
    price: number;
    quantity?: number; // Default to 1
    notes?: string;
  }
  
  export interface OrderItemBase {
    id: string;
    order_id: string;
    quantity: number;
    subtotal: number;
    notes: string | null;
    created_at: string;
  }
  
  // Regular menu item
  export interface RegularOrderItem extends OrderItemBase {
    is_open_item: false;
    menu_item_id: string;
    price: number;
    
    // Populated via join
    menu_item?: {
      id: string;
      name: string;
      category_id: string;
      sku: string | null;
    };
    
    // These are null for regular items
    open_item_name: null;
    open_item_price: null;
  }
  
  // Open item
  export interface OpenOrderItem extends OrderItemBase {
    is_open_item: true;
    menu_item_id: null;
    price: number; // Can be 0 for open items, will use open_item_price
    
    open_item_name: string;
    open_item_price: number;
    
    // Menu item is null for open items
    menu_item?: null;
  }
  
  // Discriminated union
  export type OrderItem = RegularOrderItem | OpenOrderItem;
  
  // Helper type guards
  export function isOpenItem(item: OrderItem): item is OpenOrderItem {
    return item.is_open_item === true;
  }
  
  export function isRegularItem(item: OrderItem): item is RegularOrderItem {
    return item.is_open_item === false;
  }
  
  // Unified display type
  export interface OrderItemDisplay {
    id: string;
    name: string;
    quantity: number;
    unitPrice: number;
    subtotal: number;
    notes: string | null;
    isOpenItem: boolean;
    menuItemId: string | null;
  }