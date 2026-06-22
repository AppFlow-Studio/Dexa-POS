import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { ChecklistItem, ChecklistItemId } from '@/stores/useEndOfDayStore'
import { useTimeclockStore } from '@/stores/useTimeclockStore'
import { Text, TouchableOpacity, View } from 'react-native'
import EodChecklistRow from '../EodChecklistRow'

const resolveItem = (
  list: ChecklistItem[],
  id: ChecklistItemId
): ChecklistItem | undefined => list.find(i => i.id === id)

interface EodStepStaffProps {
  checklist: ChecklistItem[]
  onOpenTimeclock: () => void
  onOpenBulkClockOut: () => void
  onRefresh: () => Promise<void> | void
}

export default function EodStepStaff ({
  checklist,
  onOpenTimeclock,
  onOpenBulkClockOut,
  onRefresh
}: EodStepStaffProps) {
  const scale = useUiScale()
  const s = (value: number) => Math.round(value * scale)
  const staffItem = resolveItem(checklist, 'shifts_reviewed')
  const hasOtherActiveSessions = useTimeclockStore(s =>
    Object.keys(s.sessions).some(id => id !== s.activeEmployeeId)
  )

  return (
    <View style={{ gap: s(10) }}>
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
        <View style={{ gap: s(4) }}>
          <Text
            style={{ fontSize: s(14), fontWeight: '700', color: colors.heading }}
          >
            Staff Review
          </Text>
          <Text style={{ fontSize: s(11), color: colors.label, lineHeight: s(16) }}>
            Review active shifts and finish any remaining clock-out actions
            before close out.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(8) }}>
          <View
            style={{
              flexGrow: 1,
              flexBasis: s(130),
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: s(10)
            }}
          >
            <Text
              style={{
                fontSize: s(10),
                color: colors.muted,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: s(0.5)
              }}
            >
              Active Sessions
            </Text>
            <Text
              style={{
                fontSize: s(15),
                fontWeight: '800',
                color: colors.heading,
                marginTop: s(3)
              }}
            >
              {hasOtherActiveSessions ? 'Need review' : 'All clear'}
            </Text>
          </View>
          <View
            style={{
              flexGrow: 1,
              flexBasis: s(130),
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              padding: s(10)
            }}
          >
            <Text
              style={{
                fontSize: s(10),
                color: colors.muted,
                fontWeight: '700',
                textTransform: 'uppercase',
                letterSpacing: s(0.5)
              }}
            >
              Next Action
            </Text>
            <Text
              style={{
                fontSize: s(15),
                fontWeight: '800',
                color: colors.teal,
                marginTop: s(3)
              }}
            >
              Timeclock
            </Text>
          </View>
        </View>

        <View style={{ gap: s(8) }}>
          <TouchableOpacity
            onPress={onOpenTimeclock}
            style={{
              borderRadius: s(12),
              backgroundColor: colors.teal + '18',
              borderWidth: 1,
              borderColor: colors.teal + '45',
              paddingHorizontal: s(12),
              paddingVertical: s(11),
              alignItems: 'center'
            }}
          >
            <Text
              style={{ fontSize: s(13), fontWeight: '700', color: colors.teal }}
            >
              Open Timeclock
            </Text>
          </TouchableOpacity>
          {hasOtherActiveSessions && (
            <TouchableOpacity
              onPress={onOpenBulkClockOut}
              style={{
                borderRadius: s(12),
                borderWidth: 1,
                borderColor: colors.danger + '45',
                backgroundColor: colors.danger + '14',
                paddingHorizontal: s(12),
                paddingVertical: s(11),
                alignItems: 'center'
              }}
            >
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: '700',
                  color: colors.danger
                }}
              >
                End All Shifts
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => void onRefresh()}
            style={{
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingHorizontal: s(12),
              paddingVertical: s(11),
              alignItems: 'center'
            }}
          >
            <Text
              style={{ fontSize: s(13), color: colors.label, fontWeight: '600' }}
            >
              Refresh status
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <EodChecklistRow
        title='Staff clock-out'
        description={staffItem?.description}
        status={staffItem?.status || 'pending'}
        detail={staffItem?.detail}
      />
    </View>
  )
}
