import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getDeviceId } from "@/lib/deviceId";
import { getPosAccessFailure } from "@/lib/posAccessControl";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { replaceRoute } from "@/lib/rootNavigation";
import { refreshSelectedStationOperationalState } from "@/services/posAccessService";
import { useCallback, useEffect, useRef, useState } from "react";
import { AppState, AppStateStatus } from "react-native";

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
}

// ============================================================================
// Constants
// ============================================================================

const KICK_COUNTDOWN_SECONDS = 5;
const SESSION_POLL_INTERVAL_MS = 30_000; // 30 seconds

/**
 * Multi-layered session kick listener that guarantees kicked devices are logged out.
 *
 * Layer 1: Supabase Broadcast channel (primary, instant, no RLS dependency)
 * Layer 2: Polling session validation every 30s (catches missed events)
 * Layer 3: App foreground validation (catches kicks while backgrounded)
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
  const pollIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const isKickedRef = useRef(false); // Ref to avoid stale closures
  const isVoluntaryLogoutRef = useRef(false); // Set true when we intentionally end the session
  const reconnectAttemptRef = useRef(0);
  // Layer 3 cooldown — Layer 2 already polls every 30s, so firing on every
  // active event is pure overhead on the first-tap path after idle.
  const lastLayer3ValidateRef = useRef<number>(0);

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
  // Core: Validate session via RPC
  // ============================================================================

  const validateSession = useCallback(async (): Promise<boolean> => {
    if (!deviceId || !stationSessionId || isKickedRef.current) {
      return !isKickedRef.current;
    }

    try {
      const { data, error } = await supabase.rpc(
        "check_device_session_status",
        {
          p_device_id: deviceId,
          p_session_id: stationSessionId,
        }
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

      try {
        const stationState = await refreshSelectedStationOperationalState(supabase);
        if (!stationState.valid) {
          triggerKick(null, stationState.failure.message, {
            title: stationState.failure.title,
            message: stationState.failure.message,
          });
          return false;
        }
      } catch (err) {
        console.warn("[KickListener] Station access refresh error:", err);
        // Don't kick on refresh/RPC errors - let the next validation retry.
      }

      return true;
    } catch (err) {
      console.warn("[KickListener] Session validation error:", err);
      return true; // Don't kick on errors
    }
  }, [deviceId, stationSessionId, supabase, triggerKick]);

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
        if (status === "SUBSCRIBED") {
          if (__DEV__) console.log("[KickListener] Layer 1: Broadcast channel connected");
          reconnectAttemptRef.current = 0;
        } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
          // console.warn(
          //   `[KickListener] Layer 1: Broadcast channel ${status}`
          // );
          // Validate session on reconnection gap
          validateSession();
        }
      });

    return () => {
      if (broadcastChannelRef.current) {
        supabase.removeChannel(broadcastChannelRef.current);
        broadcastChannelRef.current = null;
      }
    };
  }, [deviceId, stationSessionId, supabase, triggerKick, validateSession]);

  // ============================================================================
  // Layer 2: Polling session validation (every 30s)
  // ============================================================================

  useEffect(() => {
    if (!deviceId || !stationSessionId) return;

    if (__DEV__) console.log("[KickListener] Layer 2: Starting session validation polling (30s interval)");

    pollIntervalRef.current = setInterval(() => {
      if (!isKickedRef.current) {
        validateSession();
      }
    }, SESSION_POLL_INTERVAL_MS);

    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
        pollIntervalRef.current = null;
      }
    };
  }, [deviceId, stationSessionId, validateSession]);

  // ============================================================================
  // Layer 3: App foreground validation
  // ============================================================================

  useEffect(() => {
    if (!deviceId || !stationSessionId) return;

    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === "active" && !isKickedRef.current) {
        // Layer 2 polls every 30s, so only fire here if it's been a while —
        // avoids an extra RPC on the critical first-tap path after idle.
        const age = Date.now() - lastLayer3ValidateRef.current;
        if (age < 5 * 60 * 1000) return;
        lastLayer3ValidateRef.current = Date.now();
        if (__DEV__) console.log("[KickListener] Layer 3: App became active - validating session");
        setTimeout(() => {
          validateSession();
        }, 500);
      }
    };

    const subscription = AppState.addEventListener(
      "change",
      handleAppStateChange
    );

    return () => {
      subscription.remove();
    };
  }, [deviceId, stationSessionId, validateSession]);

  // ============================================================================
  // Cleanup all on unmount
  // ============================================================================

  useEffect(() => {
    return () => {
      if (pollIntervalRef.current) {
        clearInterval(pollIntervalRef.current);
      }
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
  };
}
