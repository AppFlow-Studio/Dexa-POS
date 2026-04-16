import { TABLE_SHAPES } from '@/lib/table-shapes'
import { colors } from '@/lib/theme'
import React, { useState } from 'react'
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from 'react-native'

interface QuickSetupPanelProps {
  isOpen: boolean
  onClose: () => void
  onAddMultiple: (
    items: { shapeId: keyof typeof TABLE_SHAPES; quantity: number }[]
  ) => void
}

const ShapeInputRow = ({
  shape,
  onQuantityChange
}: {
  shape: typeof TABLE_SHAPES[keyof typeof TABLE_SHAPES] & { id: string }
  onQuantityChange: (shapeId: string, quantity: number) => void
}) => {
  const [quantity, setQuantity] = useState('0')

  const adjust = (delta: number) => {
    const next = Math.max(
      0,
      Math.min(99, (parseInt(quantity, 10) || 0) + delta)
    )
    setQuantity(String(next))
    onQuantityChange(shape.id, next)
  }

  const handleText = (text: string) => {
    const num = parseInt(text, 10)
    if (text === '' || (num >= 0 && num <= 99)) {
      setQuantity(text)
      onQuantityChange(shape.id, text === '' ? 0 : num)
    }
  }

  const qty = parseInt(quantity, 10) || 0

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 14,
        paddingVertical: 10,
        backgroundColor: colors.screen,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: qty > 0 ? colors.teal + '40' : colors.border
      }}
    >
      <View
        style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}
      >
        <View
          style={{ width: 56, alignItems: 'center', justifyContent: 'center' }}
        >
          <shape.component
            color={qty > 0 ? colors.teal : colors.label}
            height={26}
          />
        </View>
        <Text
          style={{
            color: qty > 0 ? colors.heading : colors.label,
            fontSize: 13,
            fontWeight: qty > 0 ? '600' : '400'
          }}
        >
          {shape.label}
        </Text>
      </View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          backgroundColor: colors.card,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: colors.border,
          overflow: 'hidden'
        }}
      >
        <TouchableOpacity
          onPress={() => adjust(-1)}
          style={{
            width: 30,
            height: 32,
            alignItems: 'center',
            justifyContent: 'center',
            borderRightWidth: 1,
            borderRightColor: colors.border
          }}
        >
          <Text
            style={{
              color: qty > 0 ? colors.label : colors.muted,
              fontSize: 16,
              fontWeight: '600'
            }}
          >
            −
          </Text>
        </TouchableOpacity>
        <TextInput
          value={quantity}
          onChangeText={handleText}
          keyboardType='number-pad'
          maxLength={2}
          style={{
            width: 36,
            height: 32,
            textAlign: 'center',
            color: qty > 0 ? colors.teal : colors.heading,
            fontSize: 13,
            fontWeight: '700',
            paddingVertical: 0,
            includeFontPadding: false
          }}
        />
        <TouchableOpacity
          onPress={() => adjust(1)}
          style={{
            width: 30,
            height: 32,
            alignItems: 'center',
            justifyContent: 'center',
            borderLeftWidth: 1,
            borderLeftColor: colors.border
          }}
        >
          <Text
            style={{ color: colors.label, fontSize: 16, fontWeight: '600' }}
          >
            +
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const QuickSetupPanel: React.FC<QuickSetupPanelProps> = ({
  isOpen,
  onClose,
  onAddMultiple
}) => {
  const [quantities, setQuantities] = useState<Record<string, number>>({})

  const handleQuantityChange = (shapeId: string, quantity: number) => {
    setQuantities(prev => ({ ...prev, [shapeId]: quantity }))
  }

  const handleApply = () => {
    const itemsToAdd = Object.entries(quantities)
      .filter(([, q]) => q > 0)
      .map(([shapeId, quantity]) => ({
        shapeId: shapeId as keyof typeof TABLE_SHAPES,
        quantity
      }))
    if (itemsToAdd.length > 0) onAddMultiple(itemsToAdd)
    onClose()
  }

  const totalTables = Object.values(quantities).reduce((sum, q) => sum + q, 0)

  const tableShapes = Object.entries(TABLE_SHAPES)
    .filter(([, data]) => data.type === 'table')
    .map(([shapeKey, data]) => ({ ...data, id: shapeKey }))

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType='fade'
      onRequestClose={onClose}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: 'rgba(0,0,0,0.6)',
          justifyContent: 'center',
          alignItems: 'center'
        }}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View
            style={{
              width: 520,
              backgroundColor: colors.card,
              borderRadius: 16,
              borderWidth: 1,
              borderColor: colors.border,
              overflow: 'hidden'
            }}
          >
            {/* Header */}
            <View
              style={{
                paddingHorizontal: 18,
                paddingVertical: 14,
                borderBottomWidth: 1,
                borderBottomColor: colors.border
              }}
            >
              <Text
                style={{
                  color: colors.heading,
                  fontSize: 14,
                  fontWeight: '700'
                }}
              >
                Quick Floor Setup
              </Text>
              <Text style={{ color: colors.muted, fontSize: 11, marginTop: 3 }}>
                Choose how many of each table type to add. You can rearrange
                them on the canvas afterwards.
              </Text>
            </View>

            {/* Shape list */}
            <ScrollView
              style={{ maxHeight: 400 }}
              contentContainerStyle={{ padding: 14, gap: 8 }}
            >
              {tableShapes.map(shape => (
                <ShapeInputRow
                  key={shape.id}
                  shape={shape}
                  onQuantityChange={handleQuantityChange}
                />
              ))}
            </ScrollView>

            {/* Footer */}
            <View
              style={{
                flexDirection: 'row',
                gap: 8,
                padding: 14,
                borderTopWidth: 1,
                borderTopColor: colors.border
              }}
            >
              <TouchableOpacity
                onPress={onClose}
                style={{
                  flex: 1,
                  paddingVertical: 10,
                  borderRadius: 9,
                  alignItems: 'center',
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.border
                }}
              >
                <Text
                  style={{
                    color: colors.label,
                    fontWeight: '600',
                    fontSize: 13
                  }}
                >
                  Blank Canvas
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleApply}
                style={{
                  flex: 2,
                  paddingVertical: 10,
                  borderRadius: 9,
                  alignItems: 'center',
                  backgroundColor: colors.teal + '20',
                  borderWidth: 1,
                  borderColor: colors.teal + '60',
                  opacity: totalTables === 0 ? 0.5 : 1
                }}
              >
                <Text
                  style={{
                    color: colors.teal,
                    fontWeight: '800',
                    fontSize: 13
                  }}
                >
                  {totalTables > 0
                    ? `Add ${totalTables} Table${totalTables !== 1 ? 's' : ''}`
                    : 'Add Tables'}
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  )
}

export default QuickSetupPanel
