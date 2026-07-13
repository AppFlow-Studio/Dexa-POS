/**
 * Telemetry export — hidden Settings action (long-press the version label).
 *
 * Flush -> build the versioned dump -> write JSON to the cache directory ->
 * native share sheet via expo-sharing (real file over content URI, so
 * multi-hundred-KB dumps survive Android's share limits).
 *
 * Local only by construction: MMKV -> local file -> share sheet. A POS on
 * restaurant Wi-Fi never spends bandwidth on metrics, and the flow works
 * fully offline. Even if sharing fails, the file remains in cacheDirectory
 * (retrievable via adb / file manager).
 */
import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Device from "expo-device";
import * as FileSystem from "expo-file-system";
import * as Sharing from "expo-sharing";
import {
  flushToMMKV,
  getPrevSessionSnapshot,
  snapshot,
  TelemetrySnapshot,
} from "@/lib/telemetry/registry";
import { DRIFT_THRESHOLD_MS, TICK_MS } from "@/lib/telemetry/longTaskWatcher";

export interface TelemetryExportDump {
  schema: 1;
  exportedAt: string;
  device: {
    os: string;
    osVersion: string;
    model: string | null;
    appVersion: string;
  };
  config: {
    tickMs: number;
    driftThresholdMs: number;
  };
  session: TelemetrySnapshot;
  prevSession: TelemetrySnapshot | null;
}

export function buildTelemetryDump(): TelemetryExportDump {
  return {
    schema: 1,
    exportedAt: new Date().toISOString(),
    device: {
      os: Platform.OS,
      osVersion: String(Platform.Version),
      model: Device.modelName ?? null,
      appVersion: Constants.expoConfig?.version ?? "unknown",
    },
    config: {
      tickMs: TICK_MS,
      driftThresholdMs: DRIFT_THRESHOLD_MS,
    },
    session: snapshot(),
    prevSession: getPrevSessionSnapshot(),
  };
}

/**
 * Export the telemetry dump. Returns the file URI (also useful for tests /
 * adb retrieval when no share target exists on the device).
 */
export async function exportTelemetry(): Promise<string> {
  flushToMMKV();
  const json = JSON.stringify(buildTelemetryDump());
  const fileUri = `${FileSystem.cacheDirectory}telemetry-${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(fileUri, json);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: "Dexa POS Telemetry Export",
    });
  }
  return fileUri;
}
