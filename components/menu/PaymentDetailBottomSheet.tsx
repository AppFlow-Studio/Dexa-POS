import { ToastRenderer, useToast } from '@/contexts/ToastContext'
import { useOrderDetailsFetch } from '@/hooks/orders/useOrderDetailsFetch'
import {
  useRefundMutation,
  type PerPaymentRefundDetail
} from '@/hooks/orders/useRefundMutation'
import { useRefundFraudGuard, type FraudGuardCheckResult } from '@/hooks/useRefundFraudGuard'
import RefundApprovalModal from '@/components/previous-orders/RefundApprovalModal'
import { useTipAdjustMutation } from '@/hooks/orders/useTipAdjustMutation'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { colors } from '@/lib/theme'
import type {
  CartItem,
  OrderPaymentItemCoverage,
  OrderProfile,
  OrderProfilePayment,
  OrderRefundItemRecord,
  ReversalRecord
} from '@/lib/types'
import { OrderService } from '@/services/orderService'
import { PrinterService } from '@/services/printing/PrinterService'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useNoPrinterModalStore } from '@/stores/useNoPrinterModalStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePaymentDetailSheetStore } from '@/stores/usePaymentDetailSheetStore'
import { usePreviousOrdersStore } from '@/stores/usePreviousOrdersStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import DeliveryPlatformBadge from '@/components/order/DeliveryPlatformBadge'
import { getTerminalMatchInfo } from '@/utils/terminalMatchGuard'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import { formatDistanceToNow } from 'date-fns'
import { usePathname, useRouter } from 'expo-router'
import {
  ArrowLeft,
  Banknote,
  Check,
  ChefHat,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  CreditCard,
  Delete,
  DollarSign,
  Package,
  Printer,
  RefreshCcw,
  Lock,
  RotateCcw,
  X
} from 'lucide-react-native'
import React, {
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState
} from 'react'
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

// ============================================================================
// TYPES
// ============================================================================
interface PaymentRowData {
  method: string
  timestamp: string
  orderAmount: number
  tipAmount: number
  collected: number
  isVoided: boolean
  last4?: string
  cardBrand?: string
  cardInfo?: {
    brand?: string
    last4?: string
    entryMode?: string
    authCode?: string
    rrn?: string
    transactionNumber?: string
    referenceId?: string
    invoiceNumber?: string
  }
  itemsCovered?: OrderPaymentItemCoverage[]
  isCashPriced?: boolean
  cashSavings?: number
  subtotal_portion?: number
  tax_portion?: number
  paymentId?: string
  dbPaymentId?: string
  originalPaymentIndex: number
  referenceId?: string
  refundedAmount?: number
  original_tip_amount?: number
  tip_adjusted_at?: string
  tip_adjusted_by?: string
  amountTendered?: number
  changeGiven?: number
  isPreAuth?: boolean
  status?: string
}

type RightPaneView = 'summary' | 'refund' | 'tipAdjust'

interface TipAdjustPaymentRow {
  paymentIndex: number
  paymentId?: string
  dbPaymentId?: string
  method: string
  orderAmount: number
  currentTip: number
  referenceId?: string
  rrn?: string
  last4?: string
  cardBrand?: string
  entryMode?: string
  timestamp?: string
  isCard: boolean
}
type RefundType = 'full' | 'items' | 'payments'

// ============================================================================
// REUSABLE COMPONENTS
// ============================================================================

// Action Button Component
interface ActionButtonProps {
  icon: React.ReactNode
  label: string
  onPress: () => void
  variant?: 'default' | 'danger' | 'primary'
  disabled?: boolean
  flex?: boolean
}

const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  label,
  onPress,
  variant = 'default',
  disabled = false,
  flex = true
}) => {
  const getColors = () => {
    if (disabled) {
      return { bg: 'transparent', border: colors.border, text: colors.muted, icon: colors.muted }
    }
    switch (variant) {
      case 'danger':
        return { bg: colors.danger + '15', border: colors.danger + '30', text: colors.danger, icon: colors.danger }
      case 'primary':
        return { bg: colors.teal + '20', border: colors.teal + '50', text: colors.teal, icon: colors.teal }
      default:
        return { bg: 'transparent', border: colors.border, text: colors.label, icon: colors.label }
    }
  }

  const { bg, border, text, icon: iconColor } = getColors()

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      style={{
        flex: flex ? 1 : undefined,
        minWidth: 80,
        paddingVertical: 8,
        paddingHorizontal: 10,
        borderRadius: 8,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
        gap: 5,
        backgroundColor: bg,
        borderColor: border,
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {React.cloneElement(icon as React.ReactElement, { color: iconColor, size: 16 })}
      <Text style={{ fontSize: 12, fontWeight: '600', color: text, textAlign: 'center' }} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  )
}

// Summary Card Component
interface SummaryCardProps {
  amount: number
  cashAmount?: number
  label: string
  icon: React.ReactNode
  isNegative?: boolean
  accentColor?: string
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  amount,
  cashAmount,
  label,
  icon,
  isNegative = false,
}) => (
  <View
    style={{
      flex: 1,
      backgroundColor: colors.teal + '10',
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.teal + '30',
    }}
  >
    <View style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal + '15', marginBottom: 10 }}>
      {React.cloneElement(icon as React.ReactElement, { color: colors.teal, size: 16 })}
    </View>
    <Text style={{ fontSize: 18, fontWeight: '700', color: colors.heading, marginBottom: 4 }} numberOfLines={1}>
      {isNegative && amount > 0 ? '−' : ''}${amount?.toFixed(2)}
    </Text>
    {cashAmount !== undefined && cashAmount > 0 && (
      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
        <Banknote color={colors.teal} size={14} />
        <Text style={{ fontSize: 11, color: colors.teal, marginLeft: 4, fontWeight: '600' }}>${cashAmount?.toFixed(2)} cash</Text>
      </View>
    )}
    <Text style={{ fontSize: 11, color: colors.muted, fontWeight: '500' }}>{label}</Text>
  </View>
)

const normalizeCardBrand = (brand?: string) => brand?.trim().toLowerCase() || ''

const formatCardBrand = (brand?: string) => {
  switch (normalizeCardBrand(brand)) {
    case 'visa':
      return 'Visa'
    case 'mastercard':
      return 'Mastercard'
    case 'amex':
    case 'american express':
      return 'Amex'
    case 'discover':
      return 'Discover'
    case 'diners':
    case 'diners club':
      return 'Diners'
    case 'jcb':
      return 'JCB'
    default:
      return brand ? brand : ''
  }
}

const getCardBrandBadgeStyles = (brand?: string) => {
  // All card brands use teal for consistency with design theme
  return {
    backgroundColor: colors.teal + '15',
    borderColor: colors.teal + '30',
    textColor: colors.teal
  }
}

const CardBrandBadge: React.FC<{ brand?: string }> = ({ brand }) => {
  const label = formatCardBrand(brand)
  if (!label) return null

  const styles = getCardBrandBadgeStyles(brand)

  return (
    <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, backgroundColor: styles.backgroundColor, borderColor: styles.borderColor }}>
      <Text style={{ fontSize: 10, fontWeight: '600', textTransform: 'uppercase', color: styles.textColor }}>
        {label}
      </Text>
    </View>
  )
}

const CardInfoItem: React.FC<{ label: string; value?: string }> = ({
  label,
  value
}) => {
  if (!value) return null
  return (
    <View style={{ width: '50%', paddingRight: 8, marginBottom: 8 }}>
      <Text style={{ fontSize: 10, color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4, marginBottom: 2 }}>{label}</Text>
      <Text style={{ fontSize: 12, color: colors.heading }} numberOfLines={1}>{value}</Text>
    </View>
  )
}

// ============================================================================
// LEFT PANE - ORDER RECEIPT VIEW
// ============================================================================
interface LeftPaneProps {
  order: any
  subtotal: number
  discount: number
  tax: number
  total: number
}

const LeftPane: React.FC<LeftPaneProps> = ({
  order,
  subtotal,
  discount,
  tax,
  total
}) => {
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null)

  // Determine if order was cash-paid for price display
  const wasCashPaid = useMemo(() => {
    const nonVoided = (order?.payments || []).filter((p: any) => !p.isVoided)
    return (
      nonVoided.length > 0 &&
      nonVoided.every((p: any) => p.isCashPriced || p.method === 'Cash')
    )
  }, [order?.payments])

  // Build timeline entries for an item
  const getItemTimeline = useCallback(
    (item: CartItem) => {
      const entries: {
        type: 'ordered' | 'paid' | 'refunded' | 'voided'
        label: string
        timestamp?: string
      }[] = []

      // Payment entries - match via itemsCovered
      if (order?.payments) {
        ;(order.payments as OrderProfilePayment[]).forEach(
          (payment: OrderProfilePayment) => {
            const covered = payment.itemsCovered?.find(
              (c: OrderPaymentItemCoverage) =>
                c.itemId === item.db_order_item_id
            )
            if (covered && !payment.isVoided) {
              const method =
                payment.method?.toLowerCase() === 'card' ? 'Card' : 'Cash'
              const last4 =
                payment.last4 ||
                payment.transactionDetails?.dejavooTransaction?.cardLast4
              const desc =
                method === 'Card' && last4
                  ? `Paid — ${payment.cardBrand || 'Card'} ••••${last4}`
                  : `Paid — ${method}`
              entries.push({
                type: 'paid',
                label: desc,
                timestamp: payment.timestamp
              })
            }
          }
        )
      }

      // Refund entries
      if (order?.order_refund_items) {
        ;(order.order_refund_items as OrderRefundItemRecord[]).forEach(
          (refundItem: OrderRefundItemRecord) => {
            if (refundItem.order_item_id === item.db_order_item_id) {
              // Find the linked reversal for reason
              const reversal = (
                (order.reversals as ReversalRecord[]) || []
              ).find((r: ReversalRecord) => r.id === refundItem.reversal_id)
              const reason =
                refundItem.refund_reason_detail ||
                reversal?.reason_description ||
                refundItem.refund_reason
              const desc = reason ? `Refunded — ${reason}` : 'Refunded'
              entries.push({
                type: 'refunded',
                label: desc,
                timestamp: refundItem.created_at
              })
            }
          }
        )
      }

      // Void entry
      if (item.is_voided) {
        const desc = item.void_reason
          ? `Voided — ${item.void_reason}`
          : 'Voided'
        entries.push({ type: 'voided', label: desc })
      }

      // Sort chronologically so events appear in the order they occurred
      entries.sort((a, b) => {
        if (!a.timestamp) return 1
        if (!b.timestamp) return -1
        return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
      })

      return entries
    },
    [order]
  )

  // Get modifiers display for an item
  const getModifiersDisplay = (item: CartItem) => {
    if (
      !item.customizations.modifiers ||
      item.customizations.modifiers.length === 0
    ) {
      return null
    }

    return item.customizations.modifiers.map((mod, idx) => {
      const optionNames = mod.options?.map(opt => opt.name).join(', ') || ''
      const priceAdjust = mod.options?.reduce(
        (sum, opt) => sum + (opt.price || 0),
        0
      )

      return (
        <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginLeft: 12, marginTop: 2 }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>• </Text>
          <Text style={{ fontSize: 11, color: colors.label, flex: 1 }}>
            {mod.categoryName ? `${mod.categoryName}: ` : ''}
            {optionNames}
            {priceAdjust && priceAdjust > 0
              ? <Text style={{ color: colors.success, fontSize: 11 }}> +${priceAdjust?.toFixed(2)}</Text>
              : <Text style={{ color: colors.muted, fontSize: 11 }}> +${priceAdjust?.toFixed(2)}</Text>
            }
          </Text>
        </View>
      )
    })
  }

  return (
    <View style={{ flex: 4, backgroundColor: colors.panel, borderRightWidth: 1, borderRightColor: colors.border }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>Order Receipt</Text>
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
          {order?.items?.length || 0} items
        </Text>
      </View>

      {/* Items List */}
      <ScrollView
        className='flex-1'
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        <View className='px-4 py-2'>
          {order?.items?.map((item: CartItem, index: number) => {
            const isVoided = item.is_voided

            // Count currently-covered quantity from active payments
            let coveredQty = 0
            if (order?.payments) {
              ;(order.payments as OrderProfilePayment[]).forEach(
                (payment: OrderProfilePayment) => {
                  if (payment.isVoided) return
                  const covered = payment.itemsCovered?.find(
                    (c: OrderPaymentItemCoverage) =>
                      c.itemId === item.db_order_item_id
                  )
                  if (covered) coveredQty += covered.quantity
                }
              )
            }
            // Subtract refunded quantity to get net covered.
            // Only count refunds from non-void reversals linked to non-voided payments.
            // Void reversals cancel the payment — they're not item-level refunds.
            const nonVoidReversalIds = new Set(
              ((order.reversals as ReversalRecord[]) || [])
                .filter(r => r.status === 'completed' && r.reversal_type !== 'void')
                .map(r => r.id)
            )
            let refundedQty = 0
            if (order?.order_refund_items) {
              ;(order.order_refund_items as OrderRefundItemRecord[]).forEach(
                (ri: OrderRefundItemRecord) => {
                  if (
                    ri.order_item_id === item.db_order_item_id &&
                    nonVoidReversalIds.has(ri.reversal_id)
                  )
                    refundedQty += ri.quantity_refunded
                }
              )
            }
            const netCoveredQty = coveredQty - refundedQty

            const hasRefundHistory = refundedQty > 0
            const isPaid = netCoveredQty >= item.quantity
            const isPartialPaid =
              netCoveredQty > 0 && netCoveredQty < item.quantity
            const isFullyRefunded = hasRefundHistory && netCoveredQty <= 0
            const isPartiallyRefunded =
              hasRefundHistory &&
              netCoveredQty > 0 &&
              netCoveredQty < item.quantity

            // Item left border - always teal per design theme
            const borderColor = colors.teal

            const isUnpaid =
              !isVoided && !isPaid && !isPartialPaid && !hasRefundHistory
            const itemKey = item.id || String(index)
            const isExpanded = expandedItemId === itemKey
            const timeline = isExpanded ? getItemTimeline(item) : []

            return (
              <TouchableOpacity
                key={itemKey}
                activeOpacity={0.7}
                onPress={() => setExpandedItemId(isExpanded ? null : itemKey)}
              >
                <View
                  style={{
                    borderLeftWidth: 3,
                    borderLeftColor: borderColor,
                    paddingVertical: 10,
                    paddingLeft: 10,
                    borderBottomWidth: index < (order?.items?.length || 0) - 1 ? 1 : 0,
                    borderBottomColor: colors.border,
                    opacity: isVoided ? 0.6 : 1,
                  }}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                    {/* Item Info */}
                    <View style={{ flex: 1, paddingRight: 8 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 4, marginBottom: 2 }}>
                        {isVoided && (
                          <View style={{ backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 }}>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: colors.teal }}>VOID</Text>
                          </View>
                        )}
                        {isFullyRefunded && !isVoided && (
                          <View style={{ backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 }}>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: colors.teal }}>REFUNDED</Text>
                          </View>
                        )}
                        {isPartiallyRefunded && !isVoided && (
                          <View style={{ backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 }}>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: colors.teal }}>{item.refundedQuantity} REFUND</Text>
                          </View>
                        )}
                        {isPaid && !isVoided && (
                          <View style={{ backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 }}>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: colors.teal }}>PAID</Text>
                          </View>
                        )}
                        {isPartialPaid && !isVoided && !hasRefundHistory && (
                          <View style={{ backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 }}>
                            <Text style={{ fontSize: 10, fontWeight: '600', color: colors.teal }}>{netCoveredQty}/{item.quantity}</Text>
                          </View>
                        )}
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: isUnpaid ? '700' : '500',
                            color: (isVoided || isFullyRefunded) ? colors.muted : colors.heading,
                            textDecorationLine: (isVoided || isFullyRefunded) ? 'line-through' : 'none',
                          }}
                          numberOfLines={2}
                        >
                          {item.name}
                        </Text>
                      </View>
                      {/* Modifiers */}
                      {getModifiersDisplay(item)}
                      {/* Notes */}
                      {item.customizations.notes && (
                        <Text style={{ fontSize: 11, color: colors.muted, fontStyle: 'italic', marginTop: 3, marginLeft: 12 }}>
                          Note: {item.customizations.notes}
                        </Text>
                      )}
                    </View>

                    {/* Quantity & Price + Status Icon */}
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end' }}>
                      <View style={{ alignItems: 'flex-end', marginRight: 4 }}>
                        <Text style={{ fontSize: 11, color: isVoided ? colors.muted : colors.label }}>{item.quantity}x</Text>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: isVoided ? colors.muted : isFullyRefunded ? colors.teal : colors.heading,
                            textDecorationLine: (isVoided || isFullyRefunded) ? 'line-through' : 'none',
                          }}
                        >
                          {isFullyRefunded && !isVoided ? '-' : ''}$
                          {((wasCashPaid
                            ? (item.cashPrice ?? item.baseCashPrice ?? item.price ?? 0)
                            : (item.price || 0)) * item.quantity)?.toFixed(2)}
                        </Text>
                      </View>
                      {/* Status icon */}
                      {isPaid && !isVoided && (
                        <Check size={14} color={colors.teal} />
                      )}
                      {isFullyRefunded && !isVoided && (
                        <RotateCcw size={14} color={colors.teal} />
                      )}
                      {isPartiallyRefunded && !isVoided && (
                        <RotateCcw size={12} color={colors.teal} />
                      )}
                      {/* Expand/collapse chevron */}
                      {isExpanded ? (
                        <ChevronUp size={14} color={colors.label} style={{ marginLeft: 2 }} />
                      ) : (
                        <ChevronDown size={14} color={colors.label} style={{ marginLeft: 2 }} />
                      )}
                    </View>
                  </View>

                  {/* Collapsible Timeline */}
                  {isExpanded && timeline.length > 0 && (
                    <View style={{ marginTop: 8, marginLeft: 8, paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.border }}>
                      {timeline.map((entry, tIdx) => {
                        const dotColor = colors.teal
                        return (
                          <View key={tIdx} style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 6 }}>
                            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dotColor, marginTop: 3, marginLeft: -16 }} />
                            <View style={{ marginLeft: 8, flex: 1 }}>
                              <Text style={{ fontSize: 12, color: colors.label }}>{entry.label}</Text>
                              {entry.timestamp && (
                                <Text style={{ fontSize: 10, color: colors.muted }}>
                                  {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                                </Text>
                              )}
                            </View>
                          </View>
                        )
                      })}
                    </View>
                  )}
                  {isExpanded && timeline.length === 0 && (
                    <View style={{ marginTop: 6, marginLeft: 8 }}>
                      <Text style={{ fontSize: 10, color: colors.muted, fontStyle: 'italic' }}>No history available</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            )
          })}

          {/* Empty State */}
          {(!order?.items || order.items.length === 0) && (
            <View style={{ paddingVertical: 40, alignItems: 'center' }}>
              <Package size={28} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.muted, marginTop: 8 }}>No items</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Pricing Footer */}
      <View style={{ paddingHorizontal: 14, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.border, backgroundColor: colors.screen }}>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
          <Text style={{ fontSize: 13, color: colors.label }}>Subtotal</Text>
          <Text style={{ fontSize: 13, color: colors.heading }}>${subtotal?.toFixed(2)}</Text>
        </View>
        {discount > 0 && (
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
            <Text style={{ fontSize: 13, color: colors.success }}>Discount</Text>
            <Text style={{ fontSize: 13, color: colors.success }}>-${discount?.toFixed(2)}</Text>
          </View>
        )}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 13, color: colors.label }}>Tax</Text>
          <Text style={{ fontSize: 13, color: colors.heading }}>${tax?.toFixed(2)}</Text>
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.border }}>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}>Total</Text>
          <Text style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}>${total?.toFixed(2)}</Text>
        </View>
      </View>
    </View>
  )
}

