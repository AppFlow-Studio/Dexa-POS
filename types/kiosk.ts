import type { Database } from "@/database.types";

/** Raw kiosk_profiles row as stored in Supabase. */
export type KioskProfileRow =
  Database["public"]["Tables"]["kiosk_profiles"]["Row"];

export type KioskTemplateId = "template_a" | "template_b" | "template_c";

/** Order types a kiosk customer can pick. Mirrors orders.order_type values. */
export type KioskOrderType = "dine_in" | "takeout";

export type KioskOrderTypesMode = "both" | "dine_in_only" | "takeout_only";

export interface KioskSeatOption {
  id: string;
  label: string;
}

/**
 * Per-station kiosk ordering settings, from `stations.kiosk_settings` (edited
 * on the website's station page → Kiosk tab). The web normaliser
 * (dexapos-website lib/stations/station-kiosk-settings.ts) writes the same
 * shape — keep defaults in sync.
 */
export interface KioskOrderingSettings {
  orderTypes: KioskOrderTypesMode;
  /** Dine-In only: start as Dine-In without asking (false = single button). */
  dineInOnlySkipPrompt: boolean;
  seatSelectionEnabled: boolean;
  seatOptions: KioskSeatOption[];
}

export const DEFAULT_KIOSK_ORDERING: KioskOrderingSettings = {
  orderTypes: "both",
  dineInOnlySkipPrompt: true,
  seatSelectionEnabled: false,
  seatOptions: [],
};

const KIOSK_SEAT_LABEL_MAX = 40;
const KIOSK_SEAT_OPTIONS_MAX = 200;

/**
 * Tolerant read of `stations.kiosk_settings`. Anything missing or malformed
 * falls back to today's behaviour (Dine-In + Takeaway, no seat step), so a bad
 * write on the web side can never break the kiosk.
 */
export function normalizeKioskOrderingSettings(
  raw: unknown,
): KioskOrderingSettings {
  const obj =
    raw && typeof raw === "object" && !Array.isArray(raw)
      ? (raw as Record<string, unknown>)
      : {};
  const orderTypes: KioskOrderTypesMode =
    obj.order_types === "dine_in_only" || obj.order_types === "takeout_only"
      ? obj.order_types
      : "both";

  const seatOptions: KioskSeatOption[] = [];
  const seen = new Set<string>();
  if (Array.isArray(obj.seat_options)) {
    for (const entry of obj.seat_options) {
      if (!entry || typeof entry !== "object") continue;
      const { id, label } = entry as { id?: unknown; label?: unknown };
      if (typeof label !== "string") continue;
      const clean = label.trim().slice(0, KIOSK_SEAT_LABEL_MAX);
      if (!clean || seen.has(clean.toLowerCase())) continue;
      seen.add(clean.toLowerCase());
      seatOptions.push({
        id: typeof id === "string" && id ? id : clean,
        label: clean,
      });
      if (seatOptions.length >= KIOSK_SEAT_OPTIONS_MAX) break;
    }
  }

  return {
    orderTypes,
    dineInOnlySkipPrompt:
      typeof obj.dine_in_only_skip_prompt === "boolean"
        ? obj.dine_in_only_skip_prompt
        : DEFAULT_KIOSK_ORDERING.dineInOnlySkipPrompt,
    seatSelectionEnabled: obj.seat_selection_enabled === true,
    seatOptions,
  };
}
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

  // Media — logo is a single slot; everything else is placement- and
  // orientation-scoped (idle/attract screen vs. in-order menu banner), since
  // the two placements need very different aspect ratios and video only
  // ever plays on the idle screen. Consumers should read the array/value
  // matching `orientation` — see `kioskIdleImages` / `kioskOrderBannerImages`
  // / `kioskIdleVideo` helpers below.
  logoUrl: string | null;
  idleImagesVertical: string[];
  idleImagesHorizontal: string[];
  idleVideoVertical: string | null;
  idleVideoHorizontal: string | null;
  orderBannerImagesVertical: string[];
  orderBannerImagesHorizontal: string[];

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

  /**
   * Per-station ordering settings (order types + seat selection). Optional
   * because configs persisted by older builds lack it — read through
   * `kioskOrdering(config)`, never directly.
   */
  ordering?: KioskOrderingSettings;
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
  idleImagesVertical: [],
  idleImagesHorizontal: [],
  idleVideoVertical: null,
  idleVideoHorizontal: null,
  orderBannerImagesVertical: [],
  orderBannerImagesHorizontal: [],
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

/** Ordering settings for a config, defaulting configs persisted before they existed. */
export function kioskOrdering(
  config: KioskConfig | null | undefined,
): KioskOrderingSettings {
  return config?.ordering ?? DEFAULT_KIOSK_ORDERING;
}

/**
 * Convert a raw kiosk_profiles row (+ the station's kiosk_settings) into the
 * normalized, app-ready config.
 */
export function normalizeKioskProfile(
  row: KioskProfileRow,
  ordering: KioskOrderingSettings = DEFAULT_KIOSK_ORDERING,
): KioskConfig {
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
    idleImagesVertical: asStringArray(row.idle_images_vertical),
    idleImagesHorizontal: asStringArray(row.idle_images_horizontal),
    idleVideoVertical: row.idle_video_vertical,
    idleVideoHorizontal: row.idle_video_horizontal,
    orderBannerImagesVertical: asStringArray(row.order_banner_images_vertical),
    orderBannerImagesHorizontal: asStringArray(
      row.order_banner_images_horizontal,
    ),

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

    ordering,
  };
}

/** Idle/attract-screen images for `config.orientation`. */
export function kioskIdleImages(config: KioskConfig): string[] {
  return config.orientation === "vertical"
    ? config.idleImagesVertical
    : config.idleImagesHorizontal;
}

/** Idle/attract-screen video for `config.orientation`, if any. */
export function kioskIdleVideo(config: KioskConfig): string | null {
  return config.orientation === "vertical"
    ? config.idleVideoVertical
    : config.idleVideoHorizontal;
}

/** In-order menu banner images for `config.orientation`. */
export function kioskOrderBannerImages(config: KioskConfig): string[] {
  return config.orientation === "vertical"
    ? config.orderBannerImagesVertical
    : config.orderBannerImagesHorizontal;
}
