import ConfirmationModal from '@/components/settings/reset-application/ConfirmationModal'
import { useToast } from '@/contexts/ToastContext'
import { colors } from '@/lib/theme'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useReservationStore } from '@/stores/useReservationStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { Reservation } from '@/types/db-floor-plan-types'
import {
  CalendarClock,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  MapPin,
  Phone,
  StickyNote,
  Star,
  UserCheck,
  UserPlus,
  Users,
  X
} from 'lucide-react-native'
import React, { useCallback, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'

// ─── Helpers ────────────────────────────────────────────────────────────────

function formatTime(isoOrTime: string): string {
  const d = new Date(isoOrTime)
  if (isNaN(d.getTime())) return isoOrTime
  return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
}

function formatDateLabel(date: Date): string {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const tomorrow = new Date(today)
  tomorrow.setDate(tomorrow.getDate() + 1)
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  if (d.getTime() === today.getTime()) return 'Today'
  if (d.getTime() === tomorrow.getTime()) return 'Tomorrow'
  return d.toLocaleDateString([], { weekday: 'short', month: 'short', day: 'numeric' })
}

function addDays(date: Date, days: number): Date {
  const d = new Date(date)
  d.setDate(d.getDate() + days)
  return d
}

type StatusDotColor = string

function getStatusColor(status: Reservation['status']): StatusDotColor {
  switch (status) {
    case 'pending': return colors.warning
    case 'confirmed': return colors.info
    case 'reminded': return colors.info
    case 'arrived': return colors.success
    case 'seated': return colors.teal
    case 'no_show': return colors.danger
    case 'cancelled': return colors.muted
    case 'completed': return colors.muted
    default: return colors.muted
  }
}

function getStatusLabel(status: Reservation['status']): string {
  switch (status) {
    case 'pending': return 'Pending'
    case 'confirmed': return 'Confirmed'
    case 'reminded': return 'Reminded'
    case 'arrived': return 'Arrived'
    case 'seated': return 'Seated'
    case 'no_show': return 'No Show'
    case 'cancelled': return 'Cancelled'
    case 'completed': return 'Completed'
    default: return status
  }
}

// ─── Time presets for picker ─────────────────────────────────────────────────

function buildTimePresets(): string[] {
  const times: string[] = []
  for (let h = 9; h <= 22; h++) {
    times.push(`${String(h).padStart(2, '0')}:00`)
    times.push(`${String(h).padStart(2, '0')}:30`)
  }
  return times
}

const TIME_PRESETS = buildTimePresets()

function formatPreset(t: string): string {
  const [hStr, mStr] = t.split(':')
  const h = parseInt(hStr, 10)
  const m = mStr
  const ampm = h >= 12 ? 'PM' : 'AM'
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h
  return `${h12}:${m} ${ampm}`
}

// ─── Shared input style ───────────────────────────────────────────────────────

const inputStyle = {
  backgroundColor: colors.screen,
  color: colors.heading,
  fontSize: 13,
  padding: 10,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border
} as const

const labelStyle = {
  fontSize: 11,
  fontWeight: '600' as const,
  color: colors.muted,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.5,
  marginBottom: 6
}

// ─── AddReservationModal ─────────────────────────────────────────────────────

interface AddReservationData {
  name: string
  partySize: number
  phone: string
  date: Date
  time: string
  tableIds: string[]
  notes: string
  isVip: boolean
}

const AddReservationModal: React.FC<{
  visible: boolean
  onClose: () => void
  onSubmit: (data: AddReservationData) => Promise<void>
  isLoading: boolean
  defaultDate: Date
  availableTables: { id: string; name: string }[]
}> = ({ visible, onClose, onSubmit, isLoading, defaultDate, availableTables }) => {
  const [name, setName] = useState('')
  const [partySize, setPartySize] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedDate, setSelectedDate] = useState<Date>(defaultDate)
  const [selectedTime, setSelectedTime] = useState('19:00')
  const [selectedTableIds, setSelectedTableIds] = useState<string[]>([])
  const [notes, setNotes] = useState('')
  const [isVip, setIsVip] = useState(false)

  const resetForm = () => {
    setName(''); setPartySize(''); setPhone(''); setSelectedDate(defaultDate)
    setSelectedTime('19:00'); setSelectedTableIds([]); setNotes(''); setIsVip(false)
  }

  const handleClose = () => { resetForm(); onClose() }

  const handleSubmit = async () => {
    const d = new Date(selectedDate)
    const [h, m] = selectedTime.split(':').map(Number)
    d.setHours(h, m, 0, 0)
    await onSubmit({
      name: name.trim() || 'Guest',
      partySize: parseInt(partySize || '2', 10),
      phone: phone.trim(),
      date: d,
      time: selectedTime,
      tableIds: selectedTableIds,
      notes: notes.trim(),
      isVip
    })
    resetForm()
  }

  const toggleTable = (id: string) => {
    setSelectedTableIds(prev =>
      prev.includes(id) ? prev.filter(t => t !== id) : [...prev, id]
    )
  }

  return (
    <Modal visible={visible} transparent animationType='fade' onRequestClose={handleClose}>
      <Pressable
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}
        onPress={handleClose}
      >
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable
            onPress={() => {}}
            style={{ backgroundColor: colors.panel, borderRadius: 14, width: 360, borderWidth: 1, borderColor: colors.border, maxHeight: 600 }}
          >
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>New Reservation</Text>
              <TouchableOpacity
                onPress={handleClose}
                style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '30' }}
              >
                <X size={14} color={colors.danger} />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 14 }} keyboardShouldPersistTaps='handled'>
              {/* Name */}
              <View>
                <Text style={labelStyle}>Guest Name *</Text>
                <TextInput value={name} onChangeText={setName} placeholder='Enter name' placeholderTextColor={colors.muted} style={inputStyle} />
              </View>

              {/* Party Size + Phone */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={labelStyle}>Party Size *</Text>
                  <TextInput value={partySize} onChangeText={setPartySize} keyboardType='numeric' placeholder='2' placeholderTextColor={colors.muted} style={inputStyle} />
                </View>
                <View style={{ flex: 2 }}>
                  <Text style={labelStyle}>Phone *</Text>
                  <TextInput value={phone} onChangeText={setPhone} keyboardType='phone-pad' placeholder='Phone number' placeholderTextColor={colors.muted} style={inputStyle} />
                </View>
              </View>

              {/* Date Navigator */}
              <View>
                <Text style={labelStyle}>Date</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    onPress={() => setSelectedDate(d => addDays(d, -1))}
                    style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
                  >
                    <ChevronLeft size={16} color={colors.label} />
                  </TouchableOpacity>
                  <View style={{ flex: 1, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.screen }}>
                    <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>{formatDateLabel(selectedDate)}</Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedDate(d => addDays(d, 1))}
                    style={{ width: 32, height: 32, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
                  >
                    <ChevronRight size={16} color={colors.label} />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Time Presets */}
              <View>
                <Text style={labelStyle}>Time</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
                  {TIME_PRESETS.map(t => {
                    const isSelected = selectedTime === t
                    return (
                      <TouchableOpacity
                        key={t}
                        onPress={() => setSelectedTime(t)}
                        style={{
                          paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8,
                          borderWidth: 1,
                          backgroundColor: isSelected ? colors.teal + '20' : colors.screen,
                          borderColor: isSelected ? colors.teal + '60' : colors.border
                        }}
                      >
                        <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? colors.teal : colors.label }}>
                          {formatPreset(t)}
                        </Text>
                      </TouchableOpacity>
                    )
                  })}
                </ScrollView>
              </View>

              {/* Table assignment */}
              {availableTables.length > 0 && (
                <View>
                  <Text style={labelStyle}>Assign Table (Optional)</Text>
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                    {availableTables.map(t => {
                      const isSelected = selectedTableIds.includes(t.id)
                      return (
                        <TouchableOpacity
                          key={t.id}
                          onPress={() => toggleTable(t.id)}
                          style={{
                            paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
                            borderWidth: 1,
                            backgroundColor: isSelected ? colors.teal + '20' : colors.screen,
                            borderColor: isSelected ? colors.teal + '60' : colors.border
                          }}
                        >
                          <Text style={{ fontSize: 12, fontWeight: '600', color: isSelected ? colors.teal : colors.label }}>
                            {t.name}
                          </Text>
                        </TouchableOpacity>
                      )
                    })}
                  </View>
                </View>
              )}

              {/* Notes */}
              <View>
                <Text style={labelStyle}>Notes / Special Requests</Text>
                <TextInput
                  value={notes} onChangeText={setNotes}
                  placeholder='Allergies, special occasions...'
                  placeholderTextColor={colors.muted}
                  multiline
                  style={{ ...inputStyle, height: 64, textAlignVertical: 'top' }}
                />
              </View>

              {/* VIP toggle */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <Star size={14} color={colors.warning} />
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>VIP Guest</Text>
                </View>
                <Switch
                  value={isVip}
                  onValueChange={setIsVip}
                  trackColor={{ false: colors.border, true: colors.teal + '60' }}
                  thumbColor={isVip ? colors.teal : colors.muted}
                />
              </View>

              {/* Actions */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <TouchableOpacity
                  onPress={handleClose}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={isLoading}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50', opacity: isLoading ? 0.5 : 1 }}
                >
                  {isLoading
                    ? <ActivityIndicator color={colors.teal} size='small' />
                    : <Text style={{ fontSize: 13, fontWeight: '700', color: colors.teal }}>Reserve</Text>
                  }
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  )
}

