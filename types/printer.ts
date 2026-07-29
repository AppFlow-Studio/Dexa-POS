import { Database } from "@/database.types";
import { PrintDocument } from "@/types/print-document";
import { ReceiptTemplateConfig } from "@/types/receipt-template";

// ============================================================================
// DATABASE ROW TYPE
// ============================================================================

export type PrinterRow = Database["public"]["Tables"]["printers"]["Row"];

// ============================================================================
// ENUMS / UNION TYPES
// ============================================================================

export type PrinterRole = "receipt" | "kitchen" | "bar" | "label";

export type PrinterDriverType =
  | "builtin_landi"
  | "star_micronics"
  | "generic_escpos"
  | "dejavoo_spin_p";

export type PrinterConnectionType = "usb" | "bluetooth" | "network" | "builtin";

export type PrintJobStatus = "queued" | "processing" | "completed" | "failed";

export type PrintJobPriority = "high" | "normal" | "low";

// Derived reachability badge state. Computed by getPrinterReachability().
// - connectable: probe last reported the printer claimable by us
// - in_use: probe got StarIO10InUseError — listening but held by a peer device
// - offline: probe failed or printer is powered off
// - unknown: last_status_at is stale (>5 min) or we have no probe data yet
export type PrinterReachability = "connectable" | "in_use" | "offline" | "unknown";

// Sentinel value written to printers.last_status when a probe observes the
// printer is reachable but held by another device. Free-form diagnostic strings
// (e.g. "Paper empty", "Cover open") continue to flow through last_status for
// other branches; only this exact value triggers the yellow badge.
export const PRINTER_STATUS_IN_USE = "in_use";

// ============================================================================
// PRINTER CONFIG (mapped from DB row)
// ============================================================================

export interface PrinterConfig {
  id: string;
  printerName: string;
  printerModel: string | null;
  printerType: PrinterDriverType;
  printerRole: PrinterRole;

  // Connection
  connectionType: PrinterConnectionType;
  networkAddress: string | null;
  networkPort: number | null;
  bluetoothAddress: string | null;
  usbDevicePath: string | null;
  serialNumber: string | null;

  // Capabilities
  supportsAutoCut: boolean;
  supportsBarcode: boolean;
  supportsQrCode: boolean;
  supportsCashDrawerKick: boolean;
  supportsLogo: boolean;
  graphicsOnly: boolean; // TSP100III etc. — no actionPrintText, must use actionPrintImage

  // Config
  paperWidth: number;
  maxCharsPerLine: number;
  printDensity: number;
  copies: number;
  printLogo: boolean;
  receiptHeader: string | null;
  receiptFooter: string | null;

  // Routing
  isDefaultReceipt: boolean;
  isDefaultKitchen: boolean;
  autoPrintReceipt: boolean;
  printOrderTickets: boolean;
  routingMode: PrinterRoutingMode;
  printModifiers: boolean;

  // Status
  isActive: boolean;
  isConnected: boolean;
  lastStatus: string | null;
  lastStatusAt: string | null;
  lastPrintAt: string | null;
  errorCount: number;

  // Scope
  locationId: string;
  merchantId: string;
  stationId: string | null;

  // Extensible metadata (e.g. Dejavoo credentials)
  metadata?: Record<string, unknown> | null;
}

// ============================================================================
// PRINT JOB (discriminated union: raw ESC/POS bytes OR structured document)
// ============================================================================

export type PrintJobType =
  | "receipt"
  | "kitchen_ticket"
  | "void_ticket"
  | "refund_ticket"
  | "test_page"
  | "cash_drawer";

interface PrintJobBase {
  id: string;
  printerId: string;
  priority: PrintJobPriority;
  status: PrintJobStatus;
  createdAt: number;
  /** Set when the job reaches a terminal status (completed/failed). Drives the
   *  diagnostics-retention window in usePrintQueueStore.pruneJobs(). */
  completedAt?: number;
  attempts: number;
  maxRetries: number;
  lastError?: string;
  orderId?: string;
  jobType: PrintJobType;
}

export interface RawPrintJob extends PrintJobBase {
  payloadType: "raw";
  data: Uint8Array;
}

export interface DocumentPrintJob extends PrintJobBase {
  payloadType: "document";
  document: PrintDocument;
}

export type PrintJob = RawPrintJob | DocumentPrintJob;

export interface SerializedPrintJob {
  id: string;
  printerId: string;
  priority: PrintJobPriority;
  status: PrintJobStatus;
  payloadType: "raw" | "document";
  dataBase64?: string; // base64-encoded Uint8Array (raw jobs)
  document?: PrintDocument; // structured document (document jobs)
  createdAt: number;
  completedAt?: number;
  attempts: number;
  maxRetries: number;
  lastError?: string;
  orderId?: string;
  jobType: PrintJobType;
}

// ============================================================================
// PRINTER STATUS
// ============================================================================

