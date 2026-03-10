import { CartItem, OrderProfile } from "@/lib/types";
import {
  calculateItemEffectiveCardPrice,
  calculateItemEffectiveCashPrice,
} from "@/lib/order-calculator";
import { PrintDocument } from "@/types/print-document";
import { usePrintQueueStore } from "@/stores/usePrintQueueStore";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { useReceiptTemplateStore } from "@/stores/useReceiptTemplateStore";
import { DEFAULT_RECEIPT_TEMPLATE } from "@/types/receipt-template";
import { SelectedLocation } from "@/stores/useStoreSettingsStore";
import {
  DocumentPrintJob,
  KitchenTicketData,
  KitchenTicketItemData,
  PrintJob,
  PrintJobType,
  PrinterConfig,
  RawPrintJob,
  ReceiptItemData,
  ReceiptPaymentData,
  ReceiptTemplateData,
} from "@/types/printer";
import { toastService } from "@/lib/toastService";
import { getDriver } from "./DriverFactory";
import { getReceiptPrinter, routeKitchenItems } from "./PrintRouter";
import { buildReceiptCommands } from "./templates/ReceiptTemplate";
import { buildKitchenTicketCommands } from "./templates/KitchenTicketTemplate";
import { buildReceiptDocument } from "./templates/ReceiptDocumentTemplate";
import { buildKitchenTicketDocument } from "./templates/KitchenTicketDocumentTemplate";

let processingInterval: ReturnType<typeof setInterval> | null = null;
let isProcessing = false;
let lastFailureToastAt = 0;

const PROCESS_INTERVAL_MS = 500;
const FAILURE_TOAST_DEDUP_MS = 30_000;

// ============================================================================
// PUBLIC API
// ============================================================================

