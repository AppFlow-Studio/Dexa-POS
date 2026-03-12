import AppNoticeModal from '@/components/ui/AppNoticeModal'
import { useLoading } from '@/contexts/LoadingContext'
import { useToast } from '@/contexts/ToastContext'
import { useWaitlistDragState } from '@/hooks/useWaitlistDragState'
import { colors } from '@/lib/theme'
import WaitTimeCalculator from '@/lib/waitlist/waitTimeCalculator'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useWaitlistStore } from '@/stores/useWaitlistStore'
import { WaitlistEntry } from '@/types/db-floor-plan-types'
import { Bell, Plus } from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { useSharedValue } from 'react-native-reanimated'
import { AddWaitlistModal } from './AddWaitlistModal'
import AnimatedCardItem from './AnimatedCardItem'
import TableSelectionSheet from './TableSelectionSheet'

interface HostStationScreenProps {
  location_id: string
}

export const HostStationScreenEnhanced: React.FC<HostStationScreenProps> = ({
  location_id
}) => {
  const { show } = useToast()
  const { showLoading, hideLoading } = useLoading()

  // Stores
  const fetchWaitlist = useWaitlistStore(s => s.fetchWaitlist)
  const addToWaitlistAsync = useWaitlistStore(s => s.addToWaitlistAsync)
  const removeFromWaitlistAsync = useWaitlistStore(
    s => s.removeFromWaitlistAsync
  )
  const seatFromWaitlistAsync = useWaitlistStore(s => s.seatFromWaitlistAsync)
  const reorderWaitlist = useWaitlistStore(s => s.reorderWaitlist)
  const updateWaitlistStatus = useWaitlistStore(s => s.updateWaitlistStatus)
  const waitlist = useWaitlistStore(s => s.waitlist)
  const isLoading = useWaitlistStore(s => s.isLoading)

  const tables = useFloorPlanStore(s => s.tables)
  const gracePeriodMinutes = useStoreSettingsStore(
    s => s.waitlistNotificationGracePeriodMinutes
  )

  // UI state
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null)
  const [showTablePicker, setShowTablePicker] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [scrollEnabled, setScrollEnabled] = useState(true)
  const [notice, setNotice] = useState<{
    title: string
    description: string
    variant: 'info' | 'warning' | 'error'
  } | null>(null)

  // Drag-to-reorder state
  const dragIndex = useSharedValue(-1)
  const dragStartY = useSharedValue(0)
  const cardHeight = useSharedValue(0)

  // Load waitlist on mount and poll every 15s for external updates
  useEffect(() => {
    fetchWaitlist(location_id)

    const pollInterval = setInterval(() => {
      setNow(Date.now())
      fetchWaitlist(location_id, { silent: true })
    }, 15000)

    return () => clearInterval(pollInterval)
  }, [fetchWaitlist, location_id])

  // Auto-expire parties past 2x quoted wait, and those notified past grace period
  useEffect(() => {
    const checkExpiry = async () => {
      for (const entry of waitlist) {
        // Expire waiting parties past 2x quoted wait
        if (entry.status === 'waiting') {
          const elapsedMinutes = Math.floor(
            (Date.now() - new Date(entry.created_at).getTime()) / 60000
          )
          const expiryThreshold = (entry.quoted_wait_minutes || 0) * 2

          if (elapsedMinutes > expiryThreshold && entry.status === 'waiting') {
            try {
              await updateWaitlistStatus(entry.id, 'expired')
              show({
                title: 'Party Expired',
                message: `${entry.party_name} expired from waitlist`,
                type: 'warning'
              })
            } catch (error) {
              console.error('Failed to expire entry:', error)
            }
          }
        }

        // Expire notified parties past grace period (10 minutes default)
        if (entry.status === 'notified' && entry.notified_at) {
          const gracePeriodMs = Math.max(1, gracePeriodMinutes || 10) * 60000
          const elapsed = Date.now() - new Date(entry.notified_at).getTime()

          if (elapsed > gracePeriodMs) {
            try {
              await updateWaitlistStatus(entry.id, 'no_show')
              show({
                title: 'No Show',
                message: `${entry.party_name} did not check in within the grace period`,
                type: 'warning'
              })
            } catch (error) {
              console.error('Failed to mark no-show:', error)
            }
          }
        }
      }
    }

    const expireInterval = setInterval(checkExpiry, 30000) // Check every 30 seconds
    return () => clearInterval(expireInterval)
  }, [waitlist, updateWaitlistStatus, show, gracePeriodMinutes])

  const handleCloseAddForm = useCallback(() => {
    setShowAddForm(false)
  }, [])

  const handleAddToWaitlist = useCallback(
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
      showLoading()
      try {
        // If no quoted wait provided, calculate it
        let quotedWait = data.quoted_wait_minutes || 15
        if (!data.quoted_wait_minutes) {
          const calc = new WaitTimeCalculator(tables)
          const queueDepth = waitlist.filter(e =>
            ['waiting', 'notified', 'arrived'].includes(e.status)
          ).length
          quotedWait = calc.calculateWaitTime(data.party_size, queueDepth)
        }

        await addToWaitlistAsync({
          locationId: location_id,
          p_party_name: data.party_name,
          p_party_size: data.party_size,
          p_phone: data.phone,
          p_email: data.email,
          p_seating_preference: data.seating_preference,
          p_preferred_section: data.preferred_section,
          p_notes: data.notes,
          p_quoted_wait_minutes: quotedWait
        })

        show({
          title: 'Success',
          message: `${data.party_name} added to waitlist`,
          type: 'success'
        })
        setShowAddForm(false)
        await fetchWaitlist(location_id)
      } catch (error: any) {
        show({
          title: 'Error',
          message: error.message || 'Failed to add to waitlist',
          type: 'error'
        })
      } finally {
        hideLoading()
      }
    },
    [
      addToWaitlistAsync,
      fetchWaitlist,
      location_id,
      show,
      showLoading,
      hideLoading,
      tables
    ]
  )

  const handleNotifyParty = useCallback(
    async (entry: WaitlistEntry) => {
      const phoneDigits = entry.phone?.replace(/\D/g, '') ?? ''

      // In-app alert only — no phone on file, skip notification flow
      if (!phoneDigits) {
        setNotice({
          title: 'No Phone Number',
          description: `Please call out "${entry.party_name}" — no phone on file`,
          variant: 'warning'
        })
        return
      }

      showLoading()
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

        if (result.success) {
          await fetchWaitlist(location_id)
        }
      } catch (error: any) {
        show({
          title: 'Error',
          message: error.message || 'Failed to notify party',
          type: 'error'
        })
      } finally {
        hideLoading()
      }
    },
    [show, showLoading, hideLoading, fetchWaitlist, location_id]
  )

  const handleSeatParty = useCallback(
    async (entry: WaitlistEntry, tableIds: string[]) => {
      showLoading()
      try {
        await seatFromWaitlistAsync(entry.id, tableIds)

        await updateWaitlistStatus(entry.id, 'seated')
        show({
          title: 'Success',
          message: `${entry.party_name} seated!`,
          type: 'success'
        })
        await fetchWaitlist(location_id)
        return true
      } catch (error: any) {
        show({
          title: 'Error',
          message: error.message || 'Failed to seat party',
          type: 'error'
        })
        return false
      } finally {
        hideLoading()
      }
    },
    [
      seatFromWaitlistAsync,
      updateWaitlistStatus,
      show,
      showLoading,
      hideLoading,
      fetchWaitlist,
      location_id
    ]
  )

  const handleCancelEntry = useCallback(
    async (entry: WaitlistEntry) => {
      showLoading()
      try {
        await removeFromWaitlistAsync(entry.id)
        show({
          title: 'Cancelled',
          message: `${entry.party_name} cancelled from waitlist`,
          type: 'warning'
        })
        await fetchWaitlist(location_id)
      } catch (error: any) {
        show({
          title: 'Error',
          message: error.message || 'Failed to cancel entry',
          type: 'error'
        })
      } finally {
        hideLoading()
      }
    },
    [
      removeFromWaitlistAsync,
      show,
      showLoading,
      hideLoading,
      fetchWaitlist,
      location_id
    ]
  )

  const handleMarkNoShow = useCallback(
    async (entry: WaitlistEntry) => {
      showLoading()
      try {
        await updateWaitlistStatus(entry.id, 'no_show')
        show({
          title: 'No-Show',
          message: `${entry.party_name} marked as no-show`,
          type: 'warning'
        })
        await fetchWaitlist(location_id)
      } catch (error: any) {
        show({
          title: 'Error',
          message: error.message || 'Failed to mark no-show',
          type: 'error'
        })
      } finally {
        hideLoading()
      }
    },
    [
      updateWaitlistStatus,
      show,
      showLoading,
      hideLoading,
      fetchWaitlist,
      location_id
    ]
  )

  // Handle drag-to-reorder
  const handleReorder = useCallback(
    (fromIndex: number, toIndex: number) => {
      // Get current active list
      const current = waitlist.filter(e =>
        ['waiting', 'notified', 'arrived'].includes(e.status)
      )
      const newList = [...current]
      const [movedItem] = newList.splice(fromIndex, 1)
      newList.splice(toIndex, 0, movedItem)

      // Update positions
      const updatedList = newList.map((item, idx) => ({
        ...item,
        position: idx + 1
      }))

      reorderWaitlist(updatedList)
    },
    [waitlist, reorderWaitlist]
  )

  // Sort by position and filter to only show active statuses
  const activeWaitlist = useMemo(
    () =>
      waitlist
        .filter(e => ['waiting', 'notified', 'arrived'].includes(e.status))
        .sort((a, b) => (a.position || 0) - (b.position || 0)),
    [waitlist]
  )

  // Initialize drag states for each card
  const cardDragStates = useWaitlistDragState(activeWaitlist.length)

  const waitingCount = useMemo(
    () => waitlist.filter(e => e.status === 'waiting').length,
    [waitlist]
  )

  return (
    <View style={{ flex: 1, backgroundColor: '#0C0F1A' }}>
      {/* Header */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 12,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: '#2A3050',
          backgroundColor: '#1E2340'
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8
          }}
        >
          <Text style={{ color: 'white', fontSize: 28, fontWeight: 'bold' }}>
            Waitlist
          </Text>
          <TouchableOpacity
            onPress={() => setShowAddForm(true)}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              paddingHorizontal: 14,
              paddingVertical: 8,
              borderRadius: 6,
              backgroundColor: '#2DD4BF'
            }}
          >
            <Plus size={16} color='#0C0F1A' />
            <Text style={{ color: '#0C0F1A', fontWeight: '600', fontSize: 13 }}>
              Add Party
            </Text>
          </TouchableOpacity>
        </View>
        <Text style={{ color: '#64748B', fontSize: 14 }}>
          {waitingCount} parties waiting
        </Text>
      </View>

      {/* Legend */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 8,
          backgroundColor: '#0C0F1A',
          borderBottomWidth: 1,
          borderBottomColor: '#2A3050',
          alignItems: 'center'
        }}
      >
        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            gap: 12,
            justifyContent: 'center'
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#ffffff'
              }}
            />
            <Text style={{ color: '#94A3B8', fontSize: 12 }}>Waiting</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#3b82f6'
              }}
            />
            <Text style={{ color: '#94A3B8', fontSize: 12 }}>Notified</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#10b981'
              }}
            />
            <Text style={{ color: '#94A3B8', fontSize: 12 }}>Arrived</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#f59e0b'
              }}
            />
            <Text style={{ color: '#94A3B8', fontSize: 12 }}>Approaching</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <View
              style={{
                width: 12,
                height: 12,
                borderRadius: 6,
                backgroundColor: '#ef4444'
              }}
            />
            <Text style={{ color: '#94A3B8', fontSize: 12 }}>Overdue</Text>
          </View>
        </View>
      </View>

      {/* Queue List */}
      {isLoading ? (
        <View className='flex-1 items-center justify-center'>
          <ActivityIndicator color={colors.teal} size='large' />
        </View>
      ) : activeWaitlist.length === 0 ? (
        <View className='flex-1 items-center justify-center px-4'>
          <Bell size={48} color={colors.muted} />
          <Text className='text-muted text-center mt-3 font-semibold text-lg'>
            No parties waiting
          </Text>
          <Text className='text-label text-center mt-2 text-sm'>
            Add guests to the waitlist to get started
          </Text>
        </View>
      ) : (
        <ScrollView
          scrollEnabled={scrollEnabled}
          contentContainerStyle={{ padding: 12, gap: 12 }}
          showsVerticalScrollIndicator
        >
          {activeWaitlist.map((item, index) => (
            <AnimatedCardItem
              key={item.id}
              item={item}
              index={index}
              now={now}
              activeWaitlistLength={activeWaitlist.length}
              cardDragStates={cardDragStates}
              dragIndex={dragIndex}
              dragStartY={dragStartY}
              cardHeight={cardHeight}
              setScrollEnabled={setScrollEnabled}
              onReorder={handleReorder}
              onNotify={() => handleNotifyParty(item)}
              onSeat={() => {
                setSelectedEntry(item)
                setShowTablePicker(true)
              }}
              onCancel={() => handleCancelEntry(item)}
              onMarkNoShow={() => handleMarkNoShow(item)}
            />
          ))}
        </ScrollView>
      )}

      {/* Add to Waitlist Modal */}
      <AddWaitlistModal
        visible={showAddForm}
        onClose={handleCloseAddForm}
        onSubmit={handleAddToWaitlist}
        isLoading={isLoading}
      />

      {/* Table Selection Modal */}
      {selectedEntry && (
        <TableSelectionSheet
          isOpen={showTablePicker}
          onClose={() => {
            setShowTablePicker(false)
            setSelectedEntry(null)
          }}
          entry={selectedEntry}
          tables={tables}
          onSelectTable={async (tableIds: string[]) => {
            const didSeat = await handleSeatParty(selectedEntry, tableIds)
            if (didSeat) {
              setShowTablePicker(false)
              setSelectedEntry(null)
            }
          }}
        />
      )}

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

export default HostStationScreenEnhanced
