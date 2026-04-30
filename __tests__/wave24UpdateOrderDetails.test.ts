/**
 * Wave 2.4 — Structural guard for `update_order_details_v1` and the
 * client-side migration off raw `.from('orders').update()`.
 *
 * Background:
 * Pre-Wave 2.4, `useOrderStore.updateActiveOrderDetails` called
 * `supabase.from('orders').update()` four separate times (customer block,
 * order_type, delivery_address, notes). RLS doesn't check `station_id`, so
 * these were the last unguarded mutation surface for orders. The cross-
 * station race was: B claims → A's broadcast hasn't landed yet → A submits
 * a customer or order_type change → raw .update() succeeds against an
 * order A no longer owns.
 *
 * Wave 2.4 introduces `update_order_details_v1` — a single SECURITY DEFINER
 * function that calls `_assert_order_station_match` first, then atomically
 * applies whichever fields the caller flagged. Per-block boolean flags let
 * callers explicitly clear a field without a sentinel value.
 *
 * Why a STRUCTURAL test (mirrors the rest of Wave 2):
 * The order store is unloadable in jest (50+ transitive imports including
 * Supabase + hardware services). Two-station UAT covers the runtime
 * contract; this file pins the source-level invariants:
 *   - Migration SQL is well-formed and inserts the station guard before
 *     any UPDATE.
 *   - `OrderService.updateOrderDetails` is wired to the new RPC name with
 *     the right param shape.
 *   - `useOrderStore.updateActiveOrderDetails` no longer calls
 *     `.from('orders').update()` for the four migrated blocks.
 *   - Ownership errors from the RPC are short-circuited via
 *     `isOwnershipError` (Wave 2.5 helper) and toast the same operator-
 *     facing copy as the inline silent-queue paths.
 *
 * The `table_sessions.party_size` raw update is INTENTIONALLY out of
 * scope for Wave 2.4 — it's a different table with a different ownership
 * model. This test pins that decision explicitly so a future refactor
 * doesn't accidentally fold it in (creating cross-table coupling).
 */

import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(__dirname, '..')

function read (relPath: string): string {
  return readFileSync(join(repoRoot, relPath), 'utf-8')
}

const migrationSrc = read(
  'utils/supabase/migrations/update_order_details_v1.sql'
)
const rollbackSrc = read(
  'utils/supabase/migrations/update_order_details_v1_rollback.sql'
)
const orderServiceSrc = read('services/orderService.ts')
const orderStoreSrc = read('stores/useOrderStore.ts')

describe('Wave 2.4 — update_order_details_v1 migration shape', () => {
  it('declares all 13 parameters expected by the client wire (order, station, customer block + flag, 3 singletons + flags)', () => {
    expect(migrationSrc).toMatch(/p_order_id uuid/)
    expect(migrationSrc).toMatch(/p_station_id uuid DEFAULT NULL/)
    expect(migrationSrc).toMatch(/p_update_customer boolean DEFAULT false/)
    expect(migrationSrc).toMatch(/p_customer_id uuid DEFAULT NULL/)
    expect(migrationSrc).toMatch(/p_customer_name text DEFAULT NULL/)
    expect(migrationSrc).toMatch(/p_customer_phone text DEFAULT NULL/)
    expect(migrationSrc).toMatch(/p_customer_email text DEFAULT NULL/)
    expect(migrationSrc).toMatch(/p_update_order_type boolean DEFAULT false/)
    expect(migrationSrc).toMatch(/p_order_type text DEFAULT NULL/)
    expect(migrationSrc).toMatch(
      /p_update_delivery_address boolean DEFAULT false/
    )
    expect(migrationSrc).toMatch(/p_delivery_address text DEFAULT NULL/)
    expect(migrationSrc).toMatch(/p_update_notes boolean DEFAULT false/)
    expect(migrationSrc).toMatch(/p_notes text DEFAULT NULL/)
  })

  it('declares SECURITY DEFINER + sets a safe search_path', () => {
    expect(migrationSrc).toMatch(/SECURITY DEFINER/)
    expect(migrationSrc).toMatch(/SET search_path TO 'public'/)
  })

  it('runs the merchant + location auth check BEFORE the station ownership guard', () => {
    const authIdx = migrationSrc.indexOf("'Order not found or access denied'")
    const stationIdx = migrationSrc.indexOf(
      'PERFORM public._assert_order_station_match(p_order_id, p_station_id)'
    )
    expect(authIdx).toBeGreaterThan(0)
    expect(stationIdx).toBeGreaterThan(authIdx)
  })

  it('runs the station guard BEFORE the UPDATE statement (no writes on rejection)', () => {
    const stationIdx = migrationSrc.indexOf(
      'PERFORM public._assert_order_station_match(p_order_id, p_station_id)'
    )
    const updateIdx = migrationSrc.indexOf('UPDATE public.orders SET')
    expect(stationIdx).toBeGreaterThan(0)
    expect(updateIdx).toBeGreaterThan(stationIdx)
  })

  it('uses CASE-WHEN flags (not COALESCE) so callers can explicitly clear a field', () => {
    // COALESCE(p_X, X) collapses null-as-clear into null-as-preserve, which
    // would break the existing notes-clear flow. CASE-WHEN keeps both
    // semantics distinct.
    expect(migrationSrc).toMatch(
      /CASE WHEN p_update_customer THEN p_customer_id ELSE customer_id END/
    )
    expect(migrationSrc).toMatch(
      /CASE WHEN p_update_notes THEN p_notes ELSE special_instructions END/
    )
  })

  it('writes notes into the `special_instructions` column (not `notes`) — matches the existing schema', () => {
    expect(migrationSrc).toMatch(/special_instructions =/)
    expect(migrationSrc).not.toMatch(/^\s*notes =/m)
  })

  it('GRANTs EXECUTE to authenticated with the full 13-param signature', () => {
    expect(migrationSrc).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.update_order_details_v1\([\s\S]*?\) TO authenticated/
    )
  })

  it('rollback drops the same 13-param signature', () => {
    expect(rollbackSrc).toMatch(/DROP FUNCTION IF EXISTS public\.update_order_details_v1/)
    expect(rollbackSrc).toMatch(/uuid, uuid/)
    expect(rollbackSrc).toMatch(/boolean, uuid, text, text, text/)
  })
})

