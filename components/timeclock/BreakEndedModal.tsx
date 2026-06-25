import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { Shift } from '@/stores/useTimeclockStore' // Assuming this type is in types.ts
import { Clock } from 'lucide-react-native'
import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Dialog, DialogContent } from '../ui/dialog'

interface BreakEndedModalProps {
  isOpen: boolean
  onClockIn: () => void
  shift: Shift | null
}

// Helper function to format the duration from milliseconds (can be moved to a utils file)
const formatDuration = (milliseconds: number): string => {
  if (isNaN(milliseconds) || milliseconds < 0) {
    return '00h : 00m : 00s'
  }
  const totalSeconds = Math.floor(milliseconds / 1000)
  const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0')
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(
    2,
    '0'
  )
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${hours}h : ${minutes}m : ${seconds}s`
}

const BreakEndedModal: React.FC<BreakEndedModalProps> = ({
  isOpen,
  onClockIn,
  shift
}) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  // All data now comes from the `shift` object that was captured when the break ended.
  const endTime = shift?.breakEndTime || new Date()
  const startTime = shift?.breakStartTime || null

  const durationMs =
    startTime && endTime ? endTime.getTime() - startTime.getTime() : 0

  const breakDetails = {
    start: startTime
      ? startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
      : 'N/A',
    end: endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
    duration: formatDuration(durationMs)
  }

  return (
    <Dialog open={isOpen}>
      <DialogContent
        className='p-0 overflow-hidden'
        style={{ width: s(400), borderRadius: s(16), borderColor: colors.border }}
      >
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: s(16),
            overflow: 'hidden',
            alignItems: 'center',
            padding: s(28),
            gap: s(12)
          }}
        >
          <View
            style={{
              width: s(64),
              height: s(64),
              borderRadius: s(32),
              backgroundColor: colors.info + '20',
              borderWidth: 2,
              borderColor: colors.info + '40',
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Clock color={colors.info} size={s(28)} />
          </View>

          <Text
            style={{
              fontSize: s(22),
              fontWeight: '700',
              color: colors.heading,
              marginTop: s(4)
            }}
          >
            Break Ended
          </Text>

          <Text
            style={{
              fontSize: s(14),
              color: colors.label,
              textAlign: 'center',
              lineHeight: s(20)
            }}
          >
            Break started at {breakDetails.start} and ended at{' '}
            {breakDetails.end}
            {'\n'}({breakDetails.duration})
          </Text>

          <TouchableOpacity
            onPress={onClockIn}
            style={{
              width: '100%',
              marginTop: s(8),
              paddingVertical: s(14),
              backgroundColor: colors.teal,
              borderRadius: s(10),
              alignItems: 'center'
            }}
          >
            <Text
              style={{ fontWeight: '700', color: colors.onSolid, fontSize: s(15) }}
            >
              Clock In
            </Text>
          </TouchableOpacity>
        </View>
      </DialogContent>
    </Dialog>
  )
}

export default BreakEndedModal
