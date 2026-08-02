# 🍽️ DEXA POS - Coursing + Order Store Integration
## Complete Architecture & Scenario Analysis

---

## Architecture Decision: Single Store vs Dual Store

### The Question
We have two possible approaches:
1. **Dual Store**: `useOrderStore` + separate `useCoursingStore`
2. **Single Store**: Coursing embedded directly in `useOrderStore`

### Recommendation: **Hybrid Approach**

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           RECOMMENDED ARCHITECTURE                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   useOrderStore (Primary - Optimized)                                       │
│   ├── ordersById: Record<string, Order>                                     │
│   │   └── Order                                                             │
│   │       ├── items: CartItem[]                                             │
│   │       │   └── CartItem.course_number  ← Item's course assignment       │
│   │       ├── courses: Record<number, CourseInfo>  ← Course status/state   │
│   │       └── working_course: number  ← Current course being edited        │
│   │                                                                         │
│   └── Actions                                                               │
│       ├── addItemToActiveOrder (assigns to working_course)                 │
│       ├── fireCourse (locks course)                                        │
│       ├── createNextCourse                                                  │
│       └── setWorkingCourse                                                  │
│                                                                             │
│   useCoursingStore (Secondary - UI State)                                   │
│   ├── Used for complex coursing UI (tabs, drag-drop)                       │
│   ├── Syncs with useOrderStore.courses                                     │
│   └── Provides derived selectors                                            │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Why Hybrid?

| Feature | Single Store | Dual Store | Hybrid ✓ |
|---------|-------------|------------|----------|
| Atomic updates | ✅ | ❌ Race risk | ✅ |
| Separation of concerns | ❌ | ✅ | ✅ |
| Persistence | ✅ Simple | ⚠️ Complex | ✅ |
| UI flexibility | ⚠️ Limited | ✅ | ✅ |

**The Hybrid Approach:**
- `useOrderStore` is the **source of truth** for course data
- `useCoursingStore` is a **derived/UI layer** that reads from `useOrderStore`
- Actions that modify course state go through `useOrderStore`
- Complex coursing UI can use `useCoursingStore` for convenience

---

## Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              DATA FLOW                                       │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  User Action: "Add Burger to Order"                                         │
│       │                                                                     │
│       ▼                                                                     │
│  ┌─────────────────────────────────────┐                                   │
│  │ useOrderStore.addItemToActiveOrder() │                                   │
│  └─────────────────────────────────────┘                                   │
│       │                                                                     │
│       ├── 1. Get working_course from order                                 │
│       │      working_course = ordersById[activeOrderId].working_course     │
│       │                                                                     │
│       ├── 2. Check if course is open                                       │
│       │      if (courses[working_course].status !== 'open') REJECT         │
│       │                                                                     │
│       ├── 3. Create item with course_number                                │
│       │      newItem = { ...itemData, course_number: working_course }      │
│       │                                                                     │
│       ├── 4. Calculate totals (instant)                                    │
│       │      totals = calculateOrderTotals([...items, newItem], ...)       │
│       │                                                                     │
│       ├── 5. Single atomic update                                          │
│       │      set({ ordersById: { [id]: { items, courses, ...totals } } })  │
│       │                                                                     │
│       └── 6. Background sync to server                                     │
│              _syncItemToBackend().catch(console.error)                     │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Order Object Structure (With Embedded Coursing)

```typescript
interface Order {
  id: string;
  
  // Items (each has course_number)
  items: CartItem[];
  
  // Coursing (embedded for O(1) access)
  courses: Record<number, CourseInfo>;
  working_course: number;
  
  // ... other fields
}

interface CartItem {
  id: string;
  item_name: string;
  quantity: number;
  price: number;
  
  // Course assignment
  course_number: number;  // 1, 2, 3, etc.
  
  // Kitchen status
  kitchen_status: 'new' | 'sent' | 'ready' | 'served';
  
  // ... other fields
}

interface CourseInfo {
  course_number: number;
  status: 'open' | 'fired' | 'in_progress' | 'served' | 'completed';
  fired_at?: number;
  served_at?: number;
}
```