describe('Wave 2.4 — OrderService.updateOrderDetails wiring', () => {
  it('exists and calls the `update_order_details_v1` RPC name', () => {
    expect(orderServiceSrc).toMatch(/static async updateOrderDetails/)
    expect(orderServiceSrc).toMatch(
      /client\.rpc\(['"]update_order_details_v1['"]/
    )
  })

  it('forwards the station id (the whole point of Wave 2.4)', () => {
    expect(orderServiceSrc).toMatch(/p_station_id:\s*stationId/)
  })

  it('emits the `_update_X` flags only when the corresponding block is in `updates`', () => {
    // The shape `updates.customer !== undefined` distinguishes "block
    // present, possibly with null fields to clear" from "block absent,
    // preserve as-is" — without it, callers couldn't clear a field.
    expect(orderServiceSrc).toMatch(
      /p_update_customer:\s*updates\.customer !== undefined/
    )
    expect(orderServiceSrc).toMatch(
      /p_update_order_type:\s*updates\.orderType !== undefined/
    )
    expect(orderServiceSrc).toMatch(
      /p_update_delivery_address:\s*updates\.deliveryAddress !== undefined/
    )
    expect(orderServiceSrc).toMatch(
      /p_update_notes:\s*updates\.notes !== undefined/
    )
  })

  it('runs through `_runWithDeadline` at the hot-mutation deadline (consistent with sibling RPCs)', () => {
    // Pre-Wave 2.4 the four raw updates had no deadline. The new RPC must
    // reuse the same deadline budget as `add_order_item_v3` etc., else a
    // stalled Supabase response would hang updateActiveOrderDetails.
    const fnIdx = orderServiceSrc.indexOf('updateOrderDetails (')
    const fnBody = orderServiceSrc.slice(fnIdx, fnIdx + 2000)
    expect(fnBody).toMatch(/_runWithDeadline/)
    expect(fnBody).toMatch(/DEADLINES\.hotMutation/)
  })
})

describe('Wave 2.4 — useOrderStore.updateActiveOrderDetails refactor', () => {
  it('no longer calls `.from(\'orders\').update(` for the four migrated blocks', () => {
    // The only remaining `.from('orders').update(` in the store should be
    // unrelated to updateActiveOrderDetails (e.g., voidAllPayments line
    // 11883 clearing split_payment_path — handled separately when Wave
    // 2.3.2 lands the void_payment guard).
    const updateActiveIdx = orderStoreSrc.indexOf(
      'updateActiveOrderDetails: async details =>'
    )
    expect(updateActiveIdx).toBeGreaterThan(0)
    // Find the next sibling action so we can scope to just this fn body.
    const nextActionIdx = orderStoreSrc.indexOf(
      'applyDiscountToCheck:',
      updateActiveIdx
    )
    expect(nextActionIdx).toBeGreaterThan(updateActiveIdx)
    const fnBody = orderStoreSrc.slice(updateActiveIdx, nextActionIdx)
    expect(fnBody).not.toMatch(/\.from\(['"]orders['"]\)\s*\.update\(/)
  })

  it('uses `OrderService.updateOrderDetails` and forwards `selectedStation.id`', () => {
    const updateActiveIdx = orderStoreSrc.indexOf(
      'updateActiveOrderDetails: async details =>'
    )
    const nextActionIdx = orderStoreSrc.indexOf(
      'applyDiscountToCheck:',
      updateActiveIdx
    )
    const fnBody = orderStoreSrc.slice(updateActiveIdx, nextActionIdx)
    expect(fnBody).toMatch(/OrderService\.updateOrderDetails\(/)
    expect(fnBody).toMatch(
      /useStoreSettingsStore\.getState\(\)\.selectedStation\?\.id/
    )
  })

  it('routes ownership rejections through `isOwnershipError` with the same toast copy as the silent-queue paths', () => {
    const updateActiveIdx = orderStoreSrc.indexOf(
      'updateActiveOrderDetails: async details =>'
    )
    const nextActionIdx = orderStoreSrc.indexOf(
      'applyDiscountToCheck:',
      updateActiveIdx
    )
    const fnBody = orderStoreSrc.slice(updateActiveIdx, nextActionIdx)
    expect(fnBody).toMatch(/isOwnershipError\(/)
    expect(fnBody).toMatch(
      /This order moved to another station\. Take over to continue\./
    )
  })

  it('preserves the `table_sessions.party_size` raw update — different ownership model, intentionally not folded in', () => {
    // If a future refactor folds party_size into update_order_details_v1,
    // it would couple two distinct ownership models and break tests
    // that don't have a session id. Keep them separate.
    const updateActiveIdx = orderStoreSrc.indexOf(
      'updateActiveOrderDetails: async details =>'
    )
    const nextActionIdx = orderStoreSrc.indexOf(
      'applyDiscountToCheck:',
      updateActiveIdx
    )
    const fnBody = orderStoreSrc.slice(updateActiveIdx, nextActionIdx)
    expect(fnBody).toMatch(
      /\.from\(['"]table_sessions['"]\)\s*\n?\s*\.update\(\{ party_size/
    )
  })
})
