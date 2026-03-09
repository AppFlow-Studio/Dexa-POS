/**
 * Canonical color palette for Dexa-POS dark theme.
 * CommonJS so tailwind.config.js can require() it.
 *
 * Every hex value in the app should trace back here.
 */

const colors = {
  // ── Backgrounds ──────────────────────────────────
  screen: "#0C0F1A", // deepest layer — app background
  panel: "#161B2E", // sidebar, bottom-sheet chrome, popover bg
  card: "#1E2340", // card surfaces, elevated containers
  inset: "#0C0F1A", // input fields, inset areas (same as screen)
  background: "#0C0F1A", // For React Navigation compatibility

  // ── Borders ──────────────────────────────────────
  border: "#2A3050",

  // ── Text ─────────────────────────────────────────
  heading: "#E2E8F0", // high-emphasis (titles, values)
  label: "#94A3B8", // medium-emphasis (labels, secondary text)
  muted: "#64748B", // low-emphasis (hints, placeholders)

  // ── Accent / Brand ──────────────────────────────
  teal: "#2DD4BF", // primary accent (buttons, links, rings)
  tealMuted: "#2DD4BF33", // 20% opacity teal for subtle backgrounds

  // ── Semantic ─────────────────────────────────────
  success: "#34D399", // confirmed / paid / available
  warning: "#FBBF24", // caution / pending / overtime
  danger: "#F87171", // error / void / destructive
  info: "#60A5FA", // informational highlights

  // ── On-solid text ────────────────────────────────
  onSolid: "#0C0F1A", // dark text on solid teal/green buttons

  // ── Table status ─────────────────────────────────
  tableAvailable: "#10B981",      // Green
  tableInUse: "#3B82F6",          // Blue (default for in-use)
  tableCleaning: "#6B7280",       // Gray
  tableNotInService: "#1F2937",   // Dark gray / striped pattern
  tableOvertime: "#F59E0B",       // Amber (overtime indicator)
  // Session sub-statuses (color-coded by phase)
  tableSeated: "#3B82F6",         // Blue
  tableOrdered: "#F97316",        // Orange
  tableServed: "#FBBF24",         // Light orange/amber
  tableCheckPresented: "#A855F7", // Purple
  tablePaid: "#EF4444",           // Red
  // Local-only intermediate states
  tableSeating: "#60A5FA",        // Light blue
  tableOrdering: "#818CF8",       // Indigo
  tablePaying: "#F59E0B",         // Amber
  tableClosing: "#F87171",        // Light red

  // ── Order status ─────────────────────────────────
  orderSentToKitchen: "#818CF8",
  orderPreparing: "#F59E0B",
  orderReady: "#22C55E",
  orderCompleted: "#3B82F6",
  orderCancelled: "#EF4444",
  orderDefault: "#9CA3AF",

  // ── Payment status ───────────────────────────────
  paymentPaid: "#22C55E",
  paymentPartial: "#F59E0B",
  paymentPending: "#9CA3AF",
  paymentUnpaid: "#EF4444",
  paymentRefunded: "#EF4444",
  paymentPartialRefund: "#F97316",

  // ── KDS urgency ──────────────────────────────────
  urgencyNormal: "#22C55E",
  urgencyWarning: "#EAB308",
  urgencyElevated: "#F97316",
  urgencyCritical: "#EF4444",

  // ── KDS status tabs ──────────────────────────────
  kdsPending: "#D97706",
  kdsCooking: "#EA580C",
  kdsReady: "#16A34A",

  // ── Order type (KDS) ─────────────────────────────
  orderTypeDelivery: "#22C55E",
  orderTypeToGo: "#3B82F6",
  orderTypeDineIn: "#D97706",

  // ── Skeleton loading ─────────────────────────────
  skeleton: "#2A2A2E",
  skeletonHighlight: "#333338",
};

module.exports = { colors };
