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
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useSharedValue } from 'react-native-reanimated'
import { AddWaitlistModal } from './AddWaitlistModal'
import AnimatedCardItem from './AnimatedCardItem'
import TableSelectionSheet from './TableSelectionSheet'

interface HostStationScreenProps {
  location_id: string
}

export const HostStationScreenEnhanced: React.FC<HostStationScreenProps> = ({ location_id }) => {
  const { show } = useToast()
  const { showLoading, hideLoading } = useLoading()

  const fetchWaitlist = useWaitlistStore(s => s.fetchWaitlist)
  const addToWaitlistAsync = useWaitlistStore(s => s.addToWaitlistAsync)
  const removeFromWaitlistAsync = useWaitlistStore(s => s.removeFromWaitlistAsync)
  const seatFromWaitlistAsync = useWaitlistStore(s => s.seatFromWaitlistAsync)
  const reorderWaitlist = useWaitlistStore(s => s.reorderWaitlist)
  const updateWaitlistStatus = useWaitlistStore(s => s.updateWaitlistStatus)
  const waitlist = useWaitlistStore(s => s.waitlist)
  const isLoading = useWaitlistStore(s => s.isLoading)

  const tables = useFloorPlanStore(s => s.tables)
  const gracePeriodMinutes = useStoreSettingsStore(s => s.waitlistNotificationGracePeriodMinutes)

  const [showAddForm, setShowAddForm] = useState(false)
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null)
  const [showTablePicker, setShowTablePicker] = useState(false)
  const [scrollEnabled, setScrollEnabled] = useState(true)
  const [notice, setNotice] = useState<{ title: string; description: string; variant: 'info' | 'warning' | 'error' } | null>(null)

  const dragIndex = useSharedValue(-1)
  const dragStartY = useSharedValue(0)
  const cardHeight = useSharedValue(0)

  useEffect(() => {
    fetchWaitlist(location_id)
    const pollInterval = setInterval(() => {
      fetchWaitlist(location_id, { silent: true })
    }, 15000)
    return () => clearInterval(pollInterval)
  }, [fetchWaitlist, location_id])

  useEffect(() => {
    const checkExpiry = async () => {
      for (const entry of waitlist) {
        if (entry.status === 'waiting') {
          const elapsedMinutes = Math.floor((Date.now() - new Date(entry.created_at).getTime()) / 60000)
          const expiryThreshold = (entry.quoted_wait_minutes || 0) * 2
          if (elapsedMinutes > expiryThreshold && entry.status === 'waiting') {
            try {
              await updateWaitlistStatus(entry.id, 'expired')
              show({ title: 'Party Expired', message: `${entry.party_name} expired from waitlist`, type: 'warning' })
            } catch (error) { console.error('Failed to expire entry:', error) }
          }
        }
        if (entry.status === 'notified' && entry.notified_at) {
          const gracePeriodMs = Math.max(1, gracePeriodMinutes || 10) * 60000
          const elapsed = Date.now() - new Date(entry.notified_at).getTime()
          if (elapsed > gracePeriodMs) {
            try {
              await updateWaitlistStatus(entry.id, 'no_show')
              show({ title: 'No Show', message: `${entry.party_name} did not check in within the grace period`, type: 'warning' })
            } catch (error) { console.error('Failed to mark no-show:', error) }
          }
        }
      }
    }
    const expireInterval = setInterval(checkExpiry, 30000)
    return () => clearInterval(expireInterval)
  }, [waitlist, updateWaitlistStatus, show, gracePeriodMinutes])

  const handleCloseAddForm = useCallback(() => setShowAddForm(false), [])

  const handleAddToWaitlist = useCallback(async (data: {
    party_name: string; party_size: number; phone?: string; email?: string;
    seating_preference?: string; preferred_section?: string; notes?: string;
    quoted_wait_minutes?: number; estimated_ready_at?: string
  }) => {
    showLoading()
    try {
      let quotedWait = data.quoted_wait_minutes || 15
      let estimatedReadyAt = data.estimated_ready_at
      if (!data.quoted_wait_minutes) {
        const calc = new WaitTimeCalculator(tables)
        const queueDepth = waitlist.filter(e => ['waiting', 'notified', 'arrived'].includes(e.status)).length
        const { waitTime, estimatedReadyAt: calculated } = calc.calculateWaitTimeEnhanced(data.party_size, queueDepth)
        quotedWait = waitTime
        estimatedReadyAt = calculated.toISOString()
      }
      await addToWaitlistAsync({ locationId: location_id, p_party_name: data.party_name, p_party_size: data.party_size, p_phone: data.phone, p_email: data.email, p_seating_preference: data.seating_preference, p_preferred_section: data.preferred_section, p_notes: data.notes, p_quoted_wait_minutes: quotedWait, p_estimated_ready_at: estimatedReadyAt })
      show({ title: 'Success', message: `${data.party_name} added to waitlist`, type: 'success' })
      setShowAddForm(false)
      await fetchWaitlist(location_id)
    } catch (error: any) {
      show({ title: 'Error', message: error.message || 'Failed to add to waitlist', type: 'error' })
    } finally { hideLoading() }
  }, [addToWaitlistAsync, fetchWaitlist, location_id, show, showLoading, hideLoading, tables, waitlist])

  const handleNotifyParty = useCallback(async (entry: WaitlistEntry) => {
    const phoneDigits = entry.phone?.replace(/\D/g, '') ?? ''
    if (!phoneDigits) {
      setNotice({ title: 'No Phone Number', description: `Please call out "${entry.party_name}" — no phone on file`, variant: 'warning' })
      return
    }
    showLoading()
    try {
      const result = await useWaitlistStore.getState().notifyWaitlistPartyAsync(entry.id)
      if (!result.success) {
        setNotice({ title: result.error === 'sms_failed' ? 'SMS Failed' : 'Could Not Notify', description: result.message || result.error || 'Failed to notify party', variant: 'error' })
      } else if (result.sms) {
        show({ title: 'Notified', message: `SMS sent to ${entry.party_name}`, type: 'success' })
      } else if (result.reason === 'no_valid_phone') {
        show({ title: 'Invalid Phone Number', message: `Could not send SMS — invalid number on file. Please notify ${entry.party_name} verbally.`, type: 'warning' })
      } else {
        show({ title: 'Party Notified', message: `${entry.party_name} has been notified`, type: 'success' })
      }
      if (result.success) await fetchWaitlist(location_id)
    } catch (error: any) {
      show({ title: 'Error', message: error.message || 'Failed to notify party', type: 'error' })
    } finally { hideLoading() }
  }, [show, showLoading, hideLoading, fetchWaitlist, location_id])

  const handleSeatParty = useCallback(async (entry: WaitlistEntry, tableIds: string[]) => {
    showLoading()
    try {
      await seatFromWaitlistAsync(entry.id, tableIds)
      await updateWaitlistStatus(entry.id, 'seated')
      show({ title: 'Success', message: `${entry.party_name} seated!`, type: 'success' })
      await fetchWaitlist(location_id)
      return true
    } catch (error: any) {
      show({ title: 'Error', message: error.message || 'Failed to seat party', type: 'error' })
      return false
    } finally { hideLoading() }
  }, [seatFromWaitlistAsync, updateWaitlistStatus, show, showLoading, hideLoading, fetchWaitlist, location_id])

  const handleCancelEntry = useCallback(async (entry: WaitlistEntry) => {
    showLoading()
    try {
      await removeFromWaitlistAsync(entry.id)
      show({ title: 'Cancelled', message: `${entry.party_name} cancelled from waitlist`, type: 'warning' })
      await fetchWaitlist(location_id)
    } catch (error: any) {
      show({ title: 'Error', message: error.message || 'Failed to cancel entry', type: 'error' })
    } finally { hideLoading() }
  }, [removeFromWaitlistAsync, show, showLoading, hideLoading, fetchWaitlist, location_id])

  const handleMarkNoShow = useCallback(async (entry: WaitlistEntry) => {
    showLoading()
    try {
      await updateWaitlistStatus(entry.id, 'no_show')
      show({ title: 'No-Show', message: `${entry.party_name} marked as no-show`, type: 'warning' })
      await fetchWaitlist(location_id)
    } catch (error: any) {
      show({ title: 'Error', message: error.message || 'Failed to mark no-show', type: 'error' })
    } finally { hideLoading() }
  }, [updateWaitlistStatus, show, showLoading, hideLoading, fetchWaitlist, location_id])

  const handleOfferComp = useCallback(async (entry: WaitlistEntry) => {
    show({ title: 'Guest Recovery', message: `Please apologize to ${entry.party_name} for the excessive wait and offer a gesture of goodwill.`, type: 'success' })
    console.log('Offer comp to:', { partyName: entry.party_name, partySize: entry.party_size, quotedWaitMinutes: entry.quoted_wait_minutes, actualWaitMinutes: Math.floor((Date.now() - new Date(entry.created_at).getTime()) / 60000), timestamp: new Date().toISOString() })
  }, [show])

  const handleSeatEntry = useCallback((entry: WaitlistEntry) => {
    setSelectedEntry(entry)
    setShowTablePicker(true)
  }, [])

  const handleReorder = useCallback((fromIndex: number, toIndex: number) => {
    const current = waitlist.filter(e => ['waiting', 'notified', 'arrived'].includes(e.status))
    const newList = [...current]
    const [movedItem] = newList.splice(fromIndex, 1)
    newList.splice(toIndex, 0, movedItem)
    reorderWaitlist(newList.map((item, idx) => ({ ...item, position: idx + 1 })))
  }, [waitlist, reorderWaitlist])

  const activeWaitlist = useMemo(
    () => waitlist.filter(e => ['waiting', 'notified', 'arrived'].includes(e.status)).sort((a, b) => (a.position || 0) - (b.position || 0)),
    [waitlist]
  )

  const cardDragStates = useWaitlistDragState(activeWaitlist.length)

  const waitingCount = useMemo(() => waitlist.filter(e => e.status === 'waiting').length, [waitlist])

  const STATUS_LEGEND = [
    { color: colors.label, label: 'Waiting' },
    { color: colors.info, label: 'Notified' },
    { color: colors.success, label: 'Arrived' },
    { color: colors.warning, label: 'Approaching' },
    { color: colors.danger, label: 'Overdue' },
  ]

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, backgroundColor: colors.panel, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View>
          <Text style={{ color: colors.heading, fontSize: 15, fontWeight: '700' }}>Waitlist</Text>
          <Text style={{ color: colors.muted, fontSize: 11, marginTop: 1 }}>{waitingCount} {waitingCount === 1 ? 'party' : 'parties'} waiting</Text>
        </View>
        <TouchableOpacity
          onPress={() => setShowAddForm(true)}
          style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, backgroundColor: colors.teal + '18', borderWidth: 1, borderColor: colors.teal + '50' }}
        >
          <Plus size={13} color={colors.teal} />
          <Text style={{ color: colors.teal, fontWeight: '600', fontSize: 12 }}>Add Party</Text>
        </TouchableOpacity>
      </View>

      {/* Legend */}
      <View style={{ paddingHorizontal: 16, paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', flexWrap: 'wrap', gap: 12, justifyContent: 'center' }}>
        {STATUS_LEGEND.map(({ color, label }) => (
          <View key={label} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: color }} />
            <Text style={{ color: colors.muted, fontSize: 11 }}>{label}</Text>
          </View>
        ))}
      </View>

      {/* Queue List */}
      {isLoading ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.teal} size='small' />
        </View>
      ) : activeWaitlist.length === 0 ? (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 16 }}>
          <Bell size={36} color={colors.muted} />
          <Text style={{ color: colors.label, fontSize: 13, fontWeight: '600', marginTop: 10 }}>No parties waiting</Text>
          <Text style={{ color: colors.muted, fontSize: 12, marginTop: 4, textAlign: 'center' }}>Add guests to the waitlist to get started</Text>
        </View>
      ) : (
        <ScrollView scrollEnabled={scrollEnabled} contentContainerStyle={{ padding: 12, gap: 8 }} showsVerticalScrollIndicator>
          {activeWaitlist.map((item, index) => (
            <AnimatedCardItem
              key={item.id}
              item={item}
              index={index}
              activeWaitlistLength={activeWaitlist.length}
              cardDragStates={cardDragStates}
              dragIndex={dragIndex}
              dragStartY={dragStartY}
              cardHeight={cardHeight}
              setScrollEnabled={setScrollEnabled}
              onReorder={handleReorder}
              onNotify={handleNotifyParty}
              onSeat={handleSeatEntry}
              onCancel={handleCancelEntry}
              onMarkNoShow={handleMarkNoShow}
              onOfferComp={handleOfferComp}
            />
          ))}
        </ScrollView>
      )}

      <AddWaitlistModal visible={showAddForm} onClose={handleCloseAddForm} onSubmit={handleAddToWaitlist} isLoading={isLoading} />

      {selectedEntry && (
        <TableSelectionSheet
          isOpen={showTablePicker}
          onClose={() => { setShowTablePicker(false); setSelectedEntry(null) }}
          entry={selectedEntry}
          tables={tables}
          onSelectTable={async (tableIds: string[]) => {
            const didSeat = await handleSeatParty(selectedEntry, tableIds)
            if (didSeat) { setShowTablePicker(false); setSelectedEntry(null) }
          }}
        />
      )}

      {notice && (
        <AppNoticeModal visible onClose={() => setNotice(null)} title={notice.title} description={notice.description} variant={notice.variant} />
      )}
    </View>
  )
}

export default HostStationScreenEnhanced
