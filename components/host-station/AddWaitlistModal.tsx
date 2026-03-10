import { colors } from '@/lib/theme'
import { X } from 'lucide-react-native'
import React, { useCallback } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
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

export const AddWaitlistModal = React.memo<AddWaitlistModalProps>(
  ({ visible, onClose, onSubmit, isLoading }) => {
    const handleCancel = useCallback(() => {
      onClose()
    }, [onClose])

    const handleSubmit = useCallback(
      (data: AddWaitlistPayload) => {
        onSubmit(data)
      },
      [onSubmit]
    )

    return (
      <Modal
        visible={visible}
        animationType='slide'
        transparent
        presentationStyle='pageSheet'
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          className='flex-1 bg-black/50'
        >
          <View className='flex-1 bg-screen mt-10 rounded-t-3xl'>
            <View className='flex-row items-center justify-between px-4 pt-4 pb-4 border-b border-border'>
              <Text className='text-white text-xl font-bold'>
                Add to Waitlist
              </Text>
              <TouchableOpacity onPress={onClose}>
                <X size={24} color={colors.label} />
              </TouchableOpacity>
            </View>
            <AddToWaitlistForm
              onSubmit={handleSubmit}
              onCancel={handleCancel}
              isLoading={isLoading}
            />
          </View>
        </KeyboardAvoidingView>
      </Modal>
    )
  }
)

AddWaitlistModal.displayName = 'AddWaitlistModal'
