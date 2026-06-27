import { enableFreeze } from 'react-native-screens';
// IMPORTANT: keep this FALSE.
//
// Navigation memory leak (Jun 2026): the (main) route group navigates via
// expo-router <Slot> (not a native <Stack>). With enableFreeze(true), a route
// that loses focus is *frozen* — react-native-screens keeps its entire native
// view tree alive instead of destroying it. Under <Slot> route swaps the frozen
// surface is never disposed, so every visit to a screen leaves a detached native
// view tree behind: ~30MB of Native Heap per /tables visit, hard-retained
// (GC-immune), a second ViewRootImpl, climbing Views — confirmed via
// dumpsys meminfo across repeated navigation. JS components, timers, and effects
// all unmount/clear correctly; it is purely the frozen native surface.
//
// enableFreeze(false) lets the blurred route's native tree be destroyed on blur.
// Verified fix: per-visit Native Heap growth drops from ~30MB to normal churn,
// Views and ViewRootImpl stay flat.
enableFreeze(false);

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
 * - animation: 'none'
 *      UPDATE (Jun 2026): a *fast* navigation that interrupts the 'fade'
 *      transition before it completes leaves the removed screen's view tree
 *      parked in ViewGroup.mTransitioningViews, because the cleanup
 *      (onViewAnimationEnd → endRemovalTransition) is driven by
 *      View#onAnimationEnd and that callback never fires for an interrupted
 *      animation. Result: heap stays high under fast navigation, drops only
 *      when you navigate slowly enough to let the fade finish. With 'none'
 *      there is no transition to interrupt, and the react-native-screens
 *      patch (onDestroy → endRemovalTransition + the hardened
 *      onAnimationCancel/onDestroyView paths) deterministically releases the
 *      parked view tree on every navigation regardless of speed.
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
  animation: 'none',
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
  detachInactiveScreens: true,
};
