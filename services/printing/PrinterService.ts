import {
  calculateItemEffectiveCardPrice,
  calculateItemEffectiveCashPrice,
  calculateOrderTotals,
  round2
} from '@/lib/order-calculator'
import { onlineOrderShortCode } from '@/lib/onlineOrderLabel'
import { isOnlineOrderSource } from '@/lib/orderSource'
import { resolveOrderPlatformLogo } from '@/lib/orderPlatformResolver'
import { INKIND_LABEL } from '@/lib/paymentMethod'
import { KEY_RECEIPT_RECONCILE_MISMATCH } from '@/lib/telemetry/keys'
import { recordCount } from '@/lib/telemetry/registry'
import { toastService } from '@/lib/toastService'
import { CartItem, OrderProfile, OrderProfilePayment } from '@/lib/types'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePrintQueueStore } from '@/stores/usePrintQueueStore'
import { usePrinterStore } from '@/stores/usePrinterStore'
import { useReceiptTemplateStore } from '@/stores/useReceiptTemplateStore'
import { useSeatingStore } from '@/stores/useSeatingStore'
import { useServiceChargeRulesStore } from '@/stores/useServiceChargeRulesStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import {
  getOrderTypeDisplay as displayOrderType,
  resolveTableDisplayName
} from '@/lib/orderDisplay'
import {
  SelectedLocation,
  useStoreSettingsStore
} from '@/stores/useStoreSettingsStore'
import { PrintDocument } from '@/types/print-document'
import {
  DocumentPrintJob,
  KitchenTicketData,
  KitchenTicketItemData,
  PrinterConfig,
  PrintJob,
  PrintJobType,
  RawPrintJob,
  ReceiptItemData,
  ReceiptPaymentData,
  ReceiptTemplateData
} from '@/types/printer'
import { DEFAULT_RECEIPT_TEMPLATE } from '@/types/receipt-template'
import { getDriver } from './DriverFactory'
import { getReceiptPrinter, routeKitchenItems } from './PrintRouter'
import { buildKitchenTicketDocument } from './templates/KitchenTicketDocumentTemplate'
import { buildKitchenTicketCommands } from './templates/KitchenTicketTemplate'
import {
  BatchSummary,
  BatchSummaryStoreContext,
  BusinessDaySummary,
  buildBatchSummaryDocument,
  buildBusinessDaySummaryDocument
} from './templates/BatchSummaryDocumentTemplate'
import {
  buildNoSaleDocument,
  NoSaleReceiptData
} from './templates/NoSaleDocumentTemplate'
import { buildReceiptDocument } from './templates/ReceiptDocumentTemplate'
import { buildReceiptCommands } from './templates/ReceiptTemplate'
import {
  buildTimeSheetDocument,
  TimeSheetReceiptData
} from './templates/TimeSheetDocumentTemplate'
import {
  buildVoidOrderDocument,
  VoidOrderReceiptData
} from './templates/VoidOrderDocumentTemplate'
import { safeTimeString } from './utils/sanitizeText'
import { sweepOrphanTempImages } from './utils/tempImageCleanup'

let processingStarted = false
// Per-printer drain state. Each printer drains independently so a stuck or
// offline kitchen printer doesn't block receipts on the receipt printer.
const processingPrinters = new Set<string>()
const printerJobStartedAt = new Map<string, number>()
let lastFailureToastAt = 0
let backoffWakeupTimer: ReturnType<typeof setTimeout> | null = null

const FAILURE_TOAST_DEDUP_MS = 30_000
const PROCESSING_STUCK_MS = 30_000 // Safety: force-release a stuck printer slot
const BACKOFF_WAKEUP_MS = 250 // Wake-up delay when only retry-backoff jobs remain

// Schedule a queue drain. Coalesces multiple calls into one pending run.
// At drain time we kick a parallel `drainPrinter` for every printer that has a
// ready job and isn't already draining.
function scheduleDrain (delayMs = 0): void {
  if (!processingStarted) return
  if (delayMs === 0) {
    queueMicrotask(kickAllReadyPrinters)
    return
  }
  if (backoffWakeupTimer) return
  backoffWakeupTimer = setTimeout(() => {
    backoffWakeupTimer = null
    kickAllReadyPrinters()
  }, delayMs)
}

