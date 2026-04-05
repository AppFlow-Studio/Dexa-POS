import { colors } from '@/lib/theme'
import { ChecklistItem, ChecklistItemId } from '@/stores/useEndOfDayStore'
import { Text, TouchableOpacity, View } from 'react-native'
import EodChecklistRow from '../EodChecklistRow'

interface EodStepCashProps {
  checklist: ChecklistItem[]
  onOpenCashDrawer: () => void
  onRefresh: () => Promise<void> | void
}

const resolveItem = (
  list: ChecklistItem[],
  id: ChecklistItemId
): ChecklistItem | undefined => list.find(i => i.id === id)

export default function EodStepCash ({
  checklist,
  onOpenCashDrawer,
  onRefresh
}: EodStepCashProps) {
  const drawerItem = resolveItem(checklist, 'cash_drawer_closed')
  const isPassed = drawerItem?.status === 'passed'

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
        <View
          style={{
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
            Cash drawer status
          </Text>
          <Text
            style={{ fontSize: 20, fontWeight: '800', color: colors.heading }}
          >
            {isPassed ? 'Closed' : 'Needs review'}
          </Text>
          <Text
            style={{ fontSize: 10.5, color: colors.label }}
            numberOfLines={1}
          >
            {drawerItem?.detail ||
              'Run reconciliation and close remaining drawers'}
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <TouchableOpacity
            onPress={onOpenCashDrawer}
            style={{
              flexGrow: 1,
              flexBasis: 220,
              minHeight: 42,
              borderRadius: 12,
              backgroundColor: colors.teal + '20',
              borderWidth: 1,
              borderColor: colors.teal + '50',
              paddingHorizontal: 10,
              paddingVertical: 8,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text
              style={{ fontSize: 11.5, fontWeight: '700', color: colors.teal }}
            >
              Open Cash Drawer Sheet
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => void onRefresh()}
            style={{
              flexGrow: 1,
              flexBasis: 160,
              minHeight: 42,
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingHorizontal: 10,
              paddingVertical: 8,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Text
              style={{ fontSize: 11.5, fontWeight: '600', color: colors.label }}
            >
              Refresh status
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <View style={{ height: 92 }}>
        <EodChecklistRow
          title='Cash drawer close'
          description={drawerItem?.description}
          status={drawerItem?.status || 'pending'}
          detail={drawerItem?.detail}
          centerContent
          containerStyle={{ flex: 1, paddingVertical: 6 }}
        />
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
            ? 'Cash drawer checks are complete.'
            : 'This step resolves when drawers are reconciled and closed.'}
        </Text>
      </View>
    </View>
  )
}
