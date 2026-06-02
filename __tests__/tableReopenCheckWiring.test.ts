import { readFileSync } from 'fs'
import { join } from 'path'

const repoRoot = join(__dirname, '..')

function read (relPath: string): string {
  return readFileSync(join(repoRoot, relPath), 'utf-8')
}

const actionBarSrc = read('components/bill/BottomActionBar.tsx')
const courseAccordionSrc = read('components/bill/CourseAccordion.tsx')
const moreOptionsSrc = read('components/bill/MoreOptionsBottomSheet.tsx')
const tableBillSectionSrc = read('components/bill/TableBillSection.tsx')
const tableOrderViewSrc = read('components/tables/TableOrderView.tsx')
const tableAlertDialogsSrc = read('components/tables/TableAlertDialogs.tsx')
const orderStoreSrc = read('stores/useOrderStore.ts')
const orderSelectorsSrc = read('stores/selectors/orderSelectors.ts')
const reopenEffectSrc = read('services/sessionEffects/reopenCheckEffect.ts')
const reopenSqlSrc = read('utils/supabase/migrations/reopen_check.sql')
const reopenLifecycleMigrationSrc = read(
  'supabase/migrations/20260602090000_fix_reopen_check_payment_lifecycle.sql'
)

describe('table ordering reopen-check wiring', () => {
  it('renders a Reopen action for a closed check', () => {
    expect(actionBarSrc).toMatch(
      /TouchableOpacity onPress=\{onPressReopenCheck\}[\s\S]*?<RotateCcw[\s\S]*?>Reopen<\/Text>/
    )
  })

  it('awaits the reopen RPC before applying the local lifecycle update', () => {
    const rpcIndex = tableOrderViewSrc.indexOf(
      'const result = await OrderService.reopenCheck('
    )
    const localUpdateIndex = tableOrderViewSrc.indexOf(
      'useOrderStore.getState().markCheckReopenedLocally(oid, result)'
    )

    expect(rpcIndex).toBeGreaterThan(-1)
    expect(localUpdateIndex).toBeGreaterThan(rpcIndex)
    expect(tableOrderViewSrc).toContain('backendAlreadySynced: true')
  })

  it('uses a native confirmation modal and closes stale payment UI before reopening locally', () => {
    expect(tableAlertDialogsSrc).toMatch(
      /<Modal[\s\S]*?visible=\{isReopenModalOpen\}[\s\S]*?onPress=\{onConfirmReopen\}/
    )
    expect(tableAlertDialogsSrc).not.toContain('<ConfirmationModal')

    const paymentCloseIndex = tableOrderViewSrc.indexOf('paymentStore.close()')
    const localUpdateIndex = tableOrderViewSrc.indexOf(
      'useOrderStore.getState().markCheckReopenedLocally(oid, result)'
    )
    expect(paymentCloseIndex).toBeGreaterThan(-1)
    expect(localUpdateIndex).toBeGreaterThan(paymentCloseIndex)
  })

  it('lets the confirmation modal unmount before opening the global loader', () => {
    const dismissIndex = tableOrderViewSrc.indexOf('closeDialog()')
    const nextFrameIndex = tableOrderViewSrc.indexOf(
      'await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))'
    )
    const loadingIndex = tableOrderViewSrc.indexOf(
      "showLoading('Reopening check...')"
    )

    expect(dismissIndex).toBeGreaterThan(-1)
    expect(nextFrameIndex).toBeGreaterThan(dismissIndex)
    expect(loadingIndex).toBeGreaterThan(nextFrameIndex)
  })

  it('uses a local-only store lifecycle setter after backend confirmation', () => {
    expect(orderStoreSrc).toMatch(
      /markCheckReopenedLocally: \(orderId, backendTotals\) => \{[\s\S]*?order\.check_status = "Opened";[\s\S]*?order\._reopenedForOrdering = true;[\s\S]*?order\.paid_status = "Partial";[\s\S]*?order\.amount_due = backendTotals\.amount_due;[\s\S]*?get\(\)\.recalculateOrder\(storeKey\);/
    )
  })

  it('moves reopened paid checks to partial before backend totals recalculate', () => {
    for (const src of [reopenSqlSrc, reopenLifecycleMigrationSrc]) {
      const partialIndex = src.indexOf("THEN 'partial'::payment_status")
      const recalculateIndex = src.indexOf(
        'SELECT calculate_order_totals_fast(p_order_id) INTO v_totals'
      )
      expect(partialIndex).toBeGreaterThan(-1)
      expect(recalculateIndex).toBeGreaterThan(partialIndex)
      expect(src).toContain("'amount_due', COALESCE((v_totals->>'amount_due')::NUMERIC, 0)")
    }
    expect(tableOrderViewSrc).toContain(
      'markCheckReopenedLocally(oid, result)'
    )
    expect(orderStoreSrc).toContain(
      'get().markCheckReopenedLocally(storeKey, result);'
    )
  })

  it('does not call the reopen RPC twice after the screen already synced it', () => {
    expect(reopenEffectSrc).toContain(
      'if (ctx.action.backendAlreadySynced) return;'
    )
  })

  it('keeps kitchen send actions driven by unsent items after a course has fired', () => {
    expect(courseAccordionSrc).toContain('{hasUnsentItems && (')
    expect(tableBillSectionSrc).toContain('{hasUnsentItems && onSend && (')
    expect(tableBillSectionSrc).not.toContain('if (enableCoursing) return null')
    expect(tableOrderViewSrc).toMatch(
      /\.filter\(i => !i\.is_voided && isKitchenItemUnsent\(i\)\)/
    )
  })

  it('routes the More Options Open Check row through reopen logic', () => {
    expect(moreOptionsSrc).toMatch(
      /activeOrder\?\.check_status === 'Closed'[\s\S]*?closeAndThen\(\(\) => onReopenCheck\?\.\(\)\)/
    )
    expect(tableOrderViewSrc).toContain('onReopenCheck={handleReopenCheck}')
  })

  it('does not expose Close Session in the More Options sheet', () => {
    expect(moreOptionsSrc).not.toContain('Close Session')
    expect(moreOptionsSrc).not.toContain('onCloseSession')
  })

  it('shows Pay again when reopened checks gain a new outstanding balance', () => {
    expect(orderSelectorsSrc).toContain(
      'Do not let the historical paid snapshot hide that new balance.'
    )
    expect(orderStoreSrc).toContain('shouldUseCalculatedReopenBalance')
    expect(orderSelectorsSrc).toContain(
      '(order._reopenedForOrdering || hasPendingCartEdit)'
    )
    expect(orderSelectorsSrc).toContain(
      'preserveItemLevelOutstanding: order._reopenedForOrdering === true'
    )
    expect(orderStoreSrc).toContain(
      'preserveItemLevelOutstanding: order?._reopenedForOrdering === true'
    )
    expect(tableOrderViewSrc).toMatch(
      /if \(hasPayments && totals !== null\) \{[\s\S]*?return displayBalanceDue <= PAID_BALANCE_TOLERANCE/
    )
    expect(actionBarSrc).toContain(
      'isFullyPaidProp ?? (activeOrder.paid_status === "Paid")'
    )
  })

  it('clears row-level pending state after online add acknowledgements', () => {
    expect(
      orderStoreSrc.match(/db_order_item_id: addResult\.order_item_id,[\s\S]{0,100}?sync_status: "synced" as const/g)
    ).toHaveLength(2)
    expect(orderSelectorsSrc).toContain(
      '!isOutstandingLocalEditAhead('
    )
  })
})
