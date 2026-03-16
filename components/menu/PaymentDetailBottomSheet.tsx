import { useToast, ToastRenderer } from "@/contexts/ToastContext";
import { colors } from "@/lib/theme";
import type { CartItem, OrderPaymentItemCoverage, OrderProfile, OrderProfilePayment, OrderRefundItemRecord, ReversalRecord } from "@/lib/types";
import { PrinterService } from "@/services/printing/PrinterService";
import { useNoPrinterModalStore } from "@/stores/useNoPrinterModalStore";
import { useRefundMutation, type PerPaymentRefundDetail } from "@/hooks/orders/useRefundMutation";
import { useTipAdjustMutation } from "@/hooks/orders/useTipAdjustMutation";
import { useOrderDetailsFetch } from "@/hooks/orders/useOrderDetailsFetch";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import { usePreviousOrdersStore } from "@/stores/usePreviousOrdersStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { getTerminalMatchInfo } from "@/utils/terminalMatchGuard";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { formatDistanceToNow } from "date-fns";
import { useRouter } from "expo-router";
import {
    ArrowLeft,
    Banknote,
    Check,
    ChefHat,
    ChevronDown,
    ChevronUp,
    CircleDollarSign,
    CreditCard,
    Delete,
    DollarSign,
    Package,
    Printer,
    RefreshCcw,
    Globe,
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
  ActivityIndicator,
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
  cardInfo?: {
    brand?: string;
    last4?: string;
    entryMode?: string;
    authCode?: string;
    rrn?: string;
    transactionNumber?: string;
    referenceId?: string;
    invoiceNumber?: string;
  };
  itemsCovered?: OrderPaymentItemCoverage[];
  isCashPriced?: boolean;
  cashSavings?: number;
  subtotal_portion?: number;
  tax_portion?: number;
  paymentId?: string;
  dbPaymentId?: string;
  originalPaymentIndex: number;
  referenceId?: string;
  refundedAmount?: number;
  original_tip_amount?: number;
  tip_adjusted_at?: string;
  tip_adjusted_by?: string;
  amountTendered?: number;
  changeGiven?: number;
}

type RightPaneView = "summary" | "refund" | "tipAdjust";

interface TipAdjustPaymentRow {
  paymentIndex: number;
  paymentId?: string;
  dbPaymentId?: string;
  method: string;
  orderAmount: number;
  currentTip: number;
  referenceId?: string;
  rrn?: string;
  last4?: string;
  cardBrand?: string;
  entryMode?: string;
  timestamp?: string;
  isCard: boolean;
}
type RefundType = "full" | "items" | "payments";

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
        return "bg-card border-gray-600 active:bg-gray-700";
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
  accentColor = colors.info,
}) => (
  <View
    className="flex-1 bg-card rounded-xl p-3 border border-gray-800"
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
      {isNegative && amount > 0 ? "−" : ""}${amount?.toFixed(2)}
    </Text>
    {cashAmount !== undefined && cashAmount > 0 && (
      <View className="flex-row items-center mt-0.5">
        <Banknote color={colors.success} size={14} />
        <Text className="text-sm font-medium text-gray-400 ml-1">
          ${cashAmount?.toFixed(2)}
        </Text>
      </View>
    )}
    <Text className="text-xs text-gray-500 mt-1 font-medium">{label}</Text>
  </View>
);

const normalizeCardBrand = (brand?: string) =>
  brand?.trim().toLowerCase() || "";

const formatCardBrand = (brand?: string) => {
  switch (normalizeCardBrand(brand)) {
    case "visa":
      return "Visa";
    case "mastercard":
      return "Mastercard";
    case "amex":
    case "american express":
      return "Amex";
    case "discover":
      return "Discover";
    case "diners":
    case "diners club":
      return "Diners";
    case "jcb":
      return "JCB";
    default:
      return brand ? brand : "";
  }
};

const getCardBrandBadgeStyles = (brand?: string) => {
  switch (normalizeCardBrand(brand)) {
    case "visa":
      return { container: "bg-blue-500/10 border-blue-500/40", text: "text-blue-300" };
    case "mastercard":
      return { container: "bg-amber-500/10 border-amber-500/40", text: "text-amber-300" };
    case "amex":
    case "american express":
      return { container: "bg-cyan-500/10 border-cyan-500/40", text: "text-cyan-300" };
    case "discover":
      return { container: "bg-orange-500/10 border-orange-500/40", text: "text-orange-300" };
    default:
      return { container: "bg-gray-800 border-gray-700", text: "text-gray-300" };
  }
};

const CardBrandBadge: React.FC<{ brand?: string }> = ({ brand }) => {
  const label = formatCardBrand(brand);
  if (!label) return null;
  const styles = getCardBrandBadgeStyles(brand);

  return (
    <View className={`px-2 py-0.5 rounded border ${styles.container}`}>
      <Text className={`text-[10px] font-semibold uppercase ${styles.text}`}>
        {label}
      </Text>
    </View>
  );
};

