import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { getDeviceId } from "@/lib/deviceId";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { RealtimeChannel } from "@supabase/supabase-js";
import { useRouter } from "expo-router";
import { useEffect, useRef, useState } from "react";

interface KickNotification {
  id: string;
  session_id: string;
  device_id: string;
  kicked_by_staff_name: string | null;
  kick_reason: string | null;
  created_at: string;
}

interface UseSessionKickListenerResult {
  isKicked: boolean;
  kickedBy: string | null;
  kickReason: string | null;
  countdown: number;
  acknowledgeKick: () => void;
}

const KICK_COUNTDOWN_SECONDS = 5;

/**
 * Hook to listen for session kick notifications via Supabase Realtime.
 * When a kick notification is received for this device, it shows a countdown
 * and then logs the user out.
 */
export function useSessionKickListener(): UseSessionKickListenerResult {
  const supabase = useSupabaseClient();
  const router = useRouter();
  const clearSelectedStation = useStoreSettingsStore(
    (state) => state.clearSelectedStation
  );
  const setStationSessionId = useStoreSettingsStore(
    (state) => state.setStationSessionId
  );

  const [isKicked, setIsKicked] = useState(false);
  const [kickedBy, setKickedBy] = useState<string | null>(null);
  const [kickReason, setKickReason] = useState<string | null>(null);
  const [countdown, setCountdown] = useState(KICK_COUNTDOWN_SECONDS);

  const channelRef = useRef<RealtimeChannel | null>(null);
  const countdownIntervalRef = useRef<ReturnType<typeof setInterval> | null>(
    null
  );

  // Get device ID
  const deviceId = getDeviceId();

  // Debug: Log when hook initializes
  useEffect(() => {
    console.log(`[KickListener] Initialized with deviceId: ${deviceId}`);
  }, [deviceId]);

  // Handle logout after kick
  const performLogout = () => {
    // Clear session state
    setStationSessionId(null);
    clearSelectedStation();

    // Navigate to station select
    router.replace("/station-select");

    // Reset kick state
    setIsKicked(false);
    setKickedBy(null);
    setKickReason(null);
    setCountdown(KICK_COUNTDOWN_SECONDS);
  };

  // Acknowledge kick (user clicks OK before countdown ends)
  const acknowledgeKick = () => {
    if (countdownIntervalRef.current) {
      clearInterval(countdownIntervalRef.current);
      countdownIntervalRef.current = null;
    }
    performLogout();
  };

  // Start countdown when kicked
  useEffect(() => {
    if (isKicked && countdown > 0) {
      countdownIntervalRef.current = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            // Time's up - log out
            if (countdownIntervalRef.current) {
              clearInterval(countdownIntervalRef.current);
              countdownIntervalRef.current = null;
            }
            performLogout();
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
  }, [isKicked]);

  // Subscribe to kick notifications
  useEffect(() => {
    if (!deviceId) return;

    let hasLoggedError = false;

    // Subscribe to INSERT events on session_kick_notifications
    // filtered by this device's ID
    channelRef.current = supabase
      .channel(`kick-notifications:${deviceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "session_kick_notifications",
          filter: `device_id=eq.${deviceId}`,
        },
        (payload) => {
          const notification = payload.new as KickNotification;
          console.log("🚨 Session kick notification received:", notification);

          // Set kick state
          setIsKicked(true);
          setKickedBy(notification.kicked_by_staff_name);
          setKickReason(notification.kick_reason);
          setCountdown(KICK_COUNTDOWN_SECONDS);
        }
      )
      .subscribe((status, err) => {
        // Only log meaningful status changes, not repeated errors
        if (status === "SUBSCRIBED") {
          console.log("✅ Session kick listener connected");
          hasLoggedError = false; // Reset error flag on successful connection
        } else if (status === "CLOSED") {
          console.log("Session kick listener closed");
        } else if (
          (status === "CHANNEL_ERROR" || status === "TIMED_OUT") &&
          !hasLoggedError
        ) {
          // Only log error once to prevent spam
          console.warn("⚠️ Session kick listener error:", status, err?.message);
          hasLoggedError = true;
        }
      });

    return () => {
      if (channelRef.current) {
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [deviceId, supabase]);

  return {
    isKicked,
    kickedBy,
    kickReason,
    countdown,
    acknowledgeKick,
  };
}
