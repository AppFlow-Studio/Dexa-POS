import { colors } from '@/lib/theme'
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
  const tablesItem = resolveItem(checklist, 'tables_clear')
  const ordersItem = resolveItem(checklist, 'orders_closed')

  const isPassed =
    tablesItem?.status === 'passed' && ordersItem?.status === 'passed'

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
          <View
            style={{
              flexGrow: 1,
              flexBasis: 160,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: 10,
              gap: 4
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
              Open orders
            </Text>
            <Text
              style={{
                fontSize: 21,
                fontWeight: '800',
                color: colors.heading,
                lineHeight: 24
              }}
            >
              {openOrders.length}
            </Text>
            <Text style={{ fontSize: 10.5, color: colors.label }}>
              Need review before closeout
            </Text>
          </View>
          <View
            style={{
              flexGrow: 1,
              flexBasis: 160,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: 10,
              gap: 4
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
              Tables
            </Text>
            <Text
              style={{
                fontSize: 21,
                fontWeight: '800',
                color: colors.heading,
                lineHeight: 24
              }}
            >
              {tablesItem?.status === 'passed' ? 'Clear' : 'Active'}
            </Text>
            <Text style={{ fontSize: 10.5, color: colors.label }}>
              {tablesItem?.detail || 'Check active floor sessions'}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          onPress={() => void onRefresh()}
          style={{
            minHeight: 42,
            borderRadius: 12,
            backgroundColor: colors.teal + '18',
            borderWidth: 1,
            borderColor: colors.teal + '40',
            paddingHorizontal: 12,
            paddingVertical: 8,
            alignItems: 'center',
            justifyContent: 'center'
          }}
          disabled={isRunning}
        >
          <Text
            style={{ fontSize: 11.5, fontWeight: '700', color: colors.teal }}
          >
            Refresh status
          </Text>
        </TouchableOpacity>
      </View>

      <View
        style={{
          flexDirection: 'row',
          flexWrap: 'wrap',
          gap: 10,
          alignItems: 'stretch'
        }}
      >
        <View style={{ flexGrow: 1, flexBasis: 260, height: 92 }}>
          <EodChecklistRow
            title='Floor status'
            description={tablesItem?.description}
            status={tablesItem?.status || 'pending'}
            detail={tablesItem?.detail}
            actionLabel='Go to tables'
            onPress={onOpenTables}
            actionOnly
            centerContent
            containerStyle={{ flex: 1, paddingVertical: 6 }}
          />
        </View>
        <View style={{ flexGrow: 1, flexBasis: 260, height: 92 }}>
          <EodChecklistRow
            title='Order closure'
            description={ordersItem?.description}
            status={ordersItem?.status || 'pending'}
            detail={ordersItem?.detail}
            actionLabel='Go to orders'
            onPress={onOpenOrders}
            actionOnly
            centerContent
            containerStyle={{ flex: 1, paddingVertical: 6 }}
          />
        </View>
      </View>

      <View
        style={{
          borderRadius: 14,
          borderWidth: 1,
          borderColor: colors.teal + '50',
          backgroundColor: colors.teal + '15',
          paddingHorizontal: 12,
          paddingVertical: 10
        }}
      >
        <Text style={{ fontSize: 12.5, fontWeight: '700', color: colors.teal }}>
          {isPassed
            ? 'Floor and orders checks are complete.'
            : 'This step resolves when both checks are passing.'}
        </Text>
      </View>
    </View>
  )
}
