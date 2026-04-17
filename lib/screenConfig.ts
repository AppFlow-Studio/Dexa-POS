import { enableFreeze } from 'react-native-screens';

// Activate react-freeze for inactive screens.
// Must run before any ScreenStack mounts.
// Inactive screens are wrapped in <Suspense> — they stop re-rendering entirely.
enableFreeze(true);

import type { NativeStackNavigationOptions } from '@react-navigation/native-stack';

/**
 * Shared screen options for all Stack navigators in the POS app.
 *
 * - animation: 'none'            → instant transitions, eliminates the Fabric
 *                                   detachment race window (Expo #37350)
 * - gestureEnabled: false         → no swipe-back on a tablet POS kiosk
 * - fullScreenGestureEnabled: false → no full-screen swipe dismiss
 * - headerShown: false            → app manages its own header
 * - freezeOnBlur: true            → explicit (already defaulted by enableFreeze)
 */
export const POS_SCREEN_OPTIONS: NativeStackNavigationOptions = {
  headerShown: false,
  animation: 'none',
  gestureEnabled: false,
  fullScreenGestureEnabled: false,
  freezeOnBlur: true,
};