---

## Scenario Walkthroughs

### Scenario 1: Basic Dine-In Order with Courses

```
Timeline:
────────────────────────────────────────────────────────────────────────────────

18:00 - Server starts new table order
        ┌─────────────────────────────────────────────────────────────────────┐
        │ Order State:                                                        │
        │   items: []                                                         │
        │   courses: { 1: { status: 'open' } }                               │
        │   working_course: 1                                                 │
        └─────────────────────────────────────────────────────────────────────┘

18:02 - Add appetizers (Soup, Salad, Bread)
        ┌─────────────────────────────────────────────────────────────────────┐
        │ Order State:                                                        │
        │   items: [                                                          │
        │     { id: 'A', name: 'Soup', course_number: 1, kitchen_status: 'new' },
        │     { id: 'B', name: 'Salad', course_number: 1, kitchen_status: 'new' },
        │     { id: 'C', name: 'Bread', course_number: 1, kitchen_status: 'new' },
        │   ]                                                                 │
        │   courses: { 1: { status: 'open', items: 3 } }                     │
        │   working_course: 1                                                 │
        │   subtotal: $24.00                                                  │
        │   total: $26.13                                                     │
        └─────────────────────────────────────────────────────────────────────┘

18:05 - Fire Course 1 (appetizers to kitchen)
        ┌─────────────────────────────────────────────────────────────────────┐
        │ useOrderStore.fireCourse(orderId, 1)                               │
        │                                                                     │
        │ 1. Check course 1 is open ✓                                        │
        │ 2. Lock course 1:                                                  │
        │    courses: { 1: { status: 'fired', fired_at: 1702...} }           │
        │ 3. Update items kitchen_status:                                    │
        │    items[*].kitchen_status = 'sent' (where course_number = 1)      │
        │ 4. Auto-create course 2:                                           │
        │    courses: { 1: {...}, 2: { status: 'open' } }                    │
        │ 5. Advance working_course:                                          │
        │    working_course: 2                                                │
        │ 6. Set order_status: 'preparing'                                   │
        │ 7. Sync to backend                                                 │
        └─────────────────────────────────────────────────────────────────────┘

18:06 - Server adds main courses to Course 2
        ┌─────────────────────────────────────────────────────────────────────┐
        │ Order State:                                                        │
        │   items: [                                                          │
        │     { id: 'A', name: 'Soup', course_number: 1, kitchen_status: 'sent' },
        │     { id: 'B', name: 'Salad', course_number: 1, kitchen_status: 'sent' },
        │     { id: 'C', name: 'Bread', course_number: 1, kitchen_status: 'sent' },
        │     { id: 'D', name: 'Steak', course_number: 2, kitchen_status: 'new' },
        │     { id: 'E', name: 'Lobster', course_number: 2, kitchen_status: 'new' },
        │   ]                                                                 │
        │   courses: {                                                        │
        │     1: { status: 'fired', fired_at: ... },  🔒 LOCKED              │
        │     2: { status: 'open' }  ← Active                                 │
        │   }                                                                 │
        │   working_course: 2                                                 │
        │   subtotal: $119.00                                                 │
        └─────────────────────────────────────────────────────────────────────┘

18:15 - Appetizers ready, server marks served
        ┌─────────────────────────────────────────────────────────────────────┐
        │ useOrderStore.markCourseServed(orderId, 1)                         │
        │                                                                     │
        │   courses: {                                                        │
        │     1: { status: 'served', served_at: ... },                       │
        │     2: { status: 'open' }                                          │
        │   }                                                                 │
        │   items: [                                                          │
        │     { name: 'Soup', course_number: 1, kitchen_status: 'served' },  │
        │     { name: 'Salad', course_number: 1, kitchen_status: 'served' }, │
        │     { name: 'Bread', course_number: 1, kitchen_status: 'served' }, │
        │     { name: 'Steak', course_number: 2, kitchen_status: 'new' },    │
        │     { name: 'Lobster', course_number: 2, kitchen_status: 'new' },  │
        │   ]                                                                 │
        └─────────────────────────────────────────────────────────────────────┘

18:20 - Fire Course 2 (mains to kitchen)
        ┌─────────────────────────────────────────────────────────────────────┐
        │   courses: {                                                        │
        │     1: { status: 'served' },                                       │
        │     2: { status: 'fired', fired_at: ... },  🔒 LOCKED              │
        │     3: { status: 'open' }  ← Auto-created                          │
        │   }                                                                 │
        │   working_course: 3                                                 │
        └─────────────────────────────────────────────────────────────────────┘

18:25 - Add desserts to Course 3
        ...and so on
```

