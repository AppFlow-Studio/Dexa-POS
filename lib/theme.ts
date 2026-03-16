/**
 * Typed re-exports of the canonical color palette + convenience objects.
 *
 * Import this in components:
 *   import { colors, bottomSheetTheme, spinnerColor } from '@/lib/theme';
 */

import { colors as _colors } from "./theme-colors";

/** Full typed palette — mirrors lib/theme-colors.js exactly. */
export const colors = _colors as {
  // Backgrounds
  screen: string;
  panel: string;
  card: string;
  inset: string;
  // Borders
  border: string;
  // Text
  heading: string;
  label: string;
  muted: string;
  // Accent
  teal: string;
  tealMuted: string;
  // Semantic
  success: string;
  warning: string;
  danger: string;
  info: string;
  // On-solid
  onSolid: string;
  // Table status
  tableAvailable: string;
  tableInUse: string;
  tableCleaning: string;
  tableNotInService: string;
  tableOvertime: string;
  tableSeated: string;
  tableOrdered: string;
  tableServed: string;
  tableCheckPresented: string;
  tablePaid: string;
  tableSeating: string;
  tableOrdering: string;
  tablePaying: string;
  tableClosing: string;
  // Order status
  orderSentToKitchen: string;
  orderPreparing: string;
  orderReady: string;
  orderCompleted: string;
  orderCancelled: string;
  orderDefault: string;
  // Payment status
  paymentPaid: string;
  paymentPartial: string;
  paymentPending: string;
  paymentUnpaid: string;
  paymentRefunded: string;
  paymentPartialRefund: string;
  // KDS urgency
  urgencyNormal: string;
  urgencyWarning: string;
  urgencyElevated: string;
  urgencyCritical: string;
  // KDS status tabs
  kdsPending: string;
  kdsCooking: string;
  kdsReady: string;
  kdsDone: string;
  // Order type (KDS)
  orderTypeDelivery: string;
  orderTypeDineIn: string;
  orderTypeToGo: string;
  // Skeleton
  skeleton: string;
  skeletonHighlight: string;
  background: string;
};

// ── Convenience objects ──────────────────────────────────────────

/** Spread onto <BottomSheetModal> or <BottomSheet> */
export const bottomSheetTheme = {
  backgroundStyle: { backgroundColor: colors.panel },
  handleIndicatorStyle: { backgroundColor: colors.muted },
} as const;

/** ActivityIndicator default color */
export const spinnerColor = colors.teal;

/** Switch trackColor prop */
export const switchTrackColors = {
  false: colors.border,
  true: colors.teal,
} as const;

// ── Status color maps ─────────────────────────────────────────

export const TABLE_STATUS_COLORS: Record<string, string> = {
  Available: colors.tableAvailable,
  available: colors.tableAvailable,
  "In Use": colors.tableInUse,
  "Needs Cleaning": colors.tableCleaning,
  cleaning: colors.tableCleaning,
  "Not in Service": colors.tableNotInService,
  not_in_service: colors.tableNotInService,
  Overtime: colors.tableOvertime,
  // Session statuses
  Seated: colors.tableSeated,
  seated: colors.tableSeated,
  Ordered: colors.tableOrdered,
  ordered: colors.tableOrdered,
  Served: colors.tableServed,
  served: colors.tableServed,
  "Check Presented": colors.tableCheckPresented,
  check_presented: colors.tableCheckPresented,
  Paid: colors.tablePaid,
  paid: colors.tablePaid,
  // Local-only intermediate states
  seating: colors.tableSeating,
  ordering: colors.tableOrdering,
  paying: colors.tablePaying,
  closing: colors.tableClosing,
};

export const ORDER_STATUS_COLORS: Record<string, string> = {
  sent_to_kitchen: colors.orderSentToKitchen,
  preparing: colors.orderPreparing,
  ready: colors.orderReady,
  completed: colors.orderCompleted,
  cancelled: colors.orderCancelled,
  void: colors.orderCancelled,
  default: colors.orderDefault,
};

export const PAYMENT_STATUS_COLORS: Record<string, string> = {
  Paid: colors.paymentPaid,
  paid: colors.paymentPaid,
  Partial: colors.paymentPartial,
  Pending: colors.paymentPending,
  Unpaid: colors.paymentUnpaid,
  refunded: colors.paymentRefunded,
  partial_refund: colors.paymentPartialRefund,
};

/** Indexed 0-3 for KDS urgency levels */
export const URGENCY_COLORS = [
  colors.urgencyNormal,
  colors.urgencyWarning,
  colors.urgencyElevated,
  colors.urgencyCritical,
] as const;

export const KDS_STATUS_TAB_COLORS: Record<string, string> = {
  pending: colors.kdsPending,
  cooking: colors.kdsCooking,
  ready: colors.kdsReady,
  done: colors.kdsDone,
};

export const ORDER_TYPE_COLORS: Record<string, string> = {
  delivery: colors.orderTypeDelivery,
  "to-go": colors.orderTypeToGo,
  takeout: colors.orderTypeToGo,
  "dine-in": colors.orderTypeDineIn,
};

export const NOTIFICATION_COLORS = {
  success: colors.success,
  warning: colors.warning,
  error: colors.danger,
  info: colors.info,
} as const;
