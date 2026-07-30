import { registerResumeTask } from "@/lib/lifecycle/appLifecycleCoordinator";
import { getRawIsOnline } from "@/services/offlineSyncService";
import { isClerkRuntimeError, useAuth } from "@clerk/clerk-expo";
import * as Sentry from "@sentry/react-native";
import { useCallback, useEffect, useRef } from "react";
import { AppState } from "react-native";

/**
 * Keeps the Clerk session warm on always-on POS/KDS tablets.
 *
 * Why NOT session.touch(): per Clerk's React Native guidance, touch() relies on
 * browser page-focus events and "may not behave as expected in Expo." It also
 * cannot extend Clerk's server-side Maximum lifetime — only the dashboard
 * setting does that. So touch() gave false confidence while doing nothing for
 * the failure the field actually sees.
 *
 * What we do instead — the Clerk-recommended pattern: drive the refresh-token
 * exchange with getToken({ skipCache: true }) on foreground wake AND on a
 * periodic interval while the app sits foregrounded 24/7. That keeps the client
 * token fresh so isSignedIn never goes stale during the (long, dashboard-
 * configured) Maximum lifetime window.
 */

// Re-exchange the refresh token roughly this often while foregrounded.
const WARM_REFRESH_INTERVAL_MS = 10 * 60 * 1000;

export function ClerkSessionKeeper() {
  const { isSignedIn, getToken } = useAuth();

  // Keep the latest getToken in a ref so the AppState/interval effects don't
  // re-subscribe on every render (getToken identity can change between renders).
  const getTokenRef = useRef(getToken);
  useEffect(() => {
    getTokenRef.current = getToken;
  }, [getToken]);

  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // TRUE forced refresh. Returns early when offline — the resource cache serves
  // the token there and a network refresh would just fail noisily.
  const refresh = useCallback(async (reason: string) => {
    if (!getRawIsOnline()) return;
    try {
      await getTokenRef.current?.({ skipCache: true });
    } catch (err) {
      if (isClerkRuntimeError(err) && err.code === "network_error") {
        // Transient — never escalate; the session is still valid server-side.
        Sentry.addBreadcrumb({
          category: "auth.keeper",
          level: "info",
          message: `transient refresh failure (${reason})`,
        });
        return;
      }
      Sentry.captureException(err, {
        tags: { source: "session_keeper", op: reason },
      });
    }
  }, []);

  // Proactive refresh on foreground wake — runs before routing checks fire so
  // isSignedIn is back true before ClerkGate / index.tsx evaluate it.
  //
  // Registered in the coordinator's `immediate` bucket rather than holding its
  // own AppState listener: auth validity gates every other network task on the
  // resume path, so it must complete before the frame/interaction buckets run.
  // The coordinator awaits this bucket, which is what turns the old
  // fire-and-forget refresh into an actual ordering guarantee.
  useEffect(() => {
    return registerResumeTask({
      id: "auth.clerk-token",
      bucket: "immediate",
      requiresNetwork: true,
      run: () => refresh("foreground"),
    });
  }, [refresh]);

  // Periodic warm-keep while signed in AND foregrounded.
  useEffect(() => {
    if (!isSignedIn) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    // Warm immediately on (re)sign-in.
    void refresh("signin");

    intervalRef.current = setInterval(() => {
      if (AppState.currentState === "active") void refresh("warm_interval");
    }, WARM_REFRESH_INTERVAL_MS);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isSignedIn, refresh]);

  return null;
}
