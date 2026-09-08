import { AddWaitlistModal } from '@/components/host-station/AddWaitlistModal'
import { TableSelectionSheet } from '@/components/host-station/TableSelectionSheet'
import NotifyCustomerModal from '@/components/notifications/NotifyCustomerModal'
import ConfirmationModal from '@/components/settings/reset-application/ConfirmationModal'
import { WaitlistCard } from '@/components/tables/waitlist-shared'
import AppNoticeModal from '@/components/ui/AppNoticeModal'
import { useToast } from '@/contexts/ToastContext'
import { NotifyContext, TemplateKey } from '@/lib/notifyTemplates'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePendingTableOverlay } from '@/stores/usePendingTableOverlay'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useWaitlistStore } from '@/stores/useWaitlistStore'
import { WaitlistEntry } from '@/types/db-floor-plan-types'
import { useRouter } from 'expo-router'
import { FlashList } from '@shopify/flash-list'
import { Clock, UserPlus } from 'lucide-react-native'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

/**
 * Unscaled height of a collapsed waitlist card. Only a first-pass hint for
 * FlashList — expanded cards are typed separately via `getItemType` so the
 * two sizes never recycle into each other's slots.
 */
const ESTIMATED_CARD_HEIGHT = 84

/**
 * Binds the panel's stable per-entry callbacks to one row so the card sees
 * referentially stable props across re-renders and FlashList's recycling can
 * bail out on rows whose own state did not change.
 */
const WaitlistRow = React.memo(function WaitlistRow({
  entry,
  isExpanded,
  onToggle,
  onSeat,
  onNotify,
  onDelete,
  onEdit
}: {
  entry: WaitlistEntry
  isExpanded: boolean
  onToggle: (id: string) => void
  onSeat: (entry: WaitlistEntry) => void
  onNotify: (entry: WaitlistEntry) => void
  onDelete: (entry: WaitlistEntry) => void
  onEdit: (entry: WaitlistEntry) => void
}) {
  const toggle = useCallback(() => onToggle(entry.id), [onToggle, entry.id])
  const seat = useCallback(() => onSeat(entry), [onSeat, entry])
  const notify = useCallback(() => onNotify(entry), [onNotify, entry])
  const remove = useCallback(() => onDelete(entry), [onDelete, entry])
  const edit = useCallback(() => onEdit(entry), [onEdit, entry])

  return (
    <WaitlistCard
      entry={entry}
      isExpanded={isExpanded}
      onToggle={toggle}
      onSeat={seat}
      onNotify={notify}
      onDelete={remove}
      onEdit={edit}
    />
  )
})