const CardInfoItem: React.FC<{ label: string; value?: string }> = ({
  label,
  value,
}) => {
  if (!value) return null;
  return (
    <View className="w-1/2 pr-2 mb-2">
      <Text className="text-[10px] text-gray-500 uppercase">{label}</Text>
      <Text className="text-xs text-gray-200" numberOfLines={1}>
        {value}
      </Text>
    </View>
  );
};

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
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);

  // Build timeline entries for an item
  const getItemTimeline = useCallback((item: CartItem) => {
    const entries: { type: 'ordered' | 'paid' | 'refunded' | 'voided'; label: string; timestamp?: string }[] = [];

    // Payment entries - match via itemsCovered
    if (order?.payments) {
      (order.payments as OrderProfilePayment[]).forEach((payment: OrderProfilePayment) => {
        const covered = payment.itemsCovered?.find(
          (c: OrderPaymentItemCoverage) => c.itemId === item.db_order_item_id
        );
        if (covered && !payment.isVoided) {
          const method = payment.method?.toLowerCase() === 'card' ? 'Card' : 'Cash';
          const last4 = payment.last4 || payment.transactionDetails?.dejavooTransaction?.cardLast4;
          const desc = method === 'Card' && last4
            ? `Paid — ${payment.cardBrand || 'Card'} ••••${last4}`
            : `Paid — ${method}`;
          entries.push({ type: 'paid', label: desc, timestamp: payment.timestamp });
        }
      });
    }

    // Refund entries
    if (order?.order_refund_items) {
      (order.order_refund_items as OrderRefundItemRecord[]).forEach((refundItem: OrderRefundItemRecord) => {
        if (refundItem.order_item_id === item.db_order_item_id) {
          // Find the linked reversal for reason
          const reversal = (order.reversals as ReversalRecord[] || []).find(
            (r: ReversalRecord) => r.id === refundItem.reversal_id
          );
          const reason = refundItem.refund_reason_detail || reversal?.reason_description || refundItem.refund_reason;
          const desc = reason ? `Refunded — ${reason}` : 'Refunded';
          entries.push({ type: 'refunded', label: desc, timestamp: refundItem.created_at });
        }
      });
    }

    // Void entry
    if (item.is_voided) {
      const desc = item.void_reason ? `Voided — ${item.void_reason}` : 'Voided';
      entries.push({ type: 'voided', label: desc });
    }

    // Sort chronologically so events appear in the order they occurred
    entries.sort((a, b) => {
      if (!a.timestamp) return 1;
      if (!b.timestamp) return -1;
      return new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();
    });

    return entries;
  }, [order]);

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
            {'   '}
            {(priceAdjust && priceAdjust > 0) ? (
              <Text className="text-emerald-500 text-xs"> +${priceAdjust?.toFixed(2)}</Text>
            )
          : (
            <Text className="text-gray-500 text-xs"> +${priceAdjust?.toFixed(2)}</Text>
          )
          }
          </Text>
        </View>
      );
    });
  };

  return (
    <View className="flex-[4] bg-panel border-r border-gray-800">
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

            // Count currently-covered quantity from active payments
            let coveredQty = 0;
            if (order?.payments) {
              (order.payments as OrderProfilePayment[]).forEach((payment: OrderProfilePayment) => {
                if (payment.isVoided) return;
                const covered = payment.itemsCovered?.find(
                  (c: OrderPaymentItemCoverage) => c.itemId === item.db_order_item_id
                );
                if (covered) coveredQty += covered.quantity;
              });
            }
            // Subtract refunded quantity to get net covered
            let refundedQty = 0;
            if (order?.order_refund_items) {
              (order.order_refund_items as OrderRefundItemRecord[]).forEach((ri: OrderRefundItemRecord) => {
                if (ri.order_item_id === item.db_order_item_id) refundedQty += ri.quantity_refunded;
              });
            }
            const netCoveredQty = coveredQty - refundedQty;

            const hasRefundHistory = refundedQty > 0;
            const isPaid = netCoveredQty >= item.quantity;
            const isPartialPaid = netCoveredQty > 0 && netCoveredQty < item.quantity;
            const isFullyRefunded = hasRefundHistory && netCoveredQty <= 0;
            const isPartiallyRefunded = hasRefundHistory && netCoveredQty > 0 && netCoveredQty < item.quantity;

            // Determine left border color based on kitchen status
            const borderColor = isVoided
              ? colors.danger
              : item.kitchen_status === "ready"     ? colors.success
              : item.kitchen_status === "preparing" ? colors.warning
              : item.kitchen_status === "sent"      ? colors.warning
              : item.kitchen_status === "served"    ? colors.label
              : colors.muted;

            const isUnpaid = !isVoided && !isPaid && !isPartialPaid && !hasRefundHistory;
            const itemKey = item.id || String(index);
            const isExpanded = expandedItemId === itemKey;
            const timeline = isExpanded ? getItemTimeline(item) : [];

            return (
              <TouchableOpacity
                key={itemKey}
                activeOpacity={0.7}
                onPress={() => setExpandedItemId(isExpanded ? null : itemKey)}
              >
                <View
                  style={{ borderLeftWidth: 3, borderLeftColor: borderColor }}
                  className={`py-3 pl-3 ${
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
                        {isFullyRefunded && !isVoided && (
                          <View className="bg-red-500/20 px-1.5 py-0.5 rounded mr-2">
                            <Text className="text-[10px] font-bold text-red-400">
                              REFUNDED
                            </Text>
                          </View>
                        )}
                        {isPartiallyRefunded && !isVoided && (
                          <View className="bg-orange-500/20 px-1.5 py-0.5 rounded mr-2">
                            <Text className="text-[10px] font-bold text-orange-400">
                              {item.refundedQuantity} REFUND
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
                        {isPartialPaid && !isVoided && !hasRefundHistory && (
                          <View className="bg-amber-500/20 px-1.5 py-0.5 rounded mr-2">
                            <Text className="text-[10px] font-bold text-amber-400">
                              {netCoveredQty}/{item.quantity}
                            </Text>
                          </View>
                        )}
                        <Text
                          className={`text-sm font-medium ${
                            isVoided
                              ? "text-gray-500 line-through"
                              : isFullyRefunded
                              ? "text-gray-500 line-through"
                              : isUnpaid
                              ? "text-white font-bold"
                              : "text-white"
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

                    {/* Quantity & Price + Status Icon */}
                    <View className="items-end flex-row">
                      <View className="items-end mr-1">
                        <Text
                          className={`text-xs ${
                            isVoided ? "text-gray-600" : "text-gray-400"
                          }`}
                        >
                          {item.quantity}x
                        </Text>
                        <Text
                          className={`text-sm font-semibold ${
                            isVoided
                              ? "text-gray-600 line-through"
                              : isFullyRefunded
                              ? "text-red-400 line-through"
                              : "text-white"
                          }`}
                        >
                          {isFullyRefunded && !isVoided ? '-' : ''}${((item.price || 0) * item.quantity)?.toFixed(2)}
                        </Text>
                      </View>
                      {/* Status icon */}
                      {isPaid && !isVoided && (
                        <Check size={14} color={colors.success} />
                      )}
                      {isFullyRefunded && !isVoided && (
                        <RotateCcw size={14} color={colors.danger} />
                      )}
                      {isPartiallyRefunded && !isVoided && (
                        <RotateCcw size={12} color={colors.warning} />
                      )}
                      {/* Expand/collapse chevron */}
                      {isExpanded ? (
                        <ChevronUp size={14} color={colors.muted} style={{ marginLeft: 2 }} />
                      ) : (
                        <ChevronDown size={14} color={colors.muted} style={{ marginLeft: 2 }} />
                      )}
                    </View>
                  </View>

                  {/* Collapsible Timeline */}
                  {isExpanded && timeline.length > 0 && (
                    <View className="mt-2 ml-2" style={{ paddingLeft: 12, borderLeftWidth: 1, borderLeftColor: colors.border }}>
                      {timeline.map((entry, tIdx) => {
                        const dotColor = entry.type === 'paid'
                          ? colors.success
                          : entry.type === 'refunded' || entry.type === 'voided'
                          ? colors.danger
                          : colors.info;
                        return (
                          <View key={tIdx} className="flex-row items-start mb-1.5">
                            <View
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: 4,
                                backgroundColor: dotColor,
                                marginTop: 3,
                                marginLeft: -16,
                              }}
                            />
                            <View className="ml-2 flex-1">
                              <Text className="text-xs text-gray-300">{entry.label}</Text>
                              {entry.timestamp && (
                                <Text className="text-[10px] text-gray-500">
                                  {formatDistanceToNow(new Date(entry.timestamp), { addSuffix: true })}
                                </Text>
                              )}
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                  {isExpanded && timeline.length === 0 && (
                    <View className="mt-2 ml-2">
                      <Text className="text-[10px] text-gray-600 italic">No history available</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          })}

          {/* Empty State */}
          {(!order?.items || order.items.length === 0) && (
            <View className="py-12 items-center">
              <Package size={32} color={colors.muted} />
              <Text className="text-gray-500 text-sm mt-2">No items</Text>
            </View>
          )}
        </View>
      </ScrollView>

      {/* Pricing Footer */}
      <View className="px-4 py-3 border-t border-gray-800 bg-screen">
        <View className="flex-row justify-between mb-1">
          <Text className="text-sm text-gray-400">Subtotal</Text>
          <Text className="text-sm text-gray-300">${subtotal?.toFixed(2)}</Text>
        </View>
        {discount > 0 && (
          <View className="flex-row justify-between mb-1">
            <Text className="text-sm text-emerald-400">Discount</Text>
            <Text className="text-sm text-emerald-400">
              -${discount?.toFixed(2)}
            </Text>
          </View>
        )}
        <View className="flex-row justify-between mb-2">
          <Text className="text-sm text-gray-400">Tax</Text>
          <Text className="text-sm text-gray-300">${tax?.toFixed(2)}</Text>
        </View>
        <View className="flex-row justify-between pt-2 border-t border-gray-700">
          <Text className="text-base font-bold text-white">Total</Text>
          <Text className="text-base font-bold text-white">
            ${total?.toFixed(2)}
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
  onCloseOrder: () => void;
  onContinueCharging: () => void;
  onIssueReceipt: () => void;
  onPrintKitchenTicket: () => void;
  onTipAdjust: () => void;
  onRefund: () => void;
  formatTimestamp: (timestamp: string) => string;
  terminalCanProcess: boolean;
  terminalBlockReason?: string;
}

const RightPaneSummary: React.FC<RightPaneSummaryProps> = ({
  order,
  paymentSummary,
  onReopenOrder,
  onCloseOrder,
  onContinueCharging,
  onIssueReceipt,
  onPrintKitchenTicket,
  onTipAdjust,
  onRefund,
  formatTimestamp,
  terminalCanProcess,
  terminalBlockReason,
}) => {
  const [expandedPaymentIndex, setExpandedPaymentIndex] = useState<
    number | null
  >(null);

  const isOpen = order?.check_status === "Opened";
  const balanceDue = paymentSummary.orderTotal - (paymentSummary.collected - (paymentSummary.tips || 0)) + (paymentSummary.refunds || 0);
  const hasBalanceDue = balanceDue > 0.01;
  console.log("balanceDue", balanceDue?.toFixed(2));
  const hasCardPayments = paymentSummary.payments.some(
    (p) => p.method === "Card" && !p.isVoided
  );

  // Helper to get completed reversals for a specific payment
  const getReversalsForPayment = useCallback((paymentId: string | undefined): ReversalRecord[] => {
    if (!paymentId || !order?.reversals) return [];
    return (order.reversals as ReversalRecord[]).filter(
      (r) => r.original_payment_id === paymentId && r.status === 'completed'
    );
  }, [order?.reversals]);
  console.log("paymentSummary", paymentSummary?.payments?.[0]?.itemsCovered);
  return (
    <View className="flex-[6] bg-screen">
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
              icon={<DollarSign size={16} color={colors.info} />}
              accentColor={colors.info}
            />
            <SummaryCard
              amount={paymentSummary.refunds}
              label={
                ((order?.reversals as ReversalRecord[] || []).filter((r: ReversalRecord) => r.status === 'completed').length > 0)
                  ? `Refunds (${(order?.reversals as ReversalRecord[] || []).filter((r: ReversalRecord) => r.status === 'completed').length})`
                  : "Refunds"
              }
              icon={<RefreshCcw size={14} color={colors.danger} />}
              isNegative
              accentColor={colors.danger}
            />
            <SummaryCard
              amount={paymentSummary.collected - paymentSummary.refunds}
              label="Net Collected"
              icon={<CircleDollarSign size={16} color={colors.success} />}
              accentColor={colors.success}
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
                <CreditCard size={24} color={colors.muted} />
              </View>
              <Text className="text-gray-500 text-sm">
                No payments recorded
              </Text>
            </View>
          ) : (
            paymentSummary.payments.map((payment, index) => {
              const hasItemsCovered =
                payment.itemsCovered && payment.itemsCovered.length > 0;
              const hasCardInfo =
                !!payment.cardInfo &&
                Object.values(payment.cardInfo).some(Boolean);
              const canExpand = hasItemsCovered || hasCardInfo;
              const isExpanded = expandedPaymentIndex === index;
              const cardBrandLabel = formatCardBrand(
                payment.cardInfo?.brand || payment.cardBrand
              );
              const cardLast4 = payment.cardInfo?.last4 || payment.last4;

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
                      canExpand && setExpandedPaymentIndex(isExpanded ? null : index)
                    }
                    activeOpacity={canExpand ? 0.7 : 1}
                    className="flex-row items-center py-3"
                  >
                    {/* Payment Method Icon */}
                    <View
                      className={`w-10 h-10 rounded-lg items-center justify-center mr-3 ${
                        payment.isVoided ? "bg-red-500/10" : "bg-gray-800"
                      }`}
                    >
                      {payment.isVoided ? (
                        <X size={18} color={colors.danger} />
                      ) : payment.method === "Card" ? (
                        <CreditCard size={18} color={colors.label} />
                      ) : (
                        <Banknote size={18} color={colors.success} />
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
                          {payment.method === "Card" && (cardLast4 || cardBrandLabel)
                            ? `${cardBrandLabel || "Card"}${
                                cardLast4 ? ` •••• ${cardLast4}` : ""
                              }`
                            : payment.method}
                        </Text>
                        {payment.method === "Card" && cardBrandLabel && (
                          <View className="ml-2">
                            <CardBrandBadge brand={cardBrandLabel} />
                          </View>
                        )}
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
                        {canExpand && (
                          <View className="flex-row items-center ml-2">
                            <Package size={10} color={colors.muted} />
                            {hasItemsCovered && (
                              <Text className="text-xs text-gray-500 ml-1">
                                {payment.itemsCovered!.length} items
                              </Text>
                            )}
                            {isExpanded ? (
                              <ChevronUp size={12} color={colors.muted} />
                            ) : (
                              <ChevronDown size={12} color={colors.muted} />
                            )}
                          </View>
                        )}
                      </View>
                    </View>

                    {/* Amount */}
                    <View className="items-end">
                      {payment.tipAmount > 0 && (
                        <Text className="text-xs text-blue-400">
                          +${payment.tipAmount?.toFixed(2)} tip
                        </Text>
                      )}
                      <Text
                        className={`text-base font-bold ${
                          payment.isVoided ? "text-red-400" : "text-emerald-400"
                        }`}
                      >
                        {payment.isVoided
                          ? "Voided"
                          : `$${payment.collected?.toFixed(2)}`}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  {/* Expanded Details */}
                  {isExpanded && canExpand && (
                    <View className="bg-panel rounded-lg mb-3 p-3 border border-gray-800">
                      {hasCardInfo && (
                        <View className={hasItemsCovered ? "mb-3" : ""}>
                          <View className="flex-row items-center mb-2 pb-2 border-b border-gray-800">
                            {payment.method === "Cash" ? (
                              <Banknote size={12} color={colors.muted} />
                            ) : (
                              <CreditCard size={12} color={colors.muted} />
                            )}
                            <Text className="text-xs font-semibold text-gray-400 ml-1.5 uppercase">
                              {payment.method === "Cash" ? "Cash Payment Details" : "Card Details"}
                            </Text>
                          </View>
                          {/* Card brand/last4 — only for card payments */}
                          {payment.method !== "Cash" && (
                            <View className="flex-row items-center justify-between">
                              <View className="flex-row items-center">
                                {payment.cardInfo?.brand && (
                                  <CardBrandBadge brand={payment.cardInfo.brand} />
                                )}
                                {payment.cardInfo?.last4 && (
                                  <Text className="text-sm text-gray-300 ml-2">
                                    •••• {payment.cardInfo.last4}
                                  </Text>
                                )}
                              </View>
                              {payment.cardInfo?.entryMode && (
                                <Text className="text-xs text-gray-500">
                                  Entry: {payment.cardInfo.entryMode}
                                </Text>
                              )}
                            </View>
                          )}
                          {/* Cash-specific: Amount Tendered & Change Given */}
                          {payment.method === "Cash" && (
                            <View className="flex-row flex-wrap mt-1">
                              {payment.amountTendered != null && (
                                <CardInfoItem label="Amount Tendered" value={`$${payment.amountTendered.toFixed(2)}`} />
                              )}
                              {payment.changeGiven != null && payment.changeGiven > 0 && (
                                <CardInfoItem label="Change Given" value={`$${payment.changeGiven.toFixed(2)}`} />
                              )}
                            </View>
                          )}
                          <View className="flex-row flex-wrap mt-3">
                            {/* Card-only fields */}
                            {payment.method !== "Cash" && (
                              <>
                                <CardInfoItem label="Auth Code" value={payment.cardInfo?.authCode} />
                                <CardInfoItem label="RRN" value={payment.cardInfo?.rrn} />
                                <CardInfoItem
                                  label="Invoice"
                                  value={payment.cardInfo?.invoiceNumber}
                                />
                              </>
                            )}
                            {/* Shared fields */}
                            <CardInfoItem
                              label="Txn #"
                              value={payment.cardInfo?.transactionNumber}
                            />
                            <CardInfoItem
                              label="Ref ID"
                              value={payment.cardInfo?.referenceId}
                            />
                          </View>
                        </View>
                      )}

                      {hasItemsCovered && (() => {
                        const isCash = payment.isCashPriced || payment.method === "Cash";
                        let totalTax = 0;
                        return (
                        <View>
                          <View className="flex-row items-center mb-2 pb-2 border-b border-gray-800">
                            <Package size={12} color={colors.muted} />
                            <Text className="text-xs font-semibold text-gray-400 ml-1.5 uppercase">
                              Items Covered
                            </Text>
                          </View>
                          {payment.itemsCovered!.map((coveredItem, itemIndex) => {
                            // Cross-reference with order items for tax/cash price info
                            const cartItem = order?.items?.find(
                              (ci: CartItem) => ci.db_order_item_id === coveredItem.itemId
                            );
                            const displaySubtotal = isCash && cartItem?.cashSubtotal != null
                              ? (cartItem.cashSubtotal / cartItem.quantity) * coveredItem.quantity
                              : coveredItem.subtotal;
                            const displayUnitPrice = isCash && cartItem?.cashPrice != null
                              ? cartItem.cashPrice
                              : coveredItem.unitPrice;
                            const itemTax = cartItem
                              ? (isCash && cartItem.cashTaxAmount != null
                                  ? (cartItem.cashTaxAmount / cartItem.quantity) * coveredItem.quantity
                                  : (cartItem.taxAmount / cartItem.quantity) * coveredItem.quantity)
                              : 0;
                            totalTax += itemTax;
                            return (
                            <View
                              key={coveredItem.itemId || itemIndex}
                              className={`py-2 ${
                                itemIndex < payment.itemsCovered!.length - 1
                                  ? "border-b border-gray-800/50"
                                  : ""
                              }`}
                            >
                              <View className="flex-row items-center justify-between">
                                <View className="flex-row items-center flex-1">
                                  <View className="w-6 h-6 rounded bg-gray-800 items-center justify-center mr-2">
                                    <Text className="text-xs font-bold text-gray-400">
                                      {coveredItem.quantity}x
                                    </Text>
                                  </View>
                                  <Text className="text-sm text-gray-300" numberOfLines={1}>
                                    {coveredItem.itemName}
                                  </Text>
                                </View>
                                <View className="items-end">
                                  <Text className="text-sm font-medium text-white">
                                    ${displaySubtotal?.toFixed(2)}
                                  </Text>
                                  {isCash && (
                                    <Text className="text-[10px] text-emerald-400">Cash Price</Text>
                                  )}
                                </View>
                              </View>
                              {cartItem && cartItem.taxRate > 0 && (
                                <Text className="text-[11px] text-gray-500 ml-8 mt-0.5">
                                  Tax: ${itemTax.toFixed(2)} ({(cartItem.taxRate)}%)
                                </Text>
                              )}
                            </View>
                            );
                          })}
                          {totalTax > 0 && (
                            <View className="flex-row items-center justify-between pt-2 mt-1 border-t border-gray-700">
                              <Text className="text-xs font-semibold text-gray-400">Total Tax</Text>
                              <Text className="text-xs font-semibold text-gray-300">${totalTax.toFixed(2)}</Text>
                            </View>
                          )}
                        </View>
                        );
                      })()}
                    </View>
                  )}

                  {/* Refund/Void History for this payment */}
                  {payment.dbPaymentId && getReversalsForPayment(payment.dbPaymentId).map((reversal, rIdx) => (
                    <View 
                      key={`reversal-${reversal.id || rIdx}`} 
                      className="flex-row items-center py-2 pl-12 border-t border-gray-800/30"
                    >
                      <View className="w-8 h-8 rounded-lg bg-red-500/10 items-center justify-center mr-3">
                        <RotateCcw size={14} color={colors.danger} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center">
                          <Text className="text-xs text-red-400 font-medium">
                            {reversal.reversal_type === 'void' ? 'VOIDED' : 
                             reversal.reversal_type === 'refund' ? 'REFUNDED' :
                             reversal.reversal_type === 'partial_refund' ? 'PARTIAL REFUND' : 'ITEM RETURN'}
                          </Text>
                          {reversal.reason_description && (
                            <Text className="text-xs text-gray-500 ml-2" numberOfLines={1}>
                              • {reversal.reason_description}
                            </Text>
                          )}
                        </View>
                        <Text className="text-xs text-gray-500">
                          {reversal.completed_at 
                            ? formatDistanceToNow(new Date(reversal.completed_at), { addSuffix: true }) 
                            : reversal.requested_at 
                              ? formatDistanceToNow(new Date(reversal.requested_at), { addSuffix: true })
                              : ''}
                        </Text>
                      </View>
                      <Text className="text-sm font-medium text-red-400">
                        -${Number(reversal.amount || 0)?.toFixed(2)}
                      </Text>
                    </View>
                  ))}

                  {/* Tip Adjustment Log */}
                  {payment.tip_adjusted_at && (
                    <View className="flex-row items-center py-2 pl-12 border-t border-gray-800/30">
                      <View className="w-8 h-8 rounded-lg bg-blue-500/10 items-center justify-center mr-3">
                        <CircleDollarSign size={14} color={colors.info} />
                      </View>
                      <View className="flex-1">
                        <View className="flex-row items-center">
                          <Text className="text-xs text-blue-400 font-medium">
                            TIP ADJUSTED
                          </Text>
                          <Text className="text-xs text-gray-500 ml-2">
                            • ${Number(payment.original_tip_amount || 0).toFixed(2)} → ${Number(payment.tipAmount).toFixed(2)}
                          </Text>
                        </View>
                        <Text className="text-xs text-gray-500">
                          {formatDistanceToNow(new Date(payment.tip_adjusted_at), { addSuffix: true })}
                        </Text>
                      </View>
                      <Text className={`text-sm font-medium ${payment.tipAmount >= (payment.original_tip_amount || 0) ? 'text-blue-400' : 'text-red-400'}`}>
                        {payment.tipAmount >= (payment.original_tip_amount || 0) ? '+' : '-'}${Math.abs(payment.tipAmount - (payment.original_tip_amount || 0)).toFixed(2)}
                      </Text>
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </ScrollView>

      {/* Action Buttons Footer */}
      <View className="absolute bottom-0 left-0 right-0 px-4 py-4 bg-panel border-t border-gray-800">
        <View className="flex-row gap-2">
          {!isOpen && (
            <ActionButton
              icon={<RotateCcw size={16} color={colors.warning} />}
              label="Re-Open"
              onPress={onReopenOrder}
              variant="warning"
            />
          )}
          {isOpen && (
            <ActionButton
              icon={<Check size={16} color={colors.success} />}
              label="Close"
              onPress={onCloseOrder}
              variant="success"
            />
          )}
          {isOpen && hasBalanceDue && (
            <ActionButton
              icon={<DollarSign size={16} color={colors.info} />}
              label="Continue"
              onPress={onContinueCharging}
              variant="primary"
            />
          )}
          <ActionButton
            icon={<Printer size={16} color={colors.success} />}
            label="Receipt"
            onPress={onIssueReceipt}
            variant="success"
          />
          <ActionButton
            icon={<ChefHat size={16} color={colors.warning} />}
            label="Kitchen"
            onPress={onPrintKitchenTicket}
            variant="warning"
          />
          <ActionButton
            icon={<CircleDollarSign size={16} color={colors.info} />}
            label={terminalCanProcess ? "Tip Adjust" : "Tip Adjust — wrong terminal"}
            onPress={onTipAdjust}
            variant="primary"
            disabled={!hasCardPayments || !terminalCanProcess}
          />
          <ActionButton
            icon={<RefreshCcw size={16} color={colors.danger} />}
            label={terminalCanProcess ? "Refund" : "Refund — wrong terminal"}
            onPress={onRefund}
            variant="danger"
            disabled={paymentSummary.collected <= 0 || !terminalCanProcess}
          />
        </View>
      </View>
    </View>
  );
};

// ============================================================================
// RIGHT PANE - TIP ADJUST VIEW
// ============================================================================
interface RightPaneTipAdjustProps {
  order: OrderProfile;
  paymentSummary: {
    orderTotal: number;
    orderCashTotal: number;
    refunds: number;
    collected: number;
    payments: PaymentRowData[];
  };
  onBack: () => void;
  onTipAdjusted: () => void;
  onProcessingChange?: (processing: boolean) => void;
}

const RightPaneTipAdjust: React.FC<RightPaneTipAdjustProps> = ({
  order,
  paymentSummary,
  onBack,
  onTipAdjusted,
  onProcessingChange,
}) => {
  const tipAdjustMutation = useTipAdjustMutation();
  const processing = tipAdjustMutation.isPending;
  console.log('PaymentDetailBottomSheet Payment Summary', paymentSummary);
  const [tipAmounts, setTipAmounts] = useState<Record<number, string>>({});
  const [activeInput, setActiveInput] = useState<number | null>(null);
  const [showHighTipConfirm, setShowHighTipConfirm] = useState(false);

  // Notify parent of processing state changes
  useEffect(() => {
    onProcessingChange?.(processing);
  }, [processing, onProcessingChange]);

  // Filter card payments that are not voided
  const cardPayments: TipAdjustPaymentRow[] = useMemo(() => {
    return paymentSummary.payments
      .filter((p) => p.method === "Card" && !p.isVoided)
      .map((p) => ({
        paymentIndex: p.originalPaymentIndex,
        paymentId: p.paymentId,
        dbPaymentId: p.dbPaymentId,
        method: p.method,
        orderAmount: p.orderAmount,
        currentTip: p.tipAmount,
        referenceId: p.referenceId || p.cardInfo?.referenceId,
        rrn: p.cardInfo?.rrn,
        last4: p.last4 || p.cardInfo?.last4,
        cardBrand: p.cardBrand || p.cardInfo?.brand,
        entryMode: p.cardInfo?.entryMode,
        timestamp: p.timestamp,
        isCard: true,
      }));
  }, [paymentSummary.payments]);

  // Initialize tip amounts from current tips (pre-fill existing values)
  useEffect(() => {
    const initial: Record<number, string> = {};
    cardPayments.forEach((p) => {
      initial[p.paymentIndex] = p.currentTip > 0 ? p.currentTip?.toFixed(2) : "";
    });
    setTipAmounts(initial);
    if (cardPayments.length > 0) {
      setActiveInput(cardPayments[0].paymentIndex);
    }
  }, [cardPayments]);

  // Computed values
  const totalNewTips = useMemo(() => {
    return Object.values(tipAmounts).reduce(
      (sum, val) => sum + (parseFloat(val) || 0),
      0
    );
  }, [tipAmounts]);

  const totalOrderAmount = useMemo(() => {
    return cardPayments.reduce((sum, p) => sum + p.orderAmount || 0, 0);
  }, [cardPayments]);

  const hasChanges = useMemo(() => {
    return cardPayments.some((p) => {
      const newTip = parseFloat(tipAmounts[p.paymentIndex] || "0") || 0;
      return Math.abs(newTip - p.currentTip) > 0.001;
    });
  }, [cardPayments, tipAmounts]);

  const tipDelta = useMemo(() => {
    const totalCurrentTips = cardPayments.reduce((sum, p) => sum + p.currentTip, 0);
    return totalNewTips - totalCurrentTips;
  }, [cardPayments, totalNewTips]);

  // Select a payment row for editing
  const handleSelectPayment = useCallback(
    (paymentIndex: number) => {
      setActiveInput(paymentIndex);
    },
    []
  );

  // Keypad handler
  const handleKeyPress = useCallback(
    (key: string) => {
      if (activeInput === null) return;

      setTipAmounts((prev) => {
        const current = prev[activeInput] || "";

        if (key === "backspace") {
          const updated = current.slice(0, -1);
          return { ...prev, [activeInput]: updated };
        }

        if (key === ".") {
          if (current.includes(".")) return prev;
          return { ...prev, [activeInput]: current + "." };
        }

        // Limit decimal places to 2
        const parts = current.split(".");
        if (parts.length > 1 && parts[1].length >= 2) return prev;

        return { ...prev, [activeInput]: current + key };
      });
    },
    [activeInput]
  );

  // Check if any tip exceeds 30% of the payment amount
  const highTipPayments = useMemo(() => {
    return cardPayments.filter((p) => {
      const newTip = parseFloat(tipAmounts[p.paymentIndex] || "0") || 0;
      return newTip > 0 && p.orderAmount > 0 && newTip > p.orderAmount * 0.3;
    });
  }, [cardPayments, tipAmounts]);

  // Handle adjust tips via mutation
  const handleAdjustTips = async () => {
    try {
      await tipAdjustMutation.mutateAsync({
        dbOrderId: order.db_order_id || order.id,
        payments: cardPayments.map((payment) => ({
          paymentIndex: payment.paymentIndex,
          dbPaymentId: payment.dbPaymentId,
          orderAmount: payment.orderAmount,
          currentTip: payment.currentTip,
          newTip: parseFloat(tipAmounts[payment.paymentIndex] || "0") || 0,
          referenceId: payment.referenceId,
          rrn: payment.rrn,
          last4: payment.last4,
        })),
      });
      onTipAdjusted();
    } catch {
      // Error handling is done by the mutation's onError callback
    }
  };

  // Entry point: check for high tips before proceeding
  const handleAdjustTipsPress = () => {
    if (highTipPayments.length > 0) {
      setShowHighTipConfirm(true);
    } else {
      handleAdjustTips();
    }
  };

  const keypadKeys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [".", "0", "backspace"],
  ];

  // console.log('PaymentDetailBottomSheet', cardPayments);
  return (
    <View className="flex-[6] bg-screen" style={{ position: 'relative' }}>
      {/* Processing Overlay */}
      {processing && (
        <View
          className="absolute inset-0 z-50 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
        >
          <View className="bg-card rounded-2xl p-8 items-center mx-8 border border-gray-700">
            <ActivityIndicator size="large" color={colors.info} />
            <Text className="text-white text-lg font-bold mt-4">Adjusting Tips</Text>
            <Text className="text-gray-400 text-sm mt-2 text-center">
              Processing tip adjustments on terminal...{"\n"}Please do not close this screen.
            </Text>
          </View>
        </View>
      )}

      {/* High Tip Confirmation Modal */}
      <Modal
        visible={showHighTipConfirm}
        transparent
        animationType="fade"
        onRequestClose={() => setShowHighTipConfirm(false)}
      >
        <View
          className="flex-1 items-center justify-center"
          style={{ backgroundColor: "rgba(0,0,0,0.7)" }}
        >
          <View className="bg-card rounded-2xl p-6 mx-8 border border-gray-700" style={{ maxWidth: 400, width: "90%" }}>
            <Text className="text-xl font-bold text-yellow-400 text-center mb-2">
              High Tip Warning
            </Text>
            <Text className="text-gray-300 text-center text-sm mb-4">
              {highTipPayments.length === 1
                ? `The tip entered is more than 30% of the payment amount.`
                : `${highTipPayments.length} tips entered are more than 30% of their payment amounts.`}
            </Text>
            {highTipPayments.map((p) => {
              const newTip = parseFloat(tipAmounts[p.paymentIndex] || "0") || 0;
              const pct = p.orderAmount > 0 ? ((newTip / p.orderAmount) * 100).toFixed(0) : "0";
              return (
                <View key={p.paymentIndex} className="flex-row justify-between py-2 px-3 bg-gray-800/50 rounded-lg mb-2">
                  <Text className="text-gray-300 text-sm">
                    ••••{p.last4 || "????"} (${p.orderAmount?.toFixed(2)})
                  </Text>
                  <Text className="text-yellow-400 text-sm font-bold">
                    ${newTip.toFixed(2)} ({pct}%)
                  </Text>
                </View>
              );
            })}
            <Text className="text-gray-400 text-center text-xs mt-2 mb-5">
              Are you sure you want to proceed?
            </Text>
            <View className="flex-row gap-3">
              <TouchableOpacity
                onPress={() => setShowHighTipConfirm(false)}
                className="flex-1 py-3 rounded-xl bg-gray-800 border border-gray-600 items-center"
              >
                <Text className="text-base font-bold text-gray-300">CANCEL</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => {
                  setShowHighTipConfirm(false);
                  handleAdjustTips();
                }}
                className="flex-1 py-3 rounded-xl bg-yellow-600 items-center"
              >
                <Text className="text-base font-bold text-white">CONFIRM</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-gray-800">
        <TouchableOpacity
          onPress={onBack}
          disabled={processing}
          className="w-8 h-8 rounded-full bg-gray-800 items-center justify-center mr-3"
          style={{ opacity: processing ? 0.3 : 1 }}
        >
          <ArrowLeft size={16} color={colors.label} />
        </TouchableOpacity>
        <Text className="text-lg font-bold text-white">Adjust Tips</Text>
      </View>

      <ScrollView
        className="flex-1"
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ paddingBottom: 120 }}
      >
        {/* Three-Column Table */}
        <View className="px-4 py-4">
          {/* Column Headers */}
          <View className="flex-row items-center px-3 pb-2 border-b border-gray-800">
            <Text className="flex-1 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
              Payments
            </Text>
            <Text className="w-24 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">
              Order
            </Text>
            <Text className="w-28 text-[10px] font-bold text-gray-500 uppercase tracking-wider text-right">
              New Tip
            </Text>
          </View>

          {/* Payment Rows */}
          {cardPayments.map((payment) => {
            const brandLabel = formatCardBrand(payment.cardBrand);
            const isActive = activeInput === payment.paymentIndex;
            const tipValue = tipAmounts[payment.paymentIndex] || "";
            const hasTip = payment.currentTip > 0;

            return (
              <TouchableOpacity
                key={payment.paymentIndex}
                onPress={() => handleSelectPayment(payment.paymentIndex)}
                activeOpacity={0.7}
                className={`flex-row items-center py-4 px-3 border-b border-gray-800/50 ${
                  isActive ? "bg-blue-500/5" : ""
                }`}
              >
                {/* Payment Column */}
                <View className="flex-1 flex-row items-center">
                  {/* Green check for payments with existing tip */}
                  <View className="w-6 items-center justify-center mr-1">
                    {hasTip && <Check size={16} color={colors.success} />}
                  </View>
                  <View className="w-10 h-10 rounded-lg bg-gray-800 items-center justify-center mr-3">
                    <CreditCard size={18} color={colors.label} />
                  </View>
                  <View className="flex-1">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-base font-semibold text-white">
                        {payment.last4 || "••••"}
                        {payment.entryMode ? ` • ${payment.entryMode}` : ""}
                      </Text>
                      {brandLabel ? (
                        <CardBrandBadge brand={payment.cardBrand} />
                      ) : null}
                    </View>
                    <Text className="text-xs text-gray-500 mt-0.5">
                      {brandLabel || "Card"}
                      {payment.timestamp ? ` — ${payment.timestamp}` : ""}
                    </Text>
                  </View>
                </View>

                {/* Amount Column */}
                <Text className="w-24 text-base font-semibold text-white text-right">
                  ${payment.orderAmount?.toFixed(2)}
                </Text>

                {/* New Tip Column */}
                <View className="w-28 items-end">
                  <View
                    className={`rounded-lg border px-3 py-2 ${
                      isActive
                        ? "bg-blue-500/10 border-blue-500/40"
                        : "bg-gray-800/50 border-gray-700"
                    }`}
                  >
                    <Text
                      className={`text-base font-semibold text-right ${
                        tipValue
                          ? isActive ? "text-blue-300" : "text-white"
                          : "text-gray-500"
                      }`}
                    >
                      ${tipValue || "0.00"}
                    </Text>
                  </View>
                  <Text className="text-[10px] text-gray-500 mt-1 text-right">
                    of ${payment.currentTip?.toFixed(2)}
                  </Text>
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Summary Bar */}
        <View className="px-4">
          <View className="flex-row justify-between bg-panel rounded-xl p-4 border border-gray-800">
            <View className="items-center">
              <Text className="text-[10px] font-bold text-gray-500 uppercase mb-1">Order Total</Text>
              <Text className="text-base font-bold text-white">
                ${totalOrderAmount?.toFixed(2)}
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-[10px] font-bold text-gray-500 uppercase mb-1">New Tips</Text>
              <Text className="text-base font-bold text-blue-400">
                ${totalNewTips?.toFixed(2)}
              </Text>
            </View>
            <View className="items-center">
              <Text className="text-[10px] font-bold text-gray-500 uppercase mb-1">Grand Total</Text>
              <Text className="text-base font-bold text-emerald-400">
                ${(totalOrderAmount + totalNewTips)?.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* Numeric Keypad */}
        <View className="px-4 mt-4">
          {keypadKeys.map((row, rowIndex) => (
            <View key={rowIndex} className="flex-row gap-2 mb-2">
              {row.map((key) => (
                <TouchableOpacity
                  key={key}
                  onPress={() => handleKeyPress(key)}
                  className="flex-1 py-3 bg-gray-800 border border-gray-700 rounded-lg items-center justify-center active:bg-gray-600"
                >
                  {key === "backspace" ? (
                    <Delete size={20} color={colors.heading} />
                  ) : (
                    <Text className="text-white text-xl font-semibold">{key}</Text>
                  )}
                </TouchableOpacity>
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      {/* Action Buttons Footer */}
      <View className="absolute bottom-0 left-0 right-0 px-4 py-4 bg-panel border-t border-gray-800">
        <View className="flex-row gap-3">
          <TouchableOpacity
            onPress={onBack}
            disabled={processing}
            className="flex-1 py-4 rounded-xl bg-gray-800 border border-gray-600 items-center justify-center"
          >
            <Text className="text-base font-bold text-gray-300">CANCEL</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={handleAdjustTipsPress}
            disabled={!hasChanges || processing}
            className={`flex-[2] py-4 rounded-xl items-center justify-center ${
              hasChanges && !processing ? "bg-blue-600" : "bg-gray-700"
            }`}
          >
            {processing ? (
              <ActivityIndicator color={colors.heading} />
            ) : (
              <Text
                className={`text-base font-bold ${
                  hasChanges ? "text-white" : "text-gray-500"
                }`}
              >
                {hasChanges
                  ? `ADJUST BY ${tipDelta >= 0 ? "+" : "-"}$${Math.abs(tipDelta)?.toFixed(2)}`
                  : "ADJUST TIPS"}
              </Text>
            )}
          </TouchableOpacity>
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
    totalAmount: number,
    reason: string,
    perPaymentDetails: PerPaymentRefundDetail[],
    selectedItems?: { itemId: string; quantity: number; paymentIndex?: number }[]
  ) => Promise<boolean>;
  refundProcessing: boolean;
}

const RightPaneRefund: React.FC<RightPaneRefundProps> = ({
  order,
  paymentSummary,
  onBack,
  onProcessRefund,
  refundProcessing,
}) => {
  const { show } = useToast();
  const processingRef = useRef(false);
  const [refundType, setRefundType] = useState<RefundType>("full");
  const [refundReason, setRefundReason] = useState("");
  const [selectedItems, setSelectedItems] = useState<Record<string, number>>({});
  const [paymentRefundAmounts, setPaymentRefundAmounts] = useState<
    Record<number, { orderAmount: string; tipAmount: string }>
  >({});
  const [itemPaymentAssignment, setItemPaymentAssignment] = useState<
    Record<string, number>
  >({});

  // console.log("paymentSummary", paymentSummary);
  const maxRefundable =  paymentSummary.collected - paymentSummary.refunds;

  // Filter out voided payments and fully refunded payments - only payments with remaining balance can be refunded
  const refundablePayments = useMemo(() => {
    return paymentSummary.payments.filter((p) => {
      if (p.isVoided) return false;
      // Check if payment has remaining balance to refund
      const remainingBalance = p.collected - (p.refundedAmount || 0);
      return remainingBalance > 0;
    });
  }, [paymentSummary.payments]);

  // Calculate remaining refundable amounts per payment (after partial refunds)
  const getRemainingAmounts = useCallback((payment: PaymentRowData) => {
    const refunded = payment.refundedAmount || 0;
    // Apply refunds to order portion first, then tips
    const orderRefunded = Math.min(refunded, payment.orderAmount);
    const tipRefunded = Math.max(0, refunded - payment.orderAmount);
    return {
      remainingOrder: Math.max(0, payment.orderAmount - orderRefunded),
      remainingTip: Math.max(0, payment.tipAmount - tipRefunded),
    };
  }, []);

  const getRefundableQty = useCallback((item: CartItem) => {
    const paidQty = item.paidQuantity ?? item.quantity ?? 0;
    const refundedQty = item.refundedQuantity ?? 0;
    return Math.max(0, paidQty - refundedQty);
  }, []);

  // Calculate selected items total (price + tax)
  const selectedItemsTotal = useMemo(() => {
    if (!order?.items) return 0;
    return order.items.reduce((sum: number, item: CartItem) => {
      const maxQty = getRefundableQty(item);
      const selectedQty = Math.min(selectedItems[item.db_order_item_id || ''] || 0, maxQty);
      if (selectedQty <= 0) return sum;
      const itemSubtotal = (item.price || 0) * selectedQty;
      const perUnitTax =
        item.quantity > 0 ? (item.taxAmount || 0) / item.quantity : 0;
      const itemTax = perUnitTax * selectedQty;
      return sum + itemSubtotal + itemTax;
    }, 0);
  }, [selectedItems, order?.items, getRefundableQty]);

  // Calculate per-payment refund total
  const paymentRefundTotal = useMemo(() => {
    let total = 0;
    Object.values(paymentRefundAmounts).forEach((amounts) => {
      total +=
        (parseFloat(amounts.orderAmount) || 0) +
        (parseFloat(amounts.tipAmount) || 0);
    });
    return total;
  }, [paymentRefundAmounts]);

  const customAmountActive = useMemo(() => {
    if (refundType !== "payments") return false;
    return paymentRefundTotal > 0;
  }, [paymentRefundTotal, refundType]);
  

  // console.log("customAmountActive debug", {
  //   customAmountActive,
  //   refundType,
  //   paymentRefundTotal,
  //   paymentRefundAmountsKeys: Object.keys(paymentRefundAmounts),
  // });

  const hasCustomAmountRefund = useMemo(() => {
    if (!order?.reversals) return false;
    return (order.reversals as ReversalRecord[]).some(
      (r) => r.status === 'completed' &&
             (r.reversal_type === 'partial_refund' || r.reversal_type === 'refund')
    );
  }, [order?.reversals]);

  const hasRefundablePayments = refundablePayments.length > 0;
  const isZeroRefundable = maxRefundable <= 0 || !hasRefundablePayments;

  const getRefundAmount = () => {
    switch (refundType) {
      case "full":
        return maxRefundable;
      case "items":
        return selectedItemsTotal;
      case "payments":
        return paymentRefundTotal;
      default:
        return 0;
    }
  };

  const itemsDisabled = isZeroRefundable;

  // Helper: find which payment covers a given item via itemsCovered
  const getPaymentForItem = useCallback(
    (itemId: string): PaymentRowData | null => {
      for (const payment of refundablePayments) {
        if (payment.itemsCovered?.some((ic) => ic.itemId === itemId)) {
          return payment;
        }
      }
      return null;
    },
    [refundablePayments]
  );

  // Helper: get human-readable payment label
  const getPaymentLabel = useCallback((payment: PaymentRowData): string => {
    if (payment.method === "Card") {
      const brand = formatCardBrand(payment.cardBrand || payment.cardInfo?.brand);
      const last4 = payment.last4 || payment.cardInfo?.last4;
      if (brand && last4) return `${brand} ••••${last4}`;
      if (last4) return `Card ••••${last4}`;
      if (brand) return brand;
      return "Card";
    }
    return "Cash";
  }, []);

  useEffect(() => {
    if (!order?.items) return;
    setSelectedItems((prev) => {
      let changed = false;
      const next: Record<string, number> = { ...prev };
      order.items.forEach((item: CartItem) => {
        // TODO: Need to research offline scenario where item.db_order_item_id is not available
        if (!item.db_order_item_id) return;
        const maxQty = getRefundableQty(item);
        if (maxQty <= 0 && next[item.db_order_item_id || '']) {
          delete next[item.db_order_item_id || ''];
          changed = true;
          return;
        }
        if (next[item.db_order_item_id || ''] && next[item.db_order_item_id || ''] > maxQty) {
          if (maxQty > 0) {
            next[item.db_order_item_id || ''] = maxQty;
          } else {
            delete next[item.db_order_item_id || ''];
          }
          changed = true;
        }
      });
      return changed ? next : prev;
    });
  }, [order?.items, getRefundableQty]);
  console.log("[RightPaneRefund] selectedItems", selectedItems);
  console.log("[RightPaneRefund] order?.items", order?.items);
  // Validation: all selected unallocated items must have a payment assigned
  const allItemsHavePayment = useMemo(() => {
    if (refundType !== "items") return true;
    for (const [itemId, qty] of Object.entries(selectedItems)) {
      if (qty <= 0) continue;
      const coveringPayment = getPaymentForItem(itemId);
      if (!coveringPayment && itemPaymentAssignment[itemId] === undefined) {
        return false;
      }
    }
    return true;
  }, [selectedItems, itemPaymentAssignment, refundType, getPaymentForItem]);

  // Validation: no per-payment amount exceeds its remaining refundable amount
  const paymentAmountsValid = useMemo(() => {
    if (refundType !== "payments") return true;
    for (const [indexStr, amounts] of Object.entries(paymentRefundAmounts)) {
      const index = parseInt(indexStr);
      const payment = refundablePayments[index];
      if (!payment) continue;
      const { remainingOrder, remainingTip } = getRemainingAmounts(payment);
      const orderAmt = parseFloat(amounts.orderAmount) || 0;
      const tipAmt = parseFloat(amounts.tipAmount) || 0;
      if (orderAmt > remainingOrder || tipAmt > remainingTip)
        return false;
      if (orderAmt < 0 || tipAmt < 0) return false;
    }
    return true;
  }, [paymentRefundAmounts, refundablePayments, refundType, getRemainingAmounts]);

  const canProcess =
    refundReason.trim().length > 0 &&
    getRefundAmount() > 0 &&
    getRefundAmount() <= maxRefundable &&
    allItemsHavePayment &&
    paymentAmountsValid &&
    !isZeroRefundable;
  // console.log('Can Process Refund', {
  //   refundReason,
  //   refundAmount: getRefundAmount(),
  //   maxRefundable: maxRefundable,
  //   allItemsHavePayment,
  //   paymentAmountsValid,
  //   isZeroRefundable,
  //   customAmountActive,
  // });
  const handleToggleItem = (itemId: string, maxQty: number) => {
    if (isZeroRefundable || maxQty <= 0) return;
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

  const handlePaymentAmountChange = (
    index: number,
    field: "orderAmount" | "tipAmount",
    value: string
  ) => {
    const cleaned = value.replace(/[^0-9.]/g, "");
    const parts = cleaned.split(".");
    if (parts.length > 2) return;
    if (parts[1]?.length > 2) return;
    setPaymentRefundAmounts((prev) => ({
      ...prev,
      [index]: {
        orderAmount: prev[index]?.orderAmount || "",
        tipAmount: prev[index]?.tipAmount || "",
        [field]: cleaned,
      },
    }));
  };

  const handleFillAllForPayment = (index: number) => {
    const payment = refundablePayments[index];
    if (!payment) return;
    const { remainingOrder, remainingTip } = getRemainingAmounts(payment);
    setPaymentRefundAmounts((prev) => ({
      ...prev,
      [index]: {
        orderAmount: remainingOrder.toFixed(2),
        tipAmount: remainingTip.toFixed(2),
      },
    }));
  };

  const resetRefundState = useCallback(() => {
    setRefundType("full");
    setRefundReason("");
    setSelectedItems({});
    setPaymentRefundAmounts({});
    setItemPaymentAssignment({});
  }, []);

  const refundLogs = useMemo(() => {
    const logs = (order?.reversals || []) as any[];
    return logs
      .slice()
      .sort(
        (a, b) =>
          new Date(b.requested_at).getTime() - new Date(a.requested_at).getTime(),
      );
  }, [order?.reversals]);

  // Build per-payment refund details for processing
  const buildPerPaymentDetails = (): PerPaymentRefundDetail[] => {
    const details: PerPaymentRefundDetail[] = [];

    if (refundType === "full") {
      refundablePayments.forEach((payment) => {
        details.push({
          paymentIndex: payment.originalPaymentIndex,
          originalPaymentId: payment.paymentId,
          dbPaymentId: payment.dbPaymentId,
          method: payment.method,
          orderAmountToRefund: payment.orderAmount,
          tipAmountToRefund: payment.tipAmount,
          totalRefund: payment.collected,
          referenceId: payment.referenceId,
          last4: payment.last4 || payment.cardInfo?.last4,
          cardBrand: payment.cardBrand || payment.cardInfo?.brand,
        });
      });
    } else if (refundType === "payments") {
      Object.entries(paymentRefundAmounts).forEach(([indexStr, amounts]) => {
        const index = parseInt(indexStr);
        const payment = refundablePayments[index];
        if (!payment) return;
        const orderAmt = parseFloat(amounts.orderAmount) || 0;
        const tipAmt = parseFloat(amounts.tipAmount) || 0;
        if (orderAmt + tipAmt <= 0) return;
        details.push({
          paymentIndex: payment.originalPaymentIndex,
          originalPaymentId: payment.paymentId,
          dbPaymentId: payment.dbPaymentId,
          method: payment.method,
          orderAmountToRefund: orderAmt,
          tipAmountToRefund: tipAmt,
          totalRefund: orderAmt + tipAmt,
          referenceId: payment.referenceId,
          last4: payment.last4 || payment.cardInfo?.last4,
          cardBrand: payment.cardBrand || payment.cardInfo?.brand,
        });
      });
    } else if (refundType === "items" && !isZeroRefundable) {
      // Group selected items by their covering payment
      const paymentItemMap: Record<
        number,
        { itemId: string; quantity: number; amount: number }[]
      > = {};

      for (const [itemId, qty] of Object.entries(selectedItems)) {
        if (qty <= 0) continue;
        const item = order?.items?.find((i: CartItem) => i.id === itemId);
        if (!item) continue;
        const itemSubtotal = (item.price || 0) * qty;
        const perUnitTax =
          item.quantity > 0 ? (item.taxAmount || 0) / item.quantity : 0;
        const amount = itemSubtotal + perUnitTax * qty;

        let paymentIdx: number | undefined;
        const coveringPayment = getPaymentForItem(itemId);
        if (coveringPayment) {
          paymentIdx = coveringPayment.originalPaymentIndex;
        } else if (itemPaymentAssignment[itemId] !== undefined) {
          paymentIdx =
            refundablePayments[itemPaymentAssignment[itemId]]
              ?.originalPaymentIndex;
        }

        if (paymentIdx !== undefined) {
          if (!paymentItemMap[paymentIdx]) paymentItemMap[paymentIdx] = [];
          paymentItemMap[paymentIdx].push({ itemId, quantity: qty, amount });
        }
      }

      for (const [paymentIdxStr, items] of Object.entries(paymentItemMap)) {
        const paymentIdx = parseInt(paymentIdxStr);
        const payment = paymentSummary.payments[paymentIdx];
        if (!payment) continue;
        const totalAmount = items.reduce((sum, i) => sum + i.amount, 0);
        details.push({
          paymentIndex: paymentIdx,
          originalPaymentId: payment.paymentId,
          dbPaymentId: payment.dbPaymentId,
          method: payment.method,
          orderAmountToRefund: totalAmount,
          tipAmountToRefund: 0,
          totalRefund: totalAmount,
          referenceId: payment.referenceId,
          last4: payment.last4 || payment.cardInfo?.last4,
          cardBrand: payment.cardBrand || payment.cardInfo?.brand,
        });
      }
    }

    return details;
  };

  return (
    <View className="flex-[6] bg-screen" style={{ position: 'relative' }}>
      {/* Processing Overlay */}
      {refundProcessing && (
        <View
          className="absolute inset-0 z-50 items-center justify-center"
          style={{ backgroundColor: 'rgba(0,0,0,0.7)' }}
        >
          <View className="bg-card rounded-2xl p-8 items-center mx-8 border border-gray-700">
            <ActivityIndicator size="large" color={colors.danger} />
            <Text className="text-white text-lg font-bold mt-4">Processing Refund</Text>
            <Text className="text-gray-400 text-sm mt-2 text-center">
              Processing refund on terminal...{"\n"}Please do not close this screen.
            </Text>
          </View>
        </View>
      )}

      {/* Header */}
      <View className="flex-row items-center px-4 py-3 border-b border-gray-800">
        <TouchableOpacity
          onPress={onBack}
          disabled={refundProcessing}
          className="w-8 h-8 rounded-full bg-gray-800 items-center justify-center mr-3"
          style={{ opacity: refundProcessing ? 0.3 : 1 }}
        >
          <ArrowLeft size={16} color={colors.label} />
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
            ].map((type) => {
              // Disable Items tab when custom amount refund is active
              const isDisabled = type.key === "items" && (hasCustomAmountRefund || isZeroRefundable);
              return (
                <TouchableOpacity
                  key={type.key}
                  onPress={() => {
                    if (isDisabled) return;
                    const newType = type.key as RefundType;
                    // Clear cross-mode state on tab switch
                    if (newType === "items") {
                      setPaymentRefundAmounts({});
                    } else if (newType === "payments" || newType === "full") {
                      setSelectedItems({});
                      setItemPaymentAssignment({});
                    }
                    setRefundType(newType);
                  }}
                  disabled={isDisabled}
                  className={`flex-1 py-3 px-3 rounded-lg border ${
                    isDisabled
                      ? "bg-gray-900 border-gray-800 opacity-50"
                      : refundType === type.key
                        ? "bg-blue-500/10 border-blue-500/50"
                        : "bg-gray-800 border-gray-700"
                  }`}
                >
                  <Text
                    className={`text-sm font-medium text-center ${
                      isDisabled
                        ? "text-gray-600"
                        : refundType === type.key
                          ? "text-blue-400"
                          : "text-gray-400"
                    }`}
                  >
                    {type.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>

        {isZeroRefundable && (
          <View className="px-4 pb-2">
            <View className="bg-amber-500/10 border border-amber-500/30 rounded-lg px-3 py-2">
              <Text className="text-xs text-amber-300">
                No refundable balance available. All refundable payments are voided or fully refunded.
              </Text>
            </View>
          </View>
        )}

        {/* Full Refund View — Payment Breakdown */}
        {refundType === "full" && (
          <View className="px-4">
            <Text className="text-xs text-gray-500 mb-3">
              All payments will be fully reversed
            </Text>
            {refundablePayments.map((payment, index) => {
              const label = getPaymentLabel(payment);
              return (
                <View
                  key={index}
                  className="flex-row items-center py-3 border-b border-gray-800/50"
                >
                  <View className="w-10 h-10 rounded-lg bg-gray-800 items-center justify-center mr-3">
                    {payment.method === "Card" ? (
                      <CreditCard size={18} color={colors.label} />
                    ) : (
                      <Banknote size={18} color={colors.success} />
                    )}
                  </View>
                  <View className="flex-1">
                    <Text className="text-sm font-medium text-white">
                      {label}
                    </Text>
                    {payment.method === "Card" && (
                      <CardBrandBadge
                        brand={payment.cardBrand || payment.cardInfo?.brand}
                      />
                    )}
                  </View>
                  <View className="items-end">
                    <Text className="text-xs text-gray-500">
                      Order: ${payment.orderAmount?.toFixed(2)}
                    </Text>
                    {payment.tipAmount > 0 && (
                      <Text className="text-xs text-blue-400">
                        Tip: ${payment.tipAmount?.toFixed(2)}
                      </Text>
                    )}
                    <Text className="text-sm font-bold text-red-400">
                      ${payment.collected?.toFixed(2)}
                    </Text>
                  </View>
                </View>
              );
            })}
            <View className="mt-4 bg-panel rounded-xl p-4 border border-gray-800">
              <Text className="text-sm text-gray-400 mb-1">
                {refundablePayments.length} payment
                {refundablePayments.length !== 1 ? "s" : ""} to reverse
              </Text>
              <Text className="text-3xl font-bold text-red-400">
                ${maxRefundable?.toFixed(2)}
              </Text>
              <Text className="text-xs text-gray-500 mt-1">
                Full refund of collected amount
              </Text>
            </View>
          </View>
        )}

        {/* Items Selection View — with coverage badges & payment selector */}
        {refundType === "items" && (
          <View className="px-4">
            <Text className="text-xs text-gray-500 mb-3">
              Select items to refund
            </Text>
            {itemsDisabled && (
              <View className="mb-3 bg-gray-900/70 border border-gray-700 rounded-lg px-3 py-2">
                <Text className="text-xs text-gray-400">
                  Clear custom refund amounts to refund by items.
                </Text>
              </View>
            )}
            {order?.items
              ?.filter((item: CartItem) => !item.is_voided)
              .map((item: CartItem) => {
                const maxQty = getRefundableQty(item);
                const isSelected = selectedItems[item?.db_order_item_id] !== undefined;
                const selectedQty = selectedItems[item?.db_order_item_id] || 0;
                const coveringPayment = getPaymentForItem(item?.db_order_item_id);
                const needsAssignment = isSelected && !coveringPayment;
                const assignedPaymentIdx = itemPaymentAssignment[item?.db_order_item_id];

                return (
                  <View key={item.id}>
                    <View
                      className={`flex-row items-center py-3 border-b border-gray-800/50 ${
                        isSelected ? "bg-blue-500/5" : ""
                      }`}
                    >
                      <TouchableOpacity
                        onPress={() => handleToggleItem(item.db_order_item_id || '', maxQty)}
                        disabled={itemsDisabled || maxQty <= 0}
                        className={`w-6 h-6 rounded border mr-3 items-center justify-center ${
                          isSelected
                            ? "bg-blue-500 border-blue-500"
                            : "border-gray-600"
                        }`}
                      >
                        {isSelected && <Check size={14} color={colors.heading} />}
                      </TouchableOpacity>
                      <View className="flex-1">
                        <Text className="text-sm text-white">{item.name}</Text>
                        <Text className="text-xs text-gray-500">
                          ${(item.price || 0)?.toFixed(2)}
                          {(item.taxAmount || 0) > 0 &&
                            ` + $${(item.quantity > 0 ? (item.taxAmount || 0) / item.quantity : 0)?.toFixed(2)} tax`}
                          {" "}each
                        </Text>
                        {maxQty <= 0 && (
                          <Text className="text-[10px] text-gray-500 mt-1">
                            Fully refunded
                          </Text>
                        )}
                        {/* Coverage badge */}
                        {coveringPayment && (
                          <View className="mt-1">
                            <View className="bg-gray-800 border border-gray-700 rounded-full px-2 py-0.5 self-start">
                              <Text className="text-[10px] text-gray-400">
                                Covered by {getPaymentLabel(coveringPayment)}
                              </Text>
                            </View>
                          </View>
                        )}
                      </View>
                      {isSelected && (
                        <View className="flex-row items-center">
                          <TouchableOpacity
                            onPress={() =>
                              handleQuantityChange(
                                item.db_order_item_id || '',
                                selectedQty - 1,
                                maxQty
                              )
                            }
                            disabled={itemsDisabled}
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
                                item.db_order_item_id || '',
                                selectedQty + 1,
                                maxQty
                              )
                            }
                            className="w-8 h-8 rounded bg-gray-800 items-center justify-center"
                            disabled={itemsDisabled || selectedQty >= maxQty}
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

                    {/* Payment selector for unallocated selected items */}
                    {needsAssignment && !itemsDisabled && (
                      <View className="px-9 py-2 bg-gray-900/50 border-b border-gray-800/50">
                        <Text className="text-xs text-gray-400 mb-2">
                          Select refund destination:
                        </Text>
                        <View className="flex-row flex-wrap gap-2">
                          {refundablePayments.map((payment, pIdx) => {
                            const isAssigned = assignedPaymentIdx === pIdx;
                            return (
                              <TouchableOpacity
                                key={pIdx}
                                onPress={() =>
                                  setItemPaymentAssignment((prev) => ({
                                    ...prev,
                                    [item.db_order_item_id || '']: pIdx,
                                  }))
                                }
                                className={`px-3 py-1.5 rounded-full border ${
                                  isAssigned
                                    ? "bg-blue-500/15 border-blue-500/50"
                                    : "bg-gray-800 border-gray-700"
                                }`}
                              >
                                <Text
                                  className={`text-xs font-medium ${
                                    isAssigned
                                      ? "text-blue-400"
                                      : "text-gray-400"
                                  }`}
                                >
                                  {getPaymentLabel(payment)}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>
                      </View>
                    )}
                  </View>
                );
              })}

            {/* Selected Items Total */}
            {selectedItemsTotal > 0 && (
              <View className="mt-4 bg-panel rounded-xl p-4 border border-gray-800">
                <Text className="text-sm text-gray-400">Refund Amount</Text>
                <Text className="text-2xl font-bold text-red-400">
                  ${selectedItemsTotal?.toFixed(2)}
                </Text>
              </View>
            )}
          </View>
        )}

        {/* By Payment View — Per-Payment Editable Amounts */}
        {refundType === "payments" && (
          <View className="px-4">
            <Text className="text-xs text-gray-500 mb-3">
              Enter refund amounts per payment
            </Text>
            {refundablePayments.length === 0 ? (
              <View className="py-8 items-center">
                <View className="w-12 h-12 rounded-full bg-gray-800/50 items-center justify-center mb-3">
                  <CreditCard size={24} color={colors.muted} />
                </View>
                <Text className="text-gray-500 text-sm">
                  No refundable payments
                </Text>
              </View>
            ) : (
              <>
                {/* Column Headers */}
                <View className="flex-row items-center py-3 border-b border-gray-700 mb-2">
                  <Text className="flex-1 text-xs font-bold text-gray-500 uppercase">
                    Payment
                  </Text>
                  <Text className="w-24 text-xs font-bold text-gray-500 uppercase text-center">
                    Order
                  </Text>
                  <Text className="w-24 text-xs font-bold text-gray-500 uppercase text-center">
                    Tips + Grat
                  </Text>
                  <Text className="w-24 text-xs font-bold text-gray-500 uppercase text-center">
                    Collected
                  </Text>
                  <Text className="w-16 text-xs font-bold text-gray-500 uppercase text-center">
                    All
                  </Text>
                </View>

                {refundablePayments.map((payment, index) => {
                  const amounts = paymentRefundAmounts[index] || {
                    orderAmount: "",
                    tipAmount: "",
                  };
                  const { remainingOrder, remainingTip } = getRemainingAmounts(payment);
                  const orderAmt = parseFloat(amounts.orderAmount) || 0;
                  const tipAmt = parseFloat(amounts.tipAmount) || 0;
                  const orderExceeds = orderAmt > remainingOrder;
                  const tipExceeds = tipAmt > remainingTip;

                  return (
                    <View
                      key={index}
                      className="flex-row items-center py-4 border border-gray-700 rounded-xl mb-2 bg-panel"
                    >
                      {/* Payment label */}
                      <View className="flex-1 flex-row items-center pl-3">
                        <View className="w-12 h-12 rounded-lg bg-gray-800 items-center justify-center mr-3">
                          {payment.method === "Card" ? (
                            <CreditCard size={20} color={colors.label} />
                          ) : (
                            <Banknote size={20} color={colors.success} />
                          )}
                        </View>
                        <Text
                          className="text-sm font-medium text-white"
                          numberOfLines={1}
                        >
                          {getPaymentLabel(payment)}
                        </Text>
                      </View>

                      {/* Order amount input */}
                      <View className="w-24 px-2">
                        <TextInput
                          value={amounts.orderAmount}
                          onChangeText={(v) =>
                            handlePaymentAmountChange(index, "orderAmount", v)
                          }
                          placeholder={remainingOrder.toFixed(2)}
                          placeholderTextColor={colors.muted}
                          keyboardType="decimal-pad"
                          className={`text-sm text-center py-3 px-3 rounded-lg border-2 ${
                            orderExceeds
                              ? "bg-red-500/10 border-red-500/50 text-red-400"
                              : "bg-rose-500/10 border-gray-600 text-white"
                          }`}
                        />
                      </View>

                      {/* Tip amount input */}
                      <View className="w-24 px-2">
                        <TextInput
                          value={amounts.tipAmount}
                          onChangeText={(v) =>
                            handlePaymentAmountChange(index, "tipAmount", v)
                          }
                          placeholder={remainingTip.toFixed(2)}
                          placeholderTextColor={colors.muted}
                          keyboardType="decimal-pad"
                          className={`text-sm text-center py-3 px-3 rounded-lg border-2 ${
                            tipExceeds
                              ? "bg-red-500/10 border-red-500/50 text-red-400"
                              : "bg-rose-500/10 border-gray-600 text-white"
                          }`}
                        />
                      </View>

                      {/* Collected display */}
                      <Text className="w-24 text-sm text-gray-400 text-center">
                        ${payment.collected?.toFixed(2)}
                      </Text>

                      {/* ALL button */}
                      <TouchableOpacity
                        onPress={() => handleFillAllForPayment(index)}
                        className="w-16 items-center pr-2"
                      >
                        <View className="bg-blue-500/10 border-2 border-blue-500/40 rounded-lg px-3 py-2">
                          <Text className="text-xs font-bold text-blue-400">
                            ALL
                          </Text>
                        </View>
                      </TouchableOpacity>
                    </View>
                  );
                })}

                {/* Payment Refund Total */}
                {paymentRefundTotal > 0 && (
                  <View className="mt-4 bg-panel rounded-xl p-4 border border-gray-800">
                    <Text className="text-sm text-gray-400">Total Refund</Text>
                    <Text className="text-2xl font-bold text-red-400">
                      ${paymentRefundTotal?.toFixed(2)}
                    </Text>
                  </View>
                )}
              </>
            )}
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
            placeholderTextColor={colors.muted}
            multiline={false}
            numberOfLines={1}
            className="bg-panel rounded-xl p-4 border border-gray-800 text-white text-sm"
            style={{ textAlignVertical: "top", minHeight: 80 }}
          />
        </View>

        {refundLogs.length > 0 && (
          <View className="px-4 mt-4">
            <Text className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Refund Log
            </Text>
            <View className="bg-panel rounded-xl border border-gray-800">
              {refundLogs.map((log, index) => (
                <View
                  key={log.id || index}
                  className={`px-4 py-3 ${index !== 0 ? "border-t border-gray-800/60" : ""}`}
                >
                  <View className="flex-row justify-between items-center">
                    <Text className="text-sm text-white font-medium">
                      {String(log.reversal_type || "refund").toUpperCase()}
                    </Text>
                    <Text className="text-sm text-red-400 font-semibold">
                      ${Number(log.amount || 0)?.toFixed(2)}
                    </Text>
                  </View>
                  <Text className="text-xs text-gray-500 mt-1">
                    {log.reason_description || log.reason_code || "—"}
                  </Text>
                  <Text className="text-[10px] text-gray-600 mt-1">
                    {log.requested_at ? new Date(log.requested_at).toLocaleString() : "—"}
                    {log.status ? ` • ${log.status}` : ""}
                  </Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </ScrollView>

      {/* Process Button */}
      <View className="absolute bottom-0 left-0 right-0 px-4 py-4 bg-panel border-t border-gray-800">
        <TouchableOpacity
          onPress={async () => {
            if (refundProcessing || processingRef.current) {
              console.log("[Refund] Already processing");
              return;
            }

            if (!canProcess) {
              console.log("[Refund] Blocked by validation", {
                refundType,
                maxRefundable,
                refundReason,
                paymentRefundTotal,
                selectedItemsTotal,
                allItemsHavePayment,
                paymentAmountsValid,
                isZeroRefundable,
                customAmountActive,
              });
              show({
                title: "Refund Not Ready",
                message:
                  "Check reason, amounts, and refundable balance before processing.",
                type: "warning",
              });
              return;
            }
            processingRef.current = true;
            try {
              const perPaymentDetails = buildPerPaymentDetails();
              const items =
                refundType === "items" && !itemsDisabled
                  ? Object.entries(selectedItems).map(([id, qty]) => ({
                      itemId: id,
                      quantity: qty,
                      paymentIndex: (() => {
                        const covering = getPaymentForItem(id);
                        if (covering) return covering.originalPaymentIndex;
                        const assigned = itemPaymentAssignment[id];
                        if (assigned !== undefined)
                          return refundablePayments[assigned]
                            ?.originalPaymentIndex;
                        return undefined;
                      })(),
                    }))
                  : undefined;
              const success = await onProcessRefund(
                refundType,
                getRefundAmount(),
                refundReason,
                perPaymentDetails,
                items
              );
              if (success) {
                resetRefundState();
              }
            } catch (error) {
              console.error("[Refund] Unexpected error:", error);
              show({
                title: "Refund Failed",
                message: "Unexpected error while processing refund.",
                type: "error",
              });
            } finally {
              processingRef.current = false;
            }
          }}
          disabled={!canProcess || refundProcessing}
          className={`w-full py-4 rounded-xl items-center justify-center ${
            canProcess && !refundProcessing ? "bg-red-500" : "bg-gray-700"
          }`}
        >
          {refundProcessing ? (
            <ActivityIndicator color={colors.heading} />
          ) : (
            <Text
              className={`text-base font-bold ${
                canProcess ? "text-white" : "text-gray-500"
              }`}
            >
              Process Refund • ${getRefundAmount()?.toFixed(2)}
            </Text>
          )}
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
  const [tipProcessing, setTipProcessing] = useState(false);
  const selectedStation = useStoreSettingsStore((s) => s.selectedStation);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);

  // Mutation hooks
  const refundMutation = useRefundMutation();

  const { isOpen, orderId, initialView, close } = usePaymentDetailSheetStore();
  const updateOrderCheckStatus = useOrderStore((s) => s.updateOrderCheckStatus);

  const [rightPaneView, setRightPaneView] = useState<RightPaneView>("summary");

  // Get order data - first try active orders, then previous orders
  const activeOrder = useOrderStore((state) => {
    if (!orderId) return null;
    return state.ordersById[orderId] || null;
  });

  // Fallback to previousOrders for history orders
  const previousOrder = usePreviousOrdersStore((state) => {
    if (!orderId || activeOrder) return null;
    return state.previousOrders.find((po) => po.orderId === orderId) || null;
  });

  // Fetch reversals and refund_items via TanStack Query
  const dbOrderId = activeOrder?.db_order_id || previousOrder?.db_order_id;
  const hasExistingReversals = !!(
    (activeOrder?.reversals && activeOrder.reversals.length > 0) ||
    (previousOrder?.reversals && previousOrder.reversals.length > 0)
  );

  const { reversals: fetchedReversals, orderRefundItems: fetchedRefundItems } =
    useOrderDetailsFetch({
      dbOrderId,
      localOrderId: orderId,
      isActiveOrder: !!activeOrder,
      hasExistingReversals,
      enabled: isOpen && !!orderId,
    });

  // Map previousOrder to OrderProfile format (same as PreviousOrdersSection)
  const order = useMemo((): OrderProfile | null => {
    if (activeOrder) {
      // Merge fetched details into active order if it's missing reversals
      if (fetchedReversals.length > 0 && !activeOrder.reversals?.length) {
        return {
          ...activeOrder,
          reversals: fetchedReversals,
          order_refund_items: fetchedRefundItems,
        };
      }
      return activeOrder;
    }
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
      // Include reversals/refund_items: prefer fetched, fallback to cached on previousOrder
      reversals: fetchedReversals.length > 0 ? fetchedReversals : previousOrder.reversals,
      order_refund_items: fetchedRefundItems.length > 0 ? fetchedRefundItems : previousOrder.order_refund_items,
    } as OrderProfile;
  }, [activeOrder, previousOrder, fetchedReversals, fetchedRefundItems]);

  // Check if active terminal matches the order's payment terminal type
  const { canProcess: terminalCanProcess, blockReason: terminalBlockReason } =
    useMemo(
      () =>
        getTerminalMatchInfo(
          order?.payments,
          selectedStation?.payment_terminal?.terminal_type,
        ),
      [order?.payments, selectedStation?.payment_terminal?.terminal_type],
    );

  // Reset view when sheet opens (Modal is controlled by isOpen state directly)
  useEffect(() => {
    if (isOpen && orderId) {
      setRightPaneView(initialView || "summary");
    }
  }, [isOpen, orderId, initialView]);

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
        tips: 0,
        payments: [] as PaymentRowData[],
      };
    }

    let totalRefunded = 0;
    let totalCollected = 0;
    let totalTips = 0;
    const payments: PaymentRowData[] = [];
    console.log("order.payments", order.payments?.[0]);
    if (order.payments && order.payments.length > 0) {
      order.payments.forEach((payment: OrderProfilePayment, index: number) => {
        const orderAmount = payment.amount || 0;
        const tipAmount = payment.tip_amount || 0;
        const isVoided = payment.isVoided || false;
        const collected = isVoided ? 0 : orderAmount + tipAmount;
        const txDetails = payment.transactionDetails?.dejavooTransaction;
        const castlesTx = payment.transactionDetails?.castlesTransaction as Record<string, string> | undefined;
        const cardBrand = payment.cardBrand || txDetails?.cardType;
        const last4 = payment.last4 || txDetails?.cardLast4;
        const cardInfo =
          payment.method === "Card" || txDetails || castlesTx
            ? {
                brand: cardBrand,
                last4,
                entryMode: txDetails?.entryMode
                  ? String(txDetails.entryMode)
                  : castlesTx?.entryMode
                    ? String(castlesTx.entryMode)
                    : undefined,
                authCode: txDetails?.authCode
                  ? String(txDetails.authCode)
                  : castlesTx?.approvalCode
                    ? String(castlesTx.approvalCode)
                    : undefined,
                rrn: txDetails?.rrn
                  ? String(txDetails.rrn)
                  : castlesTx?.rrn
                    ? String(castlesTx.rrn)
                    : undefined,
                transactionNumber: txDetails?.transactionNumber
                  ? String(txDetails.transactionNumber)
                  : undefined,
                referenceId: txDetails?.referenceId
                  ? String(txDetails.referenceId)
                  : castlesTx?.referenceId
                    ? String(castlesTx.referenceId)
                    : undefined,
                invoiceNumber: txDetails?.invoiceNumber
                  ? String(txDetails.invoiceNumber)
                  : undefined,
              }
            : undefined;

        // Only count non-voided payments for collected and refunded totals
        // Voided payments were never collected, so they don't affect the refundable balance
        if (!isVoided) {
          totalCollected += collected;
          totalTips += tipAmount;
          // Track actual refunds from this payment (not voided amounts)
          totalRefunded += payment.refundedAmount || 0;
        }

        payments.push({
          method: payment.method?.toLowerCase() === "card" ? "Card"
            : payment.method?.toLowerCase() === "cash" ? "Cash"
            : payment.method || "Unknown",
          timestamp: payment.timestamp || new Date().toISOString(),
          orderAmount,
          tipAmount,
          collected,
          isVoided,
          last4,
          cardBrand,
          cardInfo,
          itemsCovered: payment.itemsCovered,
          isCashPriced: payment.isCashPriced,
          cashSavings: payment.cashSavings,
          subtotal_portion: payment.subtotal_portion,
          tax_portion: payment.tax_portion,
          paymentId: payment.id,
          dbPaymentId: payment.db_payment_id || payment.id,
          originalPaymentIndex: index,
          referenceId: txDetails?.referenceId
            ? String(txDetails.referenceId)
            : castlesTx?.referenceId
              ? String(castlesTx.referenceId)
              : undefined,
          refundedAmount: payment.refundedAmount || 0,
          original_tip_amount: payment.original_tip_amount,
          tip_adjusted_at: payment.tip_adjusted_at,
          tip_adjusted_by: payment.tip_adjusted_by,
          amountTendered: payment.transactionDetails?.amountTendered,
          changeGiven: payment.transactionDetails?.changeGiven,
        });
      });
    }

    return {
      orderTotal: order.total_amount || 0,
      orderCashTotal: order.total_cash_amount || 0,
      refunds: totalRefunded,
      collected: totalCollected,
      tips: totalTips,
      payments,
    };
  }, [order]);

  // Diagnostic: log when refund button would be disabled
  useEffect(() => {
    if (isOpen && order) {
      console.log("[PaymentDetail] Payment summary:", {
        collected: paymentSummary.collected,
        refunds: paymentSummary.refunds,
        paymentsCount: paymentSummary.payments.length,
        refundButtonDisabled: paymentSummary.collected <= 0,
        orderPaymentsCount: order.payments?.length ?? 0,
        orderPayments: order.payments?.map((p: any) => ({
          amount: p.amount,
          isVoided: p.isVoided,
          method: p.method,
          refundedAmount: p.refundedAmount,
        })),
      });
    }
  }, [isOpen, order, paymentSummary]);

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
  const handleReopenOrder = useCallback(async () => {
    if (!orderId) return;
    await updateOrderCheckStatus(orderId, "Opened");
    const storeKey = useOrderStore.getState().dbOrderIdIndex[orderId] ?? orderId;
    const current = useOrderStore.getState().ordersById[storeKey];
    if (current?.check_status === "Opened") {
      show({
        title: "Order Reopened",
        message: "This order is now open for editing and payments.",
        type: "success",
      });
    } else {
      show({
        title: "Reopen Failed",
        message: "Could not reopen this order. Please try again.",
        type: "error",
      });
    }
  }, [orderId, updateOrderCheckStatus, show]);

  const handleCloseOrder = useCallback(async () => {
    if (!orderId) return;
    await updateOrderCheckStatus(orderId, "Closed");
    const storeKey = useOrderStore.getState().dbOrderIdIndex[orderId] ?? orderId;
    const current = useOrderStore.getState().ordersById[storeKey];
    if (current?.check_status === "Closed") {
      show({
        title: "Order Closed",
        message: "This order has been closed.",
        type: "success",
      });
    } else {
      show({
        title: "Close Failed",
        message: "Could not close this order. There may be an outstanding balance.",
        type: "error",
      });
    }
  }, [orderId, updateOrderCheckStatus, show]);

  const handleContinueCharging = useCallback(async () => {
    if (!orderId) return;

    let activeId = orderId;

    // If order not in local store, fetch from DB first
    if (!useOrderStore.getState().ordersById[orderId]) {
      const localId = await useOrderStore.getState().syncOrderFromDatabase(orderId);
      if (!localId) {
        show({ title: "Error", message: "Could not load order data.", type: "error" });
        return;
      }
      activeId = localId;
    }

    useOrderStore.getState().setActiveOrder(activeId);
    close();
  }, [orderId, close, show]);

  const handleIssueReceipt = useCallback(async () => {
    if (!order || !selectedStore) {
      show({ title: "Print Error", message: "No order or store available.", type: "error" });
      return;
    }
    const success = await PrinterService.printReceipt(order, selectedStore);
    if (success) {
      show({ title: "Receipt Sent", message: "Receipt sent to printer.", type: "success" });
    } else {
      useNoPrinterModalStore.getState().show("receipt");
    }
  }, [order, selectedStore, show]);

  const handlePrintKitchenTicket = useCallback(async () => {
    if (!order || !selectedStore) {
      show({ title: "Print Error", message: "No order or store available.", type: "error" });
      return;
    }
    const nonVoidedItems = order.items.filter((item) => !item.is_voided);
    if (nonVoidedItems.length === 0) {
      show({ title: "No Items", message: "No items to print on kitchen ticket.", type: "warning" });
      return;
    }
    const success = await PrinterService.printKitchenTickets(order, nonVoidedItems, selectedStore);
    if (success) {
      show({ title: "Kitchen Ticket Sent", message: "Kitchen ticket sent to printer.", type: "success" });
    } else {
      useNoPrinterModalStore.getState().show("kitchen");
    }
  }, [order, selectedStore, show]);

  const handleRefund = useCallback(() => {
    console.log("[PaymentDetail] Refund button pressed, navigating to refund view");
    setRightPaneView("refund");
  }, []);

  const handleTipAdjust = useCallback(() => {
    setRightPaneView("tipAdjust");
  }, []);

  const handleTipAdjusted = useCallback(() => {
    setTipProcessing(false);
    setRightPaneView("summary");
  }, []);

  const handleProcessRefund = useCallback(
    async (
      type: RefundType,
      totalAmount: number,
      reason: string,
      perPaymentDetails: PerPaymentRefundDetail[],
      selectedItems?: { itemId: string; quantity: number; paymentIndex?: number }[]
    ): Promise<boolean> => {
      if (!order) {
        show({ title: "Refund Failed", message: "Order not found.", type: "error" });
        return false;
      }

      const orderDbId = order.db_order_id || order.id;

      try {
        if (type === "items") {
          await refundMutation.mutateAsync({
            type: "items",
            totalAmount,
            reason,
            perPaymentDetails,
            selectedItems: selectedItems || [],
            orderId: orderId!,
            dbOrderId: orderDbId,
            paymentTerminalId: selectedStation?.payment_terminal?.id || "",
            paymentTerminal: selectedStation?.payment_terminal || undefined,
            stationId: selectedStation?.id,
          });
        } else {
          await refundMutation.mutateAsync({
            type,
            totalAmount,
            reason,
            perPaymentDetails,
            orderId: orderId!,
            dbOrderId: orderDbId,
            paymentTerminalId: selectedStation?.payment_terminal?.id || "",
            paymentTerminal: selectedStation?.payment_terminal || undefined,
            stationId: selectedStation?.id,
          });
        }
        setRightPaneView("summary");
        return true;
      } catch {
        // Error handling is done by the mutation's onError callback
        return false;
      }
    },
    [order, orderId, show, selectedStation, refundMutation]
  );

  return (
    <Modal
      visible={isOpen}
      animationType="slide"
      transparent={true}
      onRequestClose={() => {
        if (refundMutation.isPending || tipProcessing) return;
        close();
      }}
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
            backgroundColor: colors.screen,
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
                  <Text className="text-sm text-gray-500 ml-2">
                    {order.opened_at ? formatTimestamp(order.opened_at) : "—"}
                  </Text>
                </View>
                <View className="flex-row items-center gap-3">
                  {/* Online Badge */}
                  {order.order_source === "online" && (
                    <View className="px-3 py-1.5 rounded-full flex-row items-center bg-blue-500/15 border border-blue-500/40">
                      <Globe color="#60a5fa" size={12} />
                      <Text className="text-xs font-semibold uppercase text-blue-400 ml-1.5">Online</Text>
                    </View>
                  )}
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
                    disabled={refundMutation.isPending || tipProcessing}
                    className="px-4 py-2 rounded-lg bg-gray-800 items-center justify-center"
                    style={{ opacity: (refundMutation.isPending || tipProcessing) ? 0.3 : 1 }}
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

                {/* Right Pane - Summary, Refund, or Tip Adjust */}
                {rightPaneView === "summary" ? (
                  <RightPaneSummary
                    order={order}
                    paymentSummary={paymentSummary}
                    onReopenOrder={handleReopenOrder}
                    onCloseOrder={handleCloseOrder}
                    onContinueCharging={handleContinueCharging}
                    onIssueReceipt={handleIssueReceipt}
                    onPrintKitchenTicket={handlePrintKitchenTicket}
                    onTipAdjust={handleTipAdjust}
                    onRefund={handleRefund}
                    formatTimestamp={formatTimestamp}
                    terminalCanProcess={terminalCanProcess}
                    terminalBlockReason={terminalBlockReason}
                  />
                ) : rightPaneView === "refund" ? (
                  <RightPaneRefund
                    order={order}
                    paymentSummary={paymentSummary}
                    onBack={() => setRightPaneView("summary")}
                    onProcessRefund={handleProcessRefund}
                    refundProcessing={refundMutation.isPending}
                  />
                ) : (
                  <RightPaneTipAdjust
                    order={order}
                    paymentSummary={paymentSummary}
                    onBack={() => setRightPaneView("summary")}
                    onTipAdjusted={handleTipAdjusted}
                    onProcessingChange={setTipProcessing}
                  />
                )}
              </View>
            </View>
          )}
        </View>
      </View>
      <ToastRenderer />
    </Modal>
  );
};

const PaymentDetailBottomSheet = React.forwardRef(
  PaymentDetailBottomSheetComponent,
);
PaymentDetailBottomSheet.displayName = "PaymentDetailBottomSheet";

export default PaymentDetailBottomSheet;
