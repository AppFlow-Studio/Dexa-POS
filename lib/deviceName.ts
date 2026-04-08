import * as Device from "expo-device";
import { Platform } from "react-native";
import { getString, setString, removeKey } from "@/lib/storage";

const DEVICE_NAME_KEY = "dexa-pos-device-name";

/**
 * Gets the auto-detected device name from the system.
 * Falls back to a generic name if detection fails.
 */
export function getAutoDetectedDeviceName(): string {
  try {
    // Try Device.modelName first (e.g., "iPad Pro 12.9-inch")
    if (Device.modelName) {
      return Device.modelName;
    }

    // Fallback to device manufacturer + model
    if (Device.manufacturer && Device.modelId) {
      return `${Device.manufacturer} ${Device.modelId}`;
    }

    // Try device name
    if (Device.deviceName) {
      return Device.deviceName;
    }

    // Last resort fallback
    return Platform.OS === "ios" ? "iPad" : "Android Tablet";
  } catch {
    return "POS Device";
  }
}

/**
 * Gets the device name - returns custom name if set, otherwise auto-detected.
 */
export function getDeviceName(): string {
  try {
    const customName = getString(DEVICE_NAME_KEY);
    if (customName) {
      return customName;
    }
  } catch {
    // Fall through to auto-detect
  }
  return getAutoDetectedDeviceName();
}

/**
 * Sets a custom device name. Pass null/undefined/empty to reset to auto-detected.
 */
export function setDeviceName(name: string | null): void {
  if (name && name.trim()) {
    setString(DEVICE_NAME_KEY, name.trim());
  } else {
    // Remove custom name to fall back to auto-detected
    try {
      removeKey(DEVICE_NAME_KEY);
    } catch {
      // Ignore deletion errors
    }
  }
}

/**
 * Check if a custom device name is set.
 */
export function hasCustomDeviceName(): boolean {
  try {
    return !!getString(DEVICE_NAME_KEY);
  } catch {
    return false;
  }
}