function kickAllReadyPrinters (): void {
  if (!processingStarted) return
  const jobs = usePrintQueueStore.getState().jobs
  const candidates = new Set<string>()
  for (const j of jobs) {
    if (j.status !== 'queued') continue
    if (processingPrinters.has(j.printerId)) continue
    candidates.add(j.printerId)
  }
  for (const printerId of candidates) {
    drainPrinter(printerId).catch(err =>
      console.error(
        `[PrinterService] Drain loop error for printer ${printerId}:`,
        err
      )
    )
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

function liveItemCount (order: OrderProfile | null | undefined): number {
  return order?.items?.length ?? 0
}

/**
 * A header-only broadcast shell: nothing in `items`, but the broadcast's
 * `item_count` says the backend row HAS items.
 *
 * v3 broadcasts carry no `order_items` (only `item_count`), and item detail is
 * hydrated on demand — W1-3 eager-fetches full detail only for orders inside
 * this station's working scope and merely marks everything else detailStale.
 * An order that never enters the working scope therefore keeps `items: []`
 * indefinitely. Auto-accepted online orders are the systematic case: they land
 * via broadcast, run through KDS and complete without ever being opened on the
 * POS, so nothing ever calls the demand-side hydrator for them.
 */
export function isHeaderOnlyShell (
  order: OrderProfile | null | undefined
): boolean {
  return (
    !!order &&
    liveItemCount(order) === 0 &&
    (order._broadcastItemCount ?? 0) > 0
  )
}

/**
 * Resolve the fullest available copy of an order for printing. Live surfaces
 * (sidebar, table sheet, payment sheet, menu) already pass the hydrated store
 * OrderProfile. Previous-Orders reprints, however, pass a list-optimized object
 * whose items lack modifier customizations and whose session_id was dropped —
 * which makes the printed receipt diverge (missing modifiers, stale service
 * charge that can't be recomputed without the session). When a hydrated copy
 * exists in the order store (matched by local id, else db_order_id), prefer it
 * so EVERY print surface resolves the same receipt. Falls back to the passed
 * order for archived orders no longer held in the store.
 *
 * "Fullest" is the operative word: the store copy wins only when it is at least
 * as complete as what we were handed. Previous-Orders keys its profiles by the
 * db uuid — the same key a broadcast shell is stored under — so an unguarded
 * swap replaced a fully-hydrated 6-item reprint with an empty header shell and
 * printed "(no items)" under a $114.80 total (#S1-0010).
 */
export function resolveFullOrder (order: OrderProfile): OrderProfile {
  try {
    const store = useOrderStore.getState()
    const stored =
      store.ordersById[order.id] ??
      (order.db_order_id
        ? store.ordersById[store.dbOrderIdIndex[order.db_order_id] ?? '']
        : undefined)
    if (!stored) return order
    // Never trade item data away. A store copy with no items can still be the
    // better source (fresher header, session binding) — but only when the
    // caller has no items either.
    if (liveItemCount(stored) === 0 && liveItemCount(order) > 0) return order
    return stored
  } catch {
    // Store unavailable — print what we were handed.
  }
  return order
}

/**
 * Force-hydrate item detail for a header-only shell before it reaches the
 * renderer. Returns the fullest copy available afterwards.
 *
 * Only fires for orders we KNOW are missing items (`item_count` > 0 with an
 * empty array), so the common path costs nothing. `force: true` bypasses the
 * 5s detail-sync cooldown — the empty array IS the evidence of need. Failures
 * are non-fatal here; the caller decides whether an item-less receipt may print.
 */
async function hydrateItemsForPrint (
  order: OrderProfile
): Promise<OrderProfile> {
  if (!isHeaderOnlyShell(order)) return order
  const dbId = order.db_order_id ?? order.id
  try {
    await useOrderStore
      .getState()
      .syncOrderFromBackendComplete(dbId, { force: true })
    const store = useOrderStore.getState()
    const rehydrated =
      store.ordersById[store.dbOrderIdIndex[dbId] ?? dbId] ??
      store.ordersById[order.id]
    if (liveItemCount(rehydrated) > 0) return rehydrated!
  } catch (e) {
    console.warn('[PrinterService] Pre-print item hydration failed:', e)
  }
  return order
}

/**
 * Guard the renderer's `(no items)` path. buildReceiptTemplateData derives
 * Subtotal purely from the item array while Tax and TOTAL fall back to the
 * persisted scalars, so an item-less finalized order prints a body-less receipt
 * with a $0.00 subtotal under the real total. That is worse than not printing:
 * it reconciles to nothing and reads as a $0 order to whoever holds the paper.
 */
function blockItemlessReceipt (order: OrderProfile, context: string): boolean {
  if (!isHeaderOnlyShell(order)) return false
  const expected = order._broadcastItemCount ?? 0
  console.error(
    `[PrinterService] ${context}: refusing to print — order ${
      order.db_order_id ?? order.id
    } has ${expected} item(s) on the backend but none loaded locally.`
  )
  toastService.show({
    title: 'Receipt Not Printed',
    message: `Could not load this order's ${expected} item${
      expected === 1 ? '' : 's'
    }. Check the connection and try again.`,
    type: 'error'
  })
  return true
}

export const PrinterService = {
  /**
   * Print a receipt for a completed order.
   */
  async printReceipt (
    inputOrder: OrderProfile,
    location: SelectedLocation
  ): Promise<boolean> {
    // Prefer the hydrated store copy so every surface — including Previous-Orders
    // reprints — renders the same receipt (full modifiers + live service charge).
    const order = await hydrateItemsForPrint(resolveFullOrder(inputOrder))
    const printer = getReceiptPrinter(location.id)
    if (!printer) {
      console.warn('[PrinterService] No receipt printer configured')
      return false
    }
    if (blockItemlessReceipt(order, 'printReceipt')) return false

    const { printMerchantCopy, printCustomerCopy } =
      useLocationConfigStore.getState().config.printing

    // Build copy labels to print. Fallback to customer copy if both are off.
    const copies: string[] = []
    if (printMerchantCopy) copies.push('Merchant Copy')
    if (printCustomerCopy) copies.push('Customer Copy')
    if (copies.length === 0) copies.push('Customer Copy')

    const baseData = buildReceiptTemplateData(order, location, printer)

    for (const label of copies) {
      const templateData: ReceiptTemplateData = {
        ...baseData,
        copyLabel: copies.length > 1 ? label : baseData.copyLabel ?? label
      }
      const job = createJobForPrinter(
        printer,
        templateData,
        'receipt',
        'normal',
        order.id,
        'receipt'
      )
      usePrintQueueStore.getState().enqueue(job)
    }

    this.ensureProcessing()
    return true
  },

  /**
   * Print a receipt scoped to a single split-payment portion — only that
   * payer's items/totals/tender. Supplements the combined receipt.
   */
  async printSplitPaymentReceipt (
    inputOrder: OrderProfile,
    payment: OrderProfilePayment,
    location: SelectedLocation
  ): Promise<boolean> {
    if (payment.isVoided) return false
    const order = await hydrateItemsForPrint(resolveFullOrder(inputOrder))

    const printer = getReceiptPrinter(location.id)
    if (!printer) {
      console.warn('[PrinterService] No receipt printer configured')
      return false
    }
    if (blockItemlessReceipt(order, 'printSplitPaymentReceipt')) return false

    const { printMerchantCopy, printCustomerCopy } =
      useLocationConfigStore.getState().config.printing

    const copies: string[] = []
    if (printMerchantCopy) copies.push('Merchant Copy')
    if (printCustomerCopy) copies.push('Customer Copy')
    if (copies.length === 0) copies.push('Customer Copy')

    const baseData = buildReceiptTemplateData(order, location, printer, {
      scopeToPayment: payment
    })

    for (const label of copies) {
      const templateData: ReceiptTemplateData = {
        ...baseData,
        copyLabel: copies.length > 1 ? label : baseData.copyLabel ?? label
      }
      const job = createJobForPrinter(
        printer,
        templateData,
        'receipt',
        'normal',
        order.id,
        'receipt'
      )
      usePrintQueueStore.getState().enqueue(job)
    }

    this.ensureProcessing()
    return true
  },

  /**
   * Print one separate receipt for every non-voided payment on the order.
   */
  async printAllSplitReceipts (
    inputOrder: OrderProfile,
    location: SelectedLocation
  ): Promise<boolean> {
    const order = await hydrateItemsForPrint(resolveFullOrder(inputOrder))
    const payments = (order.payments ?? []).filter(p => !p.isVoided)
    if (payments.length === 0) return false
    let ok = true
    for (const p of payments) {
      const sent = await this.printSplitPaymentReceipt(order, p, location)
      ok = ok && sent
    }
    return ok
  },

  /**
   * Print kitchen tickets for items, routed by category.
   */
  async printKitchenTickets (
    order: OrderProfile,
    items: CartItem[],
    location: SelectedLocation,
    options?: { forceGroupBySeat?: boolean }
  ): Promise<boolean> {
    const routedItems = routeKitchenItems(items, location.id, {
      orderType: order.order_type
    })

    console.log(
      `[PrinterService] printKitchenTickets: items=${items.length}, routedPrinters=${routedItems.size}`
    )

    if (routedItems.size === 0) {
      console.warn('[PrinterService] No kitchen printers configured')
      return false
    }

    for (const [printerId, printerItems] of routedItems) {
      const printer = usePrinterStore.getState().getPrinterById(printerId)
      if (!printer) continue

      console.log(
        `[PrinterService] Routing ${printerItems.length} items to ${printer.printerName} (${printer.printerType})`
      )

      // Check if this printer should suppress modifiers
      const routingConfig = usePrinterStore
        .getState()
        .getRoutingConfig(printerId)

      const ticketData = buildKitchenTicketData(
        order,
        printerItems,
        printer,
        false,
        location,
        routingConfig.printModifiers
      )

      // Force seat grouping for reprint-all scenarios (context menu, more options)
      if (options?.forceGroupBySeat && ticketData.templateConfig) {
        ticketData.templateConfig = {
          ...ticketData.templateConfig,
          groupBySeat: true
        }
      }

      const job = createJobForPrinter(
        printer,
        ticketData,
        'kitchen_ticket',
        'high',
        order.id,
        'kitchen'
      )
      usePrintQueueStore.getState().enqueue(job)
    }

    this.ensureProcessing()
    return true
  },

  /**
   * Print void tickets for voided items.
   */
  async printVoidTicket (
    order: OrderProfile,
    voidedItems: CartItem[],
    location: SelectedLocation
  ): Promise<boolean> {
    const routedItems = routeKitchenItems(voidedItems, location.id, {
      orderType: order.order_type
    })

    if (routedItems.size === 0) {
      return false
    }

    for (const [printerId, printerItems] of routedItems) {
      const printer = usePrinterStore.getState().getPrinterById(printerId)
      if (!printer) continue

      const routingConfig = usePrinterStore
        .getState()
        .getRoutingConfig(printerId)

      const ticketData = buildKitchenTicketData(
        order,
        printerItems,
        printer,
        true,
        location,
        routingConfig.printModifiers
      )
      const job = createJobForPrinter(
        printer,
        ticketData,
        'void_ticket',
        'high',
        order.id,
        'kitchen'
      )
      usePrintQueueStore.getState().enqueue(job)
    }

    this.ensureProcessing()
    return true
  },

  /**
   * Print refund tickets for refunded items (notifies kitchen about refunds).
   */
  async printRefundTicket (
    order: OrderProfile,
    refundedItems: CartItem[],
    location: SelectedLocation
  ): Promise<boolean> {
    const routedItems = routeKitchenItems(refundedItems, location.id, {
      orderType: order.order_type
    })

    if (routedItems.size === 0) {
      return false
    }

    for (const [printerId, printerItems] of routedItems) {
      const printer = usePrinterStore.getState().getPrinterById(printerId)
      if (!printer) continue

      const routingConfig = usePrinterStore
        .getState()
        .getRoutingConfig(printerId)

      const ticketData = buildKitchenTicketData(
        order,
        printerItems,
        printer,
        false,
        location,
        routingConfig.printModifiers
      )
      ticketData.isRefundTicket = true
      ticketData.items = ticketData.items.map(item => ({
        ...item,
        isRefunded: true
      }))

      const job = createJobForPrinter(
        printer,
        ticketData,
        'refund_ticket',
        'high',
        order.id,
        'kitchen'
      )
      usePrintQueueStore.getState().enqueue(job)
    }

    this.ensureProcessing()
    return true
  },

  /**
   * Open the cash drawer on the default receipt printer.
   */
  async openCashDrawer (): Promise<boolean> {
    const { printers } = usePrinterStore.getState()
    // Drawer-capable: flag set OR Star Micronics (always has DK port)
    const drawerPrinters = printers.filter(
      p =>
        p.isActive &&
        (p.supportsCashDrawerKick || p.printerType === 'star_micronics')
    )

    if (drawerPrinters.length === 0) {
      console.warn('[PrinterService] No printer with cash drawer support')
      return false
    }

    // Sort by priority: Star Micronics first (has real DK port), then connected default receipt, etc.
    const sorted = [
      ...drawerPrinters.filter(
        p => p.printerType === 'star_micronics' && p.isConnected
      ),
      ...drawerPrinters.filter(
        p => p.printerType === 'star_micronics' && !p.isConnected
      ),
      ...drawerPrinters.filter(
        p =>
          p.printerType !== 'star_micronics' &&
          p.isDefaultReceipt &&
          p.isConnected
      ),
      ...drawerPrinters.filter(
        p =>
          p.printerType !== 'star_micronics' &&
          p.isDefaultReceipt &&
          !p.isConnected
      ),
      ...drawerPrinters.filter(
        p => p.printerType !== 'star_micronics' && !p.isDefaultReceipt
      )
    ]
    // Deduplicate (a printer may match multiple filters)
    const candidates = [...new Map(sorted.map(p => [p.id, p])).values()]

    // Try each candidate — if one fails, fall back to next
    for (const printer of candidates) {
      try {
        console.log(
          `[PrinterService] Opening cash drawer via ${printer.printerType} (${
            printer.printerName
          }, addr=${printer.networkAddress ?? 'builtin'})`
        )
        const driver = getDriver(printer)
        if (!driver.isConnected()) {
          await driver.initialize(printer)
        }
        await driver.openCashDrawer()
        return true
      } catch (e) {
        console.warn(
          `[PrinterService] Cash drawer failed on ${printer.printerName}:`,
          e
        )
        // Continue to next candidate
      }
    }

    console.error('[PrinterService] All cash drawer candidates failed')
    return false
  },

  /**
   * Print a No Sale receipt on the receipt printer.
   */
  async printNoSaleReceipt (
    data: NoSaleReceiptData & { locationId: string }
  ): Promise<boolean> {
    const printer = getReceiptPrinter(data.locationId)
    if (!printer) {
      console.warn('[PrinterService] No receipt printer for no-sale receipt')
      return false
    }
    const template = useReceiptTemplateStore
      .getState()
      .getNoSaleTemplate(data.locationId)
    const doc = buildNoSaleDocument(data, template)
    const job = createDocumentJob(printer.id, doc, 'receipt', 'normal')
    usePrintQueueStore.getState().enqueue(job)
    this.ensureProcessing()
    return true
  },

  /**
   * Print a Void Order receipt on the receipt printer (customer-facing).
   */
  async printVoidOrderReceipt (
    data: VoidOrderReceiptData & { locationId: string }
  ): Promise<boolean> {
    const printer = getReceiptPrinter(data.locationId)
    if (!printer) {
      console.warn('[PrinterService] No receipt printer for void-order receipt')
      return false
    }
    const template = useReceiptTemplateStore
      .getState()
      .getVoidOrderTemplate(data.locationId)
    const doc = buildVoidOrderDocument(data, template)
    const job = createDocumentJob(printer.id, doc, 'receipt', 'normal')
    usePrintQueueStore.getState().enqueue(job)
    this.ensureProcessing()
    return true
  },

  /**
   * Print a Time Sheet receipt on the receipt printer.
   */
  async printTimeSheet (
    data: TimeSheetReceiptData & { locationId: string }
  ): Promise<boolean> {
    const printer = getReceiptPrinter(data.locationId)
    if (!printer) {
      console.warn('[PrinterService] No receipt printer for time-sheet receipt')
      return false
    }
    const template = useReceiptTemplateStore
      .getState()
      .getTimeSheetTemplate(data.locationId)
    const doc = buildTimeSheetDocument(data, template)
    const job = createDocumentJob(printer.id, doc, 'receipt', 'normal')
    usePrintQueueStore.getState().enqueue(job)
    this.ensureProcessing()
    return true
  },

  /**
   * Print a Castles batch closeout summary on the receipt printer.
   * Caller is responsible for fetching the structured summary via the
   * `get_batch_summary_v1` Supabase RPC.
   */
  async printBatchSummary (
    summary: BatchSummary,
    locationId: string,
    store?: BatchSummaryStoreContext
  ): Promise<boolean> {
    const printer = getReceiptPrinter(locationId)
    if (!printer) {
      console.warn('[PrinterService] No receipt printer for batch summary')
      return false
    }
    const doc = buildBatchSummaryDocument(summary, store ?? {})
    const job = createDocumentJob(printer.id, doc, 'receipt', 'normal')
    usePrintQueueStore.getState().enqueue(job)
    this.ensureProcessing()
    return true
  },

  /**
   * Print a rolled-up business-day summary covering every batch closed on
   * a given business day. Fetched via `get_business_day_summary_v1`.
   */
  async printBusinessDaySummary (
    day: BusinessDaySummary,
    locationId: string,
    store?: BatchSummaryStoreContext
  ): Promise<boolean> {
    const printer = getReceiptPrinter(locationId)
    if (!printer) {
      console.warn('[PrinterService] No receipt printer for business-day summary')
      return false
    }
    const doc = buildBusinessDaySummaryDocument(day, store ?? {})
    const job = createDocumentJob(printer.id, doc, 'receipt', 'normal')
    usePrintQueueStore.getState().enqueue(job)
    this.ensureProcessing()
    return true
  },

  /**
   * Print a test page on the specified printer (or default receipt printer).
   */
  async printTestPage (targetPrinter?: PrinterConfig): Promise<boolean> {
    const printer =
      targetPrinter ??
      usePrinterStore
        .getState()
        .printers.find(p => p.isActive && p.printerRole === 'receipt')

    if (!printer) {
      console.warn('[PrinterService] No receipt printer for test page')
      return false
    }

    const w = printer.graphicsOnly
      ? Math.min(printer.maxCharsPerLine, 32)
      : printer.maxCharsPerLine
    const timestamp = new Date().toLocaleString('en-US')

    // Build test page as PrintDocument (works for all drivers)
    const doc: PrintDocument = {
      nodes: [
        {
          type: 'text_line',
          content: 'Dexa POS',
          align: 'center',
          format: { bold: true, doubleHeight: true, doubleWidth: true }
        },
        { type: 'text_line', content: 'Printer Test', align: 'center' },
        { type: 'divider', style: 'double', lineWidth: w },
        { type: 'two_column', left: 'Status:', right: 'OK', lineWidth: w },
        { type: 'two_column', left: 'Time:', right: timestamp, lineWidth: w },
        {
          type: 'two_column',
          left: 'Printer:',
          right: printer.printerName,
          lineWidth: w
        },
        {
          type: 'two_column',
          left: 'Paper:',
          right: `${printer.paperWidth}mm`,
          lineWidth: w
        },
        {
          type: 'two_column',
          left: 'Driver:',
          right: printer.printerType,
          lineWidth: w
        },
        { type: 'divider', style: 'double', lineWidth: w },
        { type: 'text_line', content: 'Test Complete', align: 'center' },
        { type: 'cut' }
      ],
      maxCharsPerLine: w
    }

    const job = createDocumentJob(printer.id, doc, 'test_page', 'normal')
    usePrintQueueStore.getState().enqueue(job)
    this.ensureProcessing()
    return true
  },

  /**
   * Print a sample receipt on the specified printer.
   */
  async printTestReceipt (targetPrinter: PrinterConfig): Promise<boolean> {
    const now = new Date()
    const dateStr = now.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    })
    const timeStr = safeTimeString(now)

    const sampleData: ReceiptTemplateData = {
      storeName: 'Dexa POS — Sample Store',
      storeAddress: '123 Main St, Suite 100, Anytown, ST 12345',
      storePhone: '(555) 123-4567',
      orderNumber: '#TEST-001',
      orderDate: dateStr,
      orderTime: timeStr,
      orderType: 'Dine In',
      tableName: 'Table 5',
      serverName: 'Test Server',
      items: [
        {
          name: 'Classic Burger',
          quantity: 2,
          price: 12.99,
          isVoided: false,
          modifiers: [{ name: 'No Onions', price: 0 }]
        },
        {
          name: 'Caesar Salad',
          quantity: 1,
          price: 8.5,
          isVoided: false,
          modifiers: []
        },
        {
          name: 'Iced Tea',
          quantity: 3,
          price: 3.25,
          isVoided: false,
          modifiers: [{ name: 'Extra Lemon', price: 0 }]
        }
      ],
      subtotal: 44.23,
      tax: 3.54,
      discount: 0,
      tip: 6.0,
      total: 53.77,
      payments: [{ method: 'Card', amount: 53.77, last4: '4242' }],
      footerMessage: '** TEST RECEIPT — NOT A REAL TRANSACTION **',
      maxCharsPerLine: targetPrinter.graphicsOnly
        ? Math.min(targetPrinter.maxCharsPerLine, 32)
        : targetPrinter.maxCharsPerLine,
      taxRate: 0.08
    }

    const job = createJobForPrinter(
      targetPrinter,
      sampleData,
      'test_page',
      'normal',
      undefined,
      'receipt'
    )
    usePrintQueueStore.getState().enqueue(job)
    this.ensureProcessing()
    return true
  },

  /**
   * Print a sample kitchen ticket on the specified printer.
   */
  async printTestKitchenTicket (targetPrinter: PrinterConfig): Promise<boolean> {
    const now = new Date()
    const timestamp = safeTimeString(now)
    const fullTimestamp =
      now.toLocaleDateString('en-US', {
        month: '2-digit',
        day: '2-digit',
        year: 'numeric'
      }) +
      ' ' +
      timestamp

    const readyBy = new Date(now.getTime() + 15 * 60 * 1000)
    const readyByTime = safeTimeString(readyBy)

    const sampleData: KitchenTicketData = {
      orderNumber: '#TEST-001',
      orderType: 'Dine In',
      tableName: 'Table 5',
      serverName: 'Test Server',
      timestamp,
      fullTimestamp,
      readyByTime,
      totalItemCount: 4,
      items: [
        {
          name: 'Caesar Salad',
          quantity: 1,
          modifiers: ['Extra Dressing'],
          station: 'Cold Prep',
          courseNumber: 1
        },
        {
          name: 'Classic Burger',
          quantity: 2,
          modifiers: ['No Onions', 'Well Done'],
          notes: 'Allergy: gluten-free bun',
          station: 'Grill',
          allergyAlert: 'Allergy: gluten-free bun',
          courseNumber: 2
        },
        {
          name: 'Fish & Chips',
          quantity: 1,
          modifiers: ['Tartar Sauce on Side'],
          station: 'Grill',
          courseNumber: 2
        }
      ],
      isVoidTicket: false,
      maxCharsPerLine: targetPrinter.graphicsOnly
        ? Math.min(targetPrinter.maxCharsPerLine, 32)
        : targetPrinter.maxCharsPerLine
    }

    const job = createJobForPrinter(
      targetPrinter,
      sampleData,
      'test_page',
      'normal',
      undefined,
      'kitchen'
    )
    usePrintQueueStore.getState().enqueue(job)
    this.ensureProcessing()
    return true
  },

  /**
   * Kick the queue drain. Called after every enqueue.
   */
  ensureProcessing (): void {
    if (!processingStarted) {
      this.startProcessing()
      return
    }
    scheduleDrain(0)
  },

  /**
   * Enable event-driven print queue draining. Idempotent.
   */
  startProcessing (): void {
    if (processingStarted) return
    processingStarted = true
    console.log('[PrinterService] Print queue processing enabled (event-driven)')
    // Drain anything left over from a previous app session
    scheduleDrain(0)
  },

  /**
   * Stop draining. Cancels any pending wake-up.
   */
  stopProcessing (): void {
    if (!processingStarted) return
    processingStarted = false
    if (backoffWakeupTimer) {
      clearTimeout(backoffWakeupTimer)
      backoffWakeupTimer = null
    }
    console.log('[PrinterService] Stopped print queue processing')
  }
}

