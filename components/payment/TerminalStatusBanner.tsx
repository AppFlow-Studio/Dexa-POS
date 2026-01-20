import { AlertCircle, AlertTriangle, Loader2, RefreshCcw } from 'lucide-react-native';
import { Text, TouchableOpacity, View } from 'react-native';
import Animated, { FadeIn } from 'react-native-reanimated';

export type TerminalStatus = 'checking' | 'online' | 'offline' | 'not-configured';

export interface TerminalStatusBannerProps {
  status: TerminalStatus;
  errorMessage?: string;
  onRetry?: () => void;
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
export function TerminalStatusBanner({
  status,
  errorMessage,
  onRetry,
}: TerminalStatusBannerProps) {
  // Don't show banner when terminal is online
  if (status === 'online') {
    return null;
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
          icon: <AlertCircle size={20} color="#FB923C" />,
          message:
            errorMessage || 'Terminal offline. Please check device connection.',
          showRetry: true,
        };
      case 'not-configured':
        return {
          bgColor: 'bg-yellow-900/20',
          borderColor: 'border-yellow-500',
          textColor: 'text-yellow-400',
          icon: <AlertTriangle size={20} color="#FBBF24" />,
          message:
            errorMessage || 'No payment terminal selected. Please select a terminal in settings.',
          showRetry: false,
        };
      default:
        return {
          bgColor: 'bg-gray-900/20',
          borderColor: 'border-gray-500',
          textColor: 'text-gray-400',
          icon: <AlertCircle size={20} color="#9CA3AF" />,
          message: errorMessage || 'Unknown terminal status',
          showRetry: false,
        };
    }
  };

  const config = getStatusConfig();

  return (
    <Animated.View
      entering={FadeIn.duration(200)}
      className={`p-4 rounded-xl border flex-row items-center gap-3 ${config.bgColor} ${config.borderColor}`}
    >
      {/* Status Icon */}
      <View className="flex-shrink-0">{config.icon}</View>

      {/* Message */}
      <Text className={`flex-1 font-medium ${config.textColor}`}>
        {config.message}
      </Text>

      {/* Retry Button */}
      {config.showRetry && onRetry && (
        <TouchableOpacity
          onPress={onRetry}
          className="flex-shrink-0 bg-orange-600/20 px-3 py-2 rounded-lg border border-orange-500/30 active:bg-orange-600/30"
        >
          <View className="flex-row items-center gap-2">
            <RefreshCcw size={16} color="#FB923C" />
            <Text className="text-orange-400 font-semibold text-sm">Retry</Text>
          </View>
        </TouchableOpacity>
      )}
    </Animated.View>
  );
}