const WaitlistPanel: React.FC = () => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  const {
    waitlist,
    isLoading,
    fetchWaitlist,
    addToWaitlistAsync,
    removeFromWaitlistAsync,
    seatFromWaitlistAsync
  } = useWaitlistStore()
  const updateWaitlistEntryAsync = useWaitlistStore(
    s => s.updateWaitlistEntryAsync
  )
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
  const [notice, setNotice] = useState<{
    title: string
    description: string
    variant: 'info' | 'warning' | 'error'
  } | null>(null)
  const [entryToEdit, setEntryToEdit] = useState<WaitlistEntry | null>(null)
  const [isEditLoading, setIsEditLoading] = useState(false)
  const [notifyTarget, setNotifyTarget] = useState<WaitlistEntry | null>(null)

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
          tableId
        })
        setActiveOrder(newOrder.id)
      }

      usePendingTableOverlay.getState().setPendingTableId(tableId)
      router.replace('/tables')
    },
    [
      selectedEntry,
      seatFromWaitlistAsync,
      startNewOrder,
      setActiveOrder,
      router
    ]
  )

  const handleNotify = useCallback((entry: WaitlistEntry) => {
    const phoneDigits = entry.phone?.replace(/\D/g, '') ?? ''
    if (!phoneDigits) {
      setNotice({
        title: 'No Phone Number',
        description: `Please call out "${entry.party_name}" — no phone on file`,
        variant: 'warning'
      })
      return
    }
    setNotifyTarget(entry)
  }, [])

  // ─── List plumbing (declared after the row handlers it closes over) ───
  const keyExtractor = useCallback((entry: WaitlistEntry) => entry.id, [])

  // Expanded cards are much taller than collapsed ones; separate types keep
  // FlashList from recycling one shape into the other's slot.
  const getItemType = useCallback(
    (entry: WaitlistEntry) =>
      expandedId === entry.id ? 'expanded' : 'collapsed',
    [expandedId]
  )

  const renderItem = useCallback(
    ({ item }: { item: WaitlistEntry }) => (
      <WaitlistRow
        entry={item}
        isExpanded={expandedId === item.id}
        onToggle={handleToggle}
        onSeat={handleSeat}
        onNotify={handleNotify}
        onDelete={setItemToDelete}
        onEdit={setEntryToEdit}
      />
    ),
    [expandedId, handleToggle, handleSeat, handleNotify]
  )

  const notifyContext: NotifyContext | null = notifyTarget
    ? notifyTarget.status === 'notified'
      ? {
          kind: 'waitlist_update',
          partyName: notifyTarget.party_name,
          storeName: selectedStore?.name ?? 'our restaurant'
        }
      : {
          kind: 'waitlist_ready',
          partyName: notifyTarget.party_name,
          storeName: selectedStore?.name ?? 'our restaurant'
        }
    : null

  const handleSendNotify = useCallback(
    async (message: string, templateKey: TemplateKey) => {
      if (!notifyTarget) {
        return { success: false, error: 'no_target' }
      }
      const result = await useWaitlistStore
        .getState()
        .sendWaitlistCustomNotification(notifyTarget.id, message, templateKey)
      if (result.success) {
        show({
          title: 'Notified',
          message: `SMS sent to ${notifyTarget.party_name}`,
          type: 'success'
        })
        if (selectedStore?.id) fetchWaitlist(selectedStore.id, { silent: true })
      }
      return result
    },
    [notifyTarget, show, selectedStore?.id, fetchWaitlist]
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

  const handleEditEntry = useCallback(
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
          quoted_wait_minutes: data.quoted_wait_minutes
        })
        show({
          title: 'Updated',
          message: `${data.party_name} has been updated`,
          type: 'success'
        })
      } catch {
        show({
          title: 'Update Failed',
          message: 'Could not save changes',
          type: 'error'
        })
      } finally {
        setIsEditLoading(false)
        setEntryToEdit(null)
      }
    },
    [entryToEdit, updateWaitlistEntryAsync, show]
  )

  return (
    <View
      style={{
        flex: 1,
        flexDirection: 'column',
        backgroundColor: colors.screen
      }}
    >
      {/* Header */}
      <View
        style={{
          paddingHorizontal: s(12),
          paddingVertical: s(10),
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(8) }}>
          <Text
            style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }}
          >
            Waitlist
          </Text>
          <View
            style={{
              backgroundColor: colors.card,
              paddingHorizontal: s(7),
              paddingVertical: s(2),
              borderRadius: s(20),
              borderWidth: 1,
              borderColor: colors.border
            }}
          >
            <Text
              style={{ fontSize: s(11), fontWeight: '600', color: colors.muted }}
            >
              {waitlist.length}
            </Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => setShowAddModal(true)}
          style={{
            width: s(30),
            height: s(30),
            borderRadius: s(8),
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.teal + '15',
            borderWidth: 1,
            borderColor: colors.teal + '30'
          }}
        >
          <UserPlus size={s(14)} color={colors.teal} />
        </TouchableOpacity>
      </View>

      {/* Content */}
      <FlashList
        data={waitlist}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        getItemType={getItemType}
        estimatedItemSize={s(ESTIMATED_CARD_HEIGHT)}
        extraData={expandedId}
        contentContainerStyle={{ padding: s(8), paddingBottom: s(20) }}
        ListEmptyComponent={
          isLoading ? (
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: s(40)
              }}
            >
              <ActivityIndicator size='small' color={colors.teal} />
              <Text style={{ fontSize: s(12), color: colors.muted, marginTop: s(8) }}>
                Loading waitlist...
              </Text>
            </View>
          ) : (
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: s(40)
              }}
            >
              <Clock size={s(28)} color={colors.muted} />
              <Text style={{ fontSize: s(13), color: colors.label, marginTop: s(10) }}>
                No parties waiting
              </Text>
              <Text style={{ fontSize: s(11), color: colors.muted, marginTop: s(4) }}>
                Tap + to add someone
              </Text>
            </View>
          )
        }
      />

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
        initialValues={
          entryToEdit
            ? {
                party_name: entryToEdit.party_name,
                party_size: entryToEdit.party_size,
                phone: entryToEdit.phone,
                email: entryToEdit.email,
                seating_preference: entryToEdit.seating_preference,
                preferred_section: entryToEdit.preferred_section,
                notes: entryToEdit.notes,
                quoted_wait_minutes: entryToEdit.quoted_wait_minutes
              }
            : undefined
        }
      />
      <TableSelectionSheet
        isOpen={isTablePickerOpen}
        onClose={() => setTablePickerOpen(false)}
        onSelectTable={handleSelectTable}
        entry={selectedEntry}
        tables={tables}
      />
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
      {notifyTarget && notifyContext && (
        <NotifyCustomerModal
          visible={!!notifyTarget}
          onClose={() => setNotifyTarget(null)}
          context={notifyContext}
          recipient={{
            phone: notifyTarget.phone,
            partyName: notifyTarget.party_name,
            storeName: selectedStore?.name ?? 'our restaurant'
          }}
          onSend={handleSendNotify}
        />
      )}
    </View>
  )
}

export default WaitlistPanel