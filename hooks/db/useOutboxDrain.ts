/**
 * Runs the outbox drain: on mount, on reconnect, and on a slow interval.
 *
 * docs/engineering/architecture/local-first-orders-seating.md §7.2
 *
 * ── Why three triggers and not one ─────────────────────────────────────────
 *
 * RECONNECT is the one that matters — it is what turns a service period's
 * worth of offline writes into server rows the moment wifi returns.
 *
 * THE INTERVAL is the safety net. Reconnect events are not perfectly reliable
 * on Android (a captive portal, a flapping AP, a doze wake), and an op that
 * missed its reconnect must not sit forever. It is deliberately slow: the
 * drain is cheap when the outbox is empty (one indexed COUNT), so a long
 * period costs nothing and a short one would hammer a struggling connection.
 *
 * ON MOUNT covers the app being force-quit mid-drain and reopened.
 *
 * Deliberately NOT triggered per-write. A drain on every cart tap would put a
 * network call on the hot path — which is the latency this whole design exists
 * to remove.
 */
import { useEffect, useRef } from "react";

import {
  pendingOpCount,
  purgeUnsyncableOps,
  requeueFailedOps,
} from "@/lib/db/outbox";
import { isLocalDbReady } from "@/lib/db/index";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { makeOpHandlers } from "@/services/localFirst/opHandlers";
import {
  drainOnce,
  registerDrainRunner,
} from "@/services/localFirst/outboxDrain";
import {
  LOCAL_WRITES_ITEMS,
  LOCAL_WRITES_ORDERS,
  LOCAL_WRITES_SEATING,
} from "@/services/localFirst/localWrites";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { toastService } from "@/lib/toastService";

const DRAIN_INTERVAL_MS = 30_000;

/** Any local-first write path on at all? Nothing to drain otherwise. */
const ANY_LOCAL_WRITES =
  LOCAL_WRITES_ITEMS || LOCAL_WRITES_ORDERS || LOCAL_WRITES_SEATING;

export function useOutboxDrain(): void {
  const supabase = useSupabaseClient();
  // `isOnline` (not rawIsOnline): it is false in slow-mode too, and pushing
  // a drain over a degraded link is how a struggling connection gets worse.
  const { isOnline } = useNetworkStatus();
  const runningRef = useRef(false);

  useEffect(() => {
    if (!ANY_LOCAL_WRITES) {
      console.log(
        "[LF] drain DISABLED — no EXPO_PUBLIC_LOCAL_WRITES_* flag is set",
      );
      return;
    }
    if (!supabase) {
      console.log("[LF] drain waiting — no supabase client yet");
      return;
    }
    console.log(
      `[LF] drain ready items=${LOCAL_WRITES_ITEMS} orders=${LOCAL_WRITES_ORDERS} seating=${LOCAL_WRITES_SEATING} online=${isOnline}`,
    );

    let cancelled = false;

    const handlers = makeOpHandlers(supabase, {
      // §9.5 — two stations seated the same table while partitioned. The table
      // is lost but the ORDER is preserved, so this has to reach a human
      // rather than being logged and forgotten: there is real food on that
      // check and someone has to merge or move it.
      onTableOccupied: (conflict) => {
        toastService.show({
          title: "Table already seated",
          message:
            `This table was seated on another station. The order was kept — ` +
            `merge these checks or move one.`,
          type: "warning",
        });
        console.warn("[OutboxDrain] table_occupied:", conflict);
      },
    });

    const run = async () => {
      if (cancelled || runningRef.current) return;
      if (!isLocalDbReady()) {
        console.warn("[LF] drain skipped — local DB not ready");
        return;
      }
      // Cheap guard: an indexed COUNT beats constructing a drain pass for an
      // empty outbox, which is the steady state.
      if ((await pendingOpCount()) === 0) return;

      runningRef.current = true;
      try {
        const stats = await drainOnce(handlers);
        if (__DEV__ && stats.attempted > 0) {
          console.log("[OutboxDrain]", stats);
        }
      } finally {
        runningRef.current = false;
      }
    };

    // Let a local write ask for a drain immediately, instead of waiting out
    // the interval — otherwise a ticket could take 30s to reach the kitchen
    // on a perfectly good network.
    registerDrainRunner(run);

    // One-time cleanup of ops that can never succeed (non-uuid entity ids from
    // before the id fix). Without this they re-push on every drain forever.
    // Order matters: drop what can never work, THEN give the rest one retry.
    // Requeueing first would just re-attempt the unsyncable ones.
    void purgeUnsyncableOps().then(() => requeueFailedOps());

    // Mount + whenever connectivity flips back on.
    if (isOnline) void run();

    const timer = setInterval(() => {
      if (isOnline) void run();
    }, DRAIN_INTERVAL_MS);

    return () => {
      cancelled = true;
      registerDrainRunner(null);
      clearInterval(timer);
    };
  }, [supabase, isOnline]);
}
