// services/hardware/heartbeat.ts

import { AppState, AppStateStatus } from "react-native";
import NetInfo from "@react-native-community/netinfo";
import * as Application from "expo-application";
import { getCachedCapabilities } from "./deviceDetection";
import { SupabaseClient } from "@supabase/supabase-js";

// ============================================================================
// SINGLETON STATE
// ============================================================================

const HEARTBEAT_INTERVAL_MS = 60_000; // 60 seconds

let intervalId: ReturnType<typeof setInterval> | null = null;
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
        battery_level: null,
        network_type: networkType,
        printer_status: cached?.hasBuiltinPrinter ? "available" : "none",
        cfd_connected: cached?.hasBuiltinCfd ?? false,
      });

    if (insertError) {
      console.warn("[Heartbeat] Insert error:", insertError.message);
    }
  } catch (e) {
    console.warn("[Heartbeat] Failed:", e);
  }
}

// ============================================================================
// APP STATE HANDLING
// ============================================================================

function handleAppState(nextState: AppStateStatus): void {
  if (nextState === "active") {
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

export function stopHeartbeat(): void {
  if (intervalId) {
    clearInterval(intervalId);
    intervalId = null;
  }

  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }

  currentSupabase = null;
  currentStationId = null;
  currentLocationId = null;

  console.log("[Heartbeat] Stopped");
}

export function isHeartbeatRunning(): boolean {
  return intervalId !== null;
}
