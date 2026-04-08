import { colors } from '@/lib/theme'
import { CartItem } from '@/lib/types'
import React from 'react'
import { Text, View } from 'react-native'

interface OrderDetailBillItemProps {
  item: CartItem
  showCashPricing: boolean
}

function getStatusBorderColor (item: CartItem): string {
  if (item.is_voided) return colors.danger
  if ((item.refundedQuantity || 0) >= item.quantity) return colors.danger
  if ((item.refundedQuantity || 0) > 0) return colors.warning
  if (item.paidQuantity >= item.quantity) return colors.teal
  return colors.teal + '40'
}

const OrderDetailBillItem: React.FC<OrderDetailBillItemProps> = ({
  item,
  showCashPricing
}) => {
  const borderColor = getStatusBorderColor(item)
  const displayPrice = showCashPricing ? item.cashPrice : item.price
  const displaySubtotal = showCashPricing ? item.cashSubtotal : item.subtotal
  const hasModifiers =
    item.customizations.modifiers && item.customizations.modifiers.length > 0
  const hasAddOns =
    item.customizations.addOns && item.customizations.addOns.length > 0
  const hasNotes = !!item.customizations.notes

  return (
    <View
      style={{
        backgroundColor: colors.panel,
        borderRadius: 12,
        overflow: 'hidden',
        borderWidth: 1,
        borderColor: colors.teal + '28',
        borderLeftWidth: 3,
        borderLeftColor: borderColor
      }}
    >
      <View style={{ paddingHorizontal: 12, paddingVertical: 10 }}>
        {/* Main row: name, qty x price, total */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            justifyContent: 'space-between'
          }}
        >
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text
              style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}
              numberOfLines={2}
            >
              {item.name}
            </Text>

            {/* Size badge */}
            {item.customizations.size && (
              <View
                style={{
                  backgroundColor: colors.teal + '15',
                  alignSelf: 'flex-start',
                  paddingHorizontal: 8,
                  paddingVertical: 2,
                  borderRadius: 8,
                  marginTop: 4,
                  borderWidth: 1,
                  borderColor: colors.teal + '40'
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.teal,
                    fontWeight: '600'
                  }}
                >
                  {item.customizations.size.name}
                </Text>
              </View>
            )}
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text
              style={{
                fontSize: 11,
                color: colors.teal,
                backgroundColor: colors.teal + '15',
                borderWidth: 1,
                borderColor: colors.teal + '35',
                paddingHorizontal: 6,
                paddingVertical: 2,
                borderRadius: 8,
                overflow: 'hidden'
              }}
            >
              {item.quantity} x ${displayPrice.toFixed(2)}
            </Text>
            <Text
              style={{
                fontSize: 13,
                fontWeight: '700',
                color: colors.teal,
                marginTop: 2
              }}
            >
              ${displaySubtotal.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Modifiers */}
        {hasModifiers && (
          <View
            style={{
              marginTop: 6,
              backgroundColor: colors.teal + '10',
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: colors.teal + '30'
            }}
          >
            {item.customizations.modifiers!.map((mod, idx) => (
              <View
                key={idx}
                style={{
                  flexDirection: 'row',
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  marginTop: 2
                }}
              >
                <Text
                  style={{
                    fontSize: 11,
                    color: colors.teal,
                    marginRight: 4,
                    fontWeight: '600'
                  }}
                >
                  {mod.categoryName}:
                </Text>
                {mod.options.map((opt, optIdx) => (
                  <Text
                    key={optIdx}
                    style={{ fontSize: 11, color: colors.heading }}
                  >
                    {opt.name}
                    {opt.price > 0 ? ` (+$${opt.price.toFixed(2)})` : ''}
                    {optIdx < mod.options.length - 1 ? ', ' : ''}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Add-ons */}
        {hasAddOns && (
          <View
            style={{
              marginTop: 6,
              backgroundColor: colors.teal + '10',
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderWidth: 1,
              borderColor: colors.teal + '30'
            }}
          >
            <Text
              style={{ fontSize: 11, color: colors.teal, fontWeight: '600' }}
            >
              Add-ons:
            </Text>
            {item.customizations.addOns!.map((addon, idx) => (
              <Text
                key={idx}
                style={{ fontSize: 11, color: colors.heading, marginLeft: 8 }}
              >
                + {addon.name}
                {addon.price > 0 ? ` ($${addon.price.toFixed(2)})` : ''}
              </Text>
            ))}
          </View>
        )}

        {/* Notes */}
        {hasNotes && (
          <View
            style={{
              marginTop: 8,
              backgroundColor: colors.warning + '15',
              borderRadius: 8,
              paddingHorizontal: 8,
              paddingVertical: 6,
              borderLeftWidth: 2,
              borderLeftColor: colors.warning
            }}
          >
            <Text
              style={{
                fontSize: 11,
                color: colors.warning,
                fontStyle: 'italic'
              }}
            >
              {item.customizations.notes}
            </Text>
          </View>
        )}

        {/* Voided indicator */}
        {item.is_voided && (
          <View
            style={{
              marginTop: 8,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6
            }}
          >
            <View
              style={{
                backgroundColor: colors.danger + '20',
                paddingHorizontal: 8,
                paddingVertical: 2,
                borderRadius: 20,
                borderWidth: 1,
                borderColor: colors.danger + '50'
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '600',
                  color: colors.danger
                }}
              >
                VOIDED
              </Text>
            </View>
            {item.void_reason && (
              <Text
                style={{ fontSize: 11, color: colors.danger, flex: 1 }}
                numberOfLines={1}
              >
                {item.void_reason}
              </Text>
            )}
          </View>
        )}

        {/* Refund indicator */}
        {!item.is_voided && (item.refundedQuantity || 0) > 0 && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 11, color: colors.danger }}>
              Refunded: {item.refundedQuantity} of {item.quantity}
              {item.refundedAmount
                ? ` ($${item.refundedAmount.toFixed(2)})`
                : ''}
            </Text>
          </View>
        )}
      </View>
    </View>
  )
}

export default React.memo(OrderDetailBillItem)
