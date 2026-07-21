/**
 * Wave 2.2 — Structural regression net for the client-side read-only gates.
 *
 * Wave 1 added `_checkCartEditable` inside store actions so cross-station
 * mutations are blocked at the store layer. That works, but means the user
 * sees a fully-enabled UI, taps an action, the store silently no-ops or
 * surfaces a post-attempt error toast. Wave 2.2 makes the gate VISIBLE in
 * every order-edit entry point so the UI stops the user before the action
 * even reaches the store.
 *
 * Why STRUCTURAL tests:
 * Each of these components transitively imports the order store, which
 * pulls in the Supabase client, hardware services, and ~50 other modules.
 * No existing test suite mounts these components for a reason. We use the
 * same pattern as `broadcastMergeStationId.test.ts` — read the source and
 * assert the gate is wired. Two-station UAT is the integration-level
 * proof; this file is the regression net so anyone removing a gate gets
 * caught before staging.
 *
 * Helpers asserted:
 *   - `isOrderReadOnly` (pure, from `lib/orderAccessControl.ts`) for places
 *     that already have an `order` + `currentStationId` in scope.
 *   - `useIsActiveOrderReadOnly` (hook, from `lib/orderAccessControlHooks.ts`)
 *     for places that just need a boolean against the active order.
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(__dirname, '..')

function read (relPath: string): string {
  return readFileSync(join(repoRoot, relPath), 'utf-8')
}

const orderBadgeSrc = read('components/order/OrderBadge.tsx')
const paymentSheetSrc = read('components/menu/PaymentDetailBottomSheet.tsx')
const moreOptionsSrc = read('components/bill/MoreOptionsBottomSheet.tsx')
const customerSheetSrc = read('components/bill/CustomerSheet.tsx')
const orderDetailsSrc = read('components/bill/OrderDetails.tsx')
const billItemSrc = read('components/bill/BillItem.tsx')

describe('Wave 2.2 — OrderBadge "Retrieve to Pay" gate', () => {
  it('imports `isOrderReadOnly` from the canonical helper', () => {
    expect(orderBadgeSrc).toMatch(
      /import\s*{\s*isOrderReadOnly\s*}\s*from\s*['"]@\/lib\/orderAccessControl['"]/
    )
  })

  it('reuses the `currentStationId` prop instead of re-deriving it (avoids accidental dual-source-of-truth bugs)', () => {
    // Two declarations of `currentStationId` would shadow each other and
    // diverge over time. The popover already receives the prop from the
    // parent's `useOrderStore(s => s.currentStationId)` selector.
    const occurrences = orderBadgeSrc.match(/const currentStationId =/g) ?? []
    expect(occurrences.length).toBe(1)
  })

  it('memoises `isReadOnlyForStation` so re-renders do not thrash the gate', () => {
    expect(orderBadgeSrc).toMatch(/isReadOnlyForStation = useMemo/)
  })

  it('disables the Retrieve-to-Pay TouchableOpacity when read-only and shows a toast on force-tap', () => {
    expect(orderBadgeSrc).toMatch(/disabled={isReadOnlyForStation}/)
    expect(orderBadgeSrc).toMatch(/Order owned by another station/)
    expect(orderBadgeSrc).toMatch(
      /Owned by another station — Take Over to pay/
    )
  })
})

describe('Wave 2.2 — PaymentDetailBottomSheet handleContinueCharging defense-in-depth', () => {
  it('imports `isOrderReadOnly`', () => {
    expect(paymentSheetSrc).toMatch(
      /import\s*{\s*isOrderReadOnly\s*}\s*from\s*['"]@\/lib\/orderAccessControl['"]/
    )
  })

  it('checks ownership AFTER the activeId is resolved (covers both already-loaded and just-fetched paths)', () => {
    // The pre-flight must run after the `if (!useOrderStore.getState().ordersById[orderId])`
    // fetch fallback so the `state.ordersById[activeId]` lookup hits a real
    // order, not undefined.
    const fetchIdx = paymentSheetSrc.indexOf(
      'syncOrderFromDatabase(orderId)'
    )
    const checkIdx = paymentSheetSrc.indexOf(
      'isOrderReadOnly(order, state.currentStationId)'
    )
    expect(fetchIdx).toBeGreaterThan(0)
    expect(checkIdx).toBeGreaterThan(fetchIdx)
  })

  it('returns BEFORE setActiveOrder + close() when read-only (no side effects on rejection)', () => {
    const checkIdx = paymentSheetSrc.indexOf(
      'isOrderReadOnly(order, state.currentStationId)'
    )
    const setActiveIdx = paymentSheetSrc.indexOf(
      'useOrderStore.getState().setActiveOrder(activeId)'
    )
    expect(checkIdx).toBeGreaterThan(0)
    expect(setActiveIdx).toBeGreaterThan(checkIdx)
    // The check block must contain a `return` before the setActive call.
    const between = paymentSheetSrc.slice(checkIdx, setActiveIdx)
    expect(between).toMatch(/return/)
  })
})

describe('Wave 2.2 — MoreOptionsBottomSheet menu items', () => {
  it('imports `useIsActiveOrderReadOnly`', () => {
    expect(moreOptionsSrc).toMatch(
      /import\s*{\s*useIsActiveOrderReadOnly\s*}\s*from\s*['"]@\/lib\/orderAccessControlHooks['"]/
    )
  })

  it('Apply Discount disables when read-only (composes with the existing `canApplyDiscount` boolean)', () => {
    expect(moreOptionsSrc).toMatch(
      /canApplyDiscount\s*=\s*!hasRefunds && !isCheckClosed && !isReadOnlyForStation/
    )
  })

  it('Apply Discount subtitle reflects the read-only reason (not the closed-check or refund reason)', () => {
    // The subtitle branches on which condition fired. If a future refactor
    // collapses the branches, this assertion catches it.
    expect(moreOptionsSrc).toMatch(
      /isReadOnlyForStation[\s\S]*Owned by another station/
    )
  })

  it('Void Order disables when read-only (composes with the existing `canVoid` boolean)', () => {
    expect(moreOptionsSrc).toMatch(/!isReadOnlyForStation\s*&&/)
  })

  it('Void Order subtitle reflects the read-only reason', () => {
    expect(moreOptionsSrc).toMatch(
      /isReadOnlyForStation\s*\?\s*'Owned by another station'\s*:\s*'This action cannot be undone'/
    )
  })

  it('Add Customer disables when read-only (composes with `isCheckClosed`)', () => {
    expect(moreOptionsSrc).toMatch(
      /disabled={isCheckClosed \|\| isReadOnlyForStation}/
    )
  })
})

describe('Wave 2.2 — CustomerSheet defense-in-depth', () => {
  it('imports `useIsActiveOrderReadOnly`', () => {
    expect(customerSheetSrc).toMatch(
      /import\s*{\s*useIsActiveOrderReadOnly\s*}\s*from\s*['"]@\/lib\/orderAccessControlHooks['"]/
    )
  })

  it('composes `isAssignDisabled` with read-only (so the entire SectionList rows are inert)', () => {
    expect(customerSheetSrc).toMatch(
      /isAssignDisabled\s*=\s*!activeOrderId \|\| isReadOnlyForStation/
    )
  })

  it('handleSelectCustomer pre-flights ownership BEFORE updateActiveOrderDetails', () => {
    const guardIdx = customerSheetSrc.indexOf('if (isReadOnlyForStation) {')
    const updateIdx = customerSheetSrc.indexOf('updateActiveOrderDetails({')
    expect(guardIdx).toBeGreaterThan(0)
    expect(updateIdx).toBeGreaterThan(guardIdx)
  })
})

describe('Wave 2.2 — OrderDetails order-type segmented control', () => {
  it('imports `useIsActiveOrderReadOnly`', () => {
    expect(orderDetailsSrc).toMatch(
      /import\s*{\s*useIsActiveOrderReadOnly\s*}\s*from\s*['"]@\/lib\/orderAccessControlHooks['"]/
    )
  })

  it('composes `isOrderTypeLocked` with the existing Closed-check condition', () => {
    expect(orderDetailsSrc).toMatch(
      /isOrderTypeLocked\s*=\s*\n?\s*checkStatus === 'Closed' \|\| isReadOnlyForStation/
    )
  })

  it('subtitle text branches on which condition fired (read-only vs. check-closed)', () => {
    expect(orderDetailsSrc).toMatch(
      /isReadOnlyForStation[\s\S]*?another station/
    )
    expect(orderDetailsSrc).toMatch(/locked after the check is closed/)
  })
})

describe('Wave 2.2 — BillItem cart row dim + view-only modifier sheet', () => {
  it('imports `useIsActiveOrderReadOnly`', () => {
    expect(billItemSrc).toMatch(
      /import\s*{\s*useIsActiveOrderReadOnly\s*}\s*from\s*['"]@\/lib\/orderAccessControlHooks['"]/
    )
  })

  it('forces openToView (not openToEdit) when read-only — sheet still opens for inspection', () => {
    // The store-level `_checkCartEditable` already blocks edit-RPC calls
    // (Wave 1). This UI-level guard prevents the user from reaching the
    // edit form at all, so they see a clear "view only" affordance.
    expect(billItemSrc).toMatch(
      /isEditable && !isKitchenItem && !isReadOnlyForStation/
    )
  })

  it('dims the row at opacity 0.5 when read-only and not voided (voided already has its own muted styling)', () => {
    expect(billItemSrc).toMatch(
      /isReadOnlyForStation && !isVoided[\s\S]*opacity:\s*0\.5/
    )
  })
})
