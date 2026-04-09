import ConfirmationModal from '@/components/settings/reset-application/ConfirmationModal'
import { AddWaitlistModal } from '@/components/host-station/AddWaitlistModal'
import AppNoticeModal from '@/components/ui/AppNoticeModal'
import { TableSelectionSheet } from '@/components/host-station/TableSelectionSheet'
import { WaitlistCard } from '@/components/tables/waitlist-shared'
import { useToast } from '@/contexts/ToastContext'
import { colors } from '@/lib/theme'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { usePendingTableOverlay } from '@/stores/usePendingTableOverlay'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useWaitlistStore } from '@/stores/useWaitlistStore'
import { WaitlistEntry } from '@/types/db-floor-plan-types'
import { useRouter } from 'expo-router'
import {
  Clock,
  UserPlus,
  X,
} from 'lucide-react-native'
import { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator,
  FlatList,
  Text,
  TouchableOpacity,
  View,
} from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'

export default function WaitlistScreen () {
  const router = useRouter()
  const { show } = useToast()

  const waitlist = useWaitlistStore(s => s.waitlist)
  const isLoading = useWaitlistStore(s => s.isLoading)
  const fetchWaitlist = useWaitlistStore(s => s.fetchWaitlist)
  const addToWaitlistAsync = useWaitlistStore(s => s.addToWaitlistAsync)
  const removeFromWaitlistAsync = useWaitlistStore(s => s.removeFromWaitlistAsync)
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
          tableId,
        })
        setActiveOrder(newOrder.id)
      }

      usePendingTableOverlay.getState().setPendingTableId(tableId)
      router.push('/tables')
    },
    [selectedEntry, seatFromWaitlistAsync, startNewOrder, setActiveOrder, router]
  )

  const handleNotify = useCallback(
    async (entry: WaitlistEntry) => {
      const phoneDigits = entry.phone?.replace(/\D/g, '') ?? ''

      if (!phoneDigits) {
        setNotice({
          title: 'No Phone Number',
          description: `Please call out "${entry.party_name}" — no phone on file`,
          variant: 'warning',
        })
        return
      }

      try {
        const result = await useWaitlistStore.getState().notifyWaitlistPartyAsync(entry.id)

        if (!result.success) {
          if (result.error === 'sms_failed') {
            setNotice({
              title: 'SMS Failed',
              description:
                result.message ||
                'Could not send SMS. Failure logged. Please notify guest verbally.',
              variant: 'error',
            })
          } else {
            setNotice({
              title: 'Could Not Notify',
              description: result.error || 'Failed to notify party',
              variant: 'error',
            })
          }
        } else if (result.sms) {
          show({ title: 'Notified', message: `SMS sent to ${entry.party_name}`, type: 'success' })
        } else if (result.reason === 'no_valid_phone') {
          show({
            title: 'Invalid Phone Number',
            message: `Could not send SMS — invalid number on file. Please notify ${entry.party_name} verbally.`,
            type: 'warning',
          })
        } else {
          show({
            title: 'Party Notified',
            message: `${entry.party_name} has been notified`,
            type: 'success',
          })
        }

        if (result.success && selectedStore?.id) {
          fetchWaitlist(selectedStore.id)
        }
      } catch (err: any) {
        show({
          title: 'Could Not Notify',
          message: err.message || `Failed to notify ${entry.party_name}. Please try again.`,
          type: 'error',
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
    async (data: { party_name: string; party_size: number; phone?: string; email?: string; seating_preference?: string; preferred_section?: string; notes?: string; quoted_wait_minutes?: number }) => {
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
          <Text className='text-muted text-sm mt-1'>Tap the + to add someone</Text>
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