// ─── ReservationCard ──────────────────────────────────────────────────────────

const ReservationCard: React.FC<{
  reservation: Reservation
  isExpanded: boolean
  onToggle: () => void
  onConfirm: () => void
  onMarkArrived: () => void
  onSeat: () => void
  onCancel: () => void
  tableNames: string[]
}> = ({ reservation: r, isExpanded, onToggle, onConfirm, onMarkArrived, onSeat, onCancel, tableNames }) => {
  const statusColor = getStatusColor(r.status)
  const isActionable = !['seated', 'completed', 'cancelled', 'no_show'].includes(r.status)

  return (
    <Animated.View
      layout={LinearTransition.duration(200)}
      style={{ marginBottom: 8, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}
    >
      {/* Collapsed row */}
      <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10 }}>
        {/* Time badge */}
        <View style={{
          width: 44, height: 40, borderRadius: 8, alignItems: 'center', justifyContent: 'center',
          backgroundColor: statusColor + '18', borderWidth: 1, borderColor: statusColor + '40'
        }}>
          <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor, textAlign: 'center', lineHeight: 13 }}>
            {formatTime(r.reservation_time)}
          </Text>
        </View>

        {/* Name + size */}
        <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading, flex: 1 }} numberOfLines={1}>
              {r.party_name}
            </Text>
            {r.is_vip && <Star size={11} color={colors.warning} />}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2, gap: 8 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Users size={11} color={colors.muted} />
              <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 3 }}>{r.party_size}</Text>
            </View>
            {/* Status pill */}
            <View style={{ paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: statusColor + '20', borderWidth: 1, borderColor: statusColor + '40' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: statusColor }}>{getStatusLabel(r.status)}</Text>
            </View>
          </View>
        </View>

        {isExpanded ? <ChevronUp size={14} color={colors.muted} /> : <ChevronDown size={14} color={colors.muted} />}
      </Pressable>

      {/* Expanded */}
      {isExpanded && (
        <Animated.View
          entering={FadeIn.duration(150)}
          exiting={FadeOut.duration(100)}
          style={{ paddingHorizontal: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: colors.border }}
        >
          <View style={{ marginTop: 8, gap: 6 }}>
            {r.phone && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Phone size={12} color={colors.label} />
                <Text style={{ fontSize: 12, color: colors.label, marginLeft: 6 }}>{r.phone}</Text>
              </View>
            )}
            {tableNames.length > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <MapPin size={12} color={colors.label} />
                <Text style={{ fontSize: 12, color: colors.label, marginLeft: 6 }}>{tableNames.join(', ')}</Text>
              </View>
            )}
            {(r.notes || r.special_requests) && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <StickyNote size={12} color={colors.label} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 12, color: colors.label, marginLeft: 6, fontStyle: 'italic', flex: 1 }}>
                  {r.notes || r.special_requests}
                </Text>
              </View>
            )}
          </View>

          {isActionable && (
            <View style={{ marginTop: 10, gap: 6 }}>
              {/* Row 1: Confirm + Arrived */}
              <View style={{ flexDirection: 'row', gap: 6 }}>
                {r.status === 'pending' && (
                  <TouchableOpacity
                    onPress={onConfirm}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.info + '20', borderWidth: 1, borderColor: colors.info + '50' }}
                  >
                    <Check size={12} color={colors.info} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.info }}>Confirm</Text>
                  </TouchableOpacity>
                )}
                {['confirmed', 'reminded'].includes(r.status) && (
                  <TouchableOpacity
                    onPress={onMarkArrived}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.success + '20', borderWidth: 1, borderColor: colors.success + '50' }}
                  >
                    <UserCheck size={12} color={colors.success} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.success }}>Mark Arrived</Text>
                  </TouchableOpacity>
                )}
                {r.status === 'arrived' && (
                  <TouchableOpacity
                    onPress={onSeat}
                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50' }}
                  >
                    <Check size={12} color={colors.teal} />
                    <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>Seat Now</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={onCancel}
                  style={{ width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '30' }}
                >
                  <X size={13} color={colors.danger} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </Animated.View>
      )}
    </Animated.View>
  )
}

