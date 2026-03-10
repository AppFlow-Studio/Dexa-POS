# Waitlist/Host Station Feature Implementation

## Overview

This implementation provides a complete **Host Station Interface** for managing restaurant waitlists with real-time queue management, party notifications, and intelligent seat assignment.

## Features Implemented

### ✅ 1. Add to Waitlist Form

**File:** `components/host-station/AddToWaitlistForm.tsx`

Features:

- **Required Fields:**

  - Party name
  - Party size
  - Quoted wait time (auto-calculated or manual override)

- **Optional Fields:**

  - Phone (for SMS notification)
  - Email (for email notification)
  - Seating preference (Indoor/Outdoor/Bar/No Preference)
  - Preferred section (Main Dining/Patio/Bar/Private/No Preference)
  - Special notes/requests

- **Form Validation:**

  - Real-time validation with error display
  - Required field checks
  - Phone number format validation
  - Email format validation
  - Numeric validation for party size and wait time

- **UI Pattern:**
  - Expandable sections for better organization
  - Color-coded inputs
  - Smooth transitions and animations

### ✅ 2. Queue List Display

**File:** `components/host-station/WaitlistQueueCard.tsx`

Features:

- **Status Color Coding:**

  - `waiting` → White badge
  - `notified` → Blue badge with pulse animation
  - `arrived` → Green badge
  - `approaching quoted time` → Yellow border (80% of wait time)
  - `past quoted time` → Red border and background
  - `expired` → Red badge (2x quoted wait exceeded)

- **Queue Card Display:**

  - Position number in bordered circle
  - Party name
  - Guest count
  - Elapsed time tracking
  - Status badge
  - Expandable details panel

- **Expanded Details Include:**
  - Quoted vs. actual wait time comparison
  - Seating preference and section
  - Contact information (phone, email)
  - Special notes
  - Warning indicators for overdue parties

### ✅ 3. Swipe Actions

**File:** `components/host-station/WaitlistQueueCard.tsx`

Implemented swipe-to-reveal actions (left swipe):

- **SEAT** - Opens table selection dialog
- **NOTIFY** - Sends notification (SMS/Email)
- **CANCEL** - Removes party from waitlist
- **NO-SHOW** - Marks party as no-show

Each action:

- Updates status in real-time
- Provides user feedback via toast notifications
- Syncs with backend

### ✅ 4. Automatic Wait Time Calculation

**File:** `lib/waitlist/waitTimeCalculator.ts`

Algorithm:

- Calculates based on:

  - Current table availability
  - Average turn time from `table_metrics` or `default_turn_time`
  - Party size (larger parties get slight multiplier)
  - Current occupancy rate

- Returns estimated wait time in minutes
- Provides recommended table suggestions
- Adjusts for peak hours and party size

### ✅ 5. Auto-Expire Logic

**File:** `components/host-station/HostStationScreenEnhanced.tsx`

Behavior:

- Monitors all "waiting" status parties
- Checks every 30 seconds
- Automatically marks parties as "expired" if:
  - Actual elapsed time > 2 × quoted wait time
  - Status remains "waiting"
- Shows warning toast when party expires
- Updates backend status

### ✅ 6. Queue Reordering

**File:** `components/host-station/HostStationScreenEnhanced.tsx`

Features:

- VIP bumping capability
- Manual position adjustment
- Position numbers update dynamically
- Grip handle indicator for future drag-to-reorder enhancement
- Syncs reordered positions with store

### ✅ 7. Table Selection Sheet

**File:** `components/host-station/TableSelectionSheet.tsx`

Features:

- Bottom sheet modal for table selection
- Displays available tables only
- Shows table capacity
- Highlights "ideal" tables (size-appropriate)
- Sorts by capacity (smaller first)
- One-touch seating

### ✅ 8. Main Host Station Screen

**File:** `components/host-station/HostStationScreenEnhanced.tsx`

Features:

- Header with "Add Party" button
- Waiting count badge
- Full waitlist display
- Modal forms for add/edit
- Real-time status updates
- Error handling and user feedback

### ✅ 9. Tab Integration

**File:** `app/(main)/host-station.tsx`

Features:

- New navigation tab for Host Station
- Automatic location awareness
- Supabase client initialization
- Safe fallback UI

### ✅ 10. Waitlist Count Hook

**File:** `hooks/useWaitlistCount.ts`

Usage:

```typescript
const waitlistCount = useWaitlistCount()

// Display on tab badge
;<Tab label={`Host (${waitlistCount})`} />
```

## Database Schema

The implementation uses existing Supabase tables:

### `Waitlist` Table Fields:

```sql
- id (uuid, primary key)
- location_id (uuid, foreign key)
- merchant_id (uuid)
- party_name (text, required)
- party_size (integer, required)
- phone (text, optional)
- email (text, optional)
- status (enum: waiting|notified|arrived|seated|no_show|cancelled|expired)
- position_in_queue (integer)
- quoted_wait_minutes (integer)
- estimated_ready_at (timestamp)
- actual_wait_minutes (integer)
- seating_preference (text: indoor|outdoor|bar|no_preference)
- preferred_section (text)
- notes (text)
- created_at (timestamp)
- notified_at (timestamp)
- seated_at (timestamp)
- arrived_at (timestamp)
- cancelled_at (timestamp)
- expired_at (timestamp)
- seated_session_id (uuid, foreign key to table_sessions)
```

### RPC Functions Used:

