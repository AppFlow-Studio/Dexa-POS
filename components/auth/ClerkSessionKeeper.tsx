import { useAuth, useSession } from "@clerk/clerk-expo";
import { useEffect, useRef } from "react";

/**
 * Component that keeps the Clerk session active by periodically touching it.
 * This prevents "signed out" errors when the session becomes stale.
 */
export function ClerkSessionKeeper() {
  const { isSignedIn } = useAuth();
  const { session } = useSession();
  const touchIntervalRef = useRef<NodeJS.Timeout | null>(null);
  useEffect(() => {
    if (!isSignedIn || !session) {
      // Clear any existing interval
      if (touchIntervalRef.current) {
        clearInterval(touchIntervalRef.current);
        touchIntervalRef.current = null;
      }
      return;
    }

    console.log("[SessionKeeper] Starting session keep-alive");

    // Touch the session immediately
    session
      .touch()
      .then(() => {
        console.log("[SessionKeeper] ✓ Session touched successfully");
      })
      .catch((error) => {
        console.error("[SessionKeeper] ✗ Failed to touch session:", error);
      });

    // Touch the session every 5 minutes to keep it active
    touchIntervalRef.current = setInterval(
      () => {
        if (session) {
          console.log("[SessionKeeper] Touching session to keep it active...");
          session
            .touch()
            .then(() => {
              console.log("[SessionKeeper] ✓ Session touched successfully");
            })
            .catch((error) => {
              console.error("[SessionKeeper] ✗ Failed to touch session:", error);
            });
        }
      },
      5 * 60 * 1000
    ); // Every 5 minutes

    // Cleanup on unmount or when session changes
    return () => {
      if (touchIntervalRef.current) {
        console.log("[SessionKeeper] Stopping session keep-alive");
        clearInterval(touchIntervalRef.current);
        touchIntervalRef.current = null;
      }
    };
  }, [isSignedIn, session]);

  return null;
}
