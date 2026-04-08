import { useTableTimerTick } from '@/hooks/useTableTimerTick'
import { colors } from '@/lib/theme'
import { WaitlistEntry } from '@/types/db-floor-plan-types'
import {
  AlertCircle, Bell, Check, ChevronDown, ChevronRight,
  Clock, GripVertical, Lightbulb, Mail, Phone, PhoneOff,
  StickyNote, Users, X
} from 'lucide-react-native'
import React, { useMemo, useRef, useState } from 'react'
import { Animated, PanResponder, Text, TouchableOpacity, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import { SharedValue } from 'react-native-reanimated'

interface WaitlistQueueCardProps {
  entry: WaitlistEntry
  position: number
  onNotify: () => void
  onSeat: () => void
  onCancel: () => void
  onMarkNoShow: () => void
  onOfferComp?: () => void
  dragGesture?: ReturnType<typeof Gesture.Simultaneous>
  isDragging?: SharedValue<boolean>
}

const getStatusColor = (status: string, isOverdue: boolean, isApproaching: boolean) => {
  if (isOverdue) return colors.danger
  if (isApproaching) return colors.warning
  switch (status) {
    case 'waiting': return colors.label
    case 'notified': return colors.info
    case 'arrived': return colors.success
    case 'expired': return colors.danger
    default: return colors.muted
  }
}

const getStatusLabel = (status: string) => {
  switch (status) {
    case 'waiting': return 'Waiting'
    case 'notified': return 'Notified'
    case 'arrived': return 'Arrived'
    case 'expired': return 'Expired'
    default: return status
  }
}

const getInitials = (name: string) => {
  const parts = name.trim().split(' ')
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  return name.slice(0, 2).toUpperCase()
}

function getElapsedMinutes(createdAt: string): number {
  if (!createdAt) return 0
  return Math.max(0, Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000))
}

