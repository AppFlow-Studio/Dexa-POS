import { CartItem } from "@/lib/types";
import React from "react";
import { Text, View } from "react-native";

interface OrderDetailBillItemProps {
  item: CartItem;
  showCashPricing: boolean;
}

function getStatusBorderColor(item: CartItem): string {
  if (item.is_voided) return "#EF4444"; // red
  if ((item.refundedQuantity || 0) >= item.quantity) return "#EF4444"; // fully refunded - red
  if ((item.refundedQuantity || 0) > 0) return "#F59E0B"; // partially refunded - yellow
  if (item.paidQuantity >= item.quantity) return "#22C55E"; // fully paid - green
  return "#525252"; // default gray
}

const OrderDetailBillItem: React.FC<OrderDetailBillItemProps> = ({
  item,
  showCashPricing,
}) => {
  const borderColor = getStatusBorderColor(item);
  const displayPrice = showCashPricing ? item.cashPrice : item.price;
  const displaySubtotal = showCashPricing ? item.cashSubtotal : item.subtotal;
  const hasModifiers =
    item.customizations.modifiers && item.customizations.modifiers.length > 0;
  const hasAddOns =
    item.customizations.addOns && item.customizations.addOns.length > 0;
  const hasNotes = !!item.customizations.notes;

  return (
    <View
      className="bg-panel rounded-xl overflow-hidden"
      style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
    >
      <View className="p-3">
        {/* Main row: name, qty x price, total */}
        <View className="flex-row items-start justify-between">
          <View className="flex-1 mr-3">
            <Text className="text-base font-semibold text-white" numberOfLines={2}>
              {item.name}
            </Text>

            {/* Size badge */}
            {item.customizations.size && (
              <View className="bg-card self-start px-2 py-0.5 rounded mt-1">
                <Text className="text-xs text-gray-300">
                  {item.customizations.size.name}
                </Text>
              </View>
            )}
          </View>

          <View className="items-end">
            <Text className="text-sm text-gray-400">
              {item.quantity} x ${displayPrice.toFixed(2)}
            </Text>
            <Text className="text-base font-semibold text-white">
              ${displaySubtotal.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Modifiers */}
        {hasModifiers && (
          <View className="mt-2">
            {item.customizations.modifiers!.map((mod, idx) => (
              <View key={idx} className="flex-row flex-wrap items-center mt-0.5">
                <Text className="text-xs text-gray-500 mr-1">
                  {mod.categoryName}:
                </Text>
                {mod.options.map((opt, optIdx) => (
                  <Text key={optIdx} className="text-xs text-gray-400">
                    {opt.name}
                    {opt.price > 0 ? ` (+$${opt.price.toFixed(2)})` : ""}
                    {optIdx < mod.options.length - 1 ? ", " : ""}
                  </Text>
                ))}
              </View>
            ))}
          </View>
        )}

        {/* Add-ons */}
        {hasAddOns && (
          <View className="mt-1.5">
            <Text className="text-xs text-gray-500">Add-ons:</Text>
            {item.customizations.addOns!.map((addon, idx) => (
              <Text key={idx} className="text-xs text-gray-400 ml-2">
                + {addon.name}
                {addon.price > 0 ? ` ($${addon.price.toFixed(2)})` : ""}
              </Text>
            ))}
          </View>
        )}

        {/* Notes */}
        {hasNotes && (
          <View className="mt-2 bg-yellow-900/20 rounded-lg p-2 border-l-2 border-yellow-500">
            <Text className="text-xs text-yellow-400 italic">
              {item.customizations.notes}
            </Text>
          </View>
        )}

        {/* Voided indicator */}
        {item.is_voided && (
          <View className="mt-2 flex-row items-center gap-2">
            <View className="bg-red-900/50 px-2 py-0.5 rounded">
              <Text className="text-xs font-bold text-red-400">VOIDED</Text>
            </View>
            {item.void_reason && (
              <Text className="text-xs text-red-400/70 flex-1" numberOfLines={1}>
                {item.void_reason}
              </Text>
            )}
          </View>
        )}

        {/* Refund indicator */}
        {!item.is_voided && (item.refundedQuantity || 0) > 0 && (
          <View className="mt-2">
            <Text className="text-xs text-red-400">
              Refunded: {item.refundedQuantity} of {item.quantity}
              {item.refundedAmount
                ? ` ($${item.refundedAmount.toFixed(2)})`
                : ""}
            </Text>
          </View>
        )}
      </View>
    </View>
  );
};

export default React.memo(OrderDetailBillItem);
