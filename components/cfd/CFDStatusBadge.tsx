// src/components/cfd/CFDStatusBadge.tsx
import { useCFD } from '@/hooks/useCFD'
import { colors } from '@/lib/theme'
import { Monitor, MonitorOff } from 'lucide-react-native'
import { Pressable, Text } from 'react-native'

interface CFDStatusBadgeProps {
  onPress?: () => void
}

export function CFDStatusBadge ({ onPress }: CFDStatusBadgeProps) {
  const { isConnected, clientCount, serverInfo } = useCFD()

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        backgroundColor: colors.panel,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 6
      }}
    >
      {isConnected ? (
        <Monitor size={16} color={colors.success} />
      ) : (
        <MonitorOff size={16} color={colors.muted} />
      )}
      <Text
        style={{
          fontSize: 12,
          color: isConnected ? colors.success : colors.label
        }}
      >
        {isConnected ? `CFD (${clientCount})` : 'CFD'}
      </Text>
    </Pressable>
  )
}