export const PrinterService = {
  /**
   * Print a receipt for a completed order.
   */
  async printReceipt(
    order: OrderProfile,
    location: SelectedLocation,
  ): Promise<boolean> {
    const printer = getReceiptPrinter(location.id);
    if (!printer) {
      console.warn("[PrinterService] No receipt printer configured");
      return false;
    }

    const templateData = buildReceiptTemplateData(order, location, printer);
    const job = createJobForPrinter(
      printer,
      templateData,
      "receipt",
      "normal",
      order.id,
      "receipt",
    );
    usePrintQueueStore.getState().enqueue(job);
    return true;
  },

  /**
   * Print kitchen tickets for items, routed by category.
   */
  async printKitchenTickets(
    order: OrderProfile,
    items: CartItem[],
    location: SelectedLocation,
  ): Promise<boolean> {
    const routedItems = routeKitchenItems(items, location.id);

    if (routedItems.size === 0) {
      console.warn("[PrinterService] No kitchen printers configured");
      return false;
    }

    for (const [printerId, printerItems] of routedItems) {
      const printer = usePrinterStore.getState().getPrinterById(printerId);
      if (!printer) continue;

      const ticketData = buildKitchenTicketData(
        order,
        printerItems,
        printer,
        false,
        location,
      );
      const job = createJobForPrinter(
        printer,
        ticketData,
        "kitchen_ticket",
        "high",
        order.id,
        "kitchen",
      );
      usePrintQueueStore.getState().enqueue(job);
    }

    return true;
  },

  /**
   * Print void tickets for voided items.
   */
  async printVoidTicket(
    order: OrderProfile,
    voidedItems: CartItem[],
    location: SelectedLocation,
  ): Promise<boolean> {
    const routedItems = routeKitchenItems(voidedItems, location.id);

    if (routedItems.size === 0) {
      return false;
    }

    for (const [printerId, printerItems] of routedItems) {
      const printer = usePrinterStore.getState().getPrinterById(printerId);
      if (!printer) continue;

      const ticketData = buildKitchenTicketData(
        order,
        printerItems,
        printer,
        true,
        location,
      );
      const job = createJobForPrinter(
        printer,
        ticketData,
        "void_ticket",
        "high",
        order.id,
        "kitchen",
      );
      usePrintQueueStore.getState().enqueue(job);
    }

    return true;
  },

  /**
   * Open the cash drawer on the default receipt printer.
   */
  async openCashDrawer(): Promise<boolean> {
    const { printers } = usePrinterStore.getState();
    const printer = printers.find(
      (p) => p.isActive && p.supportsCashDrawerKick,
    );

    if (!printer) {
      console.warn("[PrinterService] No printer with cash drawer support");
      return false;
    }

    try {
      const driver = getDriver(printer);
      if (!driver.isConnected()) {
        await driver.initialize(printer);
      }
      await driver.openCashDrawer();
      return true;
    } catch (e) {
      console.error("[PrinterService] Cash drawer failed:", e);
      return false;
    }
  },

  /**
   * Print a test page on the specified printer (or default receipt printer).
   */
  async printTestPage(targetPrinter?: PrinterConfig): Promise<boolean> {
    const printer =
      targetPrinter ??
      usePrinterStore
        .getState()
        .printers.find((p) => p.isActive && p.printerRole === "receipt");

    if (!printer) {
      console.warn("[PrinterService] No receipt printer for test page");
      return false;
    }

    const w = printer.maxCharsPerLine;
    const timestamp = new Date().toLocaleString("en-US");

    // Build test page as PrintDocument (works for all drivers)
    const doc: PrintDocument = {
      nodes: [
        {
          type: "text_line",
          content: "Dexa POS",
          align: "center",
          format: { bold: true, doubleHeight: true, doubleWidth: true },
        },
        { type: "text_line", content: "Printer Test", align: "center" },
        { type: "divider", style: "double", lineWidth: w },
        { type: "two_column", left: "Status:", right: "OK", lineWidth: w },
        { type: "two_column", left: "Time:", right: timestamp, lineWidth: w },
        {
          type: "two_column",
          left: "Printer:",
          right: printer.printerName,
          lineWidth: w,
        },
        {
          type: "two_column",
          left: "Paper:",
          right: `${printer.paperWidth}mm`,
          lineWidth: w,
        },
        {
          type: "two_column",
          left: "Driver:",
          right: printer.printerType,
          lineWidth: w,
        },
        { type: "divider", style: "double", lineWidth: w },
        { type: "text_line", content: "Test Complete", align: "center" },
        { type: "cut" },
      ],
      maxCharsPerLine: w,
    };

    const job = createDocumentJob(printer.id, doc, "test_page", "normal");
    usePrintQueueStore.getState().enqueue(job);
    return true;
  },

  /**
   * Print a sample receipt on the specified printer.
   */
  async printTestReceipt(targetPrinter: PrinterConfig): Promise<boolean> {
    const now = new Date();
    const dateStr = now.toLocaleDateString("en-US", {
      month: "2-digit",
      day: "2-digit",
      year: "numeric",
    });
    const timeStr = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const sampleData: ReceiptTemplateData = {
      storeName: "Dexa POS — Sample Store",
      storeAddress: "123 Main St, Suite 100, Anytown, ST 12345",
      storePhone: "(555) 123-4567",
      orderNumber: "#TEST-001",
      orderDate: dateStr,
      orderTime: timeStr,
      orderType: "Dine In",
      tableName: "Table 5",
      serverName: "Test Server",
      items: [
        { name: "Classic Burger", quantity: 2, price: 12.99, isVoided: false, modifiers: [{ name: "No Onions", price: 0 }] },
        { name: "Caesar Salad", quantity: 1, price: 8.50, isVoided: false, modifiers: [] },
        { name: "Iced Tea", quantity: 3, price: 3.25, isVoided: false, modifiers: [{ name: "Extra Lemon", price: 0 }] },
      ],
      subtotal: 44.23,
      tax: 3.54,
      discount: 0,
      tip: 6.00,
      total: 53.77,
      payments: [{ method: "Card", amount: 53.77, last4: "4242" }],
      footerMessage: "** TEST RECEIPT — NOT A REAL TRANSACTION **",
      maxCharsPerLine: targetPrinter.maxCharsPerLine,
      taxRate: 0.08,
    };

    const job = createJobForPrinter(
      targetPrinter,
      sampleData,
      "test_page",
      "normal",
      undefined,
      "receipt",
    );
    usePrintQueueStore.getState().enqueue(job);
    return true;
  },

  /**
   * Print a sample kitchen ticket on the specified printer.
   */
  async printTestKitchenTicket(targetPrinter: PrinterConfig): Promise<boolean> {
    const now = new Date();
    const timestamp = now.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
    const fullTimestamp =
      now.toLocaleDateString("en-US", {
        month: "2-digit",
        day: "2-digit",
        year: "numeric",
      }) + " " + timestamp;

    const readyBy = new Date(now.getTime() + 15 * 60 * 1000);
    const readyByTime = readyBy.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });

    const sampleData: KitchenTicketData = {
      orderNumber: "#TEST-001",
      orderType: "Dine In",
      tableName: "Table 5",
      serverName: "Test Server",
      timestamp,
      fullTimestamp,
      readyByTime,
      totalItemCount: 4,
      items: [
        { name: "Classic Burger", quantity: 2, modifiers: ["No Onions", "Well Done"], notes: "Allergy: gluten-free bun", station: "Grill", allergyAlert: "Allergy: gluten-free bun" },
        { name: "Caesar Salad", quantity: 1, modifiers: ["Extra Dressing"], station: "Cold Prep" },
        { name: "Fish & Chips", quantity: 1, modifiers: ["Tartar Sauce on Side"], station: "Grill" },
      ],
      isVoidTicket: false,
      maxCharsPerLine: targetPrinter.maxCharsPerLine,
    };

    const job = createJobForPrinter(
      targetPrinter,
      sampleData,
      "test_page",
      "normal",
      undefined,
      "kitchen",
    );
    usePrintQueueStore.getState().enqueue(job);
    return true;
  },

  /**
   * Start the background print queue processing loop.
   */
  startProcessing(): void {
    if (processingInterval) return;

    console.log("[PrinterService] Starting print queue processing");
    processingInterval = setInterval(processNextJob, PROCESS_INTERVAL_MS);
  },

  /**
   * Stop the background print queue processing loop.
   */
  stopProcessing(): void {
    if (processingInterval) {
      clearInterval(processingInterval);
      processingInterval = null;
      console.log("[PrinterService] Stopped print queue processing");
    }
  },
};

