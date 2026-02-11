import { Database } from "@/database.types";
import { PrintDocument } from "@/types/print-document";

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

  // Capabilities
  supportsAutoCut: boolean;
  supportsBarcode: boolean;
  supportsQrCode: boolean;
  supportsCashDrawerKick: boolean;
  supportsLogo: boolean;

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
  | "test_page"
  | "cash_drawer";

interface PrintJobBase {
  id: string;
  printerId: string;
  priority: PrintJobPriority;
  status: PrintJobStatus;
  createdAt: number;
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
// ROUTE RULES
// ============================================================================

export interface PrinterRouteRule {
  id: string;
  categoryName: string;
  printerId: string;
  isEnabled: boolean;
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
  serverName?: string;

  // Items
  items: ReceiptItemData[];

  // Totals
  subtotal: number;
  tax: number;
  discount: number;
  tip: number;
  total: number;

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

  // Config
  maxCharsPerLine: number;
}

export interface ReceiptItemData {
  name: string;
  quantity: number;
  price: number;
  cashPrice?: number;
  isVoided: boolean;
  modifiers: { name: string; price: number }[];
  notes?: string;
}

export interface ReceiptPaymentData {
  method: string;
  amount: number;
  last4?: string;
}

export interface KitchenTicketData {
  orderNumber: string;
  orderType: string;
  tableName?: string;
  serverName?: string;
  timestamp: string;
  items: KitchenTicketItemData[];
  isVoidTicket: boolean;
  maxCharsPerLine: number;
}

export interface KitchenTicketItemData {
  name: string;
  quantity: number;
  modifiers: string[];
  notes?: string;
  isVoided?: boolean;
}

// ============================================================================
// HELPERS
// ============================================================================

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
    supportsAutoCut: row.supports_auto_cut ?? true,
    supportsBarcode: row.supports_barcode ?? false,
    supportsQrCode: row.supports_qr_code ?? false,
    supportsCashDrawerKick: row.supports_cash_drawer_kick ?? false,
    supportsLogo: row.supports_logo ?? false,
    paperWidth: row.paper_width ?? 80,
    maxCharsPerLine: row.max_chars_per_line ?? 48,
    printDensity: row.print_density ?? 8,
    copies: row.copies ?? 1,
    printLogo: row.print_logo ?? false,
    receiptHeader: row.receipt_header,
    receiptFooter: row.receipt_footer,
    isDefaultReceipt: row.is_default_receipt ?? false,
    isDefaultKitchen: row.is_default_kitchen ?? false,
    autoPrintReceipt: row.auto_print_receipt ?? false,
    printOrderTickets: row.print_order_tickets ?? false,
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
