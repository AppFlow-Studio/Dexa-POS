import { colors } from '@/lib/theme'
import { OrderProfile } from '@/lib/types'
import { CreditCard, DollarSign, X } from 'lucide-react-native'
import React, { useMemo } from 'react'
import { Text, View } from 'react-native'

interface PaymentTimelineSectionProps {
  order: OrderProfile
}

interface Payment {
  id?: string
  amount: number
  method: string
  cardBrand?: string
  last4?: string
  tip_amount?: number
  timestamp?: string
  isVoided?: boolean
  voidReason?: string
}

const PaymentCard: React.FC<{
  payment: Payment
  index: number
  isLast: boolean
}> = React.memo(({ payment, index, isLast }) => {
  const isVoided = payment.isVoided || false
  const paymentMethod = payment.method || 'Cash'
  const totalAmount = (payment.amount || 0) + (payment.tip_amount || 0)

  // Format timestamp
  const formattedTime = payment.timestamp
    ? new Date(payment.timestamp).toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'Unknown time'

  return (
    <View style={{ flexDirection: 'row' }}>
      {/* Timeline indicator */}
      <View style={{ alignItems: 'center', marginRight: 12 }}>
        <View
          style={{
            width: 32,
            height: 32,
            borderRadius: 16,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: isVoided
              ? colors.danger + '20'
              : colors.teal + '15',
            borderWidth: 1,
            borderColor: isVoided ? colors.danger + '50' : colors.teal + '40'
          }}
        >
          <View>
            {isVoided ? (
              <X color={colors.danger} size={16} />
            ) : paymentMethod.toLowerCase().includes('card') ? (
              <CreditCard color={colors.teal} size={16} />
            ) : (
              <DollarSign color={colors.teal} size={16} />
            )}
          </View>
        </View>
        {!isLast && (
          <View
            style={{
              width: 2,
              height: '100%',
              backgroundColor: colors.border,
              marginTop: 6
            }}
          />
        )}
      </View>

      {/* Payment details */}
      <View style={{ flex: 1, marginBottom: 10 }}>
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 10,
            borderWidth: 1,
            borderColor: colors.teal + '30',
            paddingHorizontal: 12,
            paddingVertical: 10,
            opacity: 1
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8
            }}
          >
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: '700',
                  color: isVoided ? colors.muted : colors.heading,
                  textDecorationLine: isVoided ? 'line-through' : 'none'
                }}
              >
                Payment #{index + 1}
              </Text>
              {isVoided && (
                <View
                  style={{
                    backgroundColor: colors.danger + '20',
                    borderWidth: 1,
                    borderColor: colors.danger + '50',
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    borderRadius: 20
                  }}
                >
                  <Text
                    style={{
                      color: colors.danger,
                      fontWeight: '600',
                      fontSize: 11
                    }}
                  >
                    VOIDED
                  </Text>
                </View>
              )}
            </View>
          </View>

          {/* Payment method and amount */}
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 8
            }}
          >
            <View>
              <Text
                style={{
                  fontSize: 12,
                  color: isVoided ? colors.muted : colors.label
                }}
              >
                {paymentMethod}
                {payment.cardBrand &&
                  payment.last4 &&
                  ` - ${payment.cardBrand} ****${payment.last4}`}
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginTop: 2 }}>
                {formattedTime}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text
                style={{
                  fontSize: 16,
                  fontWeight: '700',
                  color: isVoided ? colors.muted : colors.heading,
                  textDecorationLine: isVoided ? 'line-through' : 'none'
                }}
              >
                ${totalAmount.toFixed(2)}
              </Text>
              {payment.tip_amount && payment.tip_amount > 0 && (
                <Text
                  style={{
                    fontSize: 11,
                    color: isVoided ? colors.muted : colors.teal
                  }}
                >
                  Tip: ${payment.tip_amount.toFixed(2)}
                </Text>
              )}
            </View>
          </View>

          {/* Void reason */}
          {isVoided && payment.voidReason && (
            <View
              style={{
                marginTop: 6,
                backgroundColor: colors.danger + '15',
                borderWidth: 1,
                borderColor: colors.danger + '40',
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 6
              }}
            >
              <Text style={{ color: colors.danger, fontSize: 11 }}>
                Void Reason: {payment.voidReason}
              </Text>
            </View>
          )}
        </View>
      </View>
    </View>
  )
})

const PaymentTimelineSection: React.FC<PaymentTimelineSectionProps> = ({
  order
}) => {
  // Sort payments by timestamp (most recent first)
  const sortedPayments = useMemo(() => {
    const payments = (order.payments || []) as Payment[]
    return [...payments].sort((a, b) => {
      const aTime = a.timestamp ? new Date(a.timestamp).getTime() : 0
      const bTime = b.timestamp ? new Date(b.timestamp).getTime() : 0
      return bTime - aTime
    })
  }, [order.payments])

  if (!order.payments || order.payments.length === 0) {
    return (
      <View
        style={{
          paddingVertical: 24,
          alignItems: 'center',
          justifyContent: 'center'
        }}
      >
        <Text
          style={{ fontSize: 12, color: colors.label, textAlign: 'center' }}
        >
          No payment history available for this order
        </Text>
      </View>
    )
  }

  return (
    <View style={{ paddingVertical: 6 }}>
      <Text
        style={{
          fontSize: 13,
          fontWeight: '700',
          color: colors.heading,
          marginBottom: 10
        }}
      >
        Payment History
      </Text>
      <View style={{ paddingLeft: 2 }}>
        {sortedPayments.map((payment, index) => (
          <PaymentCard
            key={payment.id || index}
            payment={payment}
            index={index}
            isLast={index === sortedPayments.length - 1}
          />
        ))}
      </View>
    </View>
  )
}

export default PaymentTimelineSection
