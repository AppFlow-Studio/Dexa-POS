// services/hardware/heartbeat.ts

import { AppState, AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as Application from "expo-application";
import * as Battery from "expo-battery";
import { getCachedCapabilities } from "./deviceDetection";
import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// SINGLETON STATE
// ============================================================================

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds
const BACKGROUND_OFFLINE_DELAY_MS = 2 * 60_000; // 2 minutes before marking offline

let intervalId: ReturnType<typeof setInterval> | null = null;
let backgroundTimerId: ReturnType<typeof setTimeout> | null = null;
let appStateSubscription: ReturnType<
  typeof AppState.addEventListener
> | null = null;
let currentSupabase: SupabaseClient | null = null;
let currentStationId: string | null = null;
let currentLocationId: string | null = null;

// ============================================================================
// HEARTBEAT TICK
// ============================================================================

async function sendHeartbeat(): Promise<void> {
  if (!currentSupabase || !currentStationId || !currentLocationId) return;

  try {
    // 1. Call station_heartbeat RPC (updates stations.is_online + last_heartbeat_at)
    const { error: rpcError } = await currentSupabase.rpc("station_heartbeat", {
      p_station_id: currentStationId,
    });

    if (rpcError) {
      console.warn("[Heartbeat] RPC error:", rpcError.message);
    }

    // 2. Collect fresh metrics
    let networkType: string | null = null;
    try {
      const netState = await NetInfo.fetch();
      networkType = netState.type || null;
    } catch {}

    let batteryLevel: number | null = null;
    try {
      const level = await Battery.getBatteryLevelAsync();
      batteryLevel = level >= 0 ? Math.round(level * 100) : null;
    } catch {}

    const cached = getCachedCapabilities();
    const appVersion = Application.nativeApplicationVersion || null;

    // 3. Insert into device_heartbeats
    const { error: insertError } = await currentSupabase
      .from("device_heartbeats")
      .insert({
        station_id: currentStationId,
        location_id: currentLocationId,
        is_online: true,
        app_version: appVersion,
        battery_level: batteryLevel,
        network_type: networkType,
        printer_status: cached?.hasBuiltinPrinter ? "available" : "none",
        cfd_connected: cached?.hasBuiltinCfd ?? false,
      });

    if (insertError) {
      console.warn("[Heartbeat] Insert error:", insertError.message);
    }

    // 4. Update battery level on stations table
    if (batteryLevel !== null) {
      const { error: batteryError } = await currentSupabase
        .from("stations")
        .update({ battery_level: batteryLevel })
        .eq("id", currentStationId);

      if (batteryError) {
        console.warn("[Heartbeat] Battery update error:", batteryError.message);
      }
    }
  } catch (e) {
    console.warn("[Heartbeat] Failed:", e);
  }
}

// ============================================================================
// OFFLINE SIGNAL
// ============================================================================

async function sendGoingOffline(): Promise<void> {
  if (!currentSupabase || !currentStationId) return;
  try {
    await currentSupabase
      .from("stations")
      .update({ is_online: false })
      .eq("id", currentStationId);
    console.log("[Heartbeat] Sent offline signal");
  } catch (e) {
    console.warn("[Heartbeat] Failed to send offline signal:", e);
  }
}

// ============================================================================
// APP STATE HANDLING
// ============================================================================

function handleAppState(nextState: AppStateStatus): void {
  if (nextState === "active") {
    // Cancel pending offline timer if we came back quickly
    if (backgroundTimerId) {
      clearTimeout(backgroundTimerId);
      backgroundTimerId = null;
      console.log("[Heartbeat] Cancelled background offline timer");
    }

    // Resume: send immediate heartbeat and restart interval
    if (!intervalId && currentStationId) {
      sendHeartbeat();
      intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);
      console.log("[Heartbeat] Resumed on app active");
    }
  } else {
    // Background/inactive: pause interval to save battery
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
      console.log("[Heartbeat] Paused (app backgrounded)");
    }

    // Start a timer — if app stays backgrounded for 2 min, mark offline
    if (!backgroundTimerId && currentStationId) {
      backgroundTimerId = setTimeout(() => {
        backgroundTimerId = null;
        sendGoingOffline();
      }, BACKGROUND_OFFLINE_DELAY_MS);
      console.log("[Heartbeat] Started 2-min background offline timer");
    }
  }
}

// ============================================================================
// PUBLIC API
// ============================================================================

export function startHeartbeat(
  supabase: SupabaseClient,
  stationId: string,
  locationId: string,
): void {
  // Avoid duplicate starts
  if (intervalId) {
    stopHeartbeat();
  }

  currentSupabase = supabase;
  currentStationId = stationId;
  currentLocationId = locationId;

  // Send initial heartbeat immediately
  sendHeartbeat();

  // Start interval
  intervalId = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL_MS);

  // Listen for app state changes
  appStateSubscription = AppState.addEventListener("change", handleAppState);

  console.log(`[Heartbeat] Started for station ${stationId} (every 60s)`);
}

export async function stopHeartbeat(): Promise<void> {
  if (backgroundTimerId) {
    clearTimeout(backgroundTimerId);
    backgroundTimerId = null;
  }

  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  // Send immediate offline signal before clearing refs
  await sendGoingOffline();

  currentSupabase = null;
  currentStationId = null;
  currentLocationId = null;

  console.log("[Heartbeat] Stopped");
}

export function isHeartbeatRunning(): boolean {
  return intervalId !== null;
}
