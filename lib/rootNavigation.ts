import { CommonActions } from '@react-navigation/native';

type NavRef = { current: { dispatch: (action: any) => void } | null };

let _navRef: NavRef | null = null;

// ── Navigation timing ──────────────────────────────────────────────
// Background services use this to skip non-critical work (order pruning,
// toasts) during the brief window after a screen transition.

let _lastNavigationTs = 0;

/** Call on every navigation state change (from _layout.tsx). */
export function markNavigationEvent(): void {
  _lastNavigationTs = Date.now();
}

/** True if the user navigated within the last `withinMs` milliseconds. */
export function isRecentlyNavigated(withinMs = 2000): boolean {
  return Date.now() - _lastNavigationTs < withinMs;
}

/**
 * Store the navigation container ref (called once from _layout.tsx).
 */
export function setRootNavigationRef(ref: NavRef) {
  _navRef = ref;
}

/**
 * Navigate across route groups by resetting the root Stack state.
 *
 * `router.replace()` dispatches a StackActions.replace() which gets trapped
 * inside Slot navigators and never reaches the root Stack. This function
 * dispatches CommonActions.reset() directly through the navigation container
 * ref, which always targets the root navigator.
 */
export function replaceRoute(
  groupName: string,
  screenName?: string,
  _attempt = 0,
) {
  const nav = _navRef?.current;
  if (!nav) {
    // The container ref populates a tick after mount, so a navigation fired
    // right after login (e.g. PIN → kiosk) can land before it's ready. Retry
    // briefly instead of silently dropping the navigation, which otherwise
    // leaves the user stuck on the PIN screen until they re-enter their PIN.
    if (_attempt < 20) {
      setTimeout(() => replaceRoute(groupName, screenName, _attempt + 1), 50);
    } else if (__DEV__) {
      console.warn('[rootNavigation] Navigation ref never became ready');
    }
    return;
  }

  const route: { name: string; state?: { routes: { name: string }[] } } = {
    name: groupName,
  };
  if (screenName) {
    route.state = { routes: [{ name: screenName }] };
  }

  nav.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [route],
    }),
  );
}