---

### Scenario 2: Try to Add Item to Fired Course (BLOCKED)

```typescript
// Current state:
order = {
  courses: {
    1: { status: 'fired' },  // 🔒
    2: { status: 'open' }
  },
  working_course: 2
}

// User tries to add item to course 1 (already fired)
useOrderStore.getState().addItemWithCourse(orderId, {
  item_name: 'Extra Bread',
  course_number: 1,  // <-- Trying to add to fired course
});

// RESULT: BLOCKED ❌
// The addItem function checks:
const courseInfo = order.courses[courseNumber];
if (courseInfo && courseInfo.status !== 'open') {
  console.warn(`Cannot add item to fired course ${courseNumber}`);
  return '';  // No item added
}

// User sees: Nothing happens (or toast error message)
```

---

### Scenario 3: Remove Item from Open Course (ALLOWED)

```typescript
// Current state:
order = {
  items: [
    { id: 'A', name: 'Soup', course_number: 1 },
    { id: 'B', name: 'Salad', course_number: 1 },
  ],
  courses: { 1: { status: 'open' } }
}

// User removes Salad
useOrderStore.getState().removeItemFromActiveOrder('B');

// FLOW:
// 1. Get item's course_number (1)
// 2. Check if course 1 is open → YES ✓
// 3. Remove item locally (instant)
// 4. Recalculate totals (instant)
// 5. Call remove_order_item RPC in background

// RESULT: ✅ Item removed instantly
order = {
  items: [
    { id: 'A', name: 'Soup', course_number: 1 },
  ],
  courses: { 1: { status: 'open' } }
}
```

---

### Scenario 4: Remove Item from Fired Course (VOID instead)

```typescript
// Current state:
order = {
  items: [
    { id: 'A', name: 'Soup', course_number: 1, db_order_item_id: 'uuid-A' },
    { id: 'B', name: 'Salad', course_number: 1, db_order_item_id: 'uuid-B' },
  ],
  courses: { 1: { status: 'fired' } }  // 🔒
}

// User tries to remove Salad from fired course
useOrderStore.getState().removeItemFromActiveOrder('B');

// FLOW:
// 1. Get item's course_number (1)
// 2. Check if course 1 is open → NO, it's fired
// 3. Remove item locally anyway (for instant UI)
// 4. Recalculate totals
// 5. In background: Try remove_order_item RPC
//    → Fails with "Cannot remove items from fired course"
//    → Fallback to void_order_item RPC ✓

// Backend call:
if (item.server_id) {
  supabase.rpc('remove_order_item', { p_order_item_id: item.server_id })
    .catch(err => {
      if (err.message?.includes('Cannot remove')) {
        // Fallback to void
        supabase.rpc('void_order_item', {
          p_order_item_id: item.server_id,
          p_void_reason: 'Removed by cashier'
        });
      }
    });
}

// RESULT: ✅ Item removed from UI, VOIDED on server (audit trail kept)
```

---

### Scenario 5: Update Quantity in Fired Course (BLOCKED)

```typescript
// Current state:
order = {
  items: [
    { id: 'A', name: 'Steak', quantity: 1, course_number: 1 },
  ],
  courses: { 1: { status: 'fired' } }  // 🔒
}

// User tries to change Steak quantity to 2
useOrderStore.getState().updateItemQuantity(orderId, 'A', 2);

// FLOW:
// 1. Get item's course_number (1)
// 2. Check if course 1 is open → NO
// 3. BLOCK the update

updateItemQuantity: (orderId, itemId, quantity) => {
  const order = get().ordersById[orderId];
  const item = order.items.find(i => i.id === itemId);
  
  // Check course is open
  const courseInfo = order.courses[item.course_number];
  if (courseInfo && courseInfo.status !== 'open') {
    console.warn(`Cannot modify item in fired course ${item.course_number}`);
    toastService.show({
      title: 'Cannot Modify',
      message: 'This item is in a fired course and cannot be changed.',
      type: 'warning'
    });
    return;  // Block update
  }
  
  // ... proceed with update
}

// RESULT: ❌ Blocked with user feedback
```

