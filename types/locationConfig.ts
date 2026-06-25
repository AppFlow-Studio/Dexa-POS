/**
 * Location POS Config — Unified, namespaced configuration for all per-location settings.
 *
 * All settings that should sync across stations at a location live here.
 * Stored as JSONB in `locations.pos_config`.
 * Synced via Supabase broadcast on `location:{id}:settings` channel.
 *
 * To add a new feature toggle:
 * 1. Add namespace to LocationPosConfig
 * 2. Add defaults to DEFAULT_POS_CONFIG
 * 3. Use in UI: useLocationConfigStore(s => s.config.myNamespace.myField)
 * Zero changes to sync infrastructure needed.
 */

import type { SoundPreset } from '@/services/kds/kdsSoundService'

// ============================================================================
// NAMESPACE TYPES
// ============================================================================

export interface DiningConfig {
  enablePerSeatOrdering: boolean
  enableCoursing: boolean
  allowTableMerging: boolean
  allowTableSplitting: boolean
  autoUpdateTableStatus: boolean
  autoClearTableOnPayment: boolean
  defaultSittingTimeMinutes: number
  defaultPartySize: number
}

export interface KdsConfig {
  workflowMode: '2-step' | '3-step'
  autoFireEnabled: boolean
  autoFireDelayMinutes: number
  hideDoneItems: boolean
  displayModifierGroupName: 'for_group_priced' | 'always' | 'never'
  itemNameLines: number
  displaySeatNumbers: boolean
  displayGuestCount: boolean
  alphabeticalSort: boolean
  highlightNotes: boolean
  displayExclusionsAtTop: boolean
  aggregateIdenticalItems: boolean
  aggregateToExistingTickets: boolean
  yellowThresholdMinutes: number
  orangeThresholdMinutes: number
  redThresholdMinutes: number
  newOrderPosition: 'left' | 'right'
  servedOrderSort: 'newest-first' | 'oldest-first'
  ticketTapMode: 'double-tap' | 'single-select'
}

export interface PrintingConfig {
  autoPrintKitchenTickets: boolean
  autoPrintReceipt: boolean
  autoPrintVoidReceipt: boolean
  printVoidTickets: boolean
  printRefundTickets: boolean
  printMerchantCopy: boolean
  printCustomerCopy: boolean
  // When true, receipts show only the pricing for how the guest paid
  // (card payment → card pricing only; cash payment → cash pricing only)
  // instead of the dual Card Total / Cash Total breakdown.
  matchReceiptPricingToPaymentMethod: boolean
}

export interface CashDrawerConfig {
  requireNoSaleReason: boolean
  requireNoSaleApproval: boolean
  noSaleAlertThreshold: number
  blindCloseCount: boolean
  autoPrintNoSaleReceipt: boolean
  defaultOpeningAmount: number
  varianceWarningThreshold: number
  varianceAlertThreshold: number
  requireEodBeforeClose: boolean
}

export interface OnlineOrderingConfig {
  enabled: boolean
  pauseReason: string | null
  autoResumeTime: string | null
  autoAcceptOrders: boolean
  largeOrderApprovalThreshold: number
  rejectWhenBusyThreshold: number
  dynamicPrepTimeEnabled: boolean
  basePrepTime: number
  prepTimeAdjustments: {
    kitchenLoad: boolean
    peakHours: boolean
  }
  preOrderingEnabled: boolean
  preOrderMaxDays: number
  preOrderMinAdvanceMinutes: number
  preOrderMaxDaily: number
}

export interface TipsConfig {
  presetPercentages: number[]
  openDrawerOnTip: boolean
  allowCustom: boolean
  maxTipPercentage: number
  tipAdjustTimeoutSeconds: number
  defaultTipOption: 'none' | 'first' | null
  highTipWarningThreshold: number
  requireTipOnCard: boolean
  enableTipOnCash: boolean
}

export interface PreAuthConfig {
  enabled: boolean
  defaultAmount: number
}

