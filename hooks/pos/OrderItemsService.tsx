// ============================================================================
// DEXA POS - Order Item CRUD Service with Offline Support
// React Native / TypeScript
// ============================================================================

import { getSyncJSON, setSyncJSON } from '@/lib/storage';
import NetInfo from '@react-native-community/netinfo';
import { v4 as uuidv4 } from 'uuid';
import { useSupabaseClient } from '../useSupabaseClient';

// ============================================================================
// TYPES
// ============================================================================

interface OrderItemModifier {
  id?: string;
  modifier_group_id: string;
  modifier_item_id: string;
  modifier_group_name: string;
  modifier_name: string;
  price_modifier: number;
  quantity: number;
  total_price?: number;
}

interface OrderItem {
  id: string;
  order_id: string;
  menu_item_id?: string;
  location_exclusive_item_id?: string;
  item_name: string;
  item_description?: string;
  category_name?: string;
  quantity: number;
  unit_price: number;
  cash_price?: number;
  price_paid: number;
  subtotal: number;
  selected_size_id?: string;
  selected_size_name?: string;
  size_price_modifier?: number;
  special_instructions?: string;
  item_status: string;
  prep_station?: string;
  course_number?: number;
  is_voided: boolean;
  modifiers?: OrderItemModifier[];
}

interface OfflineOperation {
  id: string;
  type: 'add_item' | 'update_item' | 'update_quantity' | 'replace_modifiers' |
  'add_modifier' | 'remove_modifier' | 'void_item' | 'duplicate_item';
  params: any;
  timestamp: string;
  status: 'pending' | 'syncing' | 'synced' | 'failed';
  error?: string;
  // For optimistic updates
  tempId?: string;
  affectedItemId?: string;
}

// ============================================================================
// OFFLINE QUEUE MANAGER
// ============================================================================

class OfflineQueueManager {
  private readonly QUEUE_KEY = 'order_item_operations_queue';
  private readonly CACHE_KEY = 'order_items_cache';

  // Check network status
  async isOnline(): Promise<boolean> {
    const state = await NetInfo.fetch();
    return state.isConnected === true && state.isInternetReachable === true;
  }

  // Get pending operations (synchronous with MMKV)
  getQueue(): OfflineOperation[] {
    const data = getSyncJSON<OfflineOperation[]>(this.QUEUE_KEY);
    return data || [];
  }

  // Add operation to queue (synchronous with MMKV)
  enqueue(operation: Omit<OfflineOperation, 'id' | 'timestamp' | 'status'>): string {
    const queue = this.getQueue();
    const id = uuidv4();

    queue.push({
      ...operation,
      id,
      timestamp: new Date().toISOString(),
      status: 'pending'
    });

    setSyncJSON(this.QUEUE_KEY, queue);
    return id;
  }

  // Update operation status (synchronous with MMKV)
  updateStatus(id: string, status: OfflineOperation['status'], error?: string): void {
    const queue = this.getQueue();
    const index = queue.findIndex(op => op.id === id);

    if (index !== -1) {
      queue[index].status = status;
      if (error) queue[index].error = error;
      setSyncJSON(this.QUEUE_KEY, queue);
    }
  }

  // Remove synced operations (synchronous with MMKV)
  removeCompleted(): void {
    const queue = this.getQueue();
    const pending = queue.filter(op => op.status !== 'synced');
    setSyncJSON(this.QUEUE_KEY, pending);
  }

  // Cache order items for offline access (synchronous with MMKV)
  cacheOrderItems(orderId: string, items: OrderItem[]): void {
    const cache = this.getItemsCache();
    cache[orderId] = {
      items,
      cachedAt: new Date().toISOString()
    };
    setSyncJSON(this.CACHE_KEY, cache);
  }

  // Get cached items (synchronous with MMKV)
  getCachedItems(orderId: string): OrderItem[] | null {
    const cache = this.getItemsCache();
    return cache[orderId]?.items || null;
  }