---

### Scenario 6: Move Item Between Courses

```typescript
// Current state:
order = {
  items: [
    { id: 'A', name: 'Soup', course_number: 1 },
    { id: 'B', name: 'Steak', course_number: 1 },  // Want to move this
  ],
  courses: {
    1: { status: 'open' },
    2: { status: 'open' }
  }
}

// Move Steak from course 1 to course 2
useOrderStore.getState().setItemCourse(orderId, 'B', 2);

// FLOW:
// 1. Check source course (1) is open → YES ✓
// 2. Check target course (2) is open → YES ✓
// 3. Update item's course_number locally (instant)
// 4. Sync to backend

setItemCourse: (orderId, itemId, courseNumber) => {
  const order = get().ordersById[orderId];
  
  // Check target course
  const targetCourse = order.courses[courseNumber];
  if (targetCourse && targetCourse.status !== 'open') {
    console.warn(`Cannot move item to fired course ${courseNumber}`);
    return;
  }
  
  // Check source course
  const item = order.items.find(i => i.id === itemId);
  const sourceCourse = order.courses[item.course_number];
  if (sourceCourse && sourceCourse.status !== 'open') {
    console.warn(`Cannot move item from fired course ${item.course_number}`);
    return;
  }
  
  // Update
  set(state => ({
    ordersById: {
      ...state.ordersById,
      [orderId]: {
        ...state.ordersById[orderId],
        items: state.ordersById[orderId].items.map(i =>
          i.id === itemId ? { ...i, course_number: courseNumber } : i
        ),
      }
    }
  }));
  
  // Sync
  supabase.rpc('set_item_course', { ... });
}

// RESULT: ✅ Item moved
order = {
  items: [
    { id: 'A', name: 'Soup', course_number: 1 },
    { id: 'B', name: 'Steak', course_number: 2 },  // ← Moved!
  ]
}
```

---

### Scenario 7: Fire Empty Course (BLOCKED)

```typescript
// Current state:
order = {
  items: [
    { id: 'A', name: 'Soup', course_number: 1 },
  ],
  courses: {
    1: { status: 'open' },
    2: { status: 'open' }  // Empty
  },
  working_course: 2
}

// Try to fire course 2 (no items)
useOrderStore.getState().fireCourse(orderId, 2);

// FLOW:
// 1. Check items in course 2
const itemsInCourse = order.items.filter(i => i.course_number === 2);
// itemsInCourse.length = 0

// 2. Block with error
if (itemsInCourse.length === 0) {
  throw new Error(`Course ${courseNumber} has no items to fire`);
}

// RESULT: ❌ Error thrown, course stays open
```

---

### Scenario 8: Partial Payment with Multiple Courses

```typescript
// Current state:
order = {
  items: [
    { id: 'A', name: 'Soup', price: 8, quantity: 1, course_number: 1, paid_quantity: 0 },
    { id: 'B', name: 'Salad', price: 12, quantity: 1, course_number: 1, paid_quantity: 0 },
    { id: 'C', name: 'Steak', price: 45, quantity: 1, course_number: 2, paid_quantity: 0 },
  ],
  courses: {
    1: { status: 'served' },
    2: { status: 'fired' }
  },
  total_amount: 70.73,  // (8+12+45) * 1.0875 tax
  amount_paid: 0
}

// Guest 1 pays for appetizers ($21.75 with tax)
useOrderStore.getState().addPaymentToOrder({
  orderId,
  amount: 21.75,
  method: 'Card'
});

// FLOW:
// 1. Add payment to payments[]
// 2. Mark items as paid (FIFO)
//    - $21.75 covers Soup ($8.70) and Salad ($13.05)
// 3. Recalculate totals

// RESULT:
order = {
  items: [
    { id: 'A', name: 'Soup', paid_quantity: 1 },     // ✅ Paid
    { id: 'B', name: 'Salad', paid_quantity: 1 },    // ✅ Paid
    { id: 'C', name: 'Steak', paid_quantity: 0 },    // Still unpaid
  ],
  payments: [{ amount: 21.75, method: 'Card' }],
  amount_paid: 21.75,
  amount_due: 48.98  // Remaining for steak + tax
}

// Note: Payment doesn't care about courses - it's FIFO by item order
// If you want to pay by course specifically, that's a UI concern
```

