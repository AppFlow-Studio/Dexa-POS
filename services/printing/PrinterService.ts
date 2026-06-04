import {
  calculateItemEffectiveCardPrice,
  calculateItemEffectiveCashPrice,
  calculateOrderTotals
} from '@/lib/order-calculator'
import { toastService } from '@/lib/toastService'
import { CartItem, OrderProfile } from '@/lib/types'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
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

export const PrinterService = {
  /**
   * Print a receipt for a completed order.
   */
  async printReceipt (
    order: OrderProfile,
    location: SelectedLocation
  ): Promise<boolean> {
    const printer = getReceiptPrinter(location.id)
    if (!printer) {
      console.warn('[PrinterService] No receipt printer configured')
      return false
    }

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
  }
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

function buildReceiptTemplateData (
  order: OrderProfile,
  location: SelectedLocation,
  printer: PrinterConfig
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
  const partySize = seatCount ?? sessionPartySize ?? null

  const orderTotals = calculateOrderTotals({
    items: order.items,
    checkDiscount: order.checkDiscount ?? null,
    taxRatesMap,
    payments: order.payments ?? [],
    serviceChargeRule,
    partySize,
    orderType: order.order_type ?? null,
    snapshottedRate: order.service_charge_rate ?? null,
    snapshottedAppliesOn: order.service_charge_applies_on ?? null,
    snapshottedName: order.service_charge_name ?? null,
    manualServiceCharge: order.service_charge_is_manual
      ? order.service_charge
      : undefined
  })

  const subtotal = orderTotals.subtotal
  const cashSubtotal = orderTotals.cash_subtotal
  const tax = orderTotals.tax_amount
  const cashTax = orderTotals.cash_tax_amount
  const discount = orderTotals.discount_amount
  const tip =
    order.payments?.reduce((sum, p) => sum + (p.tip_amount || 0), 0) || 0
  const total = order.total_amount || orderTotals.total_amount + tip
  const cashTotal = orderTotals.cash_total_amount + tip
  const weightedTaxRate = subtotal > 0 ? (tax / subtotal) * 100 : 0

  // Map items
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

    return {
      name: item.is_open_item ? item.open_item_name || item.name : item.name,
      quantity: item.quantity,
      price: cardLineTotal,
      cashPrice: cashLineTotal !== cardLineTotal ? cashLineTotal : undefined,
      isVoided: item.is_voided ?? false,
      modifiers,
      notes: item.customizations?.notes,
      seatNumber: item.seatNumber ?? null
    }
  })

  // Map payments
  const payments: ReceiptPaymentData[] = (order.payments ?? [])
    .filter(p => !p.isVoided)
    .map(p => {
      const td = p.transactionDetails
      const dejavoo = td?.dejavooTransaction
      // Handle both nesting levels: local payments store full terminal response
      // ({ terminal_vendor, castles_transaction, raw_castles_response }),
      // backend-synced payments store just the inner castles_transaction object
      const castlesRaw = td?.castlesTransaction as
        | Record<string, any>
        | undefined
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
        entryMode:
          dejavoo?.entryMode ?? dejavoo?.entryType ?? castles?.entryMode,
        aid: castles?.cardAID ?? (td as Record<string, any>)?.cardAID,
        tipAmount: p.tip_amount || undefined,
        originalTipAmount:
          p.original_tip_amount != null &&
          p.original_tip_amount !== p.tip_amount
            ? p.original_tip_amount
            : undefined,
        amountTendered: p.amountTendered ?? td?.amountTendered,
        changeGiven: p.changeGiven ?? td?.changeGiven
      }
    })

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
    serverName: order.server_name,
    backendOrderNumber: order.order_number ?? undefined,
    items,
    subtotal,
    tax,
    discount,
    tip,
    total,
    cashSubtotal: cashTotal !== total ? cashSubtotal : undefined,
    cashTax: cashTotal !== total ? cashTax : undefined,
    cashTotal: cashTotal !== total ? cashTotal : undefined,
    serviceCharge: orderTotals.service_charge,
    cashServiceCharge: orderTotals.cash_service_charge,
    serviceChargeName: orderTotals.service_charge_name || undefined,
    payments,
    amountPaid: order.amount_paid,
    amountDue: order.amount_due,
    footerMessage:
      template.footerText ??
      printer.receiptFooter ??
      'Thank you for your purchase!',
    headerMessage: template.headerText ?? undefined,
    maxCharsPerLine: printer.graphicsOnly
      ? // ? Math.min(printer.maxCharsPerLine, 32)
        48
      : printer.maxCharsPerLine,
    taxRate: weightedTaxRate / 100, // Convert from 8.875 to 0.08875
    templateConfig: template,
    logoBase64: template.showLogo
      ? useReceiptTemplateStore.getState().cachedLogoBase64 ?? undefined
      : undefined,
    printDate: printDateStr,
    printTime: printTimeStr
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
    house_account: 'House Account'
  }
  return methods[method] || method.replace('_', ' ')
}
