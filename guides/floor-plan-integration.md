# 🍽️ DEXA POS - Floor Plan & Table Management System
## Complete Architecture & Implementation Guide

---

## 📐 Architecture Overview

### Why This Design?

The floor plan system separates **design-time** concerns from **runtime** concerns:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        DESIGN TIME (Manager Setup)                          │
│                                                                             │
│  • Floor plan layouts (rarely change)                                       │
│  • Table positions, shapes, names                                           │
│  • Decorative elements                                                      │
│  • Stored in: floor_plans + floor_plan_objects                             │
│  • Undo/redo supported                                                      │
│  • Sync: On save only                                                       │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│                        RUNTIME (During Service)                             │
│                                                                             │
│  • Table status (available → seated → ordered → paid)                      │
│  • Guest sessions (who's sitting, how long, which order)                   │
│  • Timing events (seated, food served, check presented)                    │
│  • Stored in: table_sessions + table_session_events                        │
│  • Real-time sync across all devices                                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why separate?**
1. Floor plan changes shouldn't affect active sessions
2. Runtime updates are frequent and need to be lightweight
3. Historical data persists even if layout changes later
4. Different permission levels for design vs service

---

## 🗃️ Database Tables

### Core Tables

| Table | Purpose | Changes |
|-------|---------|---------|
| `floor_plans` | Layout definitions | Rarely (design mode) |
| `floor_plan_objects` | Tables, decor, walls | Rarely (design mode) |
| `table_sessions` | Active guest visits | Frequently (service) |
| `table_session_tables` | Session ↔ Table links | When seating/merging |
| `table_session_events` | Timeline for timing | Every action |
| `waitlist` | Walk-in queue | Every walk-in |
| `reservations` | Future bookings | Daily |

### Entity Relationships

```
┌──────────────┐         ┌──────────────────┐         ┌──────────────┐
│  FLOOR_PLAN  │ 1:N     │ FLOOR_PLAN_OBJECT│  N:1    │   SESSION    │
│              │────────►│    (Tables)      │◄────────│              │
│ - name       │         │ - position       │         │ - party_size │
│ - canvas     │         │ - shape_id       │         │ - guest_name │
└──────────────┘         │ - capacity       │         │ - status     │
                         └──────────────────┘         │ - order_id   │
                                  │                   └──────────────┘
                                  │                          │
                                  │ N:M (via junction)       │ 1:N
                                  │                          │
                         ┌────────┴────────┐         ┌───────┴──────┐
                         │ TABLE_SESSION_  │         │   SESSION    │
                         │     TABLES      │         │   EVENTS     │
                         │ - is_primary    │         │ - event_type │
                         └─────────────────┘         │ - timestamp  │
                                                     └──────────────┘
```

### Why Table Sessions?

Instead of putting `status` and `order_id` directly on the table object, we use a **session** concept:

```typescript
// ❌ Bad: Status on table object
floor_plan_object.status = 'occupied';
floor_plan_object.order_id = 'uuid';
floor_plan_object.guest_name = 'Smith';

// ✅ Good: Separate session entity
table_session = {
  id: 'uuid',
  party_size: 4,
  guest_name: 'Smith',
  order_id: 'uuid',
  status: 'seated',
  seated_at: timestamp,
  // Links to table(s) via junction table
};
```

**Benefits:**
1. **Guests sit before ordering** - Session exists before order
2. **Merged tables** - One session spans multiple physical tables
3. **Table transfers** - Session moves, order stays attached
4. **Timing metrics** - Events track guest journey, not order
5. **Split checks** - One session, multiple orders
6. **History** - Past sessions preserved, table object unchanged

---

## 🔄 Table Status Flow

```
                    ┌─────────────┐
                    │  RESERVED   │ ◄── Reservation exists for this table
                    └──────┬──────┘
                           │ Guest arrives
                           ▼
┌─────────────┐     ┌─────────────┐
│  AVAILABLE  │────►│   SEATED    │ ◄── Session created, no order yet
└─────────────┘     └──────┬──────┘
       ▲                   │ First order placed
       │                   ▼
       │            ┌─────────────┐
       │            │   ORDERED   │ ◄── Waiting for food
       │            └──────┬──────┘
       │                   │ Food delivered
       │                   ▼
       │            ┌─────────────┐
       │            │   SERVED    │ ◄── Eating
       │            └──────┬──────┘
       │                   │ Request check
       │                   ▼
       │            ┌─────────────┐
       │            │   CHECK     │ ◄── Bill presented
       │            │  PRESENTED  │
       │            └──────┬──────┘
       │                   │ Payment complete
       │                   ▼
       │            ┌─────────────┐
       │            │    PAID     │ ◄── Session closing
       │            └──────┬──────┘
       │                   │ Guests leave
       │                   ▼
       │            ┌─────────────┐
       │            │  CLEANING   │ ◄── Busser resets table
       │            └──────┬──────┘
       │                   │ Table ready
       └───────────────────┘
```

---

## 📱 Real-Time Sync Architecture

### Why Real-Time Matters

In a busy restaurant:
- Host seats table 12 → Server tablets must see immediately
- Server marks "food served" → Host knows table is in dessert phase
- Busser clears table → Host can seat next party

### Implementation

```typescript
// Supabase Realtime subscription (in store)
const channel = supabase
  .channel(`floor-plan-${locationId}`)
  .on('postgres_changes', {
    event: '*',
    schema: 'public',
    table: 'table_sessions',
    filter: `location_id=eq.${locationId}`
  }, (payload) => {
    // Reload floor plan status
    loadFloorPlanStatus();
  })
  .subscribe();
```

### What Gets Synced

| Change | Sync Speed | Method |
|--------|------------|--------|
| Table session created | Instant | Realtime |
| Session status change | Instant | Realtime |
| Waitlist update | Instant | Realtime |
| Reservation update | Instant | Realtime |
| Floor plan design change | On demand | Manual reload |

---

## 🪑 Seating Flow

### 1. Walk-In Guest

```typescript
// Step 1: Check for available tables
const availableTables = selectAvailableTables(store.getState());
const suitableTables = availableTables.filter(t => t.capacity >= partySize);

// Step 2: Seat at table (creates session + order)
const { sessionId, orderId } = await seatGuests({
  tableIds: ['table-uuid'],
  partySize: 4,
  guestName: 'Smith Party',
  createOrder: true
});

// Step 3: Navigate to order screen
navigation.navigate('Order', { orderId });
```

### 2. From Waitlist

```typescript
// Step 1: Add to waitlist
const { waitlistId, position, quotedWait } = await addToWaitlist({
  partyName: 'Johnson',
  partySize: 6,
  phone: '+15551234567',
  preferredSection: 'patio'
});
// Returns: position=3, quotedWait=25 minutes

// Step 2: When table ready, notify
const { phone, message } = await notifyWaitlistParty(waitlistId);
// Trigger SMS: "Hi Johnson! Your table is ready..."

// Step 3: Guest arrives, seat them
const { sessionId, orderId } = await seatFromWaitlist(waitlistId, ['table-uuid']);
```

### 3. From Reservation

```typescript
// Step 1: Create reservation
const { reservationId, confirmationNumber } = await createReservation({
  partyName: 'Williams',
  partySize: 4,
  phone: '+15559876543',
  date: '2024-12-20',
  time: '19:00'
});
// Returns: confirmationNumber='RES-A1B2C3'

// Step 2: Optionally assign tables in advance
await assignReservationTables(reservationId, ['table-5', 'table-6']);

// Step 3: Guest arrives, seat them
const { sessionId, orderId } = await seatReservation(reservationId);
```

---

## 🔗 Table Merging

When a large party needs multiple tables:

```typescript
// Seat at multiple tables (merged)
const { sessionId } = await seatGuests({
  tableIds: ['table-5', 'table-6', 'table-7'],  // 3 tables
  partySize: 10,
  guestName: 'Birthday Party'
});

// Result: ONE session, THREE tables
// - table-5: is_primary=true
// - table-6: is_primary=false
// - table-7: is_primary=false

// Later: Add another table
await mergeTable(sessionId, 'table-8');

// Later: Remove a table
await unmergeTable(sessionId, 'table-8');
```

### Database Structure

```sql
table_session_tables:
| session_id | table_id | is_primary | seated_position |
|------------|----------|------------|-----------------|
| sess-123   | table-5  | true       | 0               |
| sess-123   | table-6  | false      | 1               |
| sess-123   | table-7  | false      | 2               |
```

---

## 🍝 Coursing (Fine Dining)

Track meal progression for pacing:

```typescript
// Session starts with course = 0
const session = { current_course: 0, total_courses: 3 };

// Fire appetizers (advances to course 1)
await advanceCourse(sessionId);
// Triggers: 'appetizers_fired' event

// Fire mains (advances to course 2)
await advanceCourse(sessionId);
// Triggers: 'mains_fired' event

// Fire desserts (advances to course 3)
await advanceCourse(sessionId);
// Triggers: 'desserts_fired' event
// Returns: is_final_course = true
```

### Course Events Timeline

```
Session Start
    │
    ├── seated (course 0)
    │
    ├── order_placed
    │
    ├── appetizers_fired (course 1)
    ├── appetizers_served
    │
    ├── mains_fired (course 2)
    ├── mains_served
    │
    ├── desserts_fired (course 3)
    ├── desserts_served
    │
    ├── check_presented
    ├── payment_complete
    │
    └── table_cleared
```

---

## 🔄 Table Transfer

Move a party to a different table mid-service:

```typescript
// Guest wants to move from bar to dining room
await transferSession(sessionId, ['dining-table-12']);

// What happens:
// 1. Old table links removed
// 2. New table links created
// 3. Order.table_number updated
// 4. Event logged for tracking
// 5. All devices see change via realtime
```

---

## ⏱️ Timing & Metrics

Every action creates an event for analysis:

```typescript
// Events are auto-created by triggers
table_session_events = [
  { event_type: 'seated', occurred_at: '18:00', minutes_since_previous: null },
  { event_type: 'order_placed', occurred_at: '18:08', minutes_since_previous: 8 },
  { event_type: 'appetizers_served', occurred_at: '18:20', minutes_since_previous: 12 },
  { event_type: 'mains_served', occurred_at: '18:45', minutes_since_previous: 25 },
  { event_type: 'check_presented', occurred_at: '19:10', minutes_since_previous: 25 },
  { event_type: 'payment_complete', occurred_at: '19:15', minutes_since_previous: 5 },
  { event_type: 'table_cleared', occurred_at: '19:18', minutes_since_previous: 3 }
];
// Total turn time: 78 minutes
```

### Derived Metrics

| Metric | Calculation | Use Case |
|--------|-------------|----------|
| Turn Time | cleared_at - seated_at | Table efficiency |
| Time to Order | order_placed - seated | Service speed |
| Time to Food | food_served - order_placed | Kitchen speed |
| Wait Time | seated_at - waitlist.created_at | Waitlist accuracy |
| RevPASH | Revenue / (Seats × Hours) | Revenue optimization |

---

## 📴 Offline Considerations

### What Works Offline

| Feature | Offline Support | Notes |
|---------|-----------------|-------|
| View floor plan | ✅ Yes | Cached locally |
| View table status | ✅ Yes | Last known state |
| Seat guests | ⚠️ Queued | Syncs when online |
| Add to waitlist | ⚠️ Queued | Syncs when online |
| Update session status | ⚠️ Queued | Syncs when online |
| Create reservation | ⚠️ Queued | Syncs when online |
| Design mode edits | ❌ No | Requires sync |

### Conflict Resolution

When coming back online:
1. Fetch latest state from server
2. Apply queued operations
3. If conflict (e.g., table occupied), alert user
4. User manually resolves

---

## 🎨 Zustand Store Structure

```typescript
interface FloorPlanState {
  // Data
  locationId: string | null;
  floorPlans: FloorPlan[];
  activeFloorPlanId: string | null;
  tables: TableWithSession[];      // Tables + active sessions
  waitlist: WaitlistEntry[];
  reservations: Reservation[];
  
  // UI State
  selectedTableIds: string[];
  isDesignMode: boolean;
  isLoading: boolean;
  error: string | null;
  
  // Real-time
  isOnline: boolean;
  realtimeChannel: RealtimeChannel | null;
  
  // Actions...
}
```

### Why Zustand + Supabase?

| Concern | Zustand | Supabase |
|---------|---------|----------|
| UI state | ✅ Primary | - |
| Selection | ✅ Primary | - |
| Persistence | - | ✅ Primary |
| Real-time sync | Receives updates | ✅ Source |
| Offline cache | ✅ Via persist | - |
| Optimistic updates | ✅ Immediate | Confirms |

---

## 🔒 Permissions

| Action | Required Permission |
|--------|---------------------|
| View floor plan | `location.tables.view` (implicit) |
| Edit floor plan | `location.floor_plan.manage` |
| Seat guests | `location.tables.manage` |
| Update session | `location.tables.manage` |
| Manage waitlist | `location.waitlist.manage` |
| Manage reservations | `location.reservations.manage` |

---

## 📁 Files Summary

| File | Purpose |
|------|---------|
| `floor_plan_schema.sql` | Database tables, triggers, indexes |
| `floor_plan_rls.sql` | Row Level Security policies |
| `floor_plan_functions.sql` | RPC functions for floor plan/sessions |
| `floor_plan_waitlist_reservation_functions.sql` | RPC functions for waitlist/reservations |
| `useFloorPlanStore.ts` | Zustand store with realtime sync |

---

## 🚀 Installation

```sql
-- Run in Supabase SQL Editor in order:
1. floor_plan_schema.sql
2. floor_plan_rls.sql
3. floor_plan_functions.sql
4. floor_plan_waitlist_reservation_functions.sql
```

```typescript
// In React Native app
import { useFloorPlanStore } from './useFloorPlanStore';

// Initialize on app start
const { initialize } = useFloorPlanStore();
await initialize(locationId);
```

---

## ✅ Next Steps

1. **Implement SMS notifications** - Integrate Twilio for waitlist alerts
2. **Add reservation reminders** - Scheduled edge function
3. **Build timing dashboard** - Table turn analytics
4. **Add server sections** - Assign servers to table groups
5. **Implement auto-suggest** - AI table assignment based on party size