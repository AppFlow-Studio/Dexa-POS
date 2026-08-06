/**
 * FailedSyncsPanel — Displays dead-lettered sync operations that exhausted retries.
 *
 * Shows operation type, timestamp, and allows manual retry or discard.
 * Integrates with offlineSyncService dead letter queue.
 */

import {
  describeCause,
  deriveRemedy,
  isRetryable
} from '@/lib/offlineSyncSubtitles'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import {
  discardDeadLetterOperation,
  getDeadLetterOperations,
  retryDeadLetterOperation,
  subscribeToDeadLetterChanges,
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

/**
 * Human label for WHICH order/item failed.
 *
 * A truncated local id ("order_17351…") is meaningless to a server mid-shift.
 * Resolve to the ticket number and item name they actually recognise, falling
 * back progressively so this never renders an empty or cryptic string.
 */
function describeTarget (op: OfflineOperation): string {
  const parts: string[] = []
  try {
    // Lazy require: this panel is in the settings tree and shouldn't pull the
    // order store into its module graph at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useOrderStore } = require('@/stores/useOrderStore')
    const state = useOrderStore.getState()
    const order =
      state.ordersById?.[op.localOrderId] ??
      (typeof state.getOrder === 'function'
        ? state.getOrder(op.localOrderId)
        : null)

    if (order?.display_number) {
      parts.push(`Order #${order.display_number}`)
    } else if (order?.customer_name) {
      parts.push(order.customer_name)
    }

    if (op.localItemId && order?.items) {
      const item = order.items.find((i: any) => i.id === op.localItemId)
      if (item?.name) parts.push(item.name)
    }
  } catch {
    // Store unavailable — fall through to the id-based fallback below.
  }

  if (parts.length > 0) return parts.join(' · ')
  // Last resort: the raw id is still better than showing nothing.
  return op.localOrderId ? `${op.localOrderId.substring(0, 14)}…` : ''
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
    // Subscribe so a failure appears the instant it dead-letters. The previous
    // 10s poll meant an operator staring at this screen could wait ten seconds
    // for a failure to show up. Keep a slow poll as a backstop for relative
    // timestamps ("2 min ago") and any path that mutates without notifying.
    const unsubscribe = subscribeToDeadLetterChanges(refresh)
    const interval = setInterval(refresh, 30_000)
    return () => {
      unsubscribe()
      clearInterval(interval)
    }
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
    // Skip terminal failures — retrying them is guaranteed to fail again and
    // would just re-queue work the operator has to resolve by hand.
    const ids = operations.filter(op => isRetryable(op)).map(op => op.id)
    if (ids.length === 0) return
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
        {operations.filter(op => isRetryable(op)).length > 1 && (
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
        // Cause + remedy come from the same helpers the bill banner uses, so
        // the operator sees identical wording in both places.
        const cause = describeCause(op) || 'Sync failed'
        const remedy = deriveRemedy(op)
        const terminal = !isRetryable(op)
        const target = describeTarget(op)

        return (
          <View
            key={op.id}
            style={{
              flexDirection: 'row',
              // Top-aligned: rows are now 4-5 lines tall, and centering floated
              // the action buttons to the vertical middle of the text block.
              alignItems: 'flex-start',
              paddingHorizontal: s(16),
              paddingVertical: s(14),
              borderBottomWidth: 1,
              borderBottomColor: colors.border + '50'
            }}
          >
            {/* Type + Details */}
            <View style={{ flex: 1, marginRight: s(12), minWidth: 0 }}>
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
              {/* WHY it failed — the operator-facing cause. Before the failure
                  model rebuild this panel could only show a retry count, because
                  `lastError` was always the synthetic MAX_RETRIES placeholder. */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: s(6),
                  marginTop: s(4)
                }}
              >
                <View
                  style={{
                    backgroundColor: terminal
                      ? colors.danger + '30'
                      : colors.warning + '30',
                    paddingHorizontal: s(6),
                    paddingVertical: s(2),
                    borderRadius: s(4)
                  }}
                >
                  <Text
                    style={{
                      fontSize: s(10),
                      fontWeight: '700',
                      color: terminal ? colors.danger : colors.warning
                    }}
                  >
                    {terminal ? 'NEEDS ACTION' : 'WILL RETRY'}
                  </Text>
                </View>
                <Text
                  style={{
                    fontSize: s(12),
                    fontWeight: '600',
                    color: colors.heading,
                    flexShrink: 1
                  }}
                  numberOfLines={1}
                >
                  {cause}
                </Text>
              </View>

              {/* HOW to fix it. */}
              {remedy ? (
                <Text
                  style={{ fontSize: s(12), color: colors.label, marginTop: s(3) }}
                  numberOfLines={2}
                >
                  {remedy}
                </Text>
              ) : null}

              {/* Raw server message — the detail a manager relays to support. */}
              {op.lastError?.message ? (
                <Text
                  style={{
                    fontSize: s(10),
                    color: colors.muted,
                    marginTop: s(3),
                    fontStyle: 'italic'
                  }}
                  numberOfLines={2}
                >
                  {op.lastError.code ? `${op.lastError.code}: ` : ''}
                  {op.lastError.message}
                </Text>
              ) : null}

              <Text style={{ fontSize: s(11), color: colors.muted, marginTop: s(3) }}>
                {target ? `${target} · ` : ''}
                {formatTimestamp(op.timestamp)} · {op.retryCount}{' '}
                {op.retryCount === 1 ? 'attempt' : 'attempts'}
              </Text>
            </View>

            {/* Action buttons — stacked so long remedy text doesn't squeeze
                them, and so tap targets stay full-width and thumb-friendly. */}
            <View style={{ alignItems: 'stretch', gap: s(6), minWidth: s(104) }}>
              {/* Terminal failures hide Retry — the server rejected this
                  permanently, so replaying the identical payload cannot work.
                  Offering it would just waste the operator's time mid-shift. */}
              {!terminal && (
                <TouchableOpacity
                  onPress={() => handleRetry(op.id)}
                  disabled={isRetrying}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: s(4),
                    paddingHorizontal: s(12),
                    paddingVertical: s(7),
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
              )}

              {isPayment ? (
                <TouchableOpacity
                  onPress={() => setResolveOpId(op.id)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: s(4),
                    paddingHorizontal: s(12),
                    paddingVertical: s(7),
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
                    justifyContent: 'center',
                    gap: s(4),
                    paddingHorizontal: s(12),
                    paddingVertical: s(7),
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
