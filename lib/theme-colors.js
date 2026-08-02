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

  // ── inKind (non-tender settlement) ───────────────
  // `inKindField` is the LOGO CHIP fill, and is black in BOTH themes: the
  // supplied inKind lockup is gold-on-black with a white wordmark, so it
  // only reads correctly on a dark field. Same approach as the delivery
  // brand marks in ProviderGlyph, which sit on a fixed brand chip
  // regardless of theme.
  // `inKindOn` is the brand gold used for the tile border and accent text.
  // It matches the logo's own gold here; light mode darkens it for contrast
  // (see lightColors) since #E5B840 on white is only ~1.9:1.
  // logo chip fill — black in both themes
  inKindField: '#000000',
  // The logo's own brand gold. Border/fill only — see lightColors for why
  // this token must never colour small text.
  inKindOn: '#E5B840',

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
  screen: '#F8FAFC', // Panel subtle (left panel ground)
  panel: '#FFFFFF', // Panel base (right panel)
  card: '#F1F4F9', // Fill muted
  inset: '#F8FAFC', // Subtle fill for inputs/insets
  background: '#F8FAFC',

  // ── Borders ──────────────────────────────────────
  border: '#E5E7EB', // Border hairline

  // ── Text ─────────────────────────────────────────
  heading: '#0F172A', // Primary text (titles, values)
  label: '#475569', // Secondary text (labels)
  muted: '#616161', // Placeholder text

  // ── Accent / Brand ──────────────────────────────
  teal: '#0C4FD1', // Brand primary blue
  tealMuted: '#B4CCF5', // Soft tint lg (avatar, selected states)

  // ── Semantic ─────────────────────────────────────
  success: '#34D399',
  warning: '#FBBF24',
  danger: '#F87171',
  info: '#60A5FA',

  // ── On-solid text ────────────────────────────────
  onSolid: '#FFFFFF',

  // ── inKind (non-tender settlement) ───────────────
  // Chip stays black — the logo is gold-on-black and must not be recoloured.
  // A small black chip on the light panel reads as a brand mark (the same way
  // the DoorDash/Grubhub chips do); it was the full-bleed BLACK TILE that
  // looked wrong in light mode, so the tile itself now uses the normal panel
  // with a gold border instead.
  // Gold is darkened from the logo's #E5B840 purely for text contrast:
  // #E5B840 on white is ~1.9:1 (fails), #8A6D1F is ~5.3:1 (passes AA).
  // logo chip fill — black in both themes
  inKindField: '#000000',
  // Bright gold, close to the logo's own #E5B840 so the tile reads on-brand
  // in light mode. Only ~2.2:1 on white, which is fine because this token is
  // used ONLY as a border or a fill — never for text. Text on a gold fill
  // uses inKindField (black); text beside it uses the normal heading/muted
  // colors. Do not colour small text with this.
  inKindOn: '#D9A520',

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
