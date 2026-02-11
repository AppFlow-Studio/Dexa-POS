// services/hardware/deviceDetection.ts

import * as Device from "expo-device";
import * as Network from "expo-network";
import * as Application from "expo-application";
import NetInfo from "@react-native-community/netinfo";
import { Dimensions, PixelRatio, Platform } from "react-native";
import { getJSON, setJSON } from "@/lib/storage";
import { SupabaseClient } from "@supabase/supabase-js";
import { detectNativeHardware } from "@/native/HardwareDetection";
import { StationPaymentTerminal } from "@/types/station";
import { printerRowToConfig } from "@/types/printer";
import { DejavooDriver } from "@/services/printing/drivers/DejavooDriver";

// ============================================================================
// TYPES
// ============================================================================

export interface DeviceCapabilities {
  manufacturer: string;
  model: string;
  hardwareModel: string | null;
  androidSdkVersion: number | null;
  osVersion: string | null;
  appVersion: string | null;
  screenWidth: number;
  screenHeight: number;
  screenDensity: number;
  hasBuiltinPrinter: boolean;
  hasBuiltinCfd: boolean;
  hasCashDrawerPort: boolean;
  hasNfc: boolean;
  hasBarcodeScanner: boolean;
  batteryLevel: number | null;
  storageFreeBytes: number | null;
  ramFreeBytes: number | null;
  networkType: string | null;
  networkSsid: string | null;
  localIpAddress: string | null;
}

// ============================================================================
// CACHE
// ============================================================================

const CACHE_KEY = "device_capabilities_cache";
const IN_MEMORY_TTL_MS = 5 * 60 * 1000; // 5 minutes

let inMemoryCache: DeviceCapabilities | null = null;
let inMemoryCacheTime = 0;

export function getCachedCapabilities(): DeviceCapabilities | null {
  // Check in-memory cache first (fastest)
  if (inMemoryCache && Date.now() - inMemoryCacheTime < IN_MEMORY_TTL_MS) {
    return inMemoryCache;
  }
  // Fall back to MMKV persistent cache
  return getJSON<DeviceCapabilities>(CACHE_KEY);
}

export function setCachedCapabilities(caps: DeviceCapabilities): void {
  inMemoryCache = caps;
  inMemoryCacheTime = Date.now();
  setJSON(CACHE_KEY, caps);
}

/** Invalidate in-memory cache (e.g. after USB hotplug event) */
export function invalidateCache(): void {
  inMemoryCache = null;
  inMemoryCacheTime = 0;
}

// ============================================================================
// DETECTION
// ============================================================================

export async function detectDeviceCapabilities(): Promise<DeviceCapabilities> {
  // Check in-memory cache — return early if fresh
  if (inMemoryCache && Date.now() - inMemoryCacheTime < IN_MEMORY_TTL_MS) {
    return inMemoryCache;
  }

  // Device info
  const manufacturer = Device.manufacturer || "Unknown";
  const model = Device.modelName || "Unknown";
  const hardwareModel = Device.modelId || null;
  const androidSdkVersion =
    Platform.OS === "android" ? Device.platformApiLevel ?? null : null;
  const osVersion = Device.osVersion || null;

  // App version
  const appVersion = Application.nativeApplicationVersion || null;

  // Screen
  const { width, height } = Dimensions.get("window");
  const screenDensity = PixelRatio.get();

  // Runtime hardware detection via native module
  const nativeHardware = await detectNativeHardware();
  const hasBuiltinPrinter = nativeHardware?.hasPrinter ?? false;
  const hasBuiltinCfd = nativeHardware?.hasSecondaryDisplay ?? false;
  const hasCashDrawerPort = nativeHardware?.hasCashDrawer ?? false;
  const hasNfc = nativeHardware?.hasNfc ?? false;
  const hasBarcodeScanner = nativeHardware?.hasBarcodeScanner ?? false;

  // Network info
  let networkType: string | null = null;
  let networkSsid: string | null = null;
  let localIpAddress: string | null = null;

  try {
    const netInfoState = await NetInfo.fetch();
    networkType = netInfoState.type || null;
    if (
      netInfoState.type === "wifi" &&
      netInfoState.details &&
      "ssid" in netInfoState.details
    ) {
      networkSsid = netInfoState.details.ssid || null;
    }
  } catch (e) {
    console.warn("[DeviceDetection] NetInfo error:", e);
  }

  try {
    const ip = await Network.getIpAddressAsync();
    localIpAddress = ip || null;
  } catch (e) {
    console.warn("[DeviceDetection] IP address error:", e);
  }

  const capabilities: DeviceCapabilities = {
    manufacturer,
    model,
    hardwareModel,
    androidSdkVersion,
    osVersion,
    appVersion,
    screenWidth: Math.round(width),
    screenHeight: Math.round(height),
    screenDensity,
    hasBuiltinPrinter,
    hasBuiltinCfd,
    hasCashDrawerPort,
    hasNfc,
    hasBarcodeScanner,
    batteryLevel: null,
    storageFreeBytes: null,
    ramFreeBytes: null,
    networkType,
    networkSsid,
    localIpAddress,
  };

  // Cache for quick access
  setCachedCapabilities(capabilities);

  console.log(
    `[DeviceDetection] Detected: ${manufacturer} ${model} | Printer: ${hasBuiltinPrinter} | CFD: ${hasBuiltinCfd} | NFC: ${hasNfc} | Scanner: ${hasBarcodeScanner}`,
  );

  return capabilities;
}

