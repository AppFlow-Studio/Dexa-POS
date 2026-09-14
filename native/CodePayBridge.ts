import { NativeModules, Platform } from "react-native";
import type { CodePayIntentResult } from "@/types/codepay";

/**
 * JS bridge to the native CodePayBridge module (Android only).
 *
 * Drives the on-terminal CodePay Register app via an Android Intent
 * (startActivityForResult) and resolves with the result delivered to
 * onActivityResult. See CodePayBridgeModule.kt.
 *
 * The native side resolves a structured object for every transaction outcome
 * (approved / declined / cancelled / timed out) and only REJECTS for
 * environment errors: NO_ACTIVITY, BUSY, NO_CODEPAY_REGISTER, LAUNCH_FAILED.
 */

interface CodePayBridgeNative {
  transact(
    topic: string,
    appId: string,
    bizDataJson: string,
    timeoutMs: number,
  ): Promise<CodePayIntentResult>;
  isRegisterAvailable(): Promise<boolean>;
}

const nativeModule = (
  NativeModules as { CodePayBridgeModule?: CodePayBridgeNative }
).CodePayBridgeModule;

/** True when the native CodePay bridge is present in this build (Android only). */
export function isCodePayBridgeAvailable(): boolean {
  return Platform.OS === "android" && !!nativeModule;
}

/**
 * Launch a CodePay Register transaction and await its Intent result.
 * Rejects if the native module is unavailable or CodePay Register isn't
 * installed / no foreground activity / a call is already in flight.
 */
export function codepayTransact(
  topic: string,
  appId: string,
  bizDataJson: string,
  timeoutMs: number,
): Promise<CodePayIntentResult> {
  if (!nativeModule) {
    return Promise.reject(
      new Error("CodePayBridge native module is not available"),
    );
  }
  return nativeModule.transact(topic, appId, bizDataJson, timeoutMs);
}

/**
 * Non-intrusive presence check: is the CodePay Register app installed and does
 * it handle the transaction Intent? Does NOT launch anything (safe for the
 * background health-check tick). Resolves false when the native module is
 * absent or nothing handles the action.
 */
export async function codepayIsRegisterAvailable(): Promise<boolean> {
  if (!nativeModule) return false;
  try {
    return await nativeModule.isRegisterAvailable();
  } catch {
    return false;
  }
}
