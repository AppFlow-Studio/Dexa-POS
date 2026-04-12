import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { colors } from '@/lib/theme'
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
import { Stack, useRouter } from 'expo-router'
import {
  AlertTriangle,
  CheckCircle,
  ChevronLeft,
  XCircle
} from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

type ScreenState = 'idle' | 'confirming' | 'settling' | 'results'

export default function EndOfDaySettlementScreen () {
  const router = useRouter()
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

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back()
      return
    }
    router.replace('/(main)/settings/end-of-day')
  }, [router])

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

  const handleSettle = useCallback(async () => {
    if (
      !terminal?.id ||
      !terminalHost ||
      !selectedStore?.id ||
      !selectedStore?.merchant_id
    )
      return

    setState('settling')
    setStatusMessage('Starting settlement...')

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
  }, [terminal, terminalHost, terminalPort, selectedStore, supabase])

  const handleConfirm = useCallback(() => {
    Alert.alert(
      'Confirm Settlement',
      `This will close the current batch on the terminal and mark ${
        unsettledStats?.count ?? 0
      } payment(s) as settled. This cannot be undone.\n\nProceed?`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => setState('idle') },
        { text: 'Settle', style: 'destructive', onPress: handleSettle }
      ]
    )
    setState('confirming')
  }, [unsettledStats, handleSettle])

  return (
    <>
      <Stack.Screen
        options={{
          title: 'Terminal Settlement',
          headerShown: true,
          headerBackVisible: true,
          headerTintColor: colors.label,
          headerLeft: () => (
            <Pressable
              onPress={handleBack}
              hitSlop={10}
              style={{
                width: 32,
                height: 32,
                borderRadius: 16,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                alignItems: 'center',
                justifyContent: 'center'
              }}
              accessibilityRole='button'
              accessibilityLabel='Go back'
            >
              <ChevronLeft size={20} color={colors.label} />
            </Pressable>
          )
        }}
      />
      <ScrollView
        className='flex-1 bg-background'
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
      >
        <TouchableOpacity
          onPress={handleBack}
          className='mb-4 flex-row items-center self-start rounded-full border px-3 py-2'
          style={{ borderColor: colors.border, backgroundColor: colors.card }}
          accessibilityRole='button'
          accessibilityLabel='Back to End of Day'
        >
          <ChevronLeft size={16} color={colors.label} />
          <Text
            className='ml-1 text-sm font-semibold'
            style={{ color: colors.label }}
          >
            Back to End of Day
          </Text>
        </TouchableOpacity>

        {/* Terminal info */}
        <View className='mb-4 rounded-xl border border-gray-700 bg-card p-4'>
          <Text className='text-base font-bold text-white'>
            {terminal?.terminal_name || 'Payment Terminal'}
          </Text>
          <Text className='mt-1 text-sm text-zinc-400'>
            {isCastles
              ? `Castles @ ${terminalHost}:${terminalPort}`
              : terminal?.terminal_type ?? 'No terminal configured'}
          </Text>
        </View>

        {!isCastles ? (
          <View className='rounded-xl border border-amber-700 bg-amber-900/20 p-4'>
            <Text className='text-sm text-amber-200'>
              Settlement is currently supported for Castles terminals only.
            </Text>
          </View>
        ) : state === 'idle' || state === 'confirming' ? (
          <IdleView
            stats={unsettledStats}
            statsLoading={statsLoading}
            onSettle={handleConfirm}
            disabled={state === 'confirming' || !terminalHost}
          />
        ) : state === 'settling' ? (
          <SettlingView statusMessage={statusMessage} />
        ) : state === 'results' && result ? (
          <ResultsView
            result={result}
            onDone={handleBack}
            onRetry={() => {
              setResult(null)
              setState('idle')
              loadStats()
            }}
          />
        ) : null}
      </ScrollView>
    </>
  )
}

// ── Idle View ──────────────────────────────────────────────────

