import { Database } from "@/database.types";

// ============================================================================
// DATABASE ROW TYPE
// ============================================================================

export type ReceiptTemplateRow =
  Database["public"]["Tables"]["receipt_templates"]["Row"];

// ============================================================================
// MODIFIER STYLE
// ============================================================================

export type ModifierStyle = "inverted" | "red" | "bold";

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
  modifierStyle: ModifierStyle;
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
  modifierStyle: "inverted",
};

// ============================================================================
// MAPPER
// ============================================================================

export type ReceiptTemplateInsert =
  Database["public"]["Tables"]["receipt_templates"]["Insert"];

/**
 * Convert camelCase config back to snake_case DB row for upsert.
 * Omits `id` when it equals "default" (new template — let DB generate UUID).
 */
export function receiptTemplateConfigToRow(
  config: ReceiptTemplateConfig,
): ReceiptTemplateInsert {
  const row: ReceiptTemplateInsert = {
    merchant_id: config.merchantId,
    location_id: config.locationId,
    template_name: config.templateName,
    template_type: config.templateType,
    is_active: config.isActive,
    header_text: config.headerText,
    footer_text: config.footerText,
    logo_url: config.logoUrl,
    show_logo: config.showLogo,
    show_barcode: config.showBarcode,
    show_qr_code: config.showQrCode,
    show_order_type: config.showOrderType,
    show_server_name: config.showServerName,
    show_tax_breakdown: config.showTaxBreakdown,
    show_tip_line: config.showTipLine,
    show_item_modifiers: config.showItemModifiers,
    show_allergy_alert: config.showAllergyAlert,
    show_ready_by_time: config.showReadyByTime,
    show_mods_large: config.showModsLarge,
    large_item_text: config.largeItemText,
    group_by_station: config.groupByStation,
    modifier_style: config.modifierStyle,
  };

  // Only include id if it's a real UUID (not "default")
  if (config.id !== "default") {
    row.id = config.id;
  }

  return row;
}

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
    modifierStyle: (row.modifier_style as ModifierStyle) ?? "inverted",
  };
}
