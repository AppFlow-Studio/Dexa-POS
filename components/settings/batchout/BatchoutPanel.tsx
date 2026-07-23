import { getCurrentBusinessDay } from '@/lib/businessDay'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { PrinterService } from '@/services/printing/PrinterService'
import type {
  BatchSummary,
  BatchSummaryStoreContext,
  BusinessDaySummary
} from '@/services/printing/templates/BatchSummaryDocumentTemplate'
import {
  listPendingFinalizes,
  retryPendingFinalize,
  type PendingFinalizeEntry
} from '@/services/pendingFinalize'
import {
  getUnsettledPaymentStats,
  manualMarkBatchSettled,
  runSettlement,
  type SettlementOutput,
  type UnsettledStats
} from '@/services/settlementService'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import type { CastlesSettlementHostResult } from '@/types/castles'
import { CASTLES_DEFAULT_PORT } from '@/types/castles'
import { getSharedValorService } from '@/services/terminals/valor-service'
import { VALOR_DEFAULT_PORT, VALOR_SETTLEMENT_TIMEOUT_MS } from '@/types/valor'
import { useAuth } from '@clerk/clerk-expo'
import { useQuery } from '@tanstack/react-query'
import { useFocusEffect } from 'expo-router'
import {
  AlertTriangle,
  CheckCircle,
  ChevronDown,
  ChevronUp,
  Clock,
  Printer,
  RefreshCw,
  XCircle
} from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Modal,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

type ScreenState = 'idle' | 'confirming' | 'settling' | 'results'

/**
 * TEMP (Valor batch-out Wave 0): shows an on-terminal settlement-response capture
 * button for Valor terminals so we can lock the finalize field mapping from a real
 * VP550 response. Remove once the settlement contract is documented and Wave 3b ships.
 */
const VALOR_SETTLEMENT_CAPTURE = true

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
  openedAt: string | null
  businessDate: string | null
  paymentTerminalId: string | null
  terminalName: string | null
  terminalSerial: string | null
  transactionCount: number
  grossAmount: number
  tipAmount: number
  netDeposit: number
  acquirer: string | null
  batchNumber: string | null
  isClosedToday: boolean
}

interface BatchPaymentRow {
  id: string
  order_number: string | null
  display_number: string | null
  captured_at: string | null
  payment_method: string | null
  card_type: string | null
  card_last_four: string | null
  amount: number | string | null
  tip_amount: number | string | null
  total_amount: number | string | null
  refunded_amount: number | string | null
  status: string | null
  is_settled: boolean | null
  is_returned: boolean | null
  authorization_code: string | null
  transaction_id: string | null
  rrn: string | null
  batch_number: string | null
  acquirer: string | null
}

