// services/hardware/deviceDetection.ts

import * as Device from "expo-device";
import * as Network from "expo-network";
import * as Application from "expo-application";
import * as Battery from "expo-battery";
import NetInfo from "@react-native-community/netinfo";
import { Dimensions, PixelRatio, Platform } from "react-native";
import { getJSON, setJSON } from "@/lib/storage";
import { getDeviceId } from "@/lib/deviceId";
import { SupabaseClient } from "@supabase/supabase-js";
import { detectNativeHardware } from "@/native/HardwareDetection";

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

  // Battery level
  let batteryLevel: number | null = null;
  try {
    const level = await Battery.getBatteryLevelAsync();
    batteryLevel = level >= 0 ? Math.round(level * 100) : null;
  } catch (e) {
    console.warn("[DeviceDetection] Battery level error:", e);
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
    batteryLevel,
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
      device_id: getDeviceId(),
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
