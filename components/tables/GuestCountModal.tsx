import { colors } from '@/lib/theme'
import { Delete, Users } from 'lucide-react-native'
import React, { useEffect, useState } from 'react'
import { Modal, Text, TouchableOpacity, View } from 'react-native'

interface GuestCountModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (guestCount: number) => void
}

const ROWS = [
  ['1', '2', '3'],
  ['4', '5', '6'],
  ['7', '8', '9'],
  ['clear', '0', 'backspace'],
]


export const GuestCountModal: React.FC<GuestCountModalProps> = ({ isOpen, onClose, onSubmit }) => {
  const [count, setCount] = useState('')

  useEffect(() => {
    if (isOpen) {
      setCount('')
    }
  }, [isOpen])

  const handleKey = (value: string) => {
    if (value === 'clear') { setCount(''); return }
    if (value === 'backspace') {
      setCount(prev => prev.slice(0, -1))
      return
    }
    if (/^[0-9]$/.test(value)) {
      setCount(prev => {
        const next = prev === '0' ? value : prev + value
        return next.length > 3 ? prev : next
      })
    }
  }

  const handleSubmit = () => {
    const n = parseInt(count, 10)
    if (!isNaN(n) && n > 0) onSubmit(n)
  }

  const displayCount = count === '' ? 0 : parseInt(count, 10) || 0

  return (
    <Modal visible={isOpen} transparent animationType='fade' onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.65)', alignItems: 'center', justifyContent: 'center' }}>
        <View style={{ width: 380, backgroundColor: colors.panel, borderRadius: 20, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' }}>

          {/* Header */}
          <View style={{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 14, alignItems: 'center', borderBottomWidth: 1, borderBottomColor: colors.border }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: colors.teal + '18', borderWidth: 1, borderColor: colors.teal + '40', alignItems: 'center', justifyContent: 'center' }}>
                <Users size={14} color={colors.teal} />
              </View>
              <Text style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}>Party Size</Text>
            </View>
          </View>

          {/* Display */}
          <View style={{ paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10 }}>
            <View style={{ backgroundColor: colors.screen, borderRadius: 14, borderWidth: 1, borderColor: displayCount > 0 ? colors.teal + '50' : colors.border, paddingVertical: 18, alignItems: 'center' }}>
              <Text style={{ fontSize: 56, fontWeight: '800', color: count === '' ? colors.muted : colors.heading, letterSpacing: -2, lineHeight: 60 }}>
                {count === '' ? '–' : count}
              </Text>
            </View>
          </View>


          {/* Numpad */}
          <View style={{ paddingHorizontal: 20, paddingBottom: 16, gap: 8 }}>
            {ROWS.map((row, ri) => (
              <View key={ri} style={{ flexDirection: 'row', gap: 8 }}>
                {row.map(btn => {
                  const isBackspace = btn === 'backspace'
                  const isClear = btn === 'clear'
                  return (
                    <TouchableOpacity
                      key={btn}
                      onPress={() => handleKey(btn)}
                      activeOpacity={0.6}
                      style={{
                        flex: 1, height: 54, borderRadius: 10,
                        alignItems: 'center', justifyContent: 'center',
                        backgroundColor: isBackspace ? colors.danger + '15' : isClear ? colors.screen : colors.card,
                        borderWidth: 1,
                        borderColor: isBackspace ? colors.danger + '35' : colors.border,
                      }}
                    >
                      {isBackspace
                        ? <Delete size={16} color={colors.danger} />
                        : <Text style={{ fontSize: isClear ? 13 : 20, fontWeight: '600', color: isClear ? colors.muted : colors.heading }}>
                            {isClear ? 'C' : btn}
                          </Text>
                      }
                    </TouchableOpacity>
                  )
                })}
              </View>
            ))}
          </View>

          {/* Actions */}
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderTopColor: colors.border }}>
            <TouchableOpacity
              onPress={onClose}
              activeOpacity={0.7}
              style={{ flex: 1, paddingVertical: 16, alignItems: 'center', borderRightWidth: 1, borderRightColor: colors.border }}
            >
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.label }}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={displayCount > 0 ? handleSubmit : undefined}
              activeOpacity={displayCount > 0 ? 0.7 : 1}
              style={{ flex: 2, paddingVertical: 16, alignItems: 'center', backgroundColor: displayCount > 0 ? colors.teal + '18' : colors.screen }}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: displayCount > 0 ? colors.teal : colors.muted }}>
                {displayCount > 0 ? `Seat ${displayCount} ${displayCount === 1 ? 'Guest' : 'Guests'}` : 'Enter Guest Count'}
              </Text>
            </TouchableOpacity>
          </View>

        </View>
      </View>
    </Modal>
  )
}
