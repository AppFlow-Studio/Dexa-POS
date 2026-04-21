import { colors } from '@/lib/theme'
import React from 'react'
import { Text, View } from 'react-native'

const SettingsCard = ({
  title,
  children
}: {
  title: string
  children: React.ReactNode
}) => (
  <View
    style={{
      backgroundColor: colors.panel,
      padding: 16,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border
    }}
  >
    <Text
      style={{
        fontSize: 22,
        fontWeight: '700',
        color: colors.heading,
        marginBottom: 12
      }}
    >
      {title}
    </Text>
    {children}
  </View>
)

export default SettingsCard
