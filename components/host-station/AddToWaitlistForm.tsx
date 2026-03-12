import { colors } from '@/lib/theme'
import WaitTimeCalculator from '@/lib/waitlist/waitTimeCalculator'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { AlertCircle, ChevronDown } from 'lucide-react-native'
import React, { useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  KeyboardTypeOptions,
  Modal,
  Platform,
  ScrollView,
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
}

const SEATING_PREFERENCES = ['No Preference', 'Indoor', 'Outdoor', 'Bar']
const SECTIONS = ['No Preference', 'Main Dining', 'Patio', 'Bar', 'Private']

interface SectionHeaderProps {
  title: string
  id: string
  expandedSection: string | null
  onToggle: (id: string) => void
}

interface InputFieldProps {
  label: string
  value: string
  onChangeText: (text: string) => void
  placeholder: string
  keyboardType?: KeyboardTypeOptions
  required?: boolean
  multiline?: boolean
  maxLength?: number
  autoFocus?: boolean
}

const SectionHeader: React.FC<SectionHeaderProps> = ({
  title,
  id,
  expandedSection,
  onToggle
}) => (
  <TouchableOpacity
    onPress={() => onToggle(id)}
    className='flex-row items-center justify-between px-4 py-3 bg-card border-b border-border'
  >
    <Text className='text-label font-semibold'>{title}</Text>
    <ChevronDown
      size={18}
      color={colors.label}
      style={{
        transform: [{ rotate: expandedSection === id ? '180deg' : '0deg' }]
      }}
    />
  </TouchableOpacity>
)

const InputField: React.FC<InputFieldProps> = ({
  label,
  value,
  onChangeText,
  placeholder,
  keyboardType = 'default',
  required = false,
  multiline = false,
  maxLength,
  autoFocus = false
}) => (
  <View className='mb-4'>
    <View className='flex-row items-center gap-1'>
      <Text className='text-label text-sm font-medium'>{label}</Text>
      {required && <Text className='text-red-500'>*</Text>}
    </View>
    <TextInput
      autoFocus={autoFocus}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.muted}
      keyboardType={keyboardType}
      multiline={multiline}
      maxLength={maxLength}
      style={{
        backgroundColor: colors.screen,
        color: 'white',
        fontSize: 16,
        paddingHorizontal: 14,
        paddingVertical: multiline ? 12 : 14,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        height: multiline ? 100 : 'auto',
        textAlignVertical: multiline ? 'top' : 'center'
      }}
      className='text-white'
    />
  </View>
)

