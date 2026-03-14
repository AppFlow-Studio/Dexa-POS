import { colors } from '@/lib/theme'
import { AlertTriangle, Bell, CircleX } from 'lucide-react-native'
import React from 'react'
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native'

interface AppNoticeModalProps {
  visible: boolean
  onClose: () => void
  title: string
  description: string
  variant?: 'info' | 'warning' | 'error'
}

const AppNoticeModal: React.FC<AppNoticeModalProps> = ({
  visible,
  onClose,
  title,
  description,
  variant = 'info'
}) => {
  const Icon =
    variant === 'error' ? CircleX : variant === 'warning' ? AlertTriangle : Bell

  const accentColor =
    variant === 'error'
      ? colors.danger
      : variant === 'warning'
      ? colors.warning
      : colors.teal

  const accentBg =
    variant === 'error'
      ? 'bg-red-900/30 border-red-500/30'
      : variant === 'warning'
      ? 'bg-amber-900/30 border-amber-500/30'
      : 'bg-teal/20 border-teal/30'

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      onRequestClose={onClose}
    >
      <Pressable
        className='flex-1 items-center justify-center'
        style={{ backgroundColor: 'rgba(0,0,0,0.6)' }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          className='bg-panel rounded-2xl w-[420px] border border-border p-6'
        >
          <View className='items-center'>
            <View
              className={`w-16 h-16 rounded-full items-center justify-center border-4 mb-4 ${accentBg}`}
            >
              <Icon color={accentColor} size={34} />
            </View>

            <Text className='text-2xl font-bold text-white text-center'>
              {title}
            </Text>
            <Text className='text-center text-gray-400 mt-2 text-lg'>
              {description}
            </Text>

            <TouchableOpacity
              onPress={onClose}
              className='mt-6 py-3 rounded-lg bg-teal w-full'
            >
              <Text className='font-bold text-white text-lg text-center'>
                OK
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export default AppNoticeModal