export function BatchoutPanel ({ showBatchLog, onDone }: BatchoutPanelProps) {
  const supabase = useSupabaseClient()
  const { userId } = useAuth()
  const selectedStation = useStoreSettingsStore(s => s.selectedStation)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  const [state, setState] = useState<ScreenState>('idle')
  const [statusMessage, setStatusMessage] = useState('')
  const [unsettledStats, setUnsettledStats] = useState<UnsettledStats | null>(
    null
  )
  const [statsLoading, setStatsLoading] = useState(true)
  const [result, setResult] = useState<SettlementOutput | null>(null)

  const terminal = selectedStation?.payment_terminal
  const isCastles = terminal?.terminal_type === 'castles'
  const isValor = terminal?.terminal_type === 'valor'
  const isUsbTerminal = terminal?.connection_type === 'usb'
  const terminalHost = terminal?.ip_address
  const terminalPort = terminal?.port ?? CASTLES_DEFAULT_PORT

  // TEMP (Valor Wave 0): capture the real on-terminal settlement response so we can
  // lock the finalize field mapping. Fires a REAL batch close; result shown on-screen.
  const [captureOutput, setCaptureOutput] = useState<string | null>(null)
  const [capturing, setCapturing] = useState(false)
  const runValorCapture = useCallback(async () => {
    if (!terminal) return
    setCapturing(true)
    setCaptureOutput('Connecting to terminal…')
    try {
      const valor = getSharedValorService()
      const isUsb = terminal.connection_type === 'usb'
      await valor.connect({
        connectionType: isUsb ? 'usb' : 'local_socket',
        host: isUsb ? undefined : terminal.ip_address ?? undefined,
        port: isUsb ? undefined : terminal.port ?? VALOR_DEFAULT_PORT,
        cancelPort: (terminal as any).cancel_port ?? undefined,
        epi: (terminal as any).epi ?? undefined,
        timeout: VALOR_SETTLEMENT_TIMEOUT_MS,
        terminalId: terminal.id
      })
      setCaptureOutput('Settling batch… do not unplug the terminal.')
      const res = await valor.settleBatch({ referenceId: `CAP${Date.now()}` })
      setCaptureOutput(
        JSON.stringify(
          { outcome: res.outcome, error: res.error, batchNo: res.batchNo, raw: res.raw },
          null,
          2
        )
      )
    } catch (e) {
      setCaptureOutput('ERROR: ' + (e instanceof Error ? e.message : String(e)))
    } finally {
      setCapturing(false)
    }
  }, [terminal])

  // serial_number isn't in get_location_stations_with_status — fetch it
  // separately so the header can show it.
  const [terminalSerial, setTerminalSerial] = useState<string | null>(
    terminal?.serial_number ?? null
  )
  useEffect(() => {
    if (!terminal?.id || terminalSerial) return
    supabase
      .from('payment_terminals')
      .select('serial_number')
      .eq('id', terminal.id)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.serial_number) setTerminalSerial(data.serial_number)
      })
  }, [terminal?.id, terminalSerial, supabase])

  const bdConfig = {
    timezone: selectedStore?.timezone || 'UTC',
    rolloverHour: selectedStore?.business_day_start_hour ?? 0
  }
  const businessDay = getCurrentBusinessDay(bdConfig)
  const locationId = selectedStore?.id || ''

  const {
    data: batches,
    isLoading: batchesLoading,
    isError: batchesErrored,
    refetch: refetchBatches
  } = useQuery({
    queryKey: ['batchout-batches-v2', locationId, businessDay],
    enabled: Boolean(locationId) && Boolean(showBatchLog),
    staleTime: 0,
    refetchOnMount: 'always',
    refetchOnWindowFocus: true,
    queryFn: async (): Promise<SettlementBatchRow[]> => {
      const { data, error } = await supabase.rpc(
        'get_open_batches_v2' as any,
        {
          p_location_id: locationId,
          p_today_business_date: businessDay
        } as any
      )
      if (error) throw error
      const rows = Array.isArray(data) ? data : []
      return rows.map((b: any) => ({
        id: b.id,
        batchId: b.batch_id,
        status: b.status,
        closedAt: b.closed_at,
        openedAt: b.opened_at,
        businessDate: b.business_date,
        paymentTerminalId: b.payment_terminal_id ?? null,
        terminalName: b.terminal_name ?? null,
        terminalSerial: b.terminal_serial ?? null,
        transactionCount: Number(b.transaction_count) || 0,
        grossAmount: Number(b.gross_amount) || 0,
        tipAmount: Number(b.tip_amount) || 0,
        netDeposit: Number(b.net_deposit) || 0,
        acquirer: b.acquirer ?? null,
        batchNumber: b.batch_number ?? null,
        isClosedToday: Boolean(b.is_closed_today)
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

  // Refetch on screen focus. refetchOnWindowFocus covers background->foreground,
  // but in-app navigation (Tables -> Settings -> Batchout) keeps AppState
  // 'active' and would otherwise serve cached data.
  useFocusEffect(
    useCallback(() => {
      if (locationId && showBatchLog) {
        refetchBatches()
        loadStats()
      }
    }, [locationId, showBatchLog, refetchBatches, loadStats])
  )

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
      (!isUsbTerminal && !terminalHost) ||
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
        terminalHost: isUsbTerminal ? undefined : terminalHost,
        terminalPort: isUsbTerminal ? undefined : terminalPort,
        connectionType: isUsbTerminal ? 'usb' : 'local_socket',
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
    isUsbTerminal,
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
          borderRadius: s(14),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card,
          padding: s(16)
        }}
      >
        <Text
          style={{ fontSize: s(16), fontWeight: '700', color: colors.heading }}
        >
          {terminal?.terminal_name || 'Payment Terminal'}
        </Text>
        <Text style={{ marginTop: s(4), fontSize: s(13), color: colors.muted }}>
          {isCastles
            ? isUsbTerminal
              ? 'Castles · USB'
              : `Castles @ ${terminalHost}:${terminalPort}`
            : terminal?.terminal_type ?? 'No terminal configured'}
        </Text>
        {terminalSerial ? (
          <Text style={{ marginTop: s(2), fontSize: s(12), color: colors.muted }}>
            S/N {terminalSerial}
          </Text>
        ) : null}
      </View>

      {!isCastles ? (
        isValor && VALOR_SETTLEMENT_CAPTURE ? (
          <View
            style={{
              borderRadius: s(14),
              borderWidth: 1,
              borderColor: colors.warning + '60',
              backgroundColor: colors.warning + '15',
              padding: s(14),
              gap: s(10)
            }}
          >
            <Text style={{ fontSize: s(14), fontWeight: '700', color: colors.label }}>
              Valor settlement — capture (temporary)
            </Text>
            <Text style={{ fontSize: s(12), color: colors.muted }}>
              Full Valor batch-out is still being built. This button fires a REAL batch
              close on the terminal and shows the raw response so we can lock the field
              mapping. Long-press the JSON to copy, or screenshot it, and report it back.
            </Text>
            <TouchableOpacity
              disabled={capturing || (!isUsbTerminal && !terminalHost)}
              onPress={runValorCapture}
              style={{
                paddingVertical: s(12),
                borderRadius: s(10),
                alignItems: 'center',
                backgroundColor: capturing ? colors.panel : colors.teal,
                opacity: capturing || (!isUsbTerminal && !terminalHost) ? 0.6 : 1
              }}
            >
              {capturing ? (
                <ActivityIndicator color={colors.label} />
              ) : (
                <Text style={{ fontSize: s(14), fontWeight: '700', color: '#fff' }}>
                  Capture settlement response
                </Text>
              )}
            </TouchableOpacity>
            {captureOutput ? (
              <ScrollView
                style={{
                  maxHeight: s(320),
                  borderRadius: s(8),
                  backgroundColor: colors.panel,
                  padding: s(10)
                }}
              >
                <Text
                  selectable
                  style={{ fontFamily: 'monospace', fontSize: s(11), color: colors.label }}
                >
                  {captureOutput}
                </Text>
              </ScrollView>
            ) : null}
          </View>
        ) : (
          <View
            style={{
              borderRadius: s(14),
              borderWidth: 1,
              borderColor: colors.warning + '60',
              backgroundColor: colors.warning + '15',
              padding: s(14)
            }}
          >
            <Text style={{ fontSize: s(13), color: colors.warning }}>
              Batchout is currently supported for Castles terminals only.
            </Text>
          </View>
        )
      ) : state === 'idle' || state === 'confirming' ? (
        <IdleView
          stats={unsettledStats}
          statsLoading={statsLoading}
          onSettle={handleConfirm}
          onPrintDay={printDay}
          disabled={state === 'confirming' || (!isUsbTerminal && !terminalHost)}
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
        <PendingFinalizeSection
          supabase={supabase}
          onResolved={() => {
            refetchBatches()
            loadStats()
          }}
        />
      ) : null}

      {showBatchLog ? (
        <BatchLog
          batches={batches}
          loading={batchesLoading}
          errored={batchesErrored}
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
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const isSettleDisabled = disabled || (stats?.count ?? 0) === 0

  return (
    <View style={{ gap: s(14) }}>
      {stats?.hasStuckBatch ? (
        <Banner
          tone='warning'
          title='Previous Batchout Incomplete'
          body={`A prior attempt is in a "${stats.stuckBatchStatus}" state. Tapping Batch Out will start a new attempt — the previous batch will be resolved automatically.`}
          scale={uiScale}
        />
      ) : null}

      {(stats?.daySpan ?? 0) > 1 ? (
        <Banner
          tone='info'
          title={`${stats!.daySpan} Days of Unsettled Transactions`}
          body={`Oldest: ${stats!.oldestDate} · Newest: ${stats!.newestDate}`}
          scale={uiScale}
        />
      ) : null}

      <Card scale={uiScale}>
        <Text
          style={{ fontSize: s(14), fontWeight: '600', color: colors.heading }}
        >
          Unsettled Payments
        </Text>
        {statsLoading ? (
          <ActivityIndicator
            style={{ marginTop: s(12) }}
            color={colors.teal}
          />
        ) : stats && stats.count > 0 ? (
          <View style={{ marginTop: s(12), gap: s(8) }}>
            <StatRow label='Payments in batch' value={String(stats.count)} scale={uiScale} />
            <StatRow
              label='Sales'
              value={`$${stats.grossAmount.toFixed(2)}`}
              scale={uiScale}
            />
            {stats.tipAmount > 0 ? (
              <StatRow
                label='Tips'
                value={`$${stats.tipAmount.toFixed(2)}`}
                scale={uiScale}
              />
            ) : null}
            <View
              style={{
                borderTopWidth: 1,
                borderTopColor: colors.border,
                paddingTop: s(8),
                marginTop: s(4)
              }}
            >
              <StatRow
                label='Total'
                value={`$${stats.totalAmount.toFixed(2)}`}
                emphasize
                scale={uiScale}
              />
            </View>
          </View>
        ) : (
          <Text
            style={{ marginTop: s(8), fontSize: s(13), color: colors.muted }}
          >
            No unsettled payments found for this terminal.
          </Text>
        )}
      </Card>

      <Card scale={uiScale}>
        <Text style={{ fontSize: s(12), color: colors.muted, lineHeight: s(17) }}>
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
          borderRadius: s(14),
          paddingVertical: s(16),
          alignItems: 'center',
          backgroundColor: isSettleDisabled ? colors.inset : colors.teal,
          opacity: isSettleDisabled ? 0.6 : 1
        }}
      >
        <Text
          style={{
            fontSize: s(16),
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
          borderRadius: s(14),
          paddingVertical: s(14),
          alignItems: 'center',
          flexDirection: 'row',
          justifyContent: 'center',
          gap: s(8),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card
        }}
      >
        <Printer size={s(16)} color={colors.label} />
        <Text style={{ fontSize: s(14), fontWeight: '600', color: colors.label }}>
          Print Today's Summary
        </Text>
      </TouchableOpacity>
    </View>
  )
}

// ── Settling View ──────────────────────────────────────────────

function SettlingView ({ statusMessage }: { statusMessage: string }) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
    <View
      style={{
        alignItems: 'center',
        justifyContent: 'center',
        gap: s(14),
        paddingVertical: s(60)
      }}
    >
      <ActivityIndicator size='large' color={colors.teal} />
      <Text
        style={{ fontSize: s(16), fontWeight: '600', color: colors.heading }}
      >
        Batchout in Progress
      </Text>
      <Text
        style={{
          fontSize: s(13),
          color: colors.muted,
          textAlign: 'center',
          paddingHorizontal: s(16)
        }}
      >
        {statusMessage}
      </Text>
      <Text
        style={{
          fontSize: s(12),
          color: colors.muted,
          textAlign: 'center',
          paddingHorizontal: s(32),
          opacity: 0.7,
          marginTop: s(8)
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
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const overallIcon = result.success ? (
    <CheckCircle color={colors.success} size={s(32)} />
  ) : result.partialSuccess ? (
    <AlertTriangle color={colors.warning} size={s(32)} />
  ) : (
    <XCircle color={colors.danger} size={s(32)} />
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
    <View style={{ gap: s(14) }}>
      <View style={{ alignItems: 'center', gap: s(8), paddingVertical: s(12) }}>
        {overallIcon}
        <Text style={{ fontSize: s(20), fontWeight: '700', color: overallColor }}>
          {overallLabel}
        </Text>
        {result.error ? (
          <Text
            style={{
              fontSize: s(13),
              color: colors.danger,
              textAlign: 'center',
              paddingHorizontal: s(16)
            }}
          >
            {result.error}
          </Text>
        ) : null}
      </View>

      {(result.success || result.partialSuccess) && !result.dbWriteFailed ? (
        <Card scale={uiScale}>
          {result.paymentsUpdated != null ? (
            <StatRow
              label='Payments marked settled'
              value={String(result.paymentsUpdated)}
              scale={uiScale}
            />
          ) : null}
          {result.batchUuid ? (
            <View
              style={{
                marginTop: s(8),
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'center'
              }}
            >
              <Text style={{ fontSize: s(13), color: colors.label }}>
                Batch ID
              </Text>
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.muted,
                  flexShrink: 1,
                  marginLeft: s(12)
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
          scale={uiScale}
        />
      ) : null}

      {result.shouldRetry ? (
        <Banner
          tone='warning'
          title='Retry Required (E000002A)'
          body='The terminal requested a retry with a new transaction ID. Tap Retry to attempt batchout again.'
          scale={uiScale}
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
          scale={uiScale}
        />
      ) : null}

      {result.hosts.length > 0 ? (
        <View style={{ gap: s(10) }}>
          <Text
            style={{ fontSize: s(13), fontWeight: '600', color: colors.label }}
          >
            Host Breakdown
          </Text>
          {result.hosts.map((host, idx) => (
            <HostCard key={idx} host={host} scale={uiScale} />
          ))}
        </View>
      ) : null}

      <View style={{ flexDirection: 'row', gap: s(10), marginTop: s(8) }}>
        {(!result.success && !result.partialSuccess) ||
        result.dbWriteFailed ||
        result.shouldRetry ? (
          <TouchableOpacity
            onPress={onRetry}
            style={{
              flex: 1,
              borderRadius: s(14),
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingVertical: s(14),
              alignItems: 'center'
            }}
          >
            <Text
              style={{ fontSize: s(15), fontWeight: '700', color: colors.label }}
            >
              Retry
            </Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onDone}
          style={{
            flex: 1,
            borderRadius: s(14),
            backgroundColor: colors.teal,
            paddingVertical: s(14),
            alignItems: 'center'
          }}
        >
          <Text
            style={{ fontSize: s(15), fontWeight: '700', color: colors.onSolid }}
          >
            Done
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ── Host Card ──────────────────────────────────────────────────

function HostCard ({ host, scale }: { host: CastlesSettlementHostResult; scale: number }) {
  const s = (n: number) => Math.round(n * scale)
  const icon = host.success ? (
    <CheckCircle color={colors.success} size={s(16)} />
  ) : (
    <XCircle color={colors.danger} size={s(16)} />
  )

  return (
    <View
      style={{
        borderRadius: s(12),
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: s(12),
        gap: s(8)
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
        {icon}
        <Text
          style={{
            fontSize: s(13),
            fontWeight: '600',
            color: colors.heading,
            flex: 1
          }}
        >
          {host.acquirerName}
        </Text>
        {host.batchNumber ? (
          <Text style={{ fontSize: s(11), color: colors.muted }}>
            Batch #{host.batchNumber}
          </Text>
        ) : null}
      </View>

      {host.hostMessage ? (
        <Text style={{ fontSize: s(11), color: colors.muted }}>
          {host.hostMessage}
        </Text>
      ) : null}

      <View style={{ flexDirection: 'row', gap: s(12) }}>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: s(11), color: colors.muted }}>Sales</Text>
          <Text style={{ fontSize: s(13), color: colors.label }}>
            {host.saleTotalCount} / ${host.saleTotalAmount.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: s(11), color: colors.muted }}>Refunds</Text>
          <Text style={{ fontSize: s(13), color: colors.label }}>
            {host.refundTotalCount} / ${host.refundTotalAmount.toFixed(2)}
          </Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: s(11), color: colors.muted }}>Net</Text>
          <Text
            style={{ fontSize: s(13), fontWeight: '600', color: colors.heading }}
          >
            ${host.settleTotalAmount.toFixed(2)}
          </Text>
        </View>
      </View>
    </View>
  )
}

// ── Pending Sync (terminal-settled, DB-write-failed) ──────────────

function PendingFinalizeSection ({
  supabase,
  onResolved
}: {
  supabase: ReturnType<typeof useSupabaseClient>
  onResolved: () => void
}) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const [entries, setEntries] = useState<PendingFinalizeEntry[]>([])
  const [busyId, setBusyId] = useState<string | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const refresh = useCallback(async () => {
    setEntries(await listPendingFinalizes(supabase))
  }, [supabase])

  useEffect(() => {
    refresh()
  }, [refresh])

  const onRetry = async (entry: PendingFinalizeEntry) => {
    setBusyId(entry.batchUuid)
    setErrors(prev => ({ ...prev, [entry.batchUuid]: '' }))
    try {
      const result = await retryPendingFinalize(supabase, entry)
      if (result.success) {
        refresh()
        onResolved()
      } else {
        setErrors(prev => ({
          ...prev,
          [entry.batchUuid]: result.error ?? 'Retry failed'
        }))
      }
    } catch (e: any) {
      setErrors(prev => ({
        ...prev,
        [entry.batchUuid]: e?.message ?? 'Retry failed'
      }))
    } finally {
      setBusyId(null)
    }
  }

  const onDiscard = (entry: PendingFinalizeEntry) => {
    Alert.alert(
      'Discard pending sync?',
      'The batch was already closed on the terminal. Discarding only removes this local retry entry — the batch will stay in pending status on POS until you reconcile manually with support.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Discard',
          style: 'destructive',
          onPress: async () => {
            // dynamic import to avoid hoisting concerns
            const { removePendingFinalize } = require('@/services/pendingFinalize')
            await removePendingFinalize(entry.batchUuid, supabase)
            refresh()
          }
        }
      ]
    )
  }

  if (entries.length === 0) return null

  return (
    <View style={{ gap: s(10), marginTop: s(8) }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Text style={{ fontSize: s(14), fontWeight: '700', color: colors.danger }}>
          Pending Sync ({entries.length})
        </Text>
        <Text style={{ fontSize: s(11), color: colors.muted }}>
          Settled on terminal, not yet recorded
        </Text>
      </View>

      {entries.map(entry => {
        const busy = busyId === entry.batchUuid
        const err = errors[entry.batchUuid]
        const saved = new Date(entry.savedAt).toLocaleString([], {
          month: 'short',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        })
        return (
          <View
            key={entry.batchUuid}
            style={{
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.danger + '60',
              backgroundColor: colors.danger + '08',
              padding: s(12),
              gap: s(8)
            }}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: s(8)
              }}
            >
              <AlertTriangle size={s(16)} color={colors.danger} />
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: '600',
                  color: colors.heading,
                  flex: 1
                }}
                numberOfLines={1}
              >
                Batch {entry.batchUuid.slice(0, 8)}
              </Text>
              <Text style={{ fontSize: s(11), color: colors.muted }}>
                {saved}
              </Text>
            </View>
            <Text style={{ fontSize: s(12), color: colors.label, lineHeight: s(17) }}>
              The terminal closed this batch but the DB write failed. Tap
              Retry to record the result. Safe to retry as many times as
              needed.
            </Text>
            {err ? (
              <Text style={{ fontSize: s(12), color: colors.danger }}>{err}</Text>
            ) : null}
            <View style={{ flexDirection: 'row', gap: s(8) }}>
              <TouchableOpacity
                onPress={() => onRetry(entry)}
                disabled={busy}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: s(6),
                  paddingVertical: s(10),
                  borderRadius: s(10),
                  backgroundColor: busy ? colors.inset : colors.teal,
                  opacity: busy ? 0.6 : 1
                }}
              >
                {busy ? (
                  <ActivityIndicator color='#fff' size='small' />
                ) : (
                  <RefreshCw size={s(14)} color='#fff' />
                )}
                <Text
                  style={{ color: '#fff', fontWeight: '700', fontSize: s(13) }}
                >
                  {busy ? 'Retrying…' : 'Retry sync'}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onDiscard(entry)}
                disabled={busy}
                style={{
                  paddingVertical: s(10),
                  paddingHorizontal: s(14),
                  borderRadius: s(10),
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <Text
                  style={{
                    color: colors.label,
                    fontWeight: '600',
                    fontSize: s(13)
                  }}
                >
                  Discard
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        )
      })}
    </View>
  )
}

