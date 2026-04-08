import { CommonActions } from '@react-navigation/native';

type NavRef = { current: { dispatch: (action: any) => void } | null };

let _navRef: NavRef | null = null;

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
export function replaceRoute(groupName: string, screenName?: string) {
  const nav = _navRef?.current;
  if (!nav) {
    if (__DEV__) {
      console.warn('[rootNavigation] Navigation ref not ready');
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
