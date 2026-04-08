export type RemoteActionType =
  | "force_refresh"
  | "clear_cache"
  | "restart_app"
  | "force_logout"
  | "deactivate"
  | "config_update"
  | "send_logs";

export interface RemoteActionPayload {
  action: RemoteActionType;
  request_id: string;
  initiated_by: string;
  timestamp: string;
}

export interface ConfigUpdatePayload extends RemoteActionPayload {
  action: "config_update";
  settings: Record<string, unknown>;
}

export type ActionStatus = "received" | "completed" | "failed";

export interface ActionStatusPayload {
  action: RemoteActionType;
  request_id: string;
  station_id: string;
  status: ActionStatus;
  error?: string;
  completed_at: string;
}

export interface LogEntry {
  timestamp: string;
  level: "log" | "warn" | "error";
  message: string;
}
