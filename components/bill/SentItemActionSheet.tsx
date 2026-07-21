import { colors } from '@/lib/theme'
import { CartItem } from '@/lib/types'
import {
  ArrowRightLeft,
  Ban,
  Gift,
  RotateCcw,
  X
} from 'lucide-react-native'
import React, { useState } from 'react'
import { Modal, Pressable, Text, TouchableOpacity, View } from 'react-native'

interface SentItemActionSheetProps {
  item: CartItem | null
  seatCount: number
  onVoid: (item: CartItem) => void
  onComp: (item: CartItem) => void
  onRefire: (item: CartItem) => void
  onMoveToSeat: (item: CartItem, seat: number | null) => void
  onClose: () => void
}

const ActionRow = ({
  icon,
  label,
  color,
  onPress,
  sublabel,
}: {
  icon: React.ReactNode
  label: string
  color: string
  onPress: () => void
  sublabel?: string
}) => (
  <TouchableOpacity
    onPress={onPress}
    style={{
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 14,
      paddingVertical: 11,
      borderRadius: 8,
    }}
    activeOpacity={0.7}
  >
    {icon}
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 13, fontWeight: '600', color }}>{label}</Text>
      {sublabel && (
        <Text style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>{sublabel}</Text>
      )}
    </View>
  </TouchableOpacity>
)

const SentItemActionSheet: React.FC<SentItemActionSheetProps> = ({
  item,
  seatCount,
  onVoid,
  onComp,
  onRefire,
  onMoveToSeat,
  onClose,
}) => {
  const [showSeatPicker, setShowSeatPicker] = useState(false)

  if (!item) return null

  const currentSeat = item.seatNumber ?? null

  // Build seat options (1..seatCount + Shared), excluding current seat
  const seatOptions: { label: string; value: number | null }[] = []
  for (let i = 1; i <= seatCount; i++) {
    if (i !== currentSeat) {
      seatOptions.push({ label: `Seat ${i}`, value: i })
    }
  }
  if (currentSeat !== null) {
    seatOptions.push({ label: 'Shared', value: null })
  }

  return (
    <Modal transparent animationType='fade' visible onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'center', alignItems: 'center' }}
        onPress={onClose}
      >
        <Pressable
          style={{
            backgroundColor: colors.panel,
            borderRadius: 14,
            width: 260,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 6 },
            shadowOpacity: 0.35,
            shadowRadius: 12,
            elevation: 10,
            overflow: 'hidden',
          }}
          onPress={e => e.stopPropagation()}
        >
          {/* Header */}
          <View style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 14,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.screen,
          }}>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 13, fontWeight: '700', color: colors.heading }} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={{ fontSize: 10, color: colors.muted, marginTop: 1 }}>
                Qty {item.quantity} · ${(item.price * item.quantity).toFixed(2)}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={{ padding: 4 }}>
              <X size={16} color={colors.muted} />
            </TouchableOpacity>
          </View>

          {!showSeatPicker ? (
            /* Main actions */
            <View style={{ paddingVertical: 4 }}>
              <ActionRow
                icon={<Ban size={15} color={colors.danger} />}
                label="Void Item"
                color={colors.danger}
                sublabel="Remove with reason (kitchen notified)"
                onPress={() => { onClose(); onVoid(item) }}
              />
              <ActionRow
                icon={<Gift size={15} color='#f59e0b' />}
                label="Comp Item"
                color='#f59e0b'
                sublabel="Zero price, keep on ticket"
                onPress={() => { onClose(); onComp(item) }}
              />
              <ActionRow
                icon={<RotateCcw size={15} color={colors.teal} />}
                label="Re-fire to Kitchen"
                color={colors.teal}
                sublabel="Resend as new (resets kitchen status)"
                onPress={() => { onClose(); onRefire(item) }}
              />
              {seatCount > 1 && (
                <ActionRow
                  icon={<ArrowRightLeft size={15} color={colors.label} />}
                  label="Move to Seat"
                  color={colors.heading}
                  sublabel={currentSeat ? `Currently Seat ${currentSeat}` : 'Currently Shared'}
                  onPress={() => setShowSeatPicker(true)}
                />
              )}
            </View>
          ) : (
            /* Seat picker */
            <View style={{ paddingVertical: 4 }}>
              <View style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
                <Text style={{ fontSize: 11, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.8 }}>
                  Move to...
                </Text>
              </View>
              {seatOptions.map(opt => (
                <TouchableOpacity
                  key={opt.value ?? 'shared'}
                  onPress={() => {
                    onClose()
                    onMoveToSeat(item, opt.value)
                  }}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 10,
                    borderRadius: 8,
                  }}
                  activeOpacity={0.7}
                >
                  <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>{opt.label}</Text>
                </TouchableOpacity>
              ))}
              <TouchableOpacity
                onPress={() => setShowSeatPicker(false)}
                style={{ paddingHorizontal: 14, paddingVertical: 8, alignItems: 'center' }}
              >
                <Text style={{ fontSize: 11, fontWeight: '600', color: colors.muted }}>Back</Text>
              </TouchableOpacity>
            </View>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  )
}

export default SentItemActionSheet
