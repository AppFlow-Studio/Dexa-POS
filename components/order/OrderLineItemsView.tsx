import {
  colors,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_COLORS,
} from "@/lib/theme";
import { useOrder } from "@/stores/selectors/orderSelectors";
import { X } from "lucide-react-native";
import { useMemo } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import ReadOnlyBillItem from "./ReadOnlyBillItem";

interface OrderLineItemsViewProps {
  onClose: () => void;
  orderId: string | null;
}

// ── Status chip helper ─────────────────────────────────────────
const StatusChip = ({
  label,
  color,
}: {
  label: string;
  color: string;
}) => (
  <View
    className="px-3 py-1 rounded-full mr-2 mb-1"
    style={{ backgroundColor: color + "22" }}
  >
    <Text
      className="text-sm font-semibold capitalize"
      style={{ color }}
    >
      {label}
    </Text>
  </View>
);

// ── Format helpers ─────────────────────────────────────────────
const formatTime = (iso: string | null | undefined) => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  });
};

const formatOrderType = (type: string | undefined) => {
  if (!type) return "";
  const map: Record<string, string> = {
    "Dine In": "Dine In",
    dine_in: "Dine In",
    Takeaway: "Takeaway",
    takeout: "Takeaway",
    Delivery: "Delivery",
    delivery: "Delivery",
  };
  return map[type] || type;
};

