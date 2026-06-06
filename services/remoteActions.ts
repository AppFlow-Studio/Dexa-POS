import { queryClient } from "@/contexts/TanstackProvider";
import { getLogsAsText } from "@/lib/logCollector";
import { clearCache } from "@/services/cacheService";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import type { ConfigNamespace } from "@/types/locationConfig";
import {
  ActionStatus,
  ActionStatusPayload,
  ConfigUpdatePayload,
  RemoteActionType,
} from "@/types/remoteActions";
import { SupabaseClient, RealtimeChannel } from "@supabase/supabase-js";
import * as Updates from "expo-updates";

// ============================================================================
// Status Feedback
// ============================================================================

export function reportActionStatus(
  channel: RealtimeChannel,
  action: RemoteActionType,
  requestId: string,
  stationId: string,
  status: ActionStatus,
  error?: string
) {
  const payload: ActionStatusPayload = {
    action,
    request_id: requestId,
    station_id: stationId,
    status,
    ...(error && { error }),
    completed_at: new Date().toISOString(),
  };

  channel.send({
    type: "broadcast",
    event: "action_status",
    payload,
  });
}

// ============================================================================
// Audit Logging
// ============================================================================

export function logRemoteAction(
  supabase: SupabaseClient,
  action: RemoteActionType,
  requestId: string,
  stationId: string,
  initiatedBy: string,
  status: ActionStatus,
  error?: string
) {
  // Fire-and-forget insert into audit_logs
  supabase
    .from("audit_logs")
    .insert({
      action: `remote_action:${action}`,
      action_category: "remote_device_management",
      severity: action === "deactivate" ? "high" : "medium",
      resource_type: "station",
      resource_id: stationId,
      status: status === "completed" ? "success" : status === "failed" ? "error" : "pending",
      actor_name: initiatedBy,
      metadata: { request_id: requestId },
      ...(error && { error_message: error }),
    })
    .then(({ error: insertError }) => {
      if (insertError) {
        console.warn("[RemoteActions] Failed to write audit log:", insertError.message);
      }
    });
}

// ============================================================================
// Action Handlers
// ============================================================================

export function handleForceRefresh() {
  console.log("[RemoteActions] Force refresh: invalidating all queries");
  queryClient.invalidateQueries();
}

export function handleClearCache() {
  console.log("[RemoteActions] Clear cache: clearing cache + query client");
  clearCache();
  queryClient.clear();
}

export async function handleRestartApp() {
  console.log("[RemoteActions] Restart app: reloading in 500ms");
  // Delay to allow status broadcast to send before JS context is killed
  await new Promise((resolve) => setTimeout(resolve, 500));
  await Updates.reloadAsync();
}

// Allowlisted flat keys → { namespace, field } mapping for remote config updates
const ALLOWED_CONFIG_MAP: Record<string, { namespace: ConfigNamespace; field: string }> = {
  onlineOrderingEnabled:    { namespace: "onlineOrdering", field: "enabled" },
  onlinePauseReason:        { namespace: "onlineOrdering", field: "pauseReason" },
  autoAcceptOrders:         { namespace: "onlineOrdering", field: "autoAcceptOrders" },
  dynamicPrepTimeEnabled:   { namespace: "onlineOrdering", field: "dynamicPrepTimeEnabled" },
  basePrepTime:             { namespace: "onlineOrdering", field: "basePrepTime" },
  preOrderingEnabled:       { namespace: "onlineOrdering", field: "preOrderingEnabled" },
  preOrderMaxDays:          { namespace: "onlineOrdering", field: "preOrderMaxDays" },
  preOrderMaxDaily:         { namespace: "onlineOrdering", field: "preOrderMaxDaily" },
  kdsAutoFireEnabled:       { namespace: "kds", field: "autoFireEnabled" },
  kdsAutoFireDelayMinutes:  { namespace: "kds", field: "autoFireDelayMinutes" },
};

export function handleConfigUpdate(payload: ConfigUpdatePayload) {
  const { settings } = payload;
  const store = useLocationConfigStore.getState();

  const applied: string[] = [];
  const skipped: string[] = [];

  // Group by namespace for batched updates
  const updates: Partial<Record<ConfigNamespace, Record<string, unknown>>> = {};

  for (const [key, value] of Object.entries(settings)) {
    const mapping = ALLOWED_CONFIG_MAP[key];
    if (mapping) {
      if (!updates[mapping.namespace]) {
        updates[mapping.namespace] = {};
      }
      updates[mapping.namespace]![mapping.field] = value;
      applied.push(key);
    } else {
      skipped.push(key);
    }
  }

  // Apply batched updates per namespace
  for (const [namespace, data] of Object.entries(updates)) {
    store.applyRemoteConfig(namespace as ConfigNamespace, data);
  }

  console.log(
    `[RemoteActions] Config update: applied=[${applied.join(", ")}], skipped=[${skipped.join(", ")}]`
  );

  if (skipped.length > 0) {
    throw new Error(`Disallowed config keys: ${skipped.join(", ")}`);
  }
}

export async function handleDeactivateStation(
  supabase: SupabaseClient,
  stationId: string
) {
  console.log(`[RemoteActions] Deactivate station: ${stationId}`);

  const { error } = await supabase
    .from("stations")
    .update({ is_active: false, current_receipt_printer_id: null })
    .eq("id", stationId);

  if (error) {
    throw new Error(`Failed to deactivate station: ${error.message}`);
  }
}

export async function handleSendLogs(
  supabase: SupabaseClient,
  stationId: string
) {
  console.log("[RemoteActions] Sending device logs");

  const logsText = getLogsAsText();
  const fileName = `${stationId}/${new Date().toISOString().replace(/[:.]/g, "-")}.log`;

  const { error } = await supabase.storage
    .from("device-logs")
    .upload(fileName, logsText, {
      contentType: "text/plain",
      upsert: false,
    });

  if (error) {
    throw new Error(`Failed to upload logs: ${error.message}`);
  }

  console.log(`[RemoteActions] Logs uploaded: ${fileName}`);
}
