/**
 * Wave 3.0e-2 — Inline dead-letter banner for the order processing screen.
 *
 * Renders one row per order-bound dead-lettered op for the active order.
 * Each row: title (e.g., "Kitchen send pending") + specific subtitle
 * (e.g., "Network too slow — 10 attempts since 4:32pm") + Retry tap target.
 *
 * Design intent (Wave 3.0e UX decision): never route the operator off the
 * order processing screen for sync recovery. Item-bound dead-letters surface
 * on the per-item Retry chip; order-bound dead-letters surface here.
 *
 * Mounted at the top of BillItemsAndTotals, above the order note input.
 *
 * Persistence: dead-letter queue is MMKV-backed, so banner state survives
 * app restart automatically — we just read from the same source on mount.
 */

import { colors } from '@/lib/theme'
import {
  deriveSubtitle,
  deriveTitle,
  isRetryable,
  ORDER_BOUND_OPS
} from '@/lib/offlineSyncSubtitles'
import {
  discardDeadLetterOperation,
  getDeadLetterOperations,
  retryDeadLetterOperation,
  subscribeToDeadLetterChanges
} from '@/services/offlineSyncService'
import { useOrderStore } from '@/stores/useOrderStore'
import { useToastStore } from '@/stores/useToastStore'
import { AlertTriangle } from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

const MAX_VISIBLE_ROWS = 3
const TICK_INTERVAL_MS = 30_000 // re-render relative timestamps every 30s

const OrderSyncBanner: React.FC = () => {
  const activeOrderId = useOrderStore(s => s.activeOrderId)
  const showToast = useToastStore(s => s.show)

  // Re-fetch dead-letter snapshot whenever the queue changes (subscribed
  // below) and on every TICK_INTERVAL_MS so relative timestamps stay fresh.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    if (subscribeToDeadLetterChanges) {
      const unsub = subscribeToDeadLetterChanges(() =>
        setTick(t => (t + 1) | 0)
      )
      return unsub
    }
    return undefined
  }, [])
  useEffect(() => {
    const interval = setInterval(() => setTick(t => (t + 1) | 0), TICK_INTERVAL_MS)
    return () => clearInterval(interval)
  }, [])

  const matchingOps = useMemo(() => {
    void tick
    if (!activeOrderId) return []
    return getDeadLetterOperations()
      .filter(
        op =>
          ORDER_BOUND_OPS.has(op.type) && op.localOrderId === activeOrderId
      )
      .sort((a, b) => {
        const aTime = a.deadLetteredAtMs ?? new Date(a.timestamp).getTime()
        const bTime = b.deadLetteredAtMs ?? new Date(b.timestamp).getTime()
        return bTime - aTime // newest first
      })
  }, [activeOrderId, tick])

  const handleRetry = useCallback(
    async (opId: string) => {
      try {
        await retryDeadLetterOperation(opId)
        showToast({
          title: 'Retrying…',
          message: 'Re-queued for sync.',
          type: 'success',
          duration: 2000
        })
      } catch (err) {
        console.error('[OrderSyncBanner] retryDeadLetterOperation error:', err)
        showToast({
          title: 'Retry failed',
          message: "Couldn't re-queue — try again.",
          type: 'error'
        })
      }
    },
    [showToast]
  )

  const handleDismiss = useCallback(
    (opId: string) => {
      discardDeadLetterOperation(opId)
      showToast({
        title: 'Dismissed',
        message: 'Sync error cleared.',
        type: 'warning',
        duration: 2000
      })
    },
    [showToast]
  )

  if (matchingOps.length === 0) return null

  const visible = matchingOps.slice(0, MAX_VISIBLE_ROWS)
  const overflow = matchingOps.length - visible.length

  return (
    <View
      style={{
        marginHorizontal: 12,
        marginTop: 6,
        marginBottom: 4,
        borderRadius: 8,
        backgroundColor: colors.danger + '14',
        borderWidth: 1,
        borderColor: colors.danger + '40',
        paddingVertical: 6,
        paddingHorizontal: 10,
        gap: 4
      }}
      accessibilityRole='alert'
      accessibilityLabel={`${matchingOps.length} order sync${
        matchingOps.length === 1 ? '' : 's'
      } pending`}
    >
      {visible.map((op, idx) => {
        const title = deriveTitle(op)
        const subtitle = deriveSubtitle(op)
        const retryable = isRetryable(op)
        return (
          <View
            key={op.id}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingTop: idx === 0 ? 0 : 4,
              borderTopWidth: idx === 0 ? 0 : 1,
              borderTopColor: colors.danger + '20'
            }}
          >
            <AlertTriangle size={14} color={colors.danger} />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '700',
                  color: colors.danger
                }}
                numberOfLines={1}
              >
                {title}
              </Text>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '500',
                  color: colors.muted,
                  marginTop: 1
                }}
                numberOfLines={2}
              >
                {subtitle}
              </Text>
            </View>
            {retryable ? (
              <TouchableOpacity
                onPress={() => handleRetry(op.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={`Retry ${title.toLowerCase()}`}
                style={{
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 6,
                  backgroundColor: colors.danger + '22'
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: colors.danger
                  }}
                >
                  Retry
                </Text>
              </TouchableOpacity>
            ) : (
              <TouchableOpacity
                onPress={() => handleDismiss(op.id)}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                accessibilityLabel={`Dismiss ${title.toLowerCase()}`}
              >
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '700',
                    color: colors.muted,
                    textDecorationLine: 'underline'
                  }}
                >
                  Dismiss
                </Text>
              </TouchableOpacity>
            )}
          </View>
        )
      })}
      {overflow > 0 && (
        <Text
          style={{
            fontSize: 10,
            fontWeight: '500',
            color: colors.muted,
            marginTop: 2,
            textAlign: 'center'
          }}
        >
          {`+${overflow} more sync${overflow === 1 ? '' : 's'} pending`}
        </Text>
      )}
    </View>
  )
}

export default React.memo(OrderSyncBanner)
