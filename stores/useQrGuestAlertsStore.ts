/**
 * useQrGuestAlertsStore — open QR guest "call server" alerts for the location.
 *
 * Fed by:
 *  - seed(): direct select on qr_guest_alerts (status <> 'resolved')
 *  - qr_guest_alert_changed realtime broadcasts on the existing
 *    location:{id}:orders channel (handled in useOrdersRealtime)
 *  - pollOpenCount(): get_qr_guest_alert_open_count fallback while realtime
 *    is down — on mismatch, re-seed.
 *
 * The server enforces dedup (uq_qr_guest_alert_active) and every broadcast
 * payload carries the authoritative open_alert_count — trust it, never count
 * client-side. Resolve goes through resolve_qr_guest_alert (idempotent).
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { create } from "zustand";
import { playQrGuestAlertSound } from "@/services/kds/kdsSoundService";
import { useEmployeeStore } from "./useEmployeeStore";
import { useNotificationStore } from "./useNotificationStore";

/**
 * Mirror an alert into the session-dock notification sheet (informational —
 * resolving still happens via the bell). Deduped by alertId; removed on
 * resolve. Tagged to this station's logged-in employee so the per-employee
 * panel filter shows it.
 */
function mirrorNotification(alert: QrGuestAlert, skipIfExists = false) {
  const employeeId =
    useEmployeeStore.getState().loggedInEmployee?.id ?? null;
  if (!employeeId) return;
  const store = useNotificationStore.getState();
  const exists = store.notifications.some(
    (n) =>
      n.type === "qr_call_server" && n.payload?.alertId === alert.id,
  );
  if (exists && skipIfExists) return;
  // Refresh in place: drop any existing entry for this alert first.
  if (exists) {
    store.removeNotification({
      type: "qr_call_server",
      payload: { alertId: alert.id },
    });
  }
  store.addNotification({
    type: "qr_call_server",
    message: `${alert.tableLabel} — guest called a server${alert.message ? `: “${alert.message}”` : ""}`,
    employeeId,
    payload: { alertId: alert.id },
  });
}

function unmirrorNotification(alertId: string) {
  useNotificationStore.getState().removeNotification({
    type: "qr_call_server",
    payload: { alertId },
  });
}

export interface QrGuestAlert {
  id: string;
  tableLabel: string;
  alertType: string;
  message: string | null;
  createdAt: string;
  orderId: string | null;
  onlineOrderSessionId: string | null;
}

export interface QrGuestAlertBroadcast {
  operation: "upsert" | "resolved";
  location_id: string;
  alert_id: string;
  status: string;
  alert_type: string;
  table_label: string | null;
  message: string | null;
  created_at: string;
  resolved_at?: string | null;
  resolved_by?: string | null;
  order_id?: string | null;
  online_order_session_id?: string | null;
  open_alert_count?: number;
}

interface QrGuestAlertsState {
  alerts: QrGuestAlert[];
  openCount: number;
  /** Seed / re-seed the open alert list from the DB. */
  seed: (client: SupabaseClient, locationId: string) => Promise<void>;
  /** Apply a qr_guest_alert_changed broadcast payload. */
  applyBroadcast: (payload: QrGuestAlertBroadcast) => void;
  /** Fallback poll while realtime is down; re-seeds on count mismatch. */
  pollOpenCount: (client: SupabaseClient, locationId: string) => Promise<void>;
  /** Resolve an alert (optimistic remove; broadcast reconciles). */
  resolve: (
    client: SupabaseClient,
    alertId: string,
  ) => Promise<{ error: any | null }>;
  clear: () => void;
}