// ============================================================================
// QUEUE PROCESSOR
// ============================================================================

async function processNextJob(): Promise<void> {
  if (isProcessing) return;

  const job = usePrintQueueStore.getState().dequeue();
  if (!job) return;

  isProcessing = true;

  try {
    const printer = usePrinterStore.getState().getPrinterById(job.printerId);
    if (!printer) {
      usePrintQueueStore
        .getState()
        .updateJobStatus(job.id, "failed", "Printer not found");
      return;
    }

    const driver = getDriver(printer);

    // Initialize driver if not connected
    if (!driver.isConnected()) {
      await driver.initialize(printer);
      await usePrinterStore.getState().syncPrinterStatus(printer.id, {
        isConnected: true,
        lastStatus: "connected",
      });
    }

    // Print based on payload type
    if (job.payloadType === "document") {
      await driver.printDocument(job.document);
    } else {
      await driver.printRaw(job.data);
    }

    // Mark as completed
    usePrintQueueStore.getState().updateJobStatus(job.id, "completed");

    // Update printer status
    await usePrinterStore.getState().syncPrinterStatus(printer.id, {
      lastPrintAt: new Date().toISOString(),
      lastStatus: "ok",
      errorCount: 0,
    });
  } catch (e: any) {
    const errorMsg = e?.message ?? "Unknown print error";
    console.error("[PrinterService] Print job failed:", errorMsg);

    usePrintQueueStore.getState().updateJobStatus(job.id, "failed", errorMsg);

    // Attempt retry
    const retried = usePrintQueueStore.getState().retryJob(job.id);

    if (!retried) {
      console.error(
        `[PrinterService] Job ${job.id} exhausted retries, marking as failed`,
      );

      const now = Date.now();
      if (now - lastFailureToastAt > FAILURE_TOAST_DEDUP_MS) {
        lastFailureToastAt = now;
        const jobLabel =
          job.jobType === "receipt" ? "Receipt" :
          job.jobType === "kitchen_ticket" ? "Kitchen ticket" :
          job.jobType === "void_ticket" ? "Void ticket" : "Print job";
        toastService.show({
          title: "Print Failed",
          message: `${jobLabel} could not be printed. Check printer connection.`,
          type: "error",
          duration: 6000,
        });
      }
    }

    // Update printer error count
    const printer = usePrinterStore.getState().getPrinterById(job.printerId);
    if (printer) {
      await usePrinterStore.getState().syncPrinterStatus(printer.id, {
        lastStatus: `error: ${errorMsg}`,
        errorCount: (printer.errorCount ?? 0) + 1,
      });
    }
  } finally {
    isProcessing = false;
  }
}

// ============================================================================
// JOB CREATION HELPERS
// ============================================================================