// ============================================================================
// RIGHT PANE - PAYMENT SUMMARY VIEW
// ============================================================================
interface RightPaneSummaryProps {
  order: any
  paymentSummary: {
    orderTotal: number
    orderCashTotal: number
    refunds: number
    collected: number
    held?: number
    payments: PaymentRowData[]
    tips?: number
  }
  onReopenOrder: () => void
  onCloseOrder: () => void
  onContinueCharging: () => void
  onIssueReceipt: () => void
  onPrintKitchenTicket: () => void
  onTipAdjust: () => void
  onRefund: () => void
  formatTimestamp: (timestamp: string) => string
  terminalCanProcess: boolean
  terminalBlockReason?: string
}

const RightPaneSummary: React.FC<RightPaneSummaryProps> = ({
  order,
  paymentSummary,
  onReopenOrder,
  onCloseOrder,
  onContinueCharging,
  onIssueReceipt,
  onPrintKitchenTicket,
  onTipAdjust,
  onRefund,
  formatTimestamp,
  terminalCanProcess,
  terminalBlockReason
}) => {
  const [expandedPaymentIndex, setExpandedPaymentIndex] = useState<
    number | null
  >(null)

  const isOpen = order?.check_status === 'Opened'
  const balanceDue =
    paymentSummary.orderTotal -
    (paymentSummary.collected - (paymentSummary.tips ?? 0)) +
    (paymentSummary.refunds || 0)
  const hasBalanceDue = balanceDue > 0.01
  const hasCardPayments = paymentSummary.payments.some(
    p => p.method === 'Card' && !p.isVoided
  )

  // Helper to get completed reversals for a specific payment
  const getReversalsForPayment = useCallback(
    (paymentId: string | undefined): ReversalRecord[] => {
      if (!paymentId || !order?.reversals) return []
      return (order.reversals as ReversalRecord[]).filter(
        r => r.original_payment_id === paymentId && r.status === 'completed'
      )
    },
    [order?.reversals]
  )
  return (
    <View style={{ flex: 6, backgroundColor: colors.screen }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Summary Cards */}
        <View style={{ paddingHorizontal: 14, paddingVertical: 14 }}>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <SummaryCard
              amount={paymentSummary.orderTotal}
              cashAmount={paymentSummary.orderCashTotal}
              label='Order Total'
              icon={<DollarSign size={18} color={colors.teal} />}
              accentColor={colors.teal}
            />
            <SummaryCard
              amount={paymentSummary.refunds}
              label={
                ((order?.reversals as ReversalRecord[]) || []).filter(
                  (r: ReversalRecord) => r.status === 'completed'
                ).length > 0
                  ? `Refunds (${
                      ((order?.reversals as ReversalRecord[]) || []).filter(
                        (r: ReversalRecord) => r.status === 'completed'
                      ).length
                    })`
                  : 'Refunds'
              }
              icon={<RefreshCcw size={14} color={colors.danger} />}
              isNegative
              accentColor={colors.danger}
            />
            <SummaryCard
              amount={paymentSummary.collected - paymentSummary.refunds}
              label='Net Collected'
              icon={<CircleDollarSign size={18} color={colors.teal} />}
              accentColor={colors.teal}
            />
            {(paymentSummary.held ?? 0) > 0 && (
              <SummaryCard
                amount={paymentSummary.held!}
                label='Auth Hold'
                icon={<Lock size={14} />}
              />
            )}
          </View>
        </View>

        {/* Transaction History */}
        <View style={{ paddingHorizontal: 14 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12, gap: 8 }}>
            <View style={{ width: 3, height: 18, backgroundColor: colors.teal, borderRadius: 1.5 }} />
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.teal, textTransform: 'uppercase', letterSpacing: 0.6 }}>
              Transaction History
            </Text>
          </View>

          {/* Payment List */}
          {paymentSummary.payments.length === 0 ? (
            <View style={{ paddingVertical: 32, alignItems: 'center' }}>
              <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: colors.card, alignItems: 'center', justifyContent: 'center', marginBottom: 10 }}>
                <CreditCard size={20} color={colors.muted} />
              </View>
              <Text style={{ fontSize: 13, color: colors.muted }}>No payments recorded</Text>
            </View>
          ) : (
            paymentSummary.payments.map((payment, index) => {
              const hasItemsCovered =
                payment.itemsCovered && payment.itemsCovered.length > 0
              const hasCardInfo =
                !!payment.cardInfo &&
                Object.values(payment.cardInfo).some(Boolean)
              const canExpand = hasItemsCovered || hasCardInfo
              const isExpanded = expandedPaymentIndex === index
              const cardBrandLabel = formatCardBrand(
                payment.cardInfo?.brand || payment.cardBrand
              )
              const cardLast4 = payment.cardInfo?.last4 || payment.last4

              return (
                <View
                  key={index}
                  className={`${
                    index < paymentSummary.payments.length - 1
                      ? 'border-b border-gray-800/50'
                      : ''
                  }`}
                >
                  <TouchableOpacity
                    onPress={() => canExpand && setExpandedPaymentIndex(isExpanded ? null : index)}
                    activeOpacity={canExpand ? 0.7 : 1}
                    style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 10 }}
                  >
                    {/* Payment Method Icon */}
                    <View style={{
                      width: 40, height: 40, borderRadius: 10,
                      backgroundColor: payment.isVoided ? colors.danger + '15' : colors.teal + '15',
                      borderWidth: 1.5, borderColor: payment.isVoided ? colors.danger + '40' : colors.teal + '40',
                      alignItems: 'center', justifyContent: 'center', marginRight: 10
                    }}>
                      {payment.isVoided ? (
                        <X size={16} color={colors.danger} />
                      ) : payment.method === 'Card' ? (
                        <CreditCard size={18} color={colors.teal} />
                      ) : (
                        <Banknote size={18} color={colors.teal} />
                      )}
                    </View>

                    {/* Payment Details */}
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: payment.isVoided ? colors.muted : colors.heading }}>
                          {payment.method === 'Card' && (cardLast4 || cardBrandLabel)
                            ? `${cardBrandLabel || 'Card'}${cardLast4 ? ` •••• ${cardLast4}` : ''}`
                            : payment.method}
                        </Text>
                        {payment.method === 'Card' && cardBrandLabel && <CardBrandBadge brand={cardBrandLabel} />}
                        {payment.isVoided && (
                          <View style={{ backgroundColor: colors.danger + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.danger }}>VOIDED</Text>
                          </View>
                        )}
                        {payment.isPreAuth && !payment.isVoided && (
                          <View style={{ backgroundColor: colors.warning + '20', paddingHorizontal: 6, paddingVertical: 2, borderRadius: 20 }}>
                            <Text style={{ fontSize: 10, fontWeight: '700', color: colors.warning }}>AUTH HOLD</Text>
                          </View>
                        )}
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 6 }}>
                        <Text style={{ fontSize: 11, color: colors.muted }}>{formatTimestamp(payment.timestamp)}</Text>
                        {canExpand && (
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                            <Package size={10} color={colors.muted} />
                            {hasItemsCovered && <Text style={{ fontSize: 11, color: colors.muted }}>{payment.itemsCovered!.length} items</Text>}
                            {isExpanded ? <ChevronUp size={11} color={colors.muted} /> : <ChevronDown size={11} color={colors.muted} />}
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Amount */}
                    <View style={{ alignItems: 'flex-end' }}>
                      {payment.tipAmount > 0 && (
                        <Text style={{ fontSize: 11, color: colors.info }}>+${payment.tipAmount?.toFixed(2)} tip</Text>
                      )}
                      <Text style={{
                        fontSize: 14, fontWeight: '700',
                        color: payment.isVoided ? colors.danger : payment.isPreAuth ? colors.warning : colors.success
                      }}>
                        {payment.isVoided ? 'Voided' : payment.isPreAuth ? `$${payment.orderAmount?.toFixed(2)} held` : `$${payment.collected?.toFixed(2)}`}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Expanded Details */}
                  {isExpanded && canExpand && (
                    <View style={{ backgroundColor: colors.panel, borderRadius: 10, marginBottom: 10, padding: 12, borderWidth: 1, borderColor: colors.border }}>
                      {hasCardInfo && (
                        <View style={hasItemsCovered ? { marginBottom: 12 } : {}}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                            {payment.method === 'Cash' ? <Banknote size={12} color={colors.muted} /> : <CreditCard size={12} color={colors.muted} />}
                            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, marginLeft: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                              {payment.method === 'Cash' ? 'Cash Payment Details' : 'Card Details'}
                            </Text>
                          </View>
                          {/* Card brand/last4 — only for card payments */}
                          {payment.method !== 'Cash' && (
                            <View className='flex-row items-center justify-between'>
                              <View className='flex-row items-center'>
                                {payment.cardInfo?.brand && (
                                  <CardBrandBadge
                                    brand={payment.cardInfo.brand}
                                  />
                                )}
                                {payment.cardInfo?.last4 && (
                                  <Text style={{ fontSize: 13, color: colors.heading, marginLeft: 8 }}>
                                    •••• {payment.cardInfo.last4}
                                  </Text>
                                )}
                              </View>
                              {payment.cardInfo?.entryMode && (
                                <Text style={{ fontSize: 11, color: colors.muted }}>
                                  Entry: {payment.cardInfo.entryMode}
                                </Text>
                              )}
                            </View>
                          )}
                          {/* Cash-specific: Amount Tendered & Change Given */}
                          {payment.method === 'Cash' && (
                            <View className='flex-row flex-wrap mt-1'>
                              {payment.amountTendered != null && (
                                <CardInfoItem
                                  label='Amount Tendered'
                                  value={`$${payment.amountTendered.toFixed(
                                    2
                                  )}`}
                                />
                              )}
                              {payment.changeGiven != null &&
                                payment.changeGiven > 0 && (
                                  <CardInfoItem
                                    label='Change Given'
                                    value={`$${payment.changeGiven.toFixed(2)}`}
                                  />
                                )}
                            </View>
                          )}
                          <View className='flex-row flex-wrap mt-3'>
                            {/* Card-only fields */}
                            {payment.method !== 'Cash' && (
                              <>
                                <CardInfoItem
                                  label='Auth Code'
                                  value={payment.cardInfo?.authCode}
                                />
                                <CardInfoItem
                                  label='RRN'
                                  value={payment.cardInfo?.rrn}
                                />
                                <CardInfoItem
                                  label='Invoice'
                                  value={payment.cardInfo?.invoiceNumber}
                                />
                              </>
                            )}
                            {/* Shared fields */}
                            <CardInfoItem
                              label='Txn #'
                              value={payment.cardInfo?.transactionNumber}
                            />
                            <CardInfoItem
                              label='Ref ID'
                              value={payment.cardInfo?.referenceId}
                            />
                          </View>
                        </View>
                      )}

                      {hasItemsCovered &&
                        (() => {
                          const isCash =
                            payment.isCashPriced || payment.method === 'Cash'
                          let totalTax = 0
                          return (
                            <View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                                <Package size={12} color={colors.muted} />
                                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, marginLeft: 6, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                                  Items Covered
                                </Text>
                              </View>
                              {payment.itemsCovered!.map(
                                (coveredItem, itemIndex) => {
                                  // Cross-reference with order items for tax/cash price info
                                  const cartItem = order?.items?.find(
                                    (ci: CartItem) =>
                                      ci.db_order_item_id === coveredItem.itemId
                                  )
                                  const displaySubtotal =
                                    isCash && cartItem?.cashSubtotal != null
                                      ? (cartItem.cashSubtotal /
                                          cartItem.quantity) *
                                        coveredItem.quantity
                                      : coveredItem.subtotal
                                  const displayUnitPrice =
                                    isCash && cartItem?.cashPrice != null
                                      ? cartItem.cashPrice
                                      : coveredItem.unitPrice
                                  const itemTax = cartItem
                                    ? isCash && cartItem.cashTaxAmount != null
                                      ? (cartItem.cashTaxAmount /
                                          cartItem.quantity) *
                                        coveredItem.quantity
                                      : (cartItem.taxAmount /
                                          cartItem.quantity) *
                                        coveredItem.quantity
                                    : 0
                                  totalTax += itemTax
                                  return (
                                    <View
                                      key={coveredItem.itemId || itemIndex}
                                      style={{
                                        paddingVertical: 8,
                                        borderBottomWidth: itemIndex < payment.itemsCovered!.length - 1 ? 1 : 0,
                                        borderBottomColor: colors.border,
                                      }}
                                    >
                                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                                          <View style={{ width: 24, height: 24, borderRadius: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center', marginRight: 8 }}>
                                            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.label }}>{coveredItem.quantity}x</Text>
                                          </View>
                                          <Text style={{ fontSize: 12, color: colors.heading }} numberOfLines={1}>{coveredItem.itemName}</Text>
                                        </View>
                                        <View style={{ alignItems: 'flex-end' }}>
                                          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>${displaySubtotal?.toFixed(2)}</Text>
                                          {isCash && <Text style={{ fontSize: 10, color: colors.success }}>Cash Price</Text>}
                                        </View>
                                      </View>
                                      {cartItem && cartItem.taxRate > 0 && (
                                        <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 32, marginTop: 2 }}>Tax: ${itemTax.toFixed(2)} ({cartItem.taxRate}%)</Text>
                                      )}
                                    </View>
                                  )
                                }
                              )}
                              {totalTax > 0 && (
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingTop: 8, marginTop: 4, borderTopWidth: 1, borderTopColor: colors.border }}>
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.label }}>Total Tax</Text>
                                  <Text style={{ fontSize: 12, fontWeight: '600', color: colors.heading }}>${totalTax.toFixed(2)}</Text>
                                </View>
                              )}
                            </View>
                          )
                        })()}
                    </View>
                  )}

                  {/* Refund/Void History for this payment */}
                  {payment.dbPaymentId &&
                    getReversalsForPayment(payment.dbPaymentId).map((reversal, rIdx) => (
                      <View key={`reversal-${reversal.id || rIdx}`} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 46, borderTopWidth: 1, borderTopColor: colors.border }}>
                        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.danger + '15', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                          <RotateCcw size={13} color={colors.danger} />
                        </View>
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.danger }}>
                              {reversal.reversal_type === 'void' ? 'VOIDED' : reversal.reversal_type === 'refund' ? 'REFUNDED' : reversal.reversal_type === 'partial_refund' ? 'PARTIAL REFUND' : 'ITEM RETURN'}
                            </Text>
                            {reversal.reason_description && (
                              <Text style={{ fontSize: 11, color: colors.muted }} numberOfLines={1}>• {reversal.reason_description}</Text>
                            )}
                          </View>
                          <Text style={{ fontSize: 11, color: colors.muted }}>
                            {reversal.completed_at ? formatDistanceToNow(new Date(reversal.completed_at), { addSuffix: true }) : reversal.requested_at ? formatDistanceToNow(new Date(reversal.requested_at), { addSuffix: true }) : ''}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 13, fontWeight: '600', color: colors.danger }}>-${Number(reversal.amount || 0)?.toFixed(2)}</Text>
                      </View>
                    ))}

                  {/* Tip Adjustment Log */}
                  {payment.tip_adjusted_at && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingLeft: 46, borderTopWidth: 1, borderTopColor: colors.border }}>
                      <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: colors.info + '15', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                        <CircleDollarSign size={13} color={colors.teal} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={{ fontSize: 11, fontWeight: '700', color: colors.info }}>TIP ADJUSTED</Text>
                          <Text style={{ fontSize: 11, color: colors.muted }}>
                            • ${Number(payment.original_tip_amount || 0).toFixed(2)} → ${Number(payment.tipAmount).toFixed(2)}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, color: colors.muted }}>
                          {formatDistanceToNow(new Date(payment.tip_adjusted_at), { addSuffix: true })}
                        </Text>
                      </View>
                      <Text style={{ fontSize: 13, fontWeight: '600', color: payment.tipAmount >= (payment.original_tip_amount || 0) ? colors.info : colors.danger }}>
                        {payment.tipAmount >= (payment.original_tip_amount || 0) ? '+' : '-'}${Math.abs(payment.tipAmount - (payment.original_tip_amount || 0)).toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>
              )
            })
          )}
        </View>
      </ScrollView>

      {/* Action Buttons Footer */}
      <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, paddingHorizontal: 14, paddingVertical: 12, backgroundColor: colors.panel, borderTopWidth: 1.5, borderTopColor: colors.teal + '30' }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          {!isOpen && (
            <ActionButton
              icon={<RotateCcw size={16} />}
              label='Reopen'
              onPress={onReopenOrder}
              variant='primary'
            />
          )}
          {isOpen && (
            <ActionButton
              icon={<Check size={16} />}
              label='Close Order'
              onPress={onCloseOrder}
              variant='primary'
            />
          )}
          {isOpen && hasBalanceDue && (
            <ActionButton
              icon={<DollarSign size={16} />}
              label='Charge'
              onPress={onContinueCharging}
              variant='primary'
            />
          )}
          {paymentSummary.collected > 0 && (
            <ActionButton
              icon={<Printer size={16} />}
              label='Print Receipt'
              onPress={onIssueReceipt}
              variant='primary'
            />
          )}
          {order?.items && order.items.length > 0 && (
            <ActionButton
              icon={<ChefHat size={16} />}
              label='Print Kitchen'
              onPress={onPrintKitchenTicket}
              variant='primary'
            />
          )}
          {hasCardPayments && terminalCanProcess && (
            <ActionButton
              icon={<CircleDollarSign size={16} />}
              label='Adjust Tip'
              onPress={onTipAdjust}
              variant='primary'
            />
          )}
          {paymentSummary.collected > 0 && terminalCanProcess && (
            <ActionButton
              icon={<RefreshCcw size={16} />}
              label='Process Refund'
              onPress={onRefund}
              variant='danger'
            />
          )}
        </View>
      </View>
    </View>
  )
}