---

### Scenario 9: Switch Working Course

```typescript
// Current state:
order = {
  courses: {
    1: { status: 'fired' },  // 🔒
    2: { status: 'open' },
    3: { status: 'open' }
  },
  working_course: 2
}

// Switch to course 3 (allowed)
useOrderStore.getState().setWorkingCourse(orderId, 3);
// RESULT: ✅ working_course = 3

// Try to switch to course 1 (fired - blocked)
useOrderStore.getState().setWorkingCourse(orderId, 1);

// FLOW:
setWorkingCourse: (orderId, courseNumber) => {
  const order = get().ordersById[orderId];
  const courseInfo = order.courses[courseNumber];
  
  if (courseInfo && courseInfo.status !== 'open') {
    console.warn(`Cannot set working course to fired course ${courseNumber}`);
    return;  // ❌ Blocked
  }
  
  // Update
  set(...);
}

// RESULT: ❌ Blocked, working_course stays at 2
```

---

### Scenario 10: Complete Order with Multiple Courses

```typescript
// Current state:
order = {
  items: [
    { name: 'Soup', course_number: 1, kitchen_status: 'served' },
    { name: 'Steak', course_number: 2, kitchen_status: 'served' },
    { name: 'Cake', course_number: 3, kitchen_status: 'served' },
  ],
  courses: {
    1: { status: 'served' },
    2: { status: 'served' },
    3: { status: 'served' }
  },
  amount_due: 0,  // Fully paid
  paid_status: 'Paid'
}

// Close out the order
useOrderStore.getState().archiveOrder(orderId);

// FLOW:
// 1. Deduct inventory
// 2. Set order_status: 'completed'
// 3. Move to previousOrdersStore
// 4. Remove from active orders

// RESULT: Order archived with full coursing history intact
```

---

### Scenario 11: Void Entire Order Mid-Service

```typescript
// Current state:
order = {
  items: [
    { name: 'Soup', course_number: 1, db_order_item_id: 'uuid-A' },
    { name: 'Steak', course_number: 2, db_order_item_id: 'uuid-B' },
  ],
  courses: {
    1: { status: 'served' },
    2: { status: 'fired' }
  }
}

// Manager voids entire order
useOrderStore.getState().voidOrder(orderId);

// FLOW:
// 1. Set order_status: 'void'
// 2. Archive order
// 3. Sync to backend: void_order RPC
//    - All items voided
//    - All payments reversed
//    - Audit trail created

// Backend SQL:
void_order(p_order_id, 'Voided by manager')
  → UPDATE orders SET status = 'void'
  → UPDATE order_items SET is_voided = true
  → UPDATE order_payments SET is_voided = true
  → INSERT INTO order_status_history (...)
```

---

### Scenario 12: Offline Mode with Coursing

```typescript
// Device goes offline mid-service
// Course 1 is fired, Course 2 is open

// User adds items to Course 2
addItemToActiveOrder({
  name: 'Lobster',
  price: 55,
  course_number: 2
});

// FLOW (Local-First):
// 1. Item added to local state immediately ✓
// 2. Totals calculated locally ✓
// 3. UI updates instantly ✓
// 4. Background sync fails (offline)
// 5. Item marked as synced: false

// When back online:
// 6. Sync queue processes
// 7. add_order_item_with_course RPC called
// 8. Server catches up

// Key: Coursing state is preserved locally
// Even offline, you can:
// - Add items to open courses ✓
// - Fire courses locally ✓
// - Calculate totals ✓
// Just can't sync until reconnect
```

