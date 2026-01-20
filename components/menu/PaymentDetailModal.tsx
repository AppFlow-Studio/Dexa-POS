import { useToast } from "@/contexts/ToastContext";
import { OrderProfile } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Check, Repeat2, X } from "lucide-react-native";
import React, { useMemo } from "react";
import {
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface PaymentDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  orderId: string | null;
}

interface PaymentRowData {
  method: string;
  timestamp: string;
  orderAmount: number;
  tipAmount: number;
  collected: number;
  isVoided: boolean;
  last4?: string;
}

const PaymentDetailModal: React.FC<PaymentDetailModalProps> = ({
  isOpen,
  onClose,
  orderId,
}) => {
  const { ordersByDbId, ordersById } = useOrderStore();
  const { show } = useToast();

  // Get order data
  const order: OrderProfile | null = useMemo(() => {
    if (!orderId) return null;
    return ordersById[orderId] || ordersByDbId[orderId] || null;
  }, [orderId, ordersById, ordersByDbId]);

  // Calculate payment summary
  const paymentSummary = useMemo(() => {
    if (!order) {
      return {
        orderTotal: 0,
        refunds: 0,
        collected: 0,
        payments: [] as PaymentRowData[],
      };
    }

    let totalRefunded = 0;
    let totalCollected = 0;
    const payments: PaymentRowData[] = [];

    // Process payments
    if (order.payments && order.payments.length > 0) {
      order.payments.forEach((payment) => {
        const orderAmount = payment.amount || 0;
        const tipAmount = payment.tip_amount || 0;
        const isVoided = payment.isVoided || false;

        const collected = isVoided ? 0 : orderAmount + tipAmount;

        if (isVoided) {
          totalRefunded += orderAmount + tipAmount;
        } else {
          totalCollected += collected;
        }

        payments.push({
          method: payment.method || "Unknown",
          timestamp: payment.timestamp || new Date().toISOString(),
          orderAmount,
          tipAmount,
          collected,
          isVoided,
          last4: (payment as any).last4,
        });
      });
    }

    return {
      orderTotal: order.total_amount || 0,
      refunds: totalRefunded,
      collected: totalCollected,
      payments,
    };
  }, [order]);

  // Format timestamp
  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString("en-US", {
      month: "numeric",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  };

  // Handle actions
  const handleReOpenOrder = () => {
    show({
      title: "Re-open Order",
      message: "Re-opening order functionality coming soon",
      type: "info",
    });
  };

  const handleAdjustTip = () => {
    show({
      title: "Adjust Tip",
      message: "Tip adjustment functionality coming soon",
      type: "info",
    });
  };

  const handleRefund = () => {
    show({
      title: "Refund",
      message: "Refund functionality coming soon",
      type: "info",
    });
  };

  const handleIssueReceipt = () => {
    show({
      title: "Issue Receipt",
      message: "Receipt printing functionality coming soon",
      type: "info",
    });
  };

  if (!order) return null;

  const hasTips = paymentSummary.payments.some((p) => p.tipAmount > 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl p-0 bg-[#1a1a1a]">
        <View className="bg-[#1a1a1a] rounded-lg overflow-hidden">
          {/* Header */}
          <View className="flex-row items-center justify-between p-6 border-b border-gray-700">
            <Text className="text-2xl font-bold text-white">Payment Summary</Text>
            <TouchableOpacity onPress={onClose} className="p-2">
              <X size={24} color="#9CA3AF" />
            </TouchableOpacity>
          </View>

          <ScrollView className="max-h-[70vh]">
            {/* Summary Cards */}
            <View className="flex-row p-6 gap-4 border-b border-gray-700">
              {/* Order Total */}
              <View className="flex-1 items-center">
                <Text className="text-4xl font-bold text-white">
                  ${paymentSummary.orderTotal.toFixed(2)}
                </Text>
                <Text className="text-sm text-gray-400 mt-2">Order</Text>
              </View>

              {/* Refunds */}
              <View className="flex-1 items-center border-l border-r border-gray-700">
                <Text className="text-4xl font-bold text-white">
                  {paymentSummary.refunds > 0 ? "−" : ""}
                  ${paymentSummary.refunds.toFixed(2)}
                </Text>
                <Text className="text-sm text-gray-400 mt-2">Refunds</Text>
              </View>

              {/* Order Collected */}
              <View className="flex-1 items-center">
                <Text className="text-4xl font-bold text-white">
                  ${paymentSummary.collected.toFixed(2)}
                </Text>
                <Text className="text-sm text-gray-400 mt-2">Order Collected</Text>
              </View>
            </View>

            {/* Payment Table */}
            <View className="p-6">
              {/* Table Header */}
              <View className="flex-row pb-3 border-b border-gray-700">
                <View className="flex-[2.5]">
                  <Text className="text-xs font-bold text-gray-400 uppercase">
                    PAYMENTS
                  </Text>
                </View>
                <View className="flex-1 items-end">
                  <Text className="text-xs font-bold text-gray-400 uppercase">
                    ORDER
                  </Text>
                </View>
                <View className="flex-1 items-end">
                  <Text className="text-xs font-bold text-gray-400 uppercase">
                    TIPS + GRAT
                  </Text>
                </View>
                <View className="flex-1 items-end">
                  <Text className="text-xs font-bold text-gray-400 uppercase">
                    COLLECTED
                  </Text>
                </View>
              </View>

              {/* Payment Rows */}
              {paymentSummary.payments.length === 0 ? (
                <View className="py-8 items-center">
                  <Text className="text-gray-500 text-sm">No payments recorded</Text>
                </View>
              ) : (
                paymentSummary.payments.map((payment, index) => (
                  <View
                    key={index}
                    className="flex-row items-center py-4 border-b border-gray-800"
                  >
                    {/* Payment Method + Timestamp */}
                    <View className="flex-[2.5] flex-row items-center">
                      {/* Status Icon */}
                      <View className="mr-3">
                        {payment.isVoided ? (
                          <Repeat2 size={18} color="#EF4444" />
                        ) : (
                          <Check size={18} color="#22C55E" />
                        )}
                      </View>

                      {/* Method and Timestamp */}
                      <View className="flex-1">
                        <Text className="text-sm font-medium text-white">
                          {payment.method === "Card" && payment.last4
                            ? `Card •••• ${payment.last4}`
                            : payment.method}
                        </Text>
                        <Text className="text-xs text-gray-400 mt-0.5">
                          {formatTimestamp(payment.timestamp)}
                        </Text>
                      </View>
                    </View>

                    {/* Order Amount */}
                    <View className="flex-1 items-end">
                      <Text
                        className={`text-sm font-medium ${
                          payment.isVoided
                            ? "text-gray-500 line-through"
                            : "text-white"
                        }`}
                      >
                        ${payment.orderAmount.toFixed(2)}
                      </Text>
                      {payment.isVoided && (
                        <Text className="text-xs text-red-500 mt-0.5">Voided</Text>
                      )}
                    </View>

                    {/* Tips Amount */}
                    <View className="flex-1 items-end">
                      <Text
                        className={`text-sm font-medium ${
                          payment.isVoided
                            ? "text-gray-500 line-through"
                            : payment.tipAmount > 0
                            ? "text-blue-400"
                            : "text-white"
                        }`}
                      >
                        ${payment.tipAmount.toFixed(2)}
                      </Text>
                      {payment.isVoided && (
                        <Text className="text-xs text-red-500 mt-0.5">Voided</Text>
                      )}
                    </View>

                    {/* Collected Amount */}
                    <View className="flex-1 items-end">
                      <Text className="text-sm font-bold text-white">
                        ${payment.collected.toFixed(2)}
                      </Text>
                      {payment.isVoided && (
                        <Text className="text-xs text-gray-500 mt-0.5">
                          Incl. Cash Discount of −$
                          {(payment.orderAmount + payment.tipAmount - payment.collected).toFixed(2)}
                        </Text>
                      )}
                    </View>
                  </View>
                ))
              )}
            </View>
          </ScrollView>

          {/* Footer Actions */}
          <View className="flex-row gap-3 p-6 border-t border-gray-700 bg-[#252525]">
            <TouchableOpacity
              onPress={handleReOpenOrder}
              className="flex-1 py-3 px-4 rounded-lg border border-gray-600 bg-[#2a2a2a] items-center justify-center"
            >
              <Text className="text-sm font-semibold text-white whitespace-nowrap">
                RE-OPEN ORDER
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleAdjustTip}
              disabled={!hasTips}
              className={`flex-1 py-3 px-4 rounded-lg items-center justify-center ${
                hasTips ? "bg-gray-700" : "bg-gray-800"
              }`}
            >
              <Text
                className={`text-sm font-semibold whitespace-nowrap ${
                  hasTips ? "text-white" : "text-gray-500"
                }`}
              >
                ADJUST TIP
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleRefund}
              className="flex-1 py-3 px-4 rounded-lg border border-red-500 bg-[#2a2a2a] items-center justify-center"
            >
              <Text className="text-sm font-semibold text-red-500 whitespace-nowrap">
                REFUND
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={handleIssueReceipt}
              className="flex-1 py-3 px-4 rounded-lg bg-green-600 items-center justify-center"
            >
              <Text className="text-sm font-semibold text-white whitespace-nowrap">
                ISSUE RECEIPT
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentDetailModal;