export const AddToWaitlistForm: React.FC<AddToWaitlistFormProps> = ({
  onSubmit,
  onCancel,
  isLoading
}) => {
  const tables = useFloorPlanStore(s => s.tables)

  const [partyName, setPartyName] = useState('')
  const [partySize, setPartySize] = useState('2')
  const [phone, setPhone] = useState('')
  const [email, setEmail] = useState('')
  const [seatingPreference, setSeatingPreference] = useState('No Preference')
  const [preferredSection, setPreferredSection] = useState('No Preference')
  const [notes, setNotes] = useState('')
  const [quotedWait, setQuotedWait] = useState('15')
  const [expandedSection, setExpandedSection] = useState<string | null>('name')
  const [showSeatingDropdown, setShowSeatingDropdown] = useState(false)
  const [showSectionDropdown, setShowSectionDropdown] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [autoCalculatedWait, setAutoCalculatedWait] = useState<number | null>(
    null
  )
  const [isWaitOverridden, setIsWaitOverridden] = useState(false)
  const [estimatedReadyAt, setEstimatedReadyAt] = useState<Date | null>(null)

  // Auto-calculate wait time when party size changes
  useEffect(() => {
    if (tables.length === 0) return

    const size = parseInt(partySize, 10)
    if (!isNaN(size) && size > 0) {
      const calculator = new WaitTimeCalculator(tables)
      const { waitTime, estimatedReadyAt: calculated } =
        calculator.calculateWaitTimeEnhanced(size)
      setAutoCalculatedWait(waitTime)
      setEstimatedReadyAt(calculated)

      // Only update quoted wait if not manually overridden
      if (!isWaitOverridden) {
        setQuotedWait(String(waitTime))
      }
    }
  }, [partySize, tables, isWaitOverridden])

  // Clear stale validation errors as user edits fields.
  useEffect(() => {
    if (errors.length > 0) {
      setErrors([])
    }
  }, [partyName, partySize, phone, email, quotedWait])

  const validateForm = (): boolean => {
    const newErrors: string[] = []

    if (!partyName.trim()) {
      newErrors.push('Party name is required')
    }

    const size = parseInt(partySize, 10)
    if (isNaN(size) || size < 1) {
      newErrors.push('Party size must be at least 1')
    }

    if (phone && !/^[\d\s\-\+\(\)]+$/.test(phone)) {
      newErrors.push('Invalid phone number')
    }

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      newErrors.push('Invalid email address')
    }

    const wait = parseInt(quotedWait, 10)
    if (isNaN(wait) || wait < 0) {
      newErrors.push('Wait time must be a positive number')
    }

    setErrors(newErrors)
    return newErrors.length === 0
  }

  const handleSubmit = () => {
    if (!validateForm()) {
      return
    }

    onSubmit({
      party_name: partyName.trim(),
      party_size: parseInt(partySize, 10),
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

  const handleExpandedSectionChange = (id: string) => {
    setExpandedSection(prev => (prev === id ? null : id))
  }

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      className='flex-1'
    >
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps='handled'
      >
        {/* Error Messages */}
        {errors.length > 0 && (
          <View className='mb-4 p-3 rounded-lg bg-red-900/20 border border-red-900/50'>
            {errors.map((error, idx) => (
              <View key={idx} className='flex-row items-start gap-2 mb-2'>
                <AlertCircle
                  size={14}
                  color='#ef4444'
                  style={{ marginTop: 2 }}
                />
                <Text className='text-red-400 text-sm flex-1'>{error}</Text>
              </View>
            ))}
          </View>
        )}

        {/* Party Information Section */}
        <View className='mb-4 rounded-lg overflow-hidden border border-border'>
          <SectionHeader
            title='Party Information'
            id='name'
            expandedSection={expandedSection}
            onToggle={handleExpandedSectionChange}
          />
          {expandedSection === 'name' && (
            <View className='px-4 pt-4 pb-4'>
              <InputField
                label='Party Name'
                value={partyName}
                onChangeText={setPartyName}
                placeholder='Enter guest name'
                required
                maxLength={100}
                autoFocus
              />

              <View className='flex-row gap-4'>
                <View className='flex-1'>
                  <Text className='text-label text-sm font-medium mb-2'>
                    Party Size <Text className='text-red-500'>*</Text>
                  </Text>
                  <TextInput
                    value={partySize}
                    onChangeText={setPartySize}
                    placeholder='2'
                    placeholderTextColor={colors.muted}
                    keyboardType='number-pad'
                    maxLength={3}
                    style={{
                      backgroundColor: colors.screen,
                      color: 'white',
                      fontSize: 16,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: colors.border
                    }}
                  />
                </View>

                <View className='flex-1'>
                  <View className='flex-row items-center gap-1 mb-2'>
                    <Text className='text-label text-sm font-medium'>
                      Quoted Wait (min)
                    </Text>
                    {autoCalculatedWait && (
                      <Text
                        className='text-xs font-semibold'
                        style={{ color: '#10b981' }}
                      >
                        auto: {Math.round(autoCalculatedWait)}m
                      </Text>
                    )}
                  </View>
                  <TextInput
                    value={quotedWait}
                    onChangeText={text => {
                      setQuotedWait(text)
                      // Mark as overridden if user manually changes it
                      if (text !== String(autoCalculatedWait)) {
                        setIsWaitOverridden(true)
                      } else {
                        setIsWaitOverridden(false)
                      }
                    }}
                    placeholderTextColor={colors.muted}
                    keyboardType='number-pad'
                    maxLength={3}
                    style={{
                      backgroundColor: colors.screen,
                      color: isWaitOverridden ? colors.warning : 'white',
                      fontSize: 16,
                      paddingHorizontal: 14,
                      paddingVertical: 14,
                      borderRadius: 12,
                      borderWidth: 1,
                      borderColor: isWaitOverridden
                        ? colors.warning
                        : colors.border
                    }}
                  />
                </View>
              </View>
            </View>
          )}
        </View>

        {/* Contact Information Section */}
        <View className='mb-4 rounded-lg overflow-hidden border border-border'>
          <SectionHeader
            title='Contact Information'
            id='contact'
            expandedSection={expandedSection}
            onToggle={handleExpandedSectionChange}
          />
          {expandedSection === 'contact' && (
            <View className='px-4 pt-4 pb-4'>
              <InputField
                label='Phone'
                value={phone}
                onChangeText={setPhone}
                placeholder='(555) 123-4567'
                keyboardType='phone-pad'
                maxLength={20}
              />
              <InputField
                label='Email'
                value={email}
                onChangeText={setEmail}
                placeholder='guest@example.com'
                keyboardType='email-address'
                maxLength={100}
              />
            </View>
          )}
        </View>

        {/* Seating Preferences Section */}
        <View className='mb-4 rounded-lg overflow-hidden border border-border'>
          <SectionHeader
            title='Seating Preferences'
            id='seating'
            expandedSection={expandedSection}
            onToggle={handleExpandedSectionChange}
          />
          {expandedSection === 'seating' && (
            <View className='px-4 pt-4 pb-4'>
              {/* Seating Preference Dropdown */}
              <View className='mb-4'>
                <Text className='text-label text-sm font-medium mb-2'>
                  Seating Preference
                </Text>
                <TouchableOpacity
                  onPress={() => setShowSeatingDropdown(true)}
                  className='flex-row items-center justify-between px-4 py-3 rounded-lg border border-border bg-screen'
                >
                  <Text className='text-white'>{seatingPreference}</Text>
                  <ChevronDown size={18} color={colors.label} />
                </TouchableOpacity>
              </View>

              {/* Preferred Section Dropdown */}
              <View>
                <Text className='text-label text-sm font-medium mb-2'>
                  Preferred Section
                </Text>
                <TouchableOpacity
                  onPress={() => setShowSectionDropdown(true)}
                  className='flex-row items-center justify-between px-4 py-3 rounded-lg border border-border bg-screen'
                >
                  <Text className='text-white'>{preferredSection}</Text>
                  <ChevronDown size={18} color={colors.label} />
                </TouchableOpacity>
              </View>
            </View>
          )}
        </View>

        {/* Additional Notes Section */}
        <View className='mb-4 rounded-lg overflow-hidden border border-border'>
          <SectionHeader
            title='Additional Notes'
            id='notes'
            expandedSection={expandedSection}
            onToggle={handleExpandedSectionChange}
          />
          {expandedSection === 'notes' && (
            <View className='px-4 pt-4 pb-4'>
              <InputField
                label='Notes'
                value={notes}
                onChangeText={setNotes}
                placeholder='Special requests, allergies, dietary restrictions...'
                multiline
                maxLength={500}
              />
            </View>
          )}
        </View>

        {/* Action Buttons */}
        <View className='flex-row gap-3 mt-6'>
          <TouchableOpacity
            onPress={onCancel}
            disabled={isLoading}
            className='flex-1 py-3.5 rounded-lg items-center border border-border'
          >
            <Text className='text-label font-semibold text-base'>Cancel</Text>
          </TouchableOpacity>

          <TouchableOpacity
            onPress={handleSubmit}
            disabled={isLoading}
            className={`flex-1 py-3.5 rounded-lg items-center ${
              isLoading
                ? 'bg-teal/50 opacity-50'
                : 'bg-teal'
            }`}
          >
            {isLoading ? (
              <ActivityIndicator color='white' />
            ) : (
              <Text className='text-white font-bold text-base'>
                Add to Waitlist
              </Text>
            )}
          </TouchableOpacity>
        </View>
      </ScrollView>

      {/* Seating Preference Modal */}
      <Modal
        visible={showSeatingDropdown}
        transparent
        animationType='fade'
        onRequestClose={() => setShowSeatingDropdown(false)}
      >
        <View className='flex-1 bg-black/50 items-center justify-center px-4'>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShowSeatingDropdown(false)}
            className='absolute inset-0'
          />
          <View className='bg-card border border-border rounded-2xl w-full max-w-xs overflow-hidden z-10'>
            <View className='px-4 py-3 border-b border-border'>
              <Text className='text-white font-semibold text-lg'>
                Seating Preference
              </Text>
            </View>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 300 }}>
              {SEATING_PREFERENCES.map(item => (
                <TouchableOpacity
                  key={item}
                  onPress={() => {
                    setSeatingPreference(item)
                    setShowSeatingDropdown(false)
                  }}
                  className='px-4 py-3 border-b border-border/50'
                >
                  <Text
                    className={`text-base ${
                      item === seatingPreference
                        ? 'text-teal font-semibold'
                        : 'text-label'
                    }`}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Preferred Section Modal */}
      <Modal
        visible={showSectionDropdown}
        transparent
        animationType='fade'
        onRequestClose={() => setShowSectionDropdown(false)}
      >
        <View className='flex-1 bg-black/50 items-center justify-center px-4'>
          <TouchableOpacity
            activeOpacity={1}
            onPress={() => setShowSectionDropdown(false)}
            className='absolute inset-0'
          />
          <View className='bg-card border border-border rounded-2xl w-full max-w-xs overflow-hidden z-10'>
            <View className='px-4 py-3 border-b border-border'>
              <Text className='text-white font-semibold text-lg'>
                Preferred Section
              </Text>
            </View>
            <ScrollView nestedScrollEnabled style={{ maxHeight: 300 }}>
              {SECTIONS.map(item => (
                <TouchableOpacity
                  key={item}
                  onPress={() => {
                    setPreferredSection(item)
                    setShowSectionDropdown(false)
                  }}
                  className='px-4 py-3 border-b border-border/50'
                >
                  <Text
                    className={`text-base ${
                      item === preferredSection
                        ? 'text-teal font-semibold'
                        : 'text-label'
                    }`}
                  >
                    {item}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </KeyboardAvoidingView>
  )
}

export default React.memo(AddToWaitlistForm)
