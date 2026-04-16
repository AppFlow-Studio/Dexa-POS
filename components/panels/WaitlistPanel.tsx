import ConfirmationModal from '@/components/settings/reset-application/ConfirmationModal'
import { AddWaitlistModal } from '@/components/host-station/AddWaitlistModal'
import { TableSelectionSheet } from '@/components/host-station/TableSelectionSheet'
import { WaitlistCard } from '@/components/tables/waitlist-shared'
import AppNoticeModal from '@/components/ui/AppNoticeModal'
import { useToast } from '@/contexts/ToastContext'
import { colors } from '@/lib/theme'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePendingTableOverlay } from '@/stores/usePendingTableOverlay'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useWaitlistStore } from '@/stores/useWaitlistStore'
import { WaitlistEntry } from '@/types/db-floor-plan-types'
import { useRouter } from 'expo-router'
import { Clock, UserPlus } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'

const WaitlistPanel: React.FC = () => {
  const { waitlist, isLoading, fetchWaitlist, addToWaitlistAsync, removeFromWaitlistAsync, seatFromWaitlistAsync } = useWaitlistStore()
    const updateWaitlistEntryAsync = useWaitlistStore(s => s.updateWaitlistEntryAsync)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const tables = useFloorPlanStore(s => s.tables)
  const startNewOrder = useOrderStore(s => s.startNewOrder)
  const setActiveOrder = useOrderStore(s => s.setActiveOrder)
  const { show } = useToast()
  const router = useRouter()

  const [showAddModal, setShowAddModal] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [selectedEntry, setSelectedEntry] = useState<WaitlistEntry | null>(null)
  const [isTablePickerOpen, setTablePickerOpen] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<WaitlistEntry | null>(null)
  const [notice, setNotice] = useState<{ title: string; description: string; variant: 'info' | 'warning' | 'error' } | null>(null)
  const [entryToEdit, setEntryToEdit] = useState<WaitlistEntry | null>(null)
  const [isEditLoading, setIsEditLoading] = useState(false)

  useEffect(() => {
    if (selectedStore?.id) fetchWaitlist(selectedStore.id)
  }, [selectedStore?.id])

  const handleToggle = useCallback((id: string) => {
    setExpandedId(prev => (prev === id ? null : id))
  }, [])

  const handleSeat = useCallback((entry: WaitlistEntry) => {
    setSelectedEntry(entry)
    setTablePickerOpen(true)
  }, [])

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
          tableId,
        })
        setActiveOrder(newOrder.id)
      }

      usePendingTableOverlay.getState().setPendingTableId(tableId)
      router.push('/tables')
    },
    [selectedEntry, seatFromWaitlistAsync, startNewOrder, setActiveOrder, router]
  )

  const handleNotify = useCallback(async (entry: WaitlistEntry) => {
    const phoneDigits = entry.phone?.replace(/\D/g, '') ?? ''
    if (!phoneDigits) {
      setNotice({ title: 'No Phone Number', description: `Please call out "${entry.party_name}" — no phone on file`, variant: 'warning' })
      return
    }
    try {
      const result = await useWaitlistStore.getState().notifyWaitlistPartyAsync(entry.id)
      if (!result.success) {
        setNotice({
          title: result.error === 'sms_failed' ? 'SMS Failed' : 'Could Not Notify',
          description: result.message || result.error || 'Failed to notify party',
          variant: 'error',
        })
      } else if (result.sms) {
        show({ title: 'Notified', message: `SMS sent to ${entry.party_name}`, type: 'success' })
      } else if (result.reason === 'no_valid_phone') {
        show({ title: 'Invalid Phone Number', message: `Could not send SMS — invalid number on file. Please notify ${entry.party_name} verbally.`, type: 'warning' })
      } else {
        show({ title: 'Party Notified', message: `${entry.party_name} has been notified`, type: 'success' })
      }
      if (result.success && selectedStore?.id) fetchWaitlist(selectedStore.id)
    } catch (err: any) {
      show({ title: 'Could Not Notify', message: err.message || `Failed to notify ${entry.party_name}. Please try again.`, type: 'error' })
    }
  }, [show, selectedStore?.id, fetchWaitlist])

  const confirmDelete = useCallback(async () => {
    if (itemToDelete) { await removeFromWaitlistAsync(itemToDelete.id); setItemToDelete(null) }
  }, [itemToDelete, removeFromWaitlistAsync])

  const handleAddEntry = useCallback(async (data: { party_name: string; party_size: number; phone?: string; email?: string; seating_preference?: string; preferred_section?: string; notes?: string; quoted_wait_minutes?: number }) => {
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
      p_quoted_wait_minutes: data.quoted_wait_minutes,
    })
    setShowAddModal(false)
  }, [selectedStore?.id, addToWaitlistAsync])

  const handleEditEntry = useCallback(async (data: { party_name: string; party_size: number; phone?: string; email?: string; seating_preference?: string; preferred_section?: string; notes?: string; quoted_wait_minutes?: number }) => {
    if (!entryToEdit) return
    setIsEditLoading(true)
    try {
      await updateWaitlistEntryAsync(entryToEdit.id, {
        party_name: data.party_name,
        party_size: data.party_size,
        phone: data.phone ?? null,
        email: data.email ?? null,
        seating_preference: data.seating_preference ?? null,
        preferred_section: data.preferred_section ?? null,
        notes: data.notes ?? null,
        quoted_wait_minutes: data.quoted_wait_minutes,
      })
      show({ title: 'Updated', message: `${data.party_name} has been updated`, type: 'success' })
    } catch {
      show({ title: 'Update Failed', message: 'Could not save changes', type: 'error' })
    } finally {
      setIsEditLoading(false)
      setEntryToEdit(null)
    }
  }, [entryToEdit, updateWaitlistEntryAsync, show])

  return (
    <View style={{ flex: 1, flexDirection: 'column', backgroundColor: colors.screen }}>
      {/* Header */}
      <View style={{ paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}>Waitlist</Text>
          <View style={{ backgroundColor: colors.card, paddingHorizontal: 7, paddingVertical: 2, borderRadius: 20, borderWidth: 1, borderColor: colors.border }}>
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted }}>{waitlist.length}</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setShowAddModal(true)}
          style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal + '15', borderWidth: 1, borderColor: colors.teal + '30' }}
        >
          <UserPlus size={14} color={colors.teal} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8, paddingBottom: 20 }}>
          {isLoading && waitlist.length === 0 ? (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
              <ActivityIndicator size='small' color={colors.teal} />
              <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>Loading waitlist...</Text>
            </View>
          ) : waitlist.length > 0 ? (
            <Animated.View layout={LinearTransition.duration(200)}>
              {waitlist.map(entry => (
                <WaitlistCard
                  key={entry.id}
                  entry={entry}
                  isExpanded={expandedId === entry.id}
                  onToggle={() => handleToggle(entry.id)}
                  onSeat={() => handleSeat(entry)}
                  onNotify={() => handleNotify(entry)}
                  onDelete={() => setItemToDelete(entry)}
                  onEdit={() => setEntryToEdit(entry)}
                />
              ))}
            </Animated.View>
          ) : (
            <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
              <Clock size={28} color={colors.muted} />
              <Text style={{ fontSize: 13, color: colors.label, marginTop: 10 }}>No parties waiting</Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>Tap + to add someone</Text>
            </View>
          )}
      </ScrollView>

      <AddWaitlistModal
        visible={showAddModal}
        onClose={() => setShowAddModal(false)}
        onSubmit={handleAddEntry}
        isLoading={isLoading}
      />
      <AddWaitlistModal
        visible={!!entryToEdit}
        onClose={() => setEntryToEdit(null)}
        onSubmit={handleEditEntry}
        isLoading={isEditLoading}
        mode='edit'
        initialValues={entryToEdit ? {
          party_name: entryToEdit.party_name,
          party_size: entryToEdit.party_size,
          phone: entryToEdit.phone,
          email: entryToEdit.email,
          seating_preference: entryToEdit.seating_preference,
          preferred_section: entryToEdit.preferred_section,
          notes: entryToEdit.notes,
          quoted_wait_minutes: entryToEdit.quoted_wait_minutes,
        } : undefined}
      />
      <TableSelectionSheet
        isOpen={isTablePickerOpen}
        onClose={() => setTablePickerOpen(false)}
        onSelectTable={handleSelectTable}
        entry={selectedEntry}
        tables={tables}
      />
      <ConfirmationModal isOpen={!!itemToDelete} onClose={() => setItemToDelete(null)} onConfirm={confirmDelete} title='Remove from Waitlist?' description={`Are you sure you want to remove ${itemToDelete?.party_name} from the waitlist?`} confirmText='Remove' variant='destructive' />
      {notice && <AppNoticeModal visible onClose={() => setNotice(null)} title={notice.title} description={notice.description} variant={notice.variant} />}
    </View>
  )
}

export default WaitlistPanel
