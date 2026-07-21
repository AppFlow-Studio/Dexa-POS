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
let currentSessionStart: string | null = null; // reset each startHeartbeat() call


// ============================================================================
// HEARTBEAT TICK
// ============================================================================

async function sendHeartbeat(): Promise<void> {
  // Capture local refs so mid-execution stopHeartbeat() can't null them out
  const supabase = currentSupabase;
  const stationId = currentStationId;
  const locationId = currentLocationId;
  if (!supabase || !stationId || !locationId) return;

  try {
    // 1. Call station_heartbeat RPC (updates stations.is_online + last_heartbeat_at)
    const { error: rpcError } = await supabase.rpc("station_heartbeat", {
      p_station_id: stationId,
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

    // 3. Upsert into device_heartbeats — one row per station.
    // created_at is set to session start on every upsert so updated_at - created_at = current session uptime.
    
    const { error: upsertError } = await supabase
      .from("device_heartbeats")
      .upsert(
        {
          station_id: stationId,
          location_id: locationId,
          is_online: true,
          app_version: appVersion,
          battery_level: batteryLevel,
          network_type: networkType,
          printer_status: cached?.hasBuiltinPrinter ? "available" : "none",
          cfd_connected: cached?.hasBuiltinCfd ?? false,
          created_at: currentSessionStart,
        },
        { onConflict: "station_id" }
      );

    if (upsertError) {
      console.warn("[Heartbeat] Upsert error:", upsertError.message);
    }

  } catch (e) {
    console.warn("[Heartbeat] Failed:", e);
  }
}

// ============================================================================
// OFFLINE SIGNAL
// ============================================================================

async function sendGoingOffline(): Promise<void> {
  const supabase = currentSupabase;
  const stationId = currentStationId;
  if (!supabase || !stationId) return;
  try {
    await supabase
      .from("stations")
      .update({ is_online: false })
      .eq("id", stationId);
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
  currentSessionStart = new Date().toISOString();

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
  currentSessionStart = null;

  console.log("[Heartbeat] Stopped");
}

export function isHeartbeatRunning(): boolean {
  return intervalId !== null;
}