function createJobForPrinter(
  printer: PrinterConfig,
  templateData: ReceiptTemplateData | KitchenTicketData,
  jobType: PrintJobType,
  priority: PrintJob["priority"],
  orderId: string | undefined,
  templateType: "receipt" | "kitchen",
): PrintJob {
  const usesRawPrint = printer.printerType === "generic_escpos";

  if (usesRawPrint) {
    // ESC/POS printers get raw bytes
    const data =
      templateType === "receipt"
        ? buildReceiptCommands(templateData as ReceiptTemplateData)
        : buildKitchenTicketCommands(templateData as KitchenTicketData);
    return createRawJob(printer.id, data, jobType, priority, orderId);
  }

  // Landi / Dejavoo get structured documents
  const doc =
    templateType === "receipt"
      ? buildReceiptDocument(templateData as ReceiptTemplateData)
      : buildKitchenTicketDocument(templateData as KitchenTicketData);
  return createDocumentJob(printer.id, doc, jobType, priority, orderId);
}

function createRawJob(
  printerId: string,
  data: Uint8Array,
  jobType: PrintJobType,
  priority: PrintJob["priority"],
  orderId?: string,
): RawPrintJob {
  return {
    id: `pj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    printerId,
    priority,
    status: "queued",
    payloadType: "raw",
    data,
    createdAt: Date.now(),
    attempts: 0,
    maxRetries: 3,
    orderId,
    jobType,
  };
}

function createDocumentJob(
  printerId: string,
  doc: PrintDocument,
  jobType: PrintJobType,
  priority: PrintJob["priority"],
  orderId?: string,
): DocumentPrintJob {
  return {
    id: `pj_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    printerId,
    priority,
    status: "queued",
    payloadType: "document",
    document: doc,
    createdAt: Date.now(),
    attempts: 0,
    maxRetries: 3,
    orderId,
    jobType,
  };
}

// ============================================================================
// TEMPLATE DATA BUILDERS
// ============================================================================

function buildReceiptTemplateData(
  order: OrderProfile,
  location: SelectedLocation,
  printer: PrinterConfig,
): ReceiptTemplateData {
  const template = useReceiptTemplateStore
    .getState()
    .getReceiptTemplate(location.id);

  const nonVoidedItems = order.items.filter((item) => !item.is_voided);

  // Calculate totals (mirrors ReceiptModal.tsx logic)
  const subtotal = nonVoidedItems.reduce(
    (sum, item) => sum + calculateItemEffectiveCardPrice(item),
    0,
  );
  const cashSubtotal = nonVoidedItems.reduce(
    (sum, item) => sum + calculateItemEffectiveCashPrice(item),
    0,
  );

  const tax =
    order.total_tax ??
    nonVoidedItems.reduce((sum, item) => sum + (item.taxAmount || 0), 0);

  let cashTax = 0;
  if (subtotal > 0 && tax > 0) {
    const effectiveTaxRate = tax / subtotal;
    cashTax = cashSubtotal * effectiveTaxRate;
  }

  const discount = order.total_discount || 0;
  const tip =
    order.payments?.reduce((sum, p) => sum + (p.tip_amount || 0), 0) || 0;
  const total = order.total_amount || subtotal + tax - discount + tip;
  const cashTotal = cashSubtotal + cashTax - discount + tip;

  // Map items
  const items: ReceiptItemData[] = nonVoidedItems.map((item) => {
    const modifiers: { name: string; price: number }[] = [];

    if (item.customizations?.size) {
      modifiers.push({
        name: `Size: ${item.customizations.size.name}`,
        price: 0,
      });
    }

    item.customizations?.modifiers?.forEach((modGroup) => {
      modGroup.options.forEach((opt) => {
        modifiers.push({ name: opt.name, price: opt.price ?? 0 });
      });
    });

    item.customizations?.addOns?.forEach((addon) => {
      modifiers.push({ name: addon.name, price: addon.price ?? 0 });
    });

    return {
      name: item.is_open_item
        ? item.open_item_name || item.name
        : item.name,
      quantity: item.quantity,
      price: calculateItemEffectiveCardPrice(item),
      cashPrice:
        calculateItemEffectiveCashPrice(item) !==
        calculateItemEffectiveCardPrice(item)
          ? calculateItemEffectiveCashPrice(item)
          : undefined,
      isVoided: item.is_voided ?? false,
      modifiers,
      notes: item.customizations?.notes,
    };
  });

  // Map payments
  const payments: ReceiptPaymentData[] = (order.payments ?? [])
    .filter((p) => !p.isVoided)
    .map((p) => ({
      method: getPaymentMethodName(p.method),
      amount: p.amount,
      last4: p.last4,
    }));

  // Format date/time
  const orderDate = order.opened_at
    ? new Date(order.opened_at)
    : new Date();
  const dateStr = orderDate.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  });
  const timeStr = orderDate.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  // Build address
  const addressParts = [
    location.address_line1,
    location.address_line2,
    `${location.city}, ${location.state} ${location.postal_code}`,
  ].filter(Boolean);

  return {
    storeName: location.name,
    storeAddress: addressParts.join(", "),
    storePhone: location.phone,
    orderNumber:
      order.display_number ||
      order.order_number ||
      `#${order.id.slice(-4)}`,
    orderDate: dateStr,
    orderTime: timeStr,
    orderType: getOrderTypeDisplay(order.order_type),
    tableName: order.service_location_name ?? undefined,
    customerName: order.customer_name,
    serverName: order.server_name,
    items,
    subtotal,
    tax,
    discount,
    tip,
    total,
    cashSubtotal: cashTotal !== total ? cashSubtotal : undefined,
    cashTax: cashTotal !== total ? cashTax : undefined,
    cashTotal: cashTotal !== total ? cashTotal : undefined,
    payments,
    amountPaid: order.amount_paid,
    amountDue: order.amount_due,
    footerMessage:
      template.footerText ?? printer.receiptFooter ?? "Thank you for your purchase!",
    headerMessage: template.headerText ?? undefined,
    maxCharsPerLine: printer.maxCharsPerLine,
    taxRate: subtotal > 0 ? tax / subtotal : 0,
    templateConfig: template,
    logoBase64: template.showLogo
      ? useReceiptTemplateStore.getState().cachedLogoBase64 ?? undefined
      : undefined,
  };
}