// ============================================================================
// QUEUE PROCESSOR — per-printer drain
// ============================================================================
//
// Each printer drains its own queue independently. A stuck or offline kitchen
// printer can hang indefinitely on a TCP/USB timeout without holding up the
// receipt printer's drain loop. Single-printer setups are unaffected (only
// one printer in `processingPrinters`).

async function drainPrinter (printerId: string): Promise<void> {
  if (!processingStarted) return

  if (processingPrinters.has(printerId)) {
    // Safety valve: if a drain has been hanging on an awaited TCP/USB call
    // longer than PROCESSING_STUCK_MS, force-release the slot so a fresh
    // invocation can take over. The hung drain's `finally` will then no-op
    // its delete (the slot was already released and may have been re-taken).
    const startedAt = printerJobStartedAt.get(printerId) ?? 0
    if (startedAt > 0 && Date.now() - startedAt > PROCESSING_STUCK_MS) {
      console.warn(
        `[PrinterService] Printer ${printerId} drain stuck, force-releasing`
      )
      processingPrinters.delete(printerId)
      printerJobStartedAt.delete(printerId)
    } else {
      return
    }
  }

  processingPrinters.add(printerId)

  try {
    while (processingStarted) {
      const queueStore = usePrintQueueStore.getState()
      const job = queueStore.dequeueForPrinter(printerId)

      if (!job) {
        // No ready job — but there may be jobs in retry back-off for this
        // printer. Schedule a wake-up so they get picked up when the back-off
        // expires. (Other printers' drains are unaffected.)
        const hasPendingForPrinter = queueStore.jobs.some(
          j => j.printerId === printerId && j.status === 'queued'
        )
        if (hasPendingForPrinter) {
          scheduleDrain(BACKOFF_WAKEUP_MS)
        }
        break
      }

      printerJobStartedAt.set(printerId, Date.now())

      const result = await processJob(job)

      if (result.manualRetryScheduled) {
        // The catch block arranged its own delayed retry (e.g. Star SDK
        // 3s back-off, which calls drainPrinter again). Exit this loop —
        // dequeueing the same job again would defeat the back-off.
        break
      }
    }
  } catch (err) {
    console.error(
      `[PrinterService] Unexpected error in drain loop for ${printerId}:`,
      err
    )
  } finally {
    processingPrinters.delete(printerId)
    printerJobStartedAt.delete(printerId)
    runIdleHousekeeping()
  }
}

