# State Management & Data Fetching Guide

## Overview

Dexa POS uses Zustand for state management with MMKV persistence, combined with 
Supabase for backend data and real-time subscriptions.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                         STATE MANAGEMENT ARCHITECTURE                             │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                           ZUSTAND STORES                                 │    │
│   │                                                                          │    │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │    │
│   │  │ useOrderStore│  │usePaymentStore│  │useMenuStore │  │useFloorPlan│  │    │
│   │  │              │  │              │  │              │  │   Store    │  │    │
│   │  │ • Orders     │  │ • Payment UI │  │ • Menu items │  │ • Tables   │  │    │
│   │  │ • Items      │  │ • Split state│  │ • Categories │  │ • Sections │  │    │
│   │  │ • Payments   │  │ • Terminal   │  │ • Modifiers  │  │ • Sessions │  │    │
│   │  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘  │    │
│   │                                                                          │    │
│   │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐  ┌────────────┐  │    │
│   │  │useStoreSettings│ │useInventory │  │useSchedule   │  │useEmployee │  │    │
│   │  │    Store     │  │   Store      │  │   Store      │  │   Store    │  │    │
│   │  │              │  │              │  │              │  │            │  │    │
│   │  │ • Location   │  │ • Stock      │  │ • Shifts     │  │ • Staff    │  │    │
│   │  │ • Station    │  │ • Alerts     │  │ • Time clock │  │ • Roles    │  │    │
│   │  │ • Settings   │  │ • Tracking   │  │ • PTO        │  │ • Auth     │  │    │
│   │  └──────────────┘  └──────────────┘  └──────────────┘  └────────────┘  │    │
│   │                                                                          │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
│                                         │                                         │
│                                         ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                            MMKV PERSISTENCE                              │    │
│   │                                                                          │    │
│   │  • Fast synchronous storage (faster than AsyncStorage)                  │    │
│   │  • Selected stores persist (orders, settings, auth)                     │    │
│   │  • Survives app restart                                                 │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
│                                         │                                         │
│                                         ▼                                         │
│   ┌─────────────────────────────────────────────────────────────────────────┐    │
│   │                         SUPABASE BACKEND                                 │    │
│   │                                                                          │    │
│   │  ┌────────────┐    ┌────────────┐    ┌────────────┐                    │    │
│   │  │  Database  │    │  Realtime  │    │    RPC     │                    │    │
│   │  │            │    │            │    │            │                    │    │
│   │  │ PostgreSQL │◄──►│ Broadcast  │◄──►│ Functions  │                    │    │
│   │  │            │    │ Channels   │    │            │                    │    │
│   │  └────────────┘    └────────────┘    └────────────┘                    │    │
│   │                                                                          │    │
│   └─────────────────────────────────────────────────────────────────────────┘    │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## Zustand Stores Overview

### Main Stores

| Store | Purpose | Persisted | File |
|-------|---------|-----------|------|
| `useOrderStore` | Order management | ✅ Partial | `stores/useOrderStore.ts` |
| `usePaymentStore` | Payment flow UI | ❌ | `stores/usePaymentStore.ts` |
| `useMenuStore` | Menu items/categories | ✅ | `stores/useMenuStore.ts` |
| `useStoreSettingsStore` | Location/station | ✅ | `stores/useStoreSettingsStore.ts` |
| `useFloorPlanStore` | Tables/sections | ✅ | `stores/useFloorPlanStore.ts` |
| `useDineInStore` | Table sessions | ✅ | `stores/useDineInStore.ts` |
| `useInventoryStore` | Stock tracking | ✅ | `stores/useInventoryStore.ts` |
| `useEmployeeStore` | Staff/auth | ✅ | `stores/useEmployeeStore.ts` |
| `usePreviousOrdersStore` | Order history | ❌ | `stores/usePreviousOrdersStore.ts` |
| `useScheduleStore` | Staff scheduling | ✅ | `stores/useScheduleStore.ts` |
| `useCoursingStore` | Course management | ❌ | `stores/useCoursingStore.ts` |
| `useCustomerStore` | Customer data | ✅ | `stores/useCustomerStore.ts` |
| `useNotificationStore` | Notifications | ❌ | `stores/useNotificationStore.ts` |
| `useSyncStatusStore` | Sync state | ❌ | `stores/useSyncStatusStore.ts` |
| `useConflictStore` | Conflict resolution | ❌ | `stores/useConflictStore.ts` |

---

## Store Patterns

### Basic Store Structure