function buildKitchenTicketData(
  order: OrderProfile,
  items: CartItem[],
  printer: PrinterConfig,
  isVoidTicket: boolean,
  location?: SelectedLocation,
): KitchenTicketData {
  const template = location
    ? useReceiptTemplateStore.getState().getKitchenTemplate(location.id)
    : { ...DEFAULT_RECEIPT_TEMPLATE, templateType: "kitchen" };

  const now = new Date();
  const timestamp = now.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
  const fullTimestamp = now.toLocaleDateString("en-US", {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
  }) + " " + timestamp;

  const kitchenItems: KitchenTicketItemData[] = items.map((item) => {
    const modifiers: string[] = [];

    if (item.customizations?.size) {
      modifiers.push(`Size: ${item.customizations.size.name}`);
    }

    item.customizations?.modifiers?.forEach((modGroup) => {
      modGroup.options.forEach((opt) => {
        modifiers.push(opt.name);
      });
    });

    item.customizations?.addOns?.forEach((addon) => {
      modifiers.push(addon.name);
    });

    // Extract allergy info from notes if present
    const notes = item.customizations?.notes;
    let allergyAlert: string | undefined;
    if (notes && /allergy/i.test(notes)) {
      allergyAlert = notes;
    }

    return {
      name: item.is_open_item
        ? item.open_item_name || item.name
        : item.name,
      quantity: item.quantity,
      modifiers,
      notes,
      isVoided: item.is_voided,
      station: item.category_name,
      allergyAlert,
    };
  });

  const totalItemCount = items.reduce((sum, item) => sum + item.quantity, 0);

  // Calculate ready-by time (current time + 15 minutes)
  const readyBy = new Date(now.getTime() + 15 * 60 * 1000);
  const readyByTime = readyBy.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });

  return {
    orderNumber:
      order.display_number ||
      order.order_number ||
      `#${order.id.slice(-4)}`,
    orderType: getOrderTypeDisplay(order.order_type),
    tableName: order.service_location_name ?? undefined,
    serverName: order.server_name,
    timestamp,
    fullTimestamp,
    totalItemCount,
    items: kitchenItems,
    isVoidTicket,
    maxCharsPerLine: printer.maxCharsPerLine,
    templateConfig: template,
    readyByTime,
  };
}

function getOrderTypeDisplay(orderType: string | undefined): string {
  if (!orderType) return "Dine In";
  const types: Record<string, string> = {
    "Dine In": "Dine In",
    dine_in: "Dine In",
    Takeaway: "Takeaway",
    takeout: "Takeaway",
    Delivery: "Delivery",
    delivery: "Delivery",
  };
  return types[orderType] || orderType.replace("_", " ");
}

function getPaymentMethodName(method: string | undefined): string {
  if (!method) return "Cash";
  const methods: Record<string, string> = {
    Cash: "Cash",
    card: "Card",
    "Credit Card": "Card",
    "Debit Card": "Card",
    gift_card: "Gift Card",
    GiftCard: "Gift Card",
    house_account: "House Account",
  };
  return methods[method] || method.replace("_", " ");
}
