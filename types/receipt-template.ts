import { Database } from "@/database.types";

// ============================================================================
// DATABASE ROW TYPE
// ============================================================================

export type ReceiptTemplateRow =
  Database["public"]["Tables"]["receipt_templates"]["Row"];

// ============================================================================
// RECEIPT TEMPLATE CONFIG (mapped from DB row)
// ============================================================================

export interface ReceiptTemplateConfig {
  id: string;
  merchantId: string;
  locationId: string | null;
  templateName: string;
  templateType: string;
  isActive: boolean;
  headerText: string | null;
  footerText: string | null;
  logoUrl: string | null;
  showLogo: boolean;
  showBarcode: boolean;
  showQrCode: boolean;
  showOrderType: boolean;
  showServerName: boolean;
  showTaxBreakdown: boolean;
  showTipLine: boolean;
  showItemModifiers: boolean;
  showAllergyAlert: boolean;
  showReadyByTime: boolean;
  showModsLarge: boolean;
  largeItemText: boolean;
  groupByStation: boolean;
}

// ============================================================================
// DEFAULT (all flags true so existing behavior is preserved)
// ============================================================================

export const DEFAULT_RECEIPT_TEMPLATE: ReceiptTemplateConfig = {
  id: "default",
  merchantId: "",
  locationId: null,
  templateName: "Default",
  templateType: "receipt",
  isActive: true,
  headerText: null,
  footerText: null,
  logoUrl: null,
  showLogo: true,
  showBarcode: true,
  showQrCode: true,
  showOrderType: true,
  showServerName: true,
  showTaxBreakdown: true,
  showTipLine: true,
  showItemModifiers: true,
  showAllergyAlert: true,
  showReadyByTime: true,
  showModsLarge: true,
  largeItemText: true,
  groupByStation: true,
};

// ============================================================================
// MAPPER
// ============================================================================

export function receiptTemplateRowToConfig(
  row: ReceiptTemplateRow,
): ReceiptTemplateConfig {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    locationId: row.location_id,
    templateName: row.template_name,
    templateType: row.template_type,
    isActive: row.is_active ?? true,
    headerText: row.header_text,
    footerText: row.footer_text,
    logoUrl: row.logo_url,
    showLogo: row.show_logo ?? true,
    showBarcode: row.show_barcode ?? true,
    showQrCode: row.show_qr_code ?? true,
    showOrderType: row.show_order_type ?? true,
    showServerName: row.show_server_name ?? true,
    showTaxBreakdown: row.show_tax_breakdown ?? true,
    showTipLine: row.show_tip_line ?? true,
    showItemModifiers: row.show_item_modifiers ?? true,
    showAllergyAlert: row.show_allergy_alert ?? true,
    showReadyByTime: row.show_ready_by_time ?? true,
    showModsLarge: row.show_mods_large ?? true,
    largeItemText: row.large_item_text ?? true,
    groupByStation: row.group_by_station ?? true,
  };
}
