import { enableFreeze } from 'react-native-screens';
enableFreeze(true);

import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

/**
 * Shared screen options for all Stack navigators in the POS app.
 *
 * Navigation memory-leak context (Jun 2026): heap-dump GC-root analysis traced
 * leaked SvgView/ReactViewGroup subtrees retained across navigation through
 * Android's ViewGroup.mTransitioningViews on react-native-screens fragments.
 * The change that actually fixed the climbing native heap in testing was the
 * per-navigation GC hint (lib/nativeMemory.ts + app/(main)/_layout.tsx) — the
 * parked views are collectable, and forcing a GC on navigation drains them.
 * The two options below are kept as complementary belt-and-suspenders:
 *
 * - animation: 'fade' + animationDuration: 150
 *      A short real view animation makes react-native-screens fire its
 *      onViewAnimationEnd() → endRemovalTransition() cleanup (which never runs
 *      under animation:'none', since it's driven by View#onAnimationEnd).
 * - detachInactiveScreens: true
 *      Release the inactive screen's native view tree on blur. Safe here because
 *      POS routes are opaque full-screen (nothing is visible THROUGH another).
 * - gestureEnabled: false         → no swipe-back on a tablet POS kiosk
 * - fullScreenGestureEnabled: false → no full-screen swipe dismiss
 * - headerShown: false            → app manages its own header
 * - freezeOnBlur: true            → explicit (already defaulted by enableFreeze)
 */
export const POS_SCREEN_OPTIONS: NativeStackNavigationOptions & {
  detachInactiveScreens?: boolean;
} = {
  headerShown: false,
  animation: 'fade',
  animationDuration: 150,
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
  detachInactiveScreens: true,
};