  private getItemsCache(): Record<string, { items: OrderItem[], cachedAt: string }> {
    const data = getSyncJSON<Record<string, { items: OrderItem[], cachedAt: string }>>(this.CACHE_KEY);
    return data || {};
  }

  // Apply optimistic update to cache (synchronous with MMKV)
  applyOptimisticUpdate(orderId: string, updateFn: (items: OrderItem[]) => OrderItem[]): OrderItem[] {
    const cache = this.getItemsCache();
    if (cache[orderId]) {
      cache[orderId].items = updateFn(cache[orderId].items);
      setSyncJSON(this.CACHE_KEY, cache);
      return cache[orderId].items;
    }
    return [];
  }
}

// ============================================================================
// ORDER ITEM CRUD SERVICE
// ============================================================================

class OrderItemService {
  private queue = new OfflineQueueManager();
  private listeners: Set<(items: OrderItem[]) => void> = new Set();

  // Subscribe to item changes (for UI updates)
  subscribe(callback: (items: OrderItem[]) => void): () => void {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  private notifyListeners(items: OrderItem[]) {
    this.listeners.forEach(cb => cb(items));
  }

  // ==========================================================================
  // CREATE - Add Item to Order
  // ==========================================================================

  async addItem(params: {
    orderId: string;
    menuItemId?: string;
    locationExclusiveItemId?: string;
    itemName: string;
    itemDescription?: string;
    categoryName?: string;
    unitPrice: number;
    cashPrice?: number;
    useCashPrice?: boolean;
    quantity: number;
    selectedSizeId?: string;
    selectedSizeName?: string;
    sizePriceModifier?: number;
    specialInstructions?: string;
    modifiers?: OrderItemModifier[];
    prepStation?: string;
    courseNumber?: number;
  }): Promise<{ success: boolean; itemId: string; isOffline: boolean }> {

    const isOnline = await this.queue.isOnline();
    const supabase = useSupabaseClient();
    if (isOnline) {
      // ONLINE: Call RPC directly

      const { data, error } = await supabase.rpc('add_order_item_v2', {
        p_order_id: params.orderId,
        p_menu_item_id: params.menuItemId,
        p_location_exclusive_item_id: params.locationExclusiveItemId,
        p_item_name: params.itemName,
        p_item_description: params.itemDescription,
        p_category_name: params.categoryName,
        p_unit_price: params.unitPrice,
        p_cash_price: params.cashPrice,
        p_use_cash_price: params.useCashPrice ?? true,
        p_quantity: params.quantity,
        p_selected_size_id: params.selectedSizeId,
        p_selected_size_name: params.selectedSizeName,
        p_size_price_modifier: params.sizePriceModifier,
        p_special_instructions: params.specialInstructions,
        p_modifiers: params.modifiers || [],
        p_prep_station: params.prepStation,
        p_course_number: params.courseNumber
      });

      if (error) throw error;
      return { success: true, itemId: data.order_item_id, isOffline: false };
    } else {
      // OFFLINE: Queue operation + optimistic update
      const tempId = `TEMP-${uuidv4()}`;
      const pricePaid = (params.useCashPrice && params.cashPrice)
        ? params.cashPrice
        : params.unitPrice;
      const modifierTotal = (params.modifiers || []).reduce(
        (sum, m) => sum + (m.price_modifier * m.quantity), 0
      );

      // Create optimistic item
      const optimisticItem: OrderItem = {
        id: tempId,
        order_id: params.orderId,
        menu_item_id: params.menuItemId,
        location_exclusive_item_id: params.locationExclusiveItemId,
        item_name: params.itemName,
        item_description: params.itemDescription,
        category_name: params.categoryName,
        quantity: params.quantity,
        unit_price: params.unitPrice,
        cash_price: params.cashPrice,
        price_paid: pricePaid + (params.sizePriceModifier || 0),
        subtotal: params.quantity * (pricePaid + (params.sizePriceModifier || 0) + modifierTotal),
        selected_size_id: params.selectedSizeId,
        selected_size_name: params.selectedSizeName,
        size_price_modifier: params.sizePriceModifier,
        special_instructions: params.specialInstructions,
        item_status: 'pending',
        prep_station: params.prepStation,
        course_number: params.courseNumber,
        is_voided: false,
        modifiers: params.modifiers?.map(m => ({
          ...m,
          id: `TEMP-MOD-${uuidv4()}`,
          total_price: m.price_modifier * m.quantity
        }))
      };

      // Apply optimistic update
      await this.queue.applyOptimisticUpdate(params.orderId, items => [...items, optimisticItem]);

      // Queue for sync
      await this.queue.enqueue({
        type: 'add_item',
        params,
        tempId,
        affectedItemId: tempId
      });

      return { success: true, itemId: tempId, isOffline: true };
    }
  }

  // ==========================================================================
  // READ - Get Order Items
  // ==========================================================================

  async getOrderItems(orderId: string): Promise<OrderItem[]> {
    const isOnline = await this.queue.isOnline();
    const supabase = useSupabaseClient();
    if (isOnline) {
      // Fetch from database
      const { data, error } = await supabase
        .from('order_items')
        .select(`
          *,
          modifiers:order_item_modifiers(*)
        `)
        .eq('order_id', orderId)
        .eq('is_voided', false)
        .order('created_at');

      if (error) throw error;

      // Cache for offline use
      await this.queue.cacheOrderItems(orderId, data);
      return data;
    } else {
      // Return cached items
      const cached = await this.queue.getCachedItems(orderId);
      return cached || [];
    }
  }

  async getOrderItem(orderItemId: string): Promise<OrderItem | null> {
    const isOnline = await this.queue.isOnline();
    const supabase = useSupabaseClient();
    if (isOnline) {
      const { data, error } = await supabase.rpc('get_order_item', {
        p_order_item_id: orderItemId
      });

      if (error) throw error;
      return { ...data.item, modifiers: data.modifiers };
    } else {
      // Search in cache (synchronous with MMKV)
      const cache = getSyncJSON<Record<string, { items: OrderItem[], cachedAt: string }>>('order_items_cache');
      if (cache) {
        for (const orderId in cache) {
          const item = cache[orderId].items.find((i: OrderItem) => i.id === orderItemId);
          if (item) return item;
        }
      }
      return null;
    }
  }

  // ==========================================================================
  // UPDATE - Update Item Quantity
  // ==========================================================================

  async updateQuantity(orderItemId: string, quantity: number, orderId: string): Promise<{ success: boolean; isOffline: boolean }> {
    if (quantity < 1) {
      throw new Error('Quantity must be at least 1. Use voidItem() to remove.');
    }
    const supabase = useSupabaseClient();
    const isOnline = await this.queue.isOnline();

    if (isOnline) {
      const { data, error } = await supabase.rpc('update_order_item_quantity', {
        p_order_item_id: orderItemId,
        p_quantity: quantity
      });

      if (error) throw error;
      return { success: true, isOffline: false };
    } else {
      // Optimistic update
      await this.queue.applyOptimisticUpdate(orderId, items =>
        items.map(item => {
          if (item.id === orderItemId) {
            const modifierTotal = (item.modifiers || []).reduce(
              (sum, m) => sum + (m.total_price || 0), 0
            );
            return {
              ...item,
              quantity,
              subtotal: quantity * item.price_paid + quantity * modifierTotal
            };
          }
          return item;
        })
      );

      await this.queue.enqueue({
        type: 'update_quantity',
        params: { orderItemId, quantity },
        affectedItemId: orderItemId
      });

      return { success: true, isOffline: true };
    }
  }

  // ==========================================================================
  // UPDATE - Update Item Details
  // ==========================================================================

  async updateItem(params: {
    orderItemId: string;
    orderId: string;
    quantity?: number;
    specialInstructions?: string;
    prepStation?: string;
    courseNumber?: number;
    priceOverride?: number;
  }): Promise<{ success: boolean; isOffline: boolean }> {
    const isOnline = await this.queue.isOnline();
    const supabase = useSupabaseClient();
    if (isOnline) {
      const { data, error } = await supabase.rpc('update_order_item', {
        p_order_item_id: params.orderItemId,
        p_quantity: params.quantity,
        p_special_instructions: params.specialInstructions,
        p_prep_station: params.prepStation,
        p_course_number: params.courseNumber,
        p_price_override: params.priceOverride
      });

      if (error) throw error;
      return { success: true, isOffline: false };
    } else {
      // Optimistic update
      await this.queue.applyOptimisticUpdate(params.orderId, items =>
        items.map(item => {
          if (item.id === params.orderItemId) {
            const newQuantity = params.quantity ?? item.quantity;
            const newPricePaid = params.priceOverride ?? item.price_paid;
            const modifierTotal = (item.modifiers || []).reduce(
              (sum, m) => sum + (m.total_price || 0), 0
            );
            return {
              ...item,
              quantity: newQuantity,
              price_paid: newPricePaid,
              subtotal: newQuantity * newPricePaid + newQuantity * modifierTotal,
              special_instructions: params.specialInstructions ?? item.special_instructions,
              prep_station: params.prepStation ?? item.prep_station,
              course_number: params.courseNumber ?? item.course_number
            };
          }
          return item;
        })
      );

      await this.queue.enqueue({
        type: 'update_item',
        params,
        affectedItemId: params.orderItemId
      });

      return { success: true, isOffline: true };
    }
  }

  // ==========================================================================
  // UPDATE - Replace All Modifiers (Atomic)
  // ==========================================================================

  async replaceModifiers(
    orderItemId: string,
    orderId: string,
    modifiers: OrderItemModifier[]
  ): Promise<{ success: boolean; isOffline: boolean }> {
    const isOnline = await this.queue.isOnline();
    const supabase = useSupabaseClient();
    if (isOnline) {
      const { data, error } = await supabase.rpc('replace_order_item_modifiers', {
        p_order_item_id: orderItemId,
        p_modifiers: modifiers
      });

      if (error) throw error;
      return { success: true, isOffline: false };
    } else {
      // Optimistic update
      await this.queue.applyOptimisticUpdate(orderId, items =>
        items.map(item => {
          if (item.id === orderItemId) {
            const modifierTotal = modifiers.reduce(
              (sum, m) => sum + (m.price_modifier * m.quantity), 0
            );
            return {
              ...item,
              modifiers: modifiers.map(m => ({
                ...m,
                id: m.id || `TEMP-MOD-${uuidv4()}`,
                total_price: m.price_modifier * m.quantity
              })),
              subtotal: item.quantity * item.price_paid + item.quantity * modifierTotal
            };
          }
          return item;
        })
      );

      await this.queue.enqueue({
        type: 'replace_modifiers',
        params: { orderItemId, modifiers },
        affectedItemId: orderItemId
      });

      return { success: true, isOffline: true };
    }
  }

  // ==========================================================================
  // UPDATE - Add Single Modifier
  // ==========================================================================

  async addModifier(
    orderItemId: string,
    orderId: string,
    modifier: OrderItemModifier
  ): Promise<{ success: boolean; modifierId: string; isOffline: boolean }> {
    const isOnline = await this.queue.isOnline();
    const supabase = useSupabaseClient();
    if (isOnline) {
      const { data, error } = await supabase.rpc('add_order_item_modifier', {
        p_order_item_id: orderItemId,
        p_modifier_group_id: modifier.modifier_group_id,
        p_modifier_item_id: modifier.modifier_item_id,
        p_modifier_group_name: modifier.modifier_group_name,
        p_modifier_name: modifier.modifier_name,
        p_price_modifier: modifier.price_modifier,
        p_quantity: modifier.quantity
      });

      if (error) throw error;
      return { success: true, modifierId: data.modifier_id, isOffline: false };
    } else {
      const tempModifierId = `TEMP-MOD-${uuidv4()}`;

      await this.queue.applyOptimisticUpdate(orderId, items =>
        items.map(item => {
          if (item.id === orderItemId) {
            const newModifier = {
              ...modifier,
              id: tempModifierId,
              total_price: modifier.price_modifier * modifier.quantity
            };
            const newModifiers = [...(item.modifiers || []), newModifier];
            const modifierTotal = newModifiers.reduce((sum, m) => sum + (m.total_price || 0), 0);
            return {
              ...item,
              modifiers: newModifiers,
              subtotal: item.quantity * item.price_paid + item.quantity * modifierTotal
            };
          }
          return item;
        })
      );

      await this.queue.enqueue({
        type: 'add_modifier',
        params: { orderItemId, modifier },
        tempId: tempModifierId,
        affectedItemId: orderItemId
      });

      return { success: true, modifierId: tempModifierId, isOffline: true };
    }
  }

  // ==========================================================================
  // DELETE - Remove Modifier
  // ==========================================================================

  async removeModifier(
    modifierId: string,
    orderItemId: string,
    orderId: string
  ): Promise<{ success: boolean; isOffline: boolean }> {
    const isOnline = await this.queue.isOnline();
    const supabase = useSupabaseClient();
    if (isOnline) {
      const { data, error } = await supabase.rpc('remove_order_item_modifier', {
        p_modifier_id: modifierId
      });

      if (error) throw error;
      return { success: true, isOffline: false };
    } else {
      await this.queue.applyOptimisticUpdate(orderId, items =>
        items.map(item => {
          if (item.id === orderItemId) {
            const newModifiers = (item.modifiers || []).filter(m => m.id !== modifierId);
            const modifierTotal = newModifiers.reduce((sum, m) => sum + (m.total_price || 0), 0);
            return {
              ...item,
              modifiers: newModifiers,
              subtotal: item.quantity * item.price_paid + item.quantity * modifierTotal
            };
          }
          return item;
        })
      );

      await this.queue.enqueue({
        type: 'remove_modifier',
        params: { modifierId },
        affectedItemId: orderItemId
      });

      return { success: true, isOffline: true };
    }
  }

  // ==========================================================================
  // DELETE - Void Item (Soft Delete)
  // ==========================================================================

  async voidItem(
    orderItemId: string,
    orderId: string,
    voidReason: string
  ): Promise<{ success: boolean; isOffline: boolean }> {
    const isOnline = await this.queue.isOnline();
    const supabase = useSupabaseClient();
    if (isOnline) {
      const { data, error } = await supabase.rpc('void_order_item', {
        p_order_item_id: orderItemId,
        p_void_reason: voidReason
      });

      if (error) throw error;
      return { success: true, isOffline: false };
    } else {
      // Optimistic: remove from visible list
      await this.queue.applyOptimisticUpdate(orderId, items =>
        items.filter(item => item.id !== orderItemId)
      );

      await this.queue.enqueue({
        type: 'void_item',
        params: { orderItemId, voidReason },
        affectedItemId: orderItemId
      });

      return { success: true, isOffline: true };
    }
  }

  // ==========================================================================
  // DUPLICATE - Copy Item
  // ==========================================================================

  async duplicateItem(
    orderItemId: string,
    orderId: string,
    quantity?: number
  ): Promise<{ success: boolean; newItemId: string; isOffline: boolean }> {
    const isOnline = await this.queue.isOnline();
    const supabase = useSupabaseClient();
    if (isOnline) {
      const { data, error } = await supabase.rpc('duplicate_order_item', {
        p_order_item_id: orderItemId,
        p_quantity: quantity
      });

      if (error) throw error;
      return { success: true, newItemId: data.new_item_id, isOffline: false };
    } else {
      const tempId = `TEMP-${uuidv4()}`;

      // Get original item from cache
      const items = await this.queue.getCachedItems(orderId);
      const original = items?.find(i => i.id === orderItemId);

      if (original) {
        const duplicatedItem: OrderItem = {
          ...original,
          id: tempId,
          quantity: quantity ?? original.quantity,
          item_status: 'pending',
          modifiers: original.modifiers?.map(m => ({
            ...m,
            id: `TEMP-MOD-${uuidv4()}`
          }))
        };

        // Recalculate subtotal if quantity changed
        if (quantity && quantity !== original.quantity) {
          const modifierTotal = (duplicatedItem.modifiers || []).reduce(
            (sum, m) => sum + (m.total_price || 0), 0
          );
          duplicatedItem.subtotal = quantity * original.price_paid + quantity * modifierTotal;
        }

        await this.queue.applyOptimisticUpdate(orderId, items => [...items, duplicatedItem]);
      }

      await this.queue.enqueue({
        type: 'duplicate_item',
        params: { orderItemId, quantity },
        tempId,
        affectedItemId: orderItemId
      });

      return { success: true, newItemId: tempId, isOffline: true };
    }
  }

  // ==========================================================================
  // SYNC - Process Offline Queue
  // ==========================================================================

  async syncOfflineOperations(): Promise<{
    synced: number;
    failed: number;
    errors: string[];
  }> {
    const isOnline = await this.queue.isOnline();
    if (!isOnline) {
      return { synced: 0, failed: 0, errors: ['Still offline'] };
    }

    const queue = await this.queue.getQueue();
    const pending = queue.filter(op => op.status === 'pending');

    let synced = 0;
    let failed = 0;
    const errors: string[] = [];

    for (const operation of pending) {
      try {
        await this.queue.updateStatus(operation.id, 'syncing');
        const supabase = useSupabaseClient();
        switch (operation.type) {
          case 'add_item':
            await supabase.rpc('add_order_item_v2', {
              p_order_id: operation.params.orderId,
              p_menu_item_id: operation.params.menuItemId,
              p_location_exclusive_item_id: operation.params.locationExclusiveItemId,
              p_item_name: operation.params.itemName,
              p_item_description: operation.params.itemDescription,
              p_category_name: operation.params.categoryName,
              p_unit_price: operation.params.unitPrice,
              p_cash_price: operation.params.cashPrice,
              p_use_cash_price: operation.params.useCashPrice ?? true,
              p_quantity: operation.params.quantity,
              p_selected_size_id: operation.params.selectedSizeId,
              p_selected_size_name: operation.params.selectedSizeName,
              p_size_price_modifier: operation.params.sizePriceModifier,
              p_special_instructions: operation.params.specialInstructions,
              p_modifiers: operation.params.modifiers || [],
              p_prep_station: operation.params.prepStation,
              p_course_number: operation.params.courseNumber
            });
            break;

          case 'update_quantity':
            await supabase.rpc('update_order_item_quantity_v2', {
              p_order_item_id: operation.params.orderItemId,
              p_quantity: operation.params.quantity
            });
            break;

          case 'update_item':
            await supabase.rpc('update_order_item', {
              p_order_item_id: operation.params.orderItemId,
              p_quantity: operation.params.quantity,
              p_special_instructions: operation.params.specialInstructions,
              p_prep_station: operation.params.prepStation,
              p_course_number: operation.params.courseNumber,
              p_price_override: operation.params.priceOverride
            });
            break;

          case 'replace_modifiers':
            await supabase.rpc('replace_order_item_modifiers_v2', {
              p_order_item_id: operation.params.orderItemId,
              p_modifiers: operation.params.modifiers
            });
            break;

          case 'add_modifier':
            await supabase.rpc('add_order_item_modifier', {
              p_order_item_id: operation.params.orderItemId,
              p_modifier_group_id: operation.params.modifier.modifier_group_id,
              p_modifier_item_id: operation.params.modifier.modifier_item_id,
              p_modifier_group_name: operation.params.modifier.modifier_group_name,
              p_modifier_name: operation.params.modifier.modifier_name,
              p_price_modifier: operation.params.modifier.price_modifier,
              p_quantity: operation.params.modifier.quantity
            });
            break;

          case 'remove_modifier':
            await supabase.rpc('remove_order_item_modifier', {
              p_modifier_id: operation.params.modifierId
            });
            break;

          case 'void_item':
            await supabase.rpc('void_order_item', {
              p_order_item_id: operation.params.orderItemId,
              p_void_reason: operation.params.voidReason
            });
            break;

          case 'duplicate_item':
            await supabase.rpc('duplicate_order_item', {
              p_order_item_id: operation.params.orderItemId,
              p_quantity: operation.params.quantity
            });
            break;
        }

        await this.queue.updateStatus(operation.id, 'synced');
        synced++;
      } catch (error: any) {
        await this.queue.updateStatus(operation.id, 'failed', error.message);
        failed++;
        errors.push(`${operation.type}: ${error.message}`);
      }
    }

    // Clean up synced operations
    await this.queue.removeCompleted();

    return { synced, failed, errors };
  }

  // Get pending operation count
  async getPendingCount(): Promise<number> {
    const queue = await this.queue.getQueue();
    return queue.filter(op => op.status === 'pending').length;
  }
}

// Export singleton instance
export const orderItemService = new OrderItemService();

// ============================================================================
// REACT HOOK FOR ORDER ITEMS
// ============================================================================

import { useCallback, useEffect, useState } from 'react';

export function useOrderItems(orderId: string) {
  const [items, setItems] = useState<OrderItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pendingSync, setPendingSync] = useState(0);
  const [isOnline, setIsOnline] = useState(true);

