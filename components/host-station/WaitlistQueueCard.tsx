import { colors } from '@/lib/theme'
import { WaitlistEntry } from '@/types/db-floor-plan-types'
import {
  AlertCircle,
  Bell,
  Check,
  ChevronLeft,
  Clock,
  GripVertical,
  Lightbulb,
  Mail,
  Phone,
  PhoneOff,
  StickyNote,
  Users,
  X
} from 'lucide-react-native'
import React, { useMemo, useRef, useState } from 'react'
import {
  Animated,
  PanResponder,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { SharedValue } from 'react-native-reanimated'

interface WaitlistQueueCardProps {
  entry: WaitlistEntry
  position: number
  now: number
  onNotify: () => void
  onSeat: () => void
  onCancel: () => void
  onMarkNoShow: () => void
  onOfferComp?: () => void
  dragGesture?: ReturnType<typeof Gesture.Simultaneous>
  isDragging?: SharedValue<boolean>
}

const getStatusColor = (
  status: string,
  isOverdue: boolean,
  isApproaching: boolean
) => {
  if (isOverdue) return '#ef4444'
  if (isApproaching) return '#f59e0b'
  switch (status) {
    case 'waiting':
      return '#ffffff'
    case 'notified':
      return '#3b82f6'
    case 'arrived':
      return '#10b981'
    case 'expired':
      return '#ef4444'
    default:
      return '#6b7280'
  }
}

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'waiting':
      return 'WAITING'
    case 'notified':
      return 'NOTIFIED'
    case 'arrived':
      return 'ARRIVED'
    case 'expired':
      return 'EXPIRED'
    default:
      return status.toUpperCase()
  }
}

function getElapsedMinutes (createdAt: string): number {
  if (!createdAt) return 0
  return Math.max(
    0,
    Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)
  )
}

