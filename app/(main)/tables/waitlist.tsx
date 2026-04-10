import { AddWaitlistModal } from '@/components/host-station/AddWaitlistModal'
import { TableSelectionSheet } from '@/components/host-station/TableSelectionSheet'
import ConfirmationModal from '@/components/settings/reset-application/ConfirmationModal'
import AppNoticeModal from '@/components/ui/AppNoticeModal'
import { useToast } from '@/contexts/ToastContext'
import { useTableTimerTick } from '@/hooks/useTableTimerTick'
import { bottomSheetTheme, colors } from '@/lib/theme'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePendingTableOverlay } from '@/stores/usePendingTableOverlay'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useWaitlistStore } from '@/stores/useWaitlistStore'
import { FloorPlanObject, WaitlistEntry } from '@/types/db-floor-plan-types'
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetTextInput,
  BottomSheetView
} from '@gorhom/bottom-sheet'
import { useRouter } from 'expo-router'
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
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'
import { SafeAreaView } from 'react-native-safe-area-context'

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

/**
 * Estimate wait time for a new party based on live table data.
 *
 * Algorithm:
 * 1. If a table that fits the party is already available → 0 min wait
 * 2. Otherwise find occupied tables that fit the party, sorted by time remaining
 * 3. Each party already in the waitlist ahead of us that also needs a similar
 *    table adds one table-turn of time (defaultSittingTimeMinutes)
 * 4. Round up to nearest 5 min and add a 5-min buffer for seating/cleaning
 */
function estimateWaitMinutes (
  partySize: number,
  tables: FloorPlanObject[],
  waitlist: WaitlistEntry[],
  defaultSittingMinutes: number
): number {
  const MIN_SITTING = Math.max(defaultSittingMinutes, 15)

  // Tables that can seat this party (no capacity = assume it fits)
  const suitableTables = tables.filter(
    t =>
      (t.category === 'table' || t.category === 'booth') &&
      (!t.capacity || t.capacity >= partySize)
  )

  // Available right now = no session, or session status is available/cleaning
  const availableNow = suitableTables.filter(
    t =>
      !t.session ||
      t.session.status === 'available' ||
      t.session.status === 'cleaning'
  )

  // Active waitlist parties ahead of this one
  const partiesAhead = waitlist.filter(
    w => w.status === 'waiting' || w.status === 'notified'
  ).length

  if (availableNow.length > partiesAhead) {
    // Enough available tables for everyone ahead + this party → seat immediately
    return 0
  }

  // Find occupied tables and their remaining time
  const occupiedTimes = suitableTables
    .filter(
      t => t.session && t.session.status !== 'available' && t.session.seated_at
    )
    .map(t => {
      const elapsedMins = Math.floor(
        (Date.now() - new Date(t.session!.seated_at).getTime()) / 60_000
      )
      return Math.max(0, MIN_SITTING - elapsedMins)
    })
    .sort((a, b) => a - b)

  if (occupiedTimes.length === 0) {
    // No occupied suitable tables either — use default as fallback
    return MIN_SITTING
  }

  // Tables needed = partiesAhead - availableNow + 1 (this party)
  const tablesNeeded = partiesAhead - availableNow.length + 1
  const targetIndex = Math.min(tablesNeeded - 1, occupiedTimes.length - 1)
  const rawWait = occupiedTimes[targetIndex] + 5 // +5 min seating/cleaning buffer

  // Round up to nearest 5
  return Math.ceil(rawWait / 5) * 5
}

// ── WaitlistCard ──────────────────────────────────────────────