// ─── ReservationsPanel ────────────────────────────────────────────────────────

const ReservationsPanel: React.FC = () => {
  const {
    reservations,
    isLoading,
    selectedDate,
    setSelectedDate,
    fetchReservations,
    createReservation,
    updateStatus,
    cancelReservation,
    seatReservation
  } = useReservationStore()

  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const tables = useFloorPlanStore(s => s.tables)
  const { show } = useToast()

  const [showAddModal, setShowAddModal] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [reservationToCancel, setReservationToCancel] = useState<Reservation | null>(null)
  const [addLoading, setAddLoading] = useState(false)

  // Available tables (no active session, category = table/booth)
  const availableTables = useMemo(() =>
    tables
      .filter(t => !t.session && ['table', 'booth'].includes(t.category))
      .map(t => ({ id: t.id, name: t.name }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true })),
    [tables]
  )

  // Filtered reservations for the selected date (active statuses only for list)
  const dateReservations = useMemo(() => {
    const dateStr = selectedDate.toISOString().split('T')[0]
    return reservations
      .filter(r => {
        const rDate = new Date(r.reservation_time).toISOString().split('T')[0]
        return rDate === dateStr && !['completed', 'cancelled'].includes(r.status)
      })
      .sort((a, b) => new Date(a.reservation_time).getTime() - new Date(b.reservation_time).getTime())
  }, [reservations, selectedDate])

  const handleToggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }, [])

  const handleDateChange = useCallback((delta: number) => {
    const next = addDays(selectedDate, delta)
    setSelectedDate(next)
    if (selectedStore?.id) {
      fetchReservations(selectedStore.id, next, { silent: true })
    }
  }, [selectedDate, selectedStore?.id, fetchReservations, setSelectedDate])

  const handleAddSubmit = useCallback(async (data: AddReservationData) => {
    if (!selectedStore?.id) return
    setAddLoading(true)
    try {
      const dateStr = data.date.toISOString().split('T')[0]
      const result = await createReservation({
        p_location_id: selectedStore.id,
        p_party_name: data.name,
        p_party_size: data.partySize,
        p_phone: data.phone,
        p_date: dateStr,
        p_time: data.time,
        p_notes: data.notes || undefined,
        p_is_vip: data.isVip
      })
      if (result) {
        show({ title: 'Reservation Added', message: `${data.name} booked for ${formatPreset(data.time)}`, type: 'success' })
        setShowAddModal(false)
        if (selectedStore?.id) fetchReservations(selectedStore.id, selectedDate, { silent: true })
      }
    } catch (err: any) {
      show({ title: 'Failed', message: err.message || 'Could not create reservation', type: 'error' })
    } finally {
      setAddLoading(false)
    }
  }, [selectedStore?.id, createReservation, show, fetchReservations, selectedDate])

  const handleConfirm = useCallback(async (id: string) => {
    await updateStatus(id, 'confirmed')
    show({ title: 'Confirmed', message: 'Reservation confirmed', type: 'success' })
  }, [updateStatus, show])

  const handleMarkArrived = useCallback(async (id: string) => {
    await updateStatus(id, 'arrived')
    show({ title: 'Arrived', message: 'Guest marked as arrived', type: 'success' })
  }, [updateStatus, show])

  const handleSeat = useCallback(async (r: Reservation) => {
    const tableIds = r.assigned_table_ids && r.assigned_table_ids.length > 0
      ? r.assigned_table_ids
      : undefined
    const result = await seatReservation(r.id, tableIds)
    if (result) {
      show({ title: 'Seated', message: `${r.party_name} has been seated`, type: 'success' })
    } else {
      show({ title: 'Could Not Seat', message: 'Please seat the guest manually from the floor plan', type: 'warning' })
    }
  }, [seatReservation, show])

  const handleCancelConfirm = useCallback(async () => {
    if (!reservationToCancel) return
    await cancelReservation(reservationToCancel.id)
    setReservationToCancel(null)
    show({ title: 'Cancelled', message: 'Reservation cancelled', type: 'success' })
  }, [reservationToCancel, cancelReservation, show])

  // Build a lookup of tableId → name from floor plan
  const tableNameById = useMemo(() => {
    const map: Record<string, string> = {}
    tables.forEach(t => { map[t.id] = t.name })
    return map
  }, [tables])

  return (
    <View style={{ flex: 1, flexDirection: 'column', backgroundColor: colors.screen }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
        {/* Title row */}
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>Reservations</Text>
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal + '15', borderWidth: 1, borderColor: colors.teal + '30' }}
          >
            <UserPlus size={14} color={colors.teal} />
          </TouchableOpacity>
        </View>

        {/* Date navigator */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <TouchableOpacity
            onPress={() => handleDateChange(-1)}
            style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <ChevronLeft size={14} color={colors.label} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => { setSelectedDate(new Date()); if (selectedStore?.id) fetchReservations(selectedStore.id, new Date(), { silent: true }) }}
            style={{ flex: 1, paddingVertical: 6, borderRadius: 8, borderWidth: 1, borderColor: colors.border, alignItems: 'center', backgroundColor: colors.card }}
          >
            <Text style={{ fontSize: 12, fontWeight: '600', color: colors.heading }}>{formatDateLabel(selectedDate)}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => handleDateChange(1)}
            style={{ width: 28, height: 28, borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border }}
          >
            <ChevronRight size={14} color={colors.label} />
          </TouchableOpacity>
        </View>

        {/* Summary */}
        <Text style={{ fontSize: 11, color: colors.muted, marginTop: 6 }}>
          {dateReservations.length} upcoming {formatDateLabel(selectedDate).toLowerCase()}
        </Text>
      </View>

      {/* List */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8, paddingBottom: 20 }}>
        {isLoading && reservations.length === 0 ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
            <ActivityIndicator size='small' color={colors.teal} />
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>Loading reservations...</Text>
          </View>
        ) : dateReservations.length > 0 ? (
          dateReservations.map(r => {
            const tableNames = (r.assigned_table_ids ?? []).map(id => tableNameById[id]).filter(Boolean)
            return (
              <ReservationCard
                key={r.id}
                reservation={r}
                isExpanded={expandedId === r.id}
                onToggle={() => handleToggle(r.id)}
                onConfirm={() => handleConfirm(r.id)}
                onMarkArrived={() => handleMarkArrived(r.id)}
                onSeat={() => handleSeat(r)}
                onCancel={() => setReservationToCancel(r)}
                tableNames={tableNames}
              />
            )
          })
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
            <CalendarClock size={28} color={colors.muted} />
            <Text style={{ fontSize: 13, color: colors.label, marginTop: 10 }}>No reservations {formatDateLabel(selectedDate).toLowerCase()}</Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>Tap + to add one</Text>
          </View>
        )}
      </ScrollView>

      <AddReservationModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddSubmit}
        isLoading={addLoading}
        defaultDate={selectedDate}
        availableTables={availableTables}
      />

      <ConfirmationModal
        isOpen={!!reservationToCancel}
        onClose={() => setReservationToCancel(null)}
        onConfirm={handleCancelConfirm}
        title='Cancel Reservation?'
        description={`Are you sure you want to cancel ${reservationToCancel?.party_name}'s reservation?`}
        confirmText='Cancel Reservation'
        variant='destructive'
      />
    </View>
  )
}

export default ReservationsPanel