export interface WaitlistConfig {
  notificationGracePeriodMinutes: number
  enabled: boolean
  autoSmsEnabled: boolean
  smsTemplate: string
  reservationsEnabled: boolean
  reservationDaysAhead: number
  maxGuestsPerSlot: number
  slotDurationMinutes: number
  requireDeposit: boolean
  depositAmount: number
  cancellationPolicy: string
}

export interface PaymentConfig {
  cashEnabled: boolean
  splitByAmount: boolean
  splitByItem: boolean
  splitEvenly: boolean
  dualPricingEnabled: boolean
  dualPricingCashDiscountPercent: number
  textToPayEnabled: boolean
}

export interface TimeclockConfig {
  breakAndSwitchEnabled: boolean
  breakDurationMinutes: number
  clockInRequirePin: boolean
  preventEarlyClockIn: boolean
  preventOpenOrdersClockOut: boolean
  autoCloseStaleShifts: boolean // Auto-close shifts open longer than maxShiftHours
  maxShiftHours: number // Threshold for stale shift detection (default: 24)
}

export interface NotificationsConfig {
  soundEnabled: boolean
  onlineOrderSound: SoundPreset
  kioskOrderSound: SoundPreset
  thirdPartyOrderSound: SoundPreset
}

export interface FraudDetectionConfig {
  refundToSelfEnabled: boolean
  alertThreshold: number    // Number of same-cashier cash refunds before manager alert
  blockThreshold: number    // Number before refund is blocked pending manager approval
  windowMinutes: number     // Sliding window in minutes for velocity detection
}

// ============================================================================
// ROOT CONFIG TYPE
// ============================================================================

export interface LocationPosConfig {
  _version: number
  _updated_at: string | null

  dining: DiningConfig
  kds: KdsConfig
  printing: PrintingConfig
  cashDrawer: CashDrawerConfig
  onlineOrdering: OnlineOrderingConfig
  tips: TipsConfig
  preAuth: PreAuthConfig
  waitlist: WaitlistConfig
  payment: PaymentConfig
  notifications: NotificationsConfig
  timeclock: TimeclockConfig
  fraudDetection: FraudDetectionConfig
}

/** All valid namespace keys */
export type ConfigNamespace = keyof Omit<LocationPosConfig, '_version' | '_updated_at'>

/** Map from namespace to its config type */
export type ConfigForNamespace<N extends ConfigNamespace> = LocationPosConfig[N]

// ============================================================================
// DEFAULTS
// ============================================================================

export const DEFAULT_DINING_CONFIG: DiningConfig = {
  enablePerSeatOrdering: false,
  enableCoursing: true,
  allowTableMerging: true,
  allowTableSplitting: false,
  autoUpdateTableStatus: true,
  autoClearTableOnPayment: false,
  defaultSittingTimeMinutes: 60,
  defaultPartySize: 2,
}

export const DEFAULT_KDS_CONFIG: KdsConfig = {
  workflowMode: '2-step',
  autoFireEnabled: false,
  autoFireDelayMinutes: 5,
  hideDoneItems: false,
  displayModifierGroupName: 'for_group_priced',
  itemNameLines: 0,
  displaySeatNumbers: false,
  displayGuestCount: true,
  alphabeticalSort: false,
  highlightNotes: true,
  displayExclusionsAtTop: false,
  aggregateIdenticalItems: false,
  aggregateToExistingTickets: false,
  yellowThresholdMinutes: 5,
  orangeThresholdMinutes: 10,
  redThresholdMinutes: 15,
  newOrderPosition: 'right',
  servedOrderSort: 'newest-first',
  ticketTapMode: 'double-tap',
}

export const DEFAULT_PRINTING_CONFIG: PrintingConfig = {
  autoPrintKitchenTickets: true,
  autoPrintReceipt: false,
  autoPrintVoidReceipt: true,
  printVoidTickets: true,
  printRefundTickets: true,
  printMerchantCopy: false,
  printCustomerCopy: true,
  matchReceiptPricingToPaymentMethod: false,
}

export const DEFAULT_CASH_DRAWER_CONFIG: CashDrawerConfig = {
  requireNoSaleReason: true,
  requireNoSaleApproval: false,
  noSaleAlertThreshold: 5,
  blindCloseCount: true,
  autoPrintNoSaleReceipt: false,
  defaultOpeningAmount: 200.0,
  varianceWarningThreshold: 5.0,
  varianceAlertThreshold: 20.0,
  requireEodBeforeClose: true,
}