---

### Scenario 13: Concurrent Servers on Same Order

```typescript
// Server A and Server B both have Order 123 open

// Server A fires Course 1
useOrderStore.getState().fireCourse('order-123', 1);
// → Local update immediate
// → Backend sync starts

// SIMULTANEOUSLY Server B tries to add item to Course 1
useOrderStore.getState().addItemWithCourse('order-123', {
  name: 'Extra Bread',
  course_number: 1
});

// Server B's local state:
// - Course 1 still shows as 'open' (hasn't received update yet)
// - Item gets added locally

// CONFLICT RESOLUTION:
// 1. Server B's backend sync fails:
//    "Cannot add items to course 1 - it has been fired"
// 2. Server B receives realtime update from Supabase
// 3. Local state corrects:
//    - Course 1 marked as 'fired'
//    - Item moved to Course 2 or removed
// 4. Toast shown to Server B: "Course 1 was fired by another server"

// Realtime subscription:
supabase
  .channel('order-courses')
  .on('postgres_changes', { 
    event: 'UPDATE', 
    schema: 'public', 
    table: 'order_courses',
    filter: `order_id=eq.${orderId}`
  }, (payload) => {
    // Sync local state with server state
    useOrderStore.getState().syncCoursesFromServer(orderId, payload.new);
  })
  .subscribe();
```

---

## Implementation: Unified Coursing Actions

