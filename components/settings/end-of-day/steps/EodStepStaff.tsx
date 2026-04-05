import { colors } from '@/lib/theme'
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
  const staffItem = resolveItem(checklist, 'shifts_reviewed')
  const hasOtherActiveSessions = useTimeclockStore(s =>
    Object.keys(s.sessions).some(id => id !== s.activeEmployeeId)
  )

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
            Staff Review
          </Text>
          <Text style={{ fontSize: 11, color: colors.label, lineHeight: 16 }}>
            Review active shifts and finish any remaining clock-out actions
            before close out.
          </Text>
        </View>

        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          <View
            style={{
              flexGrow: 1,
              flexBasis: 130,
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
              Active Sessions
            </Text>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '800',
                color: colors.heading,
                marginTop: 3
              }}
            >
              {hasOtherActiveSessions ? 'Need review' : 'All clear'}
            </Text>
          </View>
          <View
            style={{
              flexGrow: 1,
              flexBasis: 130,
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
              Next Action
            </Text>
            <Text
              style={{
                fontSize: 15,
                fontWeight: '800',
                color: colors.teal,
                marginTop: 3
              }}
            >
              Timeclock
            </Text>
          </View>
        </View>

        <View style={{ gap: 8 }}>
          <TouchableOpacity
            onPress={onOpenTimeclock}
            style={{
              borderRadius: 12,
              backgroundColor: colors.teal + '18',
              borderWidth: 1,
              borderColor: colors.teal + '45',
              paddingHorizontal: 12,
              paddingVertical: 11,
              alignItems: 'center'
            }}
          >
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: colors.teal }}
            >
              Open Timeclock
            </Text>
          </TouchableOpacity>
          {hasOtherActiveSessions && (
            <TouchableOpacity
              onPress={onOpenBulkClockOut}
              style={{
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.danger + '45',
                backgroundColor: colors.danger + '14',
                paddingHorizontal: 12,
                paddingVertical: 11,
                alignItems: 'center'
              }}
            >
              <Text
                style={{
                  fontSize: 13,
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
              borderRadius: 12,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              paddingHorizontal: 12,
              paddingVertical: 11,
              alignItems: 'center'
            }}
          >
            <Text
              style={{ fontSize: 13, color: colors.label, fontWeight: '600' }}
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