function formatElapsed (minutes: number): string {
  if (!minutes || minutes < 0) return '0m'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export const WaitlistQueueCard: React.FC<WaitlistQueueCardProps> = ({
  entry,
  position,
  now,
  onNotify,
  onSeat,
  onCancel,
  onMarkNoShow,
  onOfferComp,
  dragGesture
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [swipeOffset] = useState(new Animated.Value(0))

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_, gs) =>
        Math.abs(gs.dx) > 5 && Math.abs(gs.dy) < 20,
      onPanResponderMove: (_, gs) => {
        if (gs.dx < 0) {
          swipeOffset.setValue(gs.dx)
        }
      },
      onPanResponderRelease: (_, gs) => {
        if (gs.dx < -80) {
          Animated.timing(swipeOffset, {
            toValue: -280,
            duration: 300,
            useNativeDriver: false
          }).start()
        } else {
          Animated.timing(swipeOffset, {
            toValue: 0,
            duration: 300,
            useNativeDriver: false
          }).start()
        }
      }
    })
  ).current

  const elapsed = useMemo(
    () => getElapsedMinutes(entry.created_at),
    [entry.created_at, now]
  )
  const isOverdue = elapsed > (entry.quoted_wait_minutes || 0)
  const isApproaching =
    elapsed > (entry.quoted_wait_minutes || 0) * 0.8 && !isOverdue

  // Calculate if wait exceeds quoted by >10 minutes
  const overtimeMinutes = Math.max(
    0,
    elapsed - (entry.quoted_wait_minutes || 0)
  )
  const isSignificantlyOverdue = overtimeMinutes > 10

  const statusColor = getStatusColor(
    entry.status,
    isOverdue || isSignificantlyOverdue,
    isApproaching
  )
  const hasPhone = Boolean(entry.phone?.replace(/\D/g, ''))

  const closeSwipe = () =>
    Animated.timing(swipeOffset, {
      toValue: 0,
      duration: 300,
      useNativeDriver: false
    }).start()

  return (
    <View className='overflow-hidden rounded-xl bg-card border border-border'>
      {/* Swipeable Background Actions */}
      <View className='absolute inset-0 flex-row items-center justify-end gap-1 px-3'>
        <TouchableOpacity
          onPress={() => {
            closeSwipe()
            onMarkNoShow()
          }}
          className='px-3 py-2 rounded-lg bg-red-900/80'
        >
          <Text className='text-white text-xs font-semibold'>NO-SHOW</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            closeSwipe()
            onCancel()
          }}
          className='px-3 py-2 rounded-lg bg-red-700/80'
        >
          <Text className='text-white text-xs font-semibold'>CANCEL</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            closeSwipe()
            onNotify()
          }}
          className='px-3 py-2 rounded-lg bg-blue-600/80'
        >
          <Text className='text-white text-xs font-semibold'>NOTIFY</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => {
            onSeat()
            closeSwipe()
          }}
          className='px-3 py-2 rounded-lg bg-teal'
        >
          <Text className='text-white text-xs font-semibold'>SEAT</Text>
        </TouchableOpacity>
      </View>

      {/* Card Content */}
      <Animated.View
        style={{ transform: [{ translateX: swipeOffset }] }}
        {...panResponder.panHandlers}
        className='bg-card'
      >
        {/* Header */}
        <View className='flex-row items-center px-4 py-3'>
          {/* Drag Handle */}
          {dragGesture && (
            <GestureDetector gesture={dragGesture}>
              <View className='mr-2 py-1 opacity-30'>
                <GripVertical size={18} color={colors.label} />
              </View>
            </GestureDetector>
          )}

          <TouchableOpacity
            onPress={() => setIsExpanded(!isExpanded)}
            className='flex-1 flex-row items-center'
          >
            {/* Position Badge */}
            <View
              className='w-10 h-10 rounded-full items-center justify-center border-2'
              style={{
                borderColor: statusColor,
                backgroundColor: isOverdue
                  ? '#7f1d1d'
                  : isApproaching
                  ? '#7c3a0d'
                  : 'transparent'
              }}
            >
              <Text
                className='font-bold text-sm'
                style={{ color: statusColor }}
              >
                #{position}
              </Text>
            </View>

            {/* Party Info */}
            <View className='flex-1 ml-3'>
              <Text
                className='text-white font-semibold text-base'
                numberOfLines={1}
              >
                {entry.party_name}
              </Text>
              <View className='flex-row items-center gap-1 mt-1'>
                <Users size={12} color={colors.muted} />
                <Text className='text-white text-xs font-medium'>
                  {entry.party_size || 0}
                </Text>
                <Text className='text-muted text-xs mx-0.5'>•</Text>
                <Text className='text-white text-xs font-medium'>
                  Q: {formatElapsed(entry.quoted_wait_minutes || 0)}
                </Text>
                <Text className='text-muted text-xs mx-0.5'>•</Text>
                <Clock size={12} color={colors.muted} />
                <Text className='text-white text-xs font-medium'>
                  {formatElapsed(elapsed) || '0m'}
                </Text>
              </View>
            </View>

            {/* Status Badge + No-Phone Icon */}
            <View className='flex-row items-center gap-1.5 ml-3'>
              {(entry.notification_failures ?? 0) > 0 && (
                <View className='px-2 py-1 rounded-lg bg-red-600 border border-red-500'>
                  <Text className='text-white text-xs font-bold'>
                    SMS FAIL {entry.notification_failures}
                  </Text>
                </View>
              )}
              <View
                className='px-2.5 py-1 rounded-lg'
                style={{
                  backgroundColor: statusColor + '20',
                  borderWidth: 1,
                  borderColor: statusColor
                }}
              >
                <Text
                  className='text-xs font-bold'
                  style={{ color: statusColor }}
                >
                  {getStatusLabel(entry.status)}
                </Text>
              </View>
              {!hasPhone && <PhoneOff size={12} color={colors.muted} />}
            </View>

            {/* Chevron */}
            <View className='ml-2'>
              <Text className='text-label text-xl'>
                {isExpanded ? '▼' : '▶'}
              </Text>
            </View>
          </TouchableOpacity>
        </View>

        {/* Expanded Details */}
        {isExpanded && (
          <View className='border-t border-border px-4 py-3 gap-3'>
            {/* Wait Time Info */}
            <View className='gap-2'>
              <View className='flex-row items-center justify-between p-3 rounded-lg bg-screen/50'>
                <View className='flex-row items-center gap-2'>
                  <Clock size={14} color={colors.label} />
                  <Text className='text-label text-sm'>Wait Time</Text>
                </View>
                <View className='flex-row items-center gap-2'>
                  <Text className='text-white font-bold'>
                    Quoted: {entry.quoted_wait_minutes}m
                  </Text>
                  <Text className='text-muted'>•</Text>
                  <Text
                    className='font-bold'
                    style={{
                      color: isOverdue
                        ? '#ef4444'
                        : isApproaching
                        ? '#f59e0b'
                        : '#10b981'
                    }}
                  >
                    Actual: {formatElapsed(elapsed)}
                  </Text>
                </View>
              </View>

              {/* Ready Time Estimate */}
              <View
                style={{ borderColor: '#22C55E' }}
                className='flex-row items-center gap-2 px-3 py-2 rounded-lg bg-screen/50 border'
              >
                <Clock size={12} color='#22C55E' />
                <Text
                  style={{ color: '#22C55E', fontSize: 12, fontWeight: '600' }}
                  className='flex-1'
                >
                  {isOverdue ? 'Overdue' : 'Ready at approx'}{' '}
                  {!isOverdue &&
                    new Date(
                      Date.now() +
                        Math.round(
                          Math.max(0, entry.quoted_wait_minutes - elapsed)
                        ) *
                          60000
                    ).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true
                    })}
                </Text>
              </View>
            </View>

            {/* Seating Preference */}
            {entry.seating_preference && (
              <View className='flex-row items-center gap-2 px-3 py-2 rounded-lg bg-screen/30'>
                <Lightbulb size={14} color={colors.label} />
                <Text className='text-label text-sm'>
                  {entry.seating_preference}
                  {entry.preferred_section && ` • ${entry.preferred_section}`}
                </Text>
              </View>
            )}

            {/* Contact Info */}
            {(entry.phone || entry.email) && (
              <View className='gap-2'>
                {entry.phone && (
                  <View className='flex-row items-center gap-2 px-3 py-2 rounded-lg bg-screen/30'>
                    <Phone size={14} color={colors.label} />
                    <Text className='text-label text-sm'>{entry.phone}</Text>
                  </View>
                )}
                {entry.email && (
                  <View className='flex-row items-center gap-2 px-3 py-2 rounded-lg bg-screen/30'>
                    <Mail size={14} color={colors.label} />
                    <Text className='text-label text-sm'>{entry.email}</Text>
                  </View>
                )}
              </View>
            )}

            {/* Notes */}
            {entry.notes && (
              <View className='flex-row items-start gap-2 px-3 py-2 rounded-lg bg-screen/30'>
                <StickyNote
                  size={14}
                  color={colors.label}
                  style={{ marginTop: 2 }}
                />
                <Text className='text-label text-sm flex-1'>{entry.notes}</Text>
              </View>
            )}

            {/* Overdue Warning */}
            {isOverdue && (
              <View className='flex-row items-start gap-2 px-3 py-2 rounded-lg bg-red-900/20 border border-red-700/50'>
                <AlertCircle
                  size={14}
                  color='#ef4444'
                  style={{ marginTop: 2 }}
                />
                <Text className='text-red-400 text-sm flex-1'>
                  Party exceeded quoted wait time
                </Text>
              </View>
            )}

            {/* Significantly Overdue Alert - RED for >10 mins overtime */}
            {isSignificantlyOverdue && (
              <View className='gap-2'>
                <View className='flex-row items-start gap-2 px-3 py-3 rounded-lg bg-red-900/40 border-2 border-red-600'>
                  <AlertCircle
                    size={16}
                    color='#ef4444'
                    style={{ marginTop: 1 }}
                  />
                  <View className='flex-1'>
                    <Text className='text-red-300 text-sm font-bold'>
                      Critical: {overtimeMinutes}+ mins over quoted time
                    </Text>
                    <Text className='text-red-300/80 text-xs mt-1'>
                      Customer is significantly late. Consider gesture of
                      goodwill.
                    </Text>
                  </View>
                </View>
                {onOfferComp && (
                  <TouchableOpacity
                    onPress={onOfferComp}
                    className='flex-row items-center justify-center gap-1.5 py-2.5 rounded-lg bg-amber-600/80 border border-amber-600'
                  >
                    <AlertCircle size={14} color='white' />
                    <Text className='text-white font-semibold text-sm'>
                      Apologize & Offer Comp
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {/* SMS Failure Alert */}
            {(entry.notification_failures ?? 0) > 0 && (
              <View className='flex-row items-center gap-2 px-3 py-2 rounded-lg bg-red-600 border border-red-500'>
                <AlertCircle size={14} color='white' />
                <Text className='text-white text-sm flex-1 font-semibold'>
                  SMS failed {entry.notification_failures}x — notify by voice
                </Text>
              </View>
            )}

            {/* Action Buttons */}
            <View className='flex-row gap-2 pt-2'>
              <TouchableOpacity
                onPress={onSeat}
                className='flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-lg bg-teal'
              >
                <Check size={14} color='white' />
                <Text className='text-white font-semibold text-sm'>Seat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onNotify}
                className='flex-1 flex-row items-center justify-center gap-1.5 py-2.5 rounded-lg border border-border'
              >
                <Bell size={14} color={colors.label} />
                <Text className='text-label font-semibold text-sm'>Notify</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onCancel}
                className='w-10 h-10 items-center justify-center rounded-lg bg-red-900/30'
              >
                <X size={14} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>

      {/* Swipe Hint */}
      {!isExpanded && (
        <View
          pointerEvents='none'
          className='absolute right-0 top-0 bottom-0 flex-row items-center pr-2'
        >
          <ChevronLeft size={16} color={colors.muted} />
        </View>
      )}
    </View>
  )
}

export default WaitlistQueueCard
