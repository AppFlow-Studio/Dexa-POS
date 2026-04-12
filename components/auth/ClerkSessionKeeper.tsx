import { useAuth, useSession } from "@clerk/clerk-expo";
import { useEffect, useRef } from "react";

/**
 * Component that keeps the Clerk session active by periodically touching it.
 * This prevents "signed out" errors when the session becomes stale.
 *
 * IMPORTANT: The effect depends on `session?.id`, NOT the `session` object
 * itself. `session.touch()` causes Clerk to return a new session reference
 * each time it resolves, which would cause the effect to tear down and
 * re-run on every touch — producing a tight loop. We read the latest
 * session from a ref inside the interval callback so we always call touch()
 * on the current session without re-running the effect.
 */
export function ClerkSessionKeeper() {
  const { isSignedIn } = useAuth();
  const { session } = useSession();
  const touchIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const sessionRef = useRef(session);

  // Keep the ref pointing at the latest session without retriggering the effect.
  useEffect(() => {
    sessionRef.current = session;
  }, [session]);

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
