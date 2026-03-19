import ConfirmationModal from '@/components/settings/reset-application/ConfirmationModal'
import AppNoticeModal from '@/components/ui/AppNoticeModal'
import { useToast } from '@/contexts/ToastContext'
import { colors } from '@/lib/theme'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useWaitlistStore } from '@/stores/useWaitlistStore'
import { useRouter } from 'expo-router'
import { WaitlistEntry } from '@/types/db-floor-plan-types'
import {
  AlertCircle, Bell, Check, ChevronDown, ChevronUp,
  Clock, Phone, StickyNote, UserPlus, Users, X
} from 'lucide-react-native'
import React, { useCallback, useEffect, useState } from 'react'
import {
  ActivityIndicator, KeyboardAvoidingView, Modal, Platform,
  Pressable, ScrollView, Text, TextInput, TouchableOpacity, View
} from 'react-native'
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated'

function getElapsedMinutes(createdAt: string): number {
  return Math.floor((Date.now() - new Date(createdAt).getTime()) / 60_000)
}

function formatElapsed(minutes: number): string {
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

const inputStyle = {
  backgroundColor: colors.screen,
  color: colors.heading,
  fontSize: 13,
  padding: 10,
  borderRadius: 8,
  borderWidth: 1,
  borderColor: colors.border,
}

const AddWaitlistModal: React.FC<{
  visible: boolean
  onClose: () => void
  onSubmit: (data: { name: string; partySize: number; quotedTime: number; notes: string; phone?: string }) => void
  isLoading: boolean
}> = ({ visible, onClose, onSubmit, isLoading }) => {
  const [name, setName] = useState('')
  const [partySize, setPartySize] = useState('')
  const [quotedTime, setQuotedTime] = useState('15')
  const [notes, setNotes] = useState('')
  const [phone, setPhone] = useState('')

  const resetForm = () => { setName(''); setPartySize(''); setQuotedTime('15'); setNotes(''); setPhone('') }
  const handleClose = () => { resetForm(); onClose() }
  const handleSubmit = () => {
    onSubmit({ name: name || 'Guest', partySize: parseInt(partySize || '2', 10), quotedTime: parseInt(quotedTime || '15', 10), notes, phone: phone || undefined })
    resetForm()
  }

  return (
    <Modal visible={visible} transparent animationType='fade' onRequestClose={handleClose}>
      <Pressable style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }} onPress={handleClose}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
          <Pressable onPress={() => {}} style={{ backgroundColor: colors.panel, borderRadius: 14, width: 360, borderWidth: 1, borderColor: colors.border }}>
            {/* Header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>Add to Waitlist</Text>
              <TouchableOpacity onPress={handleClose} style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '30' }}>
                <X size={14} color={colors.danger} />
              </TouchableOpacity>
            </View>

            {/* Form */}
            <View style={{ padding: 16, gap: 12 }}>
              <View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Guest Name</Text>
                <TextInput value={name} onChangeText={setName} placeholder='Enter name' placeholderTextColor={colors.muted} style={inputStyle} />
              </View>

              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Party Size</Text>
                  <TextInput value={partySize} onChangeText={setPartySize} keyboardType='numeric' placeholder='2' placeholderTextColor={colors.muted} style={inputStyle} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Wait Time (min)</Text>
                  <TextInput value={quotedTime} onChangeText={setQuotedTime} keyboardType='numeric' placeholder='15' placeholderTextColor={colors.muted} style={inputStyle} />
                </View>
              </View>

              <View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Phone (Optional)</Text>
                <TextInput value={phone} onChangeText={setPhone} keyboardType='phone-pad' placeholder='Phone number' placeholderTextColor={colors.muted} style={inputStyle} />
              </View>

              <View>
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Notes (Optional)</Text>
                <TextInput value={notes} onChangeText={setNotes} placeholder='Special requests, allergies...' placeholderTextColor={colors.muted} multiline style={{ ...inputStyle, height: 70, textAlignVertical: 'top' }} />
              </View>

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <TouchableOpacity onPress={handleClose} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.label }}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={handleSubmit} disabled={isLoading} style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center', backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50', opacity: isLoading ? 0.5 : 1 }}>
                  {isLoading ? <ActivityIndicator color={colors.teal} size='small' /> : <Text style={{ fontSize: 13, fontWeight: '700', color: colors.teal }}>Add to Waitlist</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  )
}

