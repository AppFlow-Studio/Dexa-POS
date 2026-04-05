import { colors } from '@/lib/theme'
import { DailySummary } from '@/stores/useEndOfDayStore'
import { Text, TouchableOpacity, View } from 'react-native'

interface EodStepPaymentsPlaceholderProps {
  summary: DailySummary | null
  summaryLoading: boolean
  onGoToSettlement: () => void
}

export default function EodStepPaymentsPlaceholder ({
  summary,
  summaryLoading,
  onGoToSettlement
}: EodStepPaymentsPlaceholderProps) {
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
        <Text style={{ fontSize: 11, color: colors.label, lineHeight: 16 }}>
          Close the terminal batch and settle all captured payments with the
          acquiring banks. Tips cannot be adjusted after settlement.
        </Text>
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
            Open Settlement
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}
