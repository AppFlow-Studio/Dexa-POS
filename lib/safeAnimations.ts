import { Platform } from 'react-native';

/**
 * Strips Reanimated layout animations (entering/exiting) on platforms where
 * they are unsafe.
 *
 * - Android: `RetryableMountingLayerException` on Fabric mount unmount race
 *   (reanimated#6908, react-native#49077). Fatal because Reanimated's
 *   `AndroidUIScheduler.scheduleMountItem` bypasses RN's retry wrapper.
 * - Web (CFD WebView shell): Reanimated 3's layout animations require
 *   `experimentalLayoutAnimationsForWeb` to be enabled, otherwise the
 *   entering view can stick at `opacity: 0`, leaving the whole screen
 *   invisible. Until that's wired up, strip on web too.
 *
 * Effective: only iOS gets the entering/exiting animation.
 *
 * @example
 *   <Animated.View entering={iosOnly(FadeIn.duration(200))}>
 */
export function iosOnly<T>(animation: T): T | undefined {
  return Platform.OS === 'ios' ? animation : undefined;
}
