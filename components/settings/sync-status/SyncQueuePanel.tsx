/**
 * SyncQueuePanel — Displays queued offline sync operations and allows manual flush.
 *
 * Shows operation type, status, timestamp, retry count, and provides
 * "Sync Now" and "Force Retry All" actions. Polls every 5 seconds.
 */

import { colors } from '@/lib/theme'
import {
  forceRetryAllPending,
  getIsOnline,
  getPendingOperations,
  getQueueStatus,
  processQueueNow,
  type OfflineOperation
} from '@/services/offlineSyncService'
import { Cloud, CloudOff, RefreshCw, RotateCcw } from 'lucide-react-native'
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

const STATUS_COLORS: Record<
  string,
  {
    getBg: (c: typeof colors) => string
    getText: (c: typeof colors) => string
    label: string
  }
> = {
  pending: {
    getBg: c => c.warning + '40',
    getText: c => c.warning,
    label: 'Pending'
  },
  processing: {
    getBg: c => c.info + '40',
    getText: c => c.info,
    label: 'Processing'
  },
  blocked: {
    getBg: c => c.warning + '40',
    getText: c => c.warning,
    label: 'Blocked'
  },
  failed: {
    getBg: c => c.danger + '40',
    getText: c => c.danger,
    label: 'Failed'
  }
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

export function SyncQueuePanel (): React.ReactElement {
  const [operations, setOperations] = useState<OfflineOperation[]>([])
  const [queueStatus, setQueueStatus] = useState<ReturnType<
    typeof getQueueStatus
  > | null>(null)
  const [online, setOnline] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [forceRetrying, setForceRetrying] = useState(false)

  const refresh = useCallback(() => {
    setOperations(getPendingOperations())
    setQueueStatus(getQueueStatus())
    setOnline(getIsOnline())
  }, [])

  useEffect(() => {
    refresh()
    const interval = setInterval(refresh, 5_000)
    return () => clearInterval(interval)
  }, [refresh])

  const handleSyncNow = async () => {
    setSyncing(true)
    try {
      const beforeCount = operations.length
      await processQueueNow({ force: true })
      refresh()
      const afterCount = getPendingOperations().length
      if (afterCount > 0 && afterCount >= beforeCount) {
        console.warn(
          '[SyncQueuePanel] Sync completed but operations remain:',
          afterCount
        )
      }
    } finally {
      setSyncing(false)
    }
  }

  const handleForceRetry = async () => {
    setForceRetrying(true)
    try {
      await forceRetryAllPending()
      refresh()
    } finally {
      setForceRetrying(false)
    }
  }

  const hasStuckOps =
    queueStatus != null &&
    (queueStatus.processing > 0 || queueStatus.blocked > 0)

  // Empty state
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
          <Cloud size={16} color={colors.teal} />
          <Text
            style={{ fontSize: 16, fontWeight: '600', color: colors.heading }}
          >
            Sync Queue
          </Text>
          <View
            style={{
              backgroundColor: colors.card,
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 8
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: '700', color: colors.muted }}
            >
              0
            </Text>
          </View>
        </View>
        <Text style={{ fontSize: 14, color: colors.label }}>
          Queue is empty. All operations synced.
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
        borderColor: colors.teal + '50',
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
          <Cloud size={16} color={colors.teal} />
          <Text
            style={{ fontSize: 16, fontWeight: '600', color: colors.heading }}
          >
            Sync Queue
          </Text>
          <View
            style={{
              backgroundColor: colors.teal + '40',
              paddingHorizontal: 8,
              paddingVertical: 2,
              borderRadius: 12
            }}
          >
            <Text
              style={{ fontSize: 12, fontWeight: '700', color: colors.teal }}
            >
              {operations.length}
            </Text>
          </View>
        </View>

        {/* Online/Offline indicator */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          {online ? (
            <>
              <Cloud size={12} color={colors.success} />
              <Text style={{ fontSize: 12, color: colors.success }}>
                Online
              </Text>
            </>
          ) : (
            <>
              <CloudOff size={12} color={colors.warning} />
              <Text style={{ fontSize: 12, color: colors.warning }}>
                Offline
              </Text>
            </>
          )}
        </View>
      </View>

      {/* Status summary */}
      {queueStatus != null && (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            paddingHorizontal: 16,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border + '50'
          }}
        >
          {queueStatus.pending > 0 && (
            <View
              style={{
                backgroundColor: colors.warning + '40',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: colors.warning
                }}
              >
                {queueStatus.pending} Pending
              </Text>
            </View>
          )}
          {queueStatus.processing > 0 && (
            <View
              style={{
                backgroundColor: colors.info + '40',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8
              }}
            >
              <Text
                style={{ fontSize: 10, fontWeight: '700', color: colors.info }}
              >
                {queueStatus.processing} Processing
              </Text>
            </View>
          )}
          {queueStatus.blocked > 0 && (
            <View
              style={{
                backgroundColor: colors.warning + '40',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: colors.warning
                }}
              >
                {queueStatus.blocked} Blocked
              </Text>
            </View>
          )}
          {queueStatus.failed > 0 && (
            <View
              style={{
                backgroundColor: colors.danger + '40',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 8
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: colors.danger
                }}
              >
                {queueStatus.failed} Failed
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Operations list */}
      {operations.map(op => {
        const statusStyle = STATUS_COLORS[op.status] ?? STATUS_COLORS.pending

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
                <View
                  style={{
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                    borderRadius: 4,
                    backgroundColor: statusStyle.getBg(colors)
                  }}
                >
                  <Text
                    style={{
                      fontSize: 10,
                      fontWeight: '700',
                      color: statusStyle.getText(colors)
                    }}
                  >
                    {statusStyle.label.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                {formatTimestamp(op.timestamp)}
                {op.retryCount > 0 ? ` · ${op.retryCount} retries` : ''}
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
          </View>
        )
      })}

      {/* Action buttons footer */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'flex-end',
          gap: 8,
          paddingHorizontal: 12,
          paddingVertical: 12
        }}
      >
        {hasStuckOps && (
          <TouchableOpacity
            onPress={handleForceRetry}
            disabled={forceRetrying}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              paddingHorizontal: 12,
              paddingVertical: 6,
              borderRadius: 8,
              backgroundColor: colors.warning + '30'
            }}
          >
            {forceRetrying ? (
              <ActivityIndicator size='small' color={colors.warning} />
            ) : (
              <RotateCcw size={12} color={colors.warning} />
            )}
            <Text
              style={{ fontSize: 12, fontWeight: '500', color: colors.warning }}
            >
              Force Retry All
            </Text>
          </TouchableOpacity>
        )}
        <TouchableOpacity
          onPress={handleSyncNow}
          disabled={syncing}
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
          {syncing ? (
            <ActivityIndicator size='small' color={colors.teal} />
          ) : (
            <RefreshCw size={12} color={colors.teal} />
          )}
          <Text style={{ fontSize: 12, fontWeight: '500', color: colors.teal }}>
            Sync Now
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