function IdleView ({
  stats,
  statsLoading,
  onSettle,
  disabled
}: {
  stats: UnsettledStats | null
  statsLoading: boolean
  onSettle: () => void
  disabled: boolean
}) {
  const isSettleDisabled = disabled || (stats?.count ?? 0) === 0

  return (
    <View className='gap-4'>
      {/* Stuck batch warning */}
      {stats?.hasStuckBatch ? (
        <View className='rounded-xl border border-amber-700 bg-amber-900/20 p-4'>
          <Text className='text-sm font-semibold text-amber-200 mb-1'>
            Previous Settlement Incomplete
          </Text>
          <Text className='text-xs text-amber-300'>
            A prior settlement attempt is in a "{stats.stuckBatchStatus}" state.
            Tapping Settle will start a new attempt — the previous batch will be
            resolved automatically.
          </Text>
        </View>
      ) : null}

      {/* Multi-day unsettled warning */}
      {(stats?.daySpan ?? 0) > 1 ? (
        <View className='rounded-xl border border-blue-700 bg-blue-900/20 p-4'>
          <Text className='text-sm font-semibold text-blue-200 mb-1'>
            {stats!.daySpan} Days of Unsettled Transactions
          </Text>
          <Text className='text-xs text-blue-300'>
            Oldest: {stats!.oldestDate} · Newest: {stats!.newestDate}
          </Text>
        </View>
      ) : null}

      <View className='rounded-xl border border-gray-700 bg-zinc-900/40 p-4'>
        <Text className='text-sm font-semibold text-white'>
          Unsettled Payments
        </Text>
        {statsLoading ? (
          <ActivityIndicator className='mt-3' color={colors.label} />
        ) : stats && stats.count > 0 ? (
          <View className='mt-3 gap-2'>
            <View className='flex-row justify-between'>
              <Text className='text-zinc-300'>Payments in batch</Text>
              <Text className='font-semibold text-white'>{stats.count}</Text>
            </View>
            <View className='flex-row justify-between'>
              <Text className='text-zinc-300'>Sales</Text>
              <Text className='font-semibold text-white'>
                ${stats.grossAmount.toFixed(2)}
              </Text>
            </View>
            {stats.tipAmount > 0 ? (
              <View className='flex-row justify-between'>
                <Text className='text-zinc-300'>Tips</Text>
                <Text className='font-semibold text-white'>
                  ${stats.tipAmount.toFixed(2)}
                </Text>
              </View>
            ) : null}
            <View className='flex-row justify-between border-t border-gray-700 pt-2 mt-1'>
              <Text className='text-zinc-300'>Total</Text>
              <Text className='font-semibold text-white'>
                ${stats.totalAmount.toFixed(2)}
              </Text>
            </View>
          </View>
        ) : (
          <Text className='mt-2 text-sm text-zinc-400'>
            No unsettled payments found for this terminal.
          </Text>
        )}
      </View>

      <View className='rounded-xl border border-gray-700 bg-zinc-900/40 p-4'>
        <Text className='text-xs text-zinc-400'>
          Settlement closes the terminal's open batch and sends all captured
          transactions to their acquiring banks. After settlement, tips cannot
          be adjusted on settled payments. Refunds remain possible via the
          refund flow.
        </Text>
      </View>

      <TouchableOpacity
        onPress={onSettle}
        disabled={isSettleDisabled}
        className={`rounded-xl py-4 items-center ${
          isSettleDisabled ? 'bg-zinc-800' : 'bg-purple-600'
        }`}
      >
        <Text
          className={`text-base font-bold ${
            isSettleDisabled ? 'text-zinc-500' : 'text-white'
          }`}
        >
          Settle Terminal
        </Text>
      </TouchableOpacity>
    </View>
  )
}

// ── Settling View ──────────────────────────────────────────────

