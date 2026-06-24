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
import { Clock, UserPlus } from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, { LinearTransition } from 'react-native-reanimated'

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
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: s(8), paddingBottom: s(20) }}
      >
        {isLoading && waitlist.length === 0 ? (
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