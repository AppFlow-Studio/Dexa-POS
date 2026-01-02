// services/orderItems.ts
import { useSupabaseClient } from '@/hooks/useSupabaseClient';
import type { OpenItemInput, OpenOrderItem, OrderItem, OrderItemDisplay, RegularOrderItem } from '@/types/order';

/**
 * Add an open item to an order
 */
export async function addOpenItemToOrder(
  orderId: string,
  openItem: OpenItemInput
): Promise<OrderItem> {
  const supabase = useSupabaseClient();
  const { data, error } = await supabase
    .from('order_items')
    .insert({
      order_id: orderId,
      is_open_item: true,
      open_item_name: openItem.name.trim(),
      open_item_price: openItem.price,
      quantity: openItem.quantity || 1,
      price: openItem.price, // For compatibility with existing queries
      notes: openItem.notes || null,
      
      // These must be null for open items
      menu_item_id: null
    })
    .select()
    .single();

  if (error) throw error;
  return data as OrderItem;
}

/**
 * Add a regular menu item to an order
 */
export async function addMenuItemToOrder(
  orderId: string,
  menuItemId: string,
  quantity: number,
  price: number,
  notes?: string
): Promise<OrderItem> {
  const supabase = useSupabaseClient();
  const { data, error } = await supabase
    .from('order_items')
    .insert({
      order_id: orderId,
      menu_item_id: menuItemId,
      quantity,
      price,
      notes: notes || null,
      
      // These must be false/null for regular items
      is_open_item: false,
      open_item_name: null,
      open_item_price: null
    })
    .select(`
      *,
      menu_item:menu_items(
        id,
        name,
        category_id,
        sku
      )
    `)
    .single();

  if (error) throw error;
  return data as OrderItem;
}

/**
 * Get all items for an order (unified)
 */
export async function getOrderItems(orderId: string): Promise<OrderItem[]> {
  const supabase = useSupabaseClient();
  const { data, error } = await supabase
    .from('order_items')
    .select(`
      *,
      menu_item:menu_items(
        id,
        name,
        category_id,
        sku
      )
    `)
    .eq('order_id', orderId)
    .order('created_at', { ascending: true });

  if (error) throw error;
  return data as OrderItem[];
}

/**
 * Transform order items for display
 */
export function formatOrderItemsForDisplay(items: OrderItem[]): OrderItemDisplay[] {
  const isOpenItem = (item: OrderItem): item is OpenOrderItem => item.is_open_item === true;
  const isRegularItem = (item: OrderItem): item is RegularOrderItem => item.is_open_item === false;
  return items.map(item => ({
    id: item.id,
    name: isOpenItem(item) ? item.open_item_name : (item.menu_item?.name || 'Unknown'),
    quantity: item.quantity,
    unitPrice: isOpenItem(item) ? item.open_item_price : item.price,
    subtotal: item.subtotal,
    notes: item.notes,
    isOpenItem: item.is_open_item,
    menuItemId: item.menu_item_id
  }));
}

/**
 * Update open item details
 */
export async function updateOpenItem(
  itemId: string,
  updates: { name?: string; price?: number; quantity?: number }
): Promise<OrderItem> {
  const updateData: Record<string, unknown> = {};
  
  if (updates.name !== undefined) {
    updateData.open_item_name = updates.name.trim();
  }
  if (updates.price !== undefined) {
    updateData.open_item_price = updates.price;
    updateData.price = updates.price; // Keep in sync
  }
  if (updates.quantity !== undefined) {
    updateData.quantity = updates.quantity;
  }

  const supabase = useSupabaseClient();
  const { data, error } = await supabase
    .from('order_items')
    .update(updateData)
    .eq('id', itemId)
    .eq('is_open_item', true) // Safety check
    .select()
    .single();

  if (error) throw error;
  return data as OrderItem;
}

/**
 * Validation helper
 */
export function validateOpenItem(input: OpenItemInput): string[] {
  const errors: string[] = [];
  
  if (!input.name || input.name.trim().length === 0) {
    errors.push('Item name is required');
  }
  
  if (input.name && input.name.length > 100) {
    errors.push('Item name must be less than 100 characters');
  }
  
  if (input.price === undefined || input.price === null) {
    errors.push('Price is required');
  }
  
  if (input.price < 0) {
    errors.push('Price cannot be negative');
  }
  
  if (input.price > 999999) {
    errors.push('Price is too large');
  }
  
  if (input.quantity !== undefined && input.quantity < 1) {
    errors.push('Quantity must be at least 1');
  }
  
  return errors;
}