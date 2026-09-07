/**
 * Cash Drawer Service
 *
 * Wraps Supabase operations for cash drawer session management.
 * Coordinates between the local store and the backend.
 */

import { captureRpcError } from "@/lib/supabase";
import {
    DenominationCount,
    DrawerOperationType,
    DrawerSession,
    isDebitOperation,
    isNoEffectOperation,
    useCashDrawerStore,
} from "@/stores/useCashDrawerStore";
import { usePrinterStore } from "@/stores/usePrinterStore";
import { SupabaseClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";

/**
 * Standard denomination rows for US currency.
 */
export const US_DENOMINATIONS: Omit<DenominationCount, "count" | "total">[] = [
  { denomination: "100", label: "$100 Bills" },
  { denomination: "50", label: "$50 Bills" },
  { denomination: "20", label: "$20 Bills" },
  { denomination: "10", label: "$10 Bills" },
  { denomination: "5", label: "$5 Bills" },
  { denomination: "1", label: "$1 Bills" },
  { denomination: "0.25", label: "Quarters" },
  { denomination: "0.10", label: "Dimes" },
  { denomination: "0.05", label: "Nickels" },
  { denomination: "0.01", label: "Pennies" },
];

/**
 * Find the drawer assigned to a station, including its recorded host printer.
 */
export async function findDrawerForStation(
  supabase: SupabaseClient,
  stationId: string,
  locationId: string,
): Promise<{ id: string; name: string; hostPrinterId: string | null } | null> {
  const { data, error } = await supabase
    .from("cash_drawers")
    // select('*') — NOT an explicit host_printer_id column list. Prod may not
    // have the column yet (staging-first migration); enumerating it would 400
    // and break drawer hydration on prod. With '*' the field is simply absent
    // (→ null) until the prod migration lands. Defensive by construction.
    .select("*")
    .eq("station_id", stationId)
    .eq("location_id", locationId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  // Generated types (UTF-16, regenerated out-of-band) may still lag the
  // column — read via a narrow cast.
  const row = data as any;
  return {
    id: row.id as string,
    name: row.name as string,
    hostPrinterId: (row.host_printer_id ?? null) as string | null,
  };
}

/**
 * Record which printer physically holds the drawer (cash_drawers.host_printer_id).
 * Pass null to clear the binding (revert to sense-based inference). Also updates
 * the local store so PrinterService.openCashDrawer sees it synchronously.
 */
// Self-adapting prod safety: the client ships (incl. via OTA) independently of
// the host_printer_id DB migration. Reads use select('*') so they never 400;
// the first write that hits a missing column flips this latch so we stop
// attempting writes for the session (resets on restart, i.e. after the
// migration lands). Replaces the need for a feature flag.
let hostPrinterColumnUnavailable = false;

function isMissingHostPrinterColumn(error: {
  code?: string;
  message?: string;
}): boolean {
  const code = error.code ?? "";
  const msg = error.message ?? "";
  if (code === "42703" || code === "PGRST204") return true;
  return (
    /host_printer_id/i.test(msg) &&
    /column|schema cache|does not exist|could not find/i.test(msg)
  );
}

export async function setDrawerHostPrinter(
  supabase: SupabaseClient,
  drawerId: string,
  hostPrinterId: string | null,
): Promise<boolean> {
  const { error } = await supabase
    .from("cash_drawers")
    // Payload cast: host_printer_id not yet in the generated Update type.
    .update({ host_printer_id: hostPrinterId } as never)
    .eq("id", drawerId);
  if (error) {
    if (isMissingHostPrinterColumn(error)) {
      // Migration not applied on this DB yet — latch off and stay quiet.
      hostPrinterColumnUnavailable = true;
      return false;
    }
    console.warn(
      "[cashDrawerService] setDrawerHostPrinter failed:",
      error.message,
    );
    return false;
  }
  // Only mirror into the store if this is the currently-active drawer.
  if (useCashDrawerStore.getState().drawerId === drawerId) {
    useCashDrawerStore.getState().setHostPrinterId(hostPrinterId);
  }
  return true;
}

/**
 * Auto-detect and bind the drawer's host printer from persisted Star
 * drawer-sense. Conservative: binds ONLY when exactly one active Star at the
 * location firmware-reports a wired drawer (lastDrawerExternalDevice === true).
 * Ambiguous (0 or >1) leaves it unbound for the installer to set via the picker.
 */
export async function maybeAutoBindDrawerHost(
  supabase: SupabaseClient,
  drawerId: string,
  locationId: string,
): Promise<string | null> {
  // Skip if a prior write proved the column absent on this DB (pre-migration).
  if (hostPrinterColumnUnavailable) return null;
  const wired = usePrinterStore
    .getState()
    .printers.filter((p) => {
      if (!p.isActive || p.locationId !== locationId) return false;
      if (p.printerType !== "star_micronics") return false;
      const m = (p.metadata ?? {}) as Record<string, unknown>;
      return m.lastDrawerExternalDevice === true;
    });
  if (wired.length !== 1) return null;
  const ok = await setDrawerHostPrinter(supabase, drawerId, wired[0].id);
  return ok ? wired[0].id : null;
}

/**
 * Open a cash drawer session.
 * Creates a session record in the backend and updates the local store.
 */
export async function openDrawerSession(
  supabase: SupabaseClient,
  params: {
    cashDrawerId: string;
    merchantId: string;
    locationId: string;
    openedBy: string; // staff_profile_id
    openingAmount: number;
    openingCountDetails?: DenominationCount[];
  },
): Promise<{ success: boolean; sessionId?: string; error?: string }> {
  const businessDate = new Date().toISOString().split("T")[0];

  const { data, error } = await supabase
    .from("cash_drawer_sessions")
    .insert({
      cash_drawer_id: params.cashDrawerId,
      merchant_id: params.merchantId,
      location_id: params.locationId,
      opened_by: params.openedBy,
      opened_at: new Date().toISOString(),
      opening_amount: params.openingAmount,
      opening_count_details: params.openingCountDetails || null,
      opening_count_verified: !!params.openingCountDetails,
      expected_cash: params.openingAmount,
      status: "open",
      business_date: businessDate,
    })
    .select("id")
    .single();

  if (error) {
    console.error("[CashDrawer] Failed to open session:", error);
    return { success: false, error: error.message };
  }

  // Update drawer status
  await supabase
    .from("cash_drawers")
    .update({ is_open: true, current_session_id: data.id })
    .eq("id", params.cashDrawerId);

  // Update local store
  const session: DrawerSession = {
    id: data.id,
    cashDrawerId: params.cashDrawerId,
    openedBy: params.openedBy,
    openedAt: new Date().toISOString(),
    openingAmount: params.openingAmount,
    openingCountDetails: params.openingCountDetails,
    expectedCash: params.openingAmount,
    status: "open",
  };

  useCashDrawerStore.getState().openSession(session);

  return { success: true, sessionId: data.id };
}

/**
 * Close a cash drawer session.
 * Records the closing amount, calculates variance, and updates backend.
 */
export async function closeDrawerSession(
  supabase: SupabaseClient,
  params: {
    sessionId: string;
    cashDrawerId: string;
    closedBy: string;
    closingAmount: number;
    closingCountDetails?: DenominationCount[];
    varianceNotes?: string;
  },
): Promise<{ success: boolean; variance?: number; error?: string }> {
  const store = useCashDrawerStore.getState();
  const expectedCash = store.getRunningBalance();
  const variance = params.closingAmount - expectedCash;

  const { error } = await supabase
    .from("cash_drawer_sessions")
    .update({
      closed_by: params.closedBy,
      closed_at: new Date().toISOString(),
      closing_amount: params.closingAmount,
      closing_count_details: params.closingCountDetails || null,
      closing_count_verified: !!params.closingCountDetails,
      expected_cash: expectedCash,
      variance,
      variance_notes: params.varianceNotes || null,
      status: "closed",
    })
    .eq("id", params.sessionId);

  if (error) {
    console.error("[CashDrawer] Failed to close session:", error);
    return { success: false, error: error.message };
  }

  // Update drawer status
  await supabase
    .from("cash_drawers")
    .update({ is_open: false, current_session_id: null })
    .eq("id", params.cashDrawerId);

  // Update local store
  store.closeSession(
    params.closingAmount,
    params.closingCountDetails,
    params.closedBy,
  );

  return { success: true, variance };
}

/**
 * Record a cash drawer operation.
 * Saves to local store first (optimistic), then persists to backend.
 * Falls back to offline queue if backend insert fails.
 */
export async function recordDrawerOperation(
  supabase: SupabaseClient,
  params: {
    cashDrawerId: string;
    sessionId: string;
    operationType: DrawerOperationType;
    amount: number;
    performedBy: string;
    orderId?: string;
    paymentId?: string;
    vendorId?: string;
    reason?: string;
    approvedBy?: string;
    receiptPrinted?: boolean;
  },
): Promise<{ success: boolean; error?: string }> {
  const store = useCashDrawerStore.getState();
  const currentBalance = store.getRunningBalance();

  let balanceAfter = currentBalance;
  if (!isNoEffectOperation(params.operationType)) {
    const effectiveAmount = isDebitOperation(params.operationType)
      ? -Math.abs(params.amount)
      : Math.abs(params.amount);
    balanceAfter = currentBalance + effectiveAmount;
  }

  const opId = uuidv4();
  const performedAt = new Date().toISOString();

  // Record locally first (optimistic)
  store.recordOperation({
    id: opId,
    operationType: params.operationType,
    amount: params.amount,
    performedBy: params.performedBy,
    performedAt,
    orderId: params.orderId,
    paymentId: params.paymentId,
    vendorId: params.vendorId,
    reason: params.reason,
    approvedBy: params.approvedBy,
    receiptPrinted: params.receiptPrinted,
  });

  // Persist to backend via RPC (handles balance calc, session update, and
  // audit_logs dual-logging for no-sale events atomically)
  const baseRpcParams = {
    p_cash_drawer_id: params.cashDrawerId,
    p_session_id: params.sessionId,
    p_operation_type: params.operationType,
    p_amount: params.amount,
    p_performed_by: params.performedBy,
    p_order_id: params.orderId || null,
    p_payment_id: params.paymentId || null,
    p_reason: params.reason || null,
    p_approved_by: params.approvedBy || null,
  };

  let rpcResult: any = null;
  let rpcError: any = null;

  ({ data: rpcResult, error: rpcError } = await supabase.rpc(
    "record_cash_operation",
    {
      ...baseRpcParams,
      p_vendor_id: params.vendorId || null,
    },
  ));

  const missingVendorRpcParam =
    rpcError?.message?.includes("record_cash_operation") &&
    rpcError?.message?.includes("p_vendor_id");

  if (missingVendorRpcParam) {
    ({ data: rpcResult, error: rpcError } = await supabase.rpc(
      "record_cash_operation",
      baseRpcParams,
    ));
  }

  if (rpcError || (rpcResult && !rpcResult.success)) {
    const errMsg = rpcError?.message || rpcResult?.error || "Unknown error";
    console.error("[CashDrawer] RPC failed, queuing offline:", errMsg);
    if (rpcError) captureRpcError("record_cash_operation", rpcError);
    // Queue for offline sync
    try {
      const { queueOperation } =
        require("@/services/offlineSyncService") as typeof import("@/services/offlineSyncService");
      await queueOperation({
        type: "record_cash_drawer_operation",
        localOrderId: params.orderId || opId, // use opId as fallback key
        params: {
          id: opId,
          cash_drawer_id: params.cashDrawerId,
          session_id: params.sessionId,
          operation_type: params.operationType,
          amount: params.amount,
          performed_by: params.performedBy,
          performed_at: performedAt,
          order_id: params.orderId || null,
          payment_id: params.paymentId || null,
          vendor_id: params.vendorId || null,
          balance_after: balanceAfter,
          reason: params.reason || null,
          approved_by: params.approvedBy || null,
        },
      });
    } catch (queueError) {
      console.error(
        "[CashDrawer] Failed to queue offline operation:",
        queueError,
      );
    }
    return { success: false, error: errMsg };
  }

  if (params.vendorId) {
    const { error: vendorPatchError } = await supabase
      .from("cash_drawer_operations")
      .update({ vendor_id: params.vendorId })
      .eq("session_id", params.sessionId)
      .eq("operation_type", params.operationType)
      .eq("performed_by", params.performedBy)
      .eq("amount", params.amount)
      .eq("performed_at", performedAt);

    if (vendorPatchError) {
      console.warn("[CashDrawer] Failed to patch vendor_id:", vendorPatchError);
    }
  }

  return { success: true };
}

/**
 * Check if there's an active drawer session for the current station.
 * If so, hydrate the local store.
 */
export async function hydrateDrawerSession(
  supabase: SupabaseClient,
  stationId: string,
  locationId: string,
): Promise<boolean> {
  const store = useCashDrawerStore.getState();

  // Find drawer for station
  const drawer = await findDrawerForStation(supabase, stationId, locationId);
  if (!drawer) {
    store.clearDrawer();
    return false;
  }

  store.setDrawer(drawer.id, drawer.name, drawer.hostPrinterId);

  // Auto-bind the host printer from drawer-sense when unbound. Fire-and-forget
  // so hydrate isn't slowed by the write; it updates the store when it resolves.
  if (!drawer.hostPrinterId) {
    void maybeAutoBindDrawerHost(supabase, drawer.id, locationId);
  }

  // Check for active session
  const { data: session } = await supabase
    .from("cash_drawer_sessions")
    .select("*")
    .eq("cash_drawer_id", drawer.id)
    .eq("status", "open")
    .order("opened_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!session) {
    useCashDrawerStore.setState((state) => ({
      ...state,
      activeSession: null,
      operations: [],
    }));
    return false;
  }

  // Fetch operations for this session
  const { data: ops } = await supabase
    .from("cash_drawer_operations")
    .select("*")
    .eq("session_id", session.id)
    .order("performed_at", { ascending: true });

  const drawerSession: DrawerSession = {
    id: session.id,
    cashDrawerId: drawer.id,
    openedBy: session.opened_by,
    openedAt: session.opened_at,
    openingAmount: Number(session.opening_amount),
    openingCountDetails: session.opening_count_details as
      | DenominationCount[]
      | undefined,
    expectedCash: Number(session.expected_cash || session.opening_amount),
    status: "open",
  };

  store.openSession(drawerSession);

  if (ops?.length) {
    store.setOperations(
      ops.map((op: any) => ({
        id: op.id,
        operationType: op.operation_type,
        amount: Number(op.amount),
        balanceAfter: Number(op.balance_after || 0),
        performedBy: op.performed_by,
        performedAt: op.performed_at,
        orderId: op.order_id,
        paymentId: op.payment_id,
        vendorId: op.vendor_id || undefined,
        reason: op.reason,
      })),
    );
  } else {
    store.setOperations([]);
  }

  return true;
}
