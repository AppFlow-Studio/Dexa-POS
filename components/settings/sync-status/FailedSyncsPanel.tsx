/**
 * FailedSyncsPanel — Displays dead-lettered sync operations that exhausted retries.
 *
 * Shows operation type, timestamp, and allows manual retry or discard.
 * Integrates with offlineSyncService dead letter queue.
 */

import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import {
  discardDeadLetterOperation,
  getDeadLetterOperations,
  retryDeadLetterOperation,
  type OfflineOperation
} from '@/services/offlineSyncService'
import { AlertTriangle, RefreshCw, Trash2, Wrench } from 'lucide-react-native'
import React, { useCallback, useEffect, useState } from 'react'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import { FailedSyncResolutionModal } from './FailedSyncResolutionModal'

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
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const [operations, setOperations] = useState<OfflineOperation[]>([])
  const [retryingIds, setRetryingIds] = useState<Set<string>>(new Set())
  const [resolveOpId, setResolveOpId] = useState<string | null>(null)

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
          paddingHorizontal: s(16),
          paddingVertical: s(16),
          backgroundColor: colors.panel,
          borderRadius: s(12),
          borderWidth: 1,
          borderColor: colors.border
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: s(8),
            marginBottom: s(8)
          }}
        >
          <AlertTriangle size={s(16)} color={colors.label} />
          <Text
            style={{ fontSize: s(16), fontWeight: '600', color: colors.heading }}
          >
            Failed Sync Operations
          </Text>
        </View>
        <Text style={{ fontSize: s(14), color: colors.label }}>
          No failed operations. All syncs are healthy.
        </Text>
      </View>
    )
  }

  return (
    <View
      style={{
        backgroundColor: colors.panel,
        borderRadius: s(12),
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
          paddingHorizontal: s(16),
          paddingVertical: s(16),
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <AlertTriangle size={s(16)} color={colors.danger} />
          <Text
            style={{ fontSize: s(16), fontWeight: '600', color: colors.heading }}
          >
            Failed Sync Operations
          </Text>
          <View
            style={{
              backgroundColor: colors.danger + '40',
              paddingHorizontal: s(8),
              paddingVertical: s(2),
              borderRadius: s(12)
            }}
          >
            <Text
              style={{ fontSize: s(12), fontWeight: '700', color: colors.danger }}
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
              gap: s(6),
              paddingHorizontal: s(12),
              paddingVertical: s(6),
              borderRadius: s(8),
              backgroundColor: colors.teal + '30'
            }}
          >
            <RefreshCw size={s(12)} color={colors.teal} />
            <Text
              style={{ fontSize: s(12), fontWeight: '500', color: colors.teal }}
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
              paddingHorizontal: s(16),
              paddingVertical: s(16),
              borderBottomWidth: 1,
              borderBottomColor: colors.border + '50'
            }}
          >
            {/* Type + Details */}
            <View style={{ flex: 1, marginRight: s(12) }}>
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}
              >
                <Text
                  style={{
                    fontSize: s(14),
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
                      paddingHorizontal: s(6),
                      paddingVertical: s(2),
                      borderRadius: s(4)
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(10),
                        fontWeight: '700',
                        color: colors.danger
                      }}
                    >
                      PAYMENT
                    </Text>
                  </View>
                )}
              </View>
              <Text style={{ fontSize: s(12), color: colors.muted, marginTop: s(2) }}>
                {formatTimestamp(op.timestamp)} · {op.retryCount} retries
              </Text>
              {op.localOrderId && (
                <Text
                  style={{ fontSize: s(12), color: colors.muted, marginTop: s(2) }}
                  numberOfLines={1}
                >
                  Order: {op.localOrderId.substring(0, 20)}...
                </Text>
              )}
            </View>

            {/* Action buttons */}
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}
            >
              <TouchableOpacity
                onPress={() => handleRetry(op.id)}
                disabled={isRetrying}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: s(4),
                  paddingHorizontal: s(12),
                  paddingVertical: s(6),
                  borderRadius: s(8),
                  backgroundColor: colors.teal + '30'
                }}
              >
                {isRetrying ? (
                  <ActivityIndicator size='small' color={colors.teal} />
                ) : (
                  <RefreshCw size={s(12)} color={colors.teal} />
                )}
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: '500',
                    color: colors.teal
                  }}
                >
                  Retry
                </Text>
              </TouchableOpacity>

              {isPayment ? (
                <TouchableOpacity
                  onPress={() => setResolveOpId(op.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: s(4),
                    paddingHorizontal: s(12),
                    paddingVertical: s(6),
                    borderRadius: s(8),
                    backgroundColor: colors.card,
                    borderWidth: 1,
                    borderColor: colors.border
                  }}
                >
                  <Wrench size={s(12)} color={colors.label} />
                  <Text
                    style={{
                      fontSize: s(12),
                      fontWeight: '500',
                      color: colors.label
                    }}
                  >
                    Resolve manually
                  </Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  onPress={() => handleDiscard(op.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: s(4),
                    paddingHorizontal: s(12),
                    paddingVertical: s(6),
                    borderRadius: s(8),
                    backgroundColor: colors.card
                  }}
                >
                  <Trash2 size={s(12)} color={colors.label} />
                  <Text
                    style={{
                      fontSize: s(12),
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
            paddingHorizontal: s(12),
            paddingVertical: s(12),
            backgroundColor: colors.danger + '20'
          }}
        >
          <Text style={{ fontSize: s(12), color: colors.danger }}>
            Payment operations can&apos;t be auto-discarded. Tap{' '}
            <Text style={{ fontWeight: '700' }}>Resolve manually</Text> to
            compare local and server state, then mark resolved, retry, or
            force re-sync.
          </Text>
        </View>
      )}

      <FailedSyncResolutionModal
        visible={resolveOpId !== null}
        op={
          resolveOpId
            ? operations.find(o => o.id === resolveOpId) ?? null
            : null
        }
        onClose={() => setResolveOpId(null)}
        onResolved={refresh}
      />
    </View>
  )
}
