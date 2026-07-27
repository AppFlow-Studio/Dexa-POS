import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { AlertTriangle } from 'lucide-react-native'
import { Modal, Text, TouchableOpacity, View } from 'react-native'

interface KickedOutModalProps {
  visible: boolean
  kickedBy: string | null
  kickReason: string | null
  title?: string | null
  message?: string | null
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
  title,
  message,
  countdown,
  onAcknowledge
}: KickedOutModalProps) {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const displayTitle = title ?? 'Session Taken Over'
  const displayMessage =
    message ??
    (kickedBy
      ? `${kickedBy} has taken over this station.`
      : 'Another user has taken over this station.')

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
          paddingHorizontal: s(24)
        }}
      >
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: s(16),
            padding: s(24),
            width: '100%',
            maxWidth: s(480),
            borderWidth: 2,
            borderColor: colors.danger
          }}
        >
          {/* Icon */}
          <View style={{ alignItems: 'center', marginBottom: s(16) }}>
            <View
              style={{
                backgroundColor: colors.danger + '20',
                padding: s(16),
                borderRadius: 999
              }}
            >
              <AlertTriangle size={s(48)} color={colors.danger} />
            </View>
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: s(24),
              fontWeight: 'bold',
              color: colors.danger,
              textAlign: 'center',
              marginBottom: s(8)
            }}
          >
            {displayTitle}
          </Text>

          {/* Message */}
          <Text
            style={{
              fontSize: s(16),
              color: colors.heading,
              textAlign: 'center',
              marginBottom: s(16)
            }}
          >
            {displayMessage}
          </Text>

          {kickReason && (
            <Text
              style={{
                fontSize: s(14),
                color: colors.label,
                textAlign: 'center',
                marginBottom: s(16)
              }}
            >
              Reason: {kickReason}
            </Text>
          )}

          {/* Countdown */}
          <View
            style={{
              backgroundColor: colors.danger + '10',
              borderRadius: s(8),
              padding: s(16),
              marginBottom: s(24)
            }}
          >
            <Text style={{ textAlign: 'center', color: colors.label }}>
              You will be logged out in
            </Text>
            <Text
              style={{
                fontSize: s(36),
                fontWeight: 'bold',
                color: colors.danger,
                textAlign: 'center'
              }}
            >
              {countdown}
            </Text>
            <Text
              style={{ textAlign: 'center', color: colors.label, fontSize: s(12) }}
            >
              seconds
            </Text>
          </View>

          {/* Acknowledge Button */}
          <TouchableOpacity
            onPress={onAcknowledge}
            style={{
              backgroundColor: colors.danger,
              paddingVertical: s(12),
              borderRadius: s(8)
            }}
          >
            <Text
              style={{
                fontSize: s(16),
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