const WaitlistCard: React.FC<{
  entry: WaitlistEntry
  isExpanded: boolean
  onToggle: () => void
  onSeat: () => void
  onNotify: () => void
  onDelete: () => void
}> = React.memo(
  ({ entry, isExpanded, onToggle, onSeat, onNotify, onDelete }) => {
    const tick = useTableTimerTick()
    // eslint-disable-next-line react-hooks/exhaustive-deps
    const elapsed = useMemo(
      () => getElapsedMinutes(entry.created_at),
      [entry.created_at, tick]
    )
    const isOverdue = elapsed > entry.quoted_wait_minutes

    const expandedHeight = useSharedValue(isExpanded ? 1 : 0)
    if (expandedHeight.value !== (isExpanded ? 1 : 0)) {
      expandedHeight.value = withTiming(isExpanded ? 1 : 0, { duration: 200 })
    }
    const expandedStyle = useAnimatedStyle(() => ({
      opacity: expandedHeight.value,
      maxHeight: expandedHeight.value * 300,
      overflow: 'hidden'
    }))

    return (
      <View className='mb-3 rounded-xl overflow-hidden bg-card border border-border'>
        <Pressable
          onPress={onToggle}
          className='flex-row items-center px-4 py-3'
        >
          <View
            className={`w-12 h-12 rounded-full items-center justify-center ${
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

          <View className='flex-1 ml-3 min-w-0'>
            <Text
              className='text-white font-semibold text-base'
              numberOfLines={1}
            >
              {entry.party_name}
            </Text>
            <View className='flex-row items-center mt-0.5'>
              <Users size={12} color={colors.muted} />
              <Text className='text-muted text-sm ml-1'>
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

          {isExpanded ? (
            <ChevronUp size={20} color={colors.label} />
          ) : (
            <ChevronDown size={20} color={colors.label} />
          )}
        </Pressable>

        <Animated.View style={expandedStyle}>
          <View className='px-4 pb-4 border-t border-border'>
            <View className='mt-3 gap-2'>
              {entry.phone ? (
                <View className='flex-row items-center'>
                  <Phone size={14} color={colors.label} />
                  <Text className='text-label text-sm ml-2'>{entry.phone}</Text>
                </View>
              ) : null}
              {entry.notes ? (
                <View className='flex-row items-start'>
                  <StickyNote
                    size={14}
                    color={colors.label}
                    style={{ marginTop: 2 }}
                  />
                  <Text className='text-label text-sm ml-2 italic flex-1'>
                    {entry.notes}
                  </Text>
                </View>
              ) : null}
              <View className='flex-row items-center'>
                <Clock size={14} color={colors.label} />
                <Text className='text-label text-sm ml-2'>
                  Quoted: {entry.quoted_wait_minutes} min
                </Text>
              </View>
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

            <View className='flex-row items-center gap-3 mt-4'>
              <TouchableOpacity
                onPress={onSeat}
                className='flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-lg bg-teal'
              >
                <Check size={16} color='white' />
                <Text className='text-white font-semibold'>Seat</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onNotify}
                className='flex-1 flex-row items-center justify-center gap-2 py-2.5 rounded-lg border border-border'
              >
                <Bell size={16} color={colors.label} />
                <Text className='text-label font-semibold'>Notify</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onDelete}
                className='w-11 h-11 items-center justify-center rounded-lg bg-red-900/30'
              >
                <X size={18} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    )
  }
)

// ── AddEntryForm ──────────────────────────────────────────────

const AddEntryForm: React.FC<{
  onSubmit: (data: {
    name: string
    partySize: number
    quotedTime: number
    notes: string
    phone?: string
  }) => void
  onCancel: () => void
  isLoading: boolean
  waitlist: WaitlistEntry[]
}> = ({ onSubmit, onCancel, isLoading, waitlist }) => {
  const tables = useFloorPlanStore(s => s.tables)
  const defaultSittingMinutes = useLocationConfigStore(
    s => s.config.dining.defaultSittingTimeMinutes || 60
  )

  const [name, setName] = useState('')
  const [partySize, setPartySize] = useState('')
  const [quotedTime, setQuotedTime] = useState('')
  const [quotedTimeEdited, setQuotedTimeEdited] = useState(false)
  const [notes, setNotes] = useState('')
  const [phone, setPhone] = useState('')

  // Auto-estimate wait time whenever party size changes (unless host manually edited it)
  const estimatedWait = useMemo(() => {
    const size = parseInt(partySize || '2', 10)
    if (!size || size < 1) return null
    const est = estimateWaitMinutes(
      size,
      tables,
      waitlist,
      defaultSittingMinutes
    )
    return est
  }, [partySize, tables, waitlist, defaultSittingMinutes])

  useEffect(() => {
    if (quotedTimeEdited) return
    if (estimatedWait !== null) {
      setQuotedTime(String(Math.max(estimatedWait, 5)))
    }
  }, [estimatedWait, quotedTimeEdited])

  const handleSubmit = () => {
    onSubmit({
      name: name || 'Guest',
      partySize: parseInt(partySize || '2', 10),
      quotedTime: parseInt(quotedTime || '15', 10),
      notes,
      phone: phone || undefined
    })
    setName('')
    setPartySize('')
    setQuotedTime('')
    setQuotedTimeEdited(false)
    setNotes('')
    setPhone('')
  }

  const inputStyle = {
    backgroundColor: colors.screen,
    color: 'white' as const,
    fontSize: 16,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.border
  }

  return (
    <View className='px-4 pt-2 pb-6 gap-4'>
      <View>
        <Text className='text-label text-sm mb-1.5 font-medium'>
          Guest Name
        </Text>
        <BottomSheetTextInput
          value={name}
          onChangeText={setName}
          placeholder='Enter name'
          placeholderTextColor={colors.muted}
          style={inputStyle}
        />
      </View>
      <View className='flex-row gap-3'>
        <View className='flex-1'>
          <Text className='text-label text-sm mb-1.5 font-medium'>
            Party Size
          </Text>
          <BottomSheetTextInput
            value={partySize}
            onChangeText={setPartySize}
            placeholder='2'
            placeholderTextColor={colors.muted}
            keyboardType='number-pad'
            style={inputStyle}
          />
        </View>
        <View className='flex-1'>
          <View className='flex-row items-center justify-between mb-1.5'>
            <Text className='text-label text-sm font-medium'>Wait (min)</Text>
            {!quotedTimeEdited && estimatedWait !== null && (
              <Text style={{ fontSize: 10, color: colors.teal }}>
                auto-estimated
              </Text>
            )}
          </View>
          <BottomSheetTextInput
            value={quotedTime}
            onChangeText={v => {
              setQuotedTime(v)
              setQuotedTimeEdited(true)
            }}
            placeholder={
              estimatedWait !== null ? String(Math.max(estimatedWait, 5)) : '15'
            }
            placeholderTextColor={colors.muted}
            keyboardType='number-pad'
            style={[
              inputStyle,
              !quotedTimeEdited &&
                estimatedWait !== null && { borderColor: colors.teal + '80' }
            ]}
          />
        </View>
      </View>
      <View>
        <Text className='text-label text-sm mb-1.5 font-medium'>
          Phone (optional)
        </Text>
        <BottomSheetTextInput
          value={phone}
          onChangeText={setPhone}
          placeholder='+1 (555) 000-0000'
          placeholderTextColor={colors.muted}
          keyboardType='phone-pad'
          style={inputStyle}
        />
      </View>
      <View>
        <Text className='text-label text-sm mb-1.5 font-medium'>
          Notes (optional)
        </Text>
        <BottomSheetTextInput
          value={notes}
          onChangeText={setNotes}
          placeholder='Allergies, preferences...'
          placeholderTextColor={colors.muted}
          multiline
          numberOfLines={3}
          style={[inputStyle, { minHeight: 80, textAlignVertical: 'top' }]}
        />
      </View>
      <View className='flex-row gap-3'>
        <TouchableOpacity
          onPress={onCancel}
          className='flex-1 items-center justify-center py-3 rounded-xl border border-border'
        >
          <Text className='text-label font-semibold'>Cancel</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={handleSubmit}
          disabled={isLoading}
          className='flex-1 items-center justify-center py-3 rounded-xl bg-teal'
        >
          {isLoading ? (
            <ActivityIndicator size='small' color='white' />
          ) : (
            <Text className='text-white font-semibold'>Add to Waitlist</Text>
          )}
        </TouchableOpacity>
      </View>
    </View>
  )
}

// ── TablePickerModal ──────────────────────────────────────────

const TablePickerModal: React.FC<{
  isOpen: boolean
  onClose: () => void
  onSelectTable: (table: FloorPlanObject) => void
  entry: WaitlistEntry | null
}> = ({ isOpen, onClose, onSelectTable, entry }) => {
  const sheetRef = useRef<BottomSheet>(null)
  const tables = useFloorPlanStore(s => s.tables)
  const snapPoints = useMemo(() => ['55%'], [])
  const [pendingTable, setPendingTable] = useState<FloorPlanObject | null>(null)

  const availableTables = useMemo(
    () =>
      tables.filter(
        t =>
          (t.session?.status || 'available') === 'available' &&
          (t.category === 'table' || t.category === 'booth')
      ),
    [tables]
  )

  const recommendedTables = useMemo(
    () =>
      availableTables.filter(
        t => (t.capacity || 0) >= (entry?.party_size || 0)
      ),
    [availableTables, entry]
  )

  useEffect(() => {
    if (isOpen) {
      sheetRef.current?.expand()
    } else {
      sheetRef.current?.close()
      setPendingTable(null)
    }
  }, [isOpen])

  const handleClose = useCallback(() => {
    setPendingTable(null)
    onClose()
  }, [onClose])

  return (
    <BottomSheet
      ref={sheetRef}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={handleClose}
      {...bottomSheetTheme}
      backdropComponent={props => (
        <BottomSheetBackdrop
          {...props}
          disappearsOnIndex={-1}
          appearsOnIndex={0}
          pressBehavior='close'
        />
      )}
    >
      <BottomSheetView className='flex-1 bg-panel px-4 pt-2'>
        {pendingTable ? (
          /* ── Confirmation View ── */
          <View className='flex-1 items-center justify-center py-8'>
            <Text className='text-white text-xl font-bold text-center mb-2'>
              Seat {entry?.party_name}?
            </Text>
            <Text className='text-muted text-base text-center mb-6'>
              Party of {entry?.party_size} at{' '}
              <Text className='text-white font-semibold'>
                {pendingTable.name}
              </Text>
              {pendingTable.capacity
                ? ` (capacity ${pendingTable.capacity})`
                : ''}
            </Text>
            <View className='flex-row gap-3 w-full px-4'>
              <TouchableOpacity
                onPress={() => setPendingTable(null)}
                className='flex-1 items-center justify-center py-3 rounded-xl border border-border'
              >
                <Text className='text-label font-semibold'>Back</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => onSelectTable(pendingTable)}
                className='flex-1 items-center justify-center py-3 rounded-xl bg-teal'
              >
                <Text className='text-white font-semibold'>Confirm Seat</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : (
          /* ── Table List View ── */
          <>
            <Text className='text-white text-xl font-bold mb-1'>
              Seat {entry?.party_name}
            </Text>
            <Text className='text-muted text-sm mb-4'>
              Party of {entry?.party_size} — Quoted {entry?.quoted_wait_minutes}
              m
            </Text>
            <Text className='text-teal font-semibold text-xs uppercase tracking-wider mb-3'>
              Available Tables
            </Text>
            <BottomSheetFlatList
              data={recommendedTables}
              keyExtractor={item => item.id}
              renderItem={({ item }) => (
                <TouchableOpacity
                  onPress={() => setPendingTable(item)}
                  className='bg-card p-4 rounded-xl mb-2.5 flex-row justify-between items-center border border-border'
                >
                  <View>
                    <Text className='text-white text-base font-semibold'>
                      {item.name}
                    </Text>
                    <Text className='text-muted text-sm'>
                      Capacity: {item.capacity}
                    </Text>
                  </View>
                  <View className='bg-teal px-4 py-2 rounded-lg'>
                    <Text className='text-white font-semibold'>Seat</Text>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View className='items-center py-8'>
                  <Text className='text-muted italic text-center'>
                    No available tables match the party size.
                  </Text>
                </View>
              }
              contentContainerStyle={{ paddingBottom: 40 }}
            />
          </>
        )}
      </BottomSheetView>
    </BottomSheet>
  )
}

// ── Main Screen ───────────────────────────────────────────────

export default function WaitlistScreen () {
  const router = useRouter()
  const { show } = useToast()

  const waitlist = useWaitlistStore(s => s.waitlist)
  const isLoading = useWaitlistStore(s => s.isLoading)
  const fetchWaitlist = useWaitlistStore(s => s.fetchWaitlist)
  const addToWaitlistAsync = useWaitlistStore(s => s.addToWaitlistAsync)
  const removeFromWaitlistAsync = useWaitlistStore(
    s => s.removeFromWaitlistAsync
  )
  const seatFromWaitlistAsync = useWaitlistStore(s => s.seatFromWaitlistAsync)
  const startNewOrder = useOrderStore(s => s.startNewOrder)
  const setActiveOrder = useOrderStore(s => s.setActiveOrder)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)

  const [showAddModal, setShowAddModal] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null)
  const [isTablePickerOpen, setTablePickerOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<WaitlistEntry | null>(null)
  const [notice, setNotice] = useState<{
    title: string
    description: string
    variant: 'info' | 'warning' | 'error'
  } | null>(null)

  useEffect(() => {
    if (selectedStore?.id) {
      fetchWaitlist(selectedStore.id)
    }
  }, [selectedStore?.id, fetchWaitlist])

  const handleToggle = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id))
  }, [])

  const handleSeat = useCallback((entry: WaitlistEntry) => {
    setSelectedEntry(entry)
    setTablePickerOpen(true)
  }, [])

  const tables = useFloorPlanStore(s => s.tables)

  const handleSelectTable = useCallback(
    async (tableIds: string[]) => {
      if (!selectedEntry || tableIds.length === 0) return
      const tableId = tableIds[0]
      const entry = selectedEntry

      // Close modal immediately so loading never appears behind it
      setTablePickerOpen(false)
      setSelectedEntry(null)

      const result = await seatFromWaitlistAsync(entry.id, tableIds)

      if (result?.order_id) {
        setActiveOrder(result.order_id)
      } else {
        const newOrder = startNewOrder({
          guestCount: entry.party_size,
          tableId
        })
        setActiveOrder(newOrder.id)
      }

      usePendingTableOverlay.getState().setPendingTableId(tableId)
      router.push('/tables')
    },
    [
      selectedEntry,
      seatFromWaitlistAsync,
      startNewOrder,
      setActiveOrder,
      router
    ]
  )

  const handleNotify = useCallback(
    async (entry: WaitlistEntry) => {
      const phoneDigits = entry.phone?.replace(/\D/g, '') ?? ''

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

  const confirmDelete = useCallback(async () => {
    if (itemToDelete) {
      await removeFromWaitlistAsync(itemToDelete.id)
      setItemToDelete(null)
    }
  }, [itemToDelete, removeFromWaitlistAsync])

  const handleAddEntry = useCallback(
    async (data: {
      party_name: string
      party_size: number
      phone?: string
      email?: string
      seating_preference?: string
      preferred_section?: string
      notes?: string
      quoted_wait_minutes?: number
    }) => {
      if (!selectedStore?.id) return
      await addToWaitlistAsync({
        locationId: selectedStore.id,
        p_party_name: data.party_name,
        p_party_size: data.party_size,
        p_phone: data.phone,
        p_email: data.email,
        p_seating_preference: data.seating_preference,
        p_preferred_section: data.preferred_section,
        p_notes: data.notes,
        p_quoted_wait_minutes: data.quoted_wait_minutes
      })
      setShowAddModal(false)
    },
    [selectedStore?.id, addToWaitlistAsync]
  )

  const renderItem = useCallback(
    ({ item }: { item: WaitlistEntry }) => (
      <WaitlistCard
        entry={item}
        isExpanded={expandedId === item.id}
        onToggle={() => handleToggle(item.id)}
        onSeat={() => handleSeat(item)}
        onNotify={() => handleNotify(item)}
        onDelete={() => setItemToDelete(item)}
      />
    ),
    [expandedId, handleToggle, handleSeat, handleNotify]
  )

  const keyExtractor = useCallback((item: WaitlistEntry) => item.id, [])

  return (
    <SafeAreaView className='flex-1 bg-screen' edges={['bottom']}>
      {/* Header */}
      <View className='flex-row items-center justify-between px-5 py-4 border-b border-border'>
        <TouchableOpacity onPress={() => router.back()} className='mr-3'>
          <X size={22} color={colors.label} />
        </TouchableOpacity>
        <View className='flex-row items-center gap-3 flex-1'>
          <Text className='text-white text-xl font-bold'>Waitlist</Text>
          <View className='bg-card px-2.5 py-1 rounded-full'>
            <Text className='text-muted text-sm font-medium'>
              {waitlist.length} {waitlist.length === 1 ? 'party' : 'parties'}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setShowAddModal(true)}
          className='w-10 h-10 rounded-full items-center justify-center bg-teal/20'
        >
          <UserPlus size={20} color={colors.teal} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      {isLoading && waitlist.length === 0 ? (
        <View className='flex-1 items-center justify-center py-12'>
          <ActivityIndicator size='large' color={colors.teal} />
          <Text className='text-muted mt-3'>Loading waitlist...</Text>
        </View>
      ) : waitlist.length > 0 ? (
        <FlatList
          data={waitlist}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
        />
      ) : (
        <View className='flex-1 items-center justify-center py-12'>
          <Clock size={48} color={colors.muted} />
          <Text className='text-muted text-lg mt-4'>No parties waiting</Text>
          <Text className='text-muted text-sm mt-1'>
            Tap the + to add someone
          </Text>
        </View>
      )}

      <AddWaitlistModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddEntry}
        isLoading={isLoading}
      />

      {/* Table Picker */}
      <TableSelectionSheet
        isOpen={isTablePickerOpen}
        onClose={() => setTablePickerOpen(false)}
        onSelectTable={handleSelectTable}
        entry={selectedEntry}
        tables={tables}
      />

      {/* Delete Confirmation */}
      <ConfirmationModal
        isOpen={!!itemToDelete}
        title='Remove from Waitlist'
        description={`Remove ${itemToDelete?.party_name} from the waitlist?`}
        confirmText='Remove'
        onConfirm={confirmDelete}
        onClose={() => setItemToDelete(null)}
      />

      {/* Notice Modal */}
      {notice && (
        <AppNoticeModal
          visible={!!notice}
          title={notice.title}
          description={notice.description}
          variant={notice.variant}
          onClose={() => setNotice(null)}
        />
      )}
    </SafeAreaView>
  )
}
