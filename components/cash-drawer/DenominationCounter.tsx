/**
 * DenominationCounter
 *
 * Rows per denomination with quantity input and running total.
 * Used for both opening and closing cash drawer counts.
 */

import { colors } from '@/lib/theme'
import { US_DENOMINATIONS } from '@/services/cashDrawerService'
import { DenominationCount } from '@/stores/useCashDrawerStore'
import { formatCurrency } from '@/utils/currency'
import { Minus, Plus } from 'lucide-react-native'
import React, { useCallback, useMemo, useState } from 'react'
import { Text, TextInput, TouchableOpacity, View } from 'react-native'

interface DenominationCounterProps {
  onTotalChange: (total: number, details: DenominationCount[]) => void
  initialCounts?: DenominationCount[]
}

const DenominationCounter: React.FC<DenominationCounterProps> = ({
  onTotalChange,
  initialCounts
}) => {
  const [counts, setCounts] = useState<Record<string, number>>(() => {
    const initial: Record<string, number> = {}
    for (const d of US_DENOMINATIONS) {
      const existing = initialCounts?.find(
        c => c.denomination === d.denomination
      )
      initial[d.denomination] = existing?.count ?? 0
    }
    return initial
  })

  const denominations = useMemo(() => {
    return US_DENOMINATIONS.map(d => {
      const count = counts[d.denomination] || 0
      const denomValue = parseFloat(d.denomination)
      return {
        ...d,
        count,
        total: count * denomValue
      }
    })
  }, [counts])

  const grandTotal = useMemo(() => {
    return denominations.reduce((sum, d) => sum + d.total, 0)
  }, [denominations])

  const updateCount = useCallback(
    (denomination: string, newCount: number) => {
      const sanitized = Math.max(0, Math.floor(newCount))
      setCounts(prev => {
        const next = { ...prev, [denomination]: sanitized }
        // Calculate new total and details
        const details: DenominationCount[] = US_DENOMINATIONS.map(d => {
          const c = next[d.denomination] || 0
          return {
            ...d,
            count: c,
            total: c * parseFloat(d.denomination)
          }
        })
        const total = details.reduce((s, d) => s + d.total, 0)
        // Defer to avoid setState-during-render
        setTimeout(() => onTotalChange(total, details), 0)
        return next
      })
    },
    [onTotalChange]
  )

  return (
    <View>
      {/* Header */}
      <View className='flex-row items-center px-3 py-2 mb-1'>
        <Text
          className='flex-1 text-sm font-semibold'
          style={{ color: colors.label }}
        >
          Denomination
        </Text>
        <Text
          className='w-24 text-center text-sm font-semibold'
          style={{ color: colors.label }}
        >
          Count
        </Text>
        <Text
          className='w-24 text-right text-sm font-semibold'
          style={{ color: colors.label }}
        >
          Total
        </Text>
      </View>

      {/* Rows */}
      {denominations.map(d => (
        <View
          key={d.denomination}
          className='flex-row items-center px-3 py-2'
          style={{ borderBottomWidth: 1, borderBottomColor: colors.border }}
        >
          <Text className='flex-1 text-base' style={{ color: colors.heading }}>
            {d.label}
          </Text>

          {/* Count Controls */}
          <View className='flex-row items-center w-24 justify-center gap-1'>
            <TouchableOpacity
              onPress={() => updateCount(d.denomination, d.count - 1)}
              className='w-8 h-8 items-center justify-center rounded-md'
              style={{
                backgroundColor: d.count > 0 ? colors.danger : colors.border,
                opacity: d.count > 0 ? 1 : 0.45
              }}
              disabled={d.count <= 0}
            >
              <Minus size={14} color={colors.onSolid} />
            </TouchableOpacity>

            <TextInput
              value={String(d.count)}
              onChangeText={text => {
                const num = parseInt(text, 10)
                if (!isNaN(num)) updateCount(d.denomination, num)
                else if (text === '') updateCount(d.denomination, 0)
              }}
              keyboardType='number-pad'
              className='w-12 h-8 text-center text-base rounded-md'
              underlineColorAndroid='transparent'
              placeholderTextColor={colors.muted}
              style={{
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.border,
                color: colors.heading,
                paddingVertical: 0,
                lineHeight: 19,
                textAlignVertical: 'center',
                includeFontPadding: false
              }}
              selectTextOnFocus
            />

            <TouchableOpacity
              onPress={() => updateCount(d.denomination, d.count + 1)}
              className='w-8 h-8 items-center justify-center rounded-md'
              style={{ backgroundColor: colors.teal }}
            >
              <Plus size={14} color={colors.onSolid} />
            </TouchableOpacity>
          </View>

          <Text
            className='w-24 text-right text-base'
            style={{ color: colors.heading }}
          >
            {formatCurrency(d.total)}
          </Text>
        </View>
      ))}

      {/* Grand Total */}
      <View
        className='flex-row items-center px-3 py-3 mt-1 rounded-lg'
        style={{
          backgroundColor: colors.card,
          borderWidth: 1,
          borderColor: colors.border
        }}
      >
        <Text
          className='flex-1 text-lg font-bold'
          style={{ color: colors.heading }}
        >
          Total
        </Text>
        <Text className='text-xl font-bold' style={{ color: colors.teal }}>
          {formatCurrency(grandTotal)}
        </Text>
      </View>
    </View>
  )
}

export default DenominationCounter
