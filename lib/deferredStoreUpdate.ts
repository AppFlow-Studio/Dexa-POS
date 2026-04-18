/**
 * Defer a store update to the next animation frame.
 *
 * Background services (health checks, printer discovery) push Zustand store
 * updates on timer callbacks. Deferring to rAF ensures the update lands in
 * a clean frame — after any in-progress React renders and Reanimated commits
 * from the current frame have completed.
 *
 * This is a defensive measure: with animation:'none' and enableFreeze(true),
 * mid-navigation store updates are already safe from crashes. The deferral
 * prevents wasted subscriber notifications during render batches.
 */
export function deferStoreUpdate(fn: () => void): void {
  requestAnimationFrame(fn);
}
