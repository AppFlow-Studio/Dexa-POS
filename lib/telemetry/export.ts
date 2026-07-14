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
 * Fallback retrieval for release builds: the app's private cache is not
 * adb-readable on a non-debuggable build (`run-as: package not debuggable`),
 * and a bare Landi may have no share targets. logcat is ALWAYS capturable
 * over USB, so chunk the JSON through console.warn (console.log is stripped
 * by babel in preview/production builds; warn survives).
 *
 * Retrieve with:
 *   adb logcat -d | grep '\[telemetry-export\]' | sed 's/.*\[telemetry-export\] //' \
 *     | grep -v -e '^BEGIN' -e '^END' | cut -d' ' -f2- | tr -d '\n' > telemetry.json
 */
const LOGCAT_CHUNK_CHARS = 3500; // logcat truncates ~4KB per line

export function dumpTelemetryToLogcat(json: string, fileUri: string): void {
  const total = Math.ceil(json.length / LOGCAT_CHUNK_CHARS);
  console.warn(`[telemetry-export] BEGIN ${fileUri} ${total} chunks ${json.length}B`);
  for (let i = 0; i < total; i++) {
    console.warn(
      `[telemetry-export] ${i + 1}/${total} ${json.slice(
        i * LOGCAT_CHUNK_CHARS,
        (i + 1) * LOGCAT_CHUNK_CHARS,
      )}`,
    );
  }
  console.warn(`[telemetry-export] END ${fileUri}`);
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

  // Always mirror to logcat: the Android share sheet reports "available"
  // even when the device has no target that can reach the analyst's laptop,
  // and USB+adb is the pilot's actual retrieval path.
  dumpTelemetryToLogcat(json, fileUri);

  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(fileUri, {
      mimeType: "application/json",
      dialogTitle: "Dexa POS Telemetry Export",
    });
  }
  return fileUri;
}