const OrderLineItemsView = ({ onClose, orderId }: OrderLineItemsViewProps) => {
  const orderToView = useOrder(orderId);
  const items = orderToView?.items || [];

  // ── Totals ────────────────────────────────────────────────────
  const { subtotal, discount, tax, total, amountPaid, amountDue, cashTotal, cashSavings } =
    useMemo(() => {
      if (!orderToView) {
        return { subtotal: 0, discount: 0, tax: 0, total: 0, amountPaid: 0, amountDue: 0, cashTotal: 0, cashSavings: 0 };
      }

      const localSubtotal = orderToView.items.reduce(
        (acc, item) => acc + item.price * item.quantity,
        0,
      );

      const disc = orderToView.total_discount ?? (orderToView.checkDiscount
        ? localSubtotal * orderToView.checkDiscount.value
        : 0);

      const finalTax = orderToView.total_tax ?? 0;
      const finalTotal = orderToView.total_amount ?? localSubtotal - disc + finalTax;
      const finalSubtotal = finalTotal - finalTax;
      const finalAmountPaid = orderToView.amount_paid ?? 0;
      const finalAmountDue = orderToView.amount_due ?? finalTotal;
      const finalCashTotal = orderToView.total_cash_amount ?? 0;
      const finalCashSavings = finalCashTotal > 0 && finalCashTotal < finalTotal
        ? finalTotal - finalCashTotal
        : 0;

      return {
        subtotal: finalSubtotal > 0 ? finalSubtotal : localSubtotal,
        discount: disc,
        tax: finalTax,
        total: finalTotal,
        amountPaid: finalAmountPaid,
        amountDue: finalAmountDue,
        cashTotal: finalCashTotal,
        cashSavings: finalCashSavings,
      };
    }, [orderToView]);

  // ── Payments ──────────────────────────────────────────────────
  const validPayments = useMemo(
    () => orderToView?.payments?.filter((p) => !p.isVoided) || [],
    [orderToView?.payments],
  );

  // ── Total refunded ────────────────────────────────────────────
  const totalRefunded = useMemo(() => {
    if (!validPayments.length) return 0;
    return validPayments.reduce((acc, p) => acc + (p.refundedAmount ?? 0), 0);
  }, [validPayments]);

  if (!orderToView) return null;

  const orderTypeLabel = formatOrderType(orderToView.order_type);
  const itemCount = items.length;
  const customerLabel = orderToView.customer_name || "Walk-In";
  const timeLabel = formatTime(orderToView.opened_at);

  // Status chip colors
  const orderStatusColor =
    ORDER_STATUS_COLORS[orderToView.order_status] || colors.info;
  const paidStatusColor =
    PAYMENT_STATUS_COLORS[orderToView.paid_status] || colors.muted;

  return (
    <View
      className="rounded-2xl overflow-hidden border border-border w-full"
      style={{ backgroundColor: colors.panel }}
    >
      {/* ═══ HEADER ═══ */}
      <View
        className="px-5 pt-4 pb-3 border-b border-border"
        style={{ backgroundColor: colors.card }}
      >
        {/* Row 1: Order # + status pill + close */}
        <View className="flex-row items-center justify-between mb-1">
          <View className="flex-row items-center gap-3">
            <Text
              className="text-xl font-bold"
              style={{ color: colors.heading }}
            >
              Order {orderToView.display_number || orderToView.order_number || ""}
            </Text>
            <View
              className="px-3 py-0.5 rounded-full"
              style={{ backgroundColor: paidStatusColor + "22" }}
            >
              <Text
                className="text-sm font-semibold"
                style={{ color: paidStatusColor }}
              >
                {orderToView.paid_status}
              </Text>
            </View>
          </View>
        </View>

        {/* Row 2: type · customer · count ... time */}
        <View className="flex-row items-center justify-between">
          <Text className="text-sm" style={{ color: colors.label }}>
            {[orderTypeLabel, customerLabel, `${itemCount} item${itemCount !== 1 ? "s" : ""}`]
              .filter(Boolean)
              .join(" \u00B7 ")}
          </Text>
          {timeLabel ? (
            <Text className="text-sm" style={{ color: colors.muted }}>
              {timeLabel}
            </Text>
          ) : null}
        </View>
      </View>

      {/* ═══ BODY — Two columns ═══ */}
      <View className="flex-row" style={{ maxHeight: 420 }}>
        {/* ─── Left Column: Items (50%) ─── */}
        <ScrollView
          className="px-4 py-3 border-r border-border"
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
        >
          <Text
            className="text-sm font-semibold uppercase tracking-wider mb-2"
            style={{ color: colors.muted }}
          >
            Items
          </Text>
          {items.map((item, idx) => (
            <ReadOnlyBillItem
              key={item.id}
              item={item}
              isLast={idx === items.length - 1}
            />
          ))}
        </ScrollView>

        {/* ─── Right Column: Info (50%) ─── */}
        <ScrollView
          className="py-3 px-4"
          style={{ flex: 1 }}
          showsVerticalScrollIndicator={false}
        >
          {/* STATUS */}
          <Text
            className="text-sm font-semibold uppercase tracking-wider mb-2"
            style={{ color: colors.muted }}
          >
            Status
          </Text>
          <View className="flex-row flex-wrap mb-4">
            {orderTypeLabel ? (
              <StatusChip label={orderTypeLabel} color={colors.info} />
            ) : null}
            <StatusChip
              label={orderToView.order_status.replace(/_/g, " ")}
              color={orderStatusColor}
            />
            <StatusChip
              label={orderToView.check_status}
              color={orderToView.check_status === "Opened" ? colors.success : colors.muted}
            />
          </View>

          {/* PRICING BREAKDOWN */}
          <Text
            className="text-sm font-semibold uppercase tracking-wider mb-2"
            style={{ color: colors.muted }}
          >
            Pricing Breakdown
          </Text>
          <View className="gap-y-1.5 mb-1">
            {/* Subtotal */}
            <PriceRow label="Subtotal" amount={subtotal} />

            {/* Discount */}
            {discount > 0 && (
              <PriceRow
                label="Discount"
                amount={-discount}
                color={colors.success}
              />
            )}

            {/* Tax */}
            <PriceRow label="Tax" amount={tax} />
          </View>

          {/* Separator + Total */}
          <View
            className="border-t border-dashed my-2 pt-2"
            style={{ borderColor: colors.border }}
          >
            <View className="flex-row justify-between items-center">
              <Text
                className="text-lg font-bold"
                style={{ color: colors.heading }}
              >
                Total
              </Text>
              <Text
                className="text-lg font-bold"
                style={{ color: colors.heading, fontFamily: "monospace" }}
              >
                ${total.toFixed(2)}
              </Text>
            </View>
          </View>

          {/* Cash savings */}
          {cashSavings > 0 && (
            <Text
              className="text-sm mt-1"
              style={{ color: colors.success }}
            >
              Cash ${(cashTotal).toFixed(2)} (save ${cashSavings.toFixed(2)})
            </Text>
          )}

          {/* Amount paid / balance due */}
          {amountPaid > 0 && orderToView.paid_status !== "Paid" && (
            <PriceRow
              label="Amount Paid"
              amount={amountPaid}
              color={colors.success}
              className="mt-2"
            />
          )}
          {amountDue > 0.01 && orderToView.paid_status !== "Paid" && (
            <View className="mt-2">
              <View className="flex-row justify-between items-center">
                <Text className="text-sm font-bold" style={{ color: colors.warning }}>
                  Balance Due
                </Text>
                <Text
                  className="text-base font-bold"
                  style={{ color: colors.warning, fontFamily: "monospace" }}
                >
                  ${amountDue.toFixed(2)}
                </Text>
              </View>
            </View>
          )}

          {/* Fully paid badge */}
          {orderToView.paid_status === "Paid" && (
            <Text
              className="text-sm font-bold mt-2"
              style={{ color: colors.success }}
            >
              Fully Paid
            </Text>
          )}

          {/* PAYMENTS */}
          {validPayments.length > 0 && (
            <View className="mt-4">
              <Text
                className="text-sm font-semibold uppercase tracking-wider mb-2"
                style={{ color: colors.muted }}
              >
                Payments
              </Text>
              <View className="gap-y-2">
                {validPayments.map((p, i) => (
                  <View key={p.id || i}>
                    <View className="flex-row justify-between items-center">
                      <View className="flex-row items-center gap-1.5">
                        <Text className="text-sm" style={{ color: colors.label }}>
                          {p.method === "Card" ? "\uD83D\uDCB3" : "\uD83D\uDCB5"}
                        </Text>
                        <Text
                          className="text-sm font-medium"
                          style={{ color: colors.heading }}
                        >
                          {p.method === "Card"
                            ? `${p.cardBrand || "Card"} ${p.last4 ? `\u2022\u2022\u2022\u2022${p.last4}` : ""}`
                            : "Cash"}
                        </Text>
                      </View>
                      <Text
                        className="text-sm font-semibold"
                        style={{ color: colors.heading, fontFamily: "monospace" }}
                      >
                        ${p.amount.toFixed(2)}
                      </Text>
                    </View>
                    {/* Timestamp + status */}
                    <View className="flex-row items-center gap-1 mt-0.5 pl-5">
                      {p.timestamp && (
                        <Text className="text-sm" style={{ color: colors.muted }}>
                          {formatTime(p.timestamp)}
                        </Text>
                      )}
                      <Text className="text-sm" style={{ color: colors.muted }}>
                        {p.timestamp ? " \u00B7 " : ""}
                        {p.status === "captured" ? "Captured" : p.status}
                      </Text>
                    </View>
                    {/* Cash tendered / change */}
                    {p.method === "Cash" && p.amountTendered != null && (
                      <Text
                        className="text-sm pl-5 mt-0.5"
                        style={{ color: colors.label }}
                      >
                        Tendered ${p.amountTendered.toFixed(2)}
                        {p.changeGiven ? ` · Change $${p.changeGiven.toFixed(2)}` : ""}
                      </Text>
                    )}
                    {/* Tip */}
                    {p.tip_amount > 0 && (
                      <Text
                        className="text-sm pl-5 mt-0.5"
                        style={{ color: colors.label }}
                      >
                        Tip ${p.tip_amount.toFixed(2)}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* REFUND INFO */}
          {totalRefunded > 0 && (
            <View className="mt-3">
              <Text
                className="text-sm font-semibold uppercase tracking-wider mb-1"
                style={{ color: colors.muted }}
              >
                Refunds
              </Text>
              <Text className="text-sm font-medium" style={{ color: colors.danger }}>
                Total Refunded: ${totalRefunded.toFixed(2)}
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* ═══ FOOTER ═══ */}
      <View
        className="px-5 py-3 border-t border-border flex-row justify-end"
        style={{ backgroundColor: colors.card }}
      >
        <TouchableOpacity
          onPress={onClose}
          className="px-6 py-2.5 rounded-xl border border-border"
          style={{ backgroundColor: colors.panel }}
        >
          <Text
            className="text-sm font-semibold"
            style={{ color: colors.label }}
          >
            Close
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

// ── Reusable price row ──────────────────────────────────────────
const PriceRow = ({
  label,
  amount,
  color,
  className: extraClass,
}: {
  label: string;
  amount: number;
  color?: string;
  className?: string;
}) => (
  <View className={`flex-row justify-between items-center ${extraClass || ""}`}>
    <Text className="text-sm" style={{ color: color || colors.label }}>
      {label}
    </Text>
    <Text
      className="text-sm"
      style={{ color: color || colors.heading, fontFamily: "monospace" }}
    >
      {amount < 0 ? `-$${Math.abs(amount).toFixed(2)}` : `$${amount.toFixed(2)}`}
    </Text>
  </View>
);

export default OrderLineItemsView;