// Retention work, run when a drain finishes rather than on a background timer:
// it costs nothing during a rush (the next enqueue re-enters the drain anyway)
// and guarantees a pass right after each burst, which is when there is
// something to reclaim. Both halves are self-throttling and never throw.
function runIdleHousekeeping (): void {
  if (processingPrinters.size > 0) return
  try {
    const pruned = usePrintQueueStore.getState().pruneJobs()
    if (pruned > 0) {
      console.log(`[PrinterService] Pruned ${pruned} retained print jobs`)
    }
  } catch (e) {
    console.warn('[PrinterService] Job prune failed:', e)
  }
  void sweepOrphanTempImages()
}

interface ProcessJobResult {
  manualRetryScheduled: boolean
}

async function processJob (job: PrintJob): Promise<ProcessJobResult> {
  const printer = usePrinterStore.getState().getPrinterById(job.printerId)
  let manualRetryScheduled = false

  try {
    if (!printer) {
      usePrintQueueStore
        .getState()
        .updateJobStatus(job.id, 'failed', 'Printer not found')
      return { manualRetryScheduled }
    }

    const driver = getDriver(printer)

    console.log(
      `[PrinterService] Processing job ${job.id}: printer=${
        printer.printerName
      }, type=${printer.printerType}, connected=${driver.isConnected()}`
    )

    // Initialize driver if not connected (Star SDK has built-in openTimeout)
    if (!driver.isConnected()) {
      await driver.initialize(printer)
      console.log(
        `[PrinterService] Driver initialized for ${printer.printerName}`
      )
      await usePrinterStore.getState().syncPrinterStatus(printer.id, {
        isConnected: true,
        lastStatus: 'connected'
      })
    }

    // Print based on payload type
    if (job.payloadType === 'document') {
      await driver.printDocument(job.document)
    } else {
      await driver.printRaw(job.data)
    }

    // Mark as completed
    usePrintQueueStore.getState().updateJobStatus(job.id, 'completed')

    // Update printer status
    await usePrinterStore.getState().syncPrinterStatus(printer.id, {
      lastPrintAt: new Date().toISOString(),
      lastStatus: 'ok',
      errorCount: 0
    })
  } catch (e: any) {
    const errorMsg = e?.message ?? 'Unknown print error'

    // Star SDK may still be initializing — auto-retry after delay
    if (errorMsg.includes('Star SDK not ready')) {
      console.warn('[PrinterService] Star SDK not ready, will retry in 3s')
      usePrintQueueStore.getState().updateJobStatus(job.id, 'queued')
      manualRetryScheduled = true
      setTimeout(() => {
        drainPrinter(job.printerId).catch(err =>
          console.error('[PrinterService] Star SDK retry error:', err)
        )
      }, 3000)
      return { manualRetryScheduled }
    }

    // Landi built-in printer error — force driver re-init so next retry reconnects fresh
    // Check both e.code (RN native error code) and e.message (human-readable string)
    if (
      printer?.printerType === 'builtin_landi' &&
      (/PRINT_FAILED|NOT_INITIALIZED|PRINTER_ERROR/i.test(e?.code ?? '') ||
        /print failed|not initialized|printer.*error|printer not ready/i.test(
          errorMsg
        ))
    ) {
      console.warn(
        '[PrinterService] Landi print error, forcing re-init on next attempt'
      )
      const landiDriver = getDriver(printer)
      try {
        await landiDriver.disconnect()
      } catch {}
    }

    console.error('[PrinterService] Print job failed:', errorMsg)

    usePrintQueueStore.getState().updateJobStatus(job.id, 'failed', errorMsg)

    // If receipt job failed due to unreachable printer, try to find an alternate connected printer
    if (
      job.jobType === 'receipt' &&
      /unreachable|device not found|connect|ETIMEDOUT|EHOSTUNREACH/i.test(
        errorMsg
      )
    ) {
      const { printers } = usePrinterStore.getState()
      const fallback = printers.find(
        p =>
          p.isActive &&
          p.isConnected &&
          p.id !== job.printerId &&
          (p.printerRole === 'receipt' || p.isDefaultReceipt)
      )
      if (fallback) {
        console.log(
          `[PrinterService] Falling back to ${fallback.printerName} for receipt job ${job.id}`
        )
        usePrintQueueStore.getState().reassignJob(job.id, fallback.id)
        // Job has moved to a different printer — kick a drain for that one
        // since this drainPrinter loop won't pick it up.
        scheduleDrain(0)
      }
    }

    // Attempt retry
    const retried = usePrintQueueStore.getState().retryJob(job.id)

    if (!retried) {
      console.error(
        `[PrinterService] Job ${job.id} exhausted retries, marking as failed`
      )

      const now = Date.now()
      if (now - lastFailureToastAt > FAILURE_TOAST_DEDUP_MS) {
        lastFailureToastAt = now
        const jobLabel =
          job.jobType === 'receipt'
            ? 'Receipt'
            : job.jobType === 'kitchen_ticket'
            ? 'Kitchen ticket'
            : job.jobType === 'void_ticket'
            ? 'Void ticket'
            : 'Print job'
        toastService.show({
          title: 'Print Failed',
          message: `${jobLabel} failed: ${errorMsg}`,
          type: 'error',
          duration: 6000
        })
      }
    }

    // Update printer error count + mark disconnected for connection errors
    if (printer) {
      const isConnectionError =
        /timed out|unreachable|device not found|connect|ETIMEDOUT|EHOSTUNREACH|used by another/i.test(
          errorMsg
        )
      await usePrinterStore.getState().syncPrinterStatus(printer.id, {
        isConnected: isConnectionError ? false : printer.isConnected,
        lastStatus: `error: ${errorMsg}`,
        errorCount: (printer.errorCount ?? 0) + 1
      })
    }
  }

  return { manualRetryScheduled }
}

// ============================================================================
// JOB CREATION HELPERS
// ============================================================================

