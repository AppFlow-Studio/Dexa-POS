import { colors } from '@/lib/theme'
import { ChecklistItem } from '@/stores/useEndOfDayStore'
import { ActivityIndicator, Text, TouchableOpacity, View } from 'react-native'
import EodChecklistRow from '../EodChecklistRow'

interface EodStepOverviewProps {
  allItems: ChecklistItem[]
  blockingItems: ChecklistItem[]
  isLoading: boolean
  onRefresh: () => Promise<void> | void
  onOpenTables: () => void
  onOpenOrders: () => void
  onOpenCashDrawer: () => void
  onOpenTips: () => void
  onOpenStaff: () => void
}

export default function EodStepOverview ({
  allItems,
  blockingItems,
  isLoading,
  onRefresh,
  onOpenTables,
  onOpenOrders,
  onOpenCashDrawer,
  onOpenTips,
  onOpenStaff
}: EodStepOverviewProps) {
  const passed = allItems.filter(item => item.status === 'passed').length
  const failed = blockingItems.filter(item => item.status === 'failed').length
  const pending = blockingItems.filter(item => item.status === 'pending').length

  const hasTablesBlockers = blockingItems.some(
    item => item.id === 'tables_clear' || item.id === 'orders_closed'
  )
  const hasDrawerBlockers = blockingItems.some(
    item => item.id === 'cash_drawer_closed'
  )
  const hasTipBlockers = blockingItems.some(
    item => item.id === 'tips_distributed'
  )
  const hasShiftBlockers = blockingItems.some(
    item => item.id === 'shifts_reviewed'
  )

  const summaryCards = [
    {
      label: 'Checks',
      value: `${allItems.length}`,
      detail: `${passed} passed`
    },
    {
      label: 'Blockers',
      value: `${failed}`,
      detail: failed > 0 ? 'Need attention' : 'None active'
    },
    {
      label: 'Pending',
      value: `${pending}`,
      detail: pending > 0 ? 'Still waiting' : 'Ready to go'
    }
  ]

  return (
    <View style={{ flex: 1, justifyContent: 'space-between', gap: 10 }}>
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
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {summaryCards.map(card => (
            <View
              key={card.label}
              style={{
                flexGrow: 1,
                flexBasis: 110,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                paddingVertical: 10,
                paddingHorizontal: 10,
                gap: 2
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: colors.teal,
                  textTransform: 'uppercase',
                  letterSpacing: 0.6
                }}
              >
                {card.label}
              </Text>
              <Text
                style={{
                  fontSize: 22,
                  fontWeight: '800',
                  color: colors.heading,
                  lineHeight: 24
                }}
              >
                {card.value}
              </Text>
              <Text style={{ fontSize: 10.5, color: colors.label }}>
                {card.detail}
              </Text>
            </View>
          ))}
        </View>

        <TouchableOpacity
          onPress={() => void onRefresh()}
          style={{
            minHeight: 44,
            borderRadius: 14,
            backgroundColor: colors.teal + '18',
            borderWidth: 1,
            borderColor: colors.teal + '40',
            paddingHorizontal: 12,
            paddingVertical: 8,
            alignItems: 'center',
            justifyContent: 'center'
          }}
          disabled={isLoading}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {isLoading ? (
              <ActivityIndicator size='small' color={colors.teal} />
            ) : null}
            <Text
              style={{ fontSize: 12, fontWeight: '700', color: colors.teal }}
            >
              Refresh status
            </Text>
          </View>
        </TouchableOpacity>
      </View>

      {blockingItems.length > 0 ? (
        <View style={{ gap: 8 }}>
          <Text
            style={{ fontSize: 12.5, fontWeight: '700', color: colors.heading }}
          >
            Blockers to resolve
          </Text>
          {blockingItems.map(item => (
            <EodChecklistRow
              key={item.id}
              title={item.label}
              description={item.description}
              status={item.status}
              detail={item.detail}
              actionLabel={item.id === 'shifts_reviewed' ? 'Review' : undefined}
              onPress={item.id === 'shifts_reviewed' ? onOpenStaff : undefined}
            />
          ))}
        </View>
      ) : (
        <View
          style={{
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.teal + '50',
            backgroundColor: colors.teal + '15',
            padding: 12,
            gap: 3
          }}
        >
          <Text
            style={{ fontSize: 12.5, fontWeight: '700', color: colors.teal }}
          >
            All critical checks are clear.
          </Text>
          <Text style={{ fontSize: 11, color: colors.label }}>
            You can continue to Floor & Orders and confirm details as you
            complete each step.
          </Text>
        </View>
      )}

      <View style={{ gap: 8 }}>
        <Text
          style={{ fontSize: 12.5, fontWeight: '700', color: colors.heading }}
        >
          Quick actions
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <TouchableOpacity
            onPress={onOpenTables}
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              minHeight: 40,
              paddingHorizontal: 10,
              paddingVertical: 8,
              justifyContent: 'center'
            }}
          >
            <Text
              style={{ fontSize: 11, fontWeight: '600', color: colors.label }}
            >
              Go to tables
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onOpenOrders}
            style={{
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              minHeight: 40,
              paddingHorizontal: 10,
              paddingVertical: 8,
              justifyContent: 'center'
            }}
          >
            <Text
              style={{ fontSize: 11, fontWeight: '600', color: colors.label }}
            >
              Go to orders
            </Text>
          </TouchableOpacity>
          {hasDrawerBlockers ? (
            <TouchableOpacity
              onPress={onOpenCashDrawer}
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                minHeight: 40,
                paddingHorizontal: 10,
                paddingVertical: 8,
                justifyContent: 'center'
              }}
            >
              <Text
                style={{ fontSize: 11, fontWeight: '600', color: colors.label }}
              >
                Open drawer
              </Text>
            </TouchableOpacity>
          ) : null}
          {hasTipBlockers ? (
            <TouchableOpacity
              onPress={onOpenTips}
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                minHeight: 40,
                paddingHorizontal: 10,
                paddingVertical: 8,
                justifyContent: 'center'
              }}
            >
              <Text
                style={{ fontSize: 11, fontWeight: '600', color: colors.label }}
              >
                Open tips wizard
              </Text>
            </TouchableOpacity>
          ) : null}
          {hasShiftBlockers ? (
            <TouchableOpacity
              onPress={onOpenStaff}
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.card,
                minHeight: 40,
                paddingHorizontal: 10,
                paddingVertical: 8,
                justifyContent: 'center'
              }}
            >
              <Text
                style={{ fontSize: 11, fontWeight: '600', color: colors.label }}
              >
                Review staff
              </Text>
            </TouchableOpacity>
          ) : null}
        </View>
      </View>
    </View>
  )
}