export interface PrinterStatusResult {
  isOnline: boolean;
  hasPaper: boolean;
  coverOpen: boolean;
  errorMessage?: string;
}

// ============================================================================
// ROUTE RULES (legacy)
// ============================================================================

export interface PrinterRouteRule {
  id: string;
  categoryName: string;
  printerId: string;
  isEnabled: boolean;
}

// ============================================================================
// PRINTER ROUTING V2 (per-printer routing config)
// ============================================================================

export type PrinterRoutingMode = "all" | "unassigned" | "custom";

export type PrinterRouteRuleType =
  | "category"    // rule_value = category ID
  | "menu_item"   // rule_value = menu item ID
  | "order_type"; // rule_value = "dine_in" | "takeout" | "delivery"

export interface PrinterRouteRuleV2 {
  id: string;
  printer_id: string;
  rule_type: PrinterRouteRuleType;
  rule_value: string;
  is_enabled: boolean;
}

export interface PrinterRoutingConfig {
  printerId: string;
  routingMode: PrinterRoutingMode;
  printModifiers: boolean;
  rules: PrinterRouteRuleV2[];
}

// ============================================================================
// TEMPLATE DATA
// ============================================================================

export interface ReceiptTemplateData {
  // Store info
  storeName: string;
  storeAddress: string;
  storePhone: string | null;

  // Order info
  orderNumber: string;
  orderDate: string;
  orderTime: string;
  orderType: string;
  tableName?: string;
  customerName?: string;
  customerPhone?: string;
  serverName?: string;
  backendOrderNumber?: string; // "ORD-YYYYMMDD-XXXX" from orders table

  // Items
  items: ReceiptItemData[];

  // Totals
  subtotal: number;
  tax: number;
  discount: number;
  tip: number;
  total: number;
  pricingMode?: "cash" | "card" | "dual";

  // Service charge (already included in `total` from the backend; rendered
  // as its own line between Tax and Tip when > 0).
  serviceCharge?: number;
  cashServiceCharge?: number;
  serviceChargeName?: string;

  // Cash pricing (optional)
  cashSubtotal?: number;
  cashTax?: number;
  cashTotal?: number;

  // Payments
  payments: ReceiptPaymentData[];
  amountPaid?: number;
  amountDue?: number;

  // Footer
  footerMessage?: string;
  headerMessage?: string;

  // Config
  maxCharsPerLine: number;
  taxRate?: number;
  templateConfig?: ReceiptTemplateConfig;

  // Logo
  logoBase64?: string; // Pre-fetched logo image as base64 PNG for printing

  // Print metadata
  printDate?: string;  // Date string when receipt was printed
  printTime?: string;  // Time string when receipt was printed

  // Copy label printed at the bottom of the receipt
  copyLabel?: string;  // e.g. "Customer Copy" | "Merchant Copy"

  // Split-receipt scoping (only set for per-portion split receipts; ignored
  // on the combined-receipt path so existing receipts are byte-identical).
  splitLabel?: string;             // e.g. "Split 2 of 3"
  splitPayerName?: string;         // payer name (from transactionDetails.splitLabel)
  isPartialSplitReceipt?: boolean; // even/custom split → "Partial payment - full check below"
}

export interface ReceiptItemData {
  name: string;
  quantity: number;
  price: number;
  cashPrice?: number;
  isVoided: boolean;
  modifiers: { name: string; price: number; isNo?: boolean }[];
  // Aggregate modifier upcharge not already itemized by the per-option prices
  // above — recovers a priced modifier (e.g. +$140) when its per-option price
  // didn't round-trip onto a synced/reprinted item. 0/undefined = nothing extra.
  modifiersUpcharge?: number;
  cashModifiersUpcharge?: number;
  notes?: string;
  seatNumber?: number | null; // Which seat (1..N), null = shared/unassigned
}

export interface ReceiptPaymentData {
  method: string;
  amount: number;
  last4?: string;
  cardBrand?: string;    // "VISA", "MASTERCARD", etc.
  authCode?: string;     // Authorization/approval code
  rrn?: string;          // Retrieval Reference Number
  entryMode?: string;    // "chip", "swipe", "contactless", "manual"
  aid?: string;              // Card Application ID (AID) from terminal
  tipAmount?: number;        // Tip amount (shown separately so amount is clearly pre-tip)
  originalTipAmount?: number; // Original tip before adjustment (for audit display)
  amountTendered?: number;   // Cash amount customer handed over
  changeGiven?: number;      // Change returned to customer
}

export interface KitchenTicketData {
  orderNumber: string;
  orderType: string;
  tableName?: string;
  serverName?: string;
  timestamp: string;
  fullTimestamp?: string;
  totalItemCount?: number;
  items: KitchenTicketItemData[];
  isVoidTicket: boolean;
  isRefundTicket?: boolean;
  maxCharsPerLine: number;
  templateConfig?: ReceiptTemplateConfig;
  readyByTime?: string;
}

