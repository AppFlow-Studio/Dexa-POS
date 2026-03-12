import ConfirmationModal from '@/components/settings/reset-application/ConfirmationModal'
import AppNoticeModal from '@/components/ui/AppNoticeModal'
import { useToast } from '@/contexts/ToastContext'
import { colors } from '@/lib/theme'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useWaitlistSheetStore } from '@/stores/useWaitlistSheetStore'
import { useWaitlistStore } from '@/stores/useWaitlistStore'
import { WaitlistEntry } from '@/types/db-floor-plan-types'
import {
  AlertCircle,
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Phone,
  StickyNote,
  UserPlus,
  Users,
  X
} from 'lucide-react-native'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, {
  FadeIn,
  FadeOut,
  LinearTransition
} from 'react-native-reanimated'

// ── Helpers ──────────────────────────────────────────────────

function getElapsedMinutes (createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)
}

function formatElapsed (minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

// ── AddWaitlistModal ─────────────────────────────────────────

const AddWaitlistModal: React.FC<{
  visible: boolean
  onClose: () => void
  onSubmit: (data: {
    name: string
    partySize: number
    quotedTime: number
    notes: string
    phone?: string
  }) => void
  isLoading: boolean
}> = ({ visible, onClose, onSubmit, isLoading }) => {
  const [name, setName] = useState('')
  const [partySize, setPartySize] = useState('')
  const [quotedTime, setQuotedTime] = useState('15')
  const [notes, setNotes] = useState('')
  const [phone, setPhone] = useState('')

  const resetForm = () => {
    setName('')
    setPartySize('')
    setQuotedTime('15')
    setNotes('')
    setPhone('')
  }

  const handleSubmit = () => {
    onSubmit({
      name: name || 'Guest',
      partySize: parseInt(partySize || '2', 10),
      quotedTime: parseInt(quotedTime || '15', 10),
      notes,
      phone: phone || undefined
    })
    resetForm()
  }

  const handleClose = () => {
    resetForm()
    onClose()
  }

  const inputStyle = {
    backgroundColor: colors.screen,
    color: 'white' as const,
    fontSize: 16,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border
  }

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      onRequestClose={handleClose}
    >
      <Pressable
        className='flex-1 justify-center items-center'
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        onPress={handleClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <Pressable
            onPress={() => {}}
            className='bg-panel rounded-2xl w-[400px] border border-border'
          >
            {/* Header */}
            <View className='flex-row items-center justify-between px-5 pt-5 pb-3 border-b border-border'>
              <Text className='text-white text-xl font-bold'>
                Add to Waitlist
              </Text>
              <TouchableOpacity
                onPress={handleClose}
                className='w-9 h-9 rounded-full items-center justify-center bg-red-900/30'
              >
                <X size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>

            {/* Form */}
            <View className='px-5 pt-4 pb-6 gap-4'>
              {/* Name */}
              <View>
                <Text className='text-label text-sm mb-1.5 font-medium'>
                  Guest Name
                </Text>
                <TextInput
                  value={name}
                  onChangeText={setName}
                  placeholder='Enter name'
                  placeholderTextColor={colors.muted}
                  style={inputStyle}
                />
              </View>

              {/* Party Size + Quoted Time */}
              <View className='flex-row gap-4'>
                <View className='flex-1'>
                  <Text className='text-label text-sm mb-1.5 font-medium'>
                    Party Size
                  </Text>
                  <TextInput
                    value={partySize}
                    onChangeText={setPartySize}
                    keyboardType='numeric'
                    placeholder='2'
                    placeholderTextColor={colors.muted}
                    style={inputStyle}
                  />
                </View>
                <View className='flex-1'>
                  <Text className='text-label text-sm mb-1.5 font-medium'>
                    Wait Time (min)
                  </Text>
                  <TextInput
                    value={quotedTime}
                    onChangeText={setQuotedTime}
                    keyboardType='numeric'
                    placeholder='15'
                    placeholderTextColor={colors.muted}
                    style={inputStyle}
                  />
                </View>
              </View>

              {/* Phone */}
              <View>
                <Text className='text-label text-sm mb-1.5 font-medium'>
                  Phone (Optional)
                </Text>
                <TextInput
                  value={phone}
                  onChangeText={setPhone}
                  keyboardType='phone-pad'
                  placeholder='Phone number'
                  placeholderTextColor={colors.muted}
                  style={inputStyle}
                />
              </View>

              {/* Notes */}
              <View>
                <Text className='text-label text-sm mb-1.5 font-medium'>
                  Notes (Optional)
                </Text>
                <TextInput
                  value={notes}
                  onChangeText={setNotes}
                  placeholder='Special requests, allergies...'
                  placeholderTextColor={colors.muted}
                  multiline
                  style={{
                    ...inputStyle,
                    height: 80,
                    textAlignVertical: 'top'
                  }}
                />
              </View>

              {/* Buttons */}
              <View className='flex-row gap-3 mt-2'>
                <TouchableOpacity
                  onPress={handleClose}
                  className='flex-1 py-3.5 rounded-xl items-center border border-border'
                >
                  <Text className='text-label font-semibold text-base'>
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleSubmit}
                  disabled={isLoading}
                  className={`flex-1 py-3.5 rounded-xl items-center bg-teal ${
                    isLoading ? 'opacity-50' : ''
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
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  )
}

// ── WaitlistPanelCard ────────────────────────────────────────

const WaitlistPanelCard: React.FC<{
  entry: WaitlistEntry
  isExpanded: boolean
  onToggle: () => void
  onSeat: () => void
  onNotify: () => void
  onDelete: () => void
  now: number
}> = ({
  entry,
  isExpanded,
  onToggle,
  onSeat,
  onNotify,
  onDelete,
  now: _now
}) => {
  const elapsed = getElapsedMinutes(entry.created_at)
  const isOverdue = elapsed > entry.quoted_wait_minutes
  return (
    <Animated.View
      layout={LinearTransition.duration(200)}
      className='mb-2 rounded-xl overflow-hidden bg-card border border-border'
    >
      {/* Collapsed Row */}
      <Pressable
        onPress={onToggle}
        className='flex-row items-center px-3 py-2.5'
      >
        {/* Time Badge */}
        <View
          className={`w-11 h-11 rounded-full items-center justify-center ${
            isOverdue ? 'bg-red-900/60' : 'bg-teal/20'
          }`}
        >
          <Text
            className={`text-sm font-bold ${
              isOverdue ? 'text-red-400' : 'text-teal'
            }`}
          >
            {formatElapsed(elapsed)}
          </Text>
        </View>

        {/* Name + Guests */}
        <View className='flex-1 ml-2.5 min-w-0'>
          <Text
            className='text-white font-semibold text-base'
            numberOfLines={1}
          >
            {entry.party_name}
          </Text>
          <View className='flex-row items-center mt-0.5'>
            <Users size={12} color={colors.muted} />
            <Text className='text-muted-foreground text-sm ml-1'>
              {entry.party_size} {entry.party_size === 1 ? 'guest' : 'guests'}
            </Text>
          </View>
          {(entry.notification_failures ?? 0) > 0 && (
            <View className='self-start mt-1 px-2 py-0.5 rounded bg-red-600 border border-red-500'>
              <Text className='text-white text-xs font-bold'>
                SMS FAIL {entry.notification_failures}
              </Text>
            </View>
          )}
        </View>

        {/* Chevron */}
        {isExpanded ? (
          <ChevronUp size={18} color={colors.label} />
        ) : (
          <ChevronDown size={18} color={colors.label} />
        )}
      </Pressable>

      {/* Expanded Section */}
      {isExpanded && (
        <Animated.View
          entering={FadeIn.duration(200)}
          exiting={FadeOut.duration(150)}
          className='px-3 pb-3 border-t border-border'
        >
          <View className='mt-2 gap-1.5'>
            {/* Phone */}
            {entry.phone ? (
              <View className='flex-row items-center'>
                <Phone size={14} color={colors.label} />
                <Text className='text-label text-sm ml-1.5'>{entry.phone}</Text>
              </View>
            ) : null}

            {/* Notes */}
            {entry.notes ? (
              <View className='flex-row items-start'>
                <StickyNote
                  size={14}
                  color={colors.label}
                  style={{ marginTop: 2 }}
                />
                <Text className='text-label text-sm ml-1.5 italic flex-1'>
                  {entry.notes}
                </Text>
              </View>
            ) : null}

            {/* Quoted time */}
            <View className='flex-row items-center'>
              <Clock size={14} color={colors.label} />
              <Text className='text-label text-sm ml-1.5'>
                Quoted: {entry.quoted_wait_minutes} min
              </Text>
            </View>

            {/* SMS failure visibility */}
            {(entry.notification_failures ?? 0) > 0 && (
              <View className='flex-row items-center gap-2 px-2.5 py-2 rounded-lg bg-red-600 border border-red-500'>
                <AlertCircle size={14} color='white' />
                <Text className='text-white text-sm flex-1 font-semibold'>
                  SMS failed {entry.notification_failures}x — call guest
                  verbally
                </Text>
              </View>
            )}
          </View>

          {/* Action Buttons */}
          <View className='flex-row items-center gap-2 mt-3'>
            <TouchableOpacity
              onPress={onSeat}
              className='flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg bg-teal'
            >
              <Check size={14} color='white' />
              <Text className='text-white font-semibold text-sm'>Seat</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onNotify}
              className='flex-1 flex-row items-center justify-center gap-1.5 py-2 rounded-lg border border-border'
            >
              <Bell size={14} color={colors.label} />
              <Text className='text-label font-semibold text-sm'>Notify</Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={onDelete}
              className='w-9 h-9 items-center justify-center rounded-lg bg-red-900/30'
            >
              <X size={14} color={colors.danger} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  )
}

// ── WaitlistPanel (main export) ──────────────────────────────

const WaitlistPanel: React.FC = () => {
  const {
    waitlist,
    isLoading,
    fetchWaitlist,
    addToWaitlistAsync,
    removeFromWaitlistAsync
  } = useWaitlistStore()
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const { show } = useToast()

  const [showAddModal, setShowAddModal] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [itemToDelete, setItemToDelete] = useState<WaitlistEntry | null>(null)
  const [now, setNow] = useState(Date.now())
  const [notice, setNotice] = useState<{
    title: string
    description: string
    variant: 'info' | 'warning' | 'error'
  } | null>(null)

  // Fetch waitlist on mount
  useEffect(() => {
    if (selectedStore?.id) {
      fetchWaitlist(selectedStore.id)
    }
  }, [selectedStore?.id])

  // Timer: update elapsed time every 60s
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  // Toggle expand
  const handleToggle = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id))
  }, [])

  // Seat action — open the WaitlistBottomSheet table picker
  const handleSeat = useCallback(() => {
    useWaitlistSheetStore.getState().openSheet()
  }, [])

  // Notify action
  const handleNotify = useCallback(
    async (entry: WaitlistEntry) => {
      const phoneDigits = entry.phone?.replace(/\D/g, '') ?? ''

      // In-app alert only when no phone on file
      if (!phoneDigits) {
        setNotice({
          title: 'No Phone Number',
          description: `Please call out "${entry.party_name}" — no phone on file`,
          variant: 'warning'
        })
        return
      }

      try {
        const result = await useWaitlistStore
          .getState()
          .notifyWaitlistPartyAsync(entry.id)

        if (!result.success) {
          if (result.error === 'sms_failed') {
            setNotice({
              title: 'SMS Failed',
              description:
                result.message ||
                'Could not send SMS. Failure logged. Please notify guest verbally.',
              variant: 'error'
            })
          } else {
            setNotice({
              title: 'Could Not Notify',
              description: result.error || 'Failed to notify party',
              variant: 'error'
            })
          }
        } else if (result.sms) {
          show({
            title: 'Notified',
            message: `SMS sent to ${entry.party_name}`,
            type: 'success'
          })
        } else if (result.reason === 'no_valid_phone') {
          show({
            title: 'Invalid Phone Number',
            message: `Could not send SMS — invalid number on file. Please notify ${entry.party_name} verbally.`,
            type: 'warning'
          })
        } else {
          // Fallback: RPC succeeded but SMS was not sent for an unhandled reason
          show({
            title: 'Party Notified',
            message: `${entry.party_name} has been notified`,
            type: 'success'
          })
        }

        if (result.success && selectedStore?.id) {
          fetchWaitlist(selectedStore.id)
        }
      } catch (err: any) {
        show({
          title: 'Could Not Notify',
          message:
            err.message ||
            `Failed to notify ${entry.party_name}. Please try again.`,
          type: 'error'
        })
      }
    },
    [show, selectedStore?.id, fetchWaitlist]
  )

  // Delete confirm
  const confirmDelete = useCallback(async () => {
    if (itemToDelete) {
      await removeFromWaitlistAsync(itemToDelete.id)
      setItemToDelete(null)
    }
  }, [itemToDelete, removeFromWaitlistAsync])

  // Add entry
  const handleAddEntry = useCallback(
    async (data: {
      name: string
      partySize: number
      quotedTime: number
      notes: string
      phone?: string
    }) => {
      if (!selectedStore?.id) return

      await addToWaitlistAsync({
        locationId: selectedStore.id,
        p_party_name: data.name,
        p_party_size: data.partySize,
        p_quoted_wait_minutes: data.quotedTime,
        p_notes: data.notes,
        p_phone: data.phone
      })
      setShowAddModal(false)
    },
    [selectedStore?.id, addToWaitlistAsync]
  )

  return (
    <View className='h-full flex-col bg-panel'>
      {/* Header */}
      <View className='px-3 py-3 border-b border-border'>
        <View className='flex-row items-center justify-between'>
          <View className='flex-row items-center gap-2'>
            <Text className='text-heading text-lg font-bold'>Waitlist</Text>
            <View className='bg-card px-2 py-0.5 rounded-full'>
              <Text className='text-muted text-sm font-medium'>
                {waitlist.length}
              </Text>
            </View>
          </View>
          <TouchableOpacity
            onPress={() => setShowAddModal(true)}
            className='w-8 h-8 rounded-full items-center justify-center bg-teal/20'
          >
            <UserPlus size={16} color={colors.teal} />
          </TouchableOpacity>
        </View>
        <Text className='text-label text-sm mt-1'>
          {waitlist.length} {waitlist.length === 1 ? 'party' : 'parties'}{' '}
          waiting
        </Text>
      </View>

      {/* Scrollable List */}
      <ScrollView
        className='flex-1 p-2'
        contentContainerStyle={{ paddingBottom: 20 }}
      >
        {isLoading && waitlist.length === 0 ? (
          <View className='items-center justify-center py-12'>
            <ActivityIndicator size='large' color={colors.teal} />
            <Text className='text-muted mt-3 text-base'>
              Loading waitlist...
            </Text>
          </View>
        ) : waitlist.length > 0 ? (
          waitlist.map(entry => (
            <WaitlistPanelCard
              key={entry.id}
              entry={entry}
              isExpanded={expandedId === entry.id}
              onToggle={() => handleToggle(entry.id)}
              onSeat={() => handleSeat()}
              onNotify={() => handleNotify(entry)}
              onDelete={() => setItemToDelete(entry)}
              now={now}
            />
          ))
        ) : (
          <View className='items-center justify-center py-12'>
            <Clock size={36} color={colors.muted} />
            <Text className='text-label text-base mt-3'>
              No parties waiting
            </Text>
            <Text className='text-label text-sm mt-1'>
              Tap + to add someone
            </Text>
          </View>
        )}
      </ScrollView>

      {/* Add Entry Modal */}
      <AddWaitlistModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddEntry}
        isLoading={isLoading}
      />

      {/* Delete Confirmation */}
      <ConfirmationModal
        isOpen={!!itemToDelete}
        onClose={() => setItemToDelete(null)}
        onConfirm={confirmDelete}
        title='Remove from Waitlist?'
        description={`Are you sure you want to remove ${itemToDelete?.party_name} from the waitlist?`}
        confirmText='Remove'
        variant='destructive'
      />

      {notice && (
        <AppNoticeModal
          visible
          onClose={() => setNotice(null)}
          title={notice.title}
          description={notice.description}
          variant={notice.variant}
        />
      )}
    </View>
  )
}

export default WaitlistPanel
