import { formatUsPhone, normalizeUsPhoneDigits } from '@/lib/phone'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { getCachedCustomers } from '@/services/customer'
import WaitTimeCalculator from '@/lib/waitlist/waitTimeCalculator'
import { FloorPlanService } from '@/services/floorPlanService'
import {
  getFloorPlanClient,
  useFloorPlanStore
} from '@/stores/useFloorPlanStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useWaitlistStore } from '@/stores/useWaitlistStore'
import type { CustomerWithMeta } from '@/types/customer'
import {
  AlertCircle,
  ChevronDown,
  Clock,
  Mail,
  Minus,
  Phone,
  Plus,
  Search,
  StickyNote,
  UserCircle,
  Users
} from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Keyboard,
  Modal,
  Text,
  TextInput,
  TouchableOpacity,
  View
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
  }) => Promise<void> | void
  onCancel: () => void
  isLoading: boolean
  mode?: 'add' | 'edit'
  initialValues?: Partial<{
    party_name: string
    party_size: number
    phone?: string
    email?: string
    seating_preference?: string
    preferred_section?: string
    notes?: string
    quoted_wait_minutes?: number
  }>
  onDirtyChange?: (dirty: boolean) => void
}

const sectionOptions = [
  { value: 'indoor', label: 'Indoor' },
  { value: 'patio', label: 'Patio' },
  { value: 'bar', label: 'Bar' },
  { value: 'lounge', label: 'Lounge' },
  { value: 'private', label: 'Private' }
]

const preferences = [
  { value: 'no_preference', label: 'No Preference' },
  { value: 'high_top', label: 'High Top' },
  { value: 'booth', label: 'Booth' },
  { value: 'standard', label: 'Standard' },
  { value: 'bar_seat', label: 'Bar Seat' },
  { value: 'outdoor', label: 'Outdoor' },
  { value: 'quiet', label: 'Quiet Area' }
]

const defaultEstimatedMinutes = 15

