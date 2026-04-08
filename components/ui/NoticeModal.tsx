import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from '@/components/ui/dialog'
import { colors } from '@/lib/theme'
import { AlertTriangle, Bell, CircleX } from 'lucide-react-native'
import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

interface NoticeModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  description: string
  buttonText?: string
  variant?: 'info' | 'warning' | 'error'
}

const NoticeModal: React.FC<NoticeModalProps> = ({
  isOpen,
  onClose,
  title,
  description,
  buttonText = 'OK',
  variant = 'info'
}) => {
  const accentClass =
    variant === 'error'
      ? 'bg-red-900/30 border-red-500/30'
      : variant === 'warning'
      ? 'bg-amber-900/30 border-amber-500/30'
      : 'bg-teal/20 border-teal/30'

  const accentColor =
    variant === 'error'
      ? colors.danger
      : variant === 'warning'
      ? colors.warning
      : colors.teal

  const Icon =
    variant === 'error' ? CircleX : variant === 'warning' ? AlertTriangle : Bell

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className='p-6 rounded-2xl bg-panel border border-gray-700 w-[480px]'>
        <View className='items-center'>
          <View
            className={`w-16 h-16 rounded-full items-center justify-center border-4 mb-4 ${accentClass}`}
          >
            <Icon color={accentColor} size={34} />
          </View>

          <DialogHeader className='items-center'>
            <DialogTitle className='text-2xl font-bold text-white text-center'>
              {title}
            </DialogTitle>
            <DialogDescription className='text-center text-gray-400 mt-2 text-lg'>
              {description}
            </DialogDescription>
          </DialogHeader>

          <DialogFooter className='pt-6 w-full'>
            <TouchableOpacity
              onPress={onClose}
              className='py-3 rounded-lg bg-teal w-full'
            >
              <Text className='font-bold text-white text-lg text-center'>
                {buttonText}
              </Text>
            </TouchableOpacity>
          </DialogFooter>
        </View>
      </DialogContent>
    </Dialog>
  )
}

export default NoticeModal