const WaitlistPanelCard: React.FC<{
  entry: WaitlistEntry
  isExpanded: boolean
  onToggle: () => void
  onSeat: () => void
  onNotify: () => void
  onDelete: () => void
  now: number
}> = ({ entry, isExpanded, onToggle, onSeat, onNotify, onDelete }) => {
  const elapsed = getElapsedMinutes(entry.created_at)
  const isOverdue = elapsed > entry.quoted_wait_minutes

  return (
    <Animated.View layout={LinearTransition.duration(200)} style={{ marginBottom: 8, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
      {/* Collapsed Row */}
      <Pressable onPress={onToggle} style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 10, paddingVertical: 10 }}>
        {/* Time badge */}
        <View style={{
          width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
          backgroundColor: isOverdue ? colors.danger + '20' : colors.teal + '15',
          borderWidth: 1, borderColor: isOverdue ? colors.danger + '40' : colors.teal + '30',
        }}>
          <Text style={{ fontSize: 11, fontWeight: '700', color: isOverdue ? colors.danger : colors.teal }}>
            {formatElapsed(elapsed)}
          </Text>
        </View>

        {/* Name + guests */}
        <View style={{ flex: 1, marginLeft: 10, minWidth: 0 }}>
          <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }} numberOfLines={1}>{entry.party_name}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
            <Users size={11} color={colors.muted} />
            <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 4 }}>
              {entry.party_size} {entry.party_size === 1 ? 'guest' : 'guests'}
            </Text>
          </View>
          {(entry.notification_failures ?? 0) > 0 && (
            <View style={{ alignSelf: 'flex-start', marginTop: 3, paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, backgroundColor: colors.danger + '20', borderWidth: 1, borderColor: colors.danger + '40' }}>
              <Text style={{ fontSize: 10, fontWeight: '700', color: colors.danger }}>SMS FAIL {entry.notification_failures}</Text>
            </View>
          )}
        </View>

        {isExpanded ? <ChevronUp size={14} color={colors.muted} /> : <ChevronDown size={14} color={colors.muted} />}
      </Pressable>

      {/* Expanded */}
      {isExpanded && (
        <Animated.View entering={FadeIn.duration(150)} exiting={FadeOut.duration(100)} style={{ paddingHorizontal: 10, paddingBottom: 10, borderTopWidth: 1, borderTopColor: colors.border }}>
          <View style={{ marginTop: 8, gap: 6 }}>
            {entry.phone && (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Phone size={12} color={colors.label} />
                <Text style={{ fontSize: 12, color: colors.label, marginLeft: 6 }}>{entry.phone}</Text>
              </View>
            )}
            {entry.notes && (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                <StickyNote size={12} color={colors.label} style={{ marginTop: 1 }} />
                <Text style={{ fontSize: 12, color: colors.label, marginLeft: 6, fontStyle: 'italic', flex: 1 }}>{entry.notes}</Text>
              </View>
            )}
            <View style={{ flexDirection: 'row', alignItems: 'center' }}>
              <Clock size={12} color={colors.label} />
              <Text style={{ fontSize: 12, color: colors.label, marginLeft: 6 }}>Quoted: {entry.quoted_wait_minutes} min</Text>
            </View>
            {(entry.notification_failures ?? 0) > 0 && (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 10, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '30' }}>
                <AlertCircle size={12} color={colors.danger} />
                <Text style={{ fontSize: 11, color: colors.danger, flex: 1, fontWeight: '600' }}>SMS failed {entry.notification_failures}x — notify verbally</Text>
              </View>
            )}
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <TouchableOpacity onPress={onSeat} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, backgroundColor: colors.teal + '20', borderWidth: 1, borderColor: colors.teal + '50' }}>
              <Check size={13} color={colors.teal} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.teal }}>Seat</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onNotify} style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 8, borderRadius: 8, borderWidth: 1, borderColor: colors.border }}>
              <Bell size={13} color={colors.label} />
              <Text style={{ fontSize: 12, fontWeight: '600', color: colors.label }}>Notify</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onDelete} style={{ width: 36, height: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 8, backgroundColor: colors.danger + '15', borderWidth: 1, borderColor: colors.danger + '30' }}>
              <X size={13} color={colors.danger} />
            </TouchableOpacity>
          </View>
        </Animated.View>
      )}
    </Animated.View>
  )
}

