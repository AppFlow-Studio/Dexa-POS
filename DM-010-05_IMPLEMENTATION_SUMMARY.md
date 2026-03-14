# DM-010-05: Waitlist Guest Notifications — Implementation Summary

## Overview
Implemented full SMS notification pipeline for waitlisted guests using Twilio. Guests receive SMS when their table is ready, with tracking for notification attempts, failures, and auto-expiry after grace period.

## Files Created

### 1. SQL Migration
**File:** `utils/supabase/migrations/waitlist_notification_failures.sql`
- Added `notification_failures INT` column to track SMS send failures
- Created `record_waitlist_sms_result(p_waitlist_id, p_success)` RPC to record SMS attempt results
- Created `resend_waitlist_notification(p_waitlist_id)` RPC for re-notifying (attempts 2-3)

### 2. Supabase Edge Function
**File:** `supabase/functions/notify-waitlist-guest/index.ts`
- Deno TypeScript function that sends SMS via Twilio REST API
- Normalizes phone to E.164 format (handles 10/11 digit US numbers)
- Calls `record_waitlist_sms_result` RPC to log success/failure in DB
- Returns `{success, sms, reason}` response

**Required Secrets:**
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM_NUMBER`

## Files Modified

### 3. TypeScript Types
**File:** `types/db-floor-plan-types.ts`
- Added `notification_count?: number` — tracks attempts (max 3)
- Added `last_notification_type?: string` — 'sms' or 'in_app'
- Added `notification_failures?: number` — SMS send failures

### 4. Waitlist Store
**File:** `stores/useWaitlistStore.ts`
- Added `notifyWaitlistPartyAsync(entryId, isRenotify?)` action
  - Handles both initial notify and re-notifies
  - Calls appropriate RPC (notify_waitlist_party or resend_waitlist_notification)
  - Calls edge function to send SMS
  - Returns composed result: `{success, sms, error, reason}`
- Updated `isSame` merge check to include `notification_count` and `notification_failures`

### 5. Floor Plan Service
**File:** `services/floorPlanService.ts`
- `notifyWaitlistParty()` — calls `notify_waitlist_party` RPC (first notify)
- `resendWaitlistNotification()` — calls `resend_waitlist_notification` RPC (re-notify)
- `sendWaitlistSms()` — invokes `notify-waitlist-guest` edge function

### 6. Host Station Screen
**File:** `components/host-station/HostStationScreenEnhanced.tsx`
- Reworked `handleNotifyParty()`:
  - Checks `notification_count >= 3` → shows "Max Attempts" toast
  - Detects no-phone → shows warning toast, still proceeds with in-app notification
  - Calls `notifyWaitlistPartyAsync` with `isRenotify = notification_count > 0`
  - Shows distinct toasts for: SMS sent, SMS failed, in-app only, max attempts
  - Removed `updateWaitlistStatus` call (now done by RPC)
- Added grace-period expiry logic:
  - Checks `notified_at` timestamp
  - Auto-expires to `no_show` if 10+ minutes elapsed since notification
  - Runs every 30 seconds alongside existing expiry checks

### 7. Waitlist Queue Card UI
**File:** `components/host-station/WaitlistQueueCard.tsx`
- **Header indicators:**
  - Added `<PhoneOff />` icon next to status badge when `!entry.phone`
- **Expanded view indicators:**
  - SMS failure alert: red strip showing `"SMS failed {n}x — notify by voice"` with AlertCircle icon
  - Notification count badge: `{count}/3` in blue chip next to Notify button
- **Notify button updates:**
  - Label changes to `'Re-notify'` when `notification_count > 0`
  - Disabled (opacity 40%) when `notification_count >= 3`
  - Shows count badge next to label
  - Imported `PhoneOff` icon from lucide-react-native

## Workflow

### Initial Notification
1. Staff taps **Notify** on a waiting party
2. `handleNotifyParty` → guard check (max 3) → calls `notifyWaitlistPartyAsync(entryId, false)`
3. Store calls `notify_waitlist_party` RPC
   - RPC marks `status='notified'`, `notified_at=NOW()`, increments `notification_count`
   - Returns `{phone, party_name, store_name, message_template}`
4. Store calls edge function `notify-waitlist-guest` with phone + message
5. Edge function sends SMS via Twilio, calls `record_waitlist_sms_result` RPC
6. Toast shown: "SMS sent to {name}" or "SMS failed — notify verbally"

### Re-Notify (Attempts 2-3)
1. Staff taps **Re-notify** on a notified party
2. `handleNotifyParty` → guard check → calls `notifyWaitlistPartyAsync(entryId, true)`
3. Store calls `resend_waitlist_notification` RPC (same logic, but allows `status IN ('waiting', 'notified', 'arrived')`)
4. Rest of flow identical to initial notify

### No-Phone Path
1. Staff taps **Notify** on party with no phone
2. Toast shown: "No Phone Number — please call out name"
3. Store still calls RPC which records in-app notification, doesn't call edge function
4. UI shows "in-app" notification recorded

### Grace Period Expiry
1. Party notified → `notified_at` timestamp recorded
2. Every 30s, `checkExpiry` runs
3. If `elapsed > 10 minutes` since `notified_at` → calls `updateWaitlistStatus(entryId, 'no_show')`
4. Toast shown: "No Show — {name} did not check in"

### SMS Failure Tracking
1. Edge function fails to send → `record_waitlist_sms_result(success=false)` increments `notification_failures`
2. UI shows red alert: `"SMS failed {n}x — notify by voice"`
3. Notify button still enabled (unless already at max 3 attempts)
4. Staff can re-notify verbally or retry SMS

## Testing Checklist

- [ ] Deploy migration to Supabase
  ```bash
  supabase db push utils/supabase/migrations/waitlist_notification_failures.sql
  ```
- [ ] Deploy edge function
  ```bash
  supabase functions deploy notify-waitlist-guest
  ```
- [ ] Set Twilio secrets
  ```bash
  supabase secrets set TWILIO_ACCOUNT_SID=...
  supabase secrets set TWILIO_AUTH_TOKEN=...
  supabase secrets set TWILIO_FROM_NUMBER=...
  ```
- [ ] Add party with phone → Notify → SMS received, `notification_count=1` in DB
- [ ] Add party without phone → Notify → "No Phone" toast, `notification_count=1`, no SMS
- [ ] Notify party 2 more times → verify count reaches 3
- [ ] On 4th notify attempt → "Max Attempts" toast, button disabled
- [ ] Use invalid phone → SMS fails → `notification_failures=1`, red strip appears in UI
- [ ] Notified entry after 10 min → auto-expires to `no_show`
- [ ] Verify RPC guards: `notify_waitlist_party` only works on `status='waiting'`; `resend_waitlist_notification` works on `'waiting'|'notified'|'arrived'`

## Configuration

Grace period (auto-expire after notification) is hardcoded to **10 minutes**. To make it configurable:
- Add `waitlist_grace_period_minutes: number` to `useStoreSettingsStore`
- Read in `HostStationScreenEnhanced` via store selector
- Pass to expiry check calculation

SMS template is hardcoded in edge function:
```
"Hi {party_name}! Your table at {store_name} is ready. Please check in with the host within 10 minutes."
```

To make customizable:
- Store template in `locations` table or settings table
- Edge function fetches at runtime

## Architecture Notes

**Two-step flow** (RPC + Edge Function):
- RPC updates DB atomically: marks notified, increments count
- Edge function sends SMS, records result in separate RPC call
- Ensures DB consistency even if Twilio fails (entry is marked `notified` by intent)
- SMS failures tracked separately via `notification_failures`

**Why two RPCs for record?**
- `notify_waitlist_party`: first notify only (guards `status='waiting'`)
- `resend_waitlist_notification`: re-notifies (allows `status IN ('waiting', 'notified', 'arrived')`)
- Client-side guard ensures max 3 total; DB guards prevent re-opening

**Phone normalization:**
- Edge function handles E.164 conversion client-side (Twilio requires it)
- Strips non-digits, prepends `+1` for 10-digit US numbers
- Supports 11-digit and international formats

## Known Limitations

1. **No custom SMS template** — template is hardcoded in edge function
2. **Grace period not configurable** — hardcoded to 10 minutes
3. **No retry logic for Twilio** — single attempt; staff must re-notify manually if failed
4. **Phone format assumption** — assumes US numbers; international support basic

## Related Components

- `WaitlistEntry` type: tracks all notification state
- `useWaitlistStore`: orchestrates notify flow
- `FloorPlanService`: service layer for DB + edge function calls
- `HostStationScreenEnhanced`: UI orchestration + grace-period logic
- `WaitlistQueueCard`: displays notification indicators
- `AnimatedCardItem`: wraps queue card, passes through `onNotify` callback
