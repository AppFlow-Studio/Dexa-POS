import { colors, switchTrackColors } from '@/lib/theme'
import { useColorScheme } from '@/lib/useColorScheme'
import React from 'react'
import { Switch, Text, View } from 'react-native'

interface SettingsHeaderProps {
  title: string
  value: boolean
  onValueChange: (value: boolean) => void
}

const SettingsHeader: React.FC<SettingsHeaderProps> = ({
  title,
  value,
  onValueChange
}) => {
  const { isDarkColorScheme } = useColorScheme()

  return (
    <View className='flex-row justify-between items-center'>
      <Text
        style={{
          fontSize: 18,
          fontWeight: '700',
          color: isDarkColorScheme ? '#E2E8F0' : '#0F172A'
        }}
      >
        {title}
      </Text>
      <Switch
        value={value}
        onValueChange={onValueChange}
        trackColor={switchTrackColors}
        thumbColor={
          value ? colors.success : isDarkColorScheme ? '#64748B' : '#CBD5E1'
        }
      />
    </View>
  )
}

export default SettingsHeader