function createJobForPrinter (
  printer: PrinterConfig,
  templateData: ReceiptTemplateData | KitchenTicketData,
  jobType: PrintJobType,
  priority: PrintJob['priority'],
  orderId: string | undefined,
  templateType: 'receipt' | 'kitchen'
): PrintJob {
  const usesRawPrint = printer.printerType === 'generic_escpos'

  if (usesRawPrint) {
    // ESC/POS printers get raw bytes
    const data =
      templateType === 'receipt'
        ? buildReceiptCommands(templateData as ReceiptTemplateData)
        : buildKitchenTicketCommands(templateData as KitchenTicketData)
    return createRawJob(printer.id, data, jobType, priority, orderId)
  }

  // Landi / Dejavoo get structured documents
  const doc =
    templateType === 'receipt'
      ? buildReceiptDocument(templateData as ReceiptTemplateData)
      : buildKitchenTicketDocument(templateData as KitchenTicketData)
  return createDocumentJob(printer.id, doc, jobType, priority, orderId)
}

function createRawJob (
  printerId: string,
  data: Uint8Array,
  jobType: PrintJobType,
  priority: PrintJob['priority'],
  orderId?: string
): RawPrintJob {
  return {
    id: `pj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    printerId,
    priority,
    status: 'queued',
    payloadType: 'raw',
    data,
    createdAt: Date.now(),
    attempts: 0,
    maxRetries: 3,
    orderId,
    jobType
  }
}

function createDocumentJob (
  printerId: string,
  doc: PrintDocument,
  jobType: PrintJobType,
  priority: PrintJob['priority'],
  orderId?: string
): DocumentPrintJob {
  return {
    id: `pj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    printerId,
    priority,
    status: 'queued',
    payloadType: 'document',
    document: doc,
    createdAt: Date.now(),
    attempts: 0,
    maxRetries: 3,
    orderId,
    jobType
  }
}

// ============================================================================
// TEMPLATE DATA BUILDERS
// ============================================================================

// Resolve which pricing a receipt should display when "match pricing to
// payment method" is enabled. 'dual' = keep the existing Card/Cash breakdown
// (toggle off, mixed/split tender, or unpaid). Uses the authoritative
// per-payment `isCashPriced` flag, falling back to the method name.
function resolveReceiptPricingMode (
  payments: OrderProfilePayment[]
): 'cash' | 'card' | 'dual' {
  const active = (payments ?? []).filter(p => !p.isVoided)
  if (active.length === 0) return 'dual'
  const usedCash = (p: OrderProfilePayment) =>
    p.isCashPriced ?? getPaymentMethodName(p.method) === 'Cash'
  if (active.every(usedCash)) return 'cash'
  if (active.every(p => !usedCash(p))) return 'card'
  return 'dual'
}

// Transform a single OrderProfilePayment into the receipt payment row. Shared
// by the combined-receipt path (maps every non-voided payment) and the
// per-portion split-receipt path (maps just the one scoped payment).
function mapPaymentToReceiptData (p: OrderProfilePayment): ReceiptPaymentData {
  const td = p.transactionDetails
  const dejavoo = td?.dejavooTransaction
  // Handle both nesting levels: local payments store full terminal response
  // ({ terminal_vendor, castles_transaction, raw_castles_response }),
  // backend-synced payments store just the inner castles_transaction object
  const castlesRaw = td?.castlesTransaction as Record<string, any> | undefined
  const castles = (castlesRaw?.castles_transaction ?? castlesRaw) as
    | Record<string, string>
    | undefined

  return {
    method: getPaymentMethodName(p.method),
    amount: p.amount,
    last4: p.last4 ?? td?.last4 ?? castles?.cardLast4,
    cardBrand:
      p.cardBrand ?? td?.cardType ?? dejavoo?.cardType ?? castles?.cardType,
    authCode:
      td?.authorizationCode ?? dejavoo?.authCode ?? castles?.approvalCode,
    rrn: td?.rrn ?? dejavoo?.rrn ?? castles?.rrn,
    entryMode: dejavoo?.entryMode ?? dejavoo?.entryType ?? castles?.entryMode,
    aid: castles?.cardAID ?? (td as Record<string, any>)?.cardAID,
    tipAmount: p.tip_amount || undefined,
    originalTipAmount:
      p.original_tip_amount != null && p.original_tip_amount !== p.tip_amount
        ? p.original_tip_amount
        : undefined,
    amountTendered: p.amountTendered ?? td?.amountTendered,
    changeGiven: p.changeGiven ?? td?.changeGiven
  }
}

// Fail-open receipt-integrity switch. When true, a reconcile mismatch throws and
// blocks the print (the ticket's original "fail-closed" ask). Default OFF: the
// derive-from-components fix makes footer == Σ(rows) by construction, so a hard
// block could only fire on a sub-cent rounding artifact or a finalized order whose
// already-charged total drifted — neither should strand a cashier at the pass.
// Flip only with a deliberate decision.
const RECEIPT_RECONCILE_HARD_FAIL = false
const RECONCILE_TOLERANCE = 0.01

export type ReceiptReconcileCode = 'line_vs_subtotal' | 'components_vs_total'

export interface ReceiptReconcileInput {
  /** Σ of the item line rows for this track (card or cash), before discount. */
  lineSum: number
  subtotal: number
  discount: number
  tax: number
  serviceCharge: number
  /** Footer TOTAL as it will print — tip-EXCLUSIVE. */
  total: number
  /** 'card' | 'cash' — context for logs/telemetry; not used in the math. */
  track: string
}

export interface ReceiptReconcileViolation {
  code: ReceiptReconcileCode
  track: string
  expected: number
  actual: number
  delta: number
}

/**
 * Pure check that a receipt's printed parts reconcile. Returns one entry per
 * violated invariant (empty = clean). Tip-EXCLUSIVE by design: the TOTAL row
 * never includes tip. Tolerance is one cent.
 *
 * C1 line_vs_subtotal   — Σ(line rows) + Discount == Subtotal (subtotal is GROSS).
 * C2 components_vs_total — Subtotal − Discount + Tax + Service Charge == TOTAL.
 * C2 is the invariant #S1-0003 violated (footer 48.85 vs rows 66.61).
 */
export function reconcileReceiptTotals (
  input: ReceiptReconcileInput
): ReceiptReconcileViolation[] {
  const violations: ReceiptReconcileViolation[] = []

  const subtotalExpected = round2(input.lineSum + input.discount)
  const subtotalDelta = Math.abs(subtotalExpected - input.subtotal)
  if (subtotalDelta > RECONCILE_TOLERANCE) {
    violations.push({
      code: 'line_vs_subtotal',
      track: input.track,
      expected: subtotalExpected,
      actual: round2(input.subtotal),
      delta: round2(subtotalDelta)
    })
  }

  const totalExpected = round2(
    input.subtotal - input.discount + input.tax + input.serviceCharge
  )
  const totalDelta = Math.abs(totalExpected - input.total)
  if (totalDelta > RECONCILE_TOLERANCE) {
    violations.push({
      code: 'components_vs_total',
      track: input.track,
      expected: totalExpected,
      actual: round2(input.total),
      delta: round2(totalDelta)
    })
  }

  return violations
}