function SettlingView ({ statusMessage }: { statusMessage: string }) {
  return (
    <View className='items-center justify-center gap-4 py-16'>
      <ActivityIndicator size='large' color={colors.teal} />
      <Text className='text-base font-semibold text-white'>
        Settlement in Progress
      </Text>
      <Text className='text-sm text-zinc-400 text-center px-4'>
        {statusMessage}
      </Text>
      <Text className='text-xs text-zinc-500 text-center px-8 mt-4'>
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
    ? 'Settlement Complete'
    : result.partialSuccess
    ? 'Partial Settlement'
    : 'Settlement Failed'

  const overallColor = result.success
    ? 'text-green-400'
    : result.partialSuccess
    ? 'text-amber-400'
    : 'text-red-400'

  return (
    <View className='gap-4'>
      {/* Overall status */}
      <View className='items-center gap-2 py-4'>
        {overallIcon}
        <Text className={`text-xl font-bold ${overallColor}`}>
          {overallLabel}
        </Text>
        {result.error ? (
          <Text className='text-sm text-red-300 text-center px-4'>
            {result.error}
          </Text>
        ) : null}
      </View>

      {/* DB results */}
      {(result.success || result.partialSuccess) && !result.dbWriteFailed ? (
        <View className='rounded-xl border border-gray-700 bg-zinc-900/40 p-4 gap-2'>
          {result.paymentsUpdated != null ? (
            <View className='flex-row justify-between'>
              <Text className='text-zinc-300'>Payments marked settled</Text>
              <Text className='font-semibold text-white'>
                {result.paymentsUpdated}
              </Text>
            </View>
          ) : null}
          {result.batchUuid ? (
            <View className='flex-row justify-between'>
              <Text className='text-zinc-300'>Batch ID</Text>
              <Text
                className='text-xs text-zinc-400 flex-shrink'
                numberOfLines={1}
              >
                {result.batchUuid}
              </Text>
            </View>
          ) : null}
        </View>
      ) : null}

      {result.dbWriteFailed ? (
        <View className='rounded-xl border border-amber-700 bg-amber-900/20 p-3'>
          <Text className='text-sm text-amber-200'>
            Settlement succeeded on terminal but database update failed.
            Payments were not marked as settled in the system.
          </Text>
        </View>
      ) : null}

      {result.shouldRetry ? (
        <View className='rounded-xl border border-amber-700 bg-amber-900/20 p-3'>
          <Text className='text-sm font-semibold text-amber-200 mb-1'>
            Retry Required (E000002A)
          </Text>
          <Text className='text-xs text-amber-300'>
            The terminal requested a retry with a new transaction ID. Tap Retry
            to attempt settlement again.
          </Text>
        </View>
      ) : null}

      {result.requiresSupport ? (
        <View className='rounded-xl border border-amber-700 bg-amber-900/20 p-3'>
          <Text className='text-sm font-semibold text-amber-200 mb-1'>
            Partial Settlement
          </Text>
          {(result.settledAcquirers?.length ?? 0) > 0 ? (
            <Text className='text-xs text-amber-300 mb-1'>
              Settled: {result.settledAcquirers!.join(', ')}
            </Text>
          ) : null}
          {(result.failedAcquirers?.length ?? 0) > 0 ? (
            <Text className='text-xs text-amber-300'>
              Failed: {result.failedAcquirers!.map(f => f.acquirer).join(', ')}{' '}
              — contact your payment processor.
            </Text>
          ) : null}
        </View>
      ) : null}

      {/* Per-host breakdown */}
      {result.hosts.length > 0 ? (
        <View className='gap-3'>
          <Text className='text-sm font-semibold text-zinc-300'>
            Host Breakdown
          </Text>
          {result.hosts.map((host, idx) => (
            <HostCard key={idx} host={host} />
          ))}
        </View>
      ) : null}

      {/* Actions */}
      <View className='flex-row gap-3 mt-4'>
        {(!result.success && !result.partialSuccess) ||
        result.dbWriteFailed ||
        result.shouldRetry ? (
          <TouchableOpacity
            onPress={onRetry}
            className='flex-1 rounded-xl border border-gray-600 py-3 items-center'
          >
            <Text className='text-base font-bold text-zinc-300'>Retry</Text>
          </TouchableOpacity>
        ) : null}
        <TouchableOpacity
          onPress={onDone}
          className='flex-1 rounded-xl bg-purple-600 py-3 items-center'
        >
          <Text className='text-base font-bold text-white'>Done</Text>
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
    <View className='rounded-xl border border-gray-700 bg-zinc-900/40 p-3 gap-2'>
      <View className='flex-row items-center gap-2'>
        {icon}
        <Text className='text-sm font-semibold text-white flex-1'>
          {host.acquirerName}
        </Text>
        {host.batchNumber ? (
          <Text className='text-xs text-zinc-500'>
            Batch #{host.batchNumber}
          </Text>
        ) : null}
      </View>

      {host.hostMessage ? (
        <Text className='text-xs text-zinc-400'>{host.hostMessage}</Text>
      ) : null}

      <View className='flex-row gap-4'>
        <View className='flex-1'>
          <Text className='text-xs text-zinc-500'>Sales</Text>
          <Text className='text-sm text-white'>
            {host.saleTotalCount} / ${host.saleTotalAmount.toFixed(2)}
          </Text>
        </View>
        <View className='flex-1'>
          <Text className='text-xs text-zinc-500'>Refunds</Text>
          <Text className='text-sm text-white'>
            {host.refundTotalCount} / ${host.refundTotalAmount.toFixed(2)}
          </Text>
        </View>
        <View className='flex-1'>
          <Text className='text-xs text-zinc-500'>Net</Text>
          <Text className='text-sm font-semibold text-white'>
            ${host.settleTotalAmount.toFixed(2)}
          </Text>
        </View>
      </View>
    </View>
  )
}
