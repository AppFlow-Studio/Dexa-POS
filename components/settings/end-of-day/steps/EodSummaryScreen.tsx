import { colors } from '@/lib/theme'
import { ChecklistItem } from '@/stores/useEndOfDayStore'
import { Text, View } from 'react-native'
import EodChecklistRow from '../EodChecklistRow'

interface EodSummaryScreenProps {
  checklist: ChecklistItem[]
  blockingItems: ChecklistItem[]
  canComplete: boolean
}

export default function EodSummaryScreen ({
  checklist,
  blockingItems,
  canComplete
}: EodSummaryScreenProps) {
  const passed = checklist.filter(item => item.status === 'passed').length
  const failed = blockingItems.filter(item => item.status === 'failed').length

  return (
    <View style={{ gap: 10 }}>
      <View
        style={{
          borderRadius: 18,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: 12,
          gap: 10
        }}
      >
        <View style={{ gap: 4 }}>
          <Text
            style={{ fontSize: 18, fontWeight: '800', color: colors.heading }}
          >
            Close Out Summary
          </Text>
          <Text style={{ fontSize: 12, color: colors.label, lineHeight: 17 }}>
            Review the final checklist status before completing the day.
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
              Checks
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
              {passed}
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
              {failed}
            </Text>
          </View>
        </View>

        <View
          style={{
            borderRadius: 12,
            borderWidth: 1,
            borderColor: canComplete
              ? colors.teal + '45'
              : colors.warning + '45',
            backgroundColor: canComplete
              ? colors.teal + '12'
              : colors.warning + '12',
            padding: 10
          }}
        >
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: canComplete ? colors.teal : colors.warning
            }}
          >
            {canComplete ? 'Ready to complete' : 'Not ready yet'}
          </Text>
          <Text
            style={{
              fontSize: 11,
              color: colors.label,
              marginTop: 4,
              lineHeight: 16
            }}
          >
            {canComplete
              ? 'All required items are complete or intentionally overridden.'
              : 'Resolve blockers or confirm override to complete close out.'}
          </Text>
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
        <Text
          style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}
        >
          Checklist Details
        </Text>
        {checklist.map(item => (
          <EodChecklistRow
            key={item.id}
            title={item.label}
            description={item.description}
            status={item.status}
            detail={item.detail}
          />
        ))}
      </View>
    </View>
  )
}
