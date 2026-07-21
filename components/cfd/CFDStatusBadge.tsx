// src/components/cfd/CFDStatusBadge.tsx
import { useCFD } from '@/hooks/useCFD'
import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import { Monitor, MonitorOff } from 'lucide-react-native'
import { Pressable, Text } from 'react-native'

interface CFDStatusBadgeProps {
  onPress?: () => void
}

export function CFDStatusBadge ({ onPress }: CFDStatusBadgeProps) {
  const { isConnected, clientCount, serverInfo } = useCFD()
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(6),
        backgroundColor: colors.panel,
        paddingHorizontal: s(10),
        paddingVertical: s(6),
        borderRadius: s(6)
      }}
    >
      {isConnected ? (
        <Monitor size={s(16)} color={colors.success} />
      ) : (
        <MonitorOff size={s(16)} color={colors.muted} />
      )}
      <Text
        style={{
          fontSize: s(12),
          color: isConnected ? colors.success : colors.label
        }}
      >
        {isConnected ? `CFD (${clientCount})` : 'CFD'}
      </Text>
    </Pressable>
  )
}