// ============================================================================
// RIGHT PANE - TIP ADJUST VIEW
// ============================================================================
interface RightPaneTipAdjustProps {
  order: OrderProfile
  paymentSummary: {
    orderTotal: number
    orderCashTotal: number
    refunds: number
    collected: number
    held?: number
    payments: PaymentRowData[]
  }
  onBack: () => void
  onTipAdjusted: () => void
  onProcessingChange?: (processing: boolean) => void
}

const RightPaneTipAdjust: React.FC<RightPaneTipAdjustProps> = ({
  order,
  paymentSummary,
  onBack,
  onTipAdjusted,
  onProcessingChange
}) => {
  const tipAdjustMutation = useTipAdjustMutation()
  const processing = tipAdjustMutation.isPending
  console.log('PaymentDetailBottomSheet Payment Summary', paymentSummary)
  const [tipAmounts, setTipAmounts] = useState<Record<number, string>>({})
  const [activeInput, setActiveInput] = useState<number | null>(null)
  const [showHighTipConfirm, setShowHighTipConfirm] = useState(false)

  // Notify parent of processing state changes
  useEffect(() => {
    onProcessingChange?.(processing)
  }, [processing, onProcessingChange])

  // Filter card payments that are not voided
  const cardPayments: TipAdjustPaymentRow[] = useMemo(() => {
    return paymentSummary.payments
      .filter(p => p.method === 'Card' && !p.isVoided)
      .map(p => ({
        paymentIndex: p.originalPaymentIndex,
        paymentId: p.paymentId,
        dbPaymentId: p.dbPaymentId,
        method: p.method,
        orderAmount: p.orderAmount,
        currentTip: p.tipAmount,
        referenceId: p.referenceId || p.cardInfo?.referenceId,
        rrn: p.cardInfo?.rrn,
        last4: p.last4 || p.cardInfo?.last4,
        cardBrand: p.cardBrand || p.cardInfo?.brand,
        entryMode: p.cardInfo?.entryMode,
        timestamp: p.timestamp,
        isCard: true
      }))
  }, [paymentSummary.payments])

  // Initialize tip amounts from current tips (pre-fill existing values)
  useEffect(() => {
    const initial: Record<number, string> = {}
    cardPayments.forEach(p => {
      initial[p.paymentIndex] = p.currentTip > 0 ? p.currentTip?.toFixed(2) : ''
    })
    setTipAmounts(initial)
    if (cardPayments.length > 0) {
      setActiveInput(cardPayments[0].paymentIndex)
    }
  }, [cardPayments])

  // Computed values
  const totalNewTips = useMemo(() => {
    return Object.values(tipAmounts).reduce(
      (sum, val) => sum + (parseFloat(val) || 0),
      0
    )
  }, [tipAmounts])

  const totalOrderAmount = useMemo(() => {
    return cardPayments.reduce((sum, p) => sum + p.orderAmount || 0, 0)
  }, [cardPayments])

  const hasChanges = useMemo(() => {
    return cardPayments.some(p => {
      const newTip = parseFloat(tipAmounts[p.paymentIndex] || '0') || 0
      return Math.abs(newTip - p.currentTip) > 0.001
    })
  }, [cardPayments, tipAmounts])

  const tipDelta = useMemo(() => {
    const totalCurrentTips = cardPayments.reduce(
      (sum, p) => sum + p.currentTip,
      0
    )
    return totalNewTips - totalCurrentTips
  }, [cardPayments, totalNewTips])

  // Select a payment row for editing
  const handleSelectPayment = useCallback((paymentIndex: number) => {
    setActiveInput(paymentIndex)
  }, [])

  // Keypad handler
  const handleKeyPress = useCallback(
    (key: string) => {
      if (activeInput === null) return

      setTipAmounts(prev => {
        const current = prev[activeInput] || ''

        if (key === 'backspace') {
          const updated = current.slice(0, -1)
          return { ...prev, [activeInput]: updated }
        }

        if (key === '.') {
          if (current.includes('.')) return prev
          return { ...prev, [activeInput]: current + '.' }
        }

        // Limit decimal places to 2
        const parts = current.split('.')
        if (parts.length > 1 && parts[1].length >= 2) return prev

        return { ...prev, [activeInput]: current + key }
      })
    },
    [activeInput]
  )

  // Check if any tip exceeds 30% of the payment amount
  const highTipPayments = useMemo(() => {
    return cardPayments.filter(p => {
      const newTip = parseFloat(tipAmounts[p.paymentIndex] || '0') || 0
      return newTip > 0 && p.orderAmount > 0 && newTip > p.orderAmount * 0.3
    })
  }, [cardPayments, tipAmounts])

  // Handle adjust tips via mutation
  const handleAdjustTips = async () => {
    try {
      await tipAdjustMutation.mutateAsync({
        dbOrderId: order.db_order_id || order.id,
        orderId: order.id,
        payments: cardPayments.map(payment => ({
          paymentIndex: payment.paymentIndex,
          dbPaymentId: payment.dbPaymentId,
          orderAmount: payment.orderAmount,
          currentTip: payment.currentTip,
          newTip: parseFloat(tipAmounts[payment.paymentIndex] || '0') || 0,
          referenceId: payment.referenceId,
          rrn: payment.rrn,
          last4: payment.last4
        }))
      })
      onTipAdjusted()
    } catch {
      // Error handling is done by the mutation's onError callback
    }
  }

  // Entry point: check for high tips before proceeding
  const handleAdjustTipsPress = () => {
    if (highTipPayments.length > 0) {
      setShowHighTipConfirm(true)
    } else {
      handleAdjustTips()
    }
  }

  const keypadKeys = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['.', '0', 'backspace']
  ]

  // console.log('PaymentDetailBottomSheet', cardPayments);
  return (
    <View
      style={{ flex: 6, backgroundColor: colors.screen, position: 'relative' }}
    >
      {/* Processing Overlay */}
      {processing && (
        <View
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 50,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.75)'
          }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 14,
              padding: 28,
              alignItems: 'center',
              marginHorizontal: 32,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <ActivityIndicator size='large' color={colors.teal} />
            <Text
              style={{
                color: colors.heading,
                fontSize: 15,
                fontWeight: '700',
                marginTop: 14
              }}
            >
              Adjusting Tips
            </Text>
            <Text
              style={{
                color: colors.label,
                fontSize: 12,
                marginTop: 6,
                textAlign: 'center'
              }}
            >
              Processing tip adjustments on terminal…{'\n'}Please do not close
              this screen.
            </Text>
          </View>
        </View>
      )}

      {/* High Tip Confirmation Modal */}
      <Modal
        visible={showHighTipConfirm}
        transparent
        animationType='fade'
        onRequestClose={() => setShowHighTipConfirm(false)}
      >
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(0,0,0,0.75)'
          }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              borderRadius: 14,
              padding: 20,
              marginHorizontal: 32,
              borderWidth: 1,
              borderColor: colors.border,
              maxWidth: 400,
              width: '90%'
            }}
          >
            <Text
              style={{
                fontSize: 15,
                fontWeight: '700',
                color: colors.warning,
                textAlign: 'center',
                marginBottom: 8
              }}
            >
              High Tip Warning
            </Text>
            <Text
              style={{
                fontSize: 13,
                color: colors.label,
                textAlign: 'center',
                marginBottom: 12
              }}
            >
              {highTipPayments.length === 1
                ? `The tip entered is more than 30% of the payment amount.`
                : `${highTipPayments.length} tips entered are more than 30% of their payment amounts.`}
            </Text>
            {highTipPayments.map(p => {
              const newTip = parseFloat(tipAmounts[p.paymentIndex] || '0') || 0
              const pct =
                p.orderAmount > 0
                  ? ((newTip / p.orderAmount) * 100).toFixed(0)
                  : '0'
              return (
                <View
                  key={p.paymentIndex}
                  style={{
                    flexDirection: 'row',
                    justifyContent: 'space-between',
                    paddingVertical: 8,
                    paddingHorizontal: 10,
                    backgroundColor: colors.warning + '10',
                    borderRadius: 8,
                    marginBottom: 6
                  }}
                >
                  <Text style={{ fontSize: 13, color: colors.label }}>
                    ••••{p.last4 || '????'} (${p.orderAmount?.toFixed(2)})
                  </Text>
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: colors.warning
                    }}
                  >
                    ${newTip.toFixed(2)} ({pct}%)
                  </Text>
                </View>
              )
            })}
            <Text
              style={{
                fontSize: 11,
                color: colors.muted,
                textAlign: 'center',
                marginTop: 8,
                marginBottom: 16
              }}
            >
              Are you sure you want to proceed?
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                onPress={() => setShowHighTipConfirm(false)}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: 'transparent',
                  borderWidth: 1,
                  borderColor: colors.border,
                  alignItems: 'center'
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: colors.label
                  }}
                >
                  CANCEL
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowHighTipConfirm(false)
                  handleAdjustTips()
                }}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: colors.warning + '20',
                  borderWidth: 1,
                  borderColor: colors.warning + '50',
                  alignItems: 'center'
                }}
              >
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: '700',
                    color: colors.warning
                  }}
                >
                  CONFIRM
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          disabled={processing}
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            backgroundColor: colors.teal + '10',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
            opacity: processing ? 0.3 : 1
          }}
        >
          <ArrowLeft size={16} color={colors.teal} />
        </TouchableOpacity>
        <Text
          style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}
        >
          Adjust Tips
        </Text>
      </View>

      <ScrollView
        className='flex-1'
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Payment Rows Table */}
        <View style={{ paddingHorizontal: 14, paddingTop: 12 }}>
          {/* Column Headers */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 10,
              paddingBottom: 8,
              borderBottomWidth: 1,
              borderBottomColor: colors.border
            }}
          >
            <Text
              style={{
                flex: 1,
                fontSize: 11,
                fontWeight: '600',
                color: colors.muted,
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}
            >
              Payment
            </Text>
            <Text
              style={{
                width: 88,
                fontSize: 11,
                fontWeight: '600',
                color: colors.muted,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                textAlign: 'right'
              }}
            >
              Order
            </Text>
            <Text
              style={{
                width: 100,
                fontSize: 11,
                fontWeight: '600',
                color: colors.muted,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                textAlign: 'right'
              }}
            >
              New Tip
            </Text>
          </View>

          {/* Payment Rows */}
          {cardPayments.map(payment => {
            const brandLabel = formatCardBrand(payment.cardBrand)
            const isActive = activeInput === payment.paymentIndex
            const tipValue = tipAmounts[payment.paymentIndex] || ''
            const hasTip = payment.currentTip > 0

            return (
              <TouchableOpacity
                key={payment.paymentIndex}
                onPress={() => handleSelectPayment(payment.paymentIndex)}
                activeOpacity={0.7}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  paddingVertical: 10,
                  paddingHorizontal: 10,
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: isActive ? colors.teal + '08' : 'transparent'
                }}
              >
                {/* Payment Column */}
                <View
                  style={{
                    flex: 1,
                    flexDirection: 'row',
                    alignItems: 'center'
                  }}
                >
                  <View
                    style={{
                      width: 20,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 6
                    }}
                  >
                    {hasTip && <Check size={14} color={colors.teal} />}
                  </View>
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: isActive
                        ? colors.teal + '15'
                        : colors.card,
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 8
                    }}
                  >
                    <CreditCard
                      size={15}
                      color={isActive ? colors.teal : colors.label}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 6
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 13,
                          fontWeight: '600',
                          color: colors.heading
                        }}
                      >
                        {payment.last4 || '••••'}
                        {payment.entryMode ? ` · ${payment.entryMode}` : ''}
                      </Text>
                      {brandLabel ? (
                        <CardBrandBadge brand={payment.cardBrand} />
                      ) : null}
                    </View>
                    <Text
                      style={{
                        fontSize: 11,
                        color: colors.muted,
                        marginTop: 1
                      }}
                    >
                      {brandLabel || 'Card'}
                      {payment.timestamp ? ` — ${formatTimestamp(payment.timestamp)}` : ''}
                    </Text>
                  </View>
                </View>

                {/* Order Amount */}
                <Text
                  style={{
                    width: 88,
                    fontSize: 13,
                    fontWeight: '600',
                    color: colors.heading,
                    textAlign: 'right'
                  }}
                >
                  ${payment.orderAmount?.toFixed(2)}
                </Text>

                {/* New Tip */}
                <View style={{ width: 100, alignItems: 'flex-end' }}>
                  <View
                    style={{
                      borderRadius: 8,
                      borderWidth: 1,
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      backgroundColor: isActive
                        ? colors.teal + '15'
                        : colors.screen,
                      borderColor: isActive ? colors.teal + '50' : colors.border
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        textAlign: 'right',
                        color: tipValue
                          ? isActive
                            ? colors.teal
                            : colors.heading
                          : colors.muted
                      }}
                    >
                      ${tipValue || '0.00'}
                    </Text>
                  </View>
                  <Text
                    style={{
                      fontSize: 10,
                      color: colors.muted,
                      marginTop: 2,
                      textAlign: 'right'
                    }}
                  >
                    of ${payment.currentTip?.toFixed(2)}
                  </Text>
                </View>
              </TouchableOpacity>
            )
          })}
        </View>

        {/* Summary Bar */}
        <View style={{ paddingHorizontal: 14, marginTop: 12 }}>
          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              backgroundColor: colors.card,
              borderRadius: 12,
              padding: 14,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <View style={{ alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 4
                }}
              >
                Order Total
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                ${totalOrderAmount?.toFixed(2)}
              </Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 4
                }}
              >
                New Tips
              </Text>
              <Text
                style={{ fontSize: 14, fontWeight: '700', color: colors.teal }}
              >
                ${totalNewTips?.toFixed(2)}
              </Text>
            </View>
            <View style={{ alignItems: 'center' }}>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: colors.muted,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  marginBottom: 4
                }}
              >
                Grand Total
              </Text>
              <Text
                style={{
                  fontSize: 14,
                  fontWeight: '700',
                  color: colors.success
                }}
              >
                ${(totalOrderAmount + totalNewTips)?.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Numeric Keypad */}
        <View style={{ paddingHorizontal: 14, marginTop: 14 }}>
          {keypadKeys.map((row, rowIndex) => (
            <View
              key={rowIndex}
              style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}
            >
              {row.map(key => (
                <TouchableOpacity
                  key={key}
                  onPress={() => handleKeyPress(key)}
                  style={{
                    flex: 1,
                    paddingVertical: 12,
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border,
                    borderRadius: 8,
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  {key === 'backspace' ? (
                    <Delete size={18} color={colors.heading} />
                  ) : (
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: '600',
                        color: colors.heading
                      }}
                    >
                      {key}
                    </Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Footer Buttons */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: colors.panel,
          borderTopWidth: 1,
          borderTopColor: colors.border
        }}
      >
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <TouchableOpacity
            onPress={onBack}
            disabled={processing}
            style={{
              flex: 1,
              paddingVertical: 11,
              borderRadius: 8,
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: colors.label }}
            >
              CANCEL
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleAdjustTipsPress}
            disabled={!hasChanges || processing}
            style={{
              flex: 2,
              paddingVertical: 11,
              borderRadius: 8,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor:
                hasChanges && !processing ? colors.teal + '20' : colors.card,
              borderWidth: 1,
              borderColor:
                hasChanges && !processing ? colors.teal + '50' : colors.border
            }}
          >
            {processing ? (
              <ActivityIndicator color={colors.teal} />
            ) : (
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: hasChanges ? colors.teal : colors.muted
                }}
              >
                {hasChanges
                  ? `ADJUST ${tipDelta >= 0 ? '+' : '-'}$${Math.abs(
                      tipDelta
                    )?.toFixed(2)}`
                  : 'ADJUST TIPS'}
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

// ============================================================================
// RIGHT PANE - REFUND VIEW
// ============================================================================
interface RightPaneRefundProps {
  order: any
  paymentSummary: {
    orderTotal: number
    collected: number
    held?: number
    refunds: number
    payments: PaymentRowData[]
  }
  onBack: () => void
  onProcessRefund: (
    type: RefundType,
    totalAmount: number,
    reason: string,
    perPaymentDetails: PerPaymentRefundDetail[],
    selectedItems?: {
      itemId: string
      quantity: number
      paymentIndex?: number
    }[]
  ) => Promise<boolean>
  refundProcessing: boolean
}

const RightPaneRefund: React.FC<RightPaneRefundProps> = ({
  order,
  paymentSummary,
  onBack,
  onProcessRefund,
  refundProcessing
}) => {
  const { show } = useToast()
  const processingRef = useRef(false)
  const [refundType, setRefundType] = useState<RefundType>('full')
  const [refundReason, setRefundReason] = useState('')
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({})
  const [paymentRefundAmounts, setPaymentRefundAmounts] = useState<
    Record<number, { orderAmount: string; tipAmount: string }>
  >({})
  const [itemPaymentAssignment, setItemPaymentAssignment] = useState<
    Record<string, number>
  >({})

  // console.log("paymentSummary", paymentSummary);
  const maxRefundable = paymentSummary.collected - paymentSummary.refunds

  // Filter out voided payments and fully refunded payments - only payments with remaining balance can be refunded
  const refundablePayments = useMemo(() => {
    return paymentSummary.payments.filter(p => {
      if (p.isVoided) return false
      // Check if payment has remaining balance to refund
      const remainingBalance = p.collected - (p.refundedAmount || 0)
      return remainingBalance > 0
    })
  }, [paymentSummary.payments])

  // Calculate remaining refundable amounts per payment (after partial refunds)
  const getRemainingAmounts = useCallback((payment: PaymentRowData) => {
    const refunded = payment.refundedAmount || 0
    // Apply refunds to order portion first, then tips
    const orderRefunded = Math.min(refunded, payment.orderAmount)
    const tipRefunded = Math.max(0, refunded - payment.orderAmount)
    return {
      remainingOrder: Math.max(0, payment.orderAmount - orderRefunded),
      remainingTip: Math.max(0, payment.tipAmount - tipRefunded)
    }
  }, [])

  const getRefundableQty = useCallback((item: CartItem) => {
    const paidQty = item.paidQuantity ?? item.quantity ?? 0
    const refundedQty = item.refundedQuantity ?? 0
    return Math.max(0, paidQty - refundedQty)
  }, [])

  // Helper: find which payment covers a given item via itemsCovered
  const getPaymentForItem = useCallback(
    (itemId: string): PaymentRowData | null => {
      for (const payment of refundablePayments) {
        if (payment.itemsCovered?.some(ic => ic.itemId === itemId)) {
          return payment
        }
      }
      return null
    },
    [refundablePayments]
  )

  // Calculate selected items total (price + tax) using discounted prices
  // Uses post-discount subtotal with correct cash/card pricing per covering payment
  const selectedItemsTotal = useMemo(() => {
    if (!order?.items) return 0
    return order.items.reduce((sum: number, item: CartItem) => {
      const maxQty = getRefundableQty(item)
      const selectedQty = Math.min(
        selectedItems[item.db_order_item_id || ''] || 0,
        maxQty
      )
      if (selectedQty <= 0) return sum
      // Use discounted price based on covering payment's pricing mode
      const coveringPayment = getPaymentForItem(item.db_order_item_id || '')
      const isCash = coveringPayment?.isCashPriced || coveringPayment?.method === 'Cash'
      const effectiveSubtotal = isCash ? (item.cashSubtotal ?? item.subtotal ?? 0) : (item.subtotal ?? 0)
      const effectiveTax = isCash ? (item.cashTaxAmount ?? item.taxAmount ?? 0) : (item.taxAmount ?? 0)
      const discountedUnitPrice = item.quantity > 0
        ? effectiveSubtotal / item.quantity
        : (item.price || 0)
      const perUnitTax = item.quantity > 0 ? effectiveTax / item.quantity : 0
      const itemSubtotal = discountedUnitPrice * selectedQty
      const itemTax = perUnitTax * selectedQty
      return sum + itemSubtotal + itemTax
    }, 0)
  }, [selectedItems, order?.items, getRefundableQty, getPaymentForItem])

  // Calculate per-payment refund total
  const paymentRefundTotal = useMemo(() => {
    let total = 0
    Object.values(paymentRefundAmounts).forEach(amounts => {
      total +=
        (parseFloat(amounts.orderAmount) || 0) +
        (parseFloat(amounts.tipAmount) || 0)
    })
    return total
  }, [paymentRefundAmounts])

  const customAmountActive = useMemo(() => {
    if (refundType !== 'payments') return false
    return paymentRefundTotal > 0
  }, [paymentRefundTotal, refundType])

  // console.log("customAmountActive debug", {
  //   customAmountActive,
  //   refundType,
  //   paymentRefundTotal,
  //   paymentRefundAmountsKeys: Object.keys(paymentRefundAmounts),
  // });

  const hasCustomAmountRefund = useMemo(() => {
    if (!order?.reversals) return false
    return (order.reversals as ReversalRecord[]).some(
      r =>
        r.status === 'completed' &&
        (r.reversal_type === 'partial_refund' || r.reversal_type === 'refund')
    )
  }, [order?.reversals])

  const hasRefundablePayments = refundablePayments.length > 0
  const isZeroRefundable = maxRefundable <= 0 || !hasRefundablePayments

  const getRefundAmount = () => {
    switch (refundType) {
      case 'full':
        return maxRefundable
      case 'items':
        return selectedItemsTotal
      case 'payments':
        return paymentRefundTotal
      default:
        return 0
    }
  }

  const itemsDisabled = isZeroRefundable

  // getPaymentForItem moved above selectedItemsTotal (line ~2085) so both
  // selectedItemsTotal and buildPerPaymentDetails can use it for cash/card pricing.

  // Helper: get human-readable payment label
  const getPaymentLabel = useCallback((payment: PaymentRowData): string => {
    if (payment.method === 'Card') {
      const brand = formatCardBrand(
        payment.cardBrand || payment.cardInfo?.brand
      )
      const last4 = payment.last4 || payment.cardInfo?.last4
      if (brand && last4) return `${brand} ••••${last4}`
      if (last4) return `Card ••••${last4}`
      if (brand) return brand
      return 'Card'
    }
    return 'Cash'
  }, [])

  useEffect(() => {
    if (!order?.items) return
    setSelectedItems(prev => {
      let changed = false
      const next: Record<string, number> = { ...prev }
      order.items.forEach((item: CartItem) => {
        // TODO: Need to research offline scenario where item.db_order_item_id is not available
        if (!item.db_order_item_id) return
        const maxQty = getRefundableQty(item)
        if (maxQty <= 0 && next[item.db_order_item_id || '']) {
          delete next[item.db_order_item_id || '']
          changed = true
          return
        }
        if (
          next[item.db_order_item_id || ''] &&
          next[item.db_order_item_id || ''] > maxQty
        ) {
          if (maxQty > 0) {
            next[item.db_order_item_id || ''] = maxQty
          } else {
            delete next[item.db_order_item_id || '']
          }
          changed = true
        }
      })
      return changed ? next : prev
    })
  }, [order?.items, getRefundableQty])
  console.log('[RightPaneRefund] selectedItems', selectedItems)
  console.log('[RightPaneRefund] order?.items', order?.items)
  // Validation: all selected unallocated items must have a payment assigned
  const allItemsHavePayment = useMemo(() => {
    if (refundType !== 'items') return true
    for (const [itemId, qty] of Object.entries(selectedItems)) {
      if (qty <= 0) continue
      const coveringPayment = getPaymentForItem(itemId)
      if (!coveringPayment && itemPaymentAssignment[itemId] === undefined) {
        return false
      }
    }
    return true
  }, [selectedItems, itemPaymentAssignment, refundType, getPaymentForItem])

  // Validation: no per-payment amount exceeds its remaining refundable amount
  const paymentAmountsValid = useMemo(() => {
    if (refundType !== 'payments') return true
    for (const [indexStr, amounts] of Object.entries(paymentRefundAmounts)) {
      const index = parseInt(indexStr)
      const payment = refundablePayments[index]
      if (!payment) continue
      const { remainingOrder, remainingTip } = getRemainingAmounts(payment)
      const orderAmt = parseFloat(amounts.orderAmount) || 0
      const tipAmt = parseFloat(amounts.tipAmount) || 0
      if (orderAmt > remainingOrder || tipAmt > remainingTip) return false
      if (orderAmt < 0 || tipAmt < 0) return false
    }
    return true
  }, [
    paymentRefundAmounts,
    refundablePayments,
    refundType,
    getRemainingAmounts
  ])

  const canProcess =
    refundReason.trim().length > 0 &&
    getRefundAmount() > 0 &&
    getRefundAmount() <= maxRefundable &&
    allItemsHavePayment &&
    paymentAmountsValid &&
    !isZeroRefundable
  // console.log('Can Process Refund', {
  //   refundReason,
  //   refundAmount: getRefundAmount(),
  //   maxRefundable: maxRefundable,
  //   allItemsHavePayment,
  //   paymentAmountsValid,
  //   isZeroRefundable,
  //   customAmountActive,
  // });
  const handleToggleItem = (itemId: string, maxQty: number) => {
    if (isZeroRefundable || maxQty <= 0) return
    setSelectedItems(prev => {
      if (prev[itemId]) {
        const { [itemId]: removed, ...rest } = prev
        return rest
      }
      return { ...prev, [itemId]: maxQty }
    })
  }

  const handleQuantityChange = (
    itemId: string,
    qty: number,
    maxQty: number
  ) => {
    if (qty <= 0) {
      const { [itemId]: removed, ...rest } = selectedItems
      setSelectedItems(rest)
    } else {
      setSelectedItems(prev => ({
        ...prev,
        [itemId]: Math.min(qty, maxQty)
      }))
    }
  }

  const handlePaymentAmountChange = (
    index: number,
    field: 'orderAmount' | 'tipAmount',
    value: string
  ) => {
    const cleaned = value.replace(/[^0-9.]/g, '')
    const parts = cleaned.split('.')
    if (parts.length > 2) return
    if (parts[1]?.length > 2) return
    setPaymentRefundAmounts(prev => ({
      ...prev,
      [index]: {
        orderAmount: prev[index]?.orderAmount || '',
        tipAmount: prev[index]?.tipAmount || '',
        [field]: cleaned
      }
    }))
  }

  const handleFillAllForPayment = (index: number) => {
    const payment = refundablePayments[index]
    if (!payment) return
    const { remainingOrder, remainingTip } = getRemainingAmounts(payment)
    setPaymentRefundAmounts(prev => ({
      ...prev,
      [index]: {
        orderAmount: remainingOrder.toFixed(2),
        tipAmount: remainingTip.toFixed(2)
      }
    }))
  }

  const resetRefundState = useCallback(() => {
    setRefundType('full')
    setRefundReason('')
    setSelectedItems({})
    setPaymentRefundAmounts({})
    setItemPaymentAssignment({})
  }, [])

  const refundLogs = useMemo(() => {
    const logs = (order?.reversals || []) as any[]
    return logs
      .slice()
      .sort(
        (a, b) =>
          new Date(b.requested_at).getTime() -
          new Date(a.requested_at).getTime()
      )
  }, [order?.reversals])

  // Build per-payment refund details for processing
  const buildPerPaymentDetails = (): PerPaymentRefundDetail[] => {
    const details: PerPaymentRefundDetail[] = []

    if (refundType === 'full') {
      refundablePayments.forEach(payment => {
        details.push({
          paymentIndex: payment.originalPaymentIndex,
          originalPaymentId: payment.paymentId,
          dbPaymentId: payment.dbPaymentId,
          method: payment.method,
          orderAmountToRefund: payment.orderAmount,
          tipAmountToRefund: payment.tipAmount,
          totalRefund: payment.collected,
          referenceId: payment.referenceId,
          last4: payment.last4 || payment.cardInfo?.last4,
          cardBrand: payment.cardBrand || payment.cardInfo?.brand
        })
      })
    } else if (refundType === 'payments') {
      Object.entries(paymentRefundAmounts).forEach(([indexStr, amounts]) => {
        const index = parseInt(indexStr)
        const payment = refundablePayments[index]
        if (!payment) return
        const orderAmt = parseFloat(amounts.orderAmount) || 0
        const tipAmt = parseFloat(amounts.tipAmount) || 0
        if (orderAmt + tipAmt <= 0) return
        details.push({
          paymentIndex: payment.originalPaymentIndex,
          originalPaymentId: payment.paymentId,
          dbPaymentId: payment.dbPaymentId,
          method: payment.method,
          orderAmountToRefund: orderAmt,
          tipAmountToRefund: tipAmt,
          totalRefund: orderAmt + tipAmt,
          referenceId: payment.referenceId,
          last4: payment.last4 || payment.cardInfo?.last4,
          cardBrand: payment.cardBrand || payment.cardInfo?.brand
        })
      })
    } else if (refundType === 'items' && !isZeroRefundable) {
      // Group selected items by their covering payment
      const paymentItemMap: Record<
        number,
        { itemId: string; quantity: number; amount: number }[]
      > = {}

      for (const [itemId, qty] of Object.entries(selectedItems)) {
        if (qty <= 0) continue
        const item = order?.items?.find((i: CartItem) => i.id === itemId)
        if (!item) continue
        // Use discounted price based on covering payment's pricing mode
        const coveringPayment = getPaymentForItem(itemId)
        const isCash = coveringPayment?.isCashPriced || coveringPayment?.method === 'Cash'
        const effectiveSubtotal = isCash ? (item.cashSubtotal ?? item.subtotal ?? 0) : (item.subtotal ?? 0)
        const effectiveTax = isCash ? (item.cashTaxAmount ?? item.taxAmount ?? 0) : (item.taxAmount ?? 0)
        const discountedUnitPrice = item.quantity > 0
          ? effectiveSubtotal / item.quantity
          : (item.price || 0)
        const perUnitTax = item.quantity > 0 ? effectiveTax / item.quantity : 0
        const itemSubtotal = discountedUnitPrice * qty
        const amount = itemSubtotal + perUnitTax * qty

        let paymentIdx: number | undefined
        if (coveringPayment) {
          paymentIdx = coveringPayment.originalPaymentIndex
        } else if (itemPaymentAssignment[itemId] !== undefined) {
          paymentIdx =
            refundablePayments[itemPaymentAssignment[itemId]]
              ?.originalPaymentIndex
        }

        if (paymentIdx !== undefined) {
          if (!paymentItemMap[paymentIdx]) paymentItemMap[paymentIdx] = []
          paymentItemMap[paymentIdx].push({ itemId, quantity: qty, amount })
        }
      }

      for (const [paymentIdxStr, items] of Object.entries(paymentItemMap)) {
        const paymentIdx = parseInt(paymentIdxStr)
        const payment = paymentSummary.payments[paymentIdx]
        if (!payment) continue
        const totalAmount = items.reduce((sum, i) => sum + i.amount, 0)
        details.push({
          paymentIndex: paymentIdx,
          originalPaymentId: payment.paymentId,
          dbPaymentId: payment.dbPaymentId,
          method: payment.method,
          orderAmountToRefund: totalAmount,
          tipAmountToRefund: 0,
          totalRefund: totalAmount,
          referenceId: payment.referenceId,
          last4: payment.last4 || payment.cardInfo?.last4,
          cardBrand: payment.cardBrand || payment.cardInfo?.brand
        })
      }
    }

    return details
  }

  return (
    <View style={{ flex: 6, backgroundColor: colors.screen, position: 'relative' }}>
      {/* Processing Overlay */}
      {refundProcessing && (
        <View
          className='absolute inset-0 z-50 items-center justify-center'
          style={{ backgroundColor: 'rgba(0,0,0,0.75)' }}
        >
          <View
            style={{
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 14,
              padding: 28,
              alignItems: 'center',
              marginHorizontal: 32
            }}
          >
            <ActivityIndicator size='large' color={colors.danger} />
            <Text
              style={{
                color: colors.heading,
                fontSize: 15,
                fontWeight: '700',
                marginTop: 14
              }}
            >
              Processing Refund
            </Text>
            <Text
              style={{
                color: colors.label,
                fontSize: 12,
                marginTop: 6,
                textAlign: 'center'
              }}
            >
              Processing refund on terminal…{'\n'}Please do not close this
              screen.
            </Text>
          </View>
        </View>
      )}

      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          paddingHorizontal: 14,
          paddingVertical: 10,
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        <TouchableOpacity
          onPress={onBack}
          disabled={refundProcessing}
          style={{
            width: 30,
            height: 30,
            borderRadius: 10,
            backgroundColor: colors.teal + '10',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: 10,
            opacity: refundProcessing ? 0.3 : 1
          }}
        >
          <ArrowLeft size={16} color={colors.teal} />
        </TouchableOpacity>
        <Text
          style={{ color: colors.heading, fontSize: 15, fontWeight: '700' }}
        >
          Process Refund
        </Text>
      </View>

      <ScrollView
        className='flex-1'
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Refund Type Tabs */}
        <View
          style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}
        >
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 8
            }}
          >
            Refund Type
          </Text>
          <View style={{ flexDirection: 'row', gap: 6 }}>
            {[
              { key: 'full', label: 'Full Refund' },
              { key: 'items', label: 'By Item' },
              { key: 'payments', label: 'By Payment' }
            ].map(type => {
              const isDisabled =
                type.key === 'items' &&
                (hasCustomAmountRefund || isZeroRefundable)
              const isActive = refundType === type.key
              return (
                <TouchableOpacity
                  key={type.key}
                  onPress={() => {
                    if (isDisabled) return
                    const newType = type.key as RefundType
                    if (newType === 'items') {
                      setPaymentRefundAmounts({})
                    } else if (newType === 'payments' || newType === 'full') {
                      setSelectedItems({})
                      setItemPaymentAssignment({})
                    }
                    setRefundType(newType)
                  }}
                  disabled={isDisabled}
                  style={{
                    flex: 1,
                    paddingVertical: 7,
                    paddingHorizontal: 10,
                    borderRadius: 8,
                    borderWidth: 1,
                    alignItems: 'center',
                    opacity: isDisabled ? 0.4 : 1,
                    backgroundColor: isActive
                      ? colors.teal + '15'
                      : colors.screen,
                    borderColor: isActive ? colors.teal + '50' : colors.border
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: isDisabled
                        ? colors.muted
                        : isActive
                        ? colors.teal
                        : colors.label
                    }}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        {isZeroRefundable && (
          <View style={{ paddingHorizontal: 14, paddingBottom: 8 }}>
            <View
              style={{
                backgroundColor: colors.warning + '10',
                borderWidth: 1,
                borderColor: colors.warning + '30',
                borderRadius: 8,
                paddingHorizontal: 12,
                paddingVertical: 8
              }}
            >
              <Text style={{ fontSize: 12, color: colors.warning }}>
                No refundable balance available. All refundable payments are
                voided or fully refunded.
              </Text>
            </View>
          </View>
        )}

        {/* Full Refund View */}
        {refundType === 'full' && (
          <View style={{ paddingHorizontal: 14 }}>
            <Text
              style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}
            >
              All payments will be fully reversed
            </Text>
            {refundablePayments.map((payment, index) => {
              const label = getPaymentLabel(payment)
              return (
                <View
                  key={index}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 10,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border
                  }}
                >
                  <View
                    style={{
                      width: 32,
                      height: 32,
                      borderRadius: 8,
                      backgroundColor: colors.teal + '15',
                      alignItems: 'center',
                      justifyContent: 'center',
                      marginRight: 10
                    }}
                  >
                    {payment.method === 'Card' ? (
                      <CreditCard size={16} color={colors.teal} />
                    ) : (
                      <Banknote size={16} color={colors.teal} />
                    )}
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: colors.heading
                      }}
                    >
                      {label}
                    </Text>
                    {payment.method === 'Card' && (
                      <CardBrandBadge
                        brand={payment.cardBrand || payment.cardInfo?.brand}
                      />
                    )}
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 11, color: colors.muted }}>
                      Order: ${payment.orderAmount?.toFixed(2)}
                    </Text>
                    {payment.tipAmount > 0 && (
                      <Text style={{ fontSize: 11, color: colors.info }}>
                        Tip: ${payment.tipAmount?.toFixed(2)}
                      </Text>
                    )}
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '700',
                        color: colors.danger
                      }}
                    >
                      ${payment.collected?.toFixed(2)}
                    </Text>
                  </View>
                </View>
              )
            })}
            <View
              style={{
                marginTop: 12,
                backgroundColor: colors.card,
                borderRadius: 12,
                padding: 14,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <Text
                style={{ fontSize: 12, color: colors.label, marginBottom: 2 }}
              >
                {refundablePayments.length} payment
                {refundablePayments.length !== 1 ? 's' : ''} to reverse
              </Text>
              <Text
                style={{
                  fontSize: 24,
                  fontWeight: '700',
                  color: colors.danger
                }}
              >
                ${maxRefundable?.toFixed(2)}
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                Full refund of collected amount
              </Text>
            </View>
          </View>
        )}

        {/* Items Selection View */}
        {refundType === 'items' && (
          <View style={{ paddingHorizontal: 14 }}>
            <Text
              style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}
            >
              Select items to refund
            </Text>
            {itemsDisabled && (
              <View
                style={{
                  marginBottom: 10,
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 8,
                  paddingHorizontal: 12,
                  paddingVertical: 8
                }}
              >
                <Text style={{ fontSize: 12, color: colors.label }}>
                  Clear custom refund amounts to refund by items.
                </Text>
              </View>
            )}
            {order?.items
              ?.filter((item: CartItem) => !item.is_voided)
              .map((item: CartItem) => {
                const maxQty = getRefundableQty(item)
                const itemId = item?.db_order_item_id || ''
                const isSelected = selectedItems[itemId] !== undefined
                const selectedQty = selectedItems[itemId] || 0
                const coveringPayment = getPaymentForItem(itemId)
                const needsAssignment = isSelected && !coveringPayment
                const assignedPaymentIdx = itemPaymentAssignment[itemId]

                return (
                  <View key={item.id}>
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 10,
                        borderBottomWidth: 1,
                        borderBottomColor: colors.border,
                        backgroundColor: isSelected
                          ? colors.teal + '08'
                          : 'transparent'
                      }}
                    >
                      <TouchableOpacity
                        onPress={() =>
                          handleToggleItem(item.db_order_item_id || '', maxQty)
                        }
                        disabled={itemsDisabled || maxQty <= 0}
                        style={{
                          width: 22,
                          height: 22,
                          borderRadius: 6,
                          borderWidth: 1.5,
                          marginRight: 10,
                          alignItems: 'center',
                          justifyContent: 'center',
                          backgroundColor: isSelected
                            ? colors.teal
                            : 'transparent',
                          borderColor: isSelected ? colors.teal : colors.border
                        }}
                      >
                        {isSelected && (
                          <Check size={13} color={colors.onSolid} />
                        )}
                      </TouchableOpacity>
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, color: colors.heading }}>
                          {item.name}
                        </Text>
                        <Text style={{ fontSize: 11, color: colors.muted }}>
                          {(() => {
                            const isCash = coveringPayment?.isCashPriced || coveringPayment?.method === 'Cash'
                            const effSub = isCash ? (item.cashSubtotal ?? item.subtotal ?? 0) : (item.subtotal ?? 0)
                            const effTax = isCash ? (item.cashTaxAmount ?? item.taxAmount ?? 0) : (item.taxAmount ?? 0)
                            const unitPrice = item.quantity > 0 ? effSub / item.quantity : (item.price || 0)
                            const unitTax = item.quantity > 0 ? effTax / item.quantity : 0
                            return `$${unitPrice.toFixed(2)}${unitTax > 0 ? ` + $${unitTax.toFixed(2)} tax` : ''} each${(item.discount_amount || 0) > 0 ? ' (discounted)' : ''}`
                          })()}
                        </Text>
                        {maxQty <= 0 && (
                          <Text
                            style={{
                              fontSize: 10,
                              color: colors.muted,
                              marginTop: 2
                            }}
                          >
                            Fully refunded
                          </Text>
                        )}
                        {coveringPayment && (
                          <View style={{ marginTop: 4 }}>
                            <View
                              style={{
                                backgroundColor: colors.screen,
                                borderWidth: 1,
                                borderColor: colors.border,
                                borderRadius: 20,
                                paddingHorizontal: 8,
                                paddingVertical: 2,
                                alignSelf: 'flex-start'
                              }}
                            >
                              <Text
                                style={{ fontSize: 10, color: colors.muted }}
                              >
                                Covered by {getPaymentLabel(coveringPayment)}
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                      {isSelected && (
                        <View
                          style={{ flexDirection: 'row', alignItems: 'center' }}
                        >
                          <TouchableOpacity
                            onPress={() =>
                              handleQuantityChange(
                                item.db_order_item_id || '',
                                selectedQty - 1,
                                maxQty
                              )
                            }
                            disabled={itemsDisabled}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              backgroundColor: colors.card,
                              borderWidth: 1,
                              borderColor: colors.border,
                              alignItems: 'center',
                              justifyContent: 'center'
                            }}
                          >
                            <Text
                              style={{
                                color: colors.heading,
                                fontWeight: '700',
                                fontSize: 14
                              }}
                            >
                              -
                            </Text>
                          </TouchableOpacity>
                          <Text
                            style={{
                              color: colors.heading,
                              fontWeight: '600',
                              fontSize: 13,
                              marginHorizontal: 10
                            }}
                          >
                            {selectedQty}
                          </Text>
                          <TouchableOpacity
                            onPress={() =>
                              handleQuantityChange(
                                item.db_order_item_id || '',
                                selectedQty + 1,
                                maxQty
                              )
                            }
                            disabled={itemsDisabled || selectedQty >= maxQty}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              backgroundColor: colors.card,
                              borderWidth: 1,
                              borderColor: colors.border,
                              alignItems: 'center',
                              justifyContent: 'center',
                              opacity: selectedQty >= maxQty ? 0.3 : 1
                            }}
                          >
                            <Text
                              style={{
                                color: colors.heading,
                                fontWeight: '700',
                                fontSize: 14
                              }}
                            >
                              +
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                      {!isSelected && (
                        <Text style={{ fontSize: 12, color: colors.muted }}>
                          max {maxQty}
                        </Text>
                      )}
                    </View>

                    {/* Payment selector for unallocated selected items */}
                    {needsAssignment && !itemsDisabled && (
                      <View
                        style={{
                          paddingLeft: 42,
                          paddingRight: 14,
                          paddingVertical: 8,
                          borderBottomWidth: 1,
                          borderBottomColor: colors.border,
                          backgroundColor: colors.screen
                        }}
                      >
                        <Text
                          style={{
                            fontSize: 11,
                            color: colors.label,
                            marginBottom: 6
                          }}
                        >
                          Select refund destination:
                        </Text>
                        <View
                          style={{
                            flexDirection: 'row',
                            flexWrap: 'wrap',
                            gap: 6
                          }}
                        >
                          {refundablePayments.map((payment, pIdx) => {
                            const isAssigned = assignedPaymentIdx === pIdx
                            return (
                              <TouchableOpacity
                                key={pIdx}
                                onPress={() =>
                                  setItemPaymentAssignment(prev => ({
                                    ...prev,
                                    [item.db_order_item_id || '']: pIdx
                                  }))
                                }
                                style={{
                                  paddingHorizontal: 10,
                                  paddingVertical: 5,
                                  borderRadius: 20,
                                  borderWidth: 1,
                                  backgroundColor: isAssigned
                                    ? colors.teal + '15'
                                    : colors.card,
                                  borderColor: isAssigned
                                    ? colors.teal + '50'
                                    : colors.border
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 11,
                                    fontWeight: '600',
                                    color: isAssigned
                                      ? colors.teal
                                      : colors.label
                                  }}
                                >
                                  {getPaymentLabel(payment)}
                                </Text>
                              </TouchableOpacity>
                            )
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                )
              })}

            {selectedItemsTotal > 0 && (
              <View
                style={{
                  marginTop: 12,
                  backgroundColor: colors.card,
                  borderRadius: 12,
                  padding: 14,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <Text style={{ fontSize: 12, color: colors.label }}>
                  Refund Amount
                </Text>
                <Text
                  style={{
                    fontSize: 22,
                    fontWeight: '700',
                    color: colors.danger
                  }}
                >
                  ${selectedItemsTotal?.toFixed(2)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* By Payment View */}
        {refundType === 'payments' && (
          <View style={{ paddingHorizontal: 14 }}>
            <Text
              style={{ fontSize: 12, color: colors.muted, marginBottom: 10 }}
            >
              Enter refund amounts per payment
            </Text>
            {refundablePayments.length === 0 ? (
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <View
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 20,
                    backgroundColor: colors.card,
                    alignItems: 'center',
                    justifyContent: 'center',
                    marginBottom: 10
                  }}
                >
                  <CreditCard size={18} color={colors.muted} />
                </View>
                <Text style={{ fontSize: 13, color: colors.muted }}>
                  No refundable payments
                </Text>
              </View>
            ) : (
              <>
                {/* Column Headers */}
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingVertical: 8,
                    borderBottomWidth: 1,
                    borderBottomColor: colors.border,
                    marginBottom: 6
                  }}
                >
                  <Text
                    style={{
                      flex: 1,
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.muted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5
                    }}
                  >
                    Payment
                  </Text>
                  <Text
                    style={{
                      width: 88,
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.muted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      textAlign: 'center'
                    }}
                  >
                    Order
                  </Text>
                  <Text
                    style={{
                      width: 88,
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.muted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      textAlign: 'center'
                    }}
                  >
                    Tips + Grat
                  </Text>
                  <Text
                    style={{
                      width: 88,
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.muted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      textAlign: 'center'
                    }}
                  >
                    Collected
                  </Text>
                  <Text
                    style={{
                      width: 56,
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.muted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      textAlign: 'center'
                    }}
                  >
                    All
                  </Text>
                </View>

                {refundablePayments.map((payment, index) => {
                  const amounts = paymentRefundAmounts[index] || {
                    orderAmount: '',
                    tipAmount: ''
                  }
                  const { remainingOrder, remainingTip } =
                    getRemainingAmounts(payment)
                  const orderAmt = parseFloat(amounts.orderAmount) || 0
                  const tipAmt = parseFloat(amounts.tipAmount) || 0
                  const orderExceeds = orderAmt > remainingOrder
                  const tipExceeds = tipAmt > remainingTip

                  return (
                    <View
                      key={index}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingVertical: 10,
                        borderWidth: 1,
                        borderColor: colors.border,
                        borderRadius: 12,
                        marginBottom: 6,
                        backgroundColor: colors.card
                      }}
                    >
                      <View
                        style={{
                          flex: 1,
                          flexDirection: 'row',
                          alignItems: 'center',
                          paddingLeft: 10
                        }}
                      >
                        <View
                          style={{
                            width: 32,
                            height: 32,
                            borderRadius: 8,
                            backgroundColor: colors.teal + '15',
                            alignItems: 'center',
                            justifyContent: 'center',
                            marginRight: 8
                          }}
                        >
                          {payment.method === 'Card' ? (
                            <CreditCard size={16} color={colors.teal} />
                          ) : (
                            <Banknote size={16} color={colors.teal} />
                          )}
                        </View>
                        <Text
                          style={{
                            fontSize: 13,
                            fontWeight: '600',
                            color: colors.heading
                          }}
                          numberOfLines={1}
                        >
                          {getPaymentLabel(payment)}
                        </Text>
                      </View>

                      {/* Order amount input */}
                      <View style={{ width: 88, paddingHorizontal: 4 }}>
                        <TextInput
                          value={amounts.orderAmount}
                          onChangeText={v =>
                            handlePaymentAmountChange(index, 'orderAmount', v)
                          }
                          placeholder={remainingOrder.toFixed(2)}
                          placeholderTextColor={colors.muted}
                          keyboardType='decimal-pad'
                          style={{
                            fontSize: 13,
                            textAlign: 'center',
                            paddingVertical: 6,
                            paddingHorizontal: 8,
                            borderRadius: 8,
                            borderWidth: 1,
                            color: orderExceeds
                              ? colors.danger
                              : colors.heading,
                            backgroundColor: orderExceeds
                              ? colors.danger + '10'
                              : colors.screen,
                            borderColor: orderExceeds
                              ? colors.danger + '50'
                              : colors.border
                          }}
                        />
                      </View>

                      {/* Tip amount input */}
                      <View style={{ width: 88, paddingHorizontal: 4 }}>
                        <TextInput
                          value={amounts.tipAmount}
                          onChangeText={v =>
                            handlePaymentAmountChange(index, 'tipAmount', v)
                          }
                          placeholder={remainingTip.toFixed(2)}
                          placeholderTextColor={colors.muted}
                          keyboardType='decimal-pad'
                          style={{
                            fontSize: 13,
                            textAlign: 'center',
                            paddingVertical: 6,
                            paddingHorizontal: 8,
                            borderRadius: 8,
                            borderWidth: 1,
                            color: tipExceeds ? colors.danger : colors.heading,
                            backgroundColor: tipExceeds
                              ? colors.danger + '10'
                              : colors.screen,
                            borderColor: tipExceeds
                              ? colors.danger + '50'
                              : colors.border
                          }}
                        />
                      </View>

                      {/* Collected */}
                      <Text
                        style={{
                          width: 88,
                          fontSize: 13,
                          color: colors.label,
                          textAlign: 'center'
                        }}
                      >
                        ${payment.collected?.toFixed(2)}
                      </Text>

                      {/* ALL button */}
                      <TouchableOpacity
                        onPress={() => handleFillAllForPayment(index)}
                        style={{
                          width: 56,
                          alignItems: 'center',
                          paddingRight: 6
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: colors.teal + '15',
                            borderWidth: 1,
                            borderColor: colors.teal + '40',
                            borderRadius: 8,
                            paddingHorizontal: 10,
                            paddingVertical: 5
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              fontWeight: '700',
                              color: colors.teal
                            }}
                          >
                            ALL
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  )
                })}

                {paymentRefundTotal > 0 && (
                  <View
                    style={{
                      marginTop: 12,
                      backgroundColor: colors.card,
                      borderRadius: 12,
                      padding: 14,
                      borderWidth: 1,
                      borderColor: colors.border
                    }}
                  >
                    <Text style={{ fontSize: 12, color: colors.label }}>
                      Total Refund
                    </Text>
                    <Text
                      style={{
                        fontSize: 22,
                        fontWeight: '700',
                        color: colors.danger
                      }}
                    >
                      ${paymentRefundTotal?.toFixed(2)}
                    </Text>
                  </View>
                )}
              </>
            )}
          </View>
        )}

        {/* Reason Input */}
        <View style={{ paddingHorizontal: 14, marginTop: 14 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 8
            }}
          >
            Reason (Required)
          </Text>
          <View
            style={{
              flexDirection: 'row',
              flexWrap: 'wrap',
              gap: 6,
              marginBottom: 8
            }}
          >
            {[
              'Incorrect amount',
              'Missing item',
              'Paid by other means',
              'Returned/cancelled order'
            ].map(preset => {
              const isActive =
                refundReason.trim().toLowerCase() === preset.toLowerCase()
              return (
                <TouchableOpacity
                  key={preset}
                  onPress={() => setRefundReason(isActive ? '' : preset)}
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 6,
                    borderRadius: 20,
                    borderWidth: 1,
                    backgroundColor: isActive
                      ? colors.teal + '15'
                      : colors.card,
                    borderColor: isActive ? colors.teal + '50' : colors.border
                  }}
                >
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '600',
                      color: isActive ? colors.teal : colors.label
                    }}
                  >
                    {preset}
                  </Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <TextInput
            value={refundReason}
            onChangeText={setRefundReason}
            placeholder='Or type a custom reason...'
            placeholderTextColor={colors.muted}
            multiline={false}
            numberOfLines={1}
            style={{
              backgroundColor: colors.screen,
              borderRadius: 10,
              padding: 12,
              borderWidth: 1,
              borderColor: colors.border,
              color: colors.heading,
              fontSize: 13,
              minHeight: 72,
              textAlignVertical: 'top'
            }}
          />
        </View>

        {refundLogs.length > 0 && (
          <View style={{ paddingHorizontal: 14, marginTop: 14 }}>
            <Text
              style={{
                fontSize: 11,
                fontWeight: '600',
                color: colors.muted,
                textTransform: 'uppercase',
                letterSpacing: 0.5,
                marginBottom: 8
              }}
            >
              Refund Log
            </Text>
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              {refundLogs.map((log, index) => (
                <View
                  key={log.id || index}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderTopWidth: index !== 0 ? 1 : 0,
                    borderTopColor: colors.border
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      alignItems: 'center'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: colors.heading
                      }}
                    >
                      {String(log.reversal_type || 'refund').toUpperCase()}
                    </Text>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: colors.danger
                      }}
                    >
                      ${Number(log.amount || 0)?.toFixed(2)}
                    </Text>
                  </View>
                  <Text
                    style={{ fontSize: 11, color: colors.label, marginTop: 2 }}
                  >
                    {log.reason_description || log.reason_code || '—'}
                  </Text>
                  <Text
                    style={{ fontSize: 10, color: colors.muted, marginTop: 2 }}
                  >
                    {log.requested_at
                      ? new Date(log.requested_at).toLocaleString()
                      : '—'}
                    {log.status ? ` • ${log.status}` : ''}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Process Button */}
      <View
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          paddingHorizontal: 14,
          paddingVertical: 12,
          backgroundColor: colors.panel,
          borderTopWidth: 1,
          borderTopColor: colors.border
        }}
      >
        <TouchableOpacity
          onPress={async () => {
            if (refundProcessing || processingRef.current) {
              console.log('[Refund] Already processing')
              return
            }

            if (!canProcess) {
              console.log('[Refund] Blocked by validation', {
                refundType,
                maxRefundable,
                refundReason,
                paymentRefundTotal,
                selectedItemsTotal,
                allItemsHavePayment,
                paymentAmountsValid,
                isZeroRefundable,
                customAmountActive
              })
              show({
                title: 'Refund Not Ready',
                message:
                  'Check reason, amounts, and refundable balance before processing.',
                type: 'warning'
              })
              return
            }
            processingRef.current = true
            try {
              const perPaymentDetails = buildPerPaymentDetails()
              const items =
                refundType === 'items' && !itemsDisabled
                  ? Object.entries(selectedItems).map(([id, qty]) => ({
                      itemId: id,
                      quantity: qty,
                      paymentIndex: (() => {
                        const covering = getPaymentForItem(id)
                        if (covering) return covering.originalPaymentIndex
                        const assigned = itemPaymentAssignment[id]
                        if (assigned !== undefined)
                          return refundablePayments[assigned]
                            ?.originalPaymentIndex
                        return undefined
                      })()
                    }))
                  : undefined
              const success = await onProcessRefund(
                refundType,
                getRefundAmount(),
                refundReason,
                perPaymentDetails,
                items
              )
              if (success) {
                resetRefundState()
              }
            } catch (error) {
              console.error('[Refund] Unexpected error:', error)
              show({
                title: 'Refund Failed',
                message: 'Unexpected error while processing refund.',
                type: 'error'
              })
            } finally {
              processingRef.current = false
            }
          }}
          disabled={!canProcess || refundProcessing}
          style={{
            width: '100%',
            paddingVertical: 12,
            borderRadius: 10,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor:
              canProcess && !refundProcessing ? colors.danger : colors.card,
            borderWidth: 1,
            borderColor:
              canProcess && !refundProcessing ? colors.danger : colors.border
          }}
        >
          {refundProcessing ? (
            <ActivityIndicator color={colors.heading} />
          ) : (
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: canProcess ? '#FFFFFF' : colors.muted
              }}
            >
              Process Refund • ${getRefundAmount()?.toFixed(2)}
            </Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp)
  const now = new Date()
  const isToday = date.toDateString() === now.toDateString()

  if (isToday) {
    return `Today, ${date.toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })}`
  }

  return date.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true
  })
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================
const PaymentDetailBottomSheetComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  {}
> = (props, ref) => {
  const { show } = useToast()
  const router = useRouter()
  const pathname = usePathname()
  const supabase = useSupabaseClient()
  const [tipProcessing, setTipProcessing] = useState(false)
  const selectedStation = useStoreSettingsStore(s => s.selectedStation)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)

  // Mutation hooks
  const refundMutation = useRefundMutation()
  const { checkRefund, recordAndNotify } = useRefundFraudGuard()
  const [refundApprovalVisible, setRefundApprovalVisible] = useState(false)
  const pendingRefundRef = useRef<{
    type: RefundType
    totalAmount: number
    reason: string
    perPaymentDetails: PerPaymentRefundDetail[]
    selectedItems?: { itemId: string; quantity: number; paymentIndex?: number }[]
  } | null>(null)
  const lastFraudGuardRef = useRef<FraudGuardCheckResult | null>(null)

  const { isOpen, orderId, initialView, close } = usePaymentDetailSheetStore()
  const updateOrderCheckStatus = useOrderStore(s => s.updateOrderCheckStatus)

  const [rightPaneView, setRightPaneView] = useState<RightPaneView>('summary')

  // Get order data - first try active orders, then previous orders
  const activeOrder = useOrderStore(state => {
    if (!orderId) return null
    return state.ordersById[orderId] || null
  })

  // Fallback to previousOrders for history orders
  const previousOrder = usePreviousOrdersStore(state => {
    if (!orderId || activeOrder) return null
    return state.previousOrders.find(po => po.orderId === orderId) || null
  })

  // Fetch reversals and refund_items via TanStack Query
  const dbOrderId = activeOrder?.db_order_id || previousOrder?.db_order_id
  const hasExistingReversals = !!(
    (activeOrder?.reversals && activeOrder.reversals.length > 0) ||
    (previousOrder?.reversals && previousOrder.reversals.length > 0)
  )

  const { reversals: fetchedReversals, orderRefundItems: fetchedRefundItems } =
    useOrderDetailsFetch({
      dbOrderId,
      localOrderId: orderId,
      isActiveOrder: !!activeOrder,
      hasExistingReversals,
      enabled: isOpen && !!orderId
    })

  // Map previousOrder to OrderProfile format (same as PreviousOrdersSection)
  const order = useMemo((): OrderProfile | null => {
    if (activeOrder) {
      // Merge fetched details into active order if it's missing reversals
      if (fetchedReversals.length > 0 && !activeOrder.reversals?.length) {
        return {
          ...activeOrder,
          reversals: fetchedReversals,
          order_refund_items: fetchedRefundItems
        }
      }
      return activeOrder
    }
    if (!previousOrder) return null

    return {
      id: previousOrder.orderId,
      db_order_id: previousOrder.db_order_id,
      display_number: previousOrder.display_number,
      order_number: previousOrder.display_number,
      customer_name: previousOrder.customer,
      server_name: previousOrder.server,
      order_status: previousOrder.refunded
        ? 'refunded'
        : previousOrder.closed_at
        ? 'completed'
        : 'pending',
      check_status: previousOrder.checkStatus || 'Opened',
      paid_status: previousOrder.paymentStatus,
      order_type: previousOrder.type,
      items: previousOrder.items || [],
      total_amount: previousOrder.total,
      total_cash_amount: previousOrder.total, // Fallback
      total_tax: previousOrder.tax || 0,
      total_discount: 0,
      amount_paid: previousOrder.amount_paid,
      amount_due: previousOrder.amount_due,
      opened_at: previousOrder.timestamp || previousOrder.opened_at,
      created_at: previousOrder.timestamp,
      closed_at: previousOrder.closed_at,
      service_location_id: previousOrder.service_location_id || null,
      service_location_name: previousOrder.service_location_name,
      station_id: previousOrder.station_id || null,
      _sourceStationName: previousOrder.station_name,
      notes: previousOrder.notes,
      payments: previousOrder.payments || [],
      // Include reversals/refund_items: prefer fetched, fallback to cached on previousOrder
      reversals:
        fetchedReversals.length > 0
          ? fetchedReversals
          : previousOrder.reversals,
      order_refund_items:
        fetchedRefundItems.length > 0
          ? fetchedRefundItems
          : previousOrder.order_refund_items
    } as OrderProfile
  }, [activeOrder, previousOrder, fetchedReversals, fetchedRefundItems])

  // Check if active terminal matches the order's payment terminal type
  const { canProcess: terminalCanProcess, blockReason: terminalBlockReason } =
    useMemo(
      () =>
        getTerminalMatchInfo(
          order?.payments,
          selectedStation?.payment_terminal?.terminal_type
        ),
      [order?.payments, selectedStation?.payment_terminal?.terminal_type]
    )

  // Reset view when sheet opens (Modal is controlled by isOpen state directly)
  useEffect(() => {
    if (isOpen && orderId) {
      setRightPaneView(initialView || 'summary')
    }
  }, [isOpen, orderId, initialView])

  // Expose methods for compatibility (not needed for Modal but keeps the interface)
  useImperativeHandle(
    ref,
    () =>
      ({
        snapToIndex: () => {},
        snapToPosition: () => {},
        expand: () => {},
        collapse: () => {},
        close: () => close(),
        forceClose: () => close()
      } as BottomSheetMethods)
  )

  // Calculate payment summary
  const paymentSummary = useMemo(() => {
    if (!order) {
      return {
        orderTotal: 0,
        orderCashTotal: 0,
        refunds: 0,
        collected: 0,
        tips: 0,
        payments: [] as PaymentRowData[]
      }
    }

    let totalRefunded = 0
    let totalCollected = 0
    let totalTips = 0
    let totalHeld = 0
    const payments: PaymentRowData[] = []
    if (order.payments && order.payments.length > 0) {
      order.payments.forEach((payment: OrderProfilePayment, index: number) => {
        const orderAmount = payment.amount || 0
        const tipAmount = payment.tip_amount || 0
        const isVoided = payment.isVoided || false
        const collected = isVoided ? 0 : orderAmount + tipAmount
        const txDetails = payment.transactionDetails?.dejavooTransaction
        const castlesRaw = payment.transactionDetails?.castlesTransaction as
          | Record<string, any>
          | undefined
        // Handle both shapes: full buildCastlesTerminalResponse (same-session) vs inner castles_transaction (reloaded)
        const castlesTx = (castlesRaw?.castles_transaction ?? castlesRaw) as
          | Record<string, string>
          | undefined
        const cardBrand = payment.cardBrand || txDetails?.cardType
        const last4 = payment.last4 || txDetails?.cardLast4
        const cardInfo =
          payment.method === 'Card' || txDetails || castlesTx
            ? {
                brand: cardBrand,
                last4,
                entryMode: txDetails?.entryMode
                  ? String(txDetails.entryMode)
                  : castlesTx?.entryMode
                  ? String(castlesTx.entryMode)
                  : undefined,
                authCode: txDetails?.authCode
                  ? String(txDetails.authCode)
                  : castlesTx?.approvalCode
                  ? String(castlesTx.approvalCode)
                  : undefined,
                rrn: txDetails?.rrn
                  ? String(txDetails.rrn)
                  : castlesTx?.rrn
                  ? String(castlesTx.rrn)
                  : payment.transactionDetails?.rrn
                  ? String(payment.transactionDetails.rrn)
                  : undefined,
                transactionNumber: txDetails?.transactionNumber
                  ? String(txDetails.transactionNumber)
                  : undefined,
                referenceId: txDetails?.referenceId
                  ? String(txDetails.referenceId)
                  : castlesTx?.referenceId
                  ? String(castlesTx.referenceId)
                  : undefined,
                invoiceNumber: txDetails?.invoiceNumber
                  ? String(txDetails.invoiceNumber)
                  : undefined
              }
            : undefined

        // Only count non-voided payments for collected and refunded totals
        // Voided payments were never collected, so they don't affect the refundable balance
        // Authorized holds (pre-auth) are not yet collected — track separately
        const isAuthorizedHold = !isVoided && (payment.isPreAuth || payment.status === 'authorized')
        if (!isVoided && !isAuthorizedHold) {
          totalCollected += collected
          totalTips += tipAmount
          // Track actual refunds from this payment (not voided amounts)
          totalRefunded += payment.refundedAmount || 0
        }
        if (isAuthorizedHold) {
          totalHeld += orderAmount
        }

        payments.push({
          method:
            payment.method?.toLowerCase() === 'card'
              ? 'Card'
              : payment.method?.toLowerCase() === 'cash'
              ? 'Cash'
              : payment.method || 'Unknown',
          timestamp: payment.timestamp || new Date().toISOString(),
          orderAmount,
          tipAmount,
          collected,
          isVoided,
          last4,
          cardBrand,
          cardInfo,
          itemsCovered: payment.itemsCovered,
          isCashPriced: payment.isCashPriced,
          cashSavings: payment.cashSavings,
          subtotal_portion: payment.subtotal_portion,
          tax_portion: payment.tax_portion,
          paymentId: payment.id,
          dbPaymentId: payment.db_payment_id || payment.id,
          originalPaymentIndex: index,
          referenceId: txDetails?.referenceId
            ? String(txDetails.referenceId)
            : castlesTx?.referenceId
            ? String(castlesTx.referenceId)
            : undefined,
          refundedAmount: payment.refundedAmount || 0,
          original_tip_amount: payment.original_tip_amount,
          tip_adjusted_at: payment.tip_adjusted_at,
          tip_adjusted_by: payment.tip_adjusted_by,
          amountTendered: payment.transactionDetails?.amountTendered,
          changeGiven: payment.transactionDetails?.changeGiven,
          isPreAuth: payment.isPreAuth,
          status: payment.status
        })
      })
    }

    // Compute refunds from reversals (authoritative source) — reversals update
    // reliably via both optimistic patch and backend sync, whereas payment-level
    // refundedAmount can lag behind when syncOrderFromBackendComplete's payment
    // merge preserves a stale local payment (partially_refunded status gap).
    // Exclude void reversals (payment cancellations, not item refunds) and
    // refunds from voided payments (the item return is part of the cancelled payment).
    const nonVoidedPaymentIds = new Set(
      payments.filter(p => !p.isVoided).map(p => p.dbPaymentId)
    )
    const reversalRefundTotal = ((order.reversals as ReversalRecord[]) || [])
      .filter(r =>
        r.status === 'completed' &&
        r.reversal_type !== 'void' &&
        nonVoidedPaymentIds.has(r.original_payment_id)
      )
      .reduce((sum, r) => sum + (Number(r.amount) || 0), 0)

    // Use reversals when available, fall back to payment-level for legacy orders
    const effectiveRefunds = reversalRefundTotal > 0 ? reversalRefundTotal : totalRefunded

    return {
      orderTotal: order.total_amount || 0,
      orderCashTotal: order.total_cash_amount || 0,
      refunds: effectiveRefunds,
      collected: totalCollected,
      held: totalHeld,
      tips: totalTips,
      payments
    }
  }, [order])

  // Diagnostic: log when refund button would be disabled
  useEffect(() => {
    if (isOpen && order) {
      console.log('[PaymentDetail] Payment summary:', {
        collected: paymentSummary.collected,
        refunds: paymentSummary.refunds,
        paymentsCount: paymentSummary.payments.length,
        refundButtonDisabled: paymentSummary.collected <= 0,
        orderPaymentsCount: order.payments?.length ?? 0,
        orderPayments: order.payments?.map((p: any) => ({
          amount: p.amount,
          isVoided: p.isVoided,
          method: p.method,
          refundedAmount: p.refundedAmount
        }))
      })
    }
  }, [isOpen, order, paymentSummary])

  // Calculate order totals for left pane
  // Use cash pricing when all non-voided payments are cash-priced
  const orderTotals = useMemo(() => {
    if (!order) return { subtotal: 0, discount: 0, tax: 0, total: 0 }

    const nonVoidedPayments = (order.payments || []).filter(
      (p: any) => !p.isVoided
    )
    const wasCashPaid =
      nonVoidedPayments.length > 0 &&
      nonVoidedPayments.every(
        (p: any) => p.isCashPriced || p.method === 'Cash'
      )

    const subtotal = (order.items || []).reduce(
      (sum: number, item: CartItem) => {
        if (item.is_voided) return sum
        const unitPrice = wasCashPaid
          ? (item.cashPrice ?? item.baseCashPrice ?? item.price ?? 0)
          : (item.price || 0)
        return sum + unitPrice * item.quantity
      },
      0
    )
    const discount = order.total_discount || 0
    const tax = order.total_tax || 0
    const total =
      wasCashPaid && order.total_cash_amount != null
        ? order.total_cash_amount
        : order.total_amount || 0

    return { subtotal, discount, tax, total }
  }, [order])

  // Handlers
  const handleReopenOrder = useCallback(async () => {
    if (!orderId) return

    // Check if the order is in the active store
    const storeKey = useOrderStore.getState().dbOrderIdIndex[orderId] ?? orderId
    const isActiveOrder = !!useOrderStore.getState().ordersById[storeKey]

    if (isActiveOrder) {
      await updateOrderCheckStatus(orderId, 'Opened')
      const current = useOrderStore.getState().ordersById[storeKey]
      if (current?.check_status === 'Opened') {
        show({
          title: 'Order Reopened',
          message: 'This order is now open for editing and payments.',
          type: 'success'
        })
      } else {
        show({
          title: 'Reopen Failed',
          message: 'Could not reopen this order. Please try again.',
          type: 'error'
        })
      }
    } else {
      // Previous order — call OrderService directly
      const dbId =
        usePreviousOrdersStore.getState().getOrderById(orderId)?.db_order_id ||
        orderId
      const staffId = useEmployeeStore.getState().loggedInEmployee?.profileId
      if (!supabase || !staffId) {
        show({
          title: 'Reopen Failed',
          message: 'Missing authentication.',
          type: 'error'
        })
        return
      }
      const result = await OrderService.reopenCheck(supabase, dbId, staffId)
      if (result.success) {
        usePreviousOrdersStore
          .getState()
          .patchPreviousOrder(orderId, { checkStatus: 'Opened' })
        show({
          title: 'Order Reopened',
          message: 'This order is now open for editing and payments.',
          type: 'success'
        })
      } else {
        show({
          title: 'Reopen Failed',
          message: result.error || 'Could not reopen this order.',
          type: 'error'
        })
      }
    }
  }, [orderId, updateOrderCheckStatus, show, supabase])

  const handleCloseOrder = useCallback(async () => {
    if (!orderId) return

    // Check if the order is in the active store
    const storeKey = useOrderStore.getState().dbOrderIdIndex[orderId] ?? orderId
    const isActiveOrder = !!useOrderStore.getState().ordersById[storeKey]

    if (isActiveOrder) {
      await updateOrderCheckStatus(orderId, 'Closed')
      const current = useOrderStore.getState().ordersById[storeKey]
      if (current?.check_status === 'Closed') {
        show({
          title: 'Order Closed',
          message: 'This order has been closed.',
          type: 'success'
        })
      } else {
        show({
          title: 'Close Failed',
          message:
            'Could not close this order. There may be an outstanding balance.',
          type: 'error'
        })
      }
    } else {
      // Previous order — call OrderService directly
      const dbId =
        usePreviousOrdersStore.getState().getOrderById(orderId)?.db_order_id ||
        orderId
      const staffId = useEmployeeStore.getState().loggedInEmployee?.profileId
      if (!supabase) {
        show({
          title: 'Close Failed',
          message: 'Missing connection.',
          type: 'error'
        })
        return
      }
      const result = await OrderService.closeCheck(supabase, dbId, staffId)
      if (result.success) {
        usePreviousOrdersStore
          .getState()
          .patchPreviousOrder(orderId, { checkStatus: 'Closed' })
        show({
          title: 'Order Closed',
          message: 'This order has been closed.',
          type: 'success'
        })
      } else {
        show({
          title: 'Close Failed',
          message: result.error || 'Could not close this order.',
          type: 'error'
        })
      }
    }
  }, [orderId, updateOrderCheckStatus, show, supabase])

  const handleContinueCharging = useCallback(async () => {
    if (!orderId) return

    let activeId = orderId

    // If order not in local store, fetch from DB first
    if (!useOrderStore.getState().ordersById[orderId]) {
      const localId = await useOrderStore
        .getState()
        .syncOrderFromDatabase(orderId)
      if (!localId) {
        show({
          title: 'Error',
          message: 'Could not load order data.',
          type: 'error'
        })
        return
      }
      activeId = localId
    }

    useOrderStore.getState().setActiveOrder(activeId)
    close()

    // Navigate to order-processing if not already there
    if (!pathname.includes('order-processing')) {
      router.push('/order-processing')
    }
  }, [orderId, close, show, pathname, router])

  const handleIssueReceipt = useCallback(async () => {
    if (!order || !selectedStore) {
      show({
        title: 'Print Error',
        message: 'No order or store available.',
        type: 'error'
      })
      return
    }
    const success = await PrinterService.printReceipt(order, selectedStore)
    if (success) {
      show({
        title: 'Receipt Sent',
        message: 'Receipt sent to printer.',
        type: 'success'
      })
    } else {
      useNoPrinterModalStore.getState().show('receipt')
    }
  }, [order, selectedStore, show])

  const handlePrintKitchenTicket = useCallback(async () => {
    if (!order || !selectedStore) {
      show({
        title: 'Print Error',
        message: 'No order or store available.',
        type: 'error'
      })
      return
    }
    const nonVoidedItems = order.items.filter(item => !item.is_voided)
    if (nonVoidedItems.length === 0) {
      show({
        title: 'No Items',
        message: 'No items to print on kitchen ticket.',
        type: 'warning'
      })
      return
    }
    const success = await PrinterService.printKitchenTickets(
      order,
      nonVoidedItems,
      selectedStore
    )
    if (success) {
      show({
        title: 'Kitchen Ticket Sent',
        message: 'Kitchen ticket sent to printer.',
        type: 'success'
      })
    } else {
      useNoPrinterModalStore.getState().show('kitchen')
    }
  }, [order, selectedStore, show])

  const handleRefund = useCallback(() => {
    console.log(
      '[PaymentDetail] Refund button pressed, navigating to refund view'
    )
    setRightPaneView('refund')
  }, [])

  const handleTipAdjust = useCallback(() => {
    setRightPaneView('tipAdjust')
  }, [])

  const handleTipAdjusted = useCallback(() => {
    setTipProcessing(false)
    setRightPaneView('summary')
  }, [])

  const executeRefund = useCallback(
    async (
      type: RefundType,
      totalAmount: number,
      reason: string,
      perPaymentDetails: PerPaymentRefundDetail[],
      selectedItems?: { itemId: string; quantity: number; paymentIndex?: number }[]
    ): Promise<boolean> => {
      if (!order) {
        show({ title: 'Refund Failed', message: 'Order not found.', type: 'error' })
        return false
      }
      const orderDbId = order.db_order_id || order.id
      try {
        if (type === 'items') {
          await refundMutation.mutateAsync({
            type: 'items',
            totalAmount,
            reason,
            perPaymentDetails,
            selectedItems: selectedItems || [],
            orderId: orderId!,
            dbOrderId: orderDbId,
            paymentTerminalId: selectedStation?.payment_terminal?.id || '',
            paymentTerminal: selectedStation?.payment_terminal || undefined,
            stationId: selectedStation?.id
          })
        } else {
          await refundMutation.mutateAsync({
            type,
            totalAmount,
            reason,
            perPaymentDetails,
            orderId: orderId!,
            dbOrderId: orderDbId,
            paymentTerminalId: selectedStation?.payment_terminal?.id || '',
            paymentTerminal: selectedStation?.payment_terminal || undefined,
            stationId: selectedStation?.id
          })
        }
        setRightPaneView('summary')
        return true
      } catch {
        return false
      }
    },
    [order, orderId, show, selectedStation, refundMutation]
  )

  const writeFraudAuditLog = useCallback(
    (params: {
      totalAmount: number
      velocityCount: number
      wasBlocked: boolean
      approvedByManagerId?: string
      approvedByManagerName?: string
    }) => {
      if (!supabase || !orderId) return
      const empStore = useEmployeeStore.getState()
      const activeEmpId = empStore.activeEmployeeId
      const emp = activeEmpId ? empStore.getEmployeeById(activeEmpId) : null
      if (!emp?.profileId) return

      const flags = ['same_cashier_refund']
      if (params.wasBlocked) flags.push('velocity_blocked')

      supabase.from('audit_logs').insert({
        action: 'same_cashier_refund',
        action_category: 'fraud_detection',
        actor_name: emp.fullName,
        staff_profile_id: emp.profileId,
        resource_type: 'order',
        resource_id: orderId,
        severity: params.wasBlocked ? 'high' : 'medium',
        metadata: {
          fraud_flags: flags,
          refund_amount: params.totalAmount,
          velocity_count: params.velocityCount,
          approved_by: params.approvedByManagerId,
          approved_by_name: params.approvedByManagerName,
        },
        location_id: selectedStore?.id,
        merchant_id: selectedStore?.merchant_id,
      }).then(({ error: auditErr }) => {
        if (auditErr) console.warn('[FraudGuard] audit_logs insert failed:', auditErr)
      })
    },
    [supabase, orderId, selectedStore]
  )

  const handleProcessRefund = useCallback(
    async (
      type: RefundType,
      totalAmount: number,
      reason: string,
      perPaymentDetails: PerPaymentRefundDetail[],
      selectedItems?: {
        itemId: string
        quantity: number
        paymentIndex?: number
      }[]
    ): Promise<boolean> => {
      // Determine if any payment in this refund involves cash
      const hasCashPayment = perPaymentDetails.some(
        d => d.method?.toLowerCase() === 'cash'
      )
      const paymentMethod = hasCashPayment ? 'Cash' as const : 'Card' as const

      const guard = checkRefund({
        orderCreatedByStaffProfileId: order?.created_by_staff_profile_id,
        paymentMethod,
      })
      lastFraudGuardRef.current = guard

      if (guard.isSelfRefund && guard.isCashRefund && guard.velocity.shouldBlock) {
        pendingRefundRef.current = { type, totalAmount, reason, perPaymentDetails, selectedItems }
        setRefundApprovalVisible(true)
        return false
      }

      const success = await executeRefund(type, totalAmount, reason, perPaymentDetails, selectedItems)

      if (success && guard.isSelfRefund && guard.isCashRefund) {
        const velocity = recordAndNotify({ orderId: orderId || '', amount: totalAmount })
        writeFraudAuditLog({ totalAmount, velocityCount: velocity?.selfRefundCount ?? 1, wasBlocked: false })
        if (velocity?.shouldAlert) {
          setTimeout(() => {
            show({ title: 'Refund Flagged', message: `Same-cashier cash refund #${velocity.selfRefundCount} in the past hour. Flagged for review.`, type: 'warning' })
          }, 100)
        }
      }

      return success
    },
    [order, orderId, show, checkRefund, recordAndNotify, executeRefund, writeFraudAuditLog]
  )

  const handleRefundManagerApproved = useCallback(
    async (managerProfileId: string, managerName: string) => {
      setRefundApprovalVisible(false)
      const pending = pendingRefundRef.current
      if (!pending) return

      const success = await executeRefund(
        pending.type,
        pending.totalAmount,
        pending.reason,
        pending.perPaymentDetails,
        pending.selectedItems,
      )

      if (success) {
        const velocity = recordAndNotify({
          orderId: orderId || '',
          amount: pending.totalAmount,
          approvedByManagerId: managerProfileId,
          approvedByManagerName: managerName,
        })
        writeFraudAuditLog({
          totalAmount: pending.totalAmount,
          velocityCount: velocity?.selfRefundCount ?? 1,
          wasBlocked: true,
          approvedByManagerId: managerProfileId,
          approvedByManagerName: managerName,
        })
        if (velocity?.shouldAlert) {
          setTimeout(() => {
            show({ title: 'Refund Flagged', message: `Same-cashier cash refund #${velocity.selfRefundCount} (manager-approved). Flagged for review.`, type: 'warning' })
          }, 100)
        }
      }
      pendingRefundRef.current = null
    },
    [orderId, show, executeRefund, recordAndNotify, writeFraudAuditLog]
  )

  return (
    <Modal
      visible={isOpen}
      animationType='slide'
      transparent={true}
      onRequestClose={() => {
        if (refundMutation.isPending || tipProcessing) return
        close()
      }}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'flex-end'
        }}
      >
        <View
          style={{
            height: '90%',
            backgroundColor: colors.screen,
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16
          }}
        >
          {!order ? (
            <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ color: colors.muted, fontSize: 13 }}>Loading order...</Text>
            </View>
          ) : (
            <View style={{ flex: 1 }}>
              {/* Header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Text style={{ fontSize: 16, fontWeight: '700', color: colors.heading }}>Payment Details</Text>
                  <Text style={{ fontSize: 14, color: colors.label }}>
                    #{order.display_number || order.order_number?.slice(-6) || '—'}
                  </Text>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    {order.opened_at ? formatTimestamp(order.opened_at) : '—'}
                  </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {/* Delivery Platform / Online Badge */}
                  <DeliveryPlatformBadge
                    deliveryPlatform={order.delivery_platform}
                    orderSource={order.order_source}
                    size="sm"
                  />
                  {/* Status Badge */}
                  <View style={{
                    flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20, gap: 6,
                    backgroundColor: order.check_status === 'Opened' ? colors.success + '20' : colors.card,
                    borderWidth: 1,
                    borderColor: order.check_status === 'Opened' ? colors.success + '50' : colors.border,
                  }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: order.check_status === 'Opened' ? colors.success : colors.muted }} />
                    <Text style={{ fontSize: 11, fontWeight: '700', textTransform: 'uppercase', color: order.check_status === 'Opened' ? colors.success : colors.muted }}>
                      {order.check_status === 'Opened' ? 'Open' : 'Closed'}
                    </Text>
                  </View>
                  {/* Close Button */}
                  <TouchableOpacity
                    onPress={close}
                    disabled={refundMutation.isPending || tipProcessing}
                    style={{
                      paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8,
                      backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border,
                      opacity: refundMutation.isPending || tipProcessing ? 0.3 : 1
                    }}
                  >
                    <Text style={{ fontSize: 12, fontWeight: '700', color: colors.label }}>CLOSE</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Split Pane Content */}
              <View style={{ flex: 1, flexDirection: 'row' }}>
                {/* Left Pane - Order Receipt */}
                <LeftPane
                  order={order}
                  subtotal={orderTotals.subtotal}
                  discount={orderTotals.discount}
                  tax={orderTotals.tax}
                  total={orderTotals.total}
                />

                {/* Right Pane - Summary, Refund, or Tip Adjust */}
                {rightPaneView === 'summary' ? (
                  <RightPaneSummary
                    order={order}
                    paymentSummary={paymentSummary}
                    onReopenOrder={handleReopenOrder}
                    onCloseOrder={handleCloseOrder}
                    onContinueCharging={handleContinueCharging}
                    onIssueReceipt={handleIssueReceipt}
                    onPrintKitchenTicket={handlePrintKitchenTicket}
                    onTipAdjust={handleTipAdjust}
                    onRefund={handleRefund}
                    formatTimestamp={formatTimestamp}
                    terminalCanProcess={terminalCanProcess}
                    terminalBlockReason={terminalBlockReason}
                  />
                ) : rightPaneView === 'refund' ? (
                  <RightPaneRefund
                    order={order}
                    paymentSummary={paymentSummary}
                    onBack={() => setRightPaneView('summary')}
                    onProcessRefund={handleProcessRefund}
                    refundProcessing={refundMutation.isPending}
                  />
                ) : (
                  <RightPaneTipAdjust
                    order={order}
                    paymentSummary={paymentSummary}
                    onBack={() => setRightPaneView('summary')}
                    onTipAdjusted={handleTipAdjusted}
                    onProcessingChange={setTipProcessing}
                  />
                )}
              </View>
            </View>
          )}
        </View>
      </View>
      <ToastRenderer />

      <RefundApprovalModal
        visible={refundApprovalVisible}
        employeeName={lastFraudGuardRef.current?.activeEmployeeName || 'Cashier'}
        refundCount={lastFraudGuardRef.current?.velocity.selfRefundCount || 0}
        onApproved={handleRefundManagerApproved}
        onCancel={() => {
          setRefundApprovalVisible(false)
          pendingRefundRef.current = null
        }}
      />
    </Modal>
  )
}

const PaymentDetailBottomSheet = React.forwardRef(
  PaymentDetailBottomSheetComponent
)
PaymentDetailBottomSheet.displayName = 'PaymentDetailBottomSheet'

export default PaymentDetailBottomSheet
