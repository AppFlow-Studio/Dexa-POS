# Orders Lifecycle - Complete Guide

## Overview

The Dexa POS order system follows an offline-first architecture with optimistic updates, 
real-time synchronization, and conflict resolution. This document explains the complete 
flow of orders from creation to completion.

## Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────────────────────┐
│                           ORDER LIFECYCLE FLOW                                    │
├──────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌─────────────┐      ┌─────────────┐      ┌─────────────┐      ┌─────────────┐ │
│   │   DRAFT     │ ──►  │   PENDING   │ ──►  │  PREPARING  │ ──►  │    READY    │ │
│   │             │      │             │      │             │      │             │ │
│   │ • Created   │      │ • Submitted │      │ • In Kitchen│      │ • Completed │ │
│   │ • Items     │      │ • KDS View  │      │ • Cooking   │      │ • Pickup    │ │
│   │   adding    │      │             │      │             │      │             │ │
│   └─────────────┘      └─────────────┘      └─────────────┘      └─────────────┘ │
│         │                                                               │         │
│         │                                                               ▼         │
│         │                                                        ┌─────────────┐ │
│         │                                                        │  COMPLETED  │ │
│         ▼                                                        │             │ │
│   ┌─────────────┐                                                │ • Archived  │ │
│   │  CANCELLED  │                                                │ • History   │ │
│   │    /VOID    │                                                └─────────────┘ │
│   └─────────────┘                                                                 │
│                                                                                   │
└──────────────────────────────────────────────────────────────────────────────────┘
```

## Order States

| State | Description | UI Location | Next States |
|-------|-------------|-------------|-------------|
| `draft` | Order being built, items being added | Menu screen | `pending`, `cancelled` |
| `pending` | Submitted to kitchen | KDS | `preparing`, `cancelled` |
| `preparing` | Kitchen actively working | KDS | `ready`, `cancelled` |
| `ready` | Ready for pickup/delivery | KDS/Order line | `completed` |
| `completed` | Fulfilled and closed | Previous orders | - |
| `cancelled` | Cancelled before completion | Previous orders | - |
| `void` | Voided after payment | Previous orders | - |
| `refunded` | Fully refunded | Previous orders | - |

## Payment States

| State | Description |
|-------|-------------|
| `Unpaid` | No payment received |
| `Partial` | Some payment received, balance due |
| `Paid` | Fully paid |
| `Refunded` | Payment was refunded |

## Check States (Dine-In)

| State | Description |
|-------|-------------|
| `Opened` | Active check, can add items |
| `Closed` | Check closed, no more items |

---

## Key Files

### Store
- `stores/useOrderStore.ts` - Main order state management (~9600 lines)
- `stores/usePreviousOrdersStore.ts` - Completed orders history

### Services
- `services/orderService.ts` - Backend API calls
- `services/offlineSyncService.ts` - Offline queue management
- `services/offlineSyncInit.ts` - Sync initialization

### Hooks
- `hooks/realtime/useOrdersRealtime.ts` - Real-time subscriptions

### SQL/RPCs
- `utils/supabase/migrations/create_order_v2.sql` - Order creation
- `utils/supabase/migrations/add_order_item_v2.sql` - Add items
- `utils/supabase/migrations/process_payment_v7.sql` - Payment processing
- `utils/supabase/migrations/broadcast_order_changes.sql` - Real-time broadcasts

---

## Order Creation Flow

### 1. Local Order Creation (Optimistic)

```typescript
// useOrderStore.ts - createNewOrder()
const newOrder: OrderProfile = {
  id: `temp_${Date.now()}`,           // Temporary ID until backend sync
  db_order_id: null,                   // Will be set after backend creation
  order_status: "draft",
  paid_status: "Unpaid",
  check_status: "Opened",
  items: [],
  payments: [],
  sync_status: "pending",
  // ... other fields
};
```

### 2. Backend Sync (ensureOrderCreated)

```typescript
// Prevents duplicate creation with promise deduplication
const pendingOrderCreations: Map<string, Promise<string | null>> = new Map();

async function ensureOrderCreated(order: OrderProfile): Promise<string | null> {
  // Check if already created
  if (order.db_order_id) return order.db_order_id;
  
  // Check if creation already in progress
  const existingPromise = pendingOrderCreations.get(order.id);
  if (existingPromise) return existingPromise;
  
  // Create order via RPC
  const { data } = await supabase.rpc('create_order_v2', params);
  
  // Rekey order from temp_xxx to actual UUID
  rekeyOrder(order.id, data.order_id);
  
  return data.order_id;
}
```

### 3. Real-time Broadcast

When order changes, `broadcast_order_changes()` SQL function sends:
- Order data
- All items with modifiers
- All payments with coverage details
- Reversals/refunds

---

## Adding Items to Orders

### Flow

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  User taps item │ ──► │ Optimistic add  │ ──► │ Backend sync    │
│  from menu      │     │ to local store  │     │ via queue       │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                │                        │
                                ▼                        ▼
                        ┌─────────────────┐     ┌─────────────────┐
                        │ UI updates      │     │ Broadcast to    │
                        │ instantly       │     │ other stations  │
                        └─────────────────┘     └─────────────────┘
```

