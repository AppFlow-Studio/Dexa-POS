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

describe('table ordering reopen-check wiring', () => {
  it('renders the Reopen action gated on canReopenClosedCheck', () => {
    // Reopening is enabled; the guard is the gate, not the absence of the UI.
    expect(actionBarSrc).toContain('>Reopen</Text>')
    expect(actionBarSrc).toContain('canReopenClosedCheck')
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

  it('routes the reopen confirmation through TableAlertDialogs', () => {
    expect(tableAlertDialogsSrc).toContain('onConfirmReopen')
  })

  it('lets the confirmation modal unmount before opening the global loader', () => {
    const dismissIndex = tableOrderViewSrc.indexOf('closeDialog()')
    const nextFrameIndex = tableOrderViewSrc.search(
      /new Promise<void>\(\s*\(?resolve\)?\s*=>\s*requestAnimationFrame/
    )
    const loadingIndex = tableOrderViewSrc.search(
      /showLoading\(['"]Reopening check\.\.\.['"]\)/
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

  it('does not call the reopen RPC twice after the screen already synced it', () => {
    expect(reopenEffectSrc).toContain(
      'if (ctx.action.backendAlreadySynced) return;'
    )
  })

  it('keeps kitchen send actions driven by unsent items after a course has fired', () => {
    expect(courseAccordionSrc).toMatch(/\{hasUnsentItems && \(/)
    expect(tableBillSectionSrc).toMatch(/\{hasUnsentItems && onSend && /)
    expect(tableBillSectionSrc).not.toContain('if (enableCoursing) return null')
    expect(tableOrderViewSrc).toMatch(
      /\.filter\(\s*\(?i\)?\s*=>\s*!i\.is_voided && isKitchenItemUnsent\(i\),?\s*\)/
    )
  })

  it('does not expose Open Check in More Options while reopening is disabled', () => {
    expect(moreOptionsSrc).not.toContain('Open Check')
    expect(moreOptionsSrc).not.toContain('onReopenCheck')
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

  it('resolves bill item rows through the order id index', () => {
    expect(orderSelectorsSrc).toContain(
      's.getOrder(orderId)?.items.find((item) => item.id === itemId)'
    )
    expect(tableBillSectionSrc).toContain(
      '<DenseBillItemRow'
    )
  })

  it('disables table menu taps when a closed check cannot be reopened', () => {
    expect(tableOrderViewSrc).toContain('isClosedCheckMenuDisabled')
    expect(tableOrderViewSrc).toMatch(
      /pointerEvents=\{isMenuDisabled \? ['"]none['"] : ['"]auto['"]\}/
    )
    // The prop is fed from isClosedCheckMenuDisabled via isMenuPanelDisabled.
    expect(tableOrderViewSrc).toMatch(
      /const isMenuPanelDisabled = isClosedCheckMenuDisabled/
    )
    expect(tableOrderViewSrc).toMatch(/isMenuDisabled=\{isMenuPanelDisabled\}/)
  })
})