export const useQrGuestAlertsStore = create<QrGuestAlertsState>((set, get) => ({
  alerts: [],
  openCount: 0,

  seed: async (client, locationId) => {
    const { data, error } = await client
      .from("qr_guest_alerts")
      .select(
        "id, table_label, alert_type, message, created_at, order_id, online_order_session_id",
      )
      .eq("location_id", locationId)
      .neq("status", "resolved")
      .order("created_at", { ascending: true });
    if (error) {
      console.warn("[QrGuestAlerts] seed failed:", error.message, error);
      return;
    }
    if (__DEV__) {
      console.log(
        `[QrGuestAlerts] seed: ${data?.length ?? 0} open alert(s) for location ${locationId}`,
      );
    }
    const alerts: QrGuestAlert[] = (data ?? []).map((row: any) => ({
      id: String(row.id),
      tableLabel: row.table_label ?? "Unknown table",
      alertType: row.alert_type ?? "call_server",
      message: row.message ?? null,
      createdAt: String(row.created_at),
      orderId: row.order_id ?? null,
      onlineOrderSessionId: row.online_order_session_id ?? null,
    }));
    set({ alerts, openCount: alerts.length });
    // Mirror open alerts into the dock notification sheet on cold start, and
    // drop persisted mirrors for alerts that were resolved while the app was
    // closed (the notification store persists across restarts).
    const openIds = new Set(alerts.map((a) => a.id));
    const notifStore = useNotificationStore.getState();
    for (const n of notifStore.notifications) {
      if (
        n.type === "qr_call_server" &&
        n.payload?.alertId &&
        !openIds.has(n.payload.alertId as string)
      ) {
        unmirrorNotification(n.payload.alertId as string);
      }
    }
    for (const a of alerts) mirrorNotification(a, true);
  },

  applyBroadcast: (payload) => {
    if (!payload?.alert_id) return;
    const { alerts } = get();
    let next: QrGuestAlert[];
    if (payload.operation === "resolved" || payload.status === "resolved") {
      next = alerts.filter((a) => a.id !== payload.alert_id);
      unmirrorNotification(payload.alert_id);
    } else {
      const updated: QrGuestAlert = {
        id: payload.alert_id,
        tableLabel: payload.table_label ?? "Unknown table",
        alertType: payload.alert_type ?? "call_server",
        message: payload.message ?? null,
        createdAt: payload.created_at,
        orderId: payload.order_id ?? null,
        onlineOrderSessionId: payload.online_order_session_id ?? null,
      };
      const idx = alerts.findIndex((a) => a.id === payload.alert_id);
      next =
        idx >= 0
          ? alerts.map((a) => (a.id === payload.alert_id ? updated : a))
          : [...alerts, updated];
      mirrorNotification(updated);
      // Ring only for genuinely-new alerts (not refreshes of an existing one).
      if (idx < 0) playQrGuestAlertSound();
    }
    set({
      alerts: next,
      // Broadcast count is authoritative when present.
      openCount:
        typeof payload.open_alert_count === "number"
          ? payload.open_alert_count
          : next.length,
    });
  },

  pollOpenCount: async (client, locationId) => {
    const { data, error } = await client.rpc("get_qr_guest_alert_open_count", {
      p_location_id: locationId,
    });
    if (error) return;
    const count = (data as any)?.open_alert_count;
    if (typeof count === "number" && count !== get().alerts.length) {
      await get().seed(client, locationId);
    }
  },

  resolve: async (client, alertId) => {
    // Optimistic remove; the resolve broadcast (or a failed RPC restore via
    // re-seed on next poll) reconciles.
    const prev = get().alerts;
    set({
      alerts: prev.filter((a) => a.id !== alertId),
      openCount: Math.max(0, get().openCount - 1),
    });
    unmirrorNotification(alertId);
    const { data, error } = await client.rpc("resolve_qr_guest_alert", {
      p_alert_id: alertId,
    });
    const result = data as any;
    if (error || result?.success === false) {
      // Restore on failure.
      set({ alerts: prev, openCount: prev.length });
      return { error: error ?? { message: result?.error ?? "Resolve failed" } };
    }
    if (typeof result?.open_alert_count === "number") {
      set({ openCount: result.open_alert_count });
    }
    return { error: null };
  },

  clear: () => set({ alerts: [], openCount: 0 }),
}));
