// lib/cfdRouting.ts
// Single source of truth for "is the operator currently on a screen where the
// CFD should reflect order data?" — used by both the WebSocket sync effect
// (off-device CFD) and the builtin sync effect (on-device WebView CFD) in
// `contexts/CFDProvider.tsx`. Previously each effect carried its own copy of
// this logic, which drifted: the WS copy was correctly excluding
// `/tables/floor-plan` while the builtin copy still treated bare `/tables/...`
// as sales — so the floor-plan view kept showing the previous order's UI on
// the customer-facing display.

/**
 * Static `/tables/...` sub-routes that are NOT a specific table's order
 * (so the CFD should fall through to idle, not show order data).
 */
const TABLES_NON_SALES_PREFIXES = [
  "/tables/floor-plan",
  "/tables/waitlist",
  "/tables/edit-layout",
  "/tables/clean-table",
];

/**
 * Returns true when the operator is actively editing an order:
 *   - any `/order-processing/...` route
 *   - a specific `/tables/<id>` route (NOT the floor-plan / waitlist /
 *     edit-layout / clean-table sub-routes)
 *
 * Anywhere else (menu, settings, scheduling, analytics, KDS, the bare
 * /tables index, etc.) returns false so the CFD goes idle.
 */
export function isCFDSalesPathname(pathname: string): boolean {
  if (!pathname) return false;
  if (pathname.includes("order-processing")) return true;

  // Specific table route /tables/<id>. Static sub-routes share the same
  // shape (/tables/floor-plan etc.) so we explicitly exclude them.
  if (!/\/tables\/[^/]+/.test(pathname)) return false;
  return !TABLES_NON_SALES_PREFIXES.some((prefix) => pathname.includes(prefix));
}
