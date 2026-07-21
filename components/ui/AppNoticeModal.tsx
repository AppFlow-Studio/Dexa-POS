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
  variant = 'info',
}) => {
  const Icon = variant === 'error' ? CircleX : variant === 'warning' ? AlertTriangle : Bell

  const accentColor =
    variant === 'error' ? colors.danger : variant === 'warning' ? colors.warning : colors.teal

  return (
    <Modal visible={visible} transparent animationType='fade' onRequestClose={onClose}>
      <Pressable
        onPress={onClose}
        style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: 'rgba(0,0,0,0.6)' }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: 360,
            backgroundColor: colors.panel,
            borderRadius: 14,
            borderWidth: 1,
            borderColor: colors.border,
            overflow: 'hidden',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 8 },
            shadowOpacity: 0.4,
            shadowRadius: 20,
            elevation: 16,
          }}
        >
          {/* Accent top bar */}
          <View style={{ height: 3, backgroundColor: accentColor }} />

          <View style={{ padding: 20, alignItems: 'center' }}>
            {/* Icon box */}
            <View style={{
              width: 44, height: 44, borderRadius: 12,
              backgroundColor: accentColor + '18',
              borderWidth: 1, borderColor: accentColor + '40',
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 12,
            }}>
              <Icon size={20} color={accentColor} />
            </View>

            <Text style={{ fontSize: 14, fontWeight: '700', color: colors.heading, textAlign: 'center', marginBottom: 6 }}>
              {title}
            </Text>
            <Text style={{ fontSize: 12, color: colors.label, textAlign: 'center', lineHeight: 18 }}>
              {description}
            </Text>

            <TouchableOpacity
              onPress={onClose}
              style={{
                marginTop: 16, width: '100%', paddingVertical: 8, borderRadius: 8,
                alignItems: 'center',
                backgroundColor: accentColor + '20',
                borderWidth: 1, borderColor: accentColor + '50',
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: '600', color: accentColor }}>OK</Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export default AppNoticeModal
