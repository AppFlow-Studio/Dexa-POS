import { colors } from '@/lib/theme'
import {
  ChecklistItem,
  ChecklistItemId,
  DailySummary
} from '@/stores/useEndOfDayStore'
import { Text, TouchableOpacity, View } from 'react-native'
import EodChecklistRow from '../EodChecklistRow'

const resolveItem = (
  list: ChecklistItem[],
  id: ChecklistItemId
): ChecklistItem | undefined => list.find(i => i.id === id)

interface EodStepReportProps {
  checklist: ChecklistItem[]
  summary: DailySummary | null
  summaryLoading: boolean
  onRunSummary: () => void
  canComplete: boolean
  onContinueWithIssues: () => void
}

export default function EodStepReport ({
  checklist,
  summary,
  summaryLoading,
  onRunSummary,
  canComplete,
  onContinueWithIssues
}: EodStepReportProps) {
  const reportItem = resolveItem(checklist, 'report_generated')
  const blockers = checklist.filter(item => item.status === 'failed').length
  const summaryCards = summary
    ? [
        { label: 'Gross sales', value: summary.totalSales },
        { label: 'Tips', value: summary.totalTips },
        { label: 'Discounts', value: summary.totalDiscounts },
        { label: 'Labor', value: summary.totalLaborCost }
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
            Sales Summary
          </Text>
          <Text style={{ fontSize: 11, color: colors.label, lineHeight: 16 }}>
            Run the summary, review totals, then finish the close out.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View
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
                fontSize: 10,
                color: colors.muted,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}
            >
              Checklist
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: '800',
                color: colors.heading,
                marginTop: 3
              }}
            >
              {checklist.length}
            </Text>
          </View>
          <View
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
                fontSize: 10,
                color: colors.muted,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}
            >
              Passed
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: '800',
                color: colors.teal,
                marginTop: 3
              }}
            >
              {checklist.filter(item => item.status === 'passed').length}
            </Text>
          </View>
          <View
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
                fontSize: 10,
                color: colors.muted,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: 0.5
              }}
            >
              Blockers
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: '800',
                color: colors.danger,
                marginTop: 3
              }}
            >
              {blockers}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={onRunSummary}
          style={{
            borderRadius: 12,
            backgroundColor: colors.teal + '18',
            borderWidth: 1,
            borderColor: colors.teal + '45',
            paddingHorizontal: 12,
            paddingVertical: 11,
            alignItems: 'center'
          }}
          disabled={summaryLoading}
        >
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.teal }}>
            {summaryLoading ? 'Running summary...' : 'Run daily summary'}
          </Text>
        </TouchableOpacity>
      </View>

      <EodChecklistRow
        title='Report generated'
        description={reportItem?.description}
        status={reportItem?.status || 'pending'}
        detail={reportItem?.detail}
      />

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
            Totals Snapshot
          </Text>
          {summaryLoading ? (
            <Text style={{ fontSize: 10, color: colors.label }}>
              Loading...
            </Text>
          ) : null}
        </View>

        {summaryLoading ? (
          <Text style={{ fontSize: 11, color: colors.label }}>Loading…</Text>
        ) : !summary ? (
          <Text style={{ fontSize: 11, color: colors.label }}>
            Run summary to see totals and close your day.
          </Text>
        ) : (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {summaryCards.map(card => (
              <View
                key={card.label}
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
                    fontSize: 10,
                    color: colors.muted,
                    fontWeight: '700',
                    textTransform: 'uppercase',
                    letterSpacing: 0.5
                  }}
                >
                  {card.label}
                </Text>
                <Text
                  style={{
                    fontSize: 14,
                    color: colors.heading,
                    fontWeight: '800',
                    marginTop: 3
                  }}
                >
                  ${card.value.toFixed(2)}
                </Text>
              </View>
            ))}
          </View>
        )}
      </View>

      {summary && (summary.topItem || summary.topServer || summary.busyHour) ? (
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
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>
            Highlights
          </Text>
          <View style={{ gap: 8 }}>
            {summary.topItem ? (
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  paddingHorizontal: 12,
                  paddingVertical: 9
                }}
              >
                <View style={{ gap: 2 }}>
                  <Text style={{ fontSize: 10, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Top Item
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>
                    {summary.topItem.name}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.teal }}>
                    {summary.topItem.quantity}x
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.label }}>
                    ${summary.topItem.revenue.toFixed(2)}
                  </Text>
                </View>
              </View>
            ) : null}
            {summary.topServer ? (
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  paddingHorizontal: 12,
                  paddingVertical: 9
                }}
              >
                <View style={{ gap: 2 }}>
                  <Text style={{ fontSize: 10, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Top Server
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>
                    {summary.topServer.name}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 2 }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.teal }}>
                    ${summary.topServer.revenue.toFixed(2)}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.label }}>
                    {summary.topServer.orderCount} orders
                  </Text>
                </View>
              </View>
            ) : null}
            {summary.busyHour ? (
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.border,
                  backgroundColor: colors.card,
                  paddingHorizontal: 12,
                  paddingVertical: 9
                }}
              >
                <View style={{ gap: 2 }}>
                  <Text style={{ fontSize: 10, color: colors.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Busiest Hour
                  </Text>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>
                    {summary.busyHour.hour === 0 ? '12 AM' : summary.busyHour.hour < 12 ? `${summary.busyHour.hour} AM` : summary.busyHour.hour === 12 ? '12 PM' : `${summary.busyHour.hour - 12} PM`}
                  </Text>
                </View>
                <View style={{ alignItems: 'flex-end' }}>
                  <Text style={{ fontSize: 13, fontWeight: '800', color: colors.teal }}>
                    {summary.busyHour.orderCount} orders
                  </Text>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      ) : null}

      {!canComplete ? (
        <TouchableOpacity
          onPress={onContinueWithIssues}
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.warning + '50',
            backgroundColor: colors.warning + '15',
            paddingHorizontal: 12,
            paddingVertical: 11,
            alignItems: 'center'
          }}
        >
          <Text
            style={{ fontSize: 13, fontWeight: '700', color: colors.warning }}
          >
            Continue with issues
          </Text>
        </TouchableOpacity>
      ) : null}
    </View>
  )
}