```typescript
// stores/useExampleStore.ts
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { mmkvStorage } from '@/lib/storage';

interface ExampleState {
  // State
  items: Item[];
  isLoading: boolean;
  error: string | null;
  
  // Actions
  fetchItems: () => Promise<void>;
  addItem: (item: Item) => void;
  updateItem: (id: string, updates: Partial<Item>) => void;
  removeItem: (id: string) => void;
  reset: () => void;
}

const initialState = {
  items: [],
  isLoading: false,
  error: null,
};

export const useExampleStore = create<ExampleState>()(
  persist(
    (set, get) => ({
      // Initial state
      ...initialState,
      
      // Actions
      fetchItems: async () => {
        set({ isLoading: true, error: null });
        try {
          const { data, error } = await supabase
            .from('items')
            .select('*');
          
          if (error) throw error;
          set({ items: data || [] });
        } catch (err) {
          set({ error: String(err) });
        } finally {
          set({ isLoading: false });
        }
      },
      
      addItem: (item) => {
        set((state) => ({
          items: [...state.items, item],
        }));
      },
      
      updateItem: (id, updates) => {
        set((state) => ({
          items: state.items.map((item) =>
            item.id === id ? { ...item, ...updates } : item
          ),
        }));
      },
      
      removeItem: (id) => {
        set((state) => ({
          items: state.items.filter((item) => item.id !== id),
        }));
      },
      
      reset: () => set(initialState),
    }),
    {
      name: 'example-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        items: state.items,  // Only persist items, not loading/error
      }),
    }
  )
);
```

---

## Performance: Using Selectors

### The Problem

```typescript
// ❌ BAD - subscribes to ENTIRE store, re-renders on ANY change
function MyComponent() {
  const { orders, addItem, removeItem, isLoading } = useOrderStore();
  // This component re-renders whenever ANYTHING in the store changes!
}
```

### The Solution

```typescript
// ✅ GOOD - only subscribes to specific state
function MyComponent() {
  // Each selector = separate subscription
  const orders = useOrderStore((state) => state.ordersById);
  const addItem = useOrderStore((state) => state.addItemToOrder);
  const isLoading = useOrderStore((state) => state.isLoading);
  // Only re-renders when these specific values change
}
```

### Memoized Selectors for Derived Data

```typescript
// ✅ BEST - memoized selector for computed values
import { useCallback, useMemo } from 'react';

function OrderComponent({ orderId }: { orderId: string }) {
  // Memoized selector - stable reference
  const order = useOrderStore(
    useCallback((state) => state.ordersById[orderId], [orderId])
  );
  
  // Derived data memoized
  const totalItems = useMemo(() => 
    order?.items.reduce((sum, item) => sum + item.quantity, 0) ?? 0,
    [order?.items]
  );
  
  return <Text>Items: {totalItems}</Text>;
}
```

### Shallow Equality for Objects

```typescript
import { shallow } from 'zustand/shallow';

// When selecting multiple values as object
const { orders, activeOrderId } = useOrderStore(
  (state) => ({
    orders: state.ordersById,
    activeOrderId: state.activeOrderId,
  }),
  shallow  // Use shallow comparison to prevent unnecessary re-renders
);
```

---

## MMKV Storage

### Configuration

```typescript
// lib/storage.ts
import { MMKV } from 'react-native-mmkv';

const storage = new MMKV();

export const mmkvStorage = {
  getItem: (name: string) => {
    const value = storage.getString(name);
    return value ?? null;
  },
  setItem: (name: string, value: string) => {
    storage.set(name, value);
  },
  removeItem: (name: string) => {
    storage.delete(name);
  },
};
```

### Why MMKV?

| Feature | MMKV | AsyncStorage |
|---------|------|--------------|
| Speed | ~30x faster | Baseline |
| Synchronous | ✅ Yes | ❌ No |
| Encryption | ✅ Optional | ❌ No |
| Size limit | ~1GB | ~6MB |

### Persistence Configuration

```typescript
// What gets persisted (example from useOrderStore)
partialize: (state) => ({
  ordersById: state.ordersById,           // ⚠️ Can grow large
  orderIds: state.orderIds,
  activeOrderId: state.activeOrderId,
  workingSetOrderIds: state.workingSetOrderIds,
  // NOT persisted: isLoading, error, temporary UI state
}),
```

### Rehydration

