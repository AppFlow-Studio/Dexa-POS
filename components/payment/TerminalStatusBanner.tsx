import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import type { TerminalStatusReason } from '@/hooks/useTerminalStatus'
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
  /** Discriminated reason from useTerminalStatus — drives reason-specific copy. */
  reason?: TerminalStatusReason | null
  /** Consecutive manual-retry failures — at 3+ we surface the DHCP-drift hint. */
  consecutiveFailures?: number
  onRetry?: () => void
}

/**
 * Map a probe reason to an actionable message + optional subtitle.
 * Falls back to the raw errorMessage when reason is missing/unknown so the
 * banner still says something useful on unexpected errors.
 */
function getReasonCopy (
  reason: TerminalStatusReason | null | undefined,
  fallback: string | undefined
): { message: string; subtitle?: string } {
  switch (reason) {
    case 'tcp_timeout':
      return {
        message: 'Terminal is unreachable.',
        subtitle: 'Check that the terminal is powered on and on the same WiFi.'
      }
    case 'tcp_refused':
      return {
        message: 'Terminal is online but refusing connections.',
        subtitle: 'Restart the terminal, then tap Retry.'
      }
    case 'tcp_unreachable':
      return {
        message: 'Terminal is not on this network.',
        subtitle: 'Check the WiFi router and the terminal’s network settings.'
      }
    case 'no_ip_configured':
      return {
        message: 'No terminal IP configured.',
        subtitle: 'Set one in Settings › Payment Terminals.'
      }
    case 'usb_disconnected':
      return {
        message: 'USB terminal not detected.',
        subtitle: 'Re-plug the cable — this will reconnect automatically.'
      }
    case 'terminal_unresponsive':
      return {
        message: 'Terminal answered the network but the payment app isn’t responding.',
        subtitle: 'Restart the terminal, then tap Retry.'
      }
    case 'possible_dhcp_drift':
      return {
        message: fallback || 'Terminal IP isn’t responding from this network.',
        subtitle: 'The terminal may have been reassigned a new IP. Re-check Settings › Payment Terminals.'
      }
    case 'dejavoo_offline':
      return { message: 'Terminal is offline.', subtitle: 'Please check device connection.' }
    case 'dejavoo_not_found':
      return { message: 'Terminal not found on network.' }
    case 'dejavoo_error':
    case 'unknown':
    default:
      return { message: fallback || 'Terminal offline. Please check device connection.' }
  }
}

/**
 * Reusable banner component to display terminal status warnings
 *
 * Shows different states:
 * - checking: Blue banner with loading spinner - "Checking terminal connection..."
 * - offline: Orange banner with AlertCircle icon - reason-specific copy
 * - not-configured: Yellow banner with AlertTriangle icon - "No payment terminal selected."
 * - online: Hidden (no banner shown for success state)
 */
export function TerminalStatusBanner ({
  status,
  errorMessage,
  reason,
  consecutiveFailures = 0,
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
      case 'offline': {
        const copy = getReasonCopy(reason, errorMessage)
        return {
          bgColor: 'bg-orange-900/20',
          borderColor: 'border-orange-500',
          textColor: 'text-orange-400',
          icon: <AlertCircle size={20} color='#FB923C' />,
          message: copy.message,
          subtitle: copy.subtitle,
          showRetry: true
        }
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
          subtitle: undefined as string | undefined,
          showRetry: false
        }
      default:
        return {
          bgColor: 'bg-gray-900/20',
          borderColor: 'border-gray-500',
          textColor: 'text-gray-400',
          icon: <AlertCircle size={20} color='#9CA3AF' />,
          message: errorMessage || 'Unknown terminal status',
          subtitle: undefined as string | undefined,
          showRetry: false
        }
    }
  }

  const config = getStatusConfig()

  // After 3+ consecutive manual retry failures, append the DHCP-drift hint so
  // staff stop hammering Retry and check terminal config / power instead.
  const escalatedSubtitle =
    status === 'offline' && consecutiveFailures >= 3
      ? 'Check that the terminal is powered on, on the same WiFi, and that its IP hasn’t changed in Settings › Payment Terminals.'
      : config.subtitle

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

      {/* Message + optional subtitle */}
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontWeight: '500', color: colorConfig.text }}>
          {config.message}
        </Text>
        {escalatedSubtitle && (
          <Text
            style={{ fontWeight: '400', color: colorConfig.text, opacity: 0.85, fontSize: 12 }}
          >
            {escalatedSubtitle}
          </Text>
        )}
      </View>

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
