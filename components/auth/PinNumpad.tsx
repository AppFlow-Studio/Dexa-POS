import { colors } from '@/lib/theme'
import { Delete, X } from 'lucide-react-native'
import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'

export type NumpadAction = 'clear' | 'backspace'
export type NumpadInput = number | NumpadAction

interface PinNumpadProps {
  onKeyPress: (input: NumpadInput) => void
  showDecimalKey?: boolean
  onDecimalPress?: () => void
}

const PinButton = ({
  value,
  onPress,
  isAction
}: {
  value: React.ReactNode
  onPress: () => void
  isAction?: boolean
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.6}
    style={{
      width: 80,
      height: 64,
      backgroundColor: isAction ? colors.screen : colors.card,
      borderWidth: isAction ? 0 : 1,
      borderColor: colors.border,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center'
    }}
  >
    {typeof value === 'string' ? (
      <Text style={{ fontSize: 20, fontWeight: '700', color: colors.heading }}>
        {value}
      </Text>
    ) : (
      value
    )}
  </TouchableOpacity>
)

const PinNumpad: React.FC<PinNumpadProps> = ({
  onKeyPress,
  showDecimalKey = false,
  onDecimalPress
}) => {
  const numpadLayout = [
    '1',
    '2',
    '3',
    '4',
    '5',
    '6',
    '7',
    '8',
    '9',
    showDecimalKey
      ? '.'
      : { icon: <X color={colors.muted} size={18} />, action: 'clear' },
    '0',
    { icon: <Delete color={colors.label} size={18} />, action: 'backspace' }
  ]

  const rows = [
    numpadLayout.slice(0, 3),
    numpadLayout.slice(3, 6),
    numpadLayout.slice(6, 9),
    numpadLayout.slice(9, 12)
  ]

  return (
    <View style={{ gap: 10, alignSelf: 'center' }}>
      {rows.map((row, rowIndex) => (
        <View key={rowIndex} style={{ flexDirection: 'row', gap: 10 }}>
          {row.map((item, colIndex) => {
            const index = rowIndex * 3 + colIndex
            if (typeof item === 'string') {
              if (item === '.') {
                return (
                  <PinButton
                    key={index}
                    value={item}
                    onPress={() => onDecimalPress?.()}
                  />
                )
              }

              return (
                <PinButton
                  key={index}
                  value={item}
                  onPress={() => onKeyPress(parseInt(item, 10))}
                />
              )
            }
            return (
              <PinButton
                key={index}
                value={item.icon}
                isAction
                onPress={() => onKeyPress(item.action as NumpadAction)}
              />
            )
          })}
        </View>
      ))}
    </View>
  )
}

export default PinNumpad
