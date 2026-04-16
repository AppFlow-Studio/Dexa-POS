/**
 * Shared waitlist components used by both the full-screen WaitlistScreen
 * (app/(main)/tables/waitlist.tsx) and the sidebar WaitlistPanel
 * (components/panels/WaitlistPanel.tsx).
 */

import { bottomSheetTheme, colors } from '@/lib/theme'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { FloorPlanObject, WaitlistEntry } from '@/types/db-floor-plan-types'
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetFlatList,
  BottomSheetView
} from '@gorhom/bottom-sheet'
import {
  AlertCircle,
  Bell,
  Check,
  ChevronDown,
  ChevronUp,
  Clock,
  Pencil,
  Phone,
  StickyNote,
  Users,
  X
} from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ActivityIndicator,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming
} from 'react-native-reanimated'

// ── Helpers ───────────────────────────────────────────────────

export function getElapsedMinutes (createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)
}

export function formatElapsed (minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

/**
 * Estimate wait time for a new party based on live table data.
 */
export function estimateWaitMinutes (
  partySize: number,
  tables: FloorPlanObject[],
  waitlist: WaitlistEntry[],
  defaultSittingMinutes: number
): number {
  const MIN_SITTING = Math.max(defaultSittingMinutes, 15)

  const suitableTables = tables.filter(
    t =>
      (t.category === 'table' || t.category === 'booth') &&
      (!t.capacity || t.capacity >= partySize)
  )

  const availableNow = suitableTables.filter(
    t =>
      !t.session ||
      t.session.status === 'available' ||
      t.session.status === 'cleaning'
  )

  const partiesAhead = waitlist.filter(
    w => w.status === 'waiting' || w.status === 'notified'
  ).length

  if (availableNow.length > partiesAhead) return 0

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

  if (occupiedTimes.length === 0) return MIN_SITTING

  const tablesNeeded = partiesAhead - availableNow.length + 1
  const targetIndex = Math.min(tablesNeeded - 1, occupiedTimes.length - 1)
  const rawWait = occupiedTimes[targetIndex] + 5

  return Math.ceil(rawWait / 5) * 5
}

// ── WaitlistCard ──────────────────────────────────────────────

export const WaitlistCard: React.FC<{
  entry: WaitlistEntry
  isExpanded: boolean
  onToggle: () => void
  onSeat: () => void
  onNotify: () => void
  onDelete: () => void
  onEdit?: () => void
}> = React.memo(
  ({ entry, isExpanded, onToggle, onSeat, onNotify, onDelete, onEdit }) => {
    const elapsed = useMemo(
      () => getElapsedMinutes(entry.created_at),
      [entry.created_at]
    )
    const isOverdue = elapsed > entry.quoted_wait_minutes
    const badgeBg = isOverdue ? colors.danger + '14' : colors.teal + '12'
    const badgeBorder = isOverdue ? colors.danger + '45' : colors.teal + '45'
    const badgeLabel = isOverdue ? colors.danger : colors.teal

    const expandedHeight = useSharedValue(isExpanded ? 1 : 0)
    useEffect(() => {
      expandedHeight.value = withTiming(isExpanded ? 1 : 0, { duration: 200 })
    }, [isExpanded])
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
            style={{
              width: 62,
              minHeight: 50,
              borderRadius: 10,
              paddingHorizontal: 8,
              paddingVertical: 6,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: badgeBg,
              borderWidth: 1,
              borderColor: badgeBorder
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              <Clock size={10} color={badgeLabel} />
              <Text
                style={{ fontSize: 9, fontWeight: '700', color: badgeLabel }}
              >
                WAIT
              </Text>
            </View>
            <Text
              style={{
                fontSize: 14,
                fontWeight: '800',
                color: badgeLabel,
                marginTop: 1
              }}
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
          {onEdit && (
            <TouchableOpacity
              onPress={e => {
                e.stopPropagation?.()
                onEdit()
              }}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              style={{
                marginLeft: 6,
                padding: 4,
                borderRadius: 6,
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              <Pencil size={13} color={colors.label} />
            </TouchableOpacity>
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

            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
                marginTop: 10
              }}
            >
              <TouchableOpacity
                onPress={onSeat}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 7,
                  borderRadius: 8,
                  backgroundColor: colors.teal + '20',
                  borderWidth: 1,
                  borderColor: colors.teal + '50'
                }}
              >
                <Check size={13} color={colors.teal} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.teal
                  }}
                >
                  Seat
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onNotify}
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  paddingVertical: 7,
                  borderRadius: 8,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <Bell size={13} color={colors.label} />
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: '600',
                    color: colors.label
                  }}
                >
                  Notify
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onDelete}
                style={{
                  width: 32,
                  height: 32,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 8,
                  backgroundColor: colors.danger + '15',
                  borderWidth: 1,
                  borderColor: colors.danger + '30'
                }}
              >
                <X size={13} color={colors.danger} />
              </TouchableOpacity>
            </View>
          </View>
        </Animated.View>
      </View>
    )
  }
)

// ── AddEntryForm ──────────────────────────────────────────────

export const AddEntryForm: React.FC<{
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

  const estimatedWait = useMemo(() => {
    const size = parseInt(partySize || '2', 10)
    if (!size || size < 1) return null
    return estimateWaitMinutes(size, tables, waitlist, defaultSittingMinutes)
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
        <TextInput
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
          <TextInput
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
          <TextInput
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
        <TextInput
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
        <TextInput
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

// ── TablePickerSheet ──────────────────────────────────────────

export const TablePickerSheet: React.FC<{
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
