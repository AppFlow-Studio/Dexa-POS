import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import {
  ChecklistItem,
  ChecklistItemId,
  OpenOrderSummary
} from '@/stores/useEndOfDayStore'
import { Text, TouchableOpacity, View } from 'react-native'
import EodChecklistRow from '../EodChecklistRow'

const resolveItem = (
  list: ChecklistItem[],
  id: ChecklistItemId
): ChecklistItem | undefined => list.find(i => i.id === id)

interface EodStepFloorOrdersProps {
  checklist: ChecklistItem[]
  isRunning: boolean
  onRefresh: () => Promise<void> | void
  onOpenTables: () => void
  onOpenOrders: () => void
  openOrders: OpenOrderSummary[]
  isBulkClosing: boolean
  onBulkClose: (orderIds: string[]) => Promise<void>
  onNavigateToOrder: (orderId: string) => void
  onPayOrder: (orderId: string) => Promise<void>
}

export default function EodStepFloorOrders ({
  checklist,
  isRunning,
  onRefresh,
  onOpenTables,
  onOpenOrders,
  openOrders,
  isBulkClosing,
  onBulkClose,
  onNavigateToOrder,
  onPayOrder
}: EodStepFloorOrdersProps) {
  const scale = useUiScale()
  const s = (value: number) => Math.round(value * scale)

  const tablesItem = resolveItem(checklist, 'tables_clear')
  const ordersItem = resolveItem(checklist, 'orders_closed')

  const isPassed =
    tablesItem?.status === 'passed' && ordersItem?.status === 'passed'

  return (
    <View style={{ flex: 1, justifyContent: 'space-between', gap: s(10) }}>
      <View
        style={{
          borderRadius: s(16),
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.panel,
          padding: s(12),
          gap: s(10)
        }}
      >
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8) }}>
          <View
            style={{
              flexGrow: 1,
              flexBasis: 160,
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: s(10),
              gap: s(4)
            }}
          >
            <Text
              style={{
                fontSize: s(10),
                fontWeight: '700',
                color: colors.teal,
                textTransform: 'uppercase',
                letterSpacing: 0.6
              }}
            >
              Open orders
            </Text>
            <Text
              style={{
                fontSize: s(21),
                fontWeight: '800',
                color: colors.heading,
                lineHeight: s(24)
              }}
            >
              {openOrders.length}
            </Text>
            <Text style={{ fontSize: s(10.5), color: colors.label }}>
              Need review before closeout
            </Text>
          </View>
          <View
            style={{
              flexGrow: 1,
              flexBasis: 160,
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: s(10),
              gap: s(4)
            }}
          >
            <Text
              style={{
                fontSize: s(10),
                fontWeight: '700',
                color: colors.teal,
                textTransform: 'uppercase',
                letterSpacing: 0.6
              }}
            >
              Tables
            </Text>
            <Text
              style={{
                fontSize: s(21),
                fontWeight: '800',
                color: colors.heading,
                lineHeight: s(24)
              }}
            >
              {tablesItem?.status === 'passed' ? 'Clear' : 'Active'}
            </Text>
            <Text style={{ fontSize: s(10.5), color: colors.label }}>
              {tablesItem?.detail || 'Check active floor sessions'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => void onRefresh()}
          style={{
            minHeight: s(42),
            borderRadius: s(12),
            backgroundColor: colors.teal + '18',
            borderWidth: 1,
            borderColor: colors.teal + '40',
            paddingHorizontal: s(12),
            paddingVertical: s(8),
            alignItems: 'center',
            justifyContent: 'center'
          }}
          disabled={isRunning}
        >
          <Text
            style={{ fontSize: s(11.5), fontWeight: '700', color: colors.teal }}
          >
            Refresh status
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: s(10),
          alignItems: 'stretch'
        }}
      >
        <View style={{ flexGrow: 1, flexBasis: 260, height: s(92) }}>
          <EodChecklistRow
            title='Floor status'
            description={tablesItem?.description}
            status={tablesItem?.status || 'pending'}
            detail={tablesItem?.detail}
            actionLabel='Go to tables'
            onPress={onOpenTables}
            actionOnly
            centerContent
            containerStyle={{ flex: 1, paddingVertical: s(6) }}
          />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 260, height: s(92) }}>
          <EodChecklistRow
            title='Order closure'
            description={ordersItem?.description}
            status={ordersItem?.status || 'pending'}
            detail={ordersItem?.detail}
            actionLabel='Go to orders'
            onPress={onOpenOrders}
            actionOnly
            centerContent
            containerStyle={{ flex: 1, paddingVertical: s(6) }}
          />
        </View>
      </View>

      <View
        style={{
          borderRadius: s(14),
          borderWidth: 1,
          borderColor: colors.teal + '50',
          backgroundColor: colors.teal + '15',
          paddingHorizontal: s(12),
          paddingVertical: s(10)
        }}
      >
        <Text style={{ fontSize: s(12.5), fontWeight: '700', color: colors.teal }}>
          {isPassed
            ? 'Floor and orders checks are complete.'
            : 'This step resolves when both checks are passing.'}
        </Text>
      </View>
    </View>
  )
}
