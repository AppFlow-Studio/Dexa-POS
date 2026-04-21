/**
 * Canonical color palettes for Dexa-POS themes.
 * CommonJS so tailwind.config.js can require() it.
 *
 * Every hex value in the app should trace back here.
 */

const darkColors = {
  // ── Backgrounds ──────────────────────────────────
  screen: '#0C0F1A', // deepest layer — app background
  panel: '#161B2E', // sidebar, bottom-sheet chrome, popover bg
  card: '#1E2340', // card surfaces, elevated containers
  inset: '#0C0F1A', // input fields, inset areas (same as screen)
  background: '#0C0F1A', // For React Navigation compatibility

  // ── Borders ──────────────────────────────────────
  border: '#2A3050',

  // ── Text ─────────────────────────────────────────
  heading: '#E2E8F0', // high-emphasis (titles, values)
  label: '#94A3B8', // medium-emphasis (labels, secondary text)
  muted: '#64748B', // low-emphasis (hints, placeholders)

  // ── Accent / Brand ──────────────────────────────
  teal: '#adc6ff', // primary accent (buttons, links, rings)
  tealMuted: '#adc6ff33', // 20% opacity teal for subtle backgrounds

  // ── Semantic ─────────────────────────────────────
  success: '#34D399', // confirmed / paid / available
  warning: '#FBBF24', // caution / pending / overtime
  danger: '#F87171', // error / void / destructive
  info: '#60A5FA', // informational highlights

  // ── On-solid text ────────────────────────────────
  onSolid: '#0C0F1A', // dark text on solid teal/green buttons

  // ── Table status ─────────────────────────────────
  tableAvailable: '#2D9E7A', // Muted green
  tableInUse: '#3D6FA8', // Steel blue
  tableCleaning: '#5A6270', // Cool gray
  tableNotInService: '#1F2937', // Dark gray
  tableOvertime: '#C17D2A', // Muted amber
  // Session sub-statuses (color-coded by phase)
  tableSeated: '#3D6FA8', // Steel blue
  tableOrdered: '#B86A2E', // Muted orange
  tableServed: '#A07C20', // Muted gold
  tableCheckPresented: '#7C4DA0', // Muted purple
  tablePaid: '#B04040', // Muted red
  // Local-only intermediate states
  tableSeating: '#4A7FA5', // Soft blue
  tableOrdering: '#6B5FA0', // Soft indigo
  tablePaying: '#C17D2A', // Muted amber
  tableClosing: '#A05050', // Soft red

  // ── Order status ─────────────────────────────────
  orderSentToKitchen: '#818CF8',
  orderPreparing: '#F59E0B',
  orderReady: '#22C55E',
  orderCompleted: '#3B82F6',
  orderCancelled: '#EF4444',
  orderDefault: '#9CA3AF',

  // ── Payment status ───────────────────────────────
  paymentPaid: '#22C55E',
  paymentPartial: '#F59E0B',
  paymentPending: '#9CA3AF',
  paymentUnpaid: '#EF4444',
  paymentRefunded: '#EF4444',
  paymentPartialRefund: '#F97316',

  // ── KDS urgency ──────────────────────────────────
  urgencyNormal: '#22C55E',
  urgencyWarning: '#EAB308',
  urgencyElevated: '#F97316',
  urgencyCritical: '#EF4444',

  // ── KDS status tabs ──────────────────────────────
  kdsPending: '#D97706',
  kdsCooking: '#EA580C',
  kdsReady: '#16A34A',
  kdsDone: '#64748B',

  // ── Order type (KDS) ─────────────────────────────
  orderTypeDelivery: '#22C55E',
  orderTypeToGo: '#3B82F6',
  orderTypeDineIn: '#D97706',

  // ── Skeleton loading ─────────────────────────────
  skeleton: '#2A2A2E',
  skeletonHighlight: '#333338'
}

const lightColors = {
  // ── Backgrounds ──────────────────────────────────
  screen: '#F4F6FB',
  panel: '#FFFFFF',
  card: '#EEF2FF',
  inset: '#F8FAFC',
  background: '#F4F6FB',

  // ── Borders ──────────────────────────────────────
  border: '#D8E0F0',

  // ── Text ─────────────────────────────────────────
  heading: '#0F172A',
  label: '#334155',
  muted: '#64748B',

  // ── Accent / Brand ──────────────────────────────
  teal: '#7F9FFF',
  tealMuted: '#adc6ff33',

  // ── Semantic ─────────────────────────────────────
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',
  info: '#60A5FA',

  // ── On-solid text ────────────────────────────────
  onSolid: '#0C0F1A',

  // ── Table status ─────────────────────────────────
  tableAvailable: '#2D9E7A',
  tableInUse: '#3D6FA8',
  tableCleaning: '#5A6270',
  tableNotInService: '#1F2937',
  tableOvertime: '#C17D2A',
  // Session sub-statuses (color-coded by phase)
  tableSeated: '#3D6FA8',
  tableOrdered: '#B86A2E',
  tableServed: '#A07C20',
  tableCheckPresented: '#7C4DA0',
  tablePaid: '#B04040',
  // Local-only intermediate states
  tableSeating: '#4A7FA5',
  tableOrdering: '#6B5FA0',
  tablePaying: '#C17D2A',
  tableClosing: '#A05050',

  // ── Order status ─────────────────────────────────
  orderSentToKitchen: '#818CF8',
  orderPreparing: '#F59E0B',
  orderReady: '#22C55E',
  orderCompleted: '#3B82F6',
  orderCancelled: '#EF4444',
  orderDefault: '#9CA3AF',

  // ── Payment status ───────────────────────────────
  paymentPaid: '#22C55E',
  paymentPartial: '#F59E0B',
  paymentPending: '#9CA3AF',
  paymentUnpaid: '#EF4444',
  paymentRefunded: '#EF4444',
  paymentPartialRefund: '#F97316',

  // ── KDS urgency ──────────────────────────────────
  urgencyNormal: '#22C55E',
  urgencyWarning: '#EAB308',
  urgencyElevated: '#F97316',
  urgencyCritical: '#EF4444',

  // ── KDS status tabs ──────────────────────────────
  kdsPending: '#D97706',
  kdsCooking: '#EA580C',
  kdsReady: '#16A34A',
  kdsDone: '#64748B',

  // ── Order type (KDS) ─────────────────────────────
  orderTypeDelivery: '#22C55E',
  orderTypeToGo: '#3B82F6',
  orderTypeDineIn: '#D97706',

  // ── Skeleton loading ─────────────────────────────
  skeleton: '#E5E7EB',
  skeletonHighlight: '#F1F5F9'
}

const getThemeColors = mode => (mode === 'light' ? lightColors : darkColors)

// Backward-compatible export: defaults to dark at build/runtime import time.
const colors = darkColors

module.exports = { colors, darkColors, lightColors, getThemeColors }
