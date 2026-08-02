/**
 * Imperative read of the current route path.
 *
 * `usePathname()` is a *subscription*: any component that calls it re-renders
 * on every navigation, and for a persistently-mounted overlay that means its
 * whole hook body re-runs on every screen change even while the overlay is
 * closed. Components that only need the path *inside a callback* (not to
 * render with) should read it from here instead and drop the subscription.
 *
 * Written once per navigation from the route effect in app/(main)/_layout.tsx,
 * which already subscribes to `usePathname()` for its own layout decisions —
 * so this adds no new subscriber.
 *
 * Leaf module: no imports, safe from anywhere.
 */

let currentRoutePath = "";

/** Called from the route effect in app/(main)/_layout.tsx on every path change. */
export function setCurrentRoutePath(path: string): void {
  currentRoutePath = path;
}

/**
 * The path as of the last navigation. Empty string before the first one.
 *
 * Updated from an effect, so it is one commit behind during the render pass
 * that navigates — read it from event handlers and effects, never to decide
 * what to render.
 */
export function getCurrentRoutePath(): string {
  return currentRoutePath;
}