```typescript
// In useOrderStoreMerged.ts - Add these coursing actions:

// ============================================================================
// COURSING ACTIONS
// ============================================================================

setWorkingCourse: (orderId, courseNumber) => {
  const order = get().ordersById[orderId];
  if (!order) return;
  
  const courseInfo = order.courses[courseNumber];
  if (courseInfo && courseInfo.status !== 'open') {
    toastService.show({
      title: 'Cannot Select Course',
      message: `Course ${courseNumber} has already been fired.`,
      type: 'warning'
    });
    return;
  }
  
  // Ensure course exists
  const updatedCourses = {
    ...order.courses,
    [courseNumber]: order.courses[courseNumber] || {
      course_number: courseNumber,
      status: 'open' as const
    }
  };
  
  set(state => ({
    ordersById: {
      ...state.ordersById,
      [orderId]: {
        ...state.ordersById[orderId],
        working_course: courseNumber,
        courses: updatedCourses,
      }
    }
  }));
  
  // Sync to server
  if (order.server_id) {
    supabase.rpc('set_working_course', {
      p_order_id: order.server_id,
      p_course_number: courseNumber
    }).catch(console.error);
  }
},

createNextCourse: (orderId) => {
  const order = get().ordersById[orderId];
  if (!order) return 1;
  
  const maxCourse = Math.max(...Object.keys(order.courses).map(Number), 0);
  const nextCourse = maxCourse + 1;
  
  set(state => ({
    ordersById: {
      ...state.ordersById,
      [orderId]: {
        ...state.ordersById[orderId],
        working_course: nextCourse,
        courses: {
          ...state.ordersById[orderId].courses,
          [nextCourse]: {
            course_number: nextCourse,
            status: 'open' as const
          }
        }
      }
    }
  }));
  
  // Sync to server
  if (order.server_id) {
    supabase.rpc('create_next_course', {
      p_order_id: order.server_id
    }).catch(console.error);
  }
  
  return nextCourse;
},

fireCourse: async (orderId, courseNumber) => {
  const order = get().ordersById[orderId];
  if (!order) throw new Error('Order not found');
  
  // Validate course is open
  const courseInfo = order.courses[courseNumber];
  if (courseInfo && courseInfo.status !== 'open') {
    throw new Error(`Course ${courseNumber} is already fired`);
  }
  
  // Validate course has items
  const itemsInCourse = order.items.filter(i => i.course_number === courseNumber);
  if (itemsInCourse.length === 0) {
    throw new Error(`Course ${courseNumber} has no items to fire`);
  }
  
  const now = Date.now();
  
  // Optimistic update
  set(state => ({
    ordersById: {
      ...state.ordersById,
      [orderId]: {
        ...state.ordersById[orderId],
        courses: {
          ...state.ordersById[orderId].courses,
          [courseNumber]: {
            course_number: courseNumber,
            status: 'fired' as const,
            fired_at: now
          },
          // Auto-create next course
          [courseNumber + 1]: state.ordersById[orderId].courses[courseNumber + 1] || {
            course_number: courseNumber + 1,
            status: 'open' as const
          }
        },
        // Mark items as 'sent'
        items: state.ordersById[orderId].items.map(i =>
          i.course_number === courseNumber && i.kitchen_status === 'new'
            ? { ...i, kitchen_status: 'sent' as const }
            : i
        ),
        // Advance working course if needed
        working_course: state.ordersById[orderId].working_course === courseNumber
          ? courseNumber + 1
          : state.ordersById[orderId].working_course,
        order_status: 'preparing',
        opened_at: state.ordersById[orderId].opened_at || now,
      }
    }
  }));
  
  // Sync to server
  if (order.server_id) {
    try {
      await supabase.rpc('fire_course', {
        p_order_id: order.server_id,
        p_course_number: courseNumber
      });
    } catch (error) {
      // Revert on error
      set(state => ({
        ordersById: {
          ...state.ordersById,
          [orderId]: {
            ...state.ordersById[orderId],
            courses: {
              ...state.ordersById[orderId].courses,
              [courseNumber]: {
                course_number: courseNumber,
                status: 'open' as const,
                fired_at: undefined
              }
            },
            items: state.ordersById[orderId].items.map(i =>
              i.course_number === courseNumber
                ? { ...i, kitchen_status: 'new' as const }
                : i
            ),
          }
        }
      }));
      throw error;
    }
  }
  
  toastService.show({
    title: 'Course Fired',
    message: `Course ${courseNumber} sent to kitchen (${itemsInCourse.length} items)`,
    type: 'success'
  });
},

markCourseServed: (orderId, courseNumber) => {
  const order = get().ordersById[orderId];
  if (!order) return;
  
  set(state => ({
    ordersById: {
      ...state.ordersById,
      [orderId]: {
        ...state.ordersById[orderId],
        courses: {
          ...state.ordersById[orderId].courses,
          [courseNumber]: {
            ...state.ordersById[orderId].courses[courseNumber],
            status: 'served' as const,
            served_at: Date.now()
          }
        },
        items: state.ordersById[orderId].items.map(i =>
          i.course_number === courseNumber
            ? { ...i, kitchen_status: 'served' as const }
            : i
        ),
      }
    }
  }));
  
  // Sync to server
  if (order.server_id) {
    supabase.rpc('mark_course_served', {
      p_order_id: order.server_id,
      p_course_number: courseNumber
    }).catch(console.error);
  }
},

// Helper to check if item can be modified
canModifyItem: (orderId, itemId) => {
  const order = get().ordersById[orderId];
  if (!order) return false;
  
  const item = order.items.find(i => i.id === itemId);
  if (!item) return false;
  
  const courseInfo = order.courses[item.course_number];
  return !courseInfo || courseInfo.status === 'open';
},

// Get items by course
getItemsByCourse: (orderId, courseNumber) => {
  const order = get().ordersById[orderId];
  if (!order) return [];
  return order.items.filter(i => i.course_number === courseNumber);
},
```



## Summary: Coursing Rules

| Action | Course Open | Course Fired |
|--------|-------------|--------------|
| Add item | ✅ Allowed | ❌ Blocked |
| Update quantity | ✅ Allowed | ❌ Blocked |
| Remove item | ✅ Hard delete | ⚠️ Void (audit trail) |
| Update modifiers | ✅ Allowed | ❌ Blocked |
| Move to this course | ✅ Allowed | ❌ Blocked |
| Move from this course | ✅ Allowed | ❌ Blocked |
| Fire course | ✅ If has items | ❌ Already fired |
| Mark served | N/A | ✅ Allowed |
| Set as working | ✅ Allowed | ❌ Blocked |