import { useAuth, useSession } from "@clerk/clerk-expo";
import { useEffect, useRef } from "react";
import { AppState, type AppStateStatus } from "react-native";

/**
 * Component that keeps the Clerk session active by periodically touching it
 * AND proactively refreshing the token when the device wakes from sleep.
 *
 * IMPORTANT: The effect depends on `session?.id`, NOT the `session` object
 * itself. `session.touch()` causes Clerk to return a new session reference
 * each time it resolves, which would cause the effect to tear down and
 * re-run on every touch — producing a tight loop. We read the latest
 * session from a ref inside the interval callback so we always call touch()
 * on the current session without re-running the effect.
 */
export function ClerkSessionKeeper() {
  const { isSignedIn, getToken } = useAuth();
  const { session } = useSession();
  const touchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef(session);

  // Keep the ref pointing at the latest session without retriggering the effect.
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

  // Proactive token refresh on foreground wake.
  // When the device sleeps overnight, the JWT expires. session.touch() can't
  // revive an expired session — it only extends active ones. getToken() triggers
  // Clerk's internal refresh-token flow, which obtains a new JWT and updates
  // isSignedIn. This runs before routing checks fire, giving Clerk time to
  // rehydrate before ClerkGate evaluates the session state.
  useEffect(() => {
    const handleAppState = (state: AppStateStatus) => {
      if (state !== "active") return;
      // Force a token refresh — this triggers Clerk's internal refresh flow
      getToken()
        .then((token) => {
          if (token) {
            console.log("[SessionKeeper] ✓ Foreground token refresh succeeded");
            // Also touch to extend the session server-side
            sessionRef.current?.touch().catch(() => {});
          }
        })
        .catch((err) => {
          console.warn("[SessionKeeper] Foreground token refresh failed:", err);
        });
    };

    const sub = AppState.addEventListener("change", handleAppState);
    return () => sub.remove();
  }, [getToken]);

  useEffect(() => {
    if (!isSignedIn || !session) {
      if (touchIntervalRef.current) {
        clearInterval(touchIntervalRef.current);
        touchIntervalRef.current = null;
      }
      return;
    }

    console.log("[SessionKeeper] Starting session keep-alive");

    // Touch the session immediately on sign-in
    sessionRef.current
      ?.touch()
      .then(() => {
        console.log("[SessionKeeper] ✓ Session touched successfully");
      })
      .catch((error) => {
        console.error("[SessionKeeper] ✗ Failed to touch session:", error);
      });

    // Touch the session every 5 minutes to keep it active.
    // Read session from ref so the interval always uses the latest reference.
    touchIntervalRef.current = setInterval(
      () => {
        const current = sessionRef.current;
        if (!current) return;
        console.log("[SessionKeeper] Touching session to keep it active...");
        current
          .touch()
          .then(() => {
            console.log("[SessionKeeper] ✓ Session touched successfully");
          })
          .catch((error) => {
            console.error("[SessionKeeper] ✗ Failed to touch session:", error);
          });
      },
      5 * 60 * 1000
    );

    return () => {
      if (touchIntervalRef.current) {
        console.log("[SessionKeeper] Stopping session keep-alive");
        clearInterval(touchIntervalRef.current);
        touchIntervalRef.current = null;
      }
    };
    // Depend on session?.id (stable per session), not the session object.
  }, [isSignedIn, session?.id]);

  return null;
}
