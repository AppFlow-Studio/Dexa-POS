import { colors } from '@/lib/theme'
import { X } from 'lucide-react-native'
import React, { useCallback } from 'react'
import { Modal, Platform, Text, TouchableOpacity, View, KeyboardAvoidingView, ScrollView } from 'react-native'
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
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}
      >
        <View style={{
          width: 480,
          maxHeight: '88%',
          backgroundColor: colors.panel,
          borderRadius: 16,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden',
          // Shadow for depth
          shadowColor: '#000',
          shadowOffset: { width: 0, height: 8 },
          shadowOpacity: 0.4,
          shadowRadius: 24,
          elevation: 20,
        }}>
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 16,
            paddingVertical: 13,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.card,
          }}>
            <View>
              <Text style={{ color: colors.heading, fontSize: 14, fontWeight: '700' }}>Add to Waitlist</Text>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 1 }}>Fill in the party details below</Text>
            </View>
            <TouchableOpacity
              onPress={onClose}
              style={{ padding: 6, borderRadius: 8, backgroundColor: colors.screen, borderWidth: 1, borderColor: colors.border }}
            >
              <X size={14} color={colors.label} />
            </TouchableOpacity>
          </View>

          {/* Form — scrollable so keyboard never pushes the modal */}
          <ScrollView
            keyboardShouldPersistTaps='handled'
            showsVerticalScrollIndicator={false}
            bounces={false}
          >
            <AddToWaitlistForm onSubmit={handleSubmit} onCancel={handleCancel} isLoading={isLoading} />
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  )
})

AddWaitlistModal.displayName = 'AddWaitlistModal'
