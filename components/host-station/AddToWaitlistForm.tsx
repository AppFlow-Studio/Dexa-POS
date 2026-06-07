import { colors } from '@/lib/theme'
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
import React, { useCallback, useEffect, useMemo, useState } from 'react'
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
    estimated_ready_at?: string
  }) => void
  onCancel: () => void
  isLoading: boolean
  mode?: 'add' | 'edit'
  initialValues?: {
    party_name?: string
    party_size?: number
    phone?: string
    email?: string
    seating_preference?: string
    preferred_section?: string
    notes?: string
    quoted_wait_minutes?: number
  }
}

const SEATING_PREFERENCES = ['No Preference', 'Indoor', 'Outdoor', 'Bar']
const NO_SECTION_PREFERENCE = 'No Preference'
const normalizePhone = (value?: string | null) =>
  (value ?? '').replace(/\D/g, '')

const labelStyle = {
  color: colors.muted,
  fontSize: 9,
  fontWeight: '700' as const,
  textTransform: 'uppercase' as const,
  letterSpacing: 0.8,
  marginBottom: 5
}

const DropdownModal = ({
  visible,
  onClose,
  title,
  options,
  selected,
  onSelect
}: {
  visible: boolean
  onClose: () => void
  title: string
  options: string[]
  selected: string
  onSelect: (v: string) => void
}) => (
  <Modal
    visible={visible}
    transparent
    animationType='fade'
    onRequestClose={onClose}
  >
    <TouchableOpacity
      activeOpacity={1}
      onPress={onClose}
      style={{
        flex: 1,
        backgroundColor: 'rgba(0,0,0,0.55)',
        justifyContent: 'center',
        alignItems: 'center'
      }}
    >
      <TouchableOpacity
        activeOpacity={1}
        style={{
          width: 260,
          backgroundColor: colors.card,
          borderRadius: 12,
          overflow: 'hidden',
          borderWidth: 1,
          borderColor: colors.border
        }}
      >
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border
          }}
        >
          <Text
            style={{ color: colors.heading, fontSize: 12, fontWeight: '700' }}
          >
            {title}
          </Text>
        </View>
        {options.map(item => (
          <TouchableOpacity
            key={item}
            onPress={() => {
              onSelect(item)
              onClose()
            }}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 11,
              borderBottomWidth: 1,
              borderBottomColor: colors.border + '50',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between'
            }}
          >
            <Text
              style={{
                fontSize: 12,
                color: item === selected ? colors.teal : colors.label,
                fontWeight: item === selected ? '700' : '400'
              }}
            >
              {item}
            </Text>
            {item === selected && (
              <View
                style={{
                  width: 7,
                  height: 7,
                  borderRadius: 4,
                  backgroundColor: colors.teal
                }}
              />
            )}
          </TouchableOpacity>
        ))}
      </TouchableOpacity>
    </TouchableOpacity>
  </Modal>
)

