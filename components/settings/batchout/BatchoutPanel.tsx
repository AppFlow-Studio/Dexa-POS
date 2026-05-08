import { getBusinessDayBounds, getCurrentBusinessDay } from '@/lib/businessDay'
import { colors } from '@/lib/theme'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { PrinterService } from '@/services/printing/PrinterService'
import type {
  BatchSummary,
  BatchSummaryStoreContext,
  BusinessDaySummary
} from '@/services/printing/templates/BatchSummaryDocumentTemplate'
import {
  getUnsettledPaymentStats,
  runSettlement,
  type SettlementOutput,
  type UnsettledStats
} from '@/services/settlementService'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import type { CastlesSettlementHostResult } from '@/types/castles'
import { CASTLES_DEFAULT_PORT } from '@/types/castles'
import { useAuth } from '@clerk/clerk-expo'
import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  CheckCircle,
  Clock,
  Printer,
  XCircle
} from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

type ScreenState = 'idle' | 'confirming' | 'settling' | 'results'

interface BatchoutPanelProps {
  /** When true, renders the today's batch log section below the action card. */
  showBatchLog?: boolean
  /** Called after the user dismisses the result view. */
  onDone?: () => void
}

interface SettlementBatchRow {
  id: string
  batchId: string | null
  status: string
  closedAt: string | null
  transactionCount: number
  grossAmount: number
  tipAmount: number
  netDeposit: number
}

