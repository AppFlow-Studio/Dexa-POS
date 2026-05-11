import { colors } from '@/lib/theme'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import {
  discardDeadLetterOperation,
  retryDeadLetterOperation,
  type OfflineOperation
} from '@/services/offlineSyncService'
import { useOrderStore } from '@/stores/useOrderStore'
import { useOrder } from '@/stores/selectors/orderSelectors'
import { useAuth } from '@clerk/clerk-expo'
import { CheckCircle, AlertTriangle } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ScrollView
} from 'react-native'

interface ProbeResult {
  found: boolean
  payment_id?: string
  status?: string
  amount?: string | number
  tip_amount?: string | number
  total_amount?: string | number
  refunded_amount?: string | number
  captured_at?: string
  settlement_batch_id?: string
  batch_id?: string
  acquirer?: string
  batch_number?: string
  authorization_code?: string
}

type Action = 'discarded' | 'retried' | 'force_resynced'

function fmtMoney (n: string | number | null | undefined): string {
  if (n == null) return '—'
  const v = typeof n === 'string' ? parseFloat(n) : n
  if (!Number.isFinite(v)) return '—'
  return `$${v.toFixed(2)}`
}

function fmtTime (iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleTimeString([], {
      hour: 'numeric',
      minute: '2-digit'
    })
  } catch {
    return '—'
  }
}

