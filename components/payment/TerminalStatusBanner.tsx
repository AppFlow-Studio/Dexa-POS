import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { AlertCircle, AlertTriangle, RefreshCcw } from 'lucide-react-native'
import { Text, TouchableOpacity, View } from 'react-native'
import Animated, { FadeIn } from 'react-native-reanimated'

export type TerminalStatus =
  | 'checking'
  | 'online'
  | 'offline'
  | 'not-configured'

export interface TerminalStatusBannerProps {
  status: TerminalStatus
  errorMessage?: string
  onRetry?: () => void
}

/**
 * Reusable banner component to display terminal status warnings
 *
 * Shows different states:
 * - checking: Blue banner with loading spinner - "Checking terminal connection..."
 * - offline: Orange banner with AlertCircle icon - "Terminal offline. Please check device connection."
 * - not-configured: Yellow banner with AlertTriangle icon - "No payment terminal selected."
 * - online: Hidden (no banner shown for success state)
 */
export function TerminalStatusBanner ({
  status,
  errorMessage,
  onRetry
}: TerminalStatusBannerProps) {
  // Don't show banner when terminal is online
  if (status === 'online') {
    return null
  }

  // Determine styling and content based on status
  const getStatusConfig = () => {
    switch (status) {
      // case 'checking':
      //   return {
      //     bgColor: 'bg-blue-900/20',
      //     borderColor: 'border-blue-500',
      //     textColor: 'text-blue-400',
      //     icon: <Loader2 size={20} color="#60A5FA" className="animate-spin" />,
      //     message: 'Checking terminal connection...',
      //     showRetry: false,
      //   };
      case 'offline':
        return {
          bgColor: 'bg-orange-900/20',
          borderColor: 'border-orange-500',
          textColor: 'text-orange-400',
          icon: <AlertCircle size={20} color='#FB923C' />,
          message:
            errorMessage || 'Terminal offline. Please check device connection.',
          showRetry: true
        }
      case 'not-configured':
        return {
          bgColor: 'bg-yellow-900/20',
          borderColor: 'border-yellow-500',
          textColor: 'text-yellow-400',
          icon: <AlertTriangle size={20} color='#FBBF24' />,
          message:
            errorMessage ||
            'No payment terminal selected. Please select a terminal in settings.',
          showRetry: false
        }
      default:
        return {
          bgColor: 'bg-gray-900/20',
          borderColor: 'border-gray-500',
          textColor: 'text-gray-400',
          icon: <AlertCircle size={20} color='#9CA3AF' />,
          message: errorMessage || 'Unknown terminal status',
          showRetry: false
        }
    }
  }

  const config = getStatusConfig()

  // Map Tailwind color strings to theme colors
  const colorMapping: Record<
    string,
    { bg: string; border: string; text: string }
  > = {
    'bg-orange-900/20': {
      bg: colors.warning + '20',
      border: colors.warning + '50',
      text: colors.warning
    },
    'bg-yellow-900/20': {
      bg: colors.warning + '20',
      border: colors.warning + '50',
      text: colors.warning
    },
    'bg-gray-900/20': {
      bg: colors.muted + '20',
      border: colors.muted + '50',
      text: colors.muted
    }
  }

  const colorConfig = colorMapping[config.bgColor] || {
    bg: colors.muted + '20',
    border: colors.muted + '50',
    text: colors.muted
  }

  return (
    <Animated.View
      entering={iosOnly(FadeIn.duration(200))}
      style={{
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        backgroundColor: colorConfig.bg,
        borderColor: colorConfig.border
      }}
    >
      {/* Status Icon */}
      <View style={{ flexShrink: 0 }}>{config.icon}</View>

      {/* Message */}
      <Text style={{ flex: 1, fontWeight: '500', color: colorConfig.text }}>
        {config.message}
      </Text>

      {/* Retry Button */}
      {config.showRetry && onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          style={{
            flexShrink: 0,
            backgroundColor: colors.warning + '20',
            paddingHorizontal: 12,
            paddingVertical: 8,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.warning + '40'
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <RefreshCcw size={16} color={colors.warning} />
            <Text
              style={{ color: colors.warning, fontWeight: '600', fontSize: 13 }}
            >
              Retry
            </Text>
          </View>
        </TouchableOpacity>
      )}
    </Animated.View>
  )
}