const AddToWaitlistForm: React.FC<AddToWaitlistFormProps> = ({
  onSubmit,
  onCancel,
  isLoading,
  mode = 'add',
  initialValues,
  onDirtyChange
}) => {
  const uiScale = useUiScale()
  const sc = (n: number) => Math.round(n * uiScale)

  const [partyName, setPartyName] = useState(initialValues?.party_name ?? '')
  const [partySize, setPartySize] = useState(initialValues?.party_size ?? 0)
  const [phone, setPhone] = useState(initialValues?.phone ?? '')
  const [email, setEmail] = useState(initialValues?.email ?? '')
  const [notes, setNotes] = useState(initialValues?.notes ?? '')
  const [seatingPreference, setSeatingPreference] = useState<string | null>(
    initialValues?.seating_preference ?? null
  )
  const [preferredSection, setPreferredSection] = useState<string | null>(
    initialValues?.preferred_section ?? null
  )

  const [showSectionPicker, setShowSectionPicker] = useState(false)
  const [showPrefPicker, setShowPrefPicker] = useState(false)
  const [estimatedMinutes, setEstimatedMinutes] = useState(
    initialValues?.quoted_wait_minutes ?? defaultEstimatedMinutes
  )
  const [submitting, setSubmitting] = useState(false)

  const formMounted = useRef(false)
  const prevDirtyRef = useRef(false)

  const isDirty = useMemo(() => {
    const nameDirty = (initialValues?.party_name ?? '') !== partyName
    return nameDirty
  }, [initialValues?.party_name, partyName])

  useEffect(() => {
    if (!formMounted.current) {
      formMounted.current = true
      return
    }
    if (isDirty !== prevDirtyRef.current) {
      prevDirtyRef.current = isDirty
      onDirtyChange?.(isDirty)
    }
  }, [isDirty, onDirtyChange])

  const handleSubmit = async () => {
    if (isLoading || submitting) return
    if (!partyName.trim()) return
    setSubmitting(true)
    try {
      await onSubmit({
        party_name: partyName.trim(),
        party_size: Math.max(1, partySize),
        phone: phone.trim() || undefined,
        email: email.trim() || undefined,
        seating_preference: seatingPreference ?? undefined,
        preferred_section: preferredSection ?? undefined,
        notes: notes.trim() || undefined,
        quoted_wait_minutes: estimatedMinutes
      })
    } finally {
      setSubmitting(false)
    }
  }

  const canSubmit = partyName.trim().length > 0 && partySize > 0

  return (
    <View style={{ padding: sc(16), gap: sc(14) }}>
      {/* Party Name */}
      <View>
        <Text style={{ fontSize: sc(11), fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: sc(5) }}>
          Guest Name <Text style={{ color: colors.danger }}>*</Text>
        </Text>
        <TextInput
          value={partyName}
          onChangeText={setPartyName}
          placeholder="e.g. Smith Party"
          placeholderTextColor={colors.muted}
          style={{
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: sc(8),
            paddingHorizontal: sc(12),
            paddingVertical: sc(10),
            fontSize: sc(13),
            color: colors.heading,
            fontWeight: '500'
          }}
        />
      </View>

      {/* Party Size */}
      <View>
        <Text style={{ fontSize: sc(11), fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: sc(5) }}>
          Party Size <Text style={{ color: colors.danger }}>*</Text>
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: sc(8) }}>
          <TouchableOpacity
            onPress={() => setPartySize(Math.max(0, partySize - 1))}
            style={{
              width: sc(36),
              height: sc(36),
              borderRadius: sc(8),
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Minus size={sc(14)} color={colors.label} />
          </TouchableOpacity>
          <View
            style={{
              flex: 1,
              backgroundColor: colors.screen,
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: sc(8),
              paddingVertical: sc(10),
              alignItems: 'center'
            }}
          >
            <Text style={{ fontSize: sc(18), fontWeight: '700', color: colors.heading }}>
              {partySize}
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setPartySize(Math.min(99, partySize + 1))}
            style={{
              width: sc(36),
              height: sc(36),
              borderRadius: sc(8),
              backgroundColor: colors.card,
              borderWidth: 1,
              borderColor: colors.border,
              alignItems: 'center',
              justifyContent: 'center'
            }}
          >
            <Plus size={sc(14)} color={colors.label} />
          </TouchableOpacity>
        </View>
      </View>

      {/* Phone */}
      <View>
        <Text style={{ fontSize: sc(11), fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: sc(5) }}>
          Phone <Text style={{ color: colors.muted, fontWeight: '400' }}>(optional)</Text>
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: sc(8), paddingHorizontal: sc(12), gap: sc(8) }}>
          <Phone size={sc(13)} color={colors.muted} />
          <TextInput
            value={phone}
            onChangeText={t => setPhone(formatUsPhone(t.replace(/\D/g, '').slice(0, 10)))}
            placeholder="(555) 123-4567"
            placeholderTextColor={colors.muted}
            keyboardType='phone-pad'
            style={{
              flex: 1,
              paddingVertical: sc(10),
              fontSize: sc(13),
              color: colors.heading,
              fontWeight: '500'
            }}
          />
        </View>
      </View>

      {/* Email */}
      <View>
        <Text style={{ fontSize: sc(11), fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: sc(5) }}>
          Email <Text style={{ color: colors.muted, fontWeight: '400' }}>(optional)</Text>
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: sc(8), paddingHorizontal: sc(12), gap: sc(8) }}>
          <Mail size={sc(13)} color={colors.muted} />
          <TextInput
            value={email}
            onChangeText={setEmail}
            placeholder="guest@example.com"
            placeholderTextColor={colors.muted}
            keyboardType='email-address'
            autoCapitalize='none'
            style={{
              flex: 1,
              paddingVertical: sc(10),
              fontSize: sc(13),
              color: colors.heading,
              fontWeight: '500'
            }}
          />
        </View>
      </View>

      {/* Seating Preference */}
      <View>
        <Text style={{ fontSize: sc(11), fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: sc(5) }}>
          Seating Preference <Text style={{ color: colors.muted, fontWeight: '400' }}>(optional)</Text>
        </Text>
        <TouchableOpacity
          onPress={() => setShowPrefPicker(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: sc(8),
            paddingHorizontal: sc(12),
            paddingVertical: sc(10)
          }}
        >
          <Text style={{ fontSize: sc(13), color: seatingPreference ? colors.heading : colors.muted, fontWeight: seatingPreference ? '500' : '400' }}>
            {seatingPreference ? preferences.find(p => p.value === seatingPreference)?.label ?? seatingPreference : 'Select preference'}
          </Text>
          <ChevronDown size={sc(14)} color={colors.muted} />
        </TouchableOpacity>
      </View>

      {/* Preferred Section */}
      <View>
        <Text style={{ fontSize: sc(11), fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: sc(5) }}>
          Preferred Section <Text style={{ color: colors.muted, fontWeight: '400' }}>(optional)</Text>
        </Text>
        <TouchableOpacity
          onPress={() => setShowSectionPicker(true)}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: sc(8),
            paddingHorizontal: sc(12),
            paddingVertical: sc(10)
          }}
        >
          <Text style={{ fontSize: sc(13), color: preferredSection ? colors.heading : colors.muted, fontWeight: preferredSection ? '500' : '400' }}>
            {preferredSection ? sectionOptions.find(sec => sec.value === preferredSection)?.label ?? preferredSection : 'Select section'}
          </Text>
          <ChevronDown size={sc(14)} color={colors.muted} />
        </TouchableOpacity>
      </View>

      {/* Notes */}
      <View>
        <Text style={{ fontSize: sc(11), fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: sc(5) }}>
          Notes <Text style={{ color: colors.muted, fontWeight: '400' }}>(optional)</Text>
        </Text>
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border, borderRadius: sc(8), paddingHorizontal: sc(12), gap: sc(8) }}>
          <StickyNote size={sc(13)} color={colors.muted} style={{ marginTop: sc(10) }} />
          <TextInput
            value={notes}
            onChangeText={setNotes}
            placeholder="Any special requests?"
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={3}
            textAlignVertical='top'
            style={{
              flex: 1,
              paddingVertical: sc(10),
              fontSize: sc(13),
              color: colors.heading,
              fontWeight: '500',
              minHeight: sc(60)
            }}
          />
        </View>
      </View>

      {/* Action Buttons */}
      <View style={{ flexDirection: 'row', gap: sc(8), marginTop: sc(8) }}>
        <TouchableOpacity
          onPress={onCancel}
          style={{
            flex: 1,
            paddingVertical: sc(12),
            borderRadius: sc(8),
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: 'center'
          }}
        >
          <Text style={{ fontSize: sc(13), fontWeight: '600', color: colors.label }}>
            Cancel
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={!canSubmit || isLoading || submitting}
          style={{
            flex: 2,
            paddingVertical: sc(12),
            borderRadius: sc(8),
            backgroundColor: canSubmit ? colors.teal + '20' : colors.card,
            borderWidth: 1,
            borderColor: canSubmit ? colors.teal + '50' : colors.border,
            alignItems: 'center',
            opacity: canSubmit ? 1 : 0.6
          }}
        >
          {isLoading || submitting ? (
            <ActivityIndicator size='small' color={colors.teal} />
          ) : (
            <Text style={{ fontSize: sc(13), fontWeight: '700', color: canSubmit ? colors.teal : colors.muted }}>
              {mode === 'edit' ? 'Save Changes' : 'Add to Waitlist'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      {/* Seating Preference Picker Modal */}
      <Modal visible={showPrefPicker} transparent animationType='fade' onRequestClose={() => setShowPrefPicker(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: sc(20) }}
          activeOpacity={1}
          onPress={() => setShowPrefPicker(false)}
        >
          <View style={{ width: sc(300), backgroundColor: colors.panel, borderRadius: sc(12), borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: sc(16), paddingVertical: sc(12), borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: sc(13), fontWeight: '700', color: colors.heading, textAlign: 'center' }}>Seating Preference</Text>
            </View>
            {preferences.map(pref => (
              <TouchableOpacity
                key={pref.value}
                onPress={() => { setSeatingPreference(pref.value); setShowPrefPicker(false) }}
                style={{
                  paddingHorizontal: sc(16),
                  paddingVertical: sc(12),
                  backgroundColor: seatingPreference === pref.value ? colors.teal + '10' : 'transparent',
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border
                }}
              >
                <Text style={{ fontSize: sc(13), fontWeight: seatingPreference === pref.value ? '700' : '500', color: seatingPreference === pref.value ? colors.teal : colors.label }}>
                  {pref.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Section Picker Modal */}
      <Modal visible={showSectionPicker} transparent animationType='fade' onRequestClose={() => setShowSectionPicker(false)}>
        <TouchableOpacity
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: sc(20) }}
          activeOpacity={1}
          onPress={() => setShowSectionPicker(false)}
        >
          <View style={{ width: sc(300), backgroundColor: colors.panel, borderRadius: sc(12), borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>
            <View style={{ paddingHorizontal: sc(16), paddingVertical: sc(12), borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: sc(13), fontWeight: '700', color: colors.heading, textAlign: 'center' }}>Preferred Section</Text>
            </View>
            {sectionOptions.map(sec => (
              <TouchableOpacity
                key={sec.value}
                onPress={() => { setPreferredSection(sec.value); setShowSectionPicker(false) }}
                style={{
                  paddingHorizontal: sc(16),
                  paddingVertical: sc(12),
                  backgroundColor: preferredSection === sec.value ? colors.teal + '10' : 'transparent',
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border
                }}
              >
                <Text style={{ fontSize: sc(13), fontWeight: preferredSection === sec.value ? '700' : '500', color: preferredSection === sec.value ? colors.teal : colors.label }}>
                  {sec.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </TouchableOpacity>
      </Modal>
    </View>
  )
}

export default AddToWaitlistForm