// ============================================================================
// DEXA POS - React Native Order Management Hooks
// Example implementation for POS Tablet
// ============================================================================

import { getSyncJSON, setSyncJSON } from '@/lib/storage';
import type { Order, OrderItem, OrderStatus, PaymentMethod } from '@/types/db-order-management-types';
import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { useSupabaseClient } from '../useSupabaseClient';

// ============================================================================
// useOrder Hook - Complete order management
// ============================================================================

export const useOrder = (orderId?: string) => {
    const [order, setOrder] = useState<Order | null>(null);
    const [items, setItems] = useState<OrderItem[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Fetch order details
    const fetchOrder = useCallback(async () => {
        if (!orderId) return;
        const supabase = useSupabaseClient();

        setLoading(true);
        setError(null);

        try {
            const { data, error: fetchError } = await supabase.rpc('get_order_details', {
                p_order_id: orderId
            });

            if (fetchError) throw fetchError;

            setOrder(data.order);
            setItems(data.items || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch order';
            setError(message);
            console.error('Fetch order error:', err);
        } finally {
            setLoading(false);
        }
    }, [orderId]);

    // Create new order
    const createOrder = async (params: {
        merchantId: string;
        locationId: string;
        orderType?: 'dine_in' | 'takeout' | 'delivery';
        tableNumber?: string;
        customerName?: string;
        customerPhone?: string;
        deviceId?: string;
        staffId?: string;
    }) => {
        setLoading(true);
        setError(null);
        const supabase = useSupabaseClient();

        try {
            const { data, error: createError } = await supabase.rpc('create_order', {
                p_merchant_id: params.merchantId,
                p_location_id: params.locationId,
                p_order_type: params.orderType || 'dine_in',
                p_table_number: params.tableNumber,
                p_customer_name: params.customerName,
                p_customer_phone: params.customerPhone,
                p_device_id: params.deviceId,
                p_created_by_staff_id: params.staffId
            });

            if (createError) throw createError;

            // Fetch the complete order
            await fetchOrder();

            return data;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to create order';
            setError(message);
            Alert.alert('Error', message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    // Add item to order
    const addItem = async (params: {
        menuItemId?: string;
        locationExclusiveItemId?: string;
        quantity: number;
        selectedSizeId?: string;
        specialInstructions?: string;
        modifiers?: Array<{
            modifier_group_id: string;
            modifier_item_id: string;
            modifier_group_name: string;
            modifier_name: string;
            price_modifier: number;
            quantity?: number;
        }>;
    }) => {
        if (!orderId) throw new Error('No active order');

        setLoading(true);
        setError(null);
        const supabase = useSupabaseClient();

        try {
            const { data, error: addError } = await supabase.rpc('add_order_item_v2', {
                p_order_id: orderId,
                p_menu_item_id: params.menuItemId,
                p_location_exclusive_item_id: params.locationExclusiveItemId,
                p_quantity: params.quantity,
                p_selected_size_id: params.selectedSizeId,
                p_special_instructions: params.specialInstructions,
                p_modifiers: params.modifiers || []
            });

            if (addError) throw addError;

            // Refresh order
            await fetchOrder();

            return data;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to add item';
            setError(message);
            Alert.alert('Error', message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    // Update order status
    const updateStatus = async (newStatus: OrderStatus, reason?: string) => {
        if (!orderId) throw new Error('No active order');

        setLoading(true);
        setError(null);
        const supabase = useSupabaseClient();

        try {
            const { data, error: statusError } = await supabase.rpc('update_order_status', {
                p_order_id: orderId,
                p_new_status: newStatus,
                p_reason: reason
            });

            if (statusError) throw statusError;

            // Refresh order
            await fetchOrder();

            return data;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to update status';
            setError(message);
            Alert.alert('Error', message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    // Calculate tax
    const calculateTax = async (taxRate: number = 0.0825) => {
        if (!orderId) throw new Error('No active order');

        setLoading(true);
        setError(null);
        const supabase = useSupabaseClient();

        try {
            const { data, error: taxError } = await supabase.rpc('calculate_order_tax', {
                p_order_id: orderId
                // p_tax_rate: taxRate
            });

            if (taxError) throw taxError;

            // Refresh order
            await fetchOrder();

            return data;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to calculate tax';
            setError(message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    // Process payment using process_payment_v2
    const processPayment = async (params: {
        paymentMethod: PaymentMethod;
        amount: number;
        tipAmount?: number;
        terminalType?: 'dejavoo_spinapi' | 'dejavoo_p18' | 'none';
        terminalId?: string;
        deviceId?: string;
        transactionDetails?: Record<string, any>;
        amountTendered?: number;
        splitCount?: number;
        splitPortionIndex?: number;
        itemIds?: string[];
    }) => {
        if (!orderId) throw new Error('No active order');

        setLoading(true);
        setError(null);
        const supabase = useSupabaseClient();

        console.log(`[useOrders:processPayment] ====== PROCESSING PAYMENT ======`);
        console.log(`[useOrders:processPayment] Order ID: ${orderId}`);
        console.log(`[useOrders:processPayment] Method: ${params.paymentMethod}, Amount: ${params.amount}`);

        try {
            // Build terminal response for card payments
            const terminalResponse = params.paymentMethod !== 'cash' && params.transactionDetails
                ? params.transactionDetails
                : null;

            const { data, error: paymentError } = await supabase.rpc('process_payment_v2', {
                p_order_id: orderId,
                p_payment_method: params.paymentMethod,
                p_amount: params.amount,
                p_tip_amount: params.tipAmount || 0,
                p_amount_tendered: params.paymentMethod === 'cash' ? (params.amountTendered || params.amount) : null,
                p_terminal_response: terminalResponse,
                p_split_count: params.splitCount || null,
                p_split_portion_index: params.splitPortionIndex || null,
                p_item_ids: params.itemIds || null,
            });

            if (paymentError) {
                console.error(`[useOrders:processPayment] FAILED:`, paymentError);
                throw paymentError;
            }

            console.log(`[useOrders:processPayment] SUCCESS:`, JSON.stringify(data, null, 2));

            // Refresh order
            await fetchOrder();

            return data;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to process payment';
            console.error(`[useOrders:processPayment] Error:`, message);
            setError(message);
            Alert.alert('Payment Error', message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    // Void item
    const voidItem = async (orderItemId: string, reason: string) => {
        setLoading(true);
        setError(null);
        const supabase = useSupabaseClient();

        try {
            const { data, error: voidError } = await supabase.rpc('void_order_item', {
                p_order_item_id: orderItemId,
                p_void_reason: reason
            });

            if (voidError) throw voidError;

            // Refresh order
            await fetchOrder();

            return data;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to void item';
            setError(message);
            Alert.alert('Error', message);
            throw err;
        } finally {
            setLoading(false);
        }
    };

    // Subscribe to order changes
    useEffect(() => {
        if (!orderId) return;
        const supabase = useSupabaseClient();

        const channel = supabase
            .channel(`order_${orderId}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'orders',
                    filter: `id=eq.${orderId}`
                },
                (payload) => {
                    console.log('Order updated:', payload);
                    setOrder(payload.new as Order);
                }
            )
            .subscribe();

        // Initial fetch
        fetchOrder();

        return () => {
            channel.unsubscribe();
        };
    }, [orderId, fetchOrder]);

    return {
        order,
        items,
        loading,
        error,
        createOrder,
        addItem,
        updateStatus,
        calculateTax,
        processPayment,
        voidItem,
        refetch: fetchOrder
    };
};

// ============================================================================
// useOrders Hook - List orders for location
// ============================================================================

export const useOrders = (locationId: string, statuses?: OrderStatus[]) => {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const supabase = useSupabaseClient();

    // Fetch orders
    const fetchOrders = useCallback(async () => {
        setLoading(true);
        setError(null);

        try {
            let query = supabase
                .from('orders')
                .select(`
          *,
          order_items (
            *,
            order_item_modifiers (*)
          )
        `)
                .eq('location_id', locationId)
                .order('created_at', { ascending: false });

            if (statuses && statuses.length > 0) {
                query = query.in('status', statuses);
            }

            const { data, error: fetchError } = await query;

            if (fetchError) throw fetchError;

            setOrders(data || []);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to fetch orders';
            setError(message);
            console.error('Fetch orders error:', err);
        } finally {
            setLoading(false);
        }
    }, [locationId, statuses]);

    // Subscribe to order changes
    useEffect(() => {
        const channel = supabase
            .channel(`location_${locationId}_orders`)
            .on(
                'postgres_changes',
                {
                    event: 'INSERT',
                    schema: 'public',
                    table: 'orders',
                    filter: `location_id=eq.${locationId}`
                },
                (payload) => {
                    console.log('New order:', payload);
                    setOrders((prev) => [payload.new as Order, ...prev]);
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'orders',
                    filter: `location_id=eq.${locationId}`
                },
                (payload) => {
                    console.log('Order updated:', payload);
                    setOrders((prev) =>
                        prev.map((order) =>
                            order.id === payload.new.id ? (payload.new as Order) : order
                        )
                    );
                }
            )
            .on(
                'postgres_changes',
                {
                    event: 'DELETE',
                    schema: 'public',
                    table: 'orders',
                    filter: `location_id=eq.${locationId}`
                },
                (payload) => {
                    console.log('Order deleted:', payload);
                    setOrders((prev) => prev.filter((order) => order.id !== payload.old.id));
                }
            )
            .subscribe();

        // Initial fetch
        fetchOrders();

        return () => {
            channel.unsubscribe();
        };
    }, [locationId, fetchOrders]);

    return {
        orders,
        loading,
        error,
        refetch: fetchOrders
    };
};

// ============================================================================
// useOrderCart Hook - Manage order cart state
// ============================================================================

interface CartItem {
    menuItemId?: string;
    locationExclusiveItemId?: string;
    itemName: string;
    quantity: number;
    unitPrice: number;
    selectedSizeId?: string;
    selectedSizeName?: string;
    sizeModifier?: number;
    specialInstructions?: string;
    modifiers: Array<{
        modifier_group_id: string;
        modifier_item_id: string;
        modifier_group_name: string;
        modifier_name: string;
        price_modifier: number;
        quantity: number;
    }>;
}

export const useOrderCart = () => {
    const [cart, setCart] = useState<CartItem[]>([]);
    const [subtotal, setSubtotal] = useState(0);

    // Add item to cart
    const addToCart = useCallback((item: CartItem) => {
        setCart((prev) => [...prev, item]);
    }, []);

    // Remove item from cart
    const removeFromCart = useCallback((index: number) => {
        setCart((prev) => prev.filter((_, i) => i !== index));
    }, []);

    // Update item quantity
    const updateQuantity = useCallback((index: number, quantity: number) => {
        setCart((prev) =>
            prev.map((item, i) =>
                i === index ? { ...item, quantity } : item
            )
        );
    }, []);

    // Clear cart
    const clearCart = useCallback(() => {
        setCart([]);
    }, []);

    // Calculate subtotal
    useEffect(() => {
        const total = cart.reduce((sum, item) => {
            const basePrice = item.unitPrice + (item.sizeModifier || 0);
            const modifiersTotal = item.modifiers.reduce(
                (modSum, mod) => modSum + mod.price_modifier * mod.quantity,
                0
            );
            return sum + (basePrice + modifiersTotal) * item.quantity;
        }, 0);

        setSubtotal(total);
    }, [cart]);

    return {
        cart,
        subtotal,
        itemCount: cart.length,
        addToCart,
        removeFromCart,
        updateQuantity,
        clearCart
    };
};

// ============================================================================
// useOfflineOrders Hook - Handle offline order creation
// ============================================================================

const OFFLINE_ORDERS_KEY = 'offline_orders';

export const useOfflineOrders = () => {
    const [offlineOrders, setOfflineOrders] = useState<Order[]>([]);
    const [syncing, setSyncing] = useState(false);
    const supabase = useSupabaseClient();

    // Load offline orders from storage (synchronous with MMKV)
    const loadOfflineOrders = useCallback(() => {
        try {
            const stored = getSyncJSON<Order[]>(OFFLINE_ORDERS_KEY);
            if (stored) {
                setOfflineOrders(stored);
            }
        } catch (err) {
            console.error('Failed to load offline orders:', err);
        }
    }, []);

    // Save order for offline sync (synchronous with MMKV)
    const saveOfflineOrder = useCallback((order: Order) => {
        try {
            const stored = getSyncJSON<Order[]>(OFFLINE_ORDERS_KEY);
            const orders = stored ? stored : [];
            orders.push({ ...order, is_offline: true });
            setSyncJSON(OFFLINE_ORDERS_KEY, orders);
            setOfflineOrders(orders);
        } catch (err) {
            console.error('Failed to save offline order:', err);
        }
    }, []);

    // Sync offline orders to server
    const syncOfflineOrders = useCallback(async () => {
        if (offlineOrders.length === 0) return;

        setSyncing(true);

        try {
            for (const order of offlineOrders) {
                // Insert order
                const { error: orderError } = await supabase
                    .from('orders')
                    .insert({
                        ...order,
                        last_synced_at: new Date().toISOString()
                    });

                if (orderError) {
                    console.error('Failed to sync order:', order.id, orderError);
                    continue;
                }

                // Remove from offline storage (synchronous with MMKV)
                const remaining = offlineOrders.filter((o) => o.id !== order.id);
                setSyncJSON(OFFLINE_ORDERS_KEY, remaining);
                setOfflineOrders(remaining);
            }

            Alert.alert('Success', 'All offline orders synced!');
        } catch (err) {
            console.error('Sync error:', err);
            Alert.alert('Error', 'Failed to sync some orders. Will retry later.');
        } finally {
            setSyncing(false);
        }
    }, [offlineOrders]);

    // Load on mount
    useEffect(() => {
        loadOfflineOrders();
    }, [loadOfflineOrders]);

    return {
        offlineOrders,
        syncing,
        saveOfflineOrder,
        syncOfflineOrders,
        hasOfflineOrders: offlineOrders.length > 0
    };
};

// ============================================================================
// usePaymentTerminal Hook - Payment processing
// ============================================================================

export const usePaymentTerminal = () => {
    const [processing, setProcessing] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Process cash payment
    const processCashPayment = async (
        orderId: string,
        amount: number,
        tipAmount: number = 0
    ) => {
        setProcessing(true);
        setError(null);
        const supabase = useSupabaseClient();

        try {
            const { data, error: paymentError } = await supabase.rpc('process_payment', {
                p_order_id: orderId,
                p_payment_method: 'cash',
                p_amount: amount,
                p_tip_amount: tipAmount,
                p_terminal_type: 'none'
            });

            if (paymentError) throw paymentError;

            return data;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Payment failed';
            setError(message);
            throw err;
        } finally {
            setProcessing(false);
        }
    };

    // Process card payment (SPINAPI or DVPaylite)
    const processCardPayment = async (
        orderId: string,
        amount: number,
        tipAmount: number,
        terminalType: 'dejavoo_spinapi' | 'dejavoo_p18',
        transactionDetails: Record<string, any>
    ) => {
        setProcessing(true);
        setError(null);

        try {
            const supabase = useSupabaseClient();

            const paymentMethod =
                terminalType === 'dejavoo_spinapi' ? 'card_spinapi' : 'card_dvpaylite';

            const { data, error: paymentError } = await supabase.rpc('process_payment', {
                p_order_id: orderId,
                p_payment_method: paymentMethod,
                p_amount: amount,
                p_tip_amount: tipAmount,
                p_terminal_type: terminalType,
                p_transaction_details: transactionDetails
            });

            if (paymentError) throw paymentError;

            return data;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Payment failed';
            setError(message);
            throw err;
        } finally {
            setProcessing(false);
        }
    };

    return {
        processing,
        error,
        processCashPayment,
        processCardPayment
    };
};

// ============================================================================
// Example Usage in Component
// ============================================================================

/*
// In your POS screen component:

import { useOrder, useOrderCart, usePaymentTerminal } from '../hooks/useOrders';

const POSScreen = () => {
  const { cart, addToCart, clearCart, subtotal } = useOrderCart();
  const { order, createOrder, addItem, calculateTax, updateStatus } = useOrder();
  const { processCashPayment, processing } = usePaymentTerminal();

  const handleCreateOrder = async () => {
    try {
      // Create order
      const result = await createOrder({
        merchantId: currentMerchant.id,
        locationId: currentLocation.id,
        orderType: 'dine_in',
        tableNumber: selectedTable,
        deviceId: deviceId,
        staffId: currentStaff.id
      });

      const orderId = result.order_id;

      // Add all cart items
      for (const cartItem of cart) {
        await addItem({
          menuItemId: cartItem.menuItemId,
          quantity: cartItem.quantity,
          selectedSizeId: cartItem.selectedSizeId,
          specialInstructions: cartItem.specialInstructions,
          modifiers: cartItem.modifiers
        });
      }

      // Calculate tax
      await calculateTax(0.0825);

      // Send to kitchen
      await updateStatus('pending');

      // Clear cart
      clearCart();

      Alert.alert('Success', `Order ${result.order_number} created!`);
    } catch (error) {
      console.error('Failed to create order:', error);
    }
  };

  const handlePayment = async () => {
    if (!order) return;

    try {
      await processCashPayment(order.id, order.total_amount, 0);
      Alert.alert('Success', 'Payment processed!');
      
      // Navigate to receipt or order list
      navigation.navigate('OrderList');
    } catch (error) {
      console.error('Payment failed:', error);
    }
  };

  return (
    <View>
      {/* Your POS UI here *\/}
      <Button title="Create Order" onPress={handleCreateOrder} />
      <Button 
        title="Process Payment" 
        onPress={handlePayment} 
        disabled={processing || !order}
      />
    </View>
  );
};
*/