import { colors } from '@/lib/theme'
import WaitTimeCalculator from '@/lib/waitlist/waitTimeCalculator'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useWaitlistStore } from '@/stores/useWaitlistStore'
import { AlertCircle, ChevronDown, Clock, Mail, Minus, Phone, Plus, StickyNote, Users, UserCircle } from 'lucide-react-native'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native'

interface AddToWaitlistFormProps {
  onSubmit: (data: {
    party_name: string
    party_size: number
    phone?: string
    email?: string
    seating_preference?: string
    preferred_section?: string
    notes?: string
    quoted_wait_minutes?: number
    estimated_ready_at?: string
  }) => void
  onCancel: () => void
  isLoading: boolean
}

const SEATING_PREFERENCES = ['No Preference', 'Indoor', 'Outdoor', 'Bar']
const SECTIONS = ['No Preference', 'Main Dining', 'Patio', 'Bar', 'Private']

const labelStyle = {
  color: colors.muted,
  fontSize: 9,
  fontWeight: '700' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.8,
  marginBottom: 5,
}


const DropdownModal = ({
  visible, onClose, title, options, selected, onSelect,
}: {
  visible: boolean; onClose: () => void; title: string; options: string[]; selected: string; onSelect: (v: string) => void
}) => (
  <Modal visible={visible} transparent animationType='fade' onRequestClose={onClose}>
    <TouchableOpacity activeOpacity={1} onPress={onClose} style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'center', alignItems: 'center' }}>
      <TouchableOpacity activeOpacity={1} style={{ width: 260, backgroundColor: colors.card, borderRadius: 12, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
        <View style={{ paddingHorizontal: 14, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
          <Text style={{ color: colors.heading, fontSize: 12, fontWeight: '700' }}>{title}</Text>
        </View>
        {options.map(item => (
          <TouchableOpacity
            key={item}
            onPress={() => { onSelect(item); onClose() }}
            style={{ paddingHorizontal: 14, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border + '50', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}
          >
            <Text style={{ fontSize: 12, color: item === selected ? colors.teal : colors.label, fontWeight: item === selected ? '700' : '400' }}>{item}</Text>
            {item === selected && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: colors.teal }} />}
          </TouchableOpacity>
        ))}
      </TouchableOpacity>
    </TouchableOpacity>
  </Modal>
)

export const AddToWaitlistForm: React.FC<AddToWaitlistFormProps> = ({ onSubmit, onCancel, isLoading }) => {
  const tables = useFloorPlanStore(s => s.tables)
  const waitlist = useWaitlistStore(s => s.waitlist)

  const [partyName, setPartyName] = useState('')
  const [partySize, setPartySize] = useState(2)
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [seatingPreference, setSeatingPreference] = useState('No Preference')
  const [preferredSection, setPreferredSection] = useState('No Preference')
  const [notes, setNotes] = useState('')
  const [quotedWait, setQuotedWait] = useState('15')
  const [showSeatingDropdown, setShowSeatingDropdown] = useState(false)
  const [showSectionDropdown, setShowSectionDropdown] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [autoCalculatedWait, setAutoCalculatedWait] = useState<number | null>(null)
  const [isWaitOverridden, setIsWaitOverridden] = useState(false)
  const [estimatedReadyAt, setEstimatedReadyAt] = useState<Date | null>(null)

  useEffect(() => {
    if (tables.length === 0) return
    const activeAhead = waitlist.filter(w => w.status === 'waiting' || w.status === 'notified').length
    const calculator = new WaitTimeCalculator(tables, waitlist)
    const { waitTime, estimatedReadyAt: calculated } = calculator.calculateWaitTimeEnhanced(partySize, activeAhead)
    setAutoCalculatedWait(waitTime)
    setEstimatedReadyAt(calculated)
    if (!isWaitOverridden) setQuotedWait(String(waitTime))
  }, [partySize, tables, waitlist, isWaitOverridden])

  useEffect(() => {
    if (errors.length > 0) setErrors([])
  }, [partyName, partySize, phone, email, quotedWait])

  const adjustPartySize = (delta: number) => {
    setPartySize(prev => Math.max(1, Math.min(20, prev + delta)))
  }

  const validateForm = (): boolean => {
    const newErrors: string[] = []
    if (!partyName.trim()) newErrors.push('Party name is required')
    if (partySize < 1) newErrors.push('Party size must be at least 1')
    if (phone && !/^[\d\s\-\+\(\)]+$/.test(phone)) newErrors.push('Invalid phone number')
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) newErrors.push('Invalid email address')
    const wait = parseInt(quotedWait, 10)
    if (isNaN(wait) || wait < 0) newErrors.push('Wait time must be a positive number')
    setErrors(newErrors)
    return newErrors.length === 0
  }

  const handleSubmit = () => {
    if (!validateForm()) return
    onSubmit({
      party_name: partyName.trim(),
      party_size: partySize,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      seating_preference: seatingPreference !== 'No Preference' ? seatingPreference : undefined,
      preferred_section: preferredSection !== 'No Preference' ? preferredSection : undefined,
      notes: notes.trim() || undefined,
      quoted_wait_minutes: quotedWait ? parseInt(quotedWait, 10) : undefined,
      estimated_ready_at: estimatedReadyAt?.toISOString(),
    })
  }

  const hasName = partyName.trim().length > 0

  return (
    <View style={{ paddingBottom: 16, paddingHorizontal: 14, paddingTop: 10 }}>
      {/* Errors */}
      {errors.length > 0 && (
        <View style={{ marginBottom: 12, padding: 10, borderRadius: 8, backgroundColor: colors.danger + '12', borderWidth: 1, borderColor: colors.danger + '40' }}>
          {errors.map((error, idx) => (
            <View key={idx} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginBottom: idx < errors.length - 1 ? 4 : 0 }}>
              <AlertCircle size={12} color={colors.danger} style={{ marginTop: 1 }} />
              <Text style={{ color: colors.danger, fontSize: 12, flex: 1 }}>{error}</Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Party Name ── */}
      <View style={{ marginBottom: 12 }}>
        <Text style={labelStyle}>Guest Name *</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.screen, borderRadius: 8, borderWidth: 1, borderColor: hasName ? colors.teal + '60' : colors.border, paddingHorizontal: 10, gap: 8 }}>
          <UserCircle size={15} color={hasName ? colors.teal : colors.muted} />
          <TextInput
            autoFocus
            value={partyName}
            onChangeText={setPartyName}
            placeholder='Guest name or party'
            placeholderTextColor={colors.muted}
            maxLength={100}
            style={{ flex: 1, fontSize: 14, color: colors.heading, paddingVertical: 9, fontWeight: '600' }}
          />
        </View>
      </View>

      {/* ── Party Size + Wait Time ── */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        {/* Party size stepper */}
        <View style={{ flex: 1 }}>
          <View style={{ height: 14, justifyContent: 'center', marginBottom: 5 }}>
            <Text style={{ ...labelStyle, marginBottom: 0 }}>Party Size *</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.screen, borderRadius: 8, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', height: 38 }}>
            <TouchableOpacity
              onPress={() => adjustPartySize(-1)}
              style={{ width: 36, height: '100%', alignItems: 'center', justifyContent: 'center', borderRightWidth: 1, borderRightColor: colors.border }}
            >
              <Minus size={13} color={partySize <= 1 ? colors.muted : colors.label} />
            </TouchableOpacity>
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
              <Users size={12} color={colors.muted} />
              <Text style={{ fontSize: 16, fontWeight: '800', color: colors.heading, lineHeight: 20 }}>{partySize}</Text>
            </View>
            <TouchableOpacity
              onPress={() => adjustPartySize(1)}
              style={{ width: 36, height: '100%', alignItems: 'center', justifyContent: 'center', borderLeftWidth: 1, borderLeftColor: colors.border }}
            >
              <Plus size={13} color={partySize >= 20 ? colors.muted : colors.label} />
            </TouchableOpacity>
          </View>
        </View>

        {/* Wait time */}
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5, height: 14 }}>
            <Text style={{ ...labelStyle, marginBottom: 0 }}>Wait (min)</Text>
            {autoCalculatedWait !== null && !isWaitOverridden && (
              <View style={{ paddingHorizontal: 5, borderRadius: 4, backgroundColor: colors.teal + '18', borderWidth: 1, borderColor: colors.teal + '40', height: 14, justifyContent: 'center' }}>
                <Text style={{ color: colors.teal, fontSize: 8, fontWeight: '700' }}>AUTO</Text>
              </View>
            )}
            {isWaitOverridden && (
              <View style={{ paddingHorizontal: 5, borderRadius: 4, backgroundColor: colors.warning + '18', borderWidth: 1, borderColor: colors.warning + '40', height: 14, justifyContent: 'center' }}>
                <Text style={{ color: colors.warning, fontSize: 8, fontWeight: '700' }}>CUSTOM</Text>
              </View>
            )}
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.screen, borderRadius: 8, borderWidth: 1, borderColor: isWaitOverridden ? colors.warning + '60' : colors.border, paddingHorizontal: 10, gap: 6, height: 38 }}>
            <Clock size={13} color={isWaitOverridden ? colors.warning : colors.muted} />
            <TextInput
              value={quotedWait}
              onChangeText={text => { setQuotedWait(text); setIsWaitOverridden(text !== String(autoCalculatedWait)) }}
              placeholderTextColor={colors.muted}
              keyboardType='number-pad'
              maxLength={3}
              style={{ flex: 1, fontSize: 16, fontWeight: '800', color: isWaitOverridden ? colors.warning : colors.heading, padding: 0, lineHeight: 20 }}
            />
            <Text style={{ color: colors.muted, fontSize: 11 }}>min</Text>
          </View>
        </View>
      </View>

      {/* ── Contact ── */}
      <View style={{ marginBottom: 12 }}>
        <Text style={labelStyle}>Contact (Optional)</Text>
        <View style={{ borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Phone size={13} color={colors.muted} />
            <TextInput
              value={phone}
              onChangeText={setPhone}
              placeholder='(555) 123-4567'
              placeholderTextColor={colors.muted}
              keyboardType='phone-pad'
              maxLength={20}
              style={{ flex: 1, fontSize: 13, color: colors.heading, paddingVertical: 10 }}
            />
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, gap: 8 }}>
            <Mail size={13} color={colors.muted} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder='guest@example.com'
              placeholderTextColor={colors.muted}
              keyboardType='email-address'
              maxLength={100}
              style={{ flex: 1, fontSize: 13, color: colors.heading, paddingVertical: 10 }}
            />
          </View>
        </View>
      </View>

      {/* ── Seating Preferences ── */}
      <View style={{ marginBottom: 12 }}>
        <Text style={labelStyle}>Seating Preferences (Optional)</Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <View style={{ flex: 1 }}>
            <Text style={{ ...labelStyle, marginBottom: 5 }}>Type</Text>
            <TouchableOpacity
              onPress={() => setShowSeatingDropdown(true)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: seatingPreference !== 'No Preference' ? colors.info + '60' : colors.border, paddingHorizontal: 10, paddingVertical: 10 }}
            >
              <Text style={{ fontSize: 12, color: seatingPreference !== 'No Preference' ? colors.info : colors.label }}>{seatingPreference}</Text>
              <ChevronDown size={12} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...labelStyle, marginBottom: 5 }}>Section</Text>
            <TouchableOpacity
              onPress={() => setShowSectionDropdown(true)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.card, borderRadius: 8, borderWidth: 1, borderColor: preferredSection !== 'No Preference' ? colors.info + '60' : colors.border, paddingHorizontal: 10, paddingVertical: 10 }}
            >
              <Text style={{ fontSize: 12, color: preferredSection !== 'No Preference' ? colors.info : colors.label }}>{preferredSection}</Text>
              <ChevronDown size={12} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Notes ── */}
      <View style={{ marginBottom: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 5 }}>
          <StickyNote size={11} color={colors.muted} />
          <Text style={labelStyle}>Special Requests (Optional)</Text>
        </View>
        <TextInput
          value={notes}
          onChangeText={setNotes}
          placeholder='Allergies, occasion, high chair needed...'
          placeholderTextColor={colors.muted}
          multiline
          maxLength={500}
          style={{ backgroundColor: colors.card, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, color: colors.heading, minHeight: 70, textAlignVertical: 'top' }}
        />
      </View>

      {/* ── Action Buttons ── */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          onPress={onCancel}
          disabled={isLoading}
          style={{ flex: 1, paddingVertical: 11, borderRadius: 9, alignItems: 'center', borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card }}
        >
          <Text style={{ color: colors.label, fontWeight: '600', fontSize: 13 }}>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={isLoading}
          style={{ flex: 2, paddingVertical: 11, borderRadius: 9, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '60', opacity: isLoading ? 0.5 : 1 }}
        >
          {isLoading
            ? <ActivityIndicator color={colors.teal} size='small' />
            : <Text style={{ color: colors.teal, fontWeight: '800', fontSize: 13, letterSpacing: 0.3 }}>Add to Waitlist</Text>}
        </TouchableOpacity>
      </View>

      <DropdownModal visible={showSeatingDropdown} onClose={() => setShowSeatingDropdown(false)} title='Seating Preference' options={SEATING_PREFERENCES} selected={seatingPreference} onSelect={setSeatingPreference} />
      <DropdownModal visible={showSectionDropdown} onClose={() => setShowSectionDropdown(false)} title='Preferred Section' options={SECTIONS} selected={preferredSection} onSelect={setPreferredSection} />
    </View>
  )
}

export default React.memo(AddToWaitlistForm)