const WaitlistPanel: React.FC = () => {
  const { waitlist, isLoading, fetchWaitlist, addToWaitlistAsync, removeFromWaitlistAsync } = useWaitlistStore()
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const { show } = useToast()
  const [showAddModal, setShowAddModal] = useState(false)
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [itemToDelete, setItemToDelete] = useState<WaitlistEntry | null>(null)
  const [now, setNow] = useState(Date.now())
  const [notice, setNotice] = useState<{ title: string; description: string; variant: 'info' | 'warning' | 'error' } | null>(null)

  useEffect(() => {
    if (selectedStore?.id) fetchWaitlist(selectedStore.id)
  }, [selectedStore?.id])

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 60_000)
    return () => clearInterval(interval)
  }, [])

  const handleToggle = useCallback((id: string) => {
    setExpandedId(prev => prev === id ? null : id)
  }, [])

  const router = useRouter()
  const handleSeat = useCallback(() => { router.push('/tables/waitlist') }, [router])

  const handleNotify = useCallback(async (entry: WaitlistEntry) => {
    const phoneDigits = entry.phone?.replace(/\D/g, '') ?? ''
    if (!phoneDigits) {
      setNotice({ title: 'No Phone Number', description: `Please call out "${entry.party_name}" — no phone on file`, variant: 'warning' })
      return
    }
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
      if (result.success && selectedStore?.id) fetchWaitlist(selectedStore.id)
    } catch (err: any) {
      show({ title: 'Could Not Notify', message: err.message || `Failed to notify ${entry.party_name}. Please try again.`, type: 'error' })
    }
  }, [show, selectedStore?.id, fetchWaitlist])

  const confirmDelete = useCallback(async () => {
    if (itemToDelete) { await removeFromWaitlistAsync(itemToDelete.id); setItemToDelete(null) }
  }, [itemToDelete, removeFromWaitlistAsync])

  const handleAddEntry = useCallback(async (data: { name: string; partySize: number; quotedTime: number; notes: string; phone?: string }) => {
    if (!selectedStore?.id) return
    await addToWaitlistAsync({ locationId: selectedStore.id, p_party_name: data.name, p_party_size: data.partySize, p_quoted_wait_minutes: data.quotedTime, p_notes: data.notes, p_phone: data.phone })
    setShowAddModal(false)
  }, [selectedStore?.id, addToWaitlistAsync])

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
        <TouchableOpacity onPress={() => setShowAddModal(true)} style={{ width: 30, height: 30, borderRadius: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.teal + '15', borderWidth: 1, borderColor: colors.teal + '30' }}>
          <UserPlus size={14} color={colors.teal} />
        </TouchableOpacity>
      </View>

      {/* List */}
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 8, paddingBottom: 20 }}>
        {isLoading && waitlist.length === 0 ? (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
            <ActivityIndicator size='small' color={colors.teal} />
            <Text style={{ fontSize: 12, color: colors.muted, marginTop: 8 }}>Loading waitlist...</Text>
          </View>
        ) : waitlist.length > 0 ? (
          waitlist.map(entry => (
            <WaitlistPanelCard key={entry.id} entry={entry} isExpanded={expandedId === entry.id} onToggle={() => handleToggle(entry.id)} onSeat={() => handleSeat()} onNotify={() => handleNotify(entry)} onDelete={() => setItemToDelete(entry)} now={now} />
          ))
        ) : (
          <View style={{ alignItems: 'center', justifyContent: 'center', paddingVertical: 40 }}>
            <Clock size={28} color={colors.muted} />
            <Text style={{ fontSize: 13, color: colors.label, marginTop: 10 }}>No parties waiting</Text>
            <Text style={{ fontSize: 11, color: colors.muted, marginTop: 4 }}>Tap + to add someone</Text>
          </View>
        )}
      </ScrollView>

      <AddWaitlistModal visible={showAddModal} onClose={() => setShowAddModal(false)} onSubmit={handleAddEntry} isLoading={isLoading} />
      <ConfirmationModal isOpen={!!itemToDelete} onClose={() => setItemToDelete(null)} onConfirm={confirmDelete} title='Remove from Waitlist?' description={`Are you sure you want to remove ${itemToDelete?.party_name} from the waitlist?`} confirmText='Remove' variant='destructive' />
      {notice && <AppNoticeModal visible onClose={() => setNotice(null)} title={notice.title} description={notice.description} variant={notice.variant} />}
    </View>
  )
}

export default WaitlistPanel
