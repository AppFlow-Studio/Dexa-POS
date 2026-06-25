import DiscardChangesModal from '@/components/ui/DiscardChangesModal'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { X } from 'lucide-react-native'
import React, { useCallback, useEffect, useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import AddToWaitlistForm from './AddToWaitlistForm'

export type AddWaitlistPayload = {
  party_name: string
  party_size: number
  phone?: string
  email?: string
  seating_preference?: string
  preferred_section?: string
  notes?: string
  quoted_wait_minutes?: number
  estimated_ready_at?: string
}

interface AddWaitlistModalProps {
  visible: boolean
  onClose: () => void
  onSubmit: (data: AddWaitlistPayload) => Promise<void> | void
  isLoading: boolean
  mode?: 'add' | 'edit'
  initialValues?: Partial<AddWaitlistPayload>
}

export const AddWaitlistModal = React.memo<AddWaitlistModalProps>(
  ({ visible, onClose, onSubmit, isLoading, mode = 'add', initialValues }) => {
    const uiScale = useUiScale()
    const s = (n: number) => Math.round(n * uiScale)

    const [isDirty, setIsDirty] = useState(false)
    const [showDiscardConfirm, setShowDiscardConfirm] = useState(false)

    useEffect(() => {
      if (!visible) {
        setIsDirty(false)
        setShowDiscardConfirm(false)
      }
    }, [visible])

    const requestClose = useCallback(() => {
      if (isDirty) {
        setShowDiscardConfirm(true)
        return
      }
      onClose()
    }, [isDirty, onClose])

    const handleCancel = useCallback(() => requestClose(), [requestClose])
    const handleSubmit = useCallback(
      async (data: AddWaitlistPayload) => {
        await onSubmit(data)
        setIsDirty(false)
      },
      [onSubmit]
    )

    const confirmDiscard = useCallback(() => {
      setShowDiscardConfirm(false)
      setIsDirty(false)
      onClose()
    }, [onClose])

    return (
      <Modal
        visible={visible}
        animationType='fade'
        transparent
        onRequestClose={requestClose}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={{
            flex: 1,
            justifyContent: 'center',
            alignItems: 'center',
            backgroundColor: 'rgba(0,0,0,0.6)'
          }}
        >
          <View
            style={{
              width: s(480),
              maxHeight: '88%',
              backgroundColor: colors.panel,
              borderRadius: s(16),
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden',
              // Shadow for depth
              shadowColor: '#000',
              shadowOffset: { width: 0, height: s(8) },
              shadowOpacity: 0.4,
              shadowRadius: s(24),
              elevation: 20
            }}
          >
            {/* Header */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: s(16),
                paddingVertical: s(13),
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
                backgroundColor: colors.card
              }}
            >
              <View>
                <Text
                  style={{
                    color: colors.heading,
                    fontSize: s(14),
                    fontWeight: '700'
                  }}
                >
                  {mode === 'edit' ? 'Edit Waitlist Entry' : 'Add to Waitlist'}
                </Text>
                <Text
                  style={{ color: colors.muted, fontSize: s(11), marginTop: s(1) }}
                >
                  {mode === 'edit'
                    ? 'Update the party details below'
                    : 'Fill in the party details below'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={requestClose}
                style={{
                  padding: s(6),
                  borderRadius: s(8),
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <X size={s(14)} color={colors.label} />
              </TouchableOpacity>
            </View>

            {/* Form — scrollable so keyboard never pushes the modal */}
            <ScrollView
              keyboardShouldPersistTaps='handled'
              showsVerticalScrollIndicator={false}
              bounces={false}
            >
              <AddToWaitlistForm
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                isLoading={isLoading}
                mode={mode}
                initialValues={initialValues}
                onDirtyChange={setIsDirty}
              />
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
        <DiscardChangesModal
          visible={showDiscardConfirm}
          onClose={() => setShowDiscardConfirm(false)}
          onConfirm={confirmDiscard}
        />
      </Modal>
    )
  }
)

AddWaitlistModal.displayName = 'AddWaitlistModal'