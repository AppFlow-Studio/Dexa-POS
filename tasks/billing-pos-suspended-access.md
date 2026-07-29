# Billing POS Suspended Access

## Summary
POS-side follow-up for DEXA HQ self-service billing. The web/HQ work owns plan editing, add-ons, device pricing, station quota calculation, and the suspend/restore actions. POS must consume that backend state and fail clearly when access is blocked.

## Scope
- Block station selection and PIN login when `get_merchant_subscription_status` reports suspended/past-due access.
- Map billing and station-quota backend errors to clear POS messages.
- Revalidate active station sessions with `check_device_session_status` plus a fresh billing/station fetch.
- Refresh the persisted selected station/payment-terminal metadata after suspend/restore.
- Keep changes display/access-control only in this POS repo.

## Non-Scope
- No package or lockfile changes.
- No billing plan/add-on calculator changes.
- No DEXA HQ web UI changes.
- No direct Supabase migration in this repo unless the backend RPC contract is missing in the target environment.

## Plan
1. Add a shared POS access classifier for subscription suspension, station quota, and inactive station states.
2. Gate station list fetches through `get_merchant_subscription_status`.
3. Precheck PIN login/takeover online, block offline cached sign-in after a known suspension, and map backend login failures.
4. Extend session polling so already-logged-in tablets are logged out with billing-specific copy when suspended.
5. Add targeted tests for the classifier and document manual QA.

## Progress
- Added shared access-control helpers in `lib/posAccessControl.ts`.
- Added billing-gated station fetch and station/payment-terminal refresh helpers in `services/posAccessService.ts`.
- Station selection now shows a Billing Suspended screen instead of an empty station list.
- PIN login/takeover now prechecks billing online and maps `pos_staff_login_v2` billing/quota errors.
- Offline cached sign-in remains blocked when the last known billing state was suspended.
- Active-session polling now refreshes billing/station state and shows a billing-specific logout modal.
- Kicked-out modal now accepts custom POS access titles/messages.

## Verification
- Added targeted unit coverage in `__tests__/posAccessControl.test.ts`.
- Added auth-flow coverage in `__tests__/authFlow.test.ts` for backend billing failures.
- Targeted command: `npx jest --runTestsByPath __tests__/posAccessControl.test.ts __tests__/authFlow.test.ts`.

## Files
- `app/(auth)/pin-login.tsx`
- `app/(auth)/station-select.tsx`
- `components/auth/KickedOutModal.tsx`
- `contexts/SessionKickListenerProvider.tsx`
- `hooks/usePinSignIn.ts`
- `hooks/useSessionKickListener.ts`
- `hooks/useStationLoginSync.ts`
- `lib/authFlow.ts`
- `lib/posAccessControl.ts`
- `services/posAccessService.ts`
- `stores/useStoreSettingsStore.ts`
- `types/station.ts`
- `__tests__/posAccessControl.test.ts`

## Open QA
- Suspend a test merchant/location from HQ and confirm station select shows Billing Suspended.
- Restore billing and tap Refresh Access; station list should return.
- While logged into POS, suspend billing; within polling/foreground validation the tablet should show Billing Suspended and log out.
- Restore billing, sign in again, and confirm the selected station/payment terminal metadata is current.
- Trigger or simulate a station-quota backend error and confirm POS shows Station Limit Reached.
- Record proof video with suspended access blocked and restored access working.
