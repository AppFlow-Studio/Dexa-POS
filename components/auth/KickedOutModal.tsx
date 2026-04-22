import { colors } from '@/lib/theme'
import { AlertTriangle } from 'lucide-react-native'
import { Modal, Text, TouchableOpacity, View } from 'react-native'

interface KickedOutModalProps {
  visible: boolean
  kickedBy: string | null
  kickReason: string | null
  countdown: number
  onAcknowledge: () => void
}

/**
 * Modal that displays when the user's session is taken over by another device.
 * Shows a countdown before automatic logout.
 */
export function KickedOutModal ({
  visible,
  kickedBy,
  kickReason,
  countdown,
  onAcknowledge
}: KickedOutModalProps) {
  return (
    <Modal
      visible={visible}
      transparent
      animationType='fade'
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.7)',
          alignItems: 'center',
          justifyContent: 'center',
          paddingHorizontal: 24
        }}
      >
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 16,
            padding: 24,
            width: '100%',
            maxWidth: 480,
            borderWidth: 2,
            borderColor: colors.danger
          }}
        >
          {/* Icon */}
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View
              style={{
                backgroundColor: colors.danger + '20',
                padding: 16,
                borderRadius: 999
              }}
            >
              <AlertTriangle size={48} color={colors.danger} />
            </View>
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 24,
              fontWeight: 'bold',
              color: colors.danger,
              textAlign: 'center',
              marginBottom: 8
            }}
          >
            Session Taken Over
          </Text>

          {/* Message */}
          <Text
            style={{
              fontSize: 16,
              color: colors.heading,
              textAlign: 'center',
              marginBottom: 16
            }}
          >
            {kickedBy
              ? `${kickedBy} has taken over this station.`
              : 'Another user has taken over this station.'}
          </Text>

          {kickReason && (
            <Text
              style={{
                fontSize: 14,
                color: colors.label,
                textAlign: 'center',
                marginBottom: 16
              }}
            >
              Reason: {kickReason}
            </Text>
          )}

          {/* Countdown */}
          <View
            style={{
              backgroundColor: colors.danger + '10',
              borderRadius: 8,
              padding: 16,
              marginBottom: 24
            }}
          >
            <Text style={{ textAlign: 'center', color: colors.label }}>
              You will be logged out in
            </Text>
            <Text
              style={{
                fontSize: 36,
                fontWeight: 'bold',
                color: colors.danger,
                textAlign: 'center'
              }}
            >
              {countdown}
            </Text>
            <Text
              style={{ textAlign: 'center', color: colors.label, fontSize: 12 }}
            >
              seconds
            </Text>
          </View>

          {/* Acknowledge Button */}
          <TouchableOpacity
            onPress={onAcknowledge}
            style={{
              backgroundColor: colors.danger,
              paddingVertical: 12,
              borderRadius: 8
            }}
          >
            <Text
              style={{
                fontSize: 16,
                fontWeight: '600',
                color: colors.onSolid,
                textAlign: 'center'
              }}
            >
              OK, Log Me Out Now
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  )
}
