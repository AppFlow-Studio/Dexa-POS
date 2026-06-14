import type { Database } from "@/database.types";

/** Raw kiosk_profiles row as stored in Supabase. */
export type KioskProfileRow =
  Database["public"]["Tables"]["kiosk_profiles"]["Row"];

export type KioskTemplateId = "template_a" | "template_b" | "template_c";
export type KioskOrientation = "vertical" | "horizontal";

/**
 * Normalized, app-ready kiosk configuration. jsonb columns are parsed, nullable
 * theme fields are resolved against defaults, so consumers never deal with
 * `null`/`Json` shapes. Derived from a KioskProfileRow via `normalizeKioskProfile`.
 */
export interface KioskConfig {
  id: string;
  merchantId: string;
  locationId: string;
  profileName: string;

  templateId: KioskTemplateId;

  // Theme — all resolved (no nulls)
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  backgroundColor: string;
  textColor: string;
  headerTextColor: string;
  fontFamily: string;

  // Media
  logoUrl: string | null;
  heroImageUrl: string | null;
  attractVideoUrl: string | null;
  attractImageUrls: string[];

  // Behavior
  orientation: KioskOrientation;
  idleTimeoutSeconds: number;
  cartResetTimeoutSeconds: number;
  welcomeMessage: string;
  pickupNumberPrefix: string;

  // Receipt / checkout
  autoPrintReceipt: boolean;
  receiptEmailPrompt: boolean;
  receiptSmsPrompt: boolean;
  loyaltyEnrollmentEnabled: boolean;
  tipScreenEnabled: boolean;
  tipPresets: number[];

  // Menu display
  showCalorieInfo: boolean;
  showAllergens: boolean;

  // Wiring
  paymentTerminalId: string | null;
  isActive: boolean;
  publishedAt: string | null;
}

/** Defaults mirroring the kiosk_profiles column defaults — used as a safe
 * fallback when a station has no linked/active profile yet. */
export const DEFAULT_KIOSK_CONFIG: Omit<
  KioskConfig,
  "id" | "merchantId" | "locationId"
> = {
  profileName: "Default Kiosk",
  templateId: "template_a",
  primaryColor: "#0C4FD1",
  secondaryColor: "#0C4FD1",
  accentColor: "#0C4FD1",
  backgroundColor: "#FFFFFF",
  textColor: "#0A0A0A",
  headerTextColor: "#0A0A0A",
  fontFamily: "Inter",
  logoUrl: null,
  heroImageUrl: null,
  attractVideoUrl: null,
  attractImageUrls: [],
  orientation: "vertical",
  idleTimeoutSeconds: 60,
  cartResetTimeoutSeconds: 30,
  welcomeMessage: "Tap to order",
  pickupNumberPrefix: "",
  autoPrintReceipt: false,
  receiptEmailPrompt: true,
  receiptSmsPrompt: true,
  loyaltyEnrollmentEnabled: true,
  tipScreenEnabled: true,
  tipPresets: [15, 18, 20, 25],
  showCalorieInfo: false,
  showAllergens: true,
  paymentTerminalId: null,
  isActive: false,
  publishedAt: null,
};

function asTemplateId(value: string): KioskTemplateId {
  return value === "template_b" || value === "template_c"
    ? value
    : "template_a";
}

function asOrientation(value: string): KioskOrientation {
  return value === "horizontal" ? "horizontal" : "vertical";
}

function asNumberArray(value: unknown, fallback: number[]): number[] {
  if (!Array.isArray(value)) return fallback;
  const nums = value.filter((n): n is number => typeof n === "number");
  return nums.length > 0 ? nums : fallback;
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((s): s is string => typeof s === "string");
}

/** Convert a raw kiosk_profiles row into the normalized, app-ready config. */
export function normalizeKioskProfile(row: KioskProfileRow): KioskConfig {
  return {
    id: row.id,
    merchantId: row.merchant_id,
    locationId: row.location_id,
    profileName: row.profile_name,

    templateId: asTemplateId(row.template_id),

    primaryColor: row.primary_color,
    secondaryColor: row.secondary_color ?? row.primary_color,
    accentColor: row.accent_color ?? row.primary_color,
    backgroundColor: row.background_color,
    textColor: row.text_color,
    headerTextColor: row.header_text_color ?? row.text_color,
    fontFamily: row.font_family ?? "Inter",

    logoUrl: row.logo_url,
    heroImageUrl: row.hero_image_url,
    attractVideoUrl: row.attract_video_url,
    attractImageUrls: asStringArray(row.attract_image_urls),

    orientation: asOrientation(row.orientation),
    idleTimeoutSeconds: row.idle_timeout_seconds,
    cartResetTimeoutSeconds: row.cart_reset_timeout_seconds,
    welcomeMessage: row.welcome_message ?? "Tap to order",
    pickupNumberPrefix: row.pickup_number_prefix ?? "",

    autoPrintReceipt: row.auto_print_receipt,
    receiptEmailPrompt: row.receipt_email_prompt,
    receiptSmsPrompt: row.receipt_sms_prompt,
    loyaltyEnrollmentEnabled: row.loyalty_enrollment_enabled,
    tipScreenEnabled: row.tip_screen_enabled,
    tipPresets: asNumberArray(row.tip_presets, [15, 18, 20, 25]),

    showCalorieInfo: row.show_calorie_info,
    showAllergens: row.show_allergens,

    paymentTerminalId: row.payment_terminal_id,
    isActive: row.is_active,
    publishedAt: row.published_at,
  };
}
