import { colors } from '@/lib/theme'
import { AlertTriangle } from 'lucide-react-native'
import React from 'react'
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native'

interface ClaimOrderModalProps {
  visible: boolean
  /** Display name of the station that currently owns the order. */
  sourceStationName?: string | null
  isClaiming?: boolean
  onConfirm: () => void
  onCancel: () => void
}

/**
 * Confirmation before a station claims an order owned elsewhere. We pause for
 * confirmation rather than auto-claiming so the cashier knows the other station
 * will lose edit access.
 */
const ClaimOrderModal: React.FC<ClaimOrderModalProps> = ({
  visible,
  sourceStationName,
  isClaiming,
  onConfirm,
  onCancel
}) => {
  const stationLabel = sourceStationName?.trim() || 'another station'

  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      onRequestClose={onCancel}
    >
      <Pressable
        onPress={isClaiming ? undefined : onCancel}
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.5)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: '100%',
            maxWidth: 420,
            borderRadius: 16,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: colors.panel,
            overflow: 'hidden'
          }}
        >
          <View style={{ padding: 18, gap: 10 }}>
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
            >
              <View
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 9,
                  backgroundColor: colors.warning + '20',
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <AlertTriangle size={16} color={colors.warning} />
              </View>
              <Text
                style={{
                  fontSize: 15,
                  fontWeight: '700',
                  color: colors.heading
                }}
              >
                Take over this check?
              </Text>
            </View>
            <Text style={{ fontSize: 13, color: colors.label, lineHeight: 19 }}>
              {stationLabel} will lose edit access. Their in-flight changes may
              fail to save until they take it back.
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              gap: 8,
              padding: 12,
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.screen
            }}
          >
            <TouchableOpacity
              onPress={onCancel}
              disabled={isClaiming}
              style={{
                flex: 1,
                paddingVertical: 10,
                alignItems: 'center',
                borderRadius: 10,
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: isClaiming ? 0.6 : 1
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '600',
                  color: colors.label
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              disabled={isClaiming}
              style={{
                flex: 1,
                paddingVertical: 10,
                alignItems: 'center',
                borderRadius: 10,
                backgroundColor: colors.teal,
                opacity: isClaiming ? 0.6 : 1
              }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: colors.onSolid
                }}
              >
                {isClaiming ? 'Taking over…' : 'Take Over'}
              </Text>
            </TouchableOpacity>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export default React.memo(ClaimOrderModal)
