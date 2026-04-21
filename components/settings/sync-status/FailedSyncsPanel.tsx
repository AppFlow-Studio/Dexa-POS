/**
 * FailedSyncsPanel — Displays dead-lettered sync operations that exhausted retries.
 *
 * Shows operation type, timestamp, and allows manual retry or discard.
 * Integrates with offlineSyncService dead letter queue.
 */

import { colors } from '@/lib/theme'
import {
  discardDeadLetterOperation,
  getDeadLetterOperations,
  retryDeadLetterOperation,
  type OfflineOperation
} from '@/services/offlineSyncService'
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react-native'
import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'

const OPERATION_LABELS: Record<string, string> = {
  create_order: 'Create Order',
  add_item: 'Add Item',
  update_item: 'Update Item',
  update_item_quantity: 'Update Quantity',
  replace_modifiers: 'Replace Modifiers',
  remove_item: 'Remove Item',
  void_item: 'Void Item',
  update_order_status: 'Update Order Status',
  apply_discount: 'Apply Discount',
  void_discount: 'Void Discount',
  send_to_kitchen: 'Send to Kitchen',
  process_payment: 'Process Payment',
  process_cash_payment: 'Cash Payment',
  process_card_payment: 'Card Payment',
  seat_guests: 'Seat Guests',
  update_session_status: 'Update Session',
  link_order_to_session: 'Link Order to Session',
  close_check: 'Close Check',
  reopen_check: 'Reopen Check',
  fire_course: 'Fire Course',
  record_cash_drawer_operation: 'Cash Drawer',
  process_preauth: 'Pre-Auth',
  capture_preauth: 'Capture Pre-Auth',
  increment_preauth: 'Increment Pre-Auth',
  void_preauth: 'Void Pre-Auth'
}

function formatTimestamp (ts: string): string {
  try {
    const d = new Date(ts)
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit'
    })
  } catch {
    return ts
  }
}

function isPaymentOp (type: string): boolean {
  return [
    'process_payment',
    'process_cash_payment',
    'process_card_payment',
    'process_preauth',
    'capture_preauth',
    'increment_preauth',
    'void_preauth'
  ].includes(type)
}

export function FailedSyncsPanel (): React.ReactElement {
  const [operations, setOperations] = useState<OfflineOperation[]>([])
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set())

  const refresh = useCallback(() => {
    setOperations(getDeadLetterOperations())
  }, [])

  useEffect(() => {
    refresh()
    // Refresh every 10 seconds in case the queue changes
    const interval = setInterval(refresh, 10_000)
    return () => clearInterval(interval)
  }, [refresh])

  const handleRetry = async (opId: string) => {
    setRetryingIds(prev => new Set(prev).add(opId))
    try {
      await retryDeadLetterOperation(opId)
      refresh()
    } finally {
      setRetryingIds(prev => {
        const next = new Set(prev)
        next.delete(opId)
        return next
      })
    }
  }

  const handleDiscard = (opId: string) => {
    discardDeadLetterOperation(opId)
    refresh()
  }

  const handleRetryAll = async () => {
    const ids = operations.map(op => op.id)
    setRetryingIds(new Set(ids))
    try {
      for (const id of ids) {
        await retryDeadLetterOperation(id)
      }
      refresh()
    } finally {
      setRetryingIds(new Set())
    }
  }

  if (operations.length === 0) {
    return (
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 16,
          backgroundColor: colors.panel,
          borderRadius: 12,
          borderWidth: 1,
          borderColor: colors.border
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            marginBottom: 8
          }}
        >
          <AlertTriangle size={16} color={colors.label} />
          <Text
            style={{ fontSize: 16, fontWeight: '600', color: colors.heading }}
          >
            Failed Sync Operations
          </Text>
        </View>
        <Text style={{ fontSize: 14, color: colors.label }}>
          No failed operations. All syncs are healthy.
        </Text>
      </View>
    )
  }

  return (
    <View
      style={{
        backgroundColor: colors.panel,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.danger + '50',
        overflow: 'hidden'
      }}
    >
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: 16,
          paddingVertical: 16,
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <AlertTriangle size={16} color={colors.danger} />
          <Text
            style={{ fontSize: 16, fontWeight: '600', color: colors.heading }}
          >
            Failed Sync Operations
          </Text>
          <View
            style={{
              backgroundColor: colors.danger + '40',
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 12
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: '700', color: colors.danger }}
            >
              {operations.length}
            </Text>
          </View>
        </View>
        {operations.length > 1 && (
          <TouchableOpacity
            onPress={handleRetryAll}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: colors.teal + '30'
            }}
          >
            <RefreshCw size={12} color={colors.teal} />
            <Text
              style={{ fontSize: 12, fontWeight: '500', color: colors.teal }}
            >
              Retry All
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Operations list */}
      {operations.map(op => {
        const isRetrying = retryingIds.has(op.id)
        const isPayment = isPaymentOp(op.type)

        return (
          <View
            key={op.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 16,
              paddingVertical: 16,
              borderBottomWidth: 1,
              borderBottomColor: colors.border + '50'
            }}
          >
            {/* Type + Details */}
            <View style={{ flex: 1, marginRight: 12 }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
              >
                <Text
                  style={{
                    fontSize: 14,
                    fontWeight: '600',
                    color: colors.heading
                  }}
                >
                  {OPERATION_LABELS[op.type] || op.type}
                </Text>
                {isPayment && (
                  <View
                    style={{
                      backgroundColor: colors.danger + '40',
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      borderRadius: 4
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '700',
                        color: colors.danger
                      }}
                    >
                      PAYMENT
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                {formatTimestamp(op.timestamp)} · {op.retryCount} retries
              </Text>
              {op.localOrderId && (
                <Text
                  style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}
                  numberOfLines={1}
                >
                  Order: {op.localOrderId.substring(0, 20)}...
                </Text>
              )}
            </View>

            {/* Action buttons */}
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
            >
              <TouchableOpacity
                onPress={() => handleRetry(op.id)}
                disabled={isRetrying}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  borderRadius: 8,
                  backgroundColor: colors.teal + '30'
                }}
              >
                {isRetrying ? (
                  <ActivityIndicator size='small' color={colors.teal} />
                ) : (
                  <RefreshCw size={12} color={colors.teal} />
                )}
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '500',
                    color: colors.teal
                  }}
                >
                  Retry
                </Text>
              </TouchableOpacity>

              {!isPayment && (
                <TouchableOpacity
                  onPress={() => handleDiscard(op.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4,
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 8,
                    backgroundColor: colors.card
                  }}
                >
                  <Trash2 size={12} color={colors.label} />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '500',
                      color: colors.label
                    }}
                  >
                    Discard
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        )
      })}

      {/* Footer warning for payment ops */}
      {operations.some(op => isPaymentOp(op.type)) && (
        <View
          style={{
            paddingHorizontal: 12,
            paddingVertical: 12,
            backgroundColor: colors.danger + '20'
          }}
        >
          <Text style={{ fontSize: 12, color: colors.danger }}>
            Payment operations cannot be discarded. They must be retried or
            resolved manually.
          </Text>
        </View>
      )}
    </View>
  )
}
