import NetInfo from "@react-native-community/netinfo";

import { useTimeclockStore } from "@/stores/useTimeclockStore";
import { TimeClockAction } from "@/types/time-clock";

const PROCESS_INTERVAL_MS = 10_000;
const MAX_RETRY_ATTEMPTS = 5;
const BASE_BACKOFF_MS = 2_000;
const MAX_BACKOFF_MS = 60_000;
const STUCK_SYNC_MS = 5 * 60 * 1000;

let processorTimer: ReturnType<typeof setInterval> | null = null;
let processorInFlight = false;

function isTransientTimeclockError(error: any): boolean {
  const message = String(error?.message ?? "").toLowerCase();
  const code = String(error?.code ?? "").toLowerCase();

  if (
    message.includes("network") ||
    message.includes("timeout") ||
    message.includes("fetch") ||
    code.includes("network")
  ) {
    return true;
  }

  return false;
}

function getBackoffDelayMs(retryCount: number): number {
  const delay = BASE_BACKOFF_MS * Math.pow(2, retryCount);
  return Math.min(delay, MAX_BACKOFF_MS);
}

function toIsoAfter(ms: number): string {
  return new Date(Date.now() + ms).toISOString();
}

function moveToDeadLetter(
  action: TimeClockAction,
  reasonCode: string,
  reasonMessage: string,
  details?: Record<string, any>,
): void {
  const store = useTimeclockStore.getState();
  store.addToDeadLetterQueue({
    action,
    reasonCode,
    reasonMessage,
    details,
    discardedAt: new Date().toISOString(),
  });
  store.removeFromQueue(action.id);
}

async function processDeclareCashTipsAction(
  supabase: any,
  action: TimeClockAction,
): Promise<any> {
  let resolvedShiftId = action.shiftId;
  const staffId = action.staffProfileId;
  const locId = action.locationId;

  if (resolvedShiftId && staffId) {
    try {
      const { data: shiftCheck } = await supabase
        .from("staff_shifts")
        .select("id, clock_in_time")
        .eq("id", resolvedShiftId)
        .single();

      if (shiftCheck?.clock_in_time) {
        const shiftDate = shiftCheck.clock_in_time.split("T")[0];
        const today = new Date().toISOString().split("T")[0];

        if (shiftDate < today) {
          const { data: todayShift } = await supabase
            .from("staff_shifts")
            .select("id")
            .eq("staff_profile_id", staffId)
            .eq("location_id", locId)
            .gte("clock_in_time", `${today}T00:00:00`)
            .order("clock_in_time", { ascending: false })
            .limit(1)
            .maybeSingle();

          if (todayShift?.id) {
            resolvedShiftId = todayShift.id;
          } else {
            const { data: latestShift } = await supabase
              .from("staff_shifts")
              .select("id")
              .eq("staff_profile_id", staffId)
              .eq("location_id", locId)
              .order("clock_in_time", { ascending: false })
              .limit(1)
              .maybeSingle();

            if (latestShift?.id) {
              resolvedShiftId = latestShift.id;
            }
          }
        }
      }
    } catch {
      // best effort
    }
  }

  if (!resolvedShiftId && staffId) {
    try {
      const { data: shiftData } = await supabase
        .from("staff_shifts")
        .select("id")
        .eq("staff_profile_id", staffId)
        .eq("location_id", locId)
        .order("clock_in_time", { ascending: false })
        .limit(1)
        .single();
      if (shiftData?.id) {
        resolvedShiftId = shiftData.id;
      }
    } catch {
      // best effort
    }
  }

  if (!resolvedShiftId) {
    return {
      code: "NO_SHIFT",
      message: "Could not resolve shift for tip declaration",
    };
  }

  const { error } = await supabase.rpc("declare_cash_tips_for_shift", {
    p_shift_id: resolvedShiftId,
    p_amount: action.cashTipAmount,
  });
  return error;
}