export interface KitchenTicketItemData {
  name: string;
  quantity: number;
  modifiers: string[];
  notes?: string;
  isVoided?: boolean;
  isRefunded?: boolean;
  station?: string;
  allergyAlert?: string;
  seatNumber?: number | null;
  courseNumber?: number; // Which course this item belongs to (rendered when > 1)
}

// ============================================================================
// HELPERS
// ============================================================================

/** Returns true for Star models that only support image printing (no actionPrintText). */
function isGraphicsOnlyStarModel(printerModel: string | null): boolean {
  if (!printerModel) return false;
  const m = printerModel.toUpperCase();
  return m.includes("TSP100III") || m.includes("TSP100IIU+") || m.includes("TSP100IV");
}

export function printerRowToConfig(row: PrinterRow): PrinterConfig {
  return {
    id: row.id,
    printerName: row.printer_name,
    printerModel: row.printer_model,
    printerType: (row.printer_type as PrinterDriverType) || "generic_escpos",
    printerRole: (row.printer_role as PrinterRole) || "receipt",
    connectionType: (row.connection_type as PrinterConnectionType) || "network",
    networkAddress: typeof row.network_address === "string" ? row.network_address : null,
    networkPort: row.network_port,
    bluetoothAddress: row.bluetooth_address,
    usbDevicePath: row.usb_device_path,
    serialNumber: row.serial_number,
    supportsAutoCut: row.supports_auto_cut ?? true,
    supportsBarcode: row.supports_barcode ?? false,
    supportsQrCode: row.supports_qr_code ?? false,
    supportsCashDrawerKick: row.supports_cash_drawer_kick ?? false,
    supportsLogo: row.supports_logo ?? false,
    graphicsOnly: !!(row.metadata as Record<string, unknown> | null)?.graphicsOnly
      || isGraphicsOnlyStarModel(row.printer_model),
    paperWidth: row.paper_width ?? 58,
    maxCharsPerLine: row.max_chars_per_line ?? 32,
    printDensity: row.print_density ?? 8,
    copies: row.copies ?? 1,
    printLogo: row.print_logo ?? false,
    receiptHeader: row.receipt_header,
    receiptFooter: row.receipt_footer,
    isDefaultReceipt: row.is_default_receipt ?? false,
    isDefaultKitchen: row.is_default_kitchen ?? false,
    autoPrintReceipt: row.auto_print_receipt ?? false,
    printOrderTickets: row.print_order_tickets ?? false,
    routingMode: ((row as any).routing_mode as PrinterRoutingMode) || "all",
    printModifiers: (row as any).print_modifiers ?? true,
    isActive: row.is_active ?? true,
    isConnected: row.is_connected ?? false,
    lastStatus: row.last_status,
    lastStatusAt: row.last_status_at,
    lastPrintAt: row.last_print_at,
    errorCount: row.error_count ?? 0,
    locationId: row.location_id,
    merchantId: row.merchant_id,
    stationId: row.station_id,
    metadata: row.metadata as Record<string, unknown> | null,
  };
}

export function serializePrintJob(job: PrintJob): SerializedPrintJob {
  const base: Omit<SerializedPrintJob, "payloadType" | "dataBase64" | "document"> = {
    id: job.id,
    printerId: job.printerId,
    priority: job.priority,
    status: job.status,
    createdAt: job.createdAt,
    completedAt: job.completedAt,
    attempts: job.attempts,
    maxRetries: job.maxRetries,
    lastError: job.lastError,
    orderId: job.orderId,
    jobType: job.jobType,
  };

  if (job.payloadType === "document") {
    return { ...base, payloadType: "document", document: job.document };
  }

  // Raw payload — convert Uint8Array to base64
  let binary = "";
  for (let i = 0; i < job.data.length; i++) {
    binary += String.fromCharCode(job.data[i]);
  }
  return { ...base, payloadType: "raw", dataBase64: btoa(binary) };
}

export function deserializePrintJob(serialized: SerializedPrintJob): PrintJob {
  const base = {
    id: serialized.id,
    printerId: serialized.printerId,
    priority: serialized.priority,
    status: serialized.status,
    createdAt: serialized.createdAt,
    completedAt: serialized.completedAt,
    attempts: serialized.attempts,
    maxRetries: serialized.maxRetries,
    lastError: serialized.lastError,
    orderId: serialized.orderId,
    jobType: serialized.jobType,
  };

  if (serialized.payloadType === "document" && serialized.document) {
    return { ...base, payloadType: "document", document: serialized.document };
  }

  // Raw payload (also handles legacy jobs missing payloadType)
  const dataBase64 = serialized.dataBase64 ?? "";
  const binary = atob(dataBase64);
  const data = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    data[i] = binary.charCodeAt(i);
  }
  return { ...base, payloadType: "raw", data };
}
