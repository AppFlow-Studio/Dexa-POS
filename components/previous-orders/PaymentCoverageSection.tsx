import { colors } from "@/lib/theme";
import { CartItem, OrderProfile } from "@/lib/types";
import { ChevronDown, ChevronRight, CreditCard, DollarSign } from "lucide-react-native";
import React, { useMemo, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { ta } from "zod/v4/locales";

interface PaymentCoverageSectionProps {
  order: OrderProfile;
}

interface Payment {
  id?: string;
  amount: number;
  method: string;
  cardBrand?: string;
  last4?: string;
  tip_amount?: number;
  itemsCovered?: {
    itemId: string;
    quantity: number;
  }[];
  timestamp?: string;
  isVoided?: boolean;
}

interface PaymentCoverage {
  payment: Payment;
  paymentIndex: number;
  coveredItems: {
    item: CartItem;
    quantityCovered: number;
  }[];
  totalCovered: number;
}

const PaymentCoverageSection: React.FC<PaymentCoverageSectionProps> = ({ order }) => {
  const [expandedPaymentId, setExpandedPaymentId] = useState<string | null>(null);

  // Calculate payment coverage
  const paymentCoverage = useMemo((): PaymentCoverage[] => {
    const payments = (order.payments || []) as Payment[];
    const orderItems = order.items || [];
    return payments.map((payment, index) => {
      // Skip voided payments
      if (payment.isVoided) {
        return {
          payment,
          paymentIndex: index,
          coveredItems: [],
          totalCovered: 0,
        };
      }

      const coveredItems: { item: CartItem; quantityCovered: number }[] = [];
      let totalCovered = 0;

      // Determine if this payment used cash pricing
      const isCashPayment = payment.method?.toLowerCase().includes('cash');

      // If payment has itemsCovered data, use it
      if (payment.itemsCovered && payment.itemsCovered.length > 0) {
        payment.itemsCovered.forEach(({ itemId, quantity }) => {
          const item = orderItems.find((i: CartItem) => i.db_order_item_id === itemId);
          if (item) {
            coveredItems.push({ item, quantityCovered: quantity });

            // Use cash price and tax for cash payments, card price for card payments
            const itemPrice = isCashPayment ? (item.cashPrice || item.price) : item.price;
            const itemTax = isCashPayment ? (item.cashTaxAmount || item.taxAmount || 0) : (item.taxAmount || 0);

            totalCovered += (itemPrice + itemTax) * quantity;
          }
        });
      } else {
        // Fallback: Show that this payment covered the full amount
        // but we don't have item-level details
        totalCovered = payment.amount || 0;
      }

      return {
        payment,
        paymentIndex: index,
        coveredItems,
        totalCovered,
      };
    });
  }, [order.payments, order.items]);
  const togglePayment = (paymentId: string) => {
    setExpandedPaymentId(expandedPaymentId === paymentId ? null : paymentId);
  };

  if (!order.payments || order.payments.length === 0) {
    return (
      <View className="py-8 items-center justify-center">
        <Text className="text-gray-400 text-center">
          No payment coverage information available
        </Text>
      </View>
    );
  }

  // Filter out voided payments
  const activePaymentCoverage = paymentCoverage.filter((pc) => !pc.payment.isVoided);

  if (activePaymentCoverage.length === 0) {
    return (
      <View className="py-8 items-center justify-center">
        <Text className="text-gray-400 text-center">
          All payments have been voided
        </Text>
      </View>
    );
  }

  return (
    <View className="py-4">
      <Text className="text-xl font-bold text-white mb-4">Payment Coverage</Text>
      <Text className="text-gray-400 text-sm mb-4">
        See which items were covered by each payment
      </Text>

      {activePaymentCoverage.map((coverage) => {
        const { payment, paymentIndex, coveredItems, totalCovered } = coverage;
        const paymentId = payment.id || `payment-${paymentIndex}`;
        const isExpanded = expandedPaymentId === paymentId;
        const paymentMethod = payment.method || "Cash";
        const isCashPayment = paymentMethod.toLowerCase().includes('cash');

        return (
          <View key={paymentId} className="mb-3">
            {/* Payment Header - Clickable */}
            <Pressable
              onPress={() => togglePayment(paymentId)}
              className="bg-panel rounded-lg border border-border p-4"
            >
              <View className="flex-row items-center justify-between">
                <View className="flex-row items-center gap-3 flex-1">
                  {/* Payment icon */}
                  <View className="w-10 h-10 bg-blue-600/20 border border-blue-500 rounded-full items-center justify-center">
                    {paymentMethod.toLowerCase().includes("card") ? (
                      <CreditCard color={colors.info} size={20} />
                    ) : (
                      <DollarSign color={colors.info} size={20} />
                    )}
                  </View>

                  {/* Payment info */}
                  <View className="flex-1">
                    <Text className="text-white font-semibold text-base">
                      Payment #{paymentIndex + 1}
                      {payment.cardBrand && payment.last4 && (
                        <Text className="text-gray-400">
                          {" "}
                          - {payment.cardBrand} ****{payment.last4}
                        </Text>
                      )}
                    </Text>
                    <Text className="text-gray-400 text-sm">
                      ${totalCovered.toFixed(2)}
                      {coveredItems.length > 0 && ` • ${coveredItems.length} items`}
                    </Text>
                  </View>

                  {/* Expand/Collapse icon */}
                  {isExpanded ? (
                    <ChevronDown color={colors.label} size={24} />
                  ) : (
                    <ChevronRight color={colors.label} size={24} />
                  )}
                </View>
              </View>
            </Pressable>

            {/* Expanded content - Item list */}
            {isExpanded && (
              <View className="bg-screen border border-border rounded-b-lg mt-1 p-4">
                {coveredItems.length > 0 ? (
                  <View>
                    <Text className="text-gray-400 text-sm mb-3 font-semibold">
                      Items covered by this payment:
                    </Text>
                    {coveredItems.map(({ item, quantityCovered }, idx) => {
                      // Use cash price for cash payments, card price for card payments
                      const displayPrice = isCashPayment ? (item.cashPrice || item.price) : item.price;

                      return (
                        <View
                          key={idx}
                          className="flex-row items-center justify-between py-2 border-b border-border last:border-b-0"
                        >
                          <View className="flex-1">
                            <Text className="text-white font-medium">
                              {item.name || "Unknown Item"}
                            </Text>
                            <Text className="text-gray-500 text-sm">
                              Quantity: {quantityCovered}
                              {quantityCovered % 1 !== 0 && " (partial)"}
                            </Text>
                          </View>
                          <Text className="text-white font-semibold">
                            ${((displayPrice || 0) * quantityCovered).toFixed(2)}
                          </Text>
                        </View>
                      );
                    })}

                    {/* Total for this payment */}
                    <View className="flex-row items-center justify-between pt-3 mt-2 border-t border-border">
                      <Text className="text-white font-bold">Total Covered</Text>
                      <Text className="text-white font-bold text-lg">
                        ${totalCovered.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                ) : (
                  <Text className="text-gray-400 text-center py-2">
                    Item-level coverage not available for this payment
                  </Text>
                )}
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
};

export default PaymentCoverageSection;
