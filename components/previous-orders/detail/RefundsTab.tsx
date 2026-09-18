import { colors } from '@/lib/theme'
import { toastService } from '@/lib/toastService'
import { PreviousOrder } from '@/lib/types'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { PrinterService } from '@/services/printing/PrinterService'
import { RefundReceiptService } from '@/services/refundReceiptService'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { Printer } from 'lucide-react-native'
import React, { useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

interface RefundsTabProps {
  order: PreviousOrder
}

const reversalTypeLabels: Record<
  string,
  { label: string; color: string; backgroundColor: string }
> = {
  void: {
    label: 'VOIDED',
    color: colors.danger,
    backgroundColor: colors.teal + '20'
  },
  refund: {
    label: 'REFUNDED',
    color: colors.danger,
    backgroundColor: colors.teal + '20'
  },
  partial_refund: {
    label: 'PARTIAL REFUND',
    color: colors.teal,
    backgroundColor: colors.teal + '20'
  },
  item_return: {
    label: 'ITEM RETURN',
    color: colors.teal,
    backgroundColor: colors.teal + '20'
  }
}

const statusStyles: Record<string, { color: string; backgroundColor: string }> =
  {
    pending: { color: colors.teal, backgroundColor: colors.teal + '15' },
    completed: { color: colors.teal, backgroundColor: colors.teal + '20' },
    failed: { color: colors.teal, backgroundColor: colors.teal + '20' }
  }

const RefundsTab: React.FC<RefundsTabProps> = ({ order }) => {
  const supabase = useSupabaseClient()
  const location = useStoreSettingsStore(state => state.selectedStore)
  const [printingReversalId, setPrintingReversalId] = useState<string | null>(
    null
  )
  const reversals = order.reversals || []
  const refundItems = order.order_refund_items || []

  const refundSummary = useMemo(() => {
    const originalTotal = order.total
    const totalRefunded = order.refundedAmount || 0
    const remaining = Math.max(0, originalTotal - totalRefunded)
    return { originalTotal, totalRefunded, remaining }
  }, [order])

  const hasNoRefunds = reversals.length === 0 && refundItems.length === 0

  const handleReprint = async (reversalId: string) => {
    if (!location || printingReversalId) return
    setPrintingReversalId(reversalId)
    try {
      const receipt = await RefundReceiptService.load(
        supabase,
        reversalId,
        location,
        { isReprint: true }
      )
      const queued = await PrinterService.printRefundReceipt(receipt)
      toastService.show({
        title: queued ? 'Refund Receipt Queued' : 'Receipt Printer Missing',
        message: queued
          ? 'The refund receipt was added to the print queue.'
          : 'Configure a receipt printer and try again.',
        type: queued ? 'success' : 'error'
      })
    } catch (error) {
      toastService.show({
        title: 'Refund Receipt Failed',
        message:
          (error as { message?: string })?.message ??
          'Could not load the refund receipt.',
        type: 'error'
      })
    } finally {
      setPrintingReversalId(null)
    }
  }

  if (hasNoRefunds) {
    return (
      <View className='flex-1 items-center justify-center py-12'>
        <Text style={{ fontSize: 18, color: colors.muted }}>No refunds</Text>
        <Text style={{ fontSize: 14, color: colors.muted, marginTop: 4 }}>
          This order has no refund history
        </Text>
      </View>
    )
  }

  return (
    <ScrollView
      className='flex-1'
      contentContainerStyle={{ padding: 16 }}
      showsVerticalScrollIndicator={false}
    >
      {/* Refund Summary Card */}
      <View
        style={{
          backgroundColor: colors.panel,
          borderRadius: 12,
          padding: 16,
          marginBottom: 16,
          borderWidth: 1,
          borderColor: colors.teal + '30'
        }}
      >
        <Text
          style={{
            fontSize: 15,
            fontWeight: '700',
            color: colors.heading,
            marginBottom: 12
          }}
        >
          Refund Summary
        </Text>
        <SummaryRow
          label='Original Total'
          value={refundSummary.originalTotal}
        />
        <SummaryRow
          label='Total Refunded'
          value={refundSummary.totalRefunded}
          color={colors.danger}
        />
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: colors.border,
            marginTop: 8,
            paddingTop: 8
          }}
        >
          <SummaryRow
            label='Remaining Refundable'
            value={refundSummary.remaining}
            color={colors.teal}
            bold
          />
        </View>
      </View>

      {/* Reversal History */}
      {reversals.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: colors.heading,
              marginBottom: 12
            }}
          >
            Reversal History
          </Text>
          {reversals.map(reversal => {
            const typeConfig =
              reversalTypeLabels[reversal.reversal_type] ||
              reversalTypeLabels.refund
            const statusStyle =
              statusStyles[reversal.status] || statusStyles.pending

            return (
              <View
                key={reversal.id}
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: 12,
                  padding: 16,
                  marginBottom: 10,
                  borderWidth: 1,
                  borderColor: colors.teal + '30'
                }}
              >
                <View className='flex-row items-center justify-between mb-2'>
                  {/* Type badge */}
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 4,
                      backgroundColor: typeConfig.backgroundColor
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '700',
                        color: typeConfig.color
                      }}
                    >
                      {typeConfig.label}
                    </Text>
                  </View>

                  {/* Amount */}
                  <Text
                    style={{
                      fontSize: 15,
                      fontWeight: '700',
                      color: colors.teal
                    }}
                  >
                    -${reversal.amount.toFixed(2)}
                  </Text>
                </View>

                {/* Reason */}
                {reversal.reason_description && (
                  <Text
                    style={{
                      fontSize: 14,
                      color: colors.label,
                      marginBottom: 8
                    }}
                  >
                    {reversal.reason_description}
                  </Text>
                )}

                {/* Timestamps */}
                <View className='flex-row items-center gap-3 mb-1.5'>
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    Requested:{' '}
                    {new Date(reversal.requested_at).toLocaleString()}
                  </Text>
                </View>
                {reversal.completed_at && (
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    Completed:{' '}
                    {new Date(reversal.completed_at).toLocaleString()}
                  </Text>
                )}

                {/* Status badge */}
                <View className='flex-row justify-end mt-2'>
                  <View
                    style={{
                      paddingHorizontal: 8,
                      paddingVertical: 2,
                      borderRadius: 999,
                      backgroundColor: statusStyle.backgroundColor
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        textTransform: 'capitalize',
                        color: statusStyle.color
                      }}
                    >
                      {reversal.status}
                    </Text>
                  </View>
                </View>

                {reversal.status === 'completed' &&
                  reversal.reversal_type !== 'void' && (
                    <TouchableOpacity
                      onPress={() => handleReprint(reversal.id)}
                      disabled={printingReversalId !== null}
                      style={{
                        marginTop: 12,
                        minHeight: 40,
                        borderRadius: 8,
                        borderWidth: 1,
                        borderColor: colors.teal,
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexDirection: 'row',
                        gap: 8,
                        opacity:
                          printingReversalId &&
                          printingReversalId !== reversal.id
                            ? 0.45
                            : 1
                      }}
                    >
                      {printingReversalId === reversal.id ? (
                        <ActivityIndicator size='small' color={colors.teal} />
                      ) : (
                        <Printer size={17} color={colors.teal} />
                      )}
                      <Text
                        style={{
                          color: colors.teal,
                          fontSize: 13,
                          fontWeight: '700'
                        }}
                      >
                        Reprint Refund Receipt
                      </Text>
                    </TouchableOpacity>
                  )}
              </View>
            )
          })}
        </View>
      )}

      {/* Per-Item Refund Status */}
      {refundItems.length > 0 && (
        <View style={{ marginBottom: 16 }}>
          <Text
            style={{
              fontSize: 15,
              fontWeight: '700',
              color: colors.heading,
              marginBottom: 12
            }}
          >
            Per-Item Refund Status
          </Text>
          {refundItems.map(refundItem => {
            const matchedItem = order.items.find(
              i => i.db_order_item_id === refundItem.order_item_id
            )
            return (
              <View
                key={refundItem.id}
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: 12,
                  padding: 12,
                  marginBottom: 8,
                  borderWidth: 1,
                  borderColor: colors.teal + '30',
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <View style={{ flex: 1, marginRight: 12 }}>
                  <Text
                    style={{
                      fontSize: 14,
                      fontWeight: '600',
                      color: colors.heading
                    }}
                  >
                    {matchedItem?.name || 'Unknown Item'}
                  </Text>
                  <Text
                    style={{ fontSize: 12, color: colors.label, marginTop: 2 }}
                  >
                    Qty Refunded: {refundItem.quantity_refunded}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: colors.danger
                  }}
                >
                  -${refundItem.total_refunded.toFixed(2)}
                </Text>
              </View>
            )
          })}
        </View>
      )}

      <View className='h-4' />
    </ScrollView>
  )
}

const SummaryRow = ({
  label,
  value,
  color = colors.label,
  bold = false
}: {
  label: string
  value: number
  color?: string
  bold?: boolean
}) => (
  <View className='flex-row justify-between py-1'>
    <Text style={{ fontSize: 14, color, fontWeight: bold ? '700' : '400' }}>
      {label}
    </Text>
    <Text style={{ fontSize: 14, color, fontWeight: bold ? '700' : '600' }}>
      ${value.toFixed(2)}
    </Text>
  </View>
)

export default React.memo(RefundsTab)
