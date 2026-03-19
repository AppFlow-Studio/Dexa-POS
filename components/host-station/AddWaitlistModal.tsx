import { colors } from '@/lib/theme'
import { X } from 'lucide-react-native'
import React, { useCallback } from 'react'
import { Modal, Platform, Text, TouchableOpacity, View, KeyboardAvoidingView } from 'react-native'
import AddToWaitlistForm from './AddToWaitlistForm'

type AddWaitlistPayload = {
  party_name: string
  party_size: number
  phone?: string
  email?: string
  seating_preference?: string
  preferred_section?: string
  notes?: string
  quoted_wait_minutes?: number
}

interface AddWaitlistModalProps {
  visible: boolean
  onClose: () => void
  onSubmit: (data: AddWaitlistPayload) => void
  isLoading: boolean
}

export const AddWaitlistModal = React.memo<AddWaitlistModalProps>(({ visible, onClose, onSubmit, isLoading }) => {
  const handleCancel = useCallback(() => onClose(), [onClose])
  const handleSubmit = useCallback((data: AddWaitlistPayload) => onSubmit(data), [onSubmit])

  return (
    <Modal visible={visible} animationType='fade' transparent onRequestClose={onClose}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.5)' }}
      >
        <View style={{ width: 460, height: 580, backgroundColor: colors.screen, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <Text style={{ color: colors.heading, fontSize: 13, fontWeight: '700' }}>Add to Waitlist</Text>
            <TouchableOpacity onPress={onClose} style={{ padding: 4, borderRadius: 6, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border }}>
              <X size={14} color={colors.label} />
            </TouchableOpacity>
          </View>
          {/* Form takes up all remaining space */}
          <View style={{ flex: 1 }}>
            <AddToWaitlistForm onSubmit={handleSubmit} onCancel={handleCancel} isLoading={isLoading} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
})

AddWaitlistModal.displayName = 'AddWaitlistModal'