export function buildReceiptTemplateData (
  order: OrderProfile,
  location: SelectedLocation,
  printer: PrinterConfig,
  options?: { scopeToPayment?: OrderProfilePayment }
): ReceiptTemplateData {
  const template = useReceiptTemplateStore
    .getState()
    .getReceiptTemplate(location.id)

  const nonVoidedItems = order.items.filter(item => !item.is_voided)

  // Use the single source of truth for order totals — same as the app's order summary.
  // This avoids fragile recomputation (e.g., weighted tax rate from item.taxRate which
  // can be 0 on backend-synced items from another station).
  const taxRatesMap = useStoreSettingsStore.getState().taxRatesMap

  // Service-charge inputs — mirrors useOrderTotals selector. Without these the
  // calculator returns service_charge=0 and the receipt SC row is suppressed.
  const serviceChargeRule = useServiceChargeRulesStore
    .getState()
    .resolveRule(location.id)
  const sessionPartySize = order.session_id
    ? (Object.values(
        useTableSessionStore.getState().sessions
      ).find((s) => s.id === order.session_id)?.party_size ?? null)
    : null
  const seatCount =
    useSeatingStore.getState().byOrderId[order.id]?.seatCount ?? null
  // Mirror useOrderTotals (stores/selectors/orderSelectors.ts): with no seat or
  // session signal, fall back to the order's own guest_count so the printed
  // service charge resolves the same party size the POS summary used — on every
  // surface (sidebar, table sheet, payment sheet, previous-orders reprint).
  const guestCountFallback =
    seatCount == null &&
    sessionPartySize == null &&
    !order.session_id &&
    typeof order.guest_count === 'number' &&
    order.guest_count > 0
      ? order.guest_count
      : null
  const partySize = seatCount ?? sessionPartySize ?? guestCountFallback ?? null

  // Inputs mirror useOrderTotals EXACTLY so the printed totals — the service
  // charge especially — resolve identically to the POS summary the cashier saw,
  // regardless of which surface triggered the print. In particular
  // serverConfirmedServiceCharge keeps SC when the live rule/party-size can't be
  // resolved (e.g. a reprint from Previous Orders), and manual/taxable mirror the
  // summary's manager-override handling.
  const orderTotals = calculateOrderTotals({
    items: order.items,
    checkDiscount: order.checkDiscount ?? null,
    taxRatesMap,
    payments: order.payments ?? [],
    preserveItemLevelOutstanding: order._reopenedForOrdering === true,
    serviceChargeRule,
    partySize,
    orderType: order.order_type ?? null,
    snapshottedRate: order.service_charge_rate ?? null,
    snapshottedAppliesOn: order.service_charge_applies_on ?? null,
    snapshottedName: order.service_charge_name ?? null,
    manualServiceCharge:
      order.service_charge_is_manual === true
        ? order.service_charge ?? 0
        : null,
    manualServiceChargeTaxable: order.service_charge_is_taxable ?? null,
    serverConfirmedServiceCharge:
      order.service_charge_is_manual !== true
        ? order.service_charge ?? null
        : null
  })

  // Calculator fallbacks — retained for the split-payment scope block, which
  // backs tax out of inclusive per-portion amounts via a blended rate. The
  // non-scope summary now prefers persisted totals (see reconciled block below).
  const subtotal = orderTotals.subtotal
  const cashSubtotal = orderTotals.cash_subtotal
  const tax = orderTotals.tax_amount
  const cashTax = orderTotals.cash_tax_amount
  const discount = orderTotals.discount_amount
  const tip =
    order.payments?.reduce((sum, p) => sum + (p.tip_amount || 0), 0) || 0

  // Map items. Accumulate the exact per-line totals the rows print so the
  // summary Subtotal reconciles to Σ(line rows) by construction — instead of
  // re-deriving from base+modifier prices (which understate when a synced item
  // lost its modifier price data). Also sum authoritative per-item tax.
  let sumCardLine = 0
  let sumCashLine = 0
  let sumItemCardTax = 0
  let sumItemCashTax = 0
  let sumItemCardDiscount = 0
  let sumItemCashDiscount = 0
  const items: ReceiptItemData[] = nonVoidedItems.map(item => {
    const modifiers: { name: string; price: number; isNo?: boolean }[] = []

    if (item.customizations?.size) {
      modifiers.push({
        name: `Size: ${item.customizations.size.name}`,
        price: 0
      })
    }

    item.customizations?.modifiers?.forEach(modGroup => {
      modGroup.options.forEach(opt => {
        modifiers.push({
          name: opt.name,
          price: opt.isNo ? 0 : opt.price ?? 0,
          isNo: opt.isNo
        })
      })
    })

    item.customizations?.addOns?.forEach(addon => {
      modifiers.push({ name: addon.name, price: addon.price ?? 0 })
    })

    // item.subtotal is authoritative when present (carries distributed
    // discounts), but can be 0/undefined after a partial backend sync —
    // which prints as $0.00 even though modifiers below render fine. Fall
    // back to helper × qty so the item line stays consistent.
    const fallbackCardLine =
      calculateItemEffectiveCardPrice(item) * (item.quantity || 1)
    const fallbackCashLine =
      calculateItemEffectiveCashPrice(item) * (item.quantity || 1)
    const cardLineTotal =
      Number.isFinite(item.subtotal) && item.subtotal > 0
        ? item.subtotal
        : fallbackCardLine
    const cashLineTotal =
      Number.isFinite(item.cashSubtotal) && item.cashSubtotal > 0
        ? item.cashSubtotal
        : fallbackCashLine

    sumCardLine += cardLineTotal
    sumCashLine += cashLineTotal
    sumItemCardTax += Number.isFinite(item.taxAmount) ? item.taxAmount : 0
    sumItemCashTax += Number.isFinite(item.cashTaxAmount) ? item.cashTaxAmount : 0
    sumItemCardDiscount += Number.isFinite(item.discount_amount)
      ? item.discount_amount ?? 0
      : 0
    sumItemCashDiscount += Number.isFinite(item.discount_cash_amount)
      ? item.discount_cash_amount ?? 0
      : 0

    // Un-itemized modifier upcharge: the part of the line total not explained by
    // the base price or the per-option prices already shown. When option prices
    // round-tripped intact this is ~0 (options print their own price inline);
    // when they were lost on a synced/reprinted order this recovers the upcharge
    // in aggregate so it never prints invisibly. Clamp ≥ 0.
    const qtyN = item.quantity || 1
    const baseCardLine = round2(
      (item.baseCardPrice ?? item.unitPrice ?? 0) * qtyN
    )
    const baseCashLine = round2(
      (item.baseCashPrice ?? item.baseCardPrice ?? item.unitPrice ?? 0) * qtyN
    )
    const shownOptTotal = round2(
      modifiers.reduce((s, m) => s + (m.price || 0), 0) * qtyN
    )
    const cardUpcharge = Math.max(
      0,
      round2(cardLineTotal - baseCardLine - shownOptTotal)
    )
    const cashUpcharge = Math.max(
      0,
      round2(cashLineTotal - baseCashLine - shownOptTotal)
    )

    return {
      name: item.is_open_item ? item.open_item_name || item.name : item.name,
      quantity: item.quantity,
      price: cardLineTotal,
      cashPrice: cashLineTotal !== cardLineTotal ? cashLineTotal : undefined,
      isVoided: item.is_voided ?? false,
      modifiers,
      modifiersUpcharge: cardUpcharge,
      cashModifiersUpcharge:
        cashUpcharge !== cardUpcharge ? cashUpcharge : undefined,
      notes: item.customizations?.notes,
      seatNumber: item.seatNumber ?? null
    }
  })

  // Map payments. When scoped to a single split portion, only that payment
  // appears in the payments section; otherwise map every non-voided payment.
  const scopePayment = options?.scopeToPayment
  const payments: ReceiptPaymentData[] = scopePayment
    ? [mapPaymentToReceiptData(scopePayment)]
    : (order.payments ?? [])
        .filter(p => !p.isVoided)
        .map(mapPaymentToReceiptData)

  // Format date/time
  const orderDate = order.opened_at ? new Date(order.opened_at) : new Date()
  const dateStr = orderDate.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric'
  })
  const timeStr = safeTimeString(orderDate)

  // Print timestamp
  const now = new Date()
  const printDateStr = now.toLocaleDateString('en-US', {
    month: '2-digit',
    day: '2-digit',
    year: 'numeric'
  })
  const printTimeStr = safeTimeString(now)

  // Build address
  const addressParts = [
    location.address_line1,
    location.address_line2,
    `${location.city}, ${location.state} ${location.postal_code}`
  ].filter(Boolean)

  // ── Match pricing to payment method (optional) ────────────────────────
  // Finalized printed receipts should reconcile to the pricing the guest
  // actually used. Split tenders and unpaid orders stay in dual mode because
  // there is no single charged pricing to display.
  const pricingMode = resolveReceiptPricingMode(
    scopePayment ? [scopePayment] : order.payments ?? []
  )

  // ── Reconciled display sources ────────────────────────────────────────
  // Prefer persisted order-level totals (set on close), else the summed
  // authoritative per-item values, else the calculator. Subtotal is rebuilt
  // GROSS (line-sum + discount) so the template's separate "-Discount" row
  // nets back to Σ(line rows). Tax is never re-derived as subtotal × rate.
  const isFinalized = !!order.closed_at || order.paid_status === 'Paid'
  const persisted = (v?: number | null): v is number =>
    Number.isFinite(v as number) && ((v as number) > 0 || isFinalized)

  // Discount: persisted order field first, else the summed per-item discounts
  // (recovers the value on reprints whose remap drops checkDiscount), else the
  // calculator. Subtotal is rebuilt as line-sum + this, so the template's
  // "-Discount" row always nets back to Σ(line rows) regardless of the source.
  const dispDiscountCard = persisted(order.total_discount)
    ? order.total_discount
    : sumItemCardDiscount > 0
    ? sumItemCardDiscount
    : discount
  const dispDiscountCash =
    sumItemCashDiscount > 0
      ? sumItemCashDiscount
      : orderTotals.cash_discount_amount

  const dispSubtotalCard = round2(sumCardLine + dispDiscountCard)
  const dispSubtotalCash = round2(sumCashLine + dispDiscountCash)

  const dispTaxCard = persisted(order.total_tax)
    ? order.total_tax
    : sumItemCardTax > 0
    ? sumItemCardTax
    : tax
  const dispTaxCash = sumItemCashTax > 0 ? sumItemCashTax : cashTax

  // On OPEN orders prefer the live-recomputed SC (tracks the current subtotal and
  // matches the POS summary). The persisted order.service_charge is applied via a
  // separate path and can lag when items are added after it was set — #S2-0001
  // printed 7.56 (18% of a stale $42 base) while the check was $70 / SC $12.60 on
  // the POS, and the card SC even disagreed with the cash SC (which already used the
  // live value). Trust the persisted value only when finalized (exact reprint), or
  // as a fallback when the live rule can't resolve (fresh 0) so a real SC never drops.
  const freshSCCard = orderTotals.service_charge
  const freshSCCash = orderTotals.cash_service_charge
  const dispSCCard =
    isFinalized && persisted(order.service_charge)
      ? order.service_charge
      : freshSCCard > 0
      ? freshSCCard
      : order.service_charge ?? 0
  const dispSCCash =
    isFinalized && persisted(order.service_charge)
      ? order.service_charge
      : freshSCCash > 0
      ? freshSCCash
      : order.service_charge ?? 0

  // Footer TOTAL = Σ(printed Subtotal − Discount + Tax + Service Charge), tip-EXCLUSIVE
  // (Tip prints as its own row; "Total w/ Tip" is a separate write-in). Deriving from
  // the same fresh components the summary rows use makes footer == Σ(rows) by
  // construction — killing the stale-scalar undercharge on OPEN orders, where
  // order.total_amount lags a just-added item (it is set from backend broadcasts and a
  // 120ms-debounced local recompute, so a print can race it; #S1-0003 undercharged
  // $17.76 this way). Trust the persisted scalar ONLY when finalized (closed/paid) for
  // exact reprints. Guard: if no line data was recovered (empty / partially-synced
  // items), fall back to persisted then the (tip-exclusive) calculator rather than
  // print a component-derived $0.
  const componentTotalCard = round2(
    dispSubtotalCard - dispDiscountCard + dispTaxCard + dispSCCard
  )
  const componentTotalCash = round2(
    dispSubtotalCash - dispDiscountCash + dispTaxCash + dispSCCash
  )
  const dispTotalCard =
    isFinalized && persisted(order.total_amount)
      ? order.total_amount
      : sumCardLine > 0
      ? componentTotalCard
      : persisted(order.total_amount)
      ? order.total_amount
      : round2(orderTotals.total_amount)
  const dispTotalCash =
    isFinalized && persisted(order.total_cash_amount)
      ? order.total_cash_amount
      : sumCashLine > 0
      ? componentTotalCash
      : persisted(order.total_cash_amount)
      ? order.total_cash_amount
      : round2(orderTotals.cash_total_amount)

  const dispRateCard =
    dispSubtotalCard > 0 ? (dispTaxCard / dispSubtotalCard) * 100 : 0

  let displayItems = items
  let displaySubtotal = dispSubtotalCard
  let displayTax = dispTaxCard
  let displayDiscount = dispDiscountCard
  let displayTotal = dispTotalCard
  let displayServiceCharge = dispSCCard
  let displayCashServiceCharge: number | undefined = dispSCCash
  let displayCashSubtotal =
    dispTotalCash !== dispTotalCard ? dispSubtotalCash : undefined
  let displayCashTax = dispTotalCash !== dispTotalCard ? dispTaxCash : undefined
  let displayCashTotal =
    dispTotalCash !== dispTotalCard ? dispTotalCash : undefined
  let displayTaxRate = dispRateCard

  if (pricingMode === 'card') {
    // Card pricing only — strip all cash data so the template shows one Total.
    displayItems = items.map(it => ({
      ...it,
      cashPrice: undefined,
      cashModifiersUpcharge: undefined
    }))
    displayCashSubtotal = undefined
    displayCashTax = undefined
    displayCashTotal = undefined
    displayCashServiceCharge = undefined
  } else if (pricingMode === 'cash') {
    // Cash pricing only — swap every card-priced field to its cash counterpart
    // so the line items + tax reconcile to the printed cash Total.
    displayItems = items.map(it => ({
      ...it,
      price: it.cashPrice ?? it.price,
      cashPrice: undefined,
      modifiersUpcharge: it.cashModifiersUpcharge ?? it.modifiersUpcharge,
      cashModifiersUpcharge: undefined
    }))
    displaySubtotal = dispSubtotalCash
    displayTax = dispTaxCash
    displayDiscount = dispDiscountCash
    displayTotal = dispTotalCash
    displayServiceCharge = dispSCCash
    displayCashSubtotal = undefined
    displayCashTax = undefined
    displayCashTotal = undefined
    displayCashServiceCharge = undefined
    displayTaxRate =
      dispSubtotalCash > 0 ? (dispTaxCash / dispSubtotalCash) * 100 : 0
  }

  let displayTip = tip
  let displayAmountPaid: number | undefined = order.amount_paid
  let displayAmountDue: number | undefined = order.amount_due
  let splitLabel: string | undefined
  let splitPayerName: string | undefined
  let isPartialSplitReceipt: boolean | undefined

  // ── Scope to a single split portion ───────────────────────────────────
  // Overrides totals + items so the receipt reflects only what this one payer
  // paid. Anchored on the captured `amount`/`tip_amount` so the printed block
  // always reconciles to the guest's charge, regardless of cash/card pricing.
  if (scopePayment) {
    const sp = scopePayment
    const spTip = sp.tip_amount || 0
    // `amount` is the charge for this portion — tax & service-charge inclusive,
    // already net of any discount. Total = that charge + tip.
    const spTotal = sp.amount + spTip

    const path = order.split_payment_path
    const isByItem = path === 'split-by-item' || path === 'pay-for-items'

    // Effective blended tax rate, used to back tax out of inclusive amounts.
    const effRate =
      pricingMode === 'cash'
        ? cashSubtotal > 0
          ? cashTax / cashSubtotal
          : 0
        : subtotal > 0
          ? tax / subtotal
          : 0

    let spGrossSubtotal: number
    let spDiscount: number
    let spTax: number
    let spServiceCharge: number

    if (isByItem) {
      // By-item / pay-for-items: we know exactly which items this payment
      // covered, and each order item carries its own net subtotal / tax /
      // discount. Compute the covered portion's breakdown directly so Subtotal,
      // Discount and Tax are exact, then attribute whatever the captured amount
      // has left over to this portion's share of the service charge (which
      // startSplitPaymentFlow distributes into the per-split amount as a
      // proportional remainder). Everything reconciles to the captured amount.
      const cartByKey = new Map<string, CartItem>()
      const dataByKey = new Map<string, ReceiptItemData>()
      nonVoidedItems.forEach((it, i) => {
        for (const key of [it.db_order_item_id, it.id]) {
          if (key && !cartByKey.has(key)) {
            cartByKey.set(key, it)
            dataByKey.set(key, items[i])
          }
        }
      })
      const coverage = sp.itemsCovered ?? []
      const isCash = pricingMode === 'cash'

      let grossSubtotal = 0
      let netSubtotal = 0
      let coveredTax = 0
      let coveredDiscount = 0

      displayItems = coverage.map(c => {
        const cart = cartByKey.get(c.itemId)
        const base = dataByKey.get(c.itemId)
        const qty = cart?.quantity || 0
        // Fraction of the order item this payment covered.
        const frac = qty > 0 ? Math.min(1, (c.quantity || 0) / qty) : 1
        const lineGross = c.subtotal || 0 // gross (= net + discount)
        const lineNet = cart
          ? (isCash ? cart.cashSubtotal ?? 0 : cart.subtotal ?? 0) * frac
          : lineGross
        const lineTax = cart
          ? (isCash ? cart.cashTaxAmount ?? 0 : cart.taxAmount ?? 0) * frac
          : lineGross * effRate
        const lineDiscount = cart
          ? (isCash
              ? cart.discount_cash_amount ?? 0
              : cart.discount_amount ?? 0) * frac
          : 0
        grossSubtotal += lineGross
        netSubtotal += lineNet
        coveredTax += lineTax
        coveredDiscount += lineDiscount
        return {
          name: base?.name ?? c.itemName,
          quantity: c.quantity,
          price: lineGross, // gross line price (pre-discount)
          cashPrice: undefined,
          isVoided: false,
          modifiers: base?.modifiers ?? [],
          notes: base?.notes,
          seatNumber: base?.seatNumber ?? null
        }
      })

      spGrossSubtotal = grossSubtotal
      spDiscount = coveredDiscount
      spTax = coveredTax
      // Remainder over net subtotal + tax = this portion's service-charge share
      // (only meaningful when the order actually carries a service charge;
      // otherwise it's sub-cent rounding and is left out of the breakdown).
      const orderHasSC =
        (isCash
          ? orderTotals.cash_service_charge
          : orderTotals.service_charge) > 0
      const residual = sp.amount - netSubtotal - coveredTax
      spServiceCharge = orderHasSC ? Math.max(0, residual) : 0
    } else {
      // Even / custom split: the amount is a share of the whole check, which
      // bundles discount, tax AND service charge. Prorate every order-level
      // figure by this portion's fraction so Subtotal / Discount / Tax / SC all
      // reconcile to the charged amount. Full check is shown above for reference.
      isPartialSplitReceipt = true
      const orderCharge =
        pricingMode === 'cash'
          ? orderTotals.cash_total_amount
          : orderTotals.total_amount
      const f = orderCharge > 0 ? sp.amount / orderCharge : 0
      spGrossSubtotal = (pricingMode === 'cash' ? cashSubtotal : subtotal) * f
      spDiscount =
        (pricingMode === 'cash' ? orderTotals.cash_discount_amount : discount) *
        f
      spTax = (pricingMode === 'cash' ? cashTax : tax) * f
      spServiceCharge =
        (pricingMode === 'cash'
          ? orderTotals.cash_service_charge
          : orderTotals.service_charge) * f
    }

    displaySubtotal = spGrossSubtotal
    displayTax = spTax
    displayDiscount = spDiscount
    displayTotal = spTotal
    displayTip = spTip
    displayServiceCharge = spServiceCharge
    // Per-portion receipts strip the order-level cash breakdown and balance.
    displayCashSubtotal = undefined
    displayCashTax = undefined
    displayCashTotal = undefined
    displayCashServiceCharge = undefined
    displayAmountPaid = spTotal
    displayAmountDue = undefined

    const nonVoidedPayments = (order.payments ?? []).filter(p => !p.isVoided)
    const spIndex = nonVoidedPayments.findIndex(p => p.id === sp.id)
    const portionIndex =
      sp.splitInfo?.portionIndex ?? (spIndex >= 0 ? spIndex + 1 : 1)
    const totalPortions =
      sp.splitInfo?.totalPortions ?? nonVoidedPayments.length ?? 1

    if (path === 'pay-for-items') {
      // Pay-for-items is sequential partial item payment, not a planned N-way
      // split — "Split 1 of 1" reads oddly. Label it by what it is, and number
      // it only when the order had more than one such payment.
      splitLabel =
        totalPortions > 1 ? `Items Paid #${portionIndex}` : 'Items Paid'
      // Suppress the generic "Selected Items" placeholder payer name — it's
      // redundant under the "Items Paid" header.
      const payer = sp.transactionDetails?.splitLabel
      splitPayerName = payer && payer !== 'Selected Items' ? payer : undefined
    } else {
      splitLabel = `Split ${portionIndex} of ${totalPortions}`
      splitPayerName = sp.transactionDetails?.splitLabel
    }
  }

  // ── Online / delivery-platform receipt (bag-label header) ─────────────
  // Delivery-app orders print a clean bag label: big platform + customer +
  // short pickup code, and no tip write-in (the platform already collected).
  const isOnlineOrder =
    order._isOnlineOrder === true || isOnlineOrderSource(order.order_source)
  const onlinePlatformLabel = isOnlineOrder
    ? resolveOrderPlatformLogo({
        deliveryPlatform: order.delivery_platform,
        orderSource: order.order_source
      }).label
    : null
  const receiptPlatformShortCode = isOnlineOrder
    ? onlineOrderShortCode(order)
    : null

  // ── Fail-open integrity guard ─────────────────────────────────────────
  // Validate the card computation (and the cash breakdown when it differs)
  // reconciles: footer TOTAL == Σ(rows). Post-fix this holds by construction
  // for open orders, so a hit means either a finalized order whose persisted
  // total drifted from its own rows (worth a cashier's eyes) or a regression
  // (telemetry). Never blocks a print unless RECEIPT_RECONCILE_HARD_FAIL. Split
  // receipts derive a per-portion total downstream, so skip the scope path.
  if (!scopePayment) {
    const violations = reconcileReceiptTotals({
      lineSum: sumCardLine,
      subtotal: dispSubtotalCard,
      discount: dispDiscountCard,
      tax: dispTaxCard,
      serviceCharge: dispSCCard,
      total: dispTotalCard,
      track: 'card'
    })
    if (dispTotalCash !== dispTotalCard) {
      violations.push(
        ...reconcileReceiptTotals({
          lineSum: sumCashLine,
          subtotal: dispSubtotalCash,
          discount: dispDiscountCash,
          tax: dispTaxCash,
          serviceCharge: dispSCCash,
          total: dispTotalCash,
          track: 'cash'
        })
      )
    }
    if (violations.length > 0) {
      recordCount(KEY_RECEIPT_RECONCILE_MISMATCH, violations.length)
      const orderRef = order.display_number || order.order_number || order.id
      console.warn(
        '[PrinterService] receipt totals failed to reconcile — printing anyway',
        { order: orderRef, isFinalized, violations }
      )
      // A finalized order whose already-charged total drifted from its rows is
      // the one case worth surfacing (money already moved; verify the check).
      if (isFinalized) {
        toastService.show({
          type: 'warning',
          title: 'Receipt totals need a check',
          message: `Order ${orderRef}: printed total doesn't match its saved breakdown. Printed anyway — please verify.`
        })
      }
      if (RECEIPT_RECONCILE_HARD_FAIL) {
        throw new Error(
          `Receipt reconcile mismatch for ${orderRef}: ${JSON.stringify(
            violations
          )}`
        )
      }
    }
  }

  return {
    storeName: location.name,
    storeAddress: addressParts.join(', '),
    storePhone: location.phone,
    orderNumber:
      order.display_number || order.order_number || `#${order.id.slice(-4)}`,
    orderDate: dateStr,
    orderTime: timeStr,
    orderType: getOrderTypeDisplay(order.order_type),
    tableName: resolvePrintableTableName(order),
    customerName: order.customer_name,
    customerPhone: order.customer_phone ?? undefined,
    serverName: order.server_name,
    backendOrderNumber: order.order_number ?? undefined,
    items: displayItems,
    subtotal: displaySubtotal,
    tax: displayTax,
    discount: displayDiscount,
    tip: displayTip,
    total: displayTotal,
    pricingMode,
    cashSubtotal: displayCashSubtotal,
    cashTax: displayCashTax,
    cashTotal: displayCashTotal,
    serviceCharge: displayServiceCharge,
    cashServiceCharge: displayCashServiceCharge,
    serviceChargeName: orderTotals.service_charge_name || undefined,
    payments,
    amountPaid: displayAmountPaid,
    amountDue: displayAmountDue,
    footerMessage:
      template.footerText ??
      printer.receiptFooter ??
      'Thank you for your purchase!',
    headerMessage: template.headerText ?? undefined,
    maxCharsPerLine: printer.graphicsOnly
      ? // ? Math.min(printer.maxCharsPerLine, 32)
        48
      : printer.maxCharsPerLine,
    taxRate: displayTaxRate / 100, // Convert from 8.875 to 0.08875
    templateConfig: template,
    logoBase64: template.showLogo
      ? useReceiptTemplateStore.getState().cachedLogoBase64 ?? undefined
      : undefined,
    printDate: printDateStr,
    printTime: printTimeStr,
    splitLabel,
    splitPayerName,
    isPartialSplitReceipt,
    isOnlineOrder,
    onlinePlatformLabel,
    platformShortCode: receiptPlatformShortCode
  }
}

