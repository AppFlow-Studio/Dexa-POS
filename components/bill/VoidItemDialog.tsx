import { colors } from '@/lib/theme'
import { X } from 'lucide-react-native'
import React, { useState } from 'react'
import {
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View
} from 'react-native'

interface VoidItemDialogProps {
  isOpen: boolean
  itemName: string
  onConfirm: (reason: string) => void
  onCancel: () => void
}

const PREDEFINED_REASONS = [
  'Customer changed mind',
  'Out of stock',
  'Wrong item ordered',
  'Quality issue'
]

const VoidItemDialog: React.FC<VoidItemDialogProps> = ({
  isOpen,
  itemName,
  onConfirm,
  onCancel
}) => {
  const [selectedReason, setSelectedReason] = useState<string | null>(null)
  const [customReason, setCustomReason] = useState('')
  const [isOtherSelected, setIsOtherSelected] = useState(false)

  const handleSelectReason = (reason: string) => {
    setSelectedReason(reason)
    setIsOtherSelected(false)
    setCustomReason('')
  }

  const handleSelectOther = () => {
    setSelectedReason(null)
    setIsOtherSelected(true)
  }

  const handleConfirm = () => {
    const reason = isOtherSelected ? customReason.trim() : selectedReason
    if (reason) {
      onConfirm(reason)
      // Reset state
      setSelectedReason(null)
      setCustomReason('')
      setIsOtherSelected(false)
    }
  }

  const handleCancel = () => {
    // Reset state
    setSelectedReason(null)
    setCustomReason('')
    setIsOtherSelected(false)
    onCancel()
  }

  const isConfirmDisabled =
    !selectedReason && (!isOtherSelected || !customReason.trim())

  const warningBackground = `${colors.danger}1A`
  const warningBorder = `${colors.danger}59`
  const selectedChipBackground = colors.danger
  const selectedChipBorder = colors.danger
  const unselectedChipBackground = colors.card
  const unselectedChipBorder = colors.border

  if (!isOpen) return null

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType='fade'
      onRequestClose={handleCancel}
    >
      <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
        >
          <View
            style={{
              flex: 1,
              justifyContent: 'center',
              alignItems: 'center',
              backgroundColor: 'rgba(0,0,0,0.7)',
              paddingHorizontal: 16
            }}
          >
            <View
              style={{
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border
              }}
              className='w-full max-w-md rounded-2xl overflow-hidden'
            >
              {/* Header */}
              <View
                style={{
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border
                }}
                className='flex-row items-center justify-between p-4'
              >
                <Text
                  style={{ color: colors.heading }}
                  className='text-xl font-bold'
                >
                  Void Item
                </Text>
                <TouchableOpacity onPress={handleCancel} className='p-1'>
                  <X size={24} color={colors.muted} />
                </TouchableOpacity>
              </View>

              {/* Content - Scrollable */}
              <ScrollView
                keyboardShouldPersistTaps='handled'
                contentContainerStyle={{ flexGrow: 1 }}
              >
                <View className='p-4'>
                  {/* Void warning banner */}
                  <View
                    style={{
                      backgroundColor: warningBackground,
                      borderWidth: 1,
                      borderColor: warningBorder
                    }}
                    className='rounded-lg p-3 mb-4'
                  >
                    <Text
                      style={{ color: colors.danger }}
                      className='text-sm font-medium'
                    >
                      ⚠️ This item was sent to the kitchen
                    </Text>
                    <Text
                      style={{ color: colors.label }}
                      className='text-xs mt-1 leading-[18px]'
                    >
                      Voiding requires a reason for tracking. Manager approval
                      may be needed.
                    </Text>
                  </View>

                  <Text
                    style={{ color: colors.label }}
                    className='text-base mb-2'
                  >
                    Voiding:{' '}
                    <Text
                      style={{ color: colors.heading }}
                      className='font-semibold'
                    >
                      {itemName}
                    </Text>
                  </Text>
                  <Text
                    style={{ color: colors.muted }}
                    className='text-sm mb-4'
                  >
                    Select a reason for voiding this item:
                  </Text>

                  {/* Predefined Reasons */}
                  <View className='flex-row flex-wrap gap-2 mb-4'>
                    {PREDEFINED_REASONS.map(reason => (
                      <TouchableOpacity
                        key={reason}
                        onPress={() => handleSelectReason(reason)}
                        style={{
                          borderWidth: 1,
                          backgroundColor:
                            selectedReason === reason
                              ? selectedChipBackground
                              : unselectedChipBackground,
                          borderColor:
                            selectedReason === reason
                              ? selectedChipBorder
                              : unselectedChipBorder
                        }}
                        className='px-4 py-2 rounded-full'
                      >
                        <Text
                          style={{
                            color:
                              selectedReason === reason
                                ? colors.onSolid
                                : colors.label
                          }}
                          className={
                            selectedReason === reason
                              ? 'text-sm font-semibold'
                              : 'text-sm'
                          }
                        >
                          {reason}
                        </Text>
                      </TouchableOpacity>
                    ))}

                    {/* Other option */}
                    <TouchableOpacity
                      onPress={handleSelectOther}
                      style={{
                        borderWidth: 1,
                        backgroundColor: isOtherSelected
                          ? selectedChipBackground
                          : unselectedChipBackground,
                        borderColor: isOtherSelected
                          ? selectedChipBorder
                          : unselectedChipBorder
                      }}
                      className='px-4 py-2 rounded-full'
                    >
                      <Text
                        style={{
                          color: isOtherSelected ? colors.onSolid : colors.label
                        }}
                        className={
                          isOtherSelected ? 'text-sm font-semibold' : 'text-sm'
                        }
                      >
                        Other
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Custom reason input */}
                  {isOtherSelected && (
                    <TextInput
                      style={{
                        backgroundColor: colors.card,
                        borderWidth: 1,
                        borderColor: colors.border,
                        color: colors.heading
                      }}
                      className='rounded-lg p-3 text-base mb-4'
                      placeholder='Enter reason...'
                      placeholderTextColor={colors.muted}
                      value={customReason}
                      onChangeText={setCustomReason}
                      autoFocus
                      multiline
                      numberOfLines={2}
                      textAlignVertical='top'
                    />
                  )}
                </View>
              </ScrollView>

              {/* Actions */}
              <View
                style={{
                  borderTopWidth: 1,
                  borderTopColor: colors.border
                }}
                className='flex-row'
              >
                <TouchableOpacity
                  onPress={handleCancel}
                  style={{
                    borderRightWidth: 1,
                    borderRightColor: colors.border,
                    backgroundColor: colors.card
                  }}
                  className='flex-1 py-4 items-center'
                >
                  <Text
                    style={{ color: colors.label }}
                    className='text-base font-semibold'
                  >
                    Cancel
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={handleConfirm}
                  disabled={isConfirmDisabled}
                  style={{
                    backgroundColor: isConfirmDisabled
                      ? colors.card
                      : `${colors.danger}14`,
                    opacity: isConfirmDisabled ? 0.45 : 1
                  }}
                  className='flex-1 py-4 items-center'
                >
                  <Text
                    style={{
                      color: isConfirmDisabled ? colors.muted : colors.danger
                    }}
                    className='text-base font-semibold'
                  >
                    Void Item
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </TouchableWithoutFeedback>
    </Modal>
  )
}

export default VoidItemDialog
