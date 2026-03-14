# Smart Wait Time Estimation Implementation

## Overview

This implementation provides intelligent wait time estimation based on real operational data rather than staff guesswork. The system tracks accuracy and highlights problematic estimates with actionable alerting.

## Features Implemented

### 1. Enhanced Wait Time Calculator

**File:** `lib/waitlist/waitTimeCalculator.ts`

**Improvements:**

- Distinguishes between tables in different states:
  - Available tables (empty)
  - About-to-free tables (check_presented or paid status)
  - Occupied tables (still dining)
- Incorporates historical accuracy factors from table metrics
- Applies party size multipliers (0.85x for 1-2 guests → 1.3x for 7+)
- Returns confidence level (high/medium/low) along with estimates
- Calculates estimated_ready_at timestamp

**Key Method:**

```typescript
calculateWaitTimeEnhanced(
  partySize: number,
  queueDepth: number,
  locationId?: string
): { waitTime: number; estimatedReadyAt: Date; confidence: 'high'|'medium'|'low' }
```

### 2. Estimated Ready Time Display

**Files:**

- `components/host-station/AddToWaitlistForm.tsx`
- `components/host-station/HostStationScreenEnhanced.tsx`

**Changes:**

- Form now shows and stores `estimated_ready_at`
- Automatically calculated when party size is entered
- Shows as ISO timestamp in data passed to backend
- WaitlistQueueCard displays estimated ready time in expanded details

### 3. Wait Accuracy Tracking

**Files:**

- `stores/useWaitlistStore.ts` (seatFromWaitlistAsync)
- `services/floorPlanService.ts` (recordWaitAccuracy)

**Implementation:**

- When a party is seated via `seatFromWaitlistAsync`, calculates actual wait time
- Calls new `recordWaitAccuracy()` service method
- Updates waitlist table with `actual_wait_minutes` and `seated_at`
- No changes needed to existing seating flow - tracking happens transparently

**Data Tracked:**

```typescript
{
  actual_wait_minutes: Math.floor((Date.now() - createdAt) / 60000),
  seated_at: new Date().toISOString()
}
```

### 4. Red Alert for Excessive Overwaits

**File:** `components/host-station/WaitlistQueueCard.tsx`

**Triggers when:**

- Actual wait exceeds quoted by >10 minutes (`overtimeMinutes > 10`)

**Visual Feedback:**

- Red border and background on queue card
- Bold "CRITICAL" warning in expanded section
- Shows X+ minutes over quoted time
- Displays context: "Customer is significantly late. Consider gesture of goodwill."

**Staff Actions:**

- "Apologize & Offer Comp" button in expanded view
- Opens modal with suggested gestures:
  - Free appetizer
  - $15 comp credit to bill
  - Dessert on us
- Logs event for analytics (ready for future auto-discount feature)

**Callback Chain:**

1. WaitlistQueueCard.onOfferComp
2. AnimatedCardItem.onOfferComp
3. HostStationScreenEnhanced.handleOfferComp
4. Toast notification + console log for tracking

### 5. Wait Time Accuracy Dashboard

**File:** `components/analytics/WaitTimeAccuracyCard.tsx`

**Metrics Calculated:**

- **Average Delta:** Mean difference (actual - quoted), in minutes
  - Negative = faster than estimated (good)
  - Positive = slower than estimated (problematic)
- **Accuracy Rate:** % of parties within ±5 mins of quoted time
- **Optimistic Count:** Parties seated faster than estimated
- **Pessimistic Count:** Parties waited longer than estimated

**Visual Dashboard Card Shows:**

- Large average delta with trend indicator (↑ red = slower, ↑ green = faster)
- Breakdown of accuracy categories with percentages
- Interpretation of the data:
  - Δ > +10: "Consider adjusting turn time estimates"
  - Δ < -5: "Great efficiency! Runs faster than expected"
  - Δ ≈ 0: "Well-calibrated estimates"

**Query Filters:**

- Date range support (from filters)
- Location-specific metrics
- Only includes entries with both quoted and actual times

**Integration:** Added to analytics dashboard after inventory analysis section

## Database Schema

### Existing Fields (No Migration Needed)

```sql
-- waitlist table
quoted_wait_minutes      INTEGER
estimated_ready_at       TIMESTAMP
actual_wait_minutes      INTEGER
created_at              TIMESTAMP
seated_at               TIMESTAMP (updated by recordWaitAccuracy)

-- table_metrics table
avg_turn_time           NUMERIC
avg_time_to_order       NUMERIC
avg_time_to_food        NUMERIC
avg_time_to_check       NUMERIC
total_sessions          INTEGER
total_covers            INTEGER
```