function buildKitchenTicketData (
  order: OrderProfile,
  items: CartItem[],
  printer: PrinterConfig,
  isVoidTicket: boolean,
  location?: SelectedLocation,
  printModifiers: boolean = true
): KitchenTicketData {
  const template = location
    ? useReceiptTemplateStore.getState().getKitchenTemplate(location.id)
    : { ...DEFAULT_RECEIPT_TEMPLATE, templateType: 'kitchen' }

  const now = new Date()
  const timestamp = safeTimeString(now)
  const fullTimestamp =
    now.toLocaleDateString('en-US', {
      month: '2-digit',
      day: '2-digit',
      year: 'numeric'
    }) +
    ' ' +
    timestamp

  const kitchenItems: KitchenTicketItemData[] = items.map(item => {
    const modifiers: string[] = []

    if (printModifiers) {
      if (item.customizations?.size) {
        modifiers.push(`Size: ${item.customizations.size.name}`)
      }

      item.customizations?.modifiers?.forEach(modGroup => {
        modGroup.options.forEach(opt => {
          modifiers.push(opt.isNo ? `NO ${opt.name}` : opt.name)
        })
      })

      item.customizations?.addOns?.forEach(addon => {
        modifiers.push(addon.name)
      })
    }

    // Extract allergy info from notes if present
    const notes = item.customizations?.notes
    let allergyAlert: string | undefined
    if (notes && /allergy/i.test(notes)) {
      allergyAlert = notes
    }

    return {
      name: item.is_open_item ? item.open_item_name || item.name : item.name,
      quantity: item.quantity,
      modifiers,
      notes,
      isVoided: item.is_voided,
      station: item.category_name,
      allergyAlert,
      seatNumber:
        item.seatNumber ??
        useSeatingStore
          .getState()
          .getItemSeat(order.id, item.id, item.db_order_item_id) ??
        null,
      courseNumber: item.courseNumber
    }
  })

  const totalItemCount = items.reduce((sum, item) => sum + item.quantity, 0)

  // Calculate ready-by time (current time + 15 minutes)
  const readyBy = new Date(now.getTime() + 15 * 60 * 1000)
  const readyByTime = safeTimeString(readyBy)

  return {
    orderNumber:
      order.display_number || order.order_number || `#${order.id.slice(-4)}`,
    orderType: getOrderTypeDisplay(order.order_type),
    tableName: resolvePrintableTableName(order),
    serverName: order.server_name,
    timestamp,
    fullTimestamp,
    totalItemCount,
    items: kitchenItems,
    isVoidTicket,
    maxCharsPerLine: printer.graphicsOnly
      ? Math.min(printer.maxCharsPerLine, 32)
      : printer.maxCharsPerLine,
    templateConfig: template,
    readyByTime
  }
}

