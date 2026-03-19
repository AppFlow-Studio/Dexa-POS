import { colors } from '@/lib/theme'
import React from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { Delete } from 'lucide-react-native'

interface GuestCountNumpadProps {
  onKeyPress: (value: string) => void
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'backspace']
]

const GuestCountNumpad: React.FC<GuestCountNumpadProps> = ({ onKeyPress }) => {
  return (
    <View style={{ gap: 8 }}>
      {ROWS.map((row, rowIdx) => (
        <View key={rowIdx} style={{ flexDirection: 'row', gap: 8 }}>
          {row.map(btn => {
            const isBackspace = btn === 'backspace'
            const isClear = btn === 'clear'
            const isSpecial = isBackspace || isClear

            return (
              <TouchableOpacity
                key={btn}
                onPress={() => onKeyPress(btn)}
                activeOpacity={0.65}
                style={{
                  flex: 1,
                  height: 56,
                  borderRadius: 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  backgroundColor: isBackspace
                    ? colors.danger + '18'
                    : isClear
                    ? colors.card
                    : colors.card,
                  borderWidth: 1,
                  borderColor: isBackspace
                    ? colors.danger + '40'
                    : colors.border
                }}
              >
                {isBackspace ? (
                  <Delete size={18} color={colors.danger} />
                ) : (
                  <Text style={{
                    fontSize: isClear ? 13 : 20,
                    fontWeight: isClear ? '600' : '700',
                    color: isClear ? colors.label : colors.heading
                  }}>
                    {isClear ? 'C' : btn}
                  </Text>
                )}
              </TouchableOpacity>
            )
          })}
        </View>
      ))}
    </View>
  )
}

export default GuestCountNumpad
