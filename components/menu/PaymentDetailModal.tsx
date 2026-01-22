import { Dialog, DialogContent } from "@/components/ui/dialog";
import { useToast } from "@/contexts/ToastContext";
import type { OrderPaymentItemCoverage } from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { useRouter } from "expo-router";
import {
  Banknote,
  ChevronDown,
  ChevronUp,
  CircleDollarSign,
  CreditCard,
  DollarSign,
  Package,
  Printer,
  RefreshCcw,
  RotateCcw,
  X,
} from "lucide-react-native";
import React, { useCallback, useMemo, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

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
  cardBrand?: string;
  itemsCovered?: OrderPaymentItemCoverage[];
  isCashPriced?: boolean;
  cashSavings?: number;
  subtotal_portion?: number;
  tax_portion?: number;
}

// ============================================================================
// PROFESSIONAL-GRADE ACTION BUTTON COMPONENT
// ============================================================================
interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  variant?: "default" | "danger" | "success" | "primary";
  disabled?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  label,
  onPress,
  variant = "default",
  disabled = false,
}) => {
  const getButtonStyles = () => {
    if (disabled) {
      return "bg-gray-800/50 border-gray-700";
    }
    switch (variant) {
      case "danger":
        return "bg-red-500/10 border-red-500/50";
      case "success":
        return "bg-emerald-500/10 border-emerald-500/50";
      case "primary":
        return "bg-blue-500/10 border-blue-500/50";
      default:
        return "bg-[#2a2a2a] border-gray-600 active:bg-gray-700";
    }
  };

  const getTextColor = () => {
    if (disabled) return "text-gray-600";
    switch (variant) {
      case "danger":
        return "text-red-400";
      case "success":
        return "text-emerald-400";
      case "primary":
        return "text-blue-400";
      default:
        return "text-white";
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className={`
        flex-1 min-w-[100px] py-4 px-3 rounded-xl border
        items-center justify-center gap-2
        ${getButtonStyles()}
      `}
      style={{ opacity: disabled ? 0.5 : 1 }}
    >
      {icon}
      <Text
        className={`text-xs font-semibold text-center ${getTextColor()}`}
        numberOfLines={1}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
};

// ============================================================================
// SUMMARY CARD COMPONENT
// ============================================================================
interface SummaryCardProps {
  amount: number;
  cashAmount?: number;
  label: string;
  icon: React.ReactNode;
  isNegative?: boolean;
  accentColor?: string;
}

const SummaryCard: React.FC<SummaryCardProps> = ({
  amount,
  cashAmount,
  label,
  icon,
  isNegative = false,
  accentColor = "#3B82F6",
}) => (
  <View
    className="flex-1 bg-[#1f1f1f] rounded-xl p-4 border border-gray-800"
    style={{ borderLeftWidth: 3, borderLeftColor: accentColor, minWidth: 160 }}
  >
    <View className="flex-row items-center justify-between mb-3">
      <View
        className="w-10 h-10 rounded-full items-center justify-center"
        style={{ backgroundColor: `${accentColor}15` }}
      >
        {icon}
      </View>
    </View>
    <Text className="text-2xl font-bold text-white" numberOfLines={1}>
      {isNegative && amount > 0 ? "−" : ""}${amount.toFixed(2)}
    </Text>
    {cashAmount && 
    <Text className="text-lg font-bold text-white flex flex-row items-center justify-center" numberOfLines={1}>
      <Banknote color={'green'} size={20} /> {(isNegative && cashAmount) && cashAmount > 0 ?  "-": ""}${cashAmount?.toFixed(2)}
    </Text>
    }
    <Text className="text-xs text-gray-400 mt-1 font-medium">{label}</Text>
  </View>
);

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================
const formatTimestamp = (timestamp: string): string => {
  const date = new Date(timestamp);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  if (isToday) {
    return `Today, ${date.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    })}`;
  }

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

// ============================================================================
// MAIN COMPONENT
// ============================================================================
/**
 * DEPRECATED
 * @param param0 
 * @returns 
 */
const PaymentDetailModal: React.FC<PaymentDetailModalProps> = ({
  isOpen,
  onClose,
  orderId,
}) => {
  const { show } = useToast();
  const router = useRouter();
  const [expandedPaymentIndex, setExpandedPaymentIndex] = useState<
    number | null
  >(null);

  const order = useOrderStore((state) => {
    if (!orderId) return null;
    return state.ordersById[orderId] || null;
  });

  // Toggle payment expansion
  const togglePaymentExpansion = useCallback((index: number) => {
    setExpandedPaymentIndex((prev) => (prev === index ? null : index));
  }, []);

  // Calculate payment summary
  const paymentSummary = useMemo(() => {
    if (!order) {
      return {
        orderTotal: 0,
        orderCashTotal : 0,
        refunds: 0,
        collected: 0,
        payments: [] as PaymentRowData[],
      };
    }

    let totalRefunded = 0;
    let totalCollected = 0;
    const payments: PaymentRowData[] = [];

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
          last4: payment.last4,
          cardBrand: payment.cardBrand,
          itemsCovered: payment.itemsCovered,
          isCashPriced: payment.isCashPriced,
          cashSavings: payment.cashSavings,
          subtotal_portion: payment.subtotal_portion,
          tax_portion: payment.tax_portion,
        });
      });
    }

    return {
      orderTotal: order.total_amount || 0,
      orderCashTotal : order.total_cash_amount || 0,
      refunds: totalRefunded,
      collected: totalCollected,
      payments,
    };
  }, [order]);

  // Handle actions
  const handleReOpenOrder = useCallback(() => {
    show({
      title: "Re-open Order",
      message: "Re-opening order functionality coming soon",
      type: "warning",
    });
  }, [show]);

  const handleAdjustTip = useCallback(() => {
    show({
      title: "Adjust Tip",
      message: "Tip adjustment functionality coming soon",
      type: "warning",
    });
  }, [show]);

  const handleRefund = useCallback(() => {
    if (!orderId) return;
    onClose();
    router.push(`/previous-orders/${orderId}`);
  }, [orderId, onClose, router]);

  const handleIssueReceipt = useCallback(() => {
    show({
      title: "Issue Receipt",
      message: "Receipt printing functionality coming soon",
      type: "warning",
    });
  }, [show]);

  if (!order) return null;

  const hasTips = paymentSummary.payments.some((p) => p.tipAmount > 0);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent
        className="p-0 bg-[#161616] border-gray-800"
        style={{ width: 650, maxWidth: "95%" }}
        align="end"
      >
        <View
          className="bg-[#161616] rounded-2xl overflow-hidden"
          style={{ width: "100%" }}
        >
          {/* ============================================================ */}
          {/* HEADER - Clean, minimal with subtle gradient accent */}
          {/* ============================================================ */}
          <View className="relative">
            {/* Gradient accent line */}
            <View
              className="absolute top-0 left-0 right-0 h-1"
              style={{
                backgroundColor: "#3B82F6",
                opacity: 0.8,
              }}
            />

            <View className="flex-row items-center justify-between px-6 py-5">
              <View>
                <Text className="text-xl font-bold text-white tracking-tight">
                  Payment Summary
                </Text>
                <Text className="text-sm text-gray-500 mt-0.5">
                  Order
                  {order.display_number || order.order_number?.slice(-6) || "—"}
                </Text>
              </View>
              <View className="flex-row items-center gap-3">
                {/* Order Status Badge */}
                <View
                  className={`px-3 py-1.5 rounded-full flex-row items-center ${
                    order.check_status === "Opened"
                      ? "bg-emerald-500/15 border border-emerald-500/40"
                      : "bg-gray-700/50 border border-gray-600"
                  }`}
                >
                  <View
                    className={`w-2 h-2 rounded-full mr-2 ${
                      order.check_status === "Opened" ? "bg-emerald-400" : "bg-gray-500"
                    }`}
                  />
                  <Text
                    className={`text-xs font-semibold uppercase tracking-wide ${
                      order.check_status === "Opened" ? "text-emerald-400" : "text-gray-400"
                    }`}
                  >
                    {order.check_status === "Opened" ? "Opened" : "Closed"}
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={onClose}
                  className="w-9 h-9 rounded-full bg-gray-800 items-center justify-center"
                >
                  <X size={18} color="#9CA3AF" />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          <ScrollView
            className="max-h-[65vh]"
            showsVerticalScrollIndicator={false}
          >
            {/* ============================================================ */}
            {/* SUMMARY CARDS - Premium card design with accent borders */}
            {/* ============================================================ */}
            <View className="px-6 pb-5">
              <View className="flex-row gap-3">
                <SummaryCard
                  amount={paymentSummary.orderTotal}
                  cashAmount={paymentSummary.orderCashTotal}
                  label="Order Total"
                  icon={<DollarSign size={20} color="#3B82F6" />}
                  accentColor="#3B82F6"
                />
                <SummaryCard
                  amount={paymentSummary.refunds}
                  label="Refunds"
                  icon={<RefreshCcw size={18} color="#EF4444" />}
                  isNegative
                  accentColor="#EF4444"
                />
                <SummaryCard
                  amount={paymentSummary.collected}
                  label="Collected"
                  icon={<CircleDollarSign size={20} color="#22C55E" />}
                  accentColor="#22C55E"
                />
              </View>
            </View>

            {/* ============================================================ */}
            {/* PAYMENTS TABLE - Clean, scannable rows */}
            {/* ============================================================ */}
            <View className="px-6 pb-6">
              {/* Section Header */}
              <View className="flex-row items-center mb-4">
                <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Payment History
                </Text>
                <View className="flex-1 h-px bg-gray-800 ml-3" />
              </View>

              {/* Table Header */}
              <View className="flex-row pb-3 mb-2 border-b border-gray-800">
                <View className="flex-[2.5]">
                  <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Method
                  </Text>
                </View>
                <View className="flex-1 items-end">
                  <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Amount
                  </Text>
                </View>
                <View className="flex-1 items-end">
                  <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Tip
                  </Text>
                </View>
                <View className="flex-1 items-end">
                  <Text className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                    Total
                  </Text>
                </View>
              </View>

              {/* Payment Rows */}
              {paymentSummary.payments.length === 0 ? (
                <View className="py-12 items-center">
                  <View className="w-16 h-16 rounded-full bg-gray-800/50 items-center justify-center mb-4">
                    <CreditCard size={28} color="#4B5563" />
                  </View>
                  <Text className="text-gray-500 text-sm font-medium">
                    No payments recorded
                  </Text>
                  <Text className="text-gray-600 text-xs mt-1">
                    Payments will appear here once processed
                  </Text>
                </View>
              ) : (
                paymentSummary.payments.map((payment, index) => {
                  const hasItemsCovered =
                    payment.itemsCovered && payment.itemsCovered.length > 0;
                  const isExpanded = expandedPaymentIndex === index;

                  return (
                    <View
                      key={index}
                      className={`${
                        index < paymentSummary.payments.length - 1
                          ? "border-b border-gray-800/50"
                          : ""
                      }`}
                    >
                      {/* Payment Row - Clickable if has items */}
                      <TouchableOpacity
                        onPress={() =>
                          hasItemsCovered && togglePaymentExpansion(index)
                        }
                        activeOpacity={hasItemsCovered ? 0.7 : 1}
                        className="flex-row items-center py-4"
                      >
                        {/* Payment Method */}
                        <View className="flex-[2.5] flex-row items-center">
                          <View
                            className={`w-8 h-8 rounded-lg items-center justify-center mr-3 ${
                              payment.isVoided ? "bg-red-500/10" : "bg-gray-800"
                            }`}
                          >
                            {payment.isVoided ? (
                              <X size={14} color="#EF4444" />
                            ) : payment.method === "Card" ? (
                              <CreditCard size={14} color="#9CA3AF" />
                            ) : (
                              <DollarSign size={14} color="#22C55E" />
                            )}
                          </View>
                          <View className="flex-1">
                            <View className="flex-row items-center">
                              <Text
                                className={`text-sm font-medium ${
                                  payment.isVoided
                                    ? "text-gray-500"
                                    : "text-white"
                                }`}
                              >
                                {payment.method === "Card" && payment.last4
                                  ? `•••• ${payment.last4}`
                                  : payment.method}
                              </Text>
                              {payment.isCashPriced && payment.cashSavings && payment.cashSavings > 0 && (
                                <View className="ml-2 px-1.5 py-0.5 bg-emerald-500/20 rounded">
                                  <Text className="text-[10px] text-emerald-400 font-medium">
                                    Saved ${payment.cashSavings.toFixed(2)}
                                  </Text>
                                </View>
                              )}
                            </View>
                            <View className="flex-row items-center mt-0.5">
                              <Text className="text-xs text-gray-500">
                                {formatTimestamp(payment.timestamp)}
                              </Text>
                              {hasItemsCovered && (
                                <View className="flex-row items-center ml-2">
                                  <Package size={10} color="#6B7280" />
                                  <Text className="text-xs text-gray-500 ml-1">
                                    {payment.itemsCovered!.length} item
                                    {payment.itemsCovered!.length !== 1
                                      ? "s"
                                      : ""}
                                  </Text>
                                  {isExpanded ? (
                                    <ChevronUp
                                      size={12}
                                      color="#6B7280"
                                      style={{ marginLeft: 4 }}
                                    />
                                  ) : (
                                    <ChevronDown
                                      size={12}
                                      color="#6B7280"
                                      style={{ marginLeft: 4 }}
                                    />
                                  )}
                                </View>
                              )}
                            </View>
                          </View>
                        </View>

                        {/* Order Amount */}
                        <View className="flex-1 items-end">
                          <Text
                            className={`text-sm font-medium ${
                              payment.isVoided
                                ? "text-gray-600 line-through"
                                : "text-white"
                            }`}
                          >
                            ${payment.orderAmount.toFixed(2)}
                          </Text>
                        </View>

                        {/* Tip Amount */}
                        <View className="flex-1 items-end">
                          <Text
                            className={`text-sm font-medium ${
                              payment.isVoided
                                ? "text-gray-600 line-through"
                                : payment.tipAmount > 0
                                  ? "text-blue-400"
                                  : "text-gray-500"
                            }`}
                          >
                            {payment.tipAmount > 0
                              ? `$${payment.tipAmount.toFixed(2)}`
                              : "—"}
                          </Text>
                        </View>

                        {/* Total Collected */}
                        <View className="flex-1 items-end">
                          <Text
                            className={`text-sm font-bold ${
                              payment.isVoided
                                ? "text-red-400"
                                : "text-emerald-400"
                            }`}
                          >
                            {payment.isVoided
                              ? "Voided"
                              : `$${payment.collected.toFixed(2)}`}
                          </Text>
                        </View>
                      </TouchableOpacity>

                      {/* Expanded Items Section */}
                      {isExpanded && hasItemsCovered && (
                        <View className="bg-[#1a1a1a] rounded-lg mx-2 mb-3 p-3 border border-gray-800">
                          <View className="flex-row items-center mb-2 pb-2 border-b border-gray-800">
                            <Package size={12} color="#6B7280" />
                            <Text className="text-xs font-semibold text-gray-400 ml-1.5 uppercase tracking-wide">
                              Items Covered
                            </Text>
                          </View>
                          {payment.itemsCovered!.map((item, itemIndex) => (
                            <View
                              key={item.itemId || itemIndex}
                              className={`flex-row items-center justify-between py-2 ${
                                itemIndex < payment.itemsCovered!.length - 1
                                  ? "border-b border-gray-800/50"
                                  : ""
                              }`}
                            >
                              <View className="flex-1 flex-row items-center">
                                <View className="w-6 h-6 rounded bg-gray-800 items-center justify-center mr-2">
                                  <Text className="text-xs font-bold text-gray-400">
                                    {item.quantity}x
                                  </Text>
                                </View>
                                <Text
                                  className="text-sm text-gray-300 flex-1"
                                  numberOfLines={1}
                                >
                                  {item.itemName || "Unknown Item"}
                                </Text>
                              </View>
                              <View className="items-end">
                                {item.unitPrice > 0 && (
                                  <Text className="text-xs text-gray-500">
                                    @ ${item.unitPrice.toFixed(2)} ea
                                  </Text>
                                )}
                                {item.subtotal > 0 && (
                                  <Text className="text-sm font-medium text-white">
                                    ${item.subtotal.toFixed(2)}
                                  </Text>
                                )}
                              </View>
                            </View>
                          ))}
                          {/* Subtotal/Tax breakdown if available */}
                          {(payment.subtotal_portion || payment.tax_portion) && (
                            <View className="mt-2 pt-2 border-t border-gray-700">
                              {payment.subtotal_portion !== undefined && payment.subtotal_portion > 0 && (
                                <View className="flex-row justify-between">
                                  <Text className="text-xs text-gray-500">
                                    Subtotal
                                  </Text>
                                  <Text className="text-xs text-gray-400">
                                    ${payment.subtotal_portion.toFixed(2)}
                                  </Text>
                                </View>
                              )}
                              {payment.tax_portion !== undefined && payment.tax_portion > 0 && (
                                <View className="flex-row justify-between mt-1">
                                  <Text className="text-xs text-gray-500">
                                    Tax
                                  </Text>
                                  <Text className="text-xs text-gray-400">
                                    ${payment.tax_portion.toFixed(2)}
                                  </Text>
                                </View>
                              )}
                            </View>
                          )}
                        </View>
                      )}
                    </View>
                  );
                })
              )}
            </View>
          </ScrollView>

          {/* ============================================================ */}
          {/* ACTION BUTTONS - Icon + Label, proper spacing */}
          {/* ============================================================ */}
          <View className="px-6 py-5 border-t border-gray-800 bg-[#1a1a1a]">
            <View className="flex-row gap-3">
              <ActionButton
                icon={<RotateCcw size={18} color="#9CA3AF" />}
                label="Re-open"
                onPress={handleReOpenOrder}
                variant="default"
              />
              <ActionButton
                icon={
                  <DollarSign
                    size={18}
                    color={hasTips ? "#9CA3AF" : "#4B5563"}
                  />
                }
                label="Adjust Tip"
                onPress={handleAdjustTip}
                variant="default"
                disabled={!hasTips}
              />
              <ActionButton
                icon={<RefreshCcw size={18} color="#EF4444" />}
                label="Refund"
                onPress={handleRefund}
                variant="danger"
              />
              <ActionButton
                icon={<Printer size={18} color="#22C55E" />}
                label="Receipt"
                onPress={handleIssueReceipt}
                variant="success"
              />
            </View>
          </View>
        </View>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentDetailModal;