  // Load items
  const loadItems = useCallback(async () => {
    try {
      setLoading(true);
      const data = await orderItemService.getOrderItems(orderId);
      setItems(data);
      setError(null);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [orderId]);

  // Monitor network status
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      setIsOnline(state.isConnected === true);
    });
    return () => unsubscribe();
  }, []);

  // Load items on mount
  useEffect(() => {
    loadItems();
  }, [loadItems]);

  // Check pending count
  useEffect(() => {
    const checkPending = async () => {
      const count = await orderItemService.getPendingCount();
      setPendingSync(count);
    };
    checkPending();
    const interval = setInterval(checkPending, 5000);
    return () => clearInterval(interval);
  }, []);

  // Auto-sync when coming online
  useEffect(() => {
    if (isOnline && pendingSync > 0) {
      orderItemService.syncOfflineOperations().then(() => {
        loadItems();
      });
    }
  }, [isOnline, pendingSync, loadItems]);

  // Actions
  const addItem = async (params: Parameters<typeof orderItemService.addItem>[0]) => {
    const result = await orderItemService.addItem({ ...params, orderId });
    await loadItems();
    return result;
  };

  const updateQuantity = async (itemId: string, quantity: number) => {
    const result = await orderItemService.updateQuantity(itemId, quantity, orderId);
    await loadItems();
    return result;
  };

  const updateItem = async (params: Omit<Parameters<typeof orderItemService.updateItem>[0], 'orderId'>) => {
    const result = await orderItemService.updateItem({ ...params, orderId });
    await loadItems();
    return result;
  };

  const replaceModifiers = async (itemId: string, modifiers: OrderItemModifier[]) => {
    const result = await orderItemService.replaceModifiers(itemId, orderId, modifiers);
    await loadItems();
    return result;
  };

  const addModifier = async (itemId: string, modifier: OrderItemModifier) => {
    const result = await orderItemService.addModifier(itemId, orderId, modifier);
    await loadItems();
    return result;
  };

  const removeModifier = async (modifierId: string, itemId: string) => {
    const result = await orderItemService.removeModifier(modifierId, itemId, orderId);
    await loadItems();
    return result;
  };

  const voidItem = async (itemId: string, reason: string) => {
    const result = await orderItemService.voidItem(itemId, orderId, reason);
    await loadItems();
    return result;
  };

  const duplicateItem = async (itemId: string, quantity?: number) => {
    const result = await orderItemService.duplicateItem(itemId, orderId, quantity);
    await loadItems();
    return result;
  };

  const syncNow = async () => {
    const result = await orderItemService.syncOfflineOperations();
    await loadItems();
    return result;
  };

  return {
    items,
    loading,
    error,
    isOnline,
    pendingSync,
    // Actions
    addItem,
    updateQuantity,
    updateItem,
    replaceModifiers,
    addModifier,
    removeModifier,
    voidItem,
    duplicateItem,
    syncNow,
    refresh: loadItems
  };
}