// ============================================================================
// PUSH TO STATIONS TABLE
// ============================================================================

export async function updateStationCapabilities(
  supabase: SupabaseClient,
  stationId: string,
  capabilities: DeviceCapabilities,
): Promise<void> {
  const { error } = await supabase
    .from("stations")
    .update({
      device_manufacturer: capabilities.manufacturer,
      device_model: capabilities.model,
      hardware_model: capabilities.hardwareModel,
      android_sdk_version: capabilities.androidSdkVersion,
      os_version: capabilities.osVersion,
      app_version: capabilities.appVersion,
      screen_width: capabilities.screenWidth,
      screen_height: capabilities.screenHeight,
      screen_density: capabilities.screenDensity,
      has_builtin_printer: capabilities.hasBuiltinPrinter,
      has_builtin_cfd: capabilities.hasBuiltinCfd,
      has_cash_drawer_port: capabilities.hasCashDrawerPort,
      has_nfc: capabilities.hasNfc,
      network_type: capabilities.networkType,
      network_ssid: capabilities.networkSsid,
      local_ip_address: capabilities.localIpAddress,
    })
    .eq("id", stationId);

  if (error) {
    console.error("[DeviceDetection] Failed to update station:", error.message);
  } else {
    console.log("[DeviceDetection] Station capabilities updated in DB");
  }
}

// ============================================================================
// CONVENIENCE COMBO
// ============================================================================

export async function detectAndStoreCapabilities(
  supabase: SupabaseClient,
  stationId: string,
): Promise<DeviceCapabilities> {
  const capabilities = await detectDeviceCapabilities();
  await updateStationCapabilities(supabase, stationId, capabilities);
  return capabilities;
}

// ============================================================================
// BUILTIN PRINTER AUTO-PROVISIONING
// ============================================================================

/**
 * Ensures a `printers` row exists for devices with a built-in printer.
 * Called once after hardware detection — if a matching row already exists,
 * this is a no-op.
 */