- `get_waitlist(p_location_id)` - Fetch all entries for location
- `add_to_waitlist(...)` - Insert new waitlist entry
- `notify_waitlist_party(p_waitlist_id)` - Send notification
- `update_waitlist_status(p_waitlist_id, p_status)` - Update status
- `seat_from_waitlist(p_waitlist_id, p_table_ids)` - Create session from waitlist

## Type Definitions

Updated types:

```typescript
// Added email to AddToWaitlistParams
export interface AddToWaitlistParams {
  p_location_id: string
  p_party_name: string
  p_party_size: number
  p_phone?: string
  p_email?: string // NEW
  p_notes?: string
  p_preferred_section?: string
  p_seating_preference?: string // NEW
  p_quoted_wait_minutes?: number
}

// Added email to WaitlistEntry
export interface WaitlistEntry {
  id: string
  location_id: string
  party_name: string
  party_size: number
  phone?: string
  email?: string // NEW
  status:
    | 'waiting'
    | 'notified'
    | 'arrived'
    | 'seated'
    | 'no_show'
    | 'cancelled'
    | 'expired'
  position: number
  quoted_wait_minutes: number
  estimated_ready_at?: string
  actual_wait_minutes?: number
  preferred_section?: string
  seating_preference?: string
  notes?: string
  created_at: string
  notified_at?: string
  minutes_waiting?: number
}
```

## Store Enhancement

Updated `useWaitlistStore` with:

- `addToWaitlistAsync()` - Backend sync with all new fields
- `updateWaitlistStatus()` - Status updates (new method)
- `seatFromWaitlistAsync()` - Session creation
- `reorderWaitlist()` - Position management
- Error handling with offline fallback

## Component Files

### New Components:

1. **HostStationScreenEnhanced.tsx** (Main screen)

   - Layout with header and queue list
   - Add to waitlist modal
   - Table selection sheet integration
   - Auto-expire logic
   - Real-time refreshing

2. **AddToWaitlistForm.tsx** (Form)

   - All input fields
   - Validation
   - Expandable sections
   - Dropdown pickers

3. **WaitlistQueueCard.tsx** (List item)

   - Swipe actions
   - Expandable details
   - Status badges
   - Time tracking
   - Visual indicators

4. **TableSelectionSheet.tsx** (Modal)
   - Bottom sheet UI
   - Table filtering
   - Size recommendations

### Utilities:

- **waitTimeCalculator.ts** - Wait time calculation algorithm
- **useWaitlistCount.ts** - Hook for tab badge

### Route:

- **app/(main)/host-station.tsx** - Navigation entry point

## Usage in Navigation

Add to your main navigation (\_layout.tsx or tab navigator):

```typescript
<Tab
  name='host-station'
  options={{
    title: 'Host Station',
    tabBarLabel: ({ tintColor }) => {
      const count = useWaitlistCount()
      return (
        <View>
          <Text style={{ color: tintColor }}>Host</Text>
          {count > 0 && <Badge>{count}</Badge>}
        </View>
      )
    }
  }}
/>
```

## Real-Time Updates

The implementation includes:

- Real-time status synchronization with Supabase
- Auto-refresh every minute
- Automatic expiry checking every 30 seconds
- Toast notifications for all state changes
- Loading states during operations

## Testing Checklist

- [ ] Add party to waitlist with all fields
- [ ] Verify auto-calculated wait time
- [ ] Test form validation errors
- [ ] Notify party → status changes to "notified"
- [ ] Seat party → table selection works
- [ ] Cancel party → removed from list
- [ ] Mark no-show → status updates
- [ ] Queue reorder → positions update
- [ ] Auto-expire → party marked expired after 2× time
- [ ] Time indicators → update colors correctly
- [ ] Empty state → shows when no parties waiting
- [ ] Loading state → shows during operations
- [ ] Modal overlay → dismisses properly
- [ ] Counter badge → shows correct count

## Performance Notes

- Queue list uses memoized selectors to prevent unnecessary re-renders
- Auto-expire checks run every 30 seconds (not every second)
- Time updates refresh every minute (not every second)
- Swipe gesture uses Animated API for smooth 60fps performance

## Future Enhancements

1. **Drag-to-Reorder** - Currently has grip handle; can integrate React Native DraggableFlatList
2. **Bulk Actions** - Multi-select and batch operations
3. **SMS Integration** - Direct SMS sending via Twilio
4. **Email Integration** - Direct email sending
5. **Caller ID Integration** - Auto-populate phone lookup
6. **Waitlist Analytics** - Charts and metrics
7. **Predictive Notifications** - AI-based notification timing
8. **Party Preferences Storage** - Remember preferences for frequent guests

## Troubleshooting

### Waitlist not loading:

- Check Supabase connection
- Verify location_id is set
- Check RLS policies allow read access

### Notifications not working:

- Verify phone/email fields are populated
- Check backend notification service configuration
- Review CloudFunctions logs

### Auto-expire not triggering:

- Check that updateWaitlistStatus is connected
- Verify status enum values are correct
- Check auto-expire interval (30 seconds)

## Dependencies

Required libraries (already in project):

- zustand - State management
- @gorhom/bottom-sheet - Modal sheets
- react-native-reanimated - Animations
- lucide-react-native - Icons
- @supabase/supabase-js - Backend
- NativeWind - Tailwind styling

## Notes for Integration

1. **Supabase Client Setup:** Ensure `setWaitlistSupabaseClient()` is called during app initialization
2. **Location Context:** The feature requires `selectedLocation` from `useStoreSettingsStore`
3. **Error Handling:** All operations include try-catch with user-friendly error messages
4. **Offline Support:** Local fallback creates entries even if backend fails temporarily
