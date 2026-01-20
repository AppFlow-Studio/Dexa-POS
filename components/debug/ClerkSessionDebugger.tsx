import { useAuth, useSession } from "@clerk/clerk-expo";
import { useEffect } from "react";

/**
 * Debug component to monitor Clerk session state
 * Add this to your app to track session changes and identify issues
 */
export function ClerkSessionDebugger() {
  const { isSignedIn, isLoaded, getToken } = useAuth();
  const { session } = useSession();

  useEffect(() => {
    console.log("[ClerkDebugger] Session state changed:", {
      isSignedIn,
      isLoaded,
      hasSession: !!session,
      sessionId: session?.id,
      userId: session?.user?.id,
      lastActiveAt: session?.lastActiveAt,
      expireAt: session?.expireAt,
    });

    // Test if we can get a token
    if (isSignedIn && isLoaded) {
      getToken({ template: "supabase" })
        .then((token) => {
          if (token) {
            console.log("[ClerkDebugger] ✓ Successfully retrieved Supabase token");
          } else {
            console.error("[ClerkDebugger] ✗ Failed to get token - returned null");
          }
        })
        .catch((error) => {
          console.error("[ClerkDebugger] ✗ Error getting token:", error);
        });
    }
  }, [isSignedIn, isLoaded, session, getToken]);

  // Monitor session expiration
  useEffect(() => {
    if (!session?.expireAt) return;

    const expirationTime = new Date(session.expireAt).getTime();
    const now = Date.now();
    const timeUntilExpiration = expirationTime - now;

    if (timeUntilExpiration > 0) {
      console.log(
        `[ClerkDebugger] Session will expire in ${Math.round(timeUntilExpiration / 1000 / 60)} minutes`
      );

      // Warn 5 minutes before expiration
      const warningTime = timeUntilExpiration - 5 * 60 * 1000;
      if (warningTime > 0) {
        const warningTimeout = setTimeout(() => {
          console.warn("[ClerkDebugger] ⚠️ Session will expire in 5 minutes!");
        }, warningTime);

        return () => clearTimeout(warningTimeout);
      }
    } else {
      console.error("[ClerkDebugger] ✗ Session has already expired!");
    }
  }, [session?.expireAt]);

  return null; // This component doesn't render anything
}