export const AddToWaitlistForm: React.FC<AddToWaitlistFormProps> = ({
  onSubmit,
  onCancel,
  isLoading,
  mode = 'add',
  initialValues
}) => {
  const tables = useFloorPlanStore(s => s.tables)
  const floorPlans = useFloorPlanStore(s => s.floorPlans)
  const isFloorPlansLoading = useFloorPlanStore(s => s.isLoading)
  const lastFloorPlanSyncAt = useFloorPlanStore(s => s.lastSyncAt)
  const floorPlanLocationId = useFloorPlanStore(s => s.locationId)
  const setFloorPlans = useFloorPlanStore(s => s.setFloorPlans)
  const selectedStoreId = useStoreSettingsStore(s => s.selectedStore?.id)
  const waitlist = useWaitlistStore(s => s.waitlist)
  const [allCustomers, setAllCustomers] = useState<CustomerWithMeta[]>(() =>
    getCachedCustomers()
  )

  const [isLoadingFloorPlans, setIsLoadingFloorPlans] = useState(false)

  useEffect(() => {
    if (floorPlans.length > 0) return
    const locationId = floorPlanLocationId || selectedStoreId
    if (!locationId) return
    const supabase = getFloorPlanClient()
    if (!supabase) return
    let cancelled = false
    setIsLoadingFloorPlans(true)
    FloorPlanService.getLocationFloorPlans(supabase, locationId)
      .then(({ data }) => {
        if (cancelled) return
        if (data) setFloorPlans(data)
      })
      .finally(() => {
        if (!cancelled) setIsLoadingFloorPlans(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    floorPlans.length,
    floorPlanLocationId,
    selectedStoreId,
    setFloorPlans
  ])

  const sectionsLoading =
    floorPlans.length === 0 &&
    (isFloorPlansLoading || isLoadingFloorPlans || !lastFloorPlanSyncAt)

  const sectionOptions = useMemo(() => {
    const names = floorPlans
      .map(fp => fp.name)
      .filter((name): name is string => !!name && name.trim().length > 0)
    const base = [NO_SECTION_PREFERENCE, ...Array.from(new Set(names))]
    const initialSection = initialValues?.preferred_section
    if (initialSection && !base.includes(initialSection)) {
      base.push(initialSection)
    }
    return base
  }, [floorPlans, initialValues?.preferred_section])

  const [partyName, setPartyName] = useState(initialValues?.party_name ?? '')
  const [partySize, setPartySize] = useState(initialValues?.party_size ?? 2)
  const [phone, setPhone] = useState(initialValues?.phone ?? '')
  const [email, setEmail] = useState(initialValues?.email ?? '')
  const [seatingPreference, setSeatingPreference] = useState(
    initialValues?.seating_preference ?? 'No Preference'
  )
  const [preferredSection, setPreferredSection] = useState(
    initialValues?.preferred_section ?? 'No Preference'
  )
  const [notes, setNotes] = useState(initialValues?.notes ?? '')
  const [quotedWait, setQuotedWait] = useState(
    initialValues?.quoted_wait_minutes != null
      ? String(initialValues.quoted_wait_minutes)
      : '15'
  )
  const [showSeatingDropdown, setShowSeatingDropdown] = useState(false)
  const [showSectionDropdown, setShowSectionDropdown] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [autoCalculatedWait, setAutoCalculatedWait] = useState<number | null>(
    null
  )
  const [isWaitOverridden, setIsWaitOverridden] = useState(mode === 'edit')
  const [estimatedReadyAt, setEstimatedReadyAt] = useState<Date | null>(null)
  const [customerQuery, setCustomerQuery] = useState('')
  const [linkedCustomer, setLinkedCustomer] = useState<CustomerWithMeta | null>(
    null
  )
  const [isCustomerAutoFillPaused, setIsCustomerAutoFillPaused] =
    useState(false)

  useEffect(() => {
    setAllCustomers(getCachedCustomers())
  }, [selectedStoreId])

  const customerResults = useMemo(() => {
    const query = customerQuery.toLowerCase().trim()
    const phoneQuery = normalizePhone(customerQuery)
    if (query.length < 2 && phoneQuery.length < 3) return []

    return allCustomers
      .filter(customer => {
        const customerName = (customer.name ?? '').toLowerCase()
        const customerPhone = normalizePhone(
          customer.phone ?? customer.phoneNumber
        )
        return (
          (query.length >= 2 && customerName.includes(query)) ||
          (phoneQuery.length >= 3 && customerPhone.includes(phoneQuery))
        )
      })
      .slice(0, 4)
  }, [allCustomers, customerQuery])

  const applyCustomer = useCallback((customer: CustomerWithMeta) => {
    setLinkedCustomer(customer)
    setPartyName(customer.name ?? '')
    setPhone(customer.phone ?? customer.phoneNumber ?? '')
    setEmail(customer.email ?? '')
    setCustomerQuery('')
    setIsCustomerAutoFillPaused(false)
  }, [])

  const updatePartyName = useCallback((value: string) => {
    setPartyName(value)
    setLinkedCustomer(null)
    setCustomerQuery(value)
    setIsCustomerAutoFillPaused(false)
  }, [])

  const updatePhone = useCallback((value: string) => {
    setPhone(value)
    setLinkedCustomer(null)
    setCustomerQuery(value)
    setIsCustomerAutoFillPaused(false)
  }, [])

  const handleChangeCustomer = useCallback(() => {
    setLinkedCustomer(null)
    setPartyName('')
    setPhone('')
    setEmail('')
    setCustomerQuery('')
    setIsCustomerAutoFillPaused(false)
  }, [])

  useEffect(() => {
    if (mode === 'edit' || linkedCustomer || isCustomerAutoFillPaused) return

    const typedName = partyName.toLowerCase().trim()
    const typedPhone = normalizePhone(phone)
    if (typedName.length < 3 && typedPhone.length < 7) return

    const match = allCustomers.find(customer => {
      const customerName = (customer.name ?? '').toLowerCase().trim()
      const customerPhone = normalizePhone(
        customer.phone ?? customer.phoneNumber
      )
      return (
        (typedName.length >= 3 && customerName === typedName) ||
        (typedPhone.length >= 7 && customerPhone.endsWith(typedPhone))
      )
    })

    if (match) applyCustomer(match)
  }, [
    allCustomers,
    applyCustomer,
    isCustomerAutoFillPaused,
    linkedCustomer,
    mode,
    partyName,
    phone
  ])

  useEffect(() => {
    if (tables.length === 0) return
    const activeAhead = waitlist.filter(
      w => w.status === 'waiting' || w.status === 'notified'
    ).length
    const calculator = new WaitTimeCalculator(tables, waitlist)
    const { waitTime, estimatedReadyAt: calculated } =
      calculator.calculateWaitTimeEnhanced(partySize, activeAhead)
    setAutoCalculatedWait(waitTime)
    setEstimatedReadyAt(calculated)
    if (!isWaitOverridden) setQuotedWait(String(waitTime))
  }, [partySize, tables, waitlist, isWaitOverridden])

  useEffect(() => {
    if (errors.length > 0) setErrors([])
  }, [errors.length, partyName, partySize, phone, email, quotedWait])

  const adjustPartySize = (delta: number) => {
    setPartySize(prev => Math.max(1, Math.min(20, prev + delta)))
  }

  const validateForm = (): boolean => {
    const newErrors: string[] = []
    if (!partyName.trim()) newErrors.push('Party name is required')
    if (partySize < 1) newErrors.push('Party size must be at least 1')
    if (phone && !/^[\d\s\-\+\(\)]+$/.test(phone))
      newErrors.push('Invalid phone number')
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
      newErrors.push('Invalid email address')
    const wait = parseInt(quotedWait, 10)
    if (isNaN(wait) || wait < 0)
      newErrors.push('Wait time must be a positive number')
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
      seating_preference:
        seatingPreference !== 'No Preference' ? seatingPreference : undefined,
      preferred_section:
        preferredSection !== 'No Preference' ? preferredSection : undefined,
      notes: notes.trim() || undefined,
      quoted_wait_minutes: quotedWait ? parseInt(quotedWait, 10) : undefined,
      estimated_ready_at: estimatedReadyAt?.toISOString()
    })
  }

  const hasName = partyName.trim().length > 0

  return (
    <View style={{ paddingBottom: 16, paddingHorizontal: 14, paddingTop: 10 }}>
      {/* Errors */}
      {errors.length > 0 && (
        <View
          style={{
            marginBottom: 12,
            padding: 10,
            borderRadius: 8,
            backgroundColor: colors.danger + '12',
            borderWidth: 1,
            borderColor: colors.danger + '40'
          }}
        >
          {errors.map((error, idx) => (
            <View
              key={idx}
              style={{
                flexDirection: 'row',
                alignItems: 'flex-start',
                gap: 6,
                marginBottom: idx < errors.length - 1 ? 4 : 0
              }}
            >
              <AlertCircle
                size={12}
                color={colors.danger}
                style={{ marginTop: 1 }}
              />
              <Text style={{ color: colors.danger, fontSize: 12, flex: 1 }}>
                {error}
              </Text>
            </View>
          ))}
        </View>
      )}

      {/* ── Party Name ── */}
      <View style={{ marginBottom: 12, zIndex: 30 }}>
        <Text style={labelStyle}>Guest Name *</Text>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.screen,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: hasName ? colors.teal + '60' : colors.border,
            paddingHorizontal: 10,
            gap: 8
          }}
        >
          <UserCircle size={15} color={hasName ? colors.teal : colors.muted} />
          <TextInput
            autoFocus
            value={partyName}
            onChangeText={updatePartyName}
            placeholder='Guest name or party'
            placeholderTextColor={colors.muted}
            maxLength={100}
            style={{
              flex: 1,
              fontSize: 14,
              color: colors.heading,
              paddingVertical: 9,
              fontWeight: '600'
            }}
          />
        </View>
        {linkedCustomer && (
          <View
            style={{
              marginTop: 6,
              flexDirection: 'row',
              alignItems: 'center',
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.teal + '45',
              backgroundColor: colors.teal + '10',
              paddingHorizontal: 10,
              paddingVertical: 7,
              gap: 8
            }}
          >
            <Search size={12} color={colors.teal} />
            <View style={{ flex: 1 }}>
              <Text
                style={{ color: colors.heading, fontSize: 12, fontWeight: '700' }}
                numberOfLines={1}
              >
                {linkedCustomer.name ?? 'Customer'}
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>
                {linkedCustomer.phone ?? linkedCustomer.phoneNumber ?? 'No phone'}
                {linkedCustomer.email ? ` · ${linkedCustomer.email}` : ''}
              </Text>
            </View>
            <TouchableOpacity
              onPress={handleChangeCustomer}
              style={{
                paddingHorizontal: 8,
                paddingVertical: 5,
                borderRadius: 6,
                backgroundColor: colors.screen,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <Text style={{ color: colors.label, fontSize: 11, fontWeight: '700' }}>
                Change
              </Text>
            </TouchableOpacity>
          </View>
        )}
        {!linkedCustomer && customerResults.length > 0 && (
          <View
            style={{
              position: 'absolute',
              top: 66,
              left: 0,
              right: 0,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.card,
              overflow: 'hidden',
              zIndex: 40,
              elevation: 8,
              shadowColor: '#000',
              shadowOffset: { width: 0, height: 6 },
              shadowOpacity: 0.18,
              shadowRadius: 12
            }}
          >
            {customerResults.map((customer, index) => (
              <TouchableOpacity
                key={customer.id}
                onPress={() => applyCustomer(customer)}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderTopWidth: index > 0 ? 1 : 0,
                  borderTopColor: colors.border
                }}
              >
                <View
                  style={{
                    width: 24,
                    height: 24,
                    borderRadius: 12,
                    backgroundColor: colors.teal + '16',
                    alignItems: 'center',
                    justifyContent: 'center'
                  }}
                >
                  <Text style={{ color: colors.teal, fontSize: 10, fontWeight: '800' }}>
                    {(customer.name ?? 'G')[0].toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text
                    style={{ color: colors.heading, fontSize: 12, fontWeight: '700' }}
                    numberOfLines={1}
                  >
                    {customer.name ?? 'Guest'}
                  </Text>
                  <Text style={{ color: colors.muted, fontSize: 11 }} numberOfLines={1}>
                    {customer.phone ?? customer.phoneNumber ?? 'No phone'}
                    {customer.email ? ` · ${customer.email}` : ''}
                  </Text>
                </View>
                <Text style={{ color: colors.teal, fontSize: 10, fontWeight: '800' }}>
                  Select
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* ── Party Size + Wait Time ── */}
      <View style={{ flexDirection: 'row', gap: 10, marginBottom: 12 }}>
        {/* Party size stepper */}
        <View style={{ flex: 1 }}>
          <View
            style={{ height: 14, justifyContent: 'center', marginBottom: 5 }}
          >
            <Text style={{ ...labelStyle, marginBottom: 0 }}>Party Size *</Text>
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.screen,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
              height: 38
            }}
          >
            <TouchableOpacity
              onPress={() => adjustPartySize(-1)}
              style={{
                width: 36,
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                borderRightWidth: 1,
                borderRightColor: colors.border
              }}
            >
              <Minus
                size={13}
                color={partySize <= 1 ? colors.muted : colors.label}
              />
            </TouchableOpacity>
            <View
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 5
              }}
            >
              <Users size={12} color={colors.muted} />
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '800',
                  color: colors.heading,
                  lineHeight: 20
                }}
              >
                {partySize}
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => adjustPartySize(1)}
              style={{
                width: 36,
                height: '100%',
                alignItems: 'center',
                justifyContent: 'center',
                borderLeftWidth: 1,
                borderLeftColor: colors.border
              }}
            >
              <Plus
                size={13}
                color={partySize >= 20 ? colors.muted : colors.label}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Wait time */}
        <View style={{ flex: 1 }}>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 5,
              marginBottom: 5,
              height: 14
            }}
          >
            <Text style={{ ...labelStyle, marginBottom: 0 }}>Wait (min)</Text>
            {autoCalculatedWait !== null && !isWaitOverridden && (
              <View
                style={{
                  paddingHorizontal: 5,
                  borderRadius: 4,
                  backgroundColor: colors.teal + '18',
                  borderWidth: 1,
                  borderColor: colors.teal + '40',
                  height: 14,
                  justifyContent: 'center'
                }}
              >
                <Text
                  style={{ color: colors.teal, fontSize: 8, fontWeight: '700' }}
                >
                  AUTO
                </Text>
              </View>
            )}
            {isWaitOverridden && (
              <View
                style={{
                  paddingHorizontal: 5,
                  borderRadius: 4,
                  backgroundColor: colors.warning + '18',
                  borderWidth: 1,
                  borderColor: colors.warning + '40',
                  height: 14,
                  justifyContent: 'center'
                }}
              >
                <Text
                  style={{
                    color: colors.warning,
                    fontSize: 8,
                    fontWeight: '700'
                  }}
                >
                  CUSTOM
                </Text>
              </View>
            )}
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              backgroundColor: colors.screen,
              borderRadius: 8,
              borderWidth: 1,
              borderColor: isWaitOverridden
                ? colors.warning + '60'
                : colors.border,
              paddingHorizontal: 10,
              gap: 6,
              height: 38
            }}
          >
            <Clock
              size={13}
              color={isWaitOverridden ? colors.warning : colors.muted}
            />
            <TextInput
              value={quotedWait}
              onChangeText={text => {
                setQuotedWait(text)
                setIsWaitOverridden(text !== String(autoCalculatedWait))
              }}
              placeholderTextColor={colors.muted}
              keyboardType='number-pad'
              maxLength={3}
              style={{
                flex: 1,
                fontSize: 16,
                fontWeight: '800',
                color: isWaitOverridden ? colors.warning : colors.heading,
                padding: 0,
                lineHeight: 20
              }}
            />
            <Text style={{ color: colors.muted, fontSize: 11 }}>min</Text>
          </View>
        </View>
      </View>

      {/* ── Contact ── */}
      <View style={{ marginBottom: 12 }}>
        <Text style={labelStyle}>Contact (Optional)</Text>
        <View
          style={{
            borderRadius: 10,
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden'
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 10,
              gap: 8,
              borderBottomWidth: 1,
              borderBottomColor: colors.border
            }}
          >
            <Phone size={13} color={colors.muted} />
            <TextInput
              value={phone}
              onChangeText={updatePhone}
              placeholder='(555) 123-4567'
              placeholderTextColor={colors.muted}
              keyboardType='phone-pad'
              maxLength={20}
              style={{
                flex: 1,
                fontSize: 13,
                color: colors.heading,
                paddingVertical: 10
              }}
            />
          </View>
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingHorizontal: 10,
              gap: 8
            }}
          >
            <Mail size={13} color={colors.muted} />
            <TextInput
              value={email}
              onChangeText={setEmail}
              placeholder='guest@example.com'
              placeholderTextColor={colors.muted}
              keyboardType='email-address'
              maxLength={100}
              style={{
                flex: 1,
                fontSize: 13,
                color: colors.heading,
                paddingVertical: 10
              }}
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
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: colors.card,
                borderRadius: 8,
                borderWidth: 1,
                borderColor:
                  seatingPreference !== 'No Preference'
                    ? colors.info + '60'
                    : colors.border,
                paddingHorizontal: 10,
                paddingVertical: 10
              }}
            >
              <Text
                style={{
                  fontSize: 12,
                  color:
                    seatingPreference !== 'No Preference'
                      ? colors.info
                      : colors.label
                }}
              >
                {seatingPreference}
              </Text>
              <ChevronDown size={12} color={colors.muted} />
            </TouchableOpacity>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ ...labelStyle, marginBottom: 5 }}>Section</Text>
            <TouchableOpacity
              onPress={() => setShowSectionDropdown(true)}
              disabled={sectionsLoading}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: colors.card,
                borderRadius: 8,
                borderWidth: 1,
                borderColor:
                  preferredSection !== 'No Preference'
                    ? colors.info + '60'
                    : colors.border,
                paddingHorizontal: 10,
                paddingVertical: 10,
                opacity: sectionsLoading ? 0.6 : 1
              }}
            >
              {sectionsLoading ? (
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6
                  }}
                >
                  <ActivityIndicator size='small' color={colors.muted} />
                  <Text style={{ fontSize: 12, color: colors.muted }}>
                    Loading…
                  </Text>
                </View>
              ) : (
                <Text
                  style={{
                    fontSize: 12,
                    color:
                      preferredSection !== 'No Preference'
                        ? colors.info
                        : colors.label
                  }}
                >
                  {preferredSection}
                </Text>
              )}
              <ChevronDown size={12} color={colors.muted} />
            </TouchableOpacity>
          </View>
        </View>
      </View>

      {/* ── Notes ── */}
      <View style={{ marginBottom: 16 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 5,
            marginBottom: 5
          }}
        >
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
          style={{
            backgroundColor: colors.card,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.border,
            paddingHorizontal: 12,
            paddingVertical: 10,
            fontSize: 13,
            color: colors.heading,
            minHeight: 70,
            textAlignVertical: 'top'
          }}
        />
      </View>

      {/* ── Action Buttons ── */}
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TouchableOpacity
          onPress={onCancel}
          disabled={isLoading}
          style={{
            flex: 1,
            paddingVertical: 11,
            borderRadius: 9,
            alignItems: 'center',
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.card
          }}
        >
          <Text
            style={{ color: colors.label, fontWeight: '600', fontSize: 13 }}
          >
            Cancel
          </Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={isLoading}
          style={{
            flex: 2,
            paddingVertical: 11,
            borderRadius: 9,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.teal + '20',
            borderWidth: 1,
            borderColor: colors.teal + '60',
            opacity: isLoading ? 0.5 : 1
          }}
        >
          {isLoading ? (
            <ActivityIndicator color={colors.teal} size='small' />
          ) : (
            <Text
              style={{
                color: colors.teal,
                fontWeight: '800',
                fontSize: 13,
                letterSpacing: 0.3
              }}
            >
              {mode === 'edit' ? 'Save Changes' : 'Add to Waitlist'}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <DropdownModal
        visible={showSeatingDropdown}
        onClose={() => setShowSeatingDropdown(false)}
        title='Seating Preference'
        options={SEATING_PREFERENCES}
        selected={seatingPreference}
        onSelect={setSeatingPreference}
      />
      <DropdownModal
        visible={showSectionDropdown}
        onClose={() => setShowSectionDropdown(false)}
        title='Preferred Section'
        options={sectionOptions}
        selected={preferredSection}
        onSelect={setPreferredSection}
      />
    </View>
  )
}

export default React.memo(AddToWaitlistForm)