// ── Batch Log ──────────────────────────────────────────────────

function BatchLog ({
  batches,
  loading,
  errored,
  onPrintBatch
}: {
  batches: SettlementBatchRow[] | undefined
  loading: boolean
  errored: boolean
  onPrintBatch: (settlementBatchId: string) => void
}) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const list = batches || []
  // Flat: every open batch at the location, regardless of which terminal
  // owns it. BatchRow renders the terminal label so users can tell rows
  // apart, and the settle action targets each batch’s own terminal.
  const openBatches = list.filter(b => !b.isClosedToday)
  const closedToday = list.filter(b => b.isClosedToday)

  const openCount =
    openBatches.length === 0
      ? ''
      : openBatches.length === 1
      ? '1 open'
      : `${openBatches.length} open`

  return (
    <View style={{ gap: s(10), marginTop: s(8) }}>
      {!loading && closedToday.length > 0 ? (
        <ClosedTodayCollapsible
          batches={closedToday}
          onPrintBatch={onPrintBatch}
          scale={uiScale}
        />
      ) : null}

      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <Text
          style={{ fontSize: s(14), fontWeight: '700', color: colors.heading }}
        >
          Open Batches
        </Text>
        {openCount ? (
          <Text style={{ fontSize: s(11), color: colors.muted }}>{openCount}</Text>
        ) : null}
      </View>

      {loading ? (
        <Card scale={uiScale}>
          <ActivityIndicator color={colors.teal} />
        </Card>
      ) : errored && openBatches.length === 0 ? (
        <Card scale={uiScale}>
          <Text style={{ fontSize: s(13), color: colors.muted }}>
            Couldn{"'"}t load batches. Pull down to refresh.
          </Text>
        </Card>
      ) : openBatches.length === 0 ? (
        <Card scale={uiScale}>
          <Text style={{ fontSize: s(13), color: colors.muted }}>
            No open batches.
          </Text>
        </Card>
      ) : (
        openBatches.map(b => (
          <BatchRow
            key={b.id}
            batch={b}
            showTerminalLabel
            onPrint={() => onPrintBatch(b.id)}
            scale={uiScale}
          />
        ))
      )}
    </View>
  )
}