function resolvePrintableTableName (order: OrderProfile): string | undefined {
  const uuidLike =
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  const explicitName = order.service_location_name?.trim()
  if (explicitName && !uuidLike.test(explicitName)) return explicitName

  const tableId = order.service_location_id?.trim()
  if (tableId) {
    const tableName = useFloorPlanStore.getState().tablesById[tableId]?.name
    if (tableName) return tableName
  }

  if (explicitName) {
    const tableName = useFloorPlanStore.getState().tablesById[explicitName]?.name
    if (tableName) return tableName
  }

  return (
    resolveTableDisplayName(
      order.service_location_name,
      order.service_location_id
    ) ?? undefined
  )
}

const getOrderTypeDisplay = (orderType: string | undefined): string =>
  displayOrderType(orderType ?? null)

function getPaymentMethodName (method: string | undefined): string {
  if (!method) return 'Cash'
  const methods: Record<string, string> = {
    Cash: 'Cash',
    card: 'Card',
    'Credit Card': 'Card',
    'Debit Card': 'Card',
    gift_card: 'Gift Card',
    GiftCard: 'Gift Card',
    house_account: 'House Account',
    // Non-tender settlement. Mapped explicitly so the receipt reads
    // the spec label rather than the raw "InKind"/"inkind" the fallback below
    // would print (it only replaces underscores).
    InKind: INKIND_LABEL,
    inkind: INKIND_LABEL
  }
  return methods[method] || method.replace('_', ' ')
}