export function BatchoutPanel ({ showBatchLog, onDone }: BatchoutPanelProps) {
  const supabase = useSupabaseClient()
  const { userId } = useAuth()
  const selectedStation = useStoreSettingsStore(s => s.selectedStation)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)

  const [state, setState] = useState<ScreenState>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [unsettledStats, setUnsettledStats] = useState<UnsettledStats | null>(
    null
  )
  const [statsLoading, setStatsLoading] = useState(true)
  const [result, setResult] = useState<SettlementOutput | null>(null)

  const terminal = selectedStation?.payment_terminal
  const isCastles = terminal?.terminal_type === 'castles'
  const terminalHost = terminal?.ip_address
  const terminalPort = terminal?.port ?? CASTLES_DEFAULT_PORT

  const bdConfig = {
    timezone: selectedStore?.timezone || 'UTC',
    rolloverHour: selectedStore?.business_day_start_hour ?? 0
  }
  const businessDay = getCurrentBusinessDay(bdConfig)
  const bounds = getBusinessDayBounds(businessDay, bdConfig)
  const locationId = selectedStore?.id || ''

  const {
    data: batches,
    isLoading: batchesLoading,
    refetch: refetchBatches
  } = useQuery({
    queryKey: ['batchout-batches', locationId, businessDay],
    enabled: Boolean(locationId) && Boolean(showBatchLog),
    staleTime: 30_000,
    queryFn: async (): Promise<SettlementBatchRow[]> => {
      const { data, error } = await supabase
        .from('settlement_batches')
        .select(
          'id, batch_id, status, closed_at, transaction_count, gross_amount, tip_amount, net_deposit'
        )
        .eq('location_id', locationId)
        .gte('created_at', bounds.startUtc)
        .lt('created_at', bounds.endUtc)
        .order('created_at', { ascending: false })
      if (error) throw error
      return (data || []).map((b: any) => ({
        id: b.id,
        batchId: b.batch_id,
        status: b.status,
        closedAt: b.closed_at,
        transactionCount: Number(b.transaction_count) || 0,
        grossAmount: Number(b.gross_amount) || 0,
        tipAmount: Number(b.tip_amount) || 0,
        netDeposit: Number(b.net_deposit) || 0
      }))
    }
  })

  const loadStats = useCallback(() => {
    if (!terminal?.id || !selectedStore?.id || !selectedStore?.merchant_id)
      return
    setStatsLoading(true)
    getUnsettledPaymentStats({
      supabase,
      merchantId: selectedStore.merchant_id,
      locationId: selectedStore.id,
      terminalId: terminal.id
    })
      .then(setUnsettledStats)
      .finally(() => setStatsLoading(false))
  }, [terminal?.id, selectedStore?.id, selectedStore?.merchant_id, supabase])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  const storeCtx = useCallback<() => BatchSummaryStoreContext>(() => {
    if (!selectedStore) return {}
    const addr = [
      selectedStore.address_line1,
      selectedStore.address_line2,
      `${selectedStore.city}, ${selectedStore.state} ${selectedStore.postal_code}`
    ]
      .filter(Boolean)
      .join(', ')
    return { storeName: selectedStore.name, storeAddress: addr }
  }, [selectedStore])

  const printBatch = useCallback(
    async (settlementBatchId: string) => {
      if (!locationId) return
      try {
        const { data, error } = await supabase.rpc('get_batch_summary_v1', {
          p_settlement_batch_id: settlementBatchId
        })
        if (error) throw error
        if (!data) throw new Error('Empty batch summary')
        await PrinterService.printBatchSummary(
          data as unknown as BatchSummary,
          locationId,
          storeCtx()
        )
      } catch (e) {
        console.warn('[BatchoutPanel] printBatch failed:', e)
        Alert.alert(
          'Print Failed',
          e instanceof Error ? e.message : 'Could not print batch summary'
        )
      }
    },
    [supabase, locationId, storeCtx]
  )

  const printDay = useCallback(async () => {
    if (!locationId) return
    try {
      // Closing report — location-wide totals. Scoping by current
      // station's terminal_id would silently drop cash payments and any
      // card payment whose row didn't get terminal_id stamped (most of
      // them today, since terminal_id is only populated by the Castles
      // capture path). A store-level closing report is also what the
      // cashier expects for end-of-day reconciliation.
      const { data, error } = await supabase.rpc(
        'get_business_day_activity_summary_v1' as any,
        {
          p_location_id: locationId,
          p_business_date: businessDay,
          p_terminal_id: null
        } as any
      )
      if (error) throw error
      if (!data) throw new Error('Empty business-day summary')
      await PrinterService.printBusinessDaySummary(
        data as unknown as BusinessDaySummary,
        locationId,
        storeCtx()
      )
    } catch (e) {
      console.warn('[BatchoutPanel] printDay failed:', e)
      Alert.alert(
        'Print Failed',
        e instanceof Error ? e.message : 'Could not print day summary'
      )
    }
  }, [supabase, locationId, businessDay, storeCtx])

  const handleSettle = useCallback(async () => {
    if (
      !terminal?.id ||
      !terminalHost ||
      !selectedStore?.id ||
      !selectedStore?.merchant_id
    )
      return

    setState('settling')
    setStatusMessage('Starting batchout...')

    try {
      const output = await runSettlement({
        terminalId: terminal.id,
        merchantId: selectedStore.merchant_id,
        initiatedBy: userId ?? 'unknown',
        terminalHost,
        terminalPort,
        locationId: selectedStore.id,
        supabase,
        onStatus: setStatusMessage
      })

      setResult(output)
      setState('results')
      refetchBatches()

      // Auto-print: only after finalize_castles_settlement succeeds, since
      // order_payments.settlement_batch_id is backfilled at that step.
      if ((output.success || output.partialSuccess) && output.batchUuid) {
        printBatch(output.batchUuid).catch(() => {})
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      setResult({
        success: false,
        partialSuccess: false,
        shouldRetry: false,
        requiresSupport: false,
        hosts: [],
        error: message
      })
      setState('results')
    }
  }, [
    terminal,
    terminalHost,
    terminalPort,
    selectedStore,
    supabase,
    userId,
    refetchBatches,
    printBatch
  ])

  const handleConfirm = useCallback(() => {
    Alert.alert(
      'Confirm Batchout',
      `This will close the current batch on the terminal and mark ${
        unsettledStats?.count ?? 0
      } payment(s) as settled. This cannot be undone.\n\nProceed?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setState('idle') },
        { text: 'Batch Out', style: 'destructive', onPress: handleSettle }
      ]
    )
    setState('confirming')
  }, [unsettledStats, handleSettle])

  const handleResultDone = useCallback(() => {
    setResult(null)
    setState('idle')
    loadStats()
    onDone?.()
  }, [loadStats, onDone])

  const handleRetry = useCallback(() => {
    setResult(null)
    setState('idle')
    loadStats()
  }, [loadStats])

  return (
    <View style={{ gap: 16 }}>
      {/* Terminal info */}
      <View
        style={{
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: 16
        }}
      >
        <Text
          style={{ fontSize: 16, fontWeight: '700', color: colors.heading }}
        >
          {terminal?.terminal_name || 'Payment Terminal'}
        </Text>
        <Text style={{ marginTop: 4, fontSize: 13, color: colors.muted }}>
          {isCastles
            ? `Castles @ ${terminalHost}:${terminalPort}`
            : terminal?.terminal_type ?? 'No terminal configured'}
        </Text>
      </View>

      {!isCastles ? (
        <View
          style={{
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.warning + '60',
            backgroundColor: colors.warning + '15',
            padding: 14
          }}
        >
          <Text style={{ fontSize: 13, color: colors.warning }}>
            Batchout is currently supported for Castles terminals only.
          </Text>
        </View>
      ) : state === 'idle' || state === 'confirming' ? (
        <IdleView
          stats={unsettledStats}
          statsLoading={statsLoading}
          onSettle={handleConfirm}
          onPrintDay={printDay}
          disabled={state === 'confirming' || !terminalHost}
        />
      ) : state === 'settling' ? (
        <SettlingView statusMessage={statusMessage} />
      ) : state === 'results' && result ? (
        <ResultsView
          result={result}
          onDone={handleResultDone}
          onRetry={handleRetry}
        />
      ) : null}

      {showBatchLog ? (
        <BatchLog
          batches={batches}
          loading={batchesLoading}
          businessDay={businessDay}
          onPrintBatch={printBatch}
        />
      ) : null}
    </View>
  )
}

// ── Idle View ──────────────────────────────────────────────────

function IdleView ({
  stats,
  statsLoading,
  onSettle,
  onPrintDay,
  disabled
}: {
  stats: UnsettledStats | null
  statsLoading: boolean
  onSettle: () => void
  onPrintDay: () => void
  disabled: boolean
}) {
  const isSettleDisabled = disabled || (stats?.count ?? 0) === 0

  return (
    <View style={{ gap: 14 }}>
      {stats?.hasStuckBatch ? (
        <Banner
          tone='warning'
          title='Previous Batchout Incomplete'
          body={`A prior attempt is in a "${stats.stuckBatchStatus}" state. Tapping Batch Out will start a new attempt — the previous batch will be resolved automatically.`}
        />
      ) : null}

      {(stats?.daySpan ?? 0) > 1 ? (
        <Banner
          tone='info'
          title={`${stats!.daySpan} Days of Unsettled Transactions`}
          body={`Oldest: ${stats!.oldestDate} · Newest: ${stats!.newestDate}`}
        />
      ) : null}

      <Card>
        <Text
          style={{ fontSize: 14, fontWeight: '600', color: colors.heading }}
        >
          Unsettled Payments
        </Text>
        {statsLoading ? (
          <ActivityIndicator
            style={{ marginTop: 12 }}
            color={colors.teal}
          />
        ) : stats && stats.count > 0 ? (
          <View style={{ marginTop: 12, gap: 8 }}>
            <StatRow label='Payments in batch' value={String(stats.count)} />
            <StatRow
              label='Sales'
              value={`$${stats.grossAmount.toFixed(2)}`}
            />
            {stats.tipAmount > 0 ? (
              <StatRow
                label='Tips'
                value={`$${stats.tipAmount.toFixed(2)}`}
              />
            ) : null}
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: 8,
                marginTop: 4
              }}
            >
              <StatRow
                label='Total'
                value={`$${stats.totalAmount.toFixed(2)}`}
                emphasize
              />
            </View>
          </View>
        ) : (
          <Text
            style={{ marginTop: 8, fontSize: 13, color: colors.muted }}
          >
            No unsettled payments found for this terminal.
          </Text>
        )}
      </Card>

      <Card>
        <Text style={{ fontSize: 12, color: colors.muted, lineHeight: 17 }}>
          Batchout closes the terminal's open batch and sends all captured
          transactions to their acquiring banks. After batchout, tips cannot be
          adjusted on settled payments. Refunds remain possible via the refund
          flow.
        </Text>
      </Card>

      <TouchableOpacity
        onPress={onSettle}
        disabled={isSettleDisabled}
        style={{
          borderRadius: 14,
          paddingVertical: 16,
          alignItems: 'center',
          backgroundColor: isSettleDisabled ? colors.inset : colors.teal,
          opacity: isSettleDisabled ? 0.6 : 1
        }}
      >
        <Text
          style={{
            fontSize: 16,
            fontWeight: '700',
            color: isSettleDisabled ? colors.muted : colors.onSolid
          }}
        >
          Batch Out Terminal
        </Text>
      </TouchableOpacity>

      <TouchableOpacity
        onPress={onPrintDay}
        style={{
          borderRadius: 14,
          paddingVertical: 14,
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: 8,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card
        }}
      >
        <Printer size={16} color={colors.label} />
        <Text style={{ fontSize: 14, fontWeight: '600', color: colors.label }}>
          Print Today's Summary
        </Text>
      </TouchableOpacity>
    </View>
  )
}

// ── Settling View ──────────────────────────────────────────────

function SettlingView ({ statusMessage }: { statusMessage: string }) {
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        paddingVertical: 60
      }}
    >
      <ActivityIndicator size='large' color={colors.teal} />
      <Text
        style={{ fontSize: 16, fontWeight: '600', color: colors.heading }}
      >
        Batchout in Progress
      </Text>
      <Text
        style={{
          fontSize: 13,
          color: colors.muted,
          textAlign: 'center',
          paddingHorizontal: 16
        }}
      >
        {statusMessage}
      </Text>
      <Text
        style={{
          fontSize: 12,
          color: colors.muted,
          textAlign: 'center',
          paddingHorizontal: 32,
          opacity: 0.7,
          marginTop: 8
        }}
      >
        Do not close this screen or disconnect the terminal. This may take
        several minutes.
      </Text>
    </View>
  )
}

// ── Results View ───────────────────────────────────────────────

function ResultsView ({
  result,
  onDone,
  onRetry
}: {
  result: SettlementOutput
  onDone: () => void
  onRetry: () => void
}) {
  const overallIcon = result.success ? (
    <CheckCircle color={colors.success} size={32} />
  ) : result.partialSuccess ? (
    <AlertTriangle color={colors.warning} size={32} />
  ) : (
    <XCircle color={colors.danger} size={32} />
  )

  const overallLabel = result.success
    ? 'Batchout Complete'
    : result.partialSuccess
    ? 'Partial Batchout'
    : 'Batchout Failed'

  const overallColor = result.success
    ? colors.success
    : result.partialSuccess
    ? colors.warning
    : colors.danger

  return (
    <View style={{ gap: 14 }}>
      <View style={{ alignItems: 'center', gap: 8, paddingVertical: 12 }}>
        {overallIcon}
        <Text style={{ fontSize: 20, fontWeight: '700', color: overallColor }}>
          {overallLabel}
        </Text>
        {result.error ? (
          <Text
            style={{
              fontSize: 13,
              color: colors.danger,
              textAlign: 'center',
              paddingHorizontal: 16
            }}
          >
            {result.error}
          </Text>
        ) : null}
      </View>

      {(result.success || result.partialSuccess) && !result.dbWriteFailed ? (
        <Card>
          {result.paymentsUpdated != null ? (
            <StatRow
              label='Payments marked settled'
              value={String(result.paymentsUpdated)}
            />
          ) : null}
          {result.batchUuid ? (
            <View
              style={{
                marginTop: 8,
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <Text style={{ fontSize: 13, color: colors.label }}>
                Batch ID
              </Text>
              <Text
                style={{
                  fontSize: 11,
                  color: colors.muted,
                  flexShrink: 1,
                  marginLeft: 12
                }}
                numberOfLines={1}
              >
                {result.batchUuid}
              </Text>
            </View>
          ) : null}
        </Card>
      ) : null}

      {result.dbWriteFailed ? (
        <Banner
          tone='warning'
          body='Batchout succeeded on terminal but database update failed. Payments were not marked as settled in the system.'
        />
      ) : null}

      {result.shouldRetry ? (
        <Banner
          tone='warning'
          title='Retry Required (E000002A)'
          body='The terminal requested a retry with a new transaction ID. Tap Retry to attempt batchout again.'
        />
      ) : null}

      {result.requiresSupport ? (
        <Banner
          tone='warning'
          title='Partial Batchout'
          body={[
            (result.settledAcquirers?.length ?? 0) > 0
              ? `Settled: ${result.settledAcquirers!.join(', ')}`
              : '',
            (result.failedAcquirers?.length ?? 0) > 0
              ? `Failed: ${result
                  .failedAcquirers!.map(f => f.acquirer)
                  .join(', ')} — contact your payment processor.`
              : ''
          ]
            .filter(Boolean)
            .join('\n')}
        />
      ) : null}

      {result.hosts.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text
            style={{ fontSize: 13, fontWeight: '600', color: colors.label }}
          >
            Host Breakdown
          </Text>
          {result.hosts.map((host, idx) => (
            <HostCard key={idx} host={host} />
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
        {(!result.success && !result.partialSuccess) ||
        result.dbWriteFailed ||
        result.shouldRetry ? (
          <TouchableOpacity
            onPress={onRetry}
            style={{
              flex: 1,
              borderRadius: 14,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingVertical: 14,
              alignItems: 'center'
            }}
          >
            <Text
              style={{ fontSize: 15, fontWeight: '700', color: colors.label }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onDone}
          style={{
            flex: 1,
            borderRadius: 14,
            backgroundColor: colors.teal,
            paddingVertical: 14,
            alignItems: 'center'
          }}
        >
          <Text
            style={{ fontSize: 15, fontWeight: '700', color: colors.onSolid }}
          >
            Done
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ── Host Card ──────────────────────────────────────────────────

function HostCard ({ host }: { host: CastlesSettlementHostResult }) {
  const icon = host.success ? (
    <CheckCircle color={colors.success} size={16} />
  ) : (
    <XCircle color={colors.danger} size={16} />
  )

  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: 12,
        gap: 8
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        {icon}
        <Text
          style={{
            fontSize: 13,
            fontWeight: '600',
            color: colors.heading,
            flex: 1
          }}
        >
          {host.acquirerName}
        </Text>
        {host.batchNumber ? (
          <Text style={{ fontSize: 11, color: colors.muted }}>
            Batch #{host.batchNumber}
          </Text>
        ) : null}
      </View>

      {host.hostMessage ? (
        <Text style={{ fontSize: 11, color: colors.muted }}>
          {host.hostMessage}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>Sales</Text>
          <Text style={{ fontSize: 13, color: colors.label }}>
            {host.saleTotalCount} / ${host.saleTotalAmount.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>Refunds</Text>
          <Text style={{ fontSize: 13, color: colors.label }}>
            {host.refundTotalCount} / ${host.refundTotalAmount.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 11, color: colors.muted }}>Net</Text>
          <Text
            style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}
          >
            ${host.settleTotalAmount.toFixed(2)}
          </Text>
        </View>
      </View>
    </View>
  )
}

// ── Batch Log ──────────────────────────────────────────────────

function BatchLog ({
  batches,
  loading,
  businessDay,
  onPrintBatch
}: {
  batches: SettlementBatchRow[] | undefined
  loading: boolean
  businessDay: string
  onPrintBatch: (settlementBatchId: string) => void
}) {
  const list = batches || []

  return (
    <View style={{ gap: 10, marginTop: 8 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Text
          style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}
        >
          Today's Batches
        </Text>
        <Text style={{ fontSize: 11, color: colors.muted }}>
          Business day {businessDay}
        </Text>
      </View>

      {loading ? (
        <Card>
          <ActivityIndicator color={colors.teal} />
        </Card>
      ) : list.length === 0 ? (
        <Card>
          <Text style={{ fontSize: 13, color: colors.muted }}>
            No batches recorded for this business day yet.
          </Text>
        </Card>
      ) : (
        list.map(b => (
          <BatchRow key={b.id} batch={b} onPrint={() => onPrintBatch(b.id)} />
        ))
      )}
    </View>
  )
}

function BatchRow ({
  batch,
  onPrint
}: {
  batch: SettlementBatchRow
  onPrint: () => void
}) {
  const isSettled = batch.status === 'settled'
  const isFailed =
    batch.status === 'failed' ||
    batch.status === 'error' ||
    batch.status === 'reversed'
  const tone = isSettled
    ? colors.success
    : isFailed
    ? colors.danger
    : colors.warning

  const closedDisplay = batch.closedAt
    ? new Date(batch.closedAt).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      })
    : '—'

  return (
    <View
      style={{
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: 12,
        gap: 10
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              width: 26,
              height: 26,
              borderRadius: 8,
              backgroundColor: tone + '20',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isSettled ? (
              <CheckCircle size={14} color={tone} />
            ) : isFailed ? (
              <XCircle size={14} color={tone} />
            ) : (
              <Clock size={14} color={tone} />
            )}
          </View>
          <View>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '600',
                color: colors.heading
              }}
              numberOfLines={1}
            >
              Batch {batch.batchId || batch.id.slice(0, 8)}
            </Text>
            <Text style={{ fontSize: 11, color: colors.muted }}>
              Closed {closedDisplay}
            </Text>
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View
            style={{
              paddingHorizontal: 8,
              paddingVertical: 3,
              borderRadius: 6,
              backgroundColor: tone + '20'
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                color: tone,
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}
            >
              {batch.status}
            </Text>
          </View>
          <TouchableOpacity
            onPress={onPrint}
            hitSlop={8}
            accessibilityLabel='Print batch summary'
            style={{
              padding: 6,
              borderRadius: 6,
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Printer size={14} color={colors.label} />
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 12 }}>
        <BatchStat label='Txns' value={String(batch.transactionCount)} />
        <BatchStat
          label='Gross'
          value={`$${batch.grossAmount.toFixed(2)}`}
        />
        <BatchStat label='Tips' value={`$${batch.tipAmount.toFixed(2)}`} />
        <BatchStat
          label='Net'
          value={`$${batch.netDeposit.toFixed(2)}`}
          emphasize
        />
      </View>
    </View>
  )
}

function BatchStat ({
  label,
  value,
  emphasize
}: {
  label: string
  value: string
  emphasize?: boolean
}) {
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 10, color: colors.muted }}>{label}</Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: emphasize ? '700' : '500',
          color: emphasize ? colors.heading : colors.label
        }}
      >
        {value}
      </Text>
    </View>
  )
}

// ── Shared atoms ───────────────────────────────────────────────

function Card ({ children }: { children: React.ReactNode }) {
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: 14
      }}
    >
      {children}
    </View>
  )
}

function StatRow ({
  label,
  value,
  emphasize
}: {
  label: string
  value: string
  emphasize?: boolean
}) {
  return (
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
          color: emphasize ? colors.heading : colors.label,
          fontWeight: emphasize ? '600' : '400'
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: 13,
          fontWeight: emphasize ? '700' : '600',
          color: colors.heading
        }}
      >
        {value}
      </Text>
    </View>
  )
}

function Banner ({
  tone,
  title,
  body
}: {
  tone: 'warning' | 'info'
  title?: string
  body: string
}) {
  const accent = tone === 'warning' ? colors.warning : colors.info
  return (
    <View
      style={{
        borderRadius: 14,
        borderWidth: 1,
        borderColor: accent + '60',
        backgroundColor: accent + '15',
        padding: 14
      }}
    >
      {title ? (
        <Text
          style={{
            fontSize: 13,
            fontWeight: '700',
            color: accent,
            marginBottom: 4
          }}
        >
          {title}
        </Text>
      ) : null}
      <Text style={{ fontSize: 12, color: accent, lineHeight: 17 }}>
        {body}
      </Text>
    </View>
  )
}