function ClosedTodayCollapsible ({
  batches,
  onPrintBatch,
  scale
}: {
  batches: SettlementBatchRow[]
  onPrintBatch: (settlementBatchId: string) => void
  scale: number
}) {
  const s = (n: number) => Math.round(n * scale)
  const [expanded, setExpanded] = useState(false)
  const label =
    batches.length === 1
      ? '1 batch closed today'
      : `${batches.length} batches closed today`

  return (
    <View style={{ gap: s(10) }}>
      <TouchableOpacity
        onPress={() => setExpanded(v => !v)}
        activeOpacity={0.7}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: s(10),
          paddingHorizontal: s(12),
          borderRadius: s(10),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.card
        }}
      >
        <Text
          style={{ fontSize: s(13), fontWeight: '600', color: colors.label }}
        >
          {label}
        </Text>
        {expanded ? (
          <ChevronUp size={s(16)} color={colors.muted} />
        ) : (
          <ChevronDown size={s(16)} color={colors.muted} />
        )}
      </TouchableOpacity>

      {expanded
        ? batches.map(b => (
            <BatchRow
              key={b.id}
              batch={b}
              onPrint={() => onPrintBatch(b.id)}
              scale={scale}
            />
          ))
        : null}
    </View>
  )
}

function BatchRow ({
  batch,
  showTerminalLabel = false,
  onPrint,
  scale
}: {
  batch: SettlementBatchRow
  showTerminalLabel?: boolean
  onPrint: () => void
  scale: number
}) {
  const s = (n: number) => Math.round(n * scale)
  const supabase = useSupabaseClient()
  const { userId } = useAuth()
  const { selectedStore } = useStoreSettingsStore()
  const [marking, setMarking] = useState(false)
  const [reasonOpen, setReasonOpen] = useState(false)
  const [reasonText, setReasonText] = useState('')
  const [reasonError, setReasonError] = useState<string | null>(null)
  // Manual mark-settled is destructive and almost never the right action —
  // the cascade trigger settles automatically when the host batch closes.
  // Keep the button hidden until staff long-press the status badge to opt
  // in. Resets per batch render so it doesn't linger.
  const [manualUnlocked, setManualUnlocked] = useState(false)
  const [expanded, setExpanded] = useState(false)
  const [payments, setPayments] = useState<BatchPaymentRow[] | null>(null)
  const [paymentsLoading, setPaymentsLoading] = useState(false)
  const [paymentsError, setPaymentsError] = useState<string | null>(null)

  const togglePayments = useCallback(async () => {
    const next = !expanded
    setExpanded(next)
    if (next && payments === null && !paymentsLoading) {
      setPaymentsLoading(true)
      setPaymentsError(null)
      try {
        const { data, error } = await supabase.rpc('get_batch_payments_v2', {
          p_settlement_batch_id: batch.id
        })
        if (error) throw error
        setPayments(Array.isArray(data) ? (data as BatchPaymentRow[]) : [])
      } catch (e: any) {
        setPaymentsError(e?.message ?? 'Failed to load payments')
      } finally {
        setPaymentsLoading(false)
      }
    }
  }, [expanded, payments, paymentsLoading, supabase, batch.id])
  const isSettled = batch.status === 'settled'
  const isOpen = batch.status === 'open'
  const isFailed =
    batch.status === 'failed' ||
    batch.status === 'error' ||
    batch.status === 'reversed' ||
    batch.status === 'partial_failure'
  const tone = isSettled
    ? colors.success
    : isFailed
    ? colors.danger
    : isOpen
    ? colors.teal
    : colors.warning

  // Open batches haven't closed yet — show when they opened instead.
  const timeIso = batch.closedAt ?? batch.openedAt
  const timeLabel = batch.closedAt ? 'Closed' : isOpen ? 'Opened' : 'Started'
  const timeDisplay = timeIso
    ? new Date(timeIso).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      })
    : '—'
  const businessDateDisplay = batch.businessDate ? ` · ${batch.businessDate}` : ''

  return (
    <View
      style={{
        borderRadius: s(12),
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: s(12),
        gap: s(10)
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <View
            style={{
              width: s(26),
              height: s(26),
              borderRadius: s(8),
              backgroundColor: tone + '20',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            {isSettled ? (
              <CheckCircle size={s(14)} color={tone} />
            ) : isFailed ? (
              <XCircle size={s(14)} color={tone} />
            ) : (
              <Clock size={s(14)} color={tone} />
            )}
          </View>
          <View>
            <Text
              style={{
                fontSize: s(13),
                fontWeight: '600',
                color: colors.heading
              }}
              numberOfLines={1}
            >
              {batch.batchNumber
                ? `Batch ${batch.batchNumber}`
                : `Batch ${batch.batchId || batch.id.slice(0, 8)}`}
            </Text>
            <Text style={{ fontSize: s(11), color: colors.muted }}>
              {timeLabel} {timeDisplay}{businessDateDisplay}
            </Text>
            {showTerminalLabel && (batch.terminalName || batch.terminalSerial) ? (
              <Text style={{ fontSize: s(11), color: colors.muted }}>
                {batch.terminalName ?? 'Terminal'}
                {batch.terminalSerial ? ` · S/N ${batch.terminalSerial}` : ''}
              </Text>
            ) : null}
          </View>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          {batch.acquirer ? (
            <View
              style={{
                paddingHorizontal: s(8),
                paddingVertical: s(3),
                borderRadius: s(6),
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <Text
                style={{
                  fontSize: s(10),
                  fontWeight: '700',
                  color: colors.label,
                  letterSpacing: 0.5
                }}
              >
                {batch.acquirer}
              </Text>
            </View>
          ) : null}
          <TouchableOpacity
            // Hidden long-press affordance to reveal the manual mark-settled
            // override. No visual hint — staff must already know it exists.
            // 1500ms delay prevents accidental triggers from a stray hold.
            onLongPress={() => {
              if (!isSettled && batch.status !== 'closed') {
                setManualUnlocked(v => !v)
              }
            }}
            delayLongPress={1500}
            activeOpacity={1}
            style={{
              paddingHorizontal: s(8),
              paddingVertical: s(3),
              borderRadius: s(6),
              backgroundColor: tone + '20',
              borderWidth: manualUnlocked ? 1 : 0,
              borderColor: manualUnlocked ? colors.danger : 'transparent'
            }}
          >
            <Text
              style={{
                fontSize: s(10),
                fontWeight: '700',
                color: tone,
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}
            >
              {batch.status}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onPrint}
            hitSlop={s(8)}
            accessibilityLabel='Print batch summary'
            style={{
              padding: s(6),
              borderRadius: s(6),
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Printer size={s(14)} color={colors.label} />
          </TouchableOpacity>
        </View>
      </View>

      <ReasonPromptModal
        visible={reasonOpen}
        value={reasonText}
        error={reasonError}
        busy={marking}
        onChangeText={t => {
          setReasonText(t)
          if (reasonError) setReasonError(null)
        }}
        onCancel={() => {
          setReasonOpen(false)
          setReasonText('')
          setReasonError(null)
        }}
        onSubmit={async () => {
          if (!selectedStore?.merchant_id) return
          if (!userId) {
            setReasonError('Sign in to mark this batch settled.')
            return
          }
          if (reasonText.trim().length < 10) {
            setReasonError(
              'Reason must be at least 10 characters (audit trail).'
            )
            return
          }
          setMarking(true)
          try {
            const result = await manualMarkBatchSettled({
              supabase,
              batchUuid: batch.id,
              merchantId: selectedStore.merchant_id!,
              reason: reasonText.trim(),
              staffId: userId
            })
            if (result.success) {
              setReasonOpen(false)
              setReasonText('')
              setReasonError(null)
            } else {
              setReasonError(result.error ?? 'Failed to mark settled.')
            }
          } finally {
            setMarking(false)
          }
        }}
      />
      {!isSettled && batch.status !== 'closed' && manualUnlocked ? (
        <TouchableOpacity
          onPress={() => {
            if (!selectedStore?.merchant_id) return
            Alert.alert(
              'Mark this batch as settled?',
              'Use this only when the terminal already closed this batch in a prior session and POS is out of sync. It marks the batch and its payments settled in the database without re-talking to the terminal. Cannot be undone — the action is logged with your staff ID and the reason you provide.',
              [
                { text: 'Cancel', style: 'cancel' },
                {
                  text: 'Continue',
                  style: 'destructive',
                  onPress: () => {
                    setReasonText('')
                    setReasonError(null)
                    setReasonOpen(true)
                  }
                }
              ]
            )
          }}
          disabled={marking}
          style={{
            paddingVertical: s(8),
            paddingHorizontal: s(12),
            borderRadius: s(8),
            borderWidth: 1,
            borderColor: colors.border,
            alignSelf: 'flex-start',
            opacity: marking ? 0.6 : 1
          }}
        >
          <Text
            style={{
              fontSize: s(12),
              fontWeight: '600',
              color: colors.label
            }}
          >
            {marking ? 'Marking…' : 'Mark settled (terminal already closed)'}
          </Text>
        </TouchableOpacity>
      ) : null}

      <View style={{ flexDirection: 'row', gap: s(12) }}>
        <BatchStat label='Txns' value={String(batch.transactionCount)} scale={scale} />
        <BatchStat
          label='Gross'
          value={`$${batch.grossAmount.toFixed(2)}`}
          scale={scale}
        />
        <BatchStat label='Tips' value={`$${batch.tipAmount.toFixed(2)}`} scale={scale} />
        <BatchStat
          label='Net'
          value={`$${batch.netDeposit.toFixed(2)}`}
          emphasize
          scale={scale}
        />
      </View>

      <TouchableOpacity
        onPress={togglePayments}
        accessibilityLabel={
          expanded ? 'Hide batch payments' : 'Show batch payments'
        }
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'center',
          gap: s(6),
          paddingVertical: s(8),
          borderRadius: s(8),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.inset
        }}
      >
        {expanded ? (
          <ChevronUp size={s(14)} color={colors.label} />
        ) : (
          <ChevronDown size={s(14)} color={colors.label} />
        )}
        <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.label }}>
          {expanded
            ? 'Hide payments'
            : `Show payments (${batch.transactionCount})`}
        </Text>
      </TouchableOpacity>

      {expanded ? (
        <BatchPaymentsList
          loading={paymentsLoading}
          error={paymentsError}
          payments={payments}
          scale={scale}
        />
      ) : null}
    </View>
  )
}

function BatchPaymentsList ({
  loading,
  error,
  payments,
  scale
}: {
  loading: boolean
  error: string | null
  payments: BatchPaymentRow[] | null
  scale: number
}) {
  const s = (n: number) => Math.round(n * scale)
  if (loading) {
    return (
      <View style={{ paddingVertical: s(12) }}>
        <ActivityIndicator color={colors.teal} />
      </View>
    )
  }
  if (error) {
    return (
      <Text style={{ fontSize: s(12), color: colors.danger }}>{error}</Text>
    )
  }
  if (!payments || payments.length === 0) {
    return (
      <Text style={{ fontSize: s(12), color: colors.muted }}>
        No payments linked to this batch.
      </Text>
    )
  }
  return (
    <View style={{ gap: s(6) }}>
      {payments.map(p => (
        <PaymentLine key={p.id} payment={p} scale={scale} />
      ))}
    </View>
  )
}

function PaymentLine ({ payment, scale }: { payment: BatchPaymentRow; scale: number }) {
  const s = (n: number) => Math.round(n * scale)
  const time = payment.captured_at
    ? new Date(payment.captured_at).toLocaleTimeString([], {
        hour: 'numeric',
        minute: '2-digit'
      })
    : '—'
  const amount = Number(payment.amount ?? 0)
  const tip = Number(payment.tip_amount ?? 0)
  const total = Number(payment.total_amount ?? 0)
  const refunded = Number(payment.refunded_amount ?? 0)
  const isPartialRefund =
    refunded > 0 && refunded + 0.005 < total // float-tolerant
  const isFullRefund = payment.is_returned && !isPartialRefund
  const card =
    payment.card_last_four
      ? `${payment.card_type ?? 'Card'} ••${payment.card_last_four}`
      : (payment.payment_method ?? 'Card').toString()
  const statusLabel = isFullRefund
    ? 'Refunded'
    : isPartialRefund
    ? 'Partially Refunded'
    : payment.status === 'captured'
    ? payment.is_settled
      ? 'Settled'
      : 'Captured'
    : (payment.status ?? '').toString()
  const statusTone =
    isFullRefund || isPartialRefund
      ? colors.warning
      : payment.is_settled
      ? colors.success
      : colors.label

  return (
    <View
      style={{
        borderRadius: s(8),
        borderWidth: 1,
        borderColor: colors.border,
        padding: s(10),
        gap: s(4)
      }}
    >
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.heading }}>
          {payment.display_number ?? payment.order_number ?? '—'}
        </Text>
        <Text style={{ fontSize: s(11), color: colors.muted }}>{time}</Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <Text style={{ fontSize: s(12), color: colors.label }}>{card}</Text>
        <Text style={{ fontSize: s(12), fontWeight: '600', color: colors.heading }}>
          ${total.toFixed(2)}
        </Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center'
        }}
      >
        <Text style={{ fontSize: s(11), color: colors.muted }}>
          Sale ${amount.toFixed(2)}
          {tip > 0 ? ` · Tip $${tip.toFixed(2)}` : ''}
          {payment.authorization_code ? ` · Auth ${payment.authorization_code}` : ''}
        </Text>
        <Text
          style={{
            fontSize: s(10),
            fontWeight: '700',
            color: statusTone,
            textTransform: 'uppercase',
            letterSpacing: 0.5
          }}
        >
          {statusLabel}
        </Text>
      </View>
      {refunded > 0 ? (
        <Text style={{ fontSize: s(11), color: colors.warning, fontWeight: '600' }}>
          Refunded ${refunded.toFixed(2)} of ${total.toFixed(2)}
        </Text>
      ) : null}
    </View>
  )
}

