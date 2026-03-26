import { colors } from '@/lib/theme'
import { PreviousOrder } from '@/lib/types'
import { formatCurrency } from '@/utils/currency'
import React, { useMemo } from 'react'
import { Text, View } from 'react-native'

interface SummaryCardsProps {
  order: PreviousOrder
}

const SummaryCards: React.FC<SummaryCardsProps> = ({ order }) => {
  const tipTotal = useMemo(() => {
    if (!order.payments) return 0
    return order.payments
      .filter(p => !p.isVoided)
      .reduce((sum, p) => sum + (p.tip_amount || 0), 0)
  }, [order.payments])

  const balanceDue = order.amount_due || 0

  return (
    <View style={{ gap: 10 }}>
      {/* 2-column grid */}
      <View className='flex-row flex-wrap gap-2.5'>
        <SummaryCard label='Order Total' value={order.total} />
        <SummaryCard label='Amount Paid' value={order.amount_paid || 0} />
        <SummaryCard label='Tips' value={tipTotal} />
        <SummaryCard
          label='Refunded'
          value={order.refundedAmount || 0}
          textColor={colors.danger}
          accentColor={colors.danger}
        />
      </View>

      {/* Full-width balance due card (only if > 0) */}
      {balanceDue > 0 && (
        <View
          className='rounded-xl p-3'
          style={{
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.teal + '40'
          }}
        >
          <Text
            style={{
              fontSize: 11,
              color: colors.teal,
              marginBottom: 2,
              fontWeight: '600',
              textTransform: 'uppercase',
              letterSpacing: 0.5
            }}
          >
            Balance Due
          </Text>
          <Text style={{ fontSize: 18, fontWeight: '700', color: colors.teal }}>
            {formatCurrency(balanceDue)}
          </Text>
        </View>
      )}
    </View>
  )
}

const SummaryCard = ({
  label,
  value,
  textColor = colors.heading,
  accentColor = colors.teal
}: {
  label: string
  value: number
  textColor?: string
  accentColor?: string
}) => (
  <View
    style={{
      backgroundColor: colors.panel,
      borderRadius: 12,
      padding: 12,
      borderWidth: 1,
      borderColor: colors.border,
      width: '48%',
      flexGrow: 1
    }}
  >
    <View
      style={{
        width: 26,
        height: 3,
        borderRadius: 2,
        backgroundColor: accentColor,
        marginBottom: 8
      }}
    />
    <Text
      style={{
        fontSize: 11,
        color: colors.label,
        marginBottom: 3,
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        fontWeight: '600'
      }}
    >
      {label}
    </Text>
    <Text style={{ fontSize: 17, fontWeight: '700', color: textColor }}>
      {formatCurrency(value)}
    </Text>
  </View>
)

export default React.memo(SummaryCards)