### Code Path

1. **UI**: `MenuSection.tsx` → `onItemPress`
2. **Store**: `useOrderStore.addItemToOrder()`
3. **Optimistic**: Item added to `order.items` immediately
4. **Queue**: Operation queued in `offlineSyncService`
5. **Backend**: `add_order_item_v2` RPC called
6. **Broadcast**: Other stations receive update

---

## Offline Support

### Queue System

```typescript
// offlineSyncService.ts
interface QueuedOperation {
  id: string;
  type: 'create_order' | 'add_item' | 'update_item' | 'remove_item' | ...;
  params: any;
  retryCount: number;
  createdAt: string;
}

// Operations are queued when offline
await queueOperation({
  type: 'add_item',
  params: { orderId, item, modifiers },
});

// Processed when online
const processQueue = async () => {
  while (queue.length > 0) {
    const op = queue.shift();
    await executeOperation(op);
  }
};
```

### Sync Status

Orders track their sync status:
- `synced` - Fully synchronized with backend
- `pending` - Changes waiting to sync
- `failed` - Sync failed, needs retry

---

## Real-time Synchronization

### Subscription Setup

```typescript
// useOrdersRealtime.ts
supabase.channel('orders-realtime')
  .on('broadcast', { event: 'order_update' }, handleOrderBroadcast)
  .subscribe();
```

### Broadcast Payload Structure

```typescript
interface OrderBroadcastPayload {
  order: {
    id: string;
    status: string;
    // ... order fields
  };
  items: Array<{
    id: string;
    menu_item_id: string;
    quantity: number;
    item_status: string;
    modifiers: Array<{...}>;
  }>;
  payments: Array<{
    id: string;
    amount: number;
    status: string;
    covers_items: Array<{...}>;
  }>;
}
```

---

## Order Calculations

### Key Function

```typescript
// lib/order-calculator.ts
function calculateOrderTotals(input: OrderCalculationInput): OrderTotals {
  // Returns:
  return {
    subtotal,           // Sum of item prices
    tax,                // Calculated tax
    total,              // subtotal + tax
    discount,           // Applied discounts
    serviceCharge,      // Optional service charge
    amountPaid,         // Sum of payments
    amountDue,          // total - amountPaid
    // Cash pricing variants...
  };
}
```

### Backend Calculation

```sql
-- calculate_order_totals_fast.sql
-- Called after any order modification to recalculate totals
PERFORM calculate_order_totals_fast(p_order_id);
```

---

## Common Operations

### Close Check (Dine-In)

```typescript
await useOrderStore.getState().closeCheck(orderId);
// Sets check_status = 'Closed', moves to completed
```

### Void Order

```typescript
await useOrderStore.getState().voidOrder(orderId, reason, staffId);
// Sets order_status = 'void', reverses payments if needed
```

### Refund

```typescript
// See PAYMENT_PROCESSING.md for detailed refund flow
await refundService.processRefund(refundRequest);
```

---

## Debugging Tips

### Check Order State

```typescript
const order = useOrderStore.getState().ordersById[orderId];
console.log({
  status: order.order_status,
  paid: order.paid_status,
  check: order.check_status,
  sync: order.sync_status,
  items: order.items.length,
  payments: order.payments.length,
});
```

### Force Sync

```typescript
await useOrderStore.getState().syncOrderFromBackendComplete(orderId);
```

### Check Queue

```typescript
import { getQueueStatus } from '@/services/offlineSyncService';
console.log(await getQueueStatus());
```

---

## Order Types

| Type | Description | Special Handling |
|------|-------------|------------------|
| `Dine In` | Table service | Linked to table session, check management |
| `Takeaway` | Counter pickup | No table, simpler flow |
| `Delivery` | Delivery order | Customer info, address tracking |

---

## Table Sessions (Dine-In)

When an order is linked to a table:

```typescript
// Link order to table session
await useOrderStore.getState().linkOrderToSession(orderId, sessionId);

// This:
// 1. Updates order with table_session_id
// 2. Updates table session with order reference
// 3. Marks table as occupied
```

### Session Lifecycle

```
Table Available → Order Created → Session Started → Order Paid → Session Closed → Table Available
```

---

## Related Documentation

- [PAYMENT_PROCESSING.md](./PAYMENT_PROCESSING.md) - Payment flow details
- [STATE_MANAGEMENT.md](./STATE_MANAGEMENT.md) - Store architecture
- [offline-mode.md](./offline-mode.md) - Offline capabilities
