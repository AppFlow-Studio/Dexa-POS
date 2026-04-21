import { getCurrentBusinessDay, getBusinessDayBounds } from '@/lib/businessDay'
import { colors } from '@/lib/theme'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { DailySummary } from '@/stores/useEndOfDayStore'
import { useQuery } from '@tanstack/react-query'
import { Check, Clock } from 'lucide-react-native'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'

interface EodStepPaymentsPlaceholderProps {
  summary: DailySummary | null
  summaryLoading: boolean
  onGoToSettlement: () => void
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

export default function EodStepPaymentsPlaceholder ({
  summary,
  summaryLoading,
  onGoToSettlement
}: EodStepPaymentsPlaceholderProps) {
  const supabase = useSupabaseClient()
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const locationId = selectedStore?.id || ''
  const bdConfig = {
    timezone: selectedStore?.timezone || 'UTC',
    rolloverHour: selectedStore?.business_day_start_hour ?? 0,
  }
  const today = getCurrentBusinessDay(bdConfig)
  const bounds = getBusinessDayBounds(today, bdConfig)

  const { data: batches, isLoading: batchesLoading } = useQuery({
    queryKey: ['eod-settlement-batches', locationId, today],
    enabled: Boolean(locationId),
    staleTime: 0,
    gcTime: 0,
    queryFn: async (): Promise<SettlementBatchRow[]> => {
      const { data, error } = await supabase
        .from('settlement_batches')
        .select('id, batch_id, status, closed_at, transaction_count, gross_amount, tip_amount, net_deposit')
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
        netDeposit: Number(b.net_deposit) || 0,
      }))
    },
  })

  const settledBatches = (batches || []).filter(b => b.status === 'settled')
  const hasBatches = (batches || []).length > 0
  const cardRows = summary
    ? [
        { label: 'Card payments', value: summary.cardTotal },
        { label: 'Cash payments', value: summary.cashTotal },
        { label: 'Other payments', value: summary.otherTotal }
      ]
    : []

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 12,
          gap: 10
        }}
      >
        <View style={{ gap: 4 }}>
          <Text
            style={{ fontSize: 14, fontWeight: '700', color: colors.heading }}
          >
            Payment Settlement
          </Text>
          <Text style={{ fontSize: 11, color: colors.label, lineHeight: 16 }}>
            Review the payout split before moving to the final report step.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View
            style={{
              flexGrow: 1,
              flexBasis: 140,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: 10
            }}
          >
            <Text
              style={{
                fontSize: 10,
                color: colors.muted,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}
            >
              Settlement
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: colors.teal,
                fontWeight: '800',
                marginTop: 2
              }}
            >
              Ready for review
            </Text>
          </View>
          <View
            style={{
              flexGrow: 1,
              flexBasis: 140,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: 10
            }}
          >
            <Text
              style={{
                fontSize: 10,
                color: colors.muted,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}
            >
              Next Step
            </Text>
            <Text
              style={{
                fontSize: 15,
                color: colors.heading,
                fontWeight: '800',
                marginTop: 2
              }}
            >
              EOD Report
            </Text>
          </View>
        </View>
      </View>

      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
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
          <Text
            style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}
          >
            Today's Cash/Card Split
          </Text>
          {summaryLoading ? (
            <Text style={{ fontSize: 10, color: colors.label }}>
              Loading...
            </Text>
          ) : null}
        </View>

        {!summary && !summaryLoading ? (
          <Text style={{ fontSize: 11, color: colors.label }}>
            Run the report on the final step to populate this snapshot.
          </Text>
        ) : null}

        {summaryLoading ? (
          <Text style={{ fontSize: 11, color: colors.label }}>
            Loading summary…
          </Text>
        ) : null}

        {!!summary ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {cardRows.map(row => (
              <View
                key={row.label}
                style={{
                  flexGrow: 1,
                  flexBasis: 120,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  padding: 10
                }}
              >
                <Text
                  style={{
                    fontSize: 9,
                    color: colors.muted,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                  }}
                >
                  {row.label}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: colors.heading,
                    fontWeight: '800',
                    marginTop: 3
                  }}
                >
                  ${row.value.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        ) : null}
      </View>

      <View
        style={{
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.teal + '45',
          backgroundColor: colors.teal + '12',
          padding: 12,
          gap: 8
        }}
      >
        <Text style={{ fontSize: 13, fontWeight: '700', color: colors.teal }}>
          Terminal Settlement
        </Text>

        {batchesLoading ? (
          <ActivityIndicator size='small' color={colors.teal} />
        ) : hasBatches ? (
          <View style={{ gap: 6 }}>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingVertical: 6,
                paddingHorizontal: 10,
                borderRadius: 8,
                backgroundColor: settledBatches.length > 0 ? colors.success + '15' : colors.warning + '15',
                borderWidth: 1,
                borderColor: settledBatches.length > 0 ? colors.success + '30' : colors.warning + '30',
              }}
            >
              {settledBatches.length > 0 ? (
                <Check size={14} color={colors.success} />
              ) : (
                <Clock size={14} color={colors.warning} />
              )}
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.heading }}>
                {settledBatches.length} batch{settledBatches.length !== 1 ? 'es' : ''} settled today
                {(batches || []).length > settledBatches.length
                  ? ` · ${(batches || []).length - settledBatches.length} pending`
                  : ''}
              </Text>
            </View>
            {settledBatches.slice(0, 3).map(b => (
              <View
                key={b.id}
                style={{
                  paddingVertical: 8,
                  paddingHorizontal: 10,
                  borderRadius: 8,
                  backgroundColor: colors.card,
                  borderWidth: 1,
                  borderColor: colors.border,
                  gap: 4,
                }}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 10, color: colors.muted, fontWeight: '600' }} numberOfLines={1}>
                    {b.batchId || b.id.slice(0, 8)}
                  </Text>
                  {b.closedAt && (
                    <Text style={{ fontSize: 9, color: colors.muted }}>
                      {new Date(b.closedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                  )}
                </View>
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                  <Text style={{ fontSize: 11, color: colors.label }}>
                    {b.transactionCount} txns · Tips ${b.tipAmount.toFixed(2)}
                  </Text>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={{ fontSize: 13, fontWeight: '800', color: colors.teal }}>
                      ${b.netDeposit.toFixed(2)}
                    </Text>
                    <Text style={{ fontSize: 8, color: colors.muted }}>net deposit</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>
        ) : (
          <Text style={{ fontSize: 11, color: colors.label, lineHeight: 16 }}>
            No batches settled today. Close the terminal batch to settle all
            captured payments with the acquiring banks.
          </Text>
        )}

        <TouchableOpacity
          onPress={onGoToSettlement}
          style={{
            borderRadius: 12,
            backgroundColor: colors.teal,
            paddingHorizontal: 12,
            paddingVertical: 10,
            alignItems: 'center'
          }}
        >
          <Text
            style={{ fontSize: 12, fontWeight: '700', color: colors.onSolid }}
          >
            {hasBatches ? 'Start New Settlement' : 'Open Settlement'}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
