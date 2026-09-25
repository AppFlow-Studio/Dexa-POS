import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getDeviceId } from "@/lib/deviceId";
import { registerResumeTask } from "@/lib/lifecycle/appLifecycleCoordinator";
import { DEADLINES } from "@/lib/network/deadlines";
import { jitterMs } from "@/lib/network/jitter";
import { runWithDeadline } from "@/lib/network/runWithDeadline";
import { getPosAccessFailure } from "@/lib/posAccessControl";
import { replaceRoute } from "@/lib/rootNavigation";
import { refreshSelectedStationOperationalState } from "@/services/posAccessService";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { useCallback, useEffect, useRef, useState } from "react";

// ============================================================================
// Types
// ============================================================================

interface BroadcastKickPayload {
  device_id: string;
  session_id: string;
  target_session_id?: string | null;
  source_device_id?: string | null;
  kicked_by: string | null;
  reason: string | null;
  station_id: string;
}

interface SessionCheckResult {
  is_valid: boolean;
  status: string;
  error_code?: string | null;
  kicked_by?: string | null;
  kick_reason?: string | null;
  ended_at?: string | null;
  error?: string;
}

export interface UseSessionKickListenerResult {
  isKicked: boolean;
  kickedBy: string | null;
  kickReason: string | null;
  kickTitle: string | null;
  kickMessage: string | null;
  countdown: number;
  acknowledgeKick: () => void;
  /** Manually check if the session is still valid. Returns false if kicked. */
  validateSession: () => Promise<boolean>;
  /** Call before intentionally ending the session to suppress the kicked-out modal. */
  markVoluntaryLogout: () => void;
  /**
   * Re-read station + billing state soon (the station was edited server-side).
   * Coalesced: bursts of nudges produce one refresh, at most one per 10s.
   */
  requestStationRefresh: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const KICK_COUNTDOWN_SECONDS = 5;
/** Session check only (1 RPC). Dashboard kicks reach the device through this. */
const SESSION_POLL_INTERVAL_MS = 30_000;
/**
 * Station + billing state (2 RPCs). Station edits also arrive as a
 * `station_updated` nudge (see requestStationRefresh), so this is the backstop.
 */
const STATION_REFRESH_INTERVAL_MS = 5 * 60_000;
/** Spreads the fleet's 30s ticks so devices that start together don't poll together. */
const POLL_START_JITTER_MS = 5_000;
/** A flapping kick channel re-checks the session at most this often. */
const CHANNEL_REVALIDATE_MIN_INTERVAL_MS = 60_000;
/** Minimum gap between nudge-driven station refreshes. */
const STATION_NUDGE_MIN_INTERVAL_MS = 10_000;
/** A merchant-wide change nudges every device at once; spread the refreshes. */
const STATION_NUDGE_JITTER_MS = 5_000;

/**
 * Multi-layered session kick listener that guarantees kicked devices are logged out.
 *
 * Layer 1: Supabase Broadcast channel (primary, instant, no RLS dependency)
 * Layer 2: Session check every 30s (catches missed events and dashboard kicks);
 *          station + billing state every 5 min
 * Layer 3: App foreground validation (catches kicks while backgrounded)
 * Plus: `station_updated` nudges (from the stations / payment_terminals
 *       triggers, relayed by useRemoteActionsListener) refresh station state.
 */
export function useSessionKickListener(): UseSessionKickListenerResult {
  const supabase = useSupabaseClient();
  const clearSelectedStation = useStoreSettingsStore(
    (state) => state.clearSelectedStation
  );
  const setStationSessionId = useStoreSettingsStore(
    (state) => state.setStationSessionId
  );
  const stationSessionId = useStoreSettingsStore(
    (state) => state.stationSessionId
  );

  const [isKicked, setIsKicked] = useState(false);
  const [kickedBy, setKickedBy] = useState<string | null>(null);
  const [kickReason, setKickReason] = useState<string | null>(null);
  const [kickTitle, setKickTitle] = useState<string | null>(null);
  const [kickMessage, setKickMessage] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(KICK_COUNTDOWN_SECONDS);

  const broadcastChannelRef = useRef<RealtimeChannel | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );
  const isKickedRef = useRef(false); // Ref to avoid stale closures
  const isVoluntaryLogoutRef = useRef(false); // Set true when we intentionally end the session
  const reconnectAttemptRef = useRef(0);
  // Layer 3 cooldown — Layer 2 already polls every 30s, so firing on every
  // active event is pure overhead on the first-tap path after idle.
  const lastLayer3ValidateRef = useRef<number>(0);
  // Single-flight guards: overlapping callers share the in-flight request.
  const sessionCheckInFlightRef = useRef<{
    sessionId: string;
    promise: Promise<boolean>;
  } | null>(null);
  const stationRefreshInFlightRef = useRef<Promise<boolean> | null>(null);
  // 0 so the first poll tick after sign-in also refreshes station state.
  const lastStationRefreshAtRef = useRef<number>(0);
  const lastChannelRevalidateAtRef = useRef<number>(0);
  const stationNudgeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );

  // Get device ID (synchronous from MMKV)
  const deviceId = getDeviceId();

  // ============================================================================
  // Core: Trigger kick state (deduplicated)
  // ============================================================================

  const triggerKick = useCallback(
    (
      by: string | null,
      reason: string | null,
      options?: { title?: string | null; message?: string | null },
    ) => {
      // Prevent duplicate triggers or triggering after a voluntary logout
      if (isKickedRef.current || isVoluntaryLogoutRef.current) return;
      isKickedRef.current = true;

      console.log(
        `[KickListener] SESSION KICKED - by: ${by}, reason: ${reason}`
      );

      setIsKicked(true);
      setKickedBy(by);
      setKickReason(reason);
      setKickTitle(options?.title ?? null);
      setKickMessage(options?.message ?? null);
      setCountdown(KICK_COUNTDOWN_SECONDS);
    },
    []
  );

  // ============================================================================
  // Core: Perform logout
  // ============================================================================

  const performLogout = useCallback(() => {
    console.log("[KickListener] Performing logout...");

    // Clear session state
    setStationSessionId(null);
    clearSelectedStation();

    // Navigate to station select
    replaceRoute('(auth)', 'station-select');

    // Hide the modal but keep isKickedRef.current = true so no further triggers fire
    setIsKicked(false);
  }, [setStationSessionId, clearSelectedStation]);

  // ============================================================================
  // Core: Acknowledge kick (user presses OK before countdown)
  // ============================================================================

  const markVoluntaryLogout = useCallback(() => {
    isVoluntaryLogoutRef.current = true;
  }, []);

  const acknowledgeKick = useCallback(() => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    performLogout();
  }, [performLogout]);

  // ============================================================================
  // Core: Session check (1 RPC)
  // ============================================================================

  const checkSessionStatus = useCallback((): Promise<boolean> => {
    if (!deviceId || !stationSessionId || isKickedRef.current) {
      return Promise.resolve(!isKickedRef.current);
    }

    const inFlight = sessionCheckInFlightRef.current;
    if (inFlight && inFlight.sessionId === stationSessionId) {
      return inFlight.promise;
    }

    const promise = (async (): Promise<boolean> => {
      try {
        const { data, error } = await runWithDeadline<SessionCheckResult>(
          "check_device_session_status",
          DEADLINES.read,
          (signal) =>
            supabase
              .rpc("check_device_session_status", {
                p_device_id: deviceId,
                p_session_id: stationSessionId,
              })
              .abortSignal(signal) as unknown as Promise<{
              data: SessionCheckResult | null;
              error: any;
            }>
        );

        if (error) {
          console.warn("[KickListener] Session validation RPC error:", error.message);
          // Don't kick on RPC errors (network issue) - let polling retry
          return true;
        }

        const result = data as SessionCheckResult;

        if (useStoreSettingsStore.getState().stationSessionId !== stationSessionId) {
          if (__DEV__) {
            console.log("[KickListener] Ignoring stale validation result", {
              validatedSessionId: stationSessionId,
              currentSessionId: useStoreSettingsStore.getState().stationSessionId,
            });
          }
          return true;
        }

        if (!result.is_valid) {
          console.log(
            `[KickListener] Session invalid via poll - status: ${result.status}`
          );
          const accessFailure = getPosAccessFailure({
            error: result.error ?? result.kick_reason ?? null,
            errorCode: result.error_code ?? result.status,
          });

          if (accessFailure) {
            triggerKick(null, accessFailure.message, {
              title: accessFailure.title,
              message: accessFailure.message,
            });
          } else {
            triggerKick(
              result.kicked_by ?? null,
              result.kick_reason ?? `Session ${result.status}`
            );
          }
          return false;
        }

        return true;
      } catch (err) {
        console.warn("[KickListener] Session validation error:", err);
        return true; // Don't kick on errors
      }
    })();

    const entry = { sessionId: stationSessionId, promise };
    sessionCheckInFlightRef.current = entry;
    void promise.finally(() => {
      if (sessionCheckInFlightRef.current === entry) {
        sessionCheckInFlightRef.current = null;
      }
    });
    return promise;
  }, [deviceId, stationSessionId, supabase, triggerKick]);

  // ============================================================================
  // Core: Station + billing state (2 RPCs)
  // ============================================================================

  const refreshStationState = useCallback((): Promise<boolean> => {
    if (!stationSessionId || isKickedRef.current) {
      return Promise.resolve(!isKickedRef.current);
    }
    if (stationRefreshInFlightRef.current) {
      return stationRefreshInFlightRef.current;
    }

    const sessionAtStart = stationSessionId;
    lastStationRefreshAtRef.current = Date.now();

    const promise = (async (): Promise<boolean> => {
      try {
        const stationState = await refreshSelectedStationOperationalState(supabase);
        // A logout or re-sign-in while the refresh was in flight (e.g. a
        // remote deactivate, which also nudges) must not show a kick modal.
        if (useStoreSettingsStore.getState().stationSessionId !== sessionAtStart) {
          return true;
        }
        if (!stationState.valid) {
          triggerKick(null, stationState.failure.message, {
            title: stationState.failure.title,
            message: stationState.failure.message,
          });
          return false;
        }
        return true;
      } catch (err) {
        console.warn("[KickListener] Station access refresh error:", err);
        // Don't kick on refresh/RPC errors - let the next validation retry.
        return true;
      }
    })();

    stationRefreshInFlightRef.current = promise;
    void promise.finally(() => {
      if (stationRefreshInFlightRef.current === promise) {
        stationRefreshInFlightRef.current = null;
      }
    });
    return promise;
  }, [stationSessionId, supabase, triggerKick]);

  // ============================================================================
  // Core: Full validation (session, then station + billing)
  // ============================================================================

  const validateSession = useCallback(async (): Promise<boolean> => {
    const sessionValid = await checkSessionStatus();
    if (!sessionValid) return false;
    return refreshStationState();
  }, [checkSessionStatus, refreshStationState]);

  // ============================================================================
  // Station change nudge (station_updated broadcast)
  // ============================================================================

  const requestStationRefresh = useCallback(() => {
    if (!stationSessionId || isKickedRef.current) return;
    // One trailing refresh is already queued; it will read the latest state.
    if (stationNudgeTimerRef.current) return;

    const sinceLast = Date.now() - lastStationRefreshAtRef.current;
    const delay =
      Math.max(0, STATION_NUDGE_MIN_INTERVAL_MS - sinceLast) +
      jitterMs(STATION_NUDGE_JITTER_MS);

    stationNudgeTimerRef.current = setTimeout(() => {
      stationNudgeTimerRef.current = null;
      void refreshStationState();
    }, delay);
  }, [stationSessionId, refreshStationState]);

  // Drop a queued nudge when the session changes or the hook unmounts.
  useEffect(() => {
    return () => {
      if (stationNudgeTimerRef.current) {
        clearTimeout(stationNudgeTimerRef.current);
        stationNudgeTimerRef.current = null;
      }
    };
  }, [stationSessionId]);

  // ============================================================================
  // Countdown timer when kicked
  // ============================================================================

  useEffect(() => {
    if (isKicked && countdown > 0) {
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (countdownIntervalRef.current) {
          clearInterval(countdownIntervalRef.current);
          countdownIntervalRef.current = null;
        }
      };
    }
  }, [isKicked]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-logout when countdown expires
  useEffect(() => {
    if (isKicked && countdown === 0) {
      performLogout();
    }
  }, [isKicked, countdown, performLogout]);

  // ============================================================================
  // Layer 1: Supabase Broadcast channel (primary - no RLS dependency)
  // ============================================================================

  useEffect(() => {
    if (!deviceId || !stationSessionId) return;

    // removeChannel() below fires CLOSED on this callback; that one is ours.
    let disposed = false;

    const channelName = `station-kick:${deviceId}`;
    if (__DEV__) console.log(`[KickListener] Layer 1: Subscribing to broadcast channel: ${channelName}`);

    broadcastChannelRef.current = supabase
      .channel(channelName)
      .on("broadcast", { event: "kick" }, (payload) => {
        const data = payload.payload as BroadcastKickPayload;
        if (__DEV__) console.log("[KickListener] Layer 1: Broadcast kick received:", data);

        if (data.device_id !== deviceId) {
          return;
        }

        if (data.source_device_id === deviceId && !data.target_session_id) {
          if (__DEV__) {
            console.log("[KickListener] Ignoring self-originated kick without target session");
          }
          return;
        }

        const currentSessionId =
          useStoreSettingsStore.getState().stationSessionId;

        if (data.target_session_id && data.target_session_id !== currentSessionId) {
          if (__DEV__) {
            console.log("[KickListener] Ignoring kick for different session", {
              currentSessionId,
              targetSessionId: data.target_session_id,
            });
          }
          return;
        }

        triggerKick(data.kicked_by, data.reason);
      })
      .subscribe((status) => {
        if (disposed) return;
        if (status === "SUBSCRIBED") {
          if (__DEV__) console.log("[KickListener] Layer 1: Broadcast channel connected");
          reconnectAttemptRef.current = 0;
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          // A kick may have been missed during the gap. Throttled: during an
          // outage this fires on every retry, on every device.
          const now = Date.now();
          if (
            now - lastChannelRevalidateAtRef.current <
            CHANNEL_REVALIDATE_MIN_INTERVAL_MS
          ) {
            return;
          }
          lastChannelRevalidateAtRef.current = now;
          void checkSessionStatus();
        }
      });

    return () => {
      disposed = true;
      if (broadcastChannelRef.current) {
        supabase.removeChannel(broadcastChannelRef.current);
        broadcastChannelRef.current = null;
      }
    };
  }, [deviceId, stationSessionId, supabase, triggerKick, checkSessionStatus]);

  // ============================================================================
  // Layer 2: Session check every 30s; station + billing state every 5 min
  // ============================================================================

  useEffect(() => {
    if (!deviceId || !stationSessionId) return;

    if (__DEV__) console.log("[KickListener] Layer 2: Starting session validation polling (30s interval)");

    const tick = async () => {
      if (isKickedRef.current) return;
      const sessionValid = await checkSessionStatus();
      if (
        sessionValid &&
        Date.now() - lastStationRefreshAtRef.current >= STATION_REFRESH_INTERVAL_MS
      ) {
        await refreshStationState();
      }
    };

    let pollInterval: ReturnType<typeof setInterval> | null = null;
    const startTimer = setTimeout(() => {
      pollInterval = setInterval(() => {
        void tick();
      }, SESSION_POLL_INTERVAL_MS);
    }, jitterMs(POLL_START_JITTER_MS));

    return () => {
      clearTimeout(startTimer);
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [deviceId, stationSessionId, checkSessionStatus, refreshStationState]);

  // ============================================================================
  // Layer 3: App foreground validation
  // ============================================================================

  useEffect(() => {
    if (!deviceId || !stationSessionId) return;

    const unregister = registerResumeTask({
      id: "auth.session-kick-validate",
      bucket: "interactions",
      requiresNetwork: true,
      shouldRun: () =>
        !isKickedRef.current &&
        Date.now() - lastLayer3ValidateRef.current >= 5 * 60 * 1000,
      run: async () => {
        lastLayer3ValidateRef.current = Date.now();
        if (__DEV__) {
          console.log(
            "[KickListener] Layer 3: App became active - validating session",
          );
        }
        await validateSession();
      },
    });

    return unregister;
  }, [deviceId, stationSessionId, validateSession]);

  // ============================================================================
  // Cleanup all on unmount
  // ============================================================================

  useEffect(() => {
    return () => {
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, []);

  // Reset kick state when a new session starts
  useEffect(() => {
    if (stationSessionId) {
      isKickedRef.current = false;
      isVoluntaryLogoutRef.current = false;
      setIsKicked(false);
      setKickedBy(null);
      setKickReason(null);
      setKickTitle(null);
      setKickMessage(null);
      setCountdown(KICK_COUNTDOWN_SECONDS);
    }
  }, [stationSessionId]);

  return {
    isKicked,
    kickedBy,
    kickReason,
    kickTitle,
    kickMessage,
    countdown,
    acknowledgeKick,
    validateSession,
    markVoluntaryLogout,
    requestStationRefresh,
  };
}
