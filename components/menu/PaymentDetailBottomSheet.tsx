import { useToast } from "@/contexts/ToastContext";
import type {
    CartItem,
    OrderPaymentItemCoverage,
    OrderProfile,
} from "@/lib/types";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { useRouter } from "expo-router";
import {
    ArrowLeft,
    Banknote,
    Check,
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
import React, {
    useCallback,
    useEffect,
    useImperativeHandle,
    useMemo,
    useRef,
    useState,
} from "react";
import {
    Modal,
    ScrollView,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from "react-native";

// ============================================================================
// TYPES
// ============================================================================
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

type RightPaneView = "summary" | "refund";
type RefundType = "full" | "items" | "amount" | "payments";

// ============================================================================
// REUSABLE COMPONENTS
// ============================================================================

// Action Button Component
interface ActionButtonProps {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
  variant?: "default" | "danger" | "success" | "primary" | "warning";
  disabled?: boolean;
  flex?: boolean;
}

const ActionButton: React.FC<ActionButtonProps> = ({
  icon,
  label,
  onPress,
  variant = "default",
  disabled = false,
  flex = true,
}) => {
  const getButtonStyles = () => {
    if (disabled) return "bg-gray-800/50 border-gray-700";
    switch (variant) {
      case "danger":
        return "bg-red-500/10 border-red-500/50";
      case "success":
        return "bg-emerald-500/10 border-emerald-500/50";
      case "primary":
        return "bg-blue-500/10 border-blue-500/50";
      case "warning":
        return "bg-amber-500/10 border-amber-500/50";
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
      case "warning":
        return "text-amber-400";
      default:
        return "text-white";
    }
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled}
      className={`
        ${flex ? "flex-1" : ""} min-w-[80px] py-3 px-3 rounded-xl border
        items-center justify-center gap-1.5
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

// Summary Card Component
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
    className="flex-1 bg-[#1f1f1f] rounded-xl p-3 border border-gray-800"
    style={{ borderLeftWidth: 3, borderLeftColor: accentColor }}
  >
    <View className="flex-row items-center justify-between mb-2">
      <View
        className="w-8 h-8 rounded-full items-center justify-center"
        style={{ backgroundColor: `${accentColor}15` }}
      >
        {icon}
      </View>
    </View>
    <Text className="text-xl font-bold text-white" numberOfLines={1}>
      {isNegative && amount > 0 ? "−" : ""}${amount.toFixed(2)}
    </Text>
    {cashAmount !== undefined && cashAmount > 0 && (
      <View className="flex-row items-center mt-0.5">
        <Banknote color="#22C55E" size={14} />
        <Text className="text-sm font-medium text-gray-400 ml-1">
          ${cashAmount.toFixed(2)}
        </Text>
      </View>
    )}
    <Text className="text-xs text-gray-500 mt-1 font-medium">{label}</Text>
  </View>
);

// ============================================================================
// LEFT PANE - ORDER RECEIPT VIEW
// ============================================================================
interface LeftPaneProps {
  order: any;
  subtotal: number;
  discount: number;
  tax: number;
  total: number;
}

const LeftPane: React.FC<LeftPaneProps> = ({
  order,
  subtotal,
  discount,
  tax,
  total,
}) => {
  // Get modifiers display for an item
  const getModifiersDisplay = (item: CartItem) => {
    if (
      !item.customizations.modifiers ||
      item.customizations.modifiers.length === 0
    ) {
      return null;
    }

    return item.customizations.modifiers.map((mod, idx) => {
      const optionNames = mod.options?.map((opt) => opt.name).join(", ") || "";
      const priceAdjust = mod.options?.reduce(
        (sum, opt) => sum + (opt.price || 0),
        0,
      );

      return (
        <View key={idx} className="flex-row items-start ml-4 mt-0.5">
          <Text className="text-xs text-gray-500">• </Text>
          <Text className="text-xs text-gray-400 flex-1">
            {mod.categoryName ? `${mod.categoryName}: ` : ""}
            {optionNames}
            {priceAdjust && priceAdjust > 0 && (
              <Text className="text-emerald-500">
                {" "}
                +${priceAdjust.toFixed(2)}
              </Text>
            )}
          </Text>
        </View>
      );
    });
  };

  return (
    <View className="flex-[4] bg-[#1a1a1a] border-r border-gray-800">
      {/* Header */}
      <View className="px-4 py-3 border-b border-gray-800">
        <Text className="text-lg font-bold text-white">Order Receipt</Text>
        <Text className="text-xs text-gray-500 mt-0.5">
          {order?.items?.length || 0} items
        </Text>
      </View>

      {/* Items List */}
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 16 }}
      >
        <View className="px-4 py-2">
          {order?.items?.map((item: CartItem, index: number) => {
            const isVoided = item.is_voided;
            const isPaid = (item.paidQuantity || 0) >= item.quantity;
            const isPartialPaid =
              (item.paidQuantity || 0) > 0 &&
              (item.paidQuantity || 0) < item.quantity;

            return (
              <View
                key={item.id || index}
                className={`py-3 ${
                  index < (order?.items?.length || 0) - 1
                    ? "border-b border-gray-800/50"
                    : ""
                } ${isVoided ? "opacity-60" : ""}`}
              >
                <View className="flex-row items-start justify-between">
                  {/* Item Info */}
                  <View className="flex-1 pr-2">
                    <View className="flex-row items-center">
                      {isVoided && (
                        <View className="bg-red-500/20 px-1.5 py-0.5 rounded mr-2">
                          <Text className="text-[10px] font-bold text-red-400">
                            VOID
                          </Text>
                        </View>
                      )}
                      {isPaid && !isVoided && (
                        <View className="bg-emerald-500/20 px-1.5 py-0.5 rounded mr-2">
                          <Text className="text-[10px] font-bold text-emerald-400">
                            PAID
                          </Text>
                        </View>
                      )}
                      {isPartialPaid && !isVoided && (
                        <View className="bg-amber-500/20 px-1.5 py-0.5 rounded mr-2">
                          <Text className="text-[10px] font-bold text-amber-400">
                            {item.paidQuantity}/{item.quantity}
                          </Text>
                        </View>
                      )}
                      <Text
                        className={`text-sm font-medium ${
                          isVoided ? "text-gray-500 line-through" : "text-white"
                        }`}
                        numberOfLines={2}
                      >
                        {item.name}
                      </Text>
                    </View>
                    {/* Modifiers */}
                    {getModifiersDisplay(item)}
                    {/* Notes */}
                    {item.customizations.notes && (
                      <Text className="text-xs text-gray-500 italic mt-1 ml-4">
                        Note: {item.customizations.notes}
                      </Text>
                    )}
                  </View>

                  {/* Quantity & Price */}
                  <View className="items-end">
                    <Text
                      className={`text-xs ${
                        isVoided ? "text-gray-600" : "text-gray-400"
                      }`}
                    >
                      {item.quantity}x
                    </Text>
                    <Text
                      className={`text-sm font-semibold ${
                        isVoided ? "text-gray-600 line-through" : "text-white"
                      }`}
                    >
                      ${((item.price || 0) * item.quantity).toFixed(2)}
                    </Text>
                  </View>
                </View>
              </View>
            );
          })}

          {/* Empty State */}
          {(!order?.items || order.items.length === 0) && (
            <View className="py-12 items-center">
              <Package size={32} color="#4B5563" />
              <Text className="text-gray-500 text-sm mt-2">No items</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Pricing Footer */}
      <View className="px-4 py-3 border-t border-gray-800 bg-[#161616]">
        <View className="flex-row justify-between mb-1">
          <Text className="text-sm text-gray-400">Subtotal</Text>
          <Text className="text-sm text-gray-300">${subtotal.toFixed(2)}</Text>
        </View>
        {discount > 0 && (
          <View className="flex-row justify-between mb-1">
            <Text className="text-sm text-emerald-400">Discount</Text>
            <Text className="text-sm text-emerald-400">
              -${discount.toFixed(2)}
            </Text>
          </View>
        )}
        <View className="flex-row justify-between mb-2">
          <Text className="text-sm text-gray-400">Tax</Text>
          <Text className="text-sm text-gray-300">${tax.toFixed(2)}</Text>
        </View>
        <View className="flex-row justify-between pt-2 border-t border-gray-700">
          <Text className="text-base font-bold text-white">Total</Text>
          <Text className="text-base font-bold text-white">
            ${total.toFixed(2)}
          </Text>
        </View>
      </View>
    </View>
  );
};

// ============================================================================
// RIGHT PANE - PAYMENT SUMMARY VIEW
// ============================================================================
interface RightPaneSummaryProps {
  order: any;
  paymentSummary: {
    orderTotal: number;
    orderCashTotal: number;
    refunds: number;
    collected: number;
    payments: PaymentRowData[];
  };
  onReopenOrder: () => void;
  onContinueCharging: () => void;
  onIssueReceipt: () => void;
  onRefund: () => void;
  formatTimestamp: (timestamp: string) => string;
}

const RightPaneSummary: React.FC<RightPaneSummaryProps> = ({
  order,
  paymentSummary,
  onReopenOrder,
  onContinueCharging,
  onIssueReceipt,
  onRefund,
  formatTimestamp,
}) => {
  const [expandedPaymentIndex, setExpandedPaymentIndex] = useState<
    number | null
  >(null);

  const isOpen = order?.check_status === "Opened";
  const balanceDue = paymentSummary.orderTotal - paymentSummary.collected;
  const hasBalanceDue = balanceDue > 0.01;

  return (
    <View className="flex-[6] bg-[#161616]">
      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 100 }}
      >
        {/* Summary Cards */}
        <View className="px-4 py-4">
          <View className="flex-row gap-2">
            <SummaryCard
              amount={paymentSummary.orderTotal}
              cashAmount={paymentSummary.orderCashTotal}
              label="Order Total"
              icon={<DollarSign size={16} color="#3B82F6" />}
              accentColor="#3B82F6"
            />
            <SummaryCard
              amount={paymentSummary.refunds}
              label="Refunds"
              icon={<RefreshCcw size={14} color="#EF4444" />}
              isNegative
              accentColor="#EF4444"
            />
            <SummaryCard
              amount={paymentSummary.collected}
              label="Collected"
              icon={<CircleDollarSign size={16} color="#22C55E" />}
              accentColor="#22C55E"
            />
          </View>
        </View>

        {/* Transaction History */}
        <View className="px-4">
          <View className="flex-row items-center mb-3">
            <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              Transaction History
            </Text>
            <View className="flex-1 h-px bg-gray-800 ml-3" />
          </View>

          {/* Payment List */}
          {paymentSummary.payments.length === 0 ? (
            <View className="py-8 items-center">
              <View className="w-12 h-12 rounded-full bg-gray-800/50 items-center justify-center mb-3">
                <CreditCard size={24} color="#4B5563" />
              </View>
              <Text className="text-gray-500 text-sm">
                No payments recorded
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
                  <TouchableOpacity
                    onPress={() =>
                      hasItemsCovered &&
                      setExpandedPaymentIndex(isExpanded ? null : index)
                    }
                    activeOpacity={hasItemsCovered ? 0.7 : 1}
                    className="flex-row items-center py-3"
                  >
                    {/* Payment Method Icon */}
                    <View
                      className={`w-10 h-10 rounded-lg items-center justify-center mr-3 ${
                        payment.isVoided ? "bg-red-500/10" : "bg-gray-800"
                      }`}
                    >
                      {payment.isVoided ? (
                        <X size={18} color="#EF4444" />
                      ) : payment.method === "Card" ? (
                        <CreditCard size={18} color="#9CA3AF" />
                      ) : (
                        <Banknote size={18} color="#22C55E" />
                      )}
                    </View>

                    {/* Payment Details */}
                    <View className="flex-1">
                      <View className="flex-row items-center">
                        <Text
                          className={`text-sm font-medium ${
                            payment.isVoided ? "text-gray-500" : "text-white"
                          }`}
                        >
                          {payment.method === "Card" && payment.last4
                            ? `•••• ${payment.last4}`
                            : payment.method}
                        </Text>
                        {payment.isVoided && (
                          <View className="ml-2 px-1.5 py-0.5 bg-red-500/20 rounded">
                            <Text className="text-[10px] text-red-400 font-medium">
                              VOIDED
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
                              {payment.itemsCovered!.length} items
                            </Text>
                            {isExpanded ? (
                              <ChevronUp size={12} color="#6B7280" />
                            ) : (
                              <ChevronDown size={12} color="#6B7280" />
                            )}
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Amount */}
                    <View className="items-end">
                      {payment.tipAmount > 0 && (
                        <Text className="text-xs text-blue-400">
                          +${payment.tipAmount.toFixed(2)} tip
                        </Text>
                      )}
                      <Text
                        className={`text-base font-bold ${
                          payment.isVoided ? "text-red-400" : "text-emerald-400"
                        }`}
                      >
                        {payment.isVoided
                          ? "Voided"
                          : `$${payment.collected.toFixed(2)}`}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Expanded Items */}
                  {isExpanded && hasItemsCovered && (
                    <View className="bg-[#1a1a1a] rounded-lg mb-3 p-3 border border-gray-800">
                      <View className="flex-row items-center mb-2 pb-2 border-b border-gray-800">
                        <Package size={12} color="#6B7280" />
                        <Text className="text-xs font-semibold text-gray-400 ml-1.5 uppercase">
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
                          <View className="flex-row items-center flex-1">
                            <View className="w-6 h-6 rounded bg-gray-800 items-center justify-center mr-2">
                              <Text className="text-xs font-bold text-gray-400">
                                {item.quantity}x
                              </Text>
                            </View>
                            <Text
                              className="text-sm text-gray-300"
                              numberOfLines={1}
                            >
                              {item.itemName}
                            </Text>
                          </View>
                          <Text className="text-sm font-medium text-white">
                            ${item.subtotal.toFixed(2)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Action Buttons Footer */}
      <View className="absolute bottom-0 left-0 right-0 px-4 py-4 bg-[#1a1a1a] border-t border-gray-800">
        <View className="flex-row gap-2">
          {!isOpen && (
            <ActionButton
              icon={<RotateCcw size={16} color="#F59E0B" />}
              label="Re-Open"
              onPress={onReopenOrder}
              variant="warning"
            />
          )}
          {isOpen && hasBalanceDue && (
            <ActionButton
              icon={<DollarSign size={16} color="#3B82F6" />}
              label="Continue"
              onPress={onContinueCharging}
              variant="primary"
            />
          )}
          <ActionButton
            icon={<Printer size={16} color="#22C55E" />}
            label="Receipt"
            onPress={onIssueReceipt}
            variant="success"
          />
          <ActionButton
            icon={<RefreshCcw size={16} color="#EF4444" />}
            label="Refund"
            onPress={onRefund}
            variant="danger"
            disabled={paymentSummary.collected <= 0}
          />
        </View>
      </View>
    </View>
  );
};

// ============================================================================
// RIGHT PANE - REFUND VIEW
// ============================================================================
interface RightPaneRefundProps {
  order: any;
  paymentSummary: {
    orderTotal: number;
    collected: number;
    refunds: number;
    payments: PaymentRowData[];
  };
  onBack: () => void;
  onProcessRefund: (
    type: RefundType,
    amount: number,
    reason: string,
    selectedItems?: any[],
    selectedPayments?: string[],
  ) => void;
}

const RightPaneRefund: React.FC<RightPaneRefundProps> = ({
  order,
  paymentSummary,
  onBack,
  onProcessRefund,
}) => {
  const [refundType, setRefundType] = useState<RefundType>("full");
  const [refundAmount, setRefundAmount] = useState("");
  const [refundReason, setRefundReason] = useState("");
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>(
    {},
  );
  const [selectedPayments, setSelectedPayments] = useState<Set<number>>(
    new Set(),
  );

  const maxRefundable = paymentSummary.collected - paymentSummary.refunds;

  // Filter out voided payments - only non-voided payments can be refunded
  const refundablePayments = useMemo(() => {
    return paymentSummary.payments.filter((p) => !p.isVoided);
  }, [paymentSummary.payments]);

  // Calculate selected items total
  const selectedItemsTotal = useMemo(() => {
    if (!order?.items) return 0;
    return order.items.reduce((sum: number, item: CartItem) => {
      const selectedQty = selectedItems[item.id] || 0;
      return sum + (item.price || 0) * selectedQty;
    }, 0);
  }, [selectedItems, order?.items]);

  // Calculate selected payments total
  const selectedPaymentsTotal = useMemo(() => {
    let total = 0;
    selectedPayments.forEach((index) => {
      const payment = refundablePayments[index];
      if (payment) {
        total += payment.collected;
      }
    });
    return total;
  }, [selectedPayments, refundablePayments]);

  const getRefundAmount = () => {
    switch (refundType) {
      case "full":
        return maxRefundable;
      case "items":
        return selectedItemsTotal;
      case "amount":
        return parseFloat(refundAmount) || 0;
      case "payments":
        return selectedPaymentsTotal;
      default:
        return 0;
    }
  };

  const canProcess =
    refundReason.trim().length > 0 &&
    getRefundAmount() > 0 &&
    getRefundAmount() <= maxRefundable;

  const handleToggleItem = (itemId: string, maxQty: number) => {
    setSelectedItems((prev) => {
      if (prev[itemId]) {
        const { [itemId]: removed, ...rest } = prev;
        return rest;
      }
      return { ...prev, [itemId]: maxQty };
    });
  };

  const handleQuantityChange = (
    itemId: string,
    qty: number,
    maxQty: number,
  ) => {
    if (qty <= 0) {
      const { [itemId]: removed, ...rest } = selectedItems;
      setSelectedItems(rest);
    } else {
      setSelectedItems((prev) => ({
        ...prev,
        [itemId]: Math.min(qty, maxQty),
      }));
    }
  };

  const handleTogglePayment = (index: number) => {
    setSelectedPayments((prev) => {
      const newSet = new Set(prev);
      if (newSet.has(index)) {
        newSet.delete(index);
      } else {
        newSet.add(index);
      }
      return newSet;
    });
  };

  return (
    <View className="flex-[6] bg-[#161616]">
      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-gray-800">
        <TouchableOpacity
          onPress={onBack}
          className="w-8 h-8 rounded-full bg-gray-800 items-center justify-center mr-3"
        >
          <ArrowLeft size={16} color="#9CA3AF" />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-white">Process Refund</Text>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Refund Type Selection */}
        <View className="px-4 py-4">
          <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3">
            Refund Type
          </Text>
          <View className="flex-row gap-2 flex-wrap">
            {[
              { key: "full", label: "Full Refund" },
              { key: "items", label: "By Item" },
              { key: "payments", label: "By Payment" },
              { key: "amount", label: "Custom" },
            ].map((type) => (
              <TouchableOpacity
                key={type.key}
                onPress={() => setRefundType(type.key as RefundType)}
                className={`flex-1 py-3 px-3 rounded-lg border ${
                  refundType === type.key
                    ? "bg-blue-500/10 border-blue-500/50"
                    : "bg-gray-800 border-gray-700"
                }`}
              >
                <Text
                  className={`text-sm font-medium text-center ${
                    refundType === type.key ? "text-blue-400" : "text-gray-400"
                  }`}
                >
                  {type.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Full Refund View */}
        {refundType === "full" && (
          <View className="px-4">
            <View className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
              <Text className="text-sm text-gray-400 mb-2">Refund Amount</Text>
              <Text className="text-3xl font-bold text-red-400">
                ${maxRefundable.toFixed(2)}
              </Text>
              <Text className="text-xs text-gray-500 mt-1">
                Full refund of collected amount
              </Text>
            </View>
          </View>
        )}

        {/* Items Selection View */}
        {refundType === "items" && (
          <View className="px-4">
            <Text className="text-xs text-gray-500 mb-3">
              Select items to refund
            </Text>
            {order?.items
              ?.filter((item: CartItem) => !item.is_voided)
              .map((item: CartItem) => {
                const maxQty = item.paidQuantity || item.quantity;
                const isSelected = selectedItems[item.id] !== undefined;
                const selectedQty = selectedItems[item.id] || 0;

                return (
                  <View
                    key={item.id}
                    className={`flex-row items-center py-3 border-b border-gray-800/50 ${
                      isSelected ? "bg-blue-500/5" : ""
                    }`}
                  >
                    <TouchableOpacity
                      onPress={() => handleToggleItem(item.id, maxQty)}
                      className={`w-6 h-6 rounded border mr-3 items-center justify-center ${
                        isSelected
                          ? "bg-blue-500 border-blue-500"
                          : "border-gray-600"
                      }`}
                    >
                      {isSelected && <Check size={14} color="#FFFFFF" />}
                    </TouchableOpacity>
                    <View className="flex-1">
                      <Text className="text-sm text-white">{item.name}</Text>
                      <Text className="text-xs text-gray-500">
                        ${(item.price || 0).toFixed(2)} each
                      </Text>
                    </View>
                    {isSelected && (
                      <View className="flex-row items-center">
                        <TouchableOpacity
                          onPress={() =>
                            handleQuantityChange(
                              item.id,
                              selectedQty - 1,
                              maxQty,
                            )
                          }
                          className="w-8 h-8 rounded bg-gray-800 items-center justify-center"
                        >
                          <Text className="text-white font-bold">-</Text>
                        </TouchableOpacity>
                        <Text className="text-white font-medium mx-3">
                          {selectedQty}
                        </Text>
                        <TouchableOpacity
                          onPress={() =>
                            handleQuantityChange(
                              item.id,
                              selectedQty + 1,
                              maxQty,
                            )
                          }
                          className="w-8 h-8 rounded bg-gray-800 items-center justify-center"
                          disabled={selectedQty >= maxQty}
                        >
                          <Text
                            className={`font-bold ${
                              selectedQty >= maxQty
                                ? "text-gray-600"
                                : "text-white"
                            }`}
                          >
                            +
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                    {!isSelected && (
                      <Text className="text-sm text-gray-500">
                        max {maxQty}
                      </Text>
                    )}
                  </View>
                );
              })}

            {/* Selected Items Total */}
            {selectedItemsTotal > 0 && (
              <View className="mt-4 bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
                <Text className="text-sm text-gray-400">Refund Amount</Text>
                <Text className="text-2xl font-bold text-red-400">
                  ${selectedItemsTotal.toFixed(2)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Payments Selection View */}
        {refundType === "payments" && (
          <View className="px-4">
            <Text className="text-xs text-gray-500 mb-3">
              Select payments to void/refund
            </Text>
            {refundablePayments.length === 0 ? (
              <View className="py-8 items-center">
                <View className="w-12 h-12 rounded-full bg-gray-800/50 items-center justify-center mb-3">
                  <CreditCard size={24} color="#4B5563" />
                </View>
                <Text className="text-gray-500 text-sm">
                  No refundable payments
                </Text>
              </View>
            ) : (
              refundablePayments.map((payment, index) => {
                const isSelected = selectedPayments.has(index);

                return (
                  <View
                    key={index}
                    className={`flex-row items-center py-3 border-b border-gray-800/50 ${
                      isSelected ? "bg-blue-500/5" : ""
                    }`}
                  >
                    <TouchableOpacity
                      onPress={() => handleTogglePayment(index)}
                      className={`w-6 h-6 rounded border mr-3 items-center justify-center ${
                        isSelected
                          ? "bg-blue-500 border-blue-500"
                          : "border-gray-600"
                      }`}
                    >
                      {isSelected && <Check size={14} color="#FFFFFF" />}
                    </TouchableOpacity>

                    {/* Payment Method Icon */}
                    <View className="w-10 h-10 rounded-lg bg-gray-800 items-center justify-center mr-3">
                      {payment.method === "Card" ? (
                        <CreditCard size={18} color="#9CA3AF" />
                      ) : (
                        <Banknote size={18} color="#22C55E" />
                      )}
                    </View>

                    {/* Payment Details */}
                    <View className="flex-1">
                      <Text className="text-sm font-medium text-white">
                        {payment.method === "Card" && payment.last4
                          ? `•••• ${payment.last4}`
                          : payment.method}
                      </Text>
                      <Text className="text-xs text-gray-500">
                        {new Date(payment.timestamp).toLocaleString("en-US", {
                          month: "short",
                          day: "numeric",
                          hour: "numeric",
                          minute: "2-digit",
                          hour12: true,
                        })}
                      </Text>
                    </View>

                    {/* Amount */}
                    <View className="items-end">
                      {payment.tipAmount > 0 && (
                        <Text className="text-xs text-blue-400">
                          +${payment.tipAmount.toFixed(2)} tip
                        </Text>
                      )}
                      <Text className="text-base font-bold text-emerald-400">
                        ${payment.collected.toFixed(2)}
                      </Text>
                    </View>
                  </View>
                );
              })
            )}

            {/* Selected Payments Total */}
            {selectedPaymentsTotal > 0 && (
              <View className="mt-4 bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
                <View className="flex-row justify-between items-center mb-1">
                  <Text className="text-sm text-gray-400">
                    {selectedPayments.size} payment
                    {selectedPayments.size > 1 ? "s" : ""} selected
                  </Text>
                </View>
                <Text className="text-2xl font-bold text-red-400">
                  ${selectedPaymentsTotal.toFixed(2)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* Custom Amount View */}
        {refundType === "amount" && (
          <View className="px-4">
            <View className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800">
              <Text className="text-sm text-gray-400 mb-2">Enter Amount</Text>
              <View className="flex-row items-center">
                <Text className="text-3xl font-bold text-white mr-2">$</Text>
                <TextInput
                  value={refundAmount}
                  onChangeText={(text) => {
                    // Only allow numbers and one decimal
                    const cleaned = text.replace(/[^0-9.]/g, "");
                    const parts = cleaned.split(".");
                    if (parts.length > 2) return;
                    if (parts[1]?.length > 2) return;
                    setRefundAmount(cleaned);
                  }}
                  placeholder="0.00"
                  placeholderTextColor="#4B5563"
                  keyboardType="decimal-pad"
                  className="text-3xl font-bold text-white flex-1"
                />
              </View>
              <Text className="text-xs text-gray-500 mt-2">
                Max refundable: ${maxRefundable.toFixed(2)}
              </Text>
            </View>
          </View>
        )}

        {/* Reason Input */}
        <View className="px-4 mt-4">
          <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
            Reason (Required)
          </Text>
          <TextInput
            value={refundReason}
            onChangeText={setRefundReason}
            placeholder="Enter reason for refund..."
            placeholderTextColor="#4B5563"
            multiline
            numberOfLines={3}
            className="bg-[#1a1a1a] rounded-xl p-4 border border-gray-800 text-white text-sm"
            style={{ textAlignVertical: "top", minHeight: 80 }}
          />
        </View>
      </ScrollView>

      {/* Process Button */}
      <View className="absolute bottom-0 left-0 right-0 px-4 py-4 bg-[#1a1a1a] border-t border-gray-800">
        <TouchableOpacity
          onPress={() => {
            const items =
              refundType === "items"
                ? Object.entries(selectedItems).map(([id, qty]) => ({
                    itemId: id,
                    quantity: qty,
                  }))
                : undefined;
            const paymentIds =
              refundType === "payments"
                ? Array.from(selectedPayments).map((index) => {
                    // Return payment identifier - could be payment ID or index
                    return String(index);
                  })
                : undefined;
            onProcessRefund(
              refundType,
              getRefundAmount(),
              refundReason,
              items,
              paymentIds,
            );
          }}
          disabled={!canProcess}
          className={`w-full py-4 rounded-xl items-center justify-center ${
            canProcess ? "bg-red-500" : "bg-gray-700"
          }`}
        >
          <Text
            className={`text-base font-bold ${
              canProcess ? "text-white" : "text-gray-500"
            }`}
          >
            Process Refund • ${getRefundAmount().toFixed(2)}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

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
const PaymentDetailBottomSheetComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  {}
> = (props, ref) => {
  const { show } = useToast();
  const router = useRouter();
  const internalRef = useRef<BottomSheetMethods>(null);

  const { isOpen, orderId, close } = usePaymentDetailSheetStore();
  const updateOrderCheckStatus = useOrderStore((s) => s.updateOrderCheckStatus);

  const [rightPaneView, setRightPaneView] = useState<RightPaneView>("summary");

  // Get order data - first try active orders, then previous orders
  const activeOrder = useOrderStore((state) => {
    if (!orderId) return null;
    return state.ordersById[orderId] || null;
  });

  // DEBUG: console.log('[PaymentDetailSheet]',activeOrder)
  // Fallback to previousOrders for history orders
  const previousOrder = usePreviousOrdersStore((state) => {
    if (!orderId || activeOrder) return null;
    return state.previousOrders.find((po) => po.orderId === orderId) || null;
  });

  // Map previousOrder to OrderProfile format (same as PreviousOrdersSection)
  const order = useMemo((): OrderProfile | null => {
    if (activeOrder) return activeOrder;
    if (!previousOrder) return null;

    return {
      id: previousOrder.orderId,
      db_order_id: previousOrder.db_order_id,
      display_number: previousOrder.display_number,
      order_number: previousOrder.display_number,
      customer_name: previousOrder.customer,
      server_name: previousOrder.server,
      order_status: previousOrder.refunded
        ? "refunded"
        : previousOrder.closed_at
          ? "completed"
          : "pending",
      check_status: previousOrder.checkStatus || "Opened",
      paid_status: previousOrder.paymentStatus,
      order_type: previousOrder.type,
      items: previousOrder.items || [],
      total_amount: previousOrder.total,
      total_cash_amount: previousOrder.total, // Fallback
      total_tax: 0, // Will be calculated if available
      total_discount: 0,
      amount_paid: previousOrder.amount_paid,
      amount_due: previousOrder.amount_due,
      opened_at: previousOrder.timestamp || previousOrder.opened_at,
      created_at: previousOrder.timestamp,
      closed_at: previousOrder.closed_at,
      service_location_id: previousOrder.service_location_id || null,
      service_location_name: previousOrder.service_location_name,
      station_id: previousOrder.station_id || null,
      _sourceStationName: previousOrder.station_name,
      notes: previousOrder.notes,
      payments: previousOrder.payments || [],
    } as OrderProfile;
  }, [activeOrder, previousOrder]);

  // Reset view when sheet opens (Modal is controlled by isOpen state directly)
  useEffect(() => {
    if (isOpen && orderId) {
      setRightPaneView("summary");
    }
  }, [isOpen, orderId]);

  // Expose methods for compatibility (not needed for Modal but keeps the interface)
  useImperativeHandle(
    ref,
    () =>
      ({
        snapToIndex: () => {},
        snapToPosition: () => {},
        expand: () => {},
        collapse: () => {},
        close: () => close(),
        forceClose: () => close(),
      }) as BottomSheetMethods,
  );

  // Calculate payment summary
  const paymentSummary = useMemo(() => {
    if (!order) {
      return {
        orderTotal: 0,
        orderCashTotal: 0,
        refunds: 0,
        collected: 0,
        payments: [] as PaymentRowData[],
      };
    }

    let totalRefunded = 0;
    let totalCollected = 0;
    const payments: PaymentRowData[] = [];

    if (order.payments && order.payments.length > 0) {
      order.payments.forEach((payment: any) => {
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
      orderCashTotal: order.total_cash_amount || 0,
      refunds: totalRefunded,
      collected: totalCollected,
      payments,
    };
  }, [order]);

  // Calculate order totals for left pane
  const orderTotals = useMemo(() => {
    if (!order) return { subtotal: 0, discount: 0, tax: 0, total: 0 };

    const subtotal = (order.items || []).reduce(
      (sum: number, item: CartItem) =>
        item.is_voided ? sum : sum + (item.price || 0) * item.quantity,
      0,
    );
    const discount = order.total_discount || 0;
    const tax = order.total_tax || 0;
    const total = order.total_amount || 0;

    return { subtotal, discount, tax, total };
  }, [order]);

  // Handlers
  const handleReopenOrder = useCallback(() => {
    if (!orderId) return;
    updateOrderCheckStatus(orderId, "Opened");
    show({
      title: "Order Reopened",
      message: "This order is now open for editing and payments.",
      type: "success",
    });
  }, [orderId, updateOrderCheckStatus, show]);

  const handleContinueCharging = useCallback(() => {
    if (!orderId) return;
    useOrderStore.getState().setActiveOrder(orderId);
    close();
    // router.push("/order-processing");
  }, [orderId, close, router]);

  const handleIssueReceipt = useCallback(() => {
    show({
      title: "Issue Receipt",
      message: "Receipt printing functionality coming soon",
      type: "warning",
    });
  }, [show]);

  const handleRefund = useCallback(() => {
    setRightPaneView("refund");
  }, []);

  const handleProcessRefund = useCallback(
    (
      type: RefundType,
      amount: number,
      reason: string,
      selectedItems?: any[],
      selectedPaymentIds?: string[],
    ) => {
      // TODO: Implement actual refund processing via store
      console.log("Processing refund:", {
        type,
        amount,
        reason,
        selectedItems,
        selectedPaymentIds,
      });
      show({
        title: "Refund Processed",
        message: `$${amount.toFixed(2)} refund processed successfully.`,
        type: "success",
      });
      setRightPaneView("summary");
    },
    [show],
  );

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent={true}
      onRequestClose={close}
      statusBarTranslucent
    >
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.6)",
          justifyContent: "flex-end",
        }}
      >
        <View
          style={{
            height: "90%",
            backgroundColor: "#161616",
            borderTopLeftRadius: 16,
            borderTopRightRadius: 16,
          }}
        >
          {!order ? (
            <View className="flex-1 items-center justify-center">
              <Text className="text-gray-500">Loading order...</Text>
            </View>
          ) : (
            <View className="flex-1">
              {/* Header */}
              <View className="flex-row items-center justify-between px-4 py-3 border-b border-gray-800">
                <View className="flex-row items-center">
                  <Text className="text-xl font-bold text-white">
                    Payment Details
                  </Text>
                  <Text className="text-lg text-gray-500 ml-2">
                    Order{" "}
                    {order.display_number ||
                      order.order_number?.slice(-6) ||
                      "—"}
                  </Text>
                </View>
                <View className="flex-row items-center gap-3">
                  {/* Status Badge */}
                  <View
                    className={`px-3 py-1.5 rounded-full flex-row items-center ${
                      order.check_status === "Opened"
                        ? "bg-emerald-500/15 border border-emerald-500/40"
                        : "bg-gray-700/50 border border-gray-600"
                    }`}
                  >
                    <View
                      className={`w-2 h-2 rounded-full mr-2 ${
                        order.check_status === "Opened"
                          ? "bg-emerald-400"
                          : "bg-gray-500"
                      }`}
                    />
                    <Text
                      className={`text-xs font-semibold uppercase ${
                        order.check_status === "Opened"
                          ? "text-emerald-400"
                          : "text-gray-400"
                      }`}
                    >
                      {order.check_status === "Opened" ? "Open" : "Closed"}
                    </Text>
                  </View>
                  {/* Close Button */}
                  <TouchableOpacity
                    onPress={close}
                    className="px-4 py-2 rounded-lg bg-gray-800 items-center justify-center"
                  >
                    <Text className="text-sm font-semibold text-gray-300">
                      CLOSE
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Split Pane Content */}
              <View className="flex-1 flex-row">
                {/* Left Pane - Order Receipt */}
                <LeftPane
                  order={order}
                  subtotal={orderTotals.subtotal}
                  discount={orderTotals.discount}
                  tax={orderTotals.tax}
                  total={orderTotals.total}
                />

                {/* Right Pane - Summary or Refund */}
                {rightPaneView === "summary" ? (
                  <RightPaneSummary
                    order={order}
                    paymentSummary={paymentSummary}
                    onReopenOrder={handleReopenOrder}
                    onContinueCharging={handleContinueCharging}
                    onIssueReceipt={handleIssueReceipt}
                    onRefund={handleRefund}
                    formatTimestamp={formatTimestamp}
                  />
                ) : (
                  <RightPaneRefund
                    order={order}
                    paymentSummary={paymentSummary}
                    onBack={() => setRightPaneView("summary")}
                    onProcessRefund={handleProcessRefund}
                  />
                )}
              </View>
            </View>
          )}
        </View>
      </View>
    </Modal>
  );
};

const PaymentDetailBottomSheet = React.forwardRef(
  PaymentDetailBottomSheetComponent,
);
PaymentDetailBottomSheet.displayName = "PaymentDetailBottomSheet";

export default PaymentDetailBottomSheet;