function formatElapsed(minutes: number): string {
  if (!minutes || minutes < 0) return '0m'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

export const WaitlistQueueCard: React.FC<WaitlistQueueCardProps> = ({
  entry, position, onNotify, onSeat, onCancel, onMarkNoShow, onOfferComp, dragGesture
}) => {
  const [isExpanded, setIsExpanded] = useState(false)
  const [swipeOffset] = useState(new Animated.Value(0))

  const panResponder = useRef(PanResponder.create({
    onStartShouldSetPanResponder: () => false,
    onMoveShouldSetPanResponder: (_, gs) => Math.abs(gs.dx) > 5 && Math.abs(gs.dy) < 20,
    onPanResponderMove: (_, gs) => { if (gs.dx < 0) swipeOffset.setValue(gs.dx) },
    onPanResponderRelease: (_, gs) => {
      Animated.timing(swipeOffset, { toValue: gs.dx < -80 ? -260 : 0, duration: 220, useNativeDriver: false }).start()
    }
  })).current

  const tick = useTableTimerTick()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const elapsed = useMemo(() => getElapsedMinutes(entry.created_at), [entry.created_at, tick])
  const isOverdue = elapsed > (entry.quoted_wait_minutes || 0)
  const isApproaching = elapsed > (entry.quoted_wait_minutes || 0) * 0.8 && !isOverdue
  const overtimeMinutes = Math.max(0, elapsed - (entry.quoted_wait_minutes || 0))
  const isSignificantlyOverdue = overtimeMinutes > 10
  const statusColor = getStatusColor(entry.status, isOverdue || isSignificantlyOverdue, isApproaching)
  const hasPhone = Boolean(entry.phone?.replace(/\D/g, ''))
  const progress = Math.min(1, elapsed / Math.max(1, entry.quoted_wait_minutes || 1))

  const closeSwipe = () => Animated.timing(swipeOffset, { toValue: 0, duration: 220, useNativeDriver: false }).start()

  return (
    <View style={{
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: isSignificantlyOverdue ? colors.danger + '70' : isOverdue ? colors.danger + '40' : isApproaching ? colors.warning + '30' : colors.border,
    }}>
      {/* Colored left accent bar */}
      <View style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: 3, backgroundColor: statusColor, zIndex: 1 }} />

      {/* Swipe Background Actions */}
      <View style={{ position: 'absolute', inset: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, paddingHorizontal: 8 }}>
        <TouchableOpacity onPress={() => { closeSwipe(); onMarkNoShow() }} style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger + '50' }}>
          <Text style={{ color: colors.danger, fontSize: 10, fontWeight: '700' }}>NO-SHOW</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { closeSwipe(); onCancel() }} style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.danger + '12', borderWidth: 1, borderColor: colors.danger + '35' }}>
          <Text style={{ color: colors.danger, fontSize: 10, fontWeight: '700' }}>CANCEL</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { closeSwipe(); onNotify() }} style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.info + '18', borderWidth: 1, borderColor: colors.info + '50' }}>
          <Text style={{ color: colors.info, fontSize: 10, fontWeight: '700' }}>NOTIFY</Text>
        </TouchableOpacity>
        <TouchableOpacity onPress={() => { onSeat(); closeSwipe() }} style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.teal + '18', borderWidth: 1, borderColor: colors.teal + '50' }}>
          <Text style={{ color: colors.teal, fontSize: 10, fontWeight: '700' }}>SEAT</Text>
        </TouchableOpacity>
      </View>

      {/* Card Content */}
      <Animated.View style={{ transform: [{ translateX: swipeOffset }], backgroundColor: colors.card, paddingLeft: 3 }} {...panResponder.panHandlers}>
        {/* Main Row */}
        <TouchableOpacity onPress={() => setIsExpanded(!isExpanded)} activeOpacity={0.8}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 10, gap: 10 }}>

            {/* Drag handle */}
            {dragGesture && (
              <GestureDetector gesture={dragGesture}>
                <View style={{ opacity: 0.3 }}>
                  <GripVertical size={14} color={colors.label} />
                </View>
              </GestureDetector>
            )}

            {/* Avatar with position */}
            <View style={{ position: 'relative' }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: statusColor + '20', borderWidth: 1.5, borderColor: statusColor + '60', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ color: statusColor, fontSize: 13, fontWeight: '800' }}>{getInitials(entry.party_name)}</Text>
              </View>
              {/* Position badge */}
              <View style={{ position: 'absolute', bottom: -4, right: -4, width: 16, height: 16, borderRadius: 8, backgroundColor: statusColor, alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: colors.card }}>
                <Text style={{ color: colors.screen, fontSize: 8, fontWeight: '900' }}>{position}</Text>
              </View>
            </View>

            {/* Party info */}
            <View style={{ flex: 1 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                <Text style={{ color: colors.heading, fontWeight: '700', fontSize: 13 }} numberOfLines={1}>{entry.party_name}</Text>
                {!hasPhone && <PhoneOff size={10} color={colors.muted} />}
                {(entry.notification_failures ?? 0) > 0 && (
                  <View style={{ paddingHorizontal: 5, paddingVertical: 1, borderRadius: 4, backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger + '50' }}>
                    <Text style={{ color: colors.danger, fontSize: 9, fontWeight: '700' }}>SMS ✕{entry.notification_failures}</Text>
                  </View>
                )}
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Users size={10} color={colors.muted} />
                  <Text style={{ color: colors.label, fontSize: 11 }}>{entry.party_size}</Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Clock size={10} color={isOverdue ? colors.danger : isApproaching ? colors.warning : colors.muted} />
                  <Text style={{ color: isOverdue ? colors.danger : isApproaching ? colors.warning : colors.label, fontSize: 11, fontWeight: isOverdue ? '700' : '400' }}>
                    {formatElapsed(elapsed)} / {formatElapsed(entry.quoted_wait_minutes || 0)}
                  </Text>
                </View>
                {entry.seating_preference && entry.seating_preference !== 'No Preference' && (
                  <Text style={{ color: colors.muted, fontSize: 10 }}>· {entry.seating_preference}</Text>
                )}
              </View>

              {/* Progress bar */}
              <View style={{ height: 3, backgroundColor: colors.border, borderRadius: 2, marginTop: 6, overflow: 'hidden' }}>
                <View style={{ height: 3, width: `${Math.min(100, Math.round(progress * 100))}%`, backgroundColor: isOverdue ? colors.danger : isApproaching ? colors.warning : colors.teal, borderRadius: 2 }} />
              </View>
            </View>

            {/* Status pill + chevron */}
            <View style={{ alignItems: 'flex-end', gap: 6 }}>
              <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20, backgroundColor: statusColor + '18', borderWidth: 1, borderColor: statusColor + '50' }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor }}>{getStatusLabel(entry.status)}</Text>
              </View>
              {isExpanded ? <ChevronDown size={13} color={colors.muted} /> : <ChevronRight size={13} color={colors.muted} />}
            </View>
          </View>
        </TouchableOpacity>

        {/* Expanded Details */}
        {isExpanded && (
          <View style={{ borderTopWidth: 1, borderTopColor: colors.border, padding: 12, gap: 8 }}>

            {/* Wait breakdown */}
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.screen, alignItems: 'center' }}>
                <Text style={{ color: colors.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Quoted</Text>
                <Text style={{ color: colors.label, fontSize: 14, fontWeight: '700' }}>{formatElapsed(entry.quoted_wait_minutes || 0)}</Text>
              </View>
              <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: isOverdue ? colors.danger + '12' : isApproaching ? colors.warning + '10' : colors.screen, alignItems: 'center', borderWidth: isOverdue ? 1 : 0, borderColor: colors.danger + '30' }}>
                <Text style={{ color: colors.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Actual</Text>
                <Text style={{ color: isOverdue ? colors.danger : isApproaching ? colors.warning : colors.success, fontSize: 14, fontWeight: '700' }}>{formatElapsed(elapsed)}</Text>
              </View>
              {!isOverdue && (
                <View style={{ flex: 1, paddingVertical: 8, paddingHorizontal: 10, borderRadius: 8, backgroundColor: colors.success + '10', alignItems: 'center' }}>
                  <Text style={{ color: colors.muted, fontSize: 9, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 2 }}>Ready ~</Text>
                  <Text style={{ color: colors.success, fontSize: 11, fontWeight: '700' }}>
                    {new Date(Date.now() + Math.round(Math.max(0, (entry.quoted_wait_minutes || 0) - elapsed)) * 60000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true })}
                  </Text>
                </View>
              )}
            </View>

            {/* Info rows */}
            {entry.seating_preference && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7, backgroundColor: colors.screen }}>
                <Lightbulb size={12} color={colors.muted} />
                <Text style={{ color: colors.label, fontSize: 12 }}>{entry.seating_preference}{entry.preferred_section ? ` · ${entry.preferred_section}` : ''}</Text>
              </View>
            )}
            {entry.phone && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7, backgroundColor: colors.screen }}>
                <Phone size={12} color={colors.muted} />
                <Text style={{ color: colors.label, fontSize: 12 }}>{entry.phone}</Text>
              </View>
            )}
            {entry.email && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7, backgroundColor: colors.screen }}>
                <Mail size={12} color={colors.muted} />
                <Text style={{ color: colors.label, fontSize: 12 }}>{entry.email}</Text>
              </View>
            )}
            {entry.notes && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7, backgroundColor: colors.screen }}>
                <StickyNote size={12} color={colors.muted} style={{ marginTop: 1 }} />
                <Text style={{ color: colors.label, fontSize: 12, flex: 1 }}>{entry.notes}</Text>
              </View>
            )}

            {/* Alert banners */}
            {isSignificantlyOverdue && (
              <View style={{ gap: 6 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '50' }}>
                  <AlertCircle size={13} color={colors.danger} style={{ marginTop: 1 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: colors.danger, fontSize: 12, fontWeight: '700' }}>Critical: {overtimeMinutes}+ mins over</Text>
                    <Text style={{ color: colors.danger, fontSize: 11, opacity: 0.7, marginTop: 1 }}>Consider a gesture of goodwill</Text>
                  </View>
                </View>
                {onOfferComp && (
                  <TouchableOpacity onPress={onOfferComp} style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.warning + '15', borderWidth: 1, borderColor: colors.warning + '50' }}>
                    <AlertCircle size={12} color={colors.warning} />
                    <Text style={{ color: colors.warning, fontWeight: '600', fontSize: 12 }}>Apologize & Offer Comp</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}

            {(entry.notification_failures ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 7, borderRadius: 7, backgroundColor: colors.danger + '12', borderWidth: 1, borderColor: colors.danger + '35' }}>
                <AlertCircle size={12} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 11, flex: 1, fontWeight: '600' }}>SMS failed {entry.notification_failures}x — notify by voice</Text>
              </View>
            )}

            {/* Action buttons */}
            <View style={{ flexDirection: 'row', gap: 6, paddingTop: 2 }}>
              <TouchableOpacity onPress={onSeat} style={{ flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 8, backgroundColor: colors.teal + '18', borderWidth: 1, borderColor: colors.teal + '50' }}>
                <Check size={13} color={colors.teal} />
                <Text style={{ color: colors.teal, fontWeight: '700', fontSize: 12 }}>Seat Party</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onNotify} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 9, borderRadius: 8, backgroundColor: colors.info + '12', borderWidth: 1, borderColor: colors.info + '40' }}>
                <Bell size={13} color={colors.info} />
                <Text style={{ color: colors.info, fontWeight: '600', fontSize: 12 }}>Notify</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={onCancel} style={{ width: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.danger + '10', borderWidth: 1, borderColor: colors.danger + '30' }}>
                <X size={13} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        )}
      </Animated.View>
    </View>
  )
}

export default WaitlistQueueCard
