import { colors } from '@/lib/theme'
import { useUiScale } from '@/lib/uiScale'
import React from 'react'
import { Text, View } from 'react-native'

const SettingsCard = ({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  return (
    <View
      style={{
        backgroundColor: colors.panel,
        padding: s(16),
        borderRadius: s(16),
        borderWidth: 1,
        borderColor: colors.border
      }}
    >
      <Text
        style={{
          fontSize: s(22),
          fontWeight: '700',
          color: colors.heading,
          marginBottom: s(12)
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  )
}

export default SettingsCard