async function processTimeclockAction(
  supabase: any,
  action: TimeClockAction,
): Promise<any> {
  if (action.type === "declare_cash_tips") {
    return processDeclareCashTipsAction(supabase, action);
  }

  const { error } = await supabase.rpc("handle_time_clock", {
    p_pin_code: action.pinCode,
    p_location_id: action.locationId,
    p_action_type: action.type,
    p_device_id: action.deviceId,
  });

  if (error && action.type === "clock_out") {
    const fallbackShiftId = action.shiftId;
    const fallbackStaffId = action.staffProfileId;
    const clockOutTime = action.timestamp || new Date().toISOString();

    let targetShiftId = fallbackShiftId;

    if (!targetShiftId && fallbackStaffId) {
      try {
        const { data: activeShift } = await supabase
          .from("staff_shifts")
          .select("id")
          .eq("staff_profile_id", fallbackStaffId)
          .eq("location_id", action.locationId)
          .in("status", ["active", "on_break"])
          .order("clock_in_time", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (activeShift?.id) {
          targetShiftId = activeShift.id;
        }
      } catch {
        // best effort
      }
    }

    if (targetShiftId) {
      try {
        const { error: updateError } = await supabase
          .from("staff_shifts")
          .update({
            clock_out_time: clockOutTime,
            status: "completed",
          })
          .eq("id", targetShiftId)
          .in("status", ["active", "on_break"]);

        if (!updateError) {
          return null;
        }
      } catch {
        // noop
      }
    }
  }

  return error;
}

async function processOne(supabase: any): Promise<void> {
  if (processorInFlight) return;
  processorInFlight = true;

  try {
    const store = useTimeclockStore.getState();

    if (store.offlineQueue.length === 0) return;

    if (store.isSyncing && store.syncingStartedAt) {
      const startedAtMs = new Date(store.syncingStartedAt).getTime();
      if (
        !Number.isNaN(startedAtMs) &&
        Date.now() - startedAtMs > STUCK_SYNC_MS
      ) {
        console.warn(
          "[TimeclockSync] Recovering from stuck isSyncing=true flag",
        );
        store.setSyncing(false);
      }
    }

    if (store.isSyncing) return;

    const netState = await NetInfo.fetch();
    if (!netState.isConnected || !netState.isInternetReachable) return;

    const action = store.offlineQueue[0];
    if (!action) return;

    if (action.nextRetryAt) {
      const readyAt = new Date(action.nextRetryAt).getTime();
      if (!Number.isNaN(readyAt) && readyAt > Date.now()) return;
    }

    store.setSyncing(true);

    try {
      const error = await processTimeclockAction(supabase, action);

      if (!error) {
        store.removeFromQueue(action.id);
        return;
      }

      const retryCount = action.retryCount ?? 0;
      const transient = isTransientTimeclockError(error);

      if (!transient) {
        moveToDeadLetter(
          action,
          "TIMECLOCK_LOGIC_ERROR",
          "Timeclock action failed with non-retryable logic error",
          {
            code: error?.code ?? null,
            message: error?.message ?? null,
            actionType: action.type,
          },
        );
        return;
      }

      if (retryCount + 1 >= MAX_RETRY_ATTEMPTS) {
        moveToDeadLetter(
          action,
          "TIMECLOCK_MAX_RETRIES_EXHAUSTED",
          "Timeclock action exceeded retry limit and was dead-lettered",
          {
            retryCount: retryCount + 1,
            actionType: action.type,
            lastError: error?.message ?? String(error),
          },
        );
        return;
      }

      const delayMs = getBackoffDelayMs(retryCount);
      store.updateQueuedAction(action.id, (current) => ({
        ...current,
        retryCount: retryCount + 1,
        nextRetryAt: toIsoAfter(delayMs),
      }));
    } catch (error: any) {
      const retryCount = action.retryCount ?? 0;
      if (retryCount + 1 >= MAX_RETRY_ATTEMPTS) {
        moveToDeadLetter(
          action,
          "TIMECLOCK_PROCESSOR_CRASH",
          "Timeclock processor threw repeatedly and action was dead-lettered",
          {
            retryCount: retryCount + 1,
            error: error?.message ?? String(error),
          },
        );
      } else {
        const delayMs = getBackoffDelayMs(retryCount);
        store.updateQueuedAction(action.id, (current) => ({
          ...current,
          retryCount: retryCount + 1,
          nextRetryAt: toIsoAfter(delayMs),
        }));
      }
    } finally {
      useTimeclockStore.getState().setSyncing(false);
    }
  } finally {
    processorInFlight = false;
  }
}

export function startTimeclockSyncProcessor(supabase: any): void {
  if (processorTimer) return;

  void processOne(supabase);
  processorTimer = setInterval(() => {
    void processOne(supabase);
  }, PROCESS_INTERVAL_MS);
}

export function stopTimeclockSyncProcessor(): void {
  if (processorTimer) {
    clearInterval(processorTimer);
    processorTimer = null;
  }
  processorInFlight = false;
}