export function FailedSyncResolutionModal ({
  visible,
  op,
  onClose,
  onResolved
}: {
  visible: boolean
  op: OfflineOperation | null
  onClose: () => void
  onResolved: () => void
}): React.ReactElement | null {
  const supabase = useSupabaseClient()
  const { userId } = useAuth()
  const syncOrderFromDatabase = useOrderStore(s => s.syncOrderFromDatabase)
  const localOrder = useOrder(op?.localOrderId)

  const [probing, setProbing] = useState(false)
  const [probe, setProbe] = useState<ProbeResult | null>(null)
  const [probeError, setProbeError] = useState<string | null>(null)
  const [syncing, setSyncing] = useState(false)
  const [reason, setReason] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  const [actionInFlight, setActionInFlight] = useState<Action | null>(null)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

  // Reset state when a different op is opened.
  useEffect(() => {
    if (!visible) return
    setProbe(null)
    setProbeError(null)
    setReason('')
    setReasonError(null)
    setActionInFlight(null)
    setErrorMsg(null)
  }, [visible, op?.id])

  // On open: refresh remote order state then probe idempotency.
  useEffect(() => {
    if (!visible || !op) return
    let cancelled = false
    ;(async () => {
      // Refresh remote order — only meaningful when we have a db_order_id.
      const dbOrderId = localOrder?.db_order_id
      if (dbOrderId) {
        setSyncing(true)
        try {
          await syncOrderFromDatabase(dbOrderId)
        } catch (e) {
          // Non-fatal; continue to probe.
        } finally {
          if (!cancelled) setSyncing(false)
        }
      }

      // Probe idempotency_key against order_payments.
      const idemKey = op.idempotencyKey
      if (!idemKey) {
        if (!cancelled) {
          setProbe({ found: false })
        }
        return
      }
      if (!cancelled) setProbing(true)
      try {
        const { data, error } = await supabase.rpc(
          'probe_payment_idempotency',
          { p_idempotency_key: idemKey, p_order_id: dbOrderId ?? null }
        )
        if (cancelled) return
        if (error) {
          setProbeError(error.message)
          setProbe({ found: false })
        } else {
          setProbe((data as ProbeResult) ?? { found: false })
        }
      } catch (e: any) {
        if (!cancelled) {
          setProbeError(e?.message ?? 'Probe failed')
          setProbe({ found: false })
        }
      } finally {
        if (!cancelled) setProbing(false)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [visible, op?.id, localOrder?.db_order_id, supabase, syncOrderFromDatabase])

  const validateReason = useCallback((): boolean => {
    if (reason.trim().length < 10) {
      setReasonError('Reason must be at least 10 characters (audit trail).')
      return false
    }
    setReasonError(null)
    return true
  }, [reason])

  const runResolution = useCallback(
    async (action: Action) => {
      if (!op) return
      if (!userId) {
        setErrorMsg('Sign in required for manual resolution.')
        return
      }
      if (!validateReason()) return
      setActionInFlight(action)
      setErrorMsg(null)
      try {
        // 1) Write audit row first — if this fails, the op stays put so
        // the operator can retry.
        const { error: auditError } = await supabase.rpc(
          'record_manual_sync_resolution',
          {
            p_op_type: op.type,
            p_resolution: action,
            p_reason: reason.trim(),
            p_staff_id: userId,
            p_order_id: localOrder?.db_order_id ?? null,
            p_payment_id: probe?.payment_id ?? null,
            p_idempotency_key: op.idempotencyKey ?? null,
            p_metadata: {
              local_order_id: op.localOrderId,
              retry_count: op.retryCount,
              last_error: op.lastError ?? null,
              probe_found: probe?.found ?? false
            }
          }
        )
        if (auditError) {
          setErrorMsg(`Audit write failed: ${auditError.message}`)
          return
        }

        // 2) Apply the action.
        if (action === 'retried') {
          await retryDeadLetterOperation(op.id)
        } else if (action === 'force_resynced') {
          if (localOrder?.db_order_id) {
            await syncOrderFromDatabase(localOrder.db_order_id)
          }
          discardDeadLetterOperation(op.id)
        } else {
          // discarded
          discardDeadLetterOperation(op.id)
        }

        onResolved()
        onClose()
      } catch (e: any) {
        setErrorMsg(e?.message ?? 'Resolution failed')
      } finally {
        setActionInFlight(null)
      }
    },
    [
      op,
      userId,
      validateReason,
      supabase,
      reason,
      localOrder?.db_order_id,
      probe,
      syncOrderFromDatabase,
      onResolved,
      onClose
    ]
  )

  if (!op) return null

  const recommendedDiscard = probe?.found === true
  const localPaymentsTotal = (localOrder?.payments ?? []).reduce(
    (acc, p) => acc + (Number(p.amount ?? 0) || 0),
    0
  )
  const localPaymentCount = (localOrder?.payments ?? []).length

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.45)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 20
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: 640,
            maxHeight: '90%',
            backgroundColor: colors.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden'
          }}
        >
          <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}
            >
              <View>
                <Text
                  style={{
                    fontSize: 16,
                    fontWeight: '700',
                    color: colors.heading
                  }}
                >
                  Manual Resolution
                </Text>
                <Text style={{ fontSize: 12, color: colors.muted, marginTop: 2 }}>
                  {op.type} · {op.retryCount} retries
                </Text>
              </View>
              <TouchableOpacity onPress={onClose} hitSlop={8}>
                <Text style={{ fontSize: 14, color: colors.label }}>Close</Text>
              </TouchableOpacity>
            </View>

            {/* Probe / loading banner */}
            {(probing || syncing) && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: colors.panel
                }}
              >
                <ActivityIndicator size='small' />
                <Text style={{ fontSize: 12, color: colors.label }}>
                  {syncing
                    ? 'Refreshing remote order…'
                    : 'Checking server for this payment…'}
                </Text>
              </View>
            )}

            {probe?.found && (
              <View
                style={{
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: colors.success + '20',
                  borderWidth: 1,
                  borderColor: colors.success + '60'
                }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <CheckCircle size={16} color={colors.success} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: colors.success
                    }}
                  >
                    Already applied on server
                  </Text>
                </View>
                <Text
                  style={{ fontSize: 12, color: colors.heading, marginTop: 4 }}
                >
                  Payment {fmtMoney(probe.total_amount)} · captured{' '}
                  {fmtTime(probe.captured_at)}
                  {probe.acquirer && probe.batch_number
                    ? ` · Batch ${probe.acquirer}-${probe.batch_number}`
                    : ''}
                  {probe.authorization_code
                    ? ` · Auth ${probe.authorization_code}`
                    : ''}
                </Text>
                <Text
                  style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}
                >
                  Status: {probe.status ?? '—'}
                </Text>
              </View>
            )}

            {probe && !probe.found && !probing && (
              <View
                style={{
                  padding: 12,
                  borderRadius: 8,
                  backgroundColor: colors.warning + '20',
                  borderWidth: 1,
                  borderColor: colors.warning + '60'
                }}
              >
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}
                >
                  <AlertTriangle size={16} color={colors.warning} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: colors.warning
                    }}
                  >
                    Not on server
                  </Text>
                </View>
                <Text
                  style={{ fontSize: 12, color: colors.heading, marginTop: 4 }}
                >
                  No payment found with this idempotency key. Retrying will
                  attempt to capture it again; discarding will drop the queued
                  attempt locally.
                </Text>
              </View>
            )}

            {probeError && (
              <Text style={{ fontSize: 11, color: colors.danger }}>
                Probe error: {probeError}
              </Text>
            )}

            {/* Side-by-side compare */}
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                marginTop: 4
              }}
            >
              <View
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.panel
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: colors.label,
                    letterSpacing: 0.5,
                    marginBottom: 4
                  }}
                >
                  LOCAL
                </Text>
                <Text style={{ fontSize: 12, color: colors.heading }}>
                  Total: {fmtMoney(localOrder?.total_amount)}
                </Text>
                <Text style={{ fontSize: 12, color: colors.heading }}>
                  Payments: {localPaymentCount} ({fmtMoney(localPaymentsTotal)})
                </Text>
                <Text style={{ fontSize: 12, color: colors.heading }}>
                  Status: {localOrder?.paid_status ?? '—'}
                </Text>
                {op.lastError?.message && (
                  <Text
                    style={{ fontSize: 11, color: colors.danger, marginTop: 6 }}
                    numberOfLines={3}
                  >
                    Last error: {op.lastError.message}
                  </Text>
                )}
              </View>

              <View
                style={{
                  flex: 1,
                  padding: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.panel
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '700',
                    color: colors.label,
                    letterSpacing: 0.5,
                    marginBottom: 4
                  }}
                >
                  REMOTE
                </Text>
                {probe?.found ? (
                  <>
                    <Text style={{ fontSize: 12, color: colors.heading }}>
                      Payment: {fmtMoney(probe.total_amount)}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.heading }}>
                      Captured: {fmtTime(probe.captured_at)}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.heading }}>
                      Status: {probe.status ?? '—'}
                    </Text>
                  </>
                ) : (
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    No matching payment on server.
                  </Text>
                )}
              </View>
            </View>

            {/* Reason */}
            <View style={{ marginTop: 6 }}>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: '600',
                  color: colors.label,
                  marginBottom: 4
                }}
              >
                Reason (required, ≥10 characters)
              </Text>
              <TextInput
                value={reason}
                onChangeText={t => {
                  setReason(t)
                  if (reasonError) setReasonError(null)
                }}
                placeholder='e.g. terminal succeeded but app froze, verified by manager'
                placeholderTextColor={colors.muted}
                multiline
                editable={actionInFlight === null}
                style={{
                  borderWidth: 1,
                  borderColor: reasonError ? colors.danger : colors.border,
                  borderRadius: 8,
                  padding: 10,
                  minHeight: 60,
                  fontSize: 13,
                  color: colors.heading,
                  backgroundColor: colors.panel
                }}
              />
              {reasonError && (
                <Text
                  style={{ fontSize: 11, color: colors.danger, marginTop: 4 }}
                >
                  {reasonError}
                </Text>
              )}
            </View>

            {errorMsg && (
              <Text style={{ fontSize: 12, color: colors.danger }}>
                {errorMsg}
              </Text>
            )}

            {/* Action buttons */}
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                marginTop: 6,
                justifyContent: 'flex-end',
                flexWrap: 'wrap'
              }}
            >
              <TouchableOpacity
                onPress={() => runResolution('force_resynced')}
                disabled={actionInFlight !== null}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {actionInFlight === 'force_resynced' && (
                  <ActivityIndicator size='small' />
                )}
                <Text style={{ fontSize: 13, color: colors.label }}>
                  Force re-sync
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => runResolution('retried')}
                disabled={actionInFlight !== null}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: colors.teal + '30',
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {actionInFlight === 'retried' && (
                  <ActivityIndicator size='small' color={colors.teal} />
                )}
                <Text
                  style={{ fontSize: 13, color: colors.teal, fontWeight: '600' }}
                >
                  Retry now
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => runResolution('discarded')}
                disabled={actionInFlight !== null}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 10,
                  borderRadius: 8,
                  backgroundColor: recommendedDiscard
                    ? colors.success
                    : colors.danger,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                {actionInFlight === 'discarded' && (
                  <ActivityIndicator size='small' color='#fff' />
                )}
                <Text
                  style={{ fontSize: 13, color: '#fff', fontWeight: '700' }}
                >
                  Mark Resolved
                </Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  )
}