function ReasonPromptModal ({
  visible,
  value,
  error,
  busy,
  onChangeText,
  onCancel,
  onSubmit
}: {
  visible: boolean
  value: string
  error: string | null
  busy: boolean
  onChangeText: (t: string) => void
  onCancel: () => void
  onSubmit: () => void
}) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      onRequestClose={onCancel}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.4)',
          alignItems: 'center',
          justifyContent: 'center',
          padding: s(20)
        }}
      >
        <View
          style={{
            width: '100%',
            maxWidth: s(480),
            backgroundColor: colors.card,
            borderRadius: s(14),
            padding: s(18),
            gap: s(12)
          }}
        >
          <Text style={{ fontSize: s(16), fontWeight: '700', color: colors.heading }}>
            Reason for manual reconcile
          </Text>
          <Text style={{ fontSize: s(12), color: colors.muted, lineHeight: s(17) }}>
            Required for the audit log. Be specific (e.g. "Terminal auto-cut
            batch overnight before POS could send finalize"). Minimum 10
            characters.
          </Text>
          <TextInput
            value={value}
            onChangeText={onChangeText}
            multiline
            numberOfLines={4}
            placeholder='Why are you marking this batch settled?'
            placeholderTextColor={colors.muted}
            style={{
              borderWidth: 1,
              borderColor: error ? colors.danger : colors.border,
              borderRadius: s(10),
              paddingHorizontal: s(12),
              paddingVertical: s(10),
              minHeight: s(90),
              textAlignVertical: 'top',
              color: colors.heading,
              fontSize: s(13)
            }}
          />
          {error ? (
            <Text style={{ fontSize: s(12), color: colors.danger }}>{error}</Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: s(8), marginTop: s(4) }}>
            <TouchableOpacity
              onPress={onCancel}
              disabled={busy}
              style={{
                flex: 1,
                paddingVertical: s(12),
                borderRadius: s(10),
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center'
              }}
            >
              <Text style={{ fontWeight: '600', color: colors.label }}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onSubmit}
              disabled={busy}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: s(6),
                paddingVertical: s(12),
                borderRadius: s(10),
                backgroundColor: busy ? colors.inset : colors.danger,
                opacity: busy ? 0.6 : 1
              }}
            >
              {busy ? <ActivityIndicator color='#fff' size='small' /> : null}
              <Text style={{ fontWeight: '700', color: '#fff' }}>
                {busy ? 'Marking…' : 'Mark Settled'}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

