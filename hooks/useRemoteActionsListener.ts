import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import {
  handleClearCache,
  handleConfigUpdate,
  handleDeactivateStation,
  handleForceRefresh,
  handleRestartApp,
  handleSendLogs,
  logRemoteAction,
  reportActionStatus,
} from "@/services/remoteActions";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import {
  ConfigUpdatePayload,
  RemoteActionPayload,
  RemoteActionType,
} from "@/types/remoteActions";
import { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { useCallback, useEffect, useRef } from "react";

/**
 * Subscribes to station-scoped broadcast channel and handles remote device
 * management actions (force_refresh, clear_cache, restart_app, force_logout,
 * deactivate, config_update, send_logs).
 *
 * Each action reports status feedback on the same channel and writes an audit log.
 */
export function useRemoteActionsListener() {
  const supabase = useSupabaseClient();
  const router = useRouter();

  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const clearSelectedStation = useStoreSettingsStore((s) => s.clearSelectedStation);
  const setStationSessionId = useStoreSettingsStore((s) => s.setStationSessionId);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const isProcessingRef = useRef(false);

  // Keep refs to avoid stale closures in broadcast callbacks
  const supabaseRef = useRef(supabase);
  const routerRef = useRef(router);
  supabaseRef.current = supabase;
  routerRef.current = router;

  const stationId = selectedStation?.id ?? null;

  const performLogout = useCallback(() => {
    console.log("[RemoteActions] Performing logout");
    setStationSessionId(null);
    clearSelectedStation();
    routerRef.current.replace("/station-select");
  }, [setStationSessionId, clearSelectedStation]);

  const performLogoutRef = useRef(performLogout);
  performLogoutRef.current = performLogout;

  // ============================================================================
  // Action dispatcher
  // ============================================================================

  const handleAction = useCallback(
    async (
      channel: RealtimeChannel,
      payload: RemoteActionPayload,
      currentStationId: string
    ) => {
      if (isProcessingRef.current) {
        console.warn("[RemoteActions] Already processing an action, ignoring:", payload.action);
        return;
      }
      isProcessingRef.current = true;

      const { action, request_id, initiated_by } = payload;

      try {
        // Report received
        reportActionStatus(channel, action, request_id, currentStationId, "received");

        // For restart_app, report completed BEFORE restarting (reload kills JS)
        if (action === "restart_app") {
          reportActionStatus(channel, action, request_id, currentStationId, "completed");
          logRemoteAction(supabaseRef.current, action, request_id, currentStationId, initiated_by, "completed");
          await handleRestartApp();
          return; // JS context dies here
        }

        // Execute the action
        switch (action) {
          case "force_refresh":
            handleForceRefresh();
            break;

          case "clear_cache":
            handleClearCache();
            break;

          case "force_logout":
            performLogoutRef.current();
            break;

          case "deactivate":
            await handleDeactivateStation(supabaseRef.current, currentStationId);
            performLogoutRef.current();
            break;

          case "config_update":
            handleConfigUpdate(payload as ConfigUpdatePayload);
            break;

          case "send_logs":
            await handleSendLogs(supabaseRef.current, currentStationId);
            break;

          default:
            throw new Error(`Unknown action: ${action}`);
        }

        // Report completed
        reportActionStatus(channel, action, request_id, currentStationId, "completed");
        logRemoteAction(supabaseRef.current, action, request_id, currentStationId, initiated_by, "completed");
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error(`[RemoteActions] Action ${action} failed:`, errorMsg);
        reportActionStatus(channel, action, request_id, currentStationId, "failed", errorMsg);
        logRemoteAction(supabaseRef.current, action, request_id, currentStationId, initiated_by, "failed", errorMsg);
      } finally {
        isProcessingRef.current = false;
      }
    },
    []
  );

  // ============================================================================
  // Channel subscription
  // ============================================================================

  useEffect(() => {
    if (!stationId) return;

    const channelName = `station:${stationId}`;
    console.log(`[RemoteActions] Subscribing to broadcast channel: ${channelName}`);

    const actionTypes: RemoteActionType[] = [
      "force_refresh",
      "clear_cache",
      "restart_app",
      "force_logout",
      "deactivate",
      "config_update",
      "send_logs",
    ];

    let ch = supabase.channel(channelName);

    for (const event of actionTypes) {
      ch = ch.on("broadcast", { event }, (msg) => {
        const payload = msg.payload as RemoteActionPayload;
        console.log(`[RemoteActions] Received event: ${event}`, payload.request_id);
        handleAction(channelRef.current!, payload, stationId);
      });
    }

    ch.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        console.log("[RemoteActions] Broadcast channel connected");
      } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
        console.warn(`[RemoteActions] Broadcast channel ${status}`);
      }
    });

    channelRef.current = ch;

    return () => {
      if (channelRef.current) {
        console.log("[RemoteActions] Removing broadcast channel");
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [stationId, supabase, handleAction]);
}