```typescript
onRehydrateStorage: () => {
  return (state, error) => {
    if (error) {
      console.error('Rehydration failed:', error);
      return;
    }
    
    // Post-hydration actions
    if (state?.activeOrderId) {
      // Sync active order from backend
      setTimeout(() => {
        state.syncOrderFromBackendComplete(state.activeOrderId);
      }, 100);
    }
  };
},
```

---

## Data Fetching Patterns

### Initial Data Load

```typescript
// hooks/useInitializeData.ts
export function useInitializeData() {
  const { selectedStore } = useStoreSettingsStore();
  
  useEffect(() => {
    if (!selectedStore) return;
    
    const locationId = selectedStore.id;
    
    // Parallel fetch of independent data
    Promise.all([
      useMenuStore.getState().fetchMenu(locationId),
      useOrderStore.getState().initializeOrders(locationId),
      useFloorPlanStore.getState().fetchFloorPlan(locationId),
      useInventoryStore.getState().fetchInventory(locationId),
    ]).then(() => {
      console.log('Initial data loaded');
    });
  }, [selectedStore?.id]);
}
```

### Fetch on Mount

```typescript
function OrdersScreen() {
  const fetchOrders = useOrderStore((s) => s.initializeOrders);
  const locationId = useStoreSettingsStore((s) => s.selectedStore?.id);
  
  useEffect(() => {
    if (locationId) {
      fetchOrders(locationId);
    }
  }, [locationId, fetchOrders]);
  
  // ...
}
```

### Pull to Refresh

```typescript
function OrdersList() {
  const [refreshing, setRefreshing] = useState(false);
  const orders = useOrderStore((s) => Object.values(s.ordersById));
  
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await useOrderStore.getState().reconcileOrders();
    setRefreshing(false);
  }, []);
  
  return (
    <FlatList
      data={orders}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
      // ...
    />
  );
}
```

---

## Real-time Subscriptions

### Setup Pattern

```typescript
// hooks/realtime/useOrdersRealtime.ts
export function useOrdersRealtime() {
  const locationId = useStoreSettingsStore((s) => s.selectedStore?.id);
  
  useEffect(() => {
    if (!locationId) return;
    
    const channel = supabase
      .channel(`orders-${locationId}`)
      .on('broadcast', { event: 'order_update' }, (payload) => {
        // Update local store with broadcast data
        useOrderStore.getState().upsertOrder(payload.order);
      })
      .on('broadcast', { event: 'order_delete' }, (payload) => {
        useOrderStore.getState().removeOrder(payload.orderId);
      })
      .subscribe((status) => {
        console.log('Realtime subscription:', status);
        useSyncStatusStore.getState().setRealtimeConnected(status === 'SUBSCRIBED');
      });
    
    return () => {
      supabase.removeChannel(channel);
    };
  }, [locationId]);
}
```

### Broadcast from Backend

```sql
-- broadcast_order_changes.sql
-- Called by triggers after order modifications
PERFORM pg_notify(
  'orders-' || location_id,
  json_build_object(
    'event', 'order_update',
    'order', order_data,
    'items', items_data,
    'payments', payments_data
  )::text
);
```

---

## Offline Queue System

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    OFFLINE QUEUE SYSTEM                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   User Action                                                   │
│       │                                                          │
│       ▼                                                          │
│   ┌──────────────────┐                                          │
│   │  Optimistic      │ ── Update local state immediately        │
│   │  Update          │                                          │
│   └──────────────────┘                                          │
│       │                                                          │
│       ▼                                                          │
│   ┌──────────────────┐     ┌──────────────────┐                 │
│   │  Is Online?      │────►│  Execute Now     │                 │
│   └──────────────────┘ Yes └──────────────────┘                 │
│       │ No                         │                             │
│       ▼                            ▼                             │
│   ┌──────────────────┐     ┌──────────────────┐                 │
│   │  Queue Operation │     │  Backend RPC     │                 │
│   │  (MMKV)          │     │  Call            │                 │
│   └──────────────────┘     └──────────────────┘                 │
│       │                            │                             │
│       │                            ▼                             │
│       │                    ┌──────────────────┐                 │
│       │                    │  Broadcast to    │                 │
│       │                    │  Other Stations  │                 │
│       │                    └──────────────────┘                 │
│       ▼                                                          │
│   ┌──────────────────┐                                          │
│   │  Network Returns │ ── NetInfo listener                      │
│   └──────────────────┘                                          │
│       │                                                          │
│       ▼                                                          │
│   ┌──────────────────┐                                          │
│   │  Process Queue   │ ── FIFO, with retry logic                │
│   └──────────────────┘                                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Usage