export const DEFAULT_ONLINE_ORDERING_CONFIG: OnlineOrderingConfig = {
  enabled: true,
  pauseReason: null,
  autoResumeTime: null,
  autoAcceptOrders: false,
  largeOrderApprovalThreshold: 200,
  rejectWhenBusyThreshold: 35,
  dynamicPrepTimeEnabled: true,
  basePrepTime: 25,
  prepTimeAdjustments: {
    kitchenLoad: true,
    peakHours: true,
  },
  preOrderingEnabled: true,
  preOrderMaxDays: 30,
  preOrderMinAdvanceMinutes: 120,
  preOrderMaxDaily: 25,
}

export const DEFAULT_TIPS_CONFIG: TipsConfig = {
  presetPercentages: [18, 20, 25],
  openDrawerOnTip: false,
  allowCustom: true,
  maxTipPercentage: 100,
  tipAdjustTimeoutSeconds: 30,
  defaultTipOption: null,
  highTipWarningThreshold: 30,
  requireTipOnCard: false,
  enableTipOnCash: true,
}

export const DEFAULT_PRE_AUTH_CONFIG: PreAuthConfig = {
  enabled: false,
  defaultAmount: 25,
}

export const DEFAULT_WAITLIST_CONFIG: WaitlistConfig = {
  notificationGracePeriodMinutes: 10,
  enabled: true,
  autoSmsEnabled: true,
  smsTemplate: 'Hi {name}, your table for {party_size} is ready! Please check in with the host within 5 minutes.',
  reservationsEnabled: true,
  reservationDaysAhead: 30,
  maxGuestsPerSlot: 6,
  slotDurationMinutes: 90,
  requireDeposit: false,
  depositAmount: 20,
  cancellationPolicy: 'Cancellations must be made 24 hours in advance to receive a full refund.',
}

export const DEFAULT_PAYMENT_CONFIG: PaymentConfig = {
  cashEnabled: true,
  splitByAmount: true,
  splitByItem: true,
  splitEvenly: true,
  dualPricingEnabled: false,
  dualPricingCashDiscountPercent: 4.0,
  textToPayEnabled: false,
}

export const DEFAULT_TIMECLOCK_CONFIG: TimeclockConfig = {
  breakAndSwitchEnabled: true,
  breakDurationMinutes: 30,
  clockInRequirePin: true,
  preventEarlyClockIn: true,
  preventOpenOrdersClockOut: true,
  autoCloseStaleShifts: false,
  maxShiftHours: 24,
}

export const DEFAULT_NOTIFICATIONS_CONFIG: NotificationsConfig = {
  soundEnabled: true,
  onlineOrderSound: 'bell',
  kioskOrderSound: 'ding',
  thirdPartyOrderSound: 'alert',
}

export const DEFAULT_FRAUD_DETECTION_CONFIG: FraudDetectionConfig = {
  refundToSelfEnabled: false,
  alertThreshold: 2,
  blockThreshold: 3,
  windowMinutes: 60,
}

export const DEFAULT_POS_CONFIG: LocationPosConfig = {
  _version: 1,
  _updated_at: null,

  dining: DEFAULT_DINING_CONFIG,
  kds: DEFAULT_KDS_CONFIG,
  printing: DEFAULT_PRINTING_CONFIG,
  cashDrawer: DEFAULT_CASH_DRAWER_CONFIG,
  onlineOrdering: DEFAULT_ONLINE_ORDERING_CONFIG,
  tips: DEFAULT_TIPS_CONFIG,
  preAuth: DEFAULT_PRE_AUTH_CONFIG,
  waitlist: DEFAULT_WAITLIST_CONFIG,
  payment: DEFAULT_PAYMENT_CONFIG,
  notifications: DEFAULT_NOTIFICATIONS_CONFIG,
  timeclock: DEFAULT_TIMECLOCK_CONFIG,
  fraudDetection: DEFAULT_FRAUD_DETECTION_CONFIG,
}
