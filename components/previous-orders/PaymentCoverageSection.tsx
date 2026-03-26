import { colors } from '@/lib/theme'
import { CartItem, OrderProfile } from '@/lib/types'
import {
  ChevronDown,
  ChevronRight,
  CreditCard,
  DollarSign
} from 'lucide-react-native'
import React, { useMemo, useState } from 'react'
import { Pressable, Text, View } from 'react-native'

interface PaymentCoverageSectionProps {
  order: OrderProfile
}

interface Payment {
  id?: string
  amount: number
  method: string
  cardBrand?: string
  last4?: string
  tip_amount?: number
  itemsCovered?: {
    itemId: string
    quantity: number
  }[]
  timestamp?: string
  isVoided?: boolean
}

interface PaymentCoverage {
  payment: Payment
  paymentIndex: number
  coveredItems: {
    item: CartItem
    quantityCovered: number
  }[]
  totalCovered: number
}

const PaymentCoverageSection: React.FC<PaymentCoverageSectionProps> = ({
  order
}) => {
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(
    null
  )

  // Calculate payment coverage
  const paymentCoverage = useMemo((): PaymentCoverage[] => {
    const payments = (order.payments || []) as Payment[]
    const orderItems = order.items || []
    return payments.map((payment, index) => {
      // Skip voided payments
      if (payment.isVoided) {
        return {
          payment,
          paymentIndex: index,
          coveredItems: [],
          totalCovered: 0
        }
      }

      const coveredItems: { item: CartItem; quantityCovered: number }[] = []
      let totalCovered = 0

      // Determine if this payment used cash pricing
      const isCashPayment = payment.method?.toLowerCase().includes('cash')

      // If payment has itemsCovered data, use it
      if (payment.itemsCovered && payment.itemsCovered.length > 0) {
        payment.itemsCovered.forEach(({ itemId, quantity }) => {
          const item = orderItems.find(
            (i: CartItem) => i.db_order_item_id === itemId
          )
          if (item) {
            coveredItems.push({ item, quantityCovered: quantity })

            // Use cash price and tax for cash payments, card price for card payments
            const itemPrice = isCashPayment
              ? item.cashPrice || item.price
              : item.price
            const itemTax = isCashPayment
              ? item.cashTaxAmount || item.taxAmount || 0
              : item.taxAmount || 0

            totalCovered += (itemPrice + itemTax) * quantity
          }
        })
      } else {
        // Fallback: Show that this payment covered the full amount
        // but we don't have item-level details
        totalCovered = payment.amount || 0
      }

      return {
        payment,
        paymentIndex: index,
        coveredItems,
        totalCovered
      }
    })
  }, [order.payments, order.items])
  const togglePayment = (paymentId: string) => {
    setExpandedPaymentId(expandedPaymentId === paymentId ? null : paymentId)
  }

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
          No payment coverage information available
        </Text>
      </View>
    )
  }

  // Filter out voided payments
  const activePaymentCoverage = paymentCoverage.filter(
    pc => !pc.payment.isVoided
  )

  if (activePaymentCoverage.length === 0) {
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
          All payments have been voided
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
          marginBottom: 6
        }}
      >
        Payment Coverage
      </Text>
      <Text style={{ fontSize: 12, color: colors.label, marginBottom: 10 }}>
        See which items were covered by each payment
      </Text>

      {activePaymentCoverage.map(coverage => {
        const { payment, paymentIndex, coveredItems, totalCovered } = coverage
        const paymentId = payment.id || `payment-${paymentIndex}`
        const isExpanded = expandedPaymentId === paymentId
        const paymentMethod = payment.method || 'Cash'
        const isCashPayment = paymentMethod.toLowerCase().includes('cash')

        return (
          <View key={paymentId} style={{ marginBottom: 10 }}>
            {/* Payment Header - Clickable */}
            <Pressable
              onPress={() => togglePayment(paymentId)}
              style={{
                backgroundColor: colors.panel,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: isExpanded ? colors.teal + '40' : colors.border,
                paddingHorizontal: 12,
                paddingVertical: 10
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between'
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    flex: 1
                  }}
                >
                  {/* Payment icon */}
                  <View
                    style={{
                      width: 30,
                      height: 30,
                      backgroundColor: colors.teal + '15',
                      borderWidth: 1,
                      borderColor: colors.teal + '40',
                      borderRadius: 15,
                      alignItems: 'center',
                      justifyContent: 'center'
                    }}
                  >
                    {paymentMethod.toLowerCase().includes('card') ? (
                      <CreditCard color={colors.teal} size={15} />
                    ) : (
                      <DollarSign color={colors.teal} size={15} />
                    )}
                  </View>

                  {/* Payment info */}
                  <View style={{ flex: 1 }}>
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: colors.heading
                      }}
                    >
                      Payment #{paymentIndex + 1}
                      {payment.cardBrand && payment.last4 && (
                        <Text style={{ color: colors.label, fontSize: 12 }}>
                          {' '}
                          - {payment.cardBrand} ****{payment.last4}
                        </Text>
                      )}
                    </Text>
                    <Text style={{ fontSize: 12, color: colors.label }}>
                      ${totalCovered.toFixed(2)}
                      {coveredItems.length > 0 &&
                        ` • ${coveredItems.length} items`}
                    </Text>
                  </View>

                  {/* Expand/Collapse icon */}
                  {isExpanded ? (
                    <ChevronDown color={colors.label} size={18} />
                  ) : (
                    <ChevronRight color={colors.label} size={18} />
                  )}
                </View>
              </View>
            </Pressable>

            {/* Expanded content - Item list */}
            {isExpanded && (
              <View
                style={{
                  backgroundColor: colors.screen,
                  borderWidth: 1,
                  borderColor: colors.teal + '30',
                  borderRadius: 10,
                  marginTop: 6,
                  paddingHorizontal: 12,
                  paddingVertical: 10
                }}
              >
                {coveredItems.length > 0 ? (
                  <View>
                    <Text
                      style={{
                        fontSize: 12,
                        color: colors.label,
                        marginBottom: 8,
                        fontWeight: '600'
                      }}
                    >
                      Items covered by this payment:
                    </Text>
                    {coveredItems.map(({ item, quantityCovered }, idx) => {
                      // Use cash price for cash payments, card price for card payments
                      const displayPrice = isCashPayment
                        ? item.cashPrice || item.price
                        : item.price

                      return (
                        <View
                          key={idx}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            paddingVertical: 7,
                            borderBottomWidth:
                              idx === coveredItems.length - 1 ? 0 : 1,
                            borderBottomColor: colors.border
                          }}
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={{
                                fontSize: 13,
                                color: colors.heading,
                                fontWeight: '600'
                              }}
                            >
                              {item.name || 'Unknown Item'}
                            </Text>
                            <Text style={{ fontSize: 11, color: colors.muted }}>
                              Quantity: {quantityCovered}
                              {quantityCovered % 1 !== 0 && ' (partial)'}
                            </Text>
                          </View>
                          <Text
                            style={{
                              fontSize: 12,
                              color: colors.heading,
                              fontWeight: '600'
                            }}
                          >
                            $
                            {((displayPrice || 0) * quantityCovered).toFixed(2)}
                          </Text>
                        </View>
                      )
                    })}

                    {/* Total for this payment */}
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingTop: 8,
                        marginTop: 8,
                        borderTopWidth: 1,
                        borderTopColor: colors.border
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          color: colors.label,
                          fontWeight: '600'
                        }}
                      >
                        Total Covered
                      </Text>
                      <Text
                        style={{
                          fontSize: 14,
                          color: colors.heading,
                          fontWeight: '700'
                        }}
                      >
                        ${totalCovered.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text
                    style={{
                      fontSize: 12,
                      color: colors.label,
                      textAlign: 'center',
                      paddingVertical: 4
                    }}
                  >
                    Item-level coverage not available for this payment
                  </Text>
                )}
              </View>
            )}
          </View>
        )
      })}
    </View>
  )
}

export default PaymentCoverageSection