```typescript
// services/offlineSyncService.ts
import { queueOperation, getIsOnline } from '@/services/offlineSyncService';

// Check online status
if (getIsOnline()) {
  // Direct backend call
  await supabase.rpc('add_order_item_v2', params);
} else {
  // Queue for later
  await queueOperation({
    type: 'add_item',
    params: {
      orderId: 'order_123',
      item: itemData,
    },
  });
}
```

### Queue Structure

```typescript
interface QueuedOperation {
  id: string;
  type: OperationType;
  params: any;
  retryCount: number;
  createdAt: string;
  lastAttempt?: string;
  error?: string;
}

type OperationType = 
  | 'create_order'
  | 'add_item'
  | 'update_item'
  | 'remove_item'
  | 'update_order'
  | 'process_payment'
  // ...
```

---

## Supabase Integration

### Client Setup

```typescript
// lib/supabase.ts
import { createClient } from '@supabase/supabase-js';
import { Database } from '@/types/database.types';

export const supabase = createClient<Database>(
  process.env.EXPO_PUBLIC_SUPABASE_URL!,
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY!,
  {
    auth: {
      storage: mmkvStorage,
      autoRefreshToken: true,
      persistSession: true,
    },
  }
);
```

### RPC Calls (Preferred for Mutations)

```typescript
// Most mutations use RPCs for atomic operations
const { data, error } = await supabase.rpc('create_order_v2', {
  p_merchant_id: merchantId,
  p_location_id: locationId,
  p_order_type: 'dine_in',
  p_table_number: tableNumber,
  // ...
});

if (error) {
  console.error('RPC error:', error);
  throw error;
}

return data;
```

### Direct Queries (for Reads)

```typescript
// Simple reads can use direct queries
const { data, error } = await supabase
  .from('menu_items')
  .select(`
    *,
    category:categories(*),
    modifiers:menu_item_modifiers(
      *,
      modifier:modifiers(*)
    )
  `)
  .eq('location_id', locationId)
  .eq('is_active', true);
```

---

## Cross-Store Communication

### Option 1: Direct getState() (Preferred)

```typescript
// In useOrderStore
const updateOrderWithTableInfo = (orderId: string) => {
  // Get data from another store
  const floorPlan = useFloorPlanStore.getState();
  const table = floorPlan.tables.find(t => t.id === tableId);
  
  // Update this store
  set((state) => ({
    ordersById: {
      ...state.ordersById,
      [orderId]: {
        ...state.ordersById[orderId],
        tableName: table?.name,
      },
    },
  }));
};
```

### Option 2: Subscribe to Changes

```typescript
// Subscribe to another store's changes
useStoreSettingsStore.subscribe(
  (state) => state.selectedStation,
  (selectedStation) => {
    // React to station changes
    useOrderStore.getState().setCurrentStation(selectedStation);
  }
);
```

### Avoid Circular Dependencies

```typescript
// ❌ BAD - importing store creates circular dependency
import { useOrderStore } from './useOrderStore';  // In usePaymentStore.ts

// ✅ GOOD - use getState() at runtime
const processPayment = () => {
  const order = useOrderStore.getState().ordersById[orderId];
  // ...
};
```

---

## Best Practices Summary

### 1. Always Use Selectors

```typescript
// ❌ const store = useOrderStore();
// ✅ const orders = useOrderStore((s) => s.ordersById);
```

### 2. Batch State Updates

```typescript
// ✅ Single set() call with multiple updates
set((state) => ({
  items: newItems,
  total: newTotal,
  isLoading: false,
}));
```

### 3. Keep Persisted State Minimal

```typescript
// Only persist what's needed for offline/restart
partialize: (state) => ({
  essentialData: state.essentialData,
  // NOT: isLoading, error, UI state
}),
```

### 4. Clean Up Subscriptions

```typescript
useEffect(() => {
  const unsubscribe = useOrderStore.subscribe(/*...*/);
  return unsubscribe;  // Always clean up!
}, []);
```

### 5. Handle Loading/Error States

```typescript
const { isLoading, error, data } = useDataStore();

if (isLoading) return <Loading />;
if (error) return <Error message={error} />;
return <DataView data={data} />;
```

---

## Related Documentation

- [ORDERS_LIFECYCLE.md](../../features/orders/ORDERS_LIFECYCLE.md) - Order flow details
- [PAYMENT_PROCESSING.md](../../features/payments-terminals/PAYMENT_PROCESSING.md) - Payment system
- [offline-mode.md](../../features/offline-sync/offline-mode.md) - Offline capabilities
