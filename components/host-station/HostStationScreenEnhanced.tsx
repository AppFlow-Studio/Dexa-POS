import { useLoading } from '@/contexts/LoadingContext'
import { useToast } from '@/contexts/ToastContext'
import { colors } from '@/lib/theme'
import WaitTimeCalculator from '@/lib/waitlist/waitTimeCalculator'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useWaitlistStore } from '@/stores/useWaitlistStore'
import { WaitlistEntry } from '@/types/db-floor-plan-types'
import { Bell, GripVertical, Plus } from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { AddWaitlistModal } from './AddWaitlistModal'
import TableSelectionSheet from './TableSelectionSheet'
import WaitlistQueueCard from './WaitlistQueueCard'

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

  // UI state
  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null)
  const [showTablePicker, setShowTablePicker] = useState(false)
  const [now, setNow] = useState(Date.now())
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null)

  // Load waitlist on mount and poll every 15s for external updates
  useEffect(() => {
    fetchWaitlist(location_id)

    const pollInterval = setInterval(() => {
      setNow(Date.now())
      fetchWaitlist(location_id, { silent: true })
    }, 15000)

    return () => clearInterval(pollInterval)
  }, [fetchWaitlist, location_id])

  // Auto-expire parties past 2x quoted wait
  useEffect(() => {
    const checkExpiry = async () => {
      for (const entry of waitlist) {
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
      }
    }

    const expireInterval = setInterval(checkExpiry, 30000) // Check every 30 seconds
    return () => clearInterval(expireInterval)
  }, [waitlist, updateWaitlistStatus, show])

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
          quotedWait = calc.calculateWaitTime(data.party_size, location_id)
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
      showLoading()
      try {
        const FloorPlanService =
          require('@/services/floorPlanService').FloorPlanService
        const client = require('@/lib/supabaseClient').supabaseClient
        const { error } = await FloorPlanService.notifyWaitlistParty(
          client,
          entry.id
        )

        if (error) throw error

        await updateWaitlistStatus(entry.id, 'notified')
        show({
          title: 'Success',
          message: `${entry.party_name} notified!`,
          type: 'success'
        })
        await fetchWaitlist(location_id)
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
    [
      updateWaitlistStatus,
      show,
      showLoading,
      hideLoading,
      fetchWaitlist,
      location_id
    ]
  )

  const handleSeatParty = useCallback(
    async (entry: WaitlistEntry, tableIds: string[]) => {
      showLoading()
      try {
        const result = await seatFromWaitlistAsync(entry.id, tableIds)

        if (result) {
          await updateWaitlistStatus(entry.id, 'seated')
          show({
            title: 'Success',
            message: `${entry.party_name} seated!`,
            type: 'success'
          })
          await fetchWaitlist(location_id)
        }
      } catch (error: any) {
        show({
          title: 'Error',
          message: error.message || 'Failed to seat party',
          type: 'error'
        })
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

  // Handle drag-to-reorder using simple array manipulation
  // In production, you'd use React Native DraggableFlatList or similar
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
      setDraggedItemId(null)
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

  const waitingCount = useMemo(
    () => waitlist.filter(e => e.status === 'waiting').length,
    [waitlist]
  )

  return (
    <View className='flex-1 bg-screen'>
      {/* Header */}
      <View className='px-4 pt-4 pb-4 border-b border-border bg-card'>
        <View className='flex-row items-center justify-between'>
          <View>
            <Text className='text-white text-2xl font-bold'>Waitlist</Text>
            <Text className='text-muted text-sm mt-1'>
              {waitingCount} parties waiting
            </Text>
          </View>
          <TouchableOpacity
            onPress={() => setShowAddForm(true)}
            className='flex-row items-center gap-2 px-4 py-2.5 rounded-lg bg-teal'
          >
            <Plus size={18} color='white' />
            <Text className='text-white font-semibold'>Add Party</Text>
          </TouchableOpacity>
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
          contentContainerStyle={{ padding: 12, gap: 12 }}
          showsVerticalScrollIndicator
        >
          {activeWaitlist.map((item, index) => (
            <View key={item.id} className='flex-row gap-2 items-center'>
              <View className='flex-1'>
                <WaitlistQueueCard
                  entry={item}
                  position={index + 1}
                  now={now}
                  onNotify={() => handleNotifyParty(item)}
                  onSeat={() => {
                    setSelectedEntry(item)
                    setShowTablePicker(true)
                  }}
                  onCancel={() => handleCancelEntry(item)}
                  onMarkNoShow={() => handleMarkNoShow(item)}
                />
              </View>
              {/* Drag Handle for future enhancement */}
              <View className='opacity-30 py-3'>
                <GripVertical size={18} color={colors.label} />
              </View>
            </View>
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
          onClose={() => setShowTablePicker(false)}
          entry={selectedEntry}
          tables={tables}
          onSelectTable={(tableIds: string[]) => {
            handleSeatParty(selectedEntry, tableIds)
            setShowTablePicker(false)
          }}
        />
      )}
    </View>
  )
}

export default HostStationScreenEnhanced
