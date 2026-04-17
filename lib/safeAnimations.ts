import { Platform } from 'react-native';

/**
 * Strips Reanimated layout animations (entering/exiting) on Android.
 *
 * On Android with Fabric (New Architecture), Reanimated entering/exiting
 * animations crash when a view unmounts mid-animation. The worklet calls
 * Fabric's `updateProps` on a tag that was already torn down, producing
 * `RetryableMountingLayerException` (reanimated#6908, react-native#49077).
 *
 * Reanimated's `AndroidUIScheduler.scheduleMountItem` bypasses React
 * Native's built-in retry wrapper (`tryDispatchMountItems`), so the
 * exception is unhandled and fatal.
 *
 * This helper returns the animation on iOS (where the mount layer handles
 * it correctly) and `undefined` on Android (skipping the animation).
 *
 * @example
 *   <Animated.View entering={iosOnly(FadeIn.duration(200))}>
 */
export function iosOnly<T>(animation: T): T | undefined {
  return Platform.OS === 'ios' ? animation : undefined;
}