function BatchStat ({
  label,
  value,
  emphasize,
  scale
}: {
  label: string
  value: string
  emphasize?: boolean
  scale: number
}) {
  const s = (n: number) => Math.round(n * scale)
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: s(10), color: colors.muted }}>{label}</Text>
      <Text
        style={{
          fontSize: s(13),
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

function Card ({ children, scale }: { children: React.ReactNode; scale: number }) {
  const s = (n: number) => Math.round(n * scale)
  return (
    <View
      style={{
        borderRadius: s(14),
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.card,
        padding: s(14)
      }}
    >
      {children}
    </View>
  )
}

function StatRow ({
  label,
  value,
  emphasize,
  scale
}: {
  label: string
  value: string
  emphasize?: boolean
  scale: number
}) {
  const s = (n: number) => Math.round(n * scale)
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
          fontSize: s(13),
          color: emphasize ? colors.heading : colors.label,
          fontWeight: emphasize ? '600' : '400'
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: s(13),
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
  body,
  scale
}: {
  tone: 'warning' | 'info'
  title?: string
  body: string
  scale: number
}) {
  const s = (n: number) => Math.round(n * scale)
  const accent = tone === 'warning' ? colors.warning : colors.info
  return (
    <View
      style={{
        borderRadius: s(14),
        borderWidth: 1,
        borderColor: accent + '60',
        backgroundColor: accent + '15',
        padding: s(14)
      }}
    >
      {title ? (
        <Text
          style={{
            fontSize: s(13),
            fontWeight: '700',
            color: accent,
            marginBottom: s(4)
          }}
        >
          {title}
        </Text>
      ) : null}
      <Text style={{ fontSize: s(12), color: accent, lineHeight: s(17) }}>
        {body}
      </Text>
    </View>
  )
}