export async function ensureBuiltinPrinterProvisioned(
  supabase: SupabaseClient,
  stationId: string,
  locationId: string,
  merchantId: string,
  capabilities: DeviceCapabilities,
): Promise<void> {
  if (!capabilities.hasBuiltinPrinter) return;

  // Check if a builtin printer row already exists for this station
  const { data: existing, error: fetchError } = await supabase
    .from("printers")
    .select("id")
    .eq("station_id", stationId)
    .eq("printer_type", "builtin_landi")
    .limit(1);

  if (fetchError) {
    console.error("[DeviceDetection] Failed to check existing printer:", fetchError.message);
    return;
  }

  if (existing && existing.length > 0) {
    console.log("[DeviceDetection] Builtin printer already provisioned:", existing[0].id);
    return;
  }

  // Auto-provision a printer entry for the Landi built-in thermal printer
  const { data: inserted, error: insertError } = await supabase
    .from("printers")
    .insert({
      printer_name: `${capabilities.model} Built-in Printer`,
      printer_model: capabilities.model,
      printer_type: "builtin_landi",
      printer_role: "receipt",
      connection_type: "builtin",
      paper_width: 58,
      max_chars_per_line: 32,
      supports_auto_cut: true,
      supports_cash_drawer_kick: true,
      supports_qr_code: true,
      supports_barcode: false,
      supports_logo: false,
      is_default_receipt: true,
      is_active: true,
      is_connected: false,
      location_id: locationId,
      merchant_id: merchantId,
      station_id: stationId,
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[DeviceDetection] Failed to auto-provision builtin printer:", insertError.message);
  } else {
    console.log("[DeviceDetection] Auto-provisioned builtin printer:", inserted?.id);
  }
}

// ============================================================================
// DEJAVOO PRINTER AUTO-PROVISIONING
// ============================================================================

/**
 * Ensures a `printers` row exists for a Dejavoo P18 terminal linked to this station.
 * Idempotent — if a `dejavoo_spin_p` row already exists for the station, this is a no-op.
 * Returns the printer ID if provisioned (or already existing), null on failure.
 */
export async function ensureDejavooPrinterProvisioned(
  supabase: SupabaseClient,
  stationId: string,
  locationId: string,
  merchantId: string,
  paymentTerminal: StationPaymentTerminal,
): Promise<string | null> {
  // Check if a dejavoo printer row already exists for this station
  const { data: existing, error: fetchError } = await supabase
    .from("printers")
    .select("id")
    .eq("station_id", stationId)
    .eq("printer_type", "dejavoo_spin_p")
    .limit(1);

  if (fetchError) {
    console.error("[DeviceDetection] Failed to check existing Dejavoo printer:", fetchError.message);
    return null;
  }

  if (existing && existing.length > 0) {
    console.log("[DeviceDetection] Dejavoo printer already provisioned:", existing[0].id);
    return existing[0].id;
  }

  console.log("[DeviceDetection] Fetching terminal credentials for:", paymentTerminal.id);

  // Fetch credentials via RPC to get the base URL and auth key
  const { data: creds, error: credsError } = await supabase.rpc("get_terminal_credentials", {
    p_terminal_id: paymentTerminal.id,
  });

  if (credsError || !creds?.success) {
    console.error(
      "[DeviceDetection] Failed to fetch terminal credentials:",
      credsError?.message || creds?.error,
    );
    return null;
  }

  // Insert printer row with Dejavoo credentials in metadata
  const { data: inserted, error: insertError } = await supabase
    .from("printers")
    .insert({
      printer_name: `${paymentTerminal.terminal_name || "Dejavoo P18"} Printer`,
      printer_model: paymentTerminal.terminal_model || "Dejavoo P18",
      printer_type: "dejavoo_spin_p",
      printer_role: "receipt",
      connection_type: "network",
      paper_width: 58,
      max_chars_per_line: 32,
      supports_auto_cut: true,
      supports_cash_drawer_kick: false,
      supports_qr_code: true,
      supports_barcode: false,
      supports_logo: false,
      is_default_receipt: false,
      is_active: true,
      is_connected: false,
      location_id: locationId,
      merchant_id: merchantId,
      station_id: stationId,
      metadata: {
        dejavooAuthKey: creds.auth_key,
        dejavooTpn: creds.tpn,
        dejavooRegisterId: paymentTerminal.register_id,
        dejavooBaseUrl: creds.api_base_url,
        paymentTerminalId: paymentTerminal.id,
      },
    })
    .select("id")
    .single();

  if (insertError) {
    console.error("[DeviceDetection] Failed to auto-provision Dejavoo printer:", insertError.message);
    return null;
  }

  console.log("[DeviceDetection] Auto-provisioned Dejavoo printer:", inserted?.id);
  return inserted?.id ?? null;
}

// ============================================================================
// DEJAVOO PRINTER VERIFICATION
// ============================================================================

/**
 * Verifies a Dejavoo printer by sending a test page.
 * On success: updates DB with is_connected: true, last_status: "verified".
 * On failure: updates DB with is_connected: false, last_status: "verification_failed: ..."
 * but keeps is_active: true (terminal may come online later).
 */
export async function verifyDejavooPrinter(
  supabase: SupabaseClient,
  printerId: string,
): Promise<boolean> {
  // Fetch the printer row
  const { data: row, error: fetchError } = await supabase
    .from("printers")
    .select("*")
    .eq("id", printerId)
    .single();

  if (fetchError || !row) {
    console.error("[DeviceDetection] Failed to fetch Dejavoo printer row:", fetchError?.message);
    return false;
  }

  const config = printerRowToConfig(row);
  const driver = new DejavooDriver();

  try {
    await driver.initialize(config);

    // Send a test page
    await driver.printDocument({
      nodes: [
        { type: "text_line", content: "DEXA POS", align: "center", format: { bold: true, doubleHeight: true } },
        { type: "empty_line" },
        { type: "text_line", content: "Printer Test Page", align: "center" },
        { type: "text_line", content: "Terminal Connected!", align: "center" },
        { type: "empty_line" },
        { type: "text_line", content: new Date().toLocaleString(), align: "center", format: { condensed: true } },
        { type: "divider", style: "solid", lineWidth: 32 },
        { type: "feed", lines: 3 },
        { type: "cut" },
      ],
      maxCharsPerLine: 32,
    });

    // Update DB: verified
    await supabase
      .from("printers")
      .update({
        is_connected: true,
        last_status: "verified",
        last_status_at: new Date().toISOString(),
      })
      .eq("id", printerId);

    console.log("[DeviceDetection] Dejavoo printer verified:", printerId);
    return true;
  } catch (e: any) {
    // Update DB: verification failed, but keep active
    await supabase
      .from("printers")
      .update({
        is_connected: false,
        last_status: `verification_failed: ${e.message}`,
        last_status_at: new Date().toISOString(),
      })
      .eq("id", printerId);

    console.warn("[DeviceDetection] Dejavoo printer verification failed:", e.message);
    return false;
  } finally {
    await driver.disconnect();
  }
}
