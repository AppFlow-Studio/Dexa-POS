/**
 * Native memory pressure helper.
 *
 * Complementary mitigation for the navigation memory leak (the primary fix is in
 * lib/screenConfig.ts — animation:'fade' so react-native-screens runs its
 * mTransitioningViews cleanup). Each screen mount allocates native JSI objects
 * (Reanimated worklets, native views) whose NativeAllocationRegistry/Cleaner
 * pairs only run their C++ destructors on GC. Hinting a GC after navigation lets
 * those cleaners drain and reclaim native memory promptly.
 *
 * Best-effort no-op when `global.gc` is unavailable (e.g. release builds without
 * GC exposed), so it is always safe to call. Debounced so rapid focus/blur
 * cycling can't thrash GC.
 */

const MIN_INTERVAL_MS = 2000
let lastRun = 0

type GlobalWithGc = typeof globalThis & { gc?: () => void }

/**
 * Best-effort hint to run a garbage collection so pending native cleaners
 * (NativeAllocationRegistry) drain and reclaim native memory. Safe no-op when
 * the runtime does not expose `global.gc`.
 */
export function hintNativeGc (reason?: string): void {
  const gc = (globalThis as GlobalWithGc).gc
  // global.gc is not exposed in release Hermes builds, so this is a no-op there.
  // That's expected: the actual leak fix is the react-native-screens patch
  // (patches/react-native-screens+4.11.1.patch — endRemovalTransition in
  // onDestroy). This GC hint is kept only as a dev-build belt-and-suspenders.
  if (typeof gc !== 'function') return

  const now = Date.now()
  if (now - lastRun < MIN_INTERVAL_MS) return
  lastRun = now

  try {
    gc()
    if (__DEV__ && reason) console.log(`[nativeMemory] gc hint: ${reason}`)
  } catch {
    // ignore — purely a hint
  }
}