### Type Definitions Updated

**File:** `types/db-floor-plan-types.ts`

```typescript
// AddToWaitlistParams now includes:
p_estimated_ready_at?: string

// WaitlistEntry already has:
estimated_ready_at?: string
actual_wait_minutes?: number
```

## Implementation Flow

### Add to Waitlist

1. Staff enters party info in AddToWaitlistForm
2. Form calculates `estimatedReadyAt` using enhanced calculator
3. Data sent to backend with `p_estimated_ready_at`
4. Entry created with both `quoted_wait_minutes` and `estimated_ready_at`

### Queue Display

1. WaitlistQueueCard shows estimated time for each party
2. Automatically checks if wait exceeds quoted by >10 mins
3. Red alert appears with comp offer button if threshold exceeded

### Seating from Waitlist

1. Staff clicks "SEAT" on queue card
2. seatFromWaitlistAsync is triggered:
   - Calculates `actual_wait_minutes` from creation time
   - Calls `recordWaitAccuracy()` to save to DB
   - Removes from queue
3. Analytics dashboard automatically includes new data

### Analytics Review

1. Staff views Wait Time Accuracy card in Analytics dashboard
2. Sees:
   - Overall accuracy trend
   - Breakdown of accurate/optimistic/pessimistic estimates
   - Recommendations for improvement

## Service Methods

### WaitTimeCalculator.calculateWaitTimeEnhanced()

```typescript
// Input
partySize: number           // Number of guests
queueDepth: number         // Parties ahead in queue
locationId?: string        // For future metrics lookup

// Output
{
  waitTime: number                                  // Minutes to wait
  estimatedReadyAt: Date                           // Calculated ready time
  confidence: 'high' | 'medium' | 'low'           // Estimate confidence
}
```

### FloorPlanService.recordWaitAccuracy()

```typescript
// Updates waitlist entry with actual wait time
static async recordWaitAccuracy(
  client: SupabaseClient,
  waitlistId: string,
  actualWaitMinutes: number
): Promise<{ data: { success: boolean } } | null, error: any }
```

## UI Components

### WaitlistQueueCard Enhancements

- New prop: `onOfferComp?: () => void`
- Calculates `overtimeMinutes` and `isSignificantlyOverdue`
- Renders "Apologize & Offer Comp" button when threshold exceeded

### HostStationScreenEnhanced Enhancements

- New handler: `handleOfferComp(entry)`
- Passes callback to AnimatedCardItem
- Logs event: `{ partyName, partySize, quotedWaitMinutes, actualWaitMinutes, timestamp }`

### Analytics Dashboard

- Imports and renders WaitTimeAccuracyCard
- Passes location ID and date range filters
- Displays metrics between inventory analysis and pre-built reports

## Testing Checklist

- [ ] Add party to waitlist - verify estimated_ready_at is calculated and stored
- [ ] Check party details - confirm estimated_ready_at time is displayed
- [ ] Seat party within quoted time - verify no red alert appears
- [ ] Seat party 10+ mins over quoted - verify red alert and comp button appear
- [ ] Click "Apologize & Offer Comp" - verify modal/toast shows
- [ ] Navigate to Analytics - verify Wait Time Accuracy card loads
- [ ] Check metrics for multiple parties - verify accuracy percentages calculate correctly
- [ ] Test with date range filters - verify metrics update based on filters

## Future Enhancements

1. **Auto-Discount:** Automatically apply % discount when party exceeds threshold
2. **SMS Alert:** Notify staff via push notification when party approaching wait time
3. **ML Model:** Train model on historical data to improve estimates
4. **Peak Hour Adjustment:** Factor in restaurant busyness and day of week
5. **Menu Complexity:** Weight estimates based on typical order complexity
6. **Staff Efficiency:** Track per-server/station efficiency in estimates
7. **Seasonal Trends:** Adjust estimates based on seasonal patterns (holidays, weather)
8. **Integration:** Link to loyalty program for automatic compensation tracking

## Performance Notes

- Enhanced calculator maintains O(n) complexity (still linear in table count)
- Accuracy factor capped at 0.8-1.2 multiplier to prevent extreme adjustments
- Dashboard query limited to 1000 records per date range
- No indexing changes required (uses existing created_at timestamps)

## Configuration

No configuration needed - system uses defaults:

- DEFAULT_TURN_TIME: 60 minutes
- DEFAULT_BASE_WAIT: 15 minutes
- Party size multiplier: 0.85 (small) to 1.3 (large)
- Accuracy threshold: ±5 minutes
- Significant overdue threshold: >10 minutes
