import {
  colors,
  ORDER_STATUS_COLORS,
  PAYMENT_STATUS_COLORS,
} from "@/lib/theme";
import { useOrder } from "@/stores/selectors/orderSelectors";
import { useMemo } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import ReadOnlyBillItem from "./ReadOnlyBillItem";

interface OrderLineItemsViewProps {
  onClose: () => void;
  orderId: string | null;
}

// ── Helpers ────────────────────────────────────────────────────

const SectionLabel = ({ label }: { label: string }) => (
  <Text
    style={{
      fontSize: 10,
      fontWeight: "600",
      color: colors.muted,
      textTransform: "uppercase",
      letterSpacing: 0.8,
      marginBottom: 6,
    }}
  >
    {label}
  </Text>
);

const StatusPill = ({ label, color }: { label: string; color: string }) => (
  <View
    style={{
      backgroundColor: color + "20",
      borderWidth: 1,
      borderColor: color + "50",
      borderRadius: 20,
      paddingHorizontal: 9,
      paddingVertical: 3,
      marginRight: 5,
      marginBottom: 5,
    }}
  >
    <Text style={{ fontSize: 11, fontWeight: "600", color, textTransform: "capitalize" }}>
      {label}
    </Text>
  </View>
);

const PriceRow = ({
  label,
  amount,
  color,
  bold,
  large,
}: {
  label: string;
  amount: number;
  color?: string;
  bold?: boolean;
  large?: boolean;
}) => (
  <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 3 }}>
    <Text
      style={{
        fontSize: large ? 13 : 12,
        fontWeight: bold ? "700" : "400",
        color: color || colors.label,
      }}
    >
      {label}
    </Text>
    <Text
      style={{
        fontSize: large ? 13 : 12,
        fontWeight: bold ? "700" : "500",
        color: color || colors.heading,
        fontVariant: ["tabular-nums"],
      }}
    >
      {amount < 0 ? `-$${Math.abs(amount).toFixed(2)}` : `$${amount.toFixed(2)}`}
    </Text>
  </View>
);

const Divider = () => (
  <View
    style={{
      borderTopWidth: 1,
      borderTopColor: colors.border,
      borderStyle: "dashed",
      marginVertical: 8,
    }}
  />
);

const formatTime = (iso: string | null | undefined) => {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
};

const formatOrderType = (type: string | undefined) => {
  if (!type) return "";
  const map: Record<string, string> = {
    "Dine In": "Dine In", dine_in: "Dine In",
    Takeaway: "Takeaway", takeout: "Takeaway",
    Delivery: "Delivery", delivery: "Delivery",
  };
  return map[type] || type;
};

// ── Main component ─────────────────────────────────────────────

const OrderLineItemsView = ({ onClose, orderId }: OrderLineItemsViewProps) => {
  const orderToView = useOrder(orderId);
  const items = orderToView?.items || [];

  const { subtotal, discount, tax, total, amountPaid, amountDue, cashTotal, cashSavings } =
    useMemo(() => {
      if (!orderToView) return { subtotal: 0, discount: 0, tax: 0, total: 0, amountPaid: 0, amountDue: 0, cashTotal: 0, cashSavings: 0 };

      const localSubtotal = orderToView.items.reduce((acc, item) => acc + item.price * item.quantity, 0);
      const disc = orderToView.total_discount ?? (orderToView.checkDiscount ? localSubtotal * orderToView.checkDiscount.value : 0);
      const finalTax = orderToView.total_tax ?? 0;
      const finalTotal = orderToView.total_amount ?? localSubtotal - disc + finalTax;
      const finalSubtotal = finalTotal - finalTax;
      const finalAmountPaid = orderToView.amount_paid ?? 0;
      const finalAmountDue = orderToView.amount_due ?? finalTotal;
      const finalCashTotal = orderToView.total_cash_amount ?? 0;
      const finalCashSavings = finalCashTotal > 0 && finalCashTotal < finalTotal ? finalTotal - finalCashTotal : 0;

      return {
        subtotal: finalSubtotal > 0 ? finalSubtotal : localSubtotal,
        discount: disc, tax: finalTax, total: finalTotal,
        amountPaid: finalAmountPaid, amountDue: finalAmountDue,
        cashTotal: finalCashTotal, cashSavings: finalCashSavings,
      };
    }, [orderToView]);

  const validPayments = useMemo(() => orderToView?.payments?.filter((p) => !p.isVoided) || [], [orderToView?.payments]);
  const totalRefunded = useMemo(() => validPayments.reduce((acc, p) => acc + (p.refundedAmount ?? 0), 0), [validPayments]);

  if (!orderToView) return null;

  const orderTypeLabel = formatOrderType(orderToView.order_type);
  const itemCount = items.length;
  const customerLabel = orderToView.customer_name || "Walk-In";
  const timeLabel = formatTime(orderToView.opened_at);
  const orderStatusColor = ORDER_STATUS_COLORS[orderToView.order_status] || colors.info;
  const paidStatusColor = PAYMENT_STATUS_COLORS[orderToView.paid_status] || colors.muted;
  const isPaid = orderToView.paid_status === "Paid";

  return (
    <View
      style={{
        borderRadius: 14,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: colors.border,
        backgroundColor: colors.panel,
        width: "100%",
      }}
    >
      {/* ═══ HEADER ═══ */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 11,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.card,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          {/* Row 1: order number + paid badge */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 3 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>
              Order #{orderToView.display_number || orderToView.order_number || "—"}
            </Text>
            <View
              style={{
                backgroundColor: paidStatusColor + "20",
                borderWidth: 1,
                borderColor: paidStatusColor + "50",
                borderRadius: 20,
                paddingHorizontal: 8,
                paddingVertical: 2,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: "600", color: paidStatusColor }}>
                {orderToView.paid_status}
              </Text>
            </View>
          </View>

          {/* Row 2: meta */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
            <Text style={{ fontSize: 12, color: colors.label }}>
              {[orderTypeLabel, customerLabel, `${itemCount} item${itemCount !== 1 ? "s" : ""}`].filter(Boolean).join(" · ")}
            </Text>
            {timeLabel ? (
              <Text style={{ fontSize: 11, color: colors.muted }}>{timeLabel}</Text>
            ) : null}
          </View>
        </View>
      </View>

      {/* ═══ BODY ═══ */}
      <View style={{ flexDirection: "row", maxHeight: 420 }}>

        {/* ─── Left: Items list ─── */}
        <ScrollView
          style={{
            flex: 1,
            borderRightWidth: 1,
            borderRightColor: colors.border,
            paddingHorizontal: 14,
            paddingVertical: 12,
          }}
          showsVerticalScrollIndicator={false}
        >
          <SectionLabel label="Items" />
          {items.map((item, idx) => (
            <ReadOnlyBillItem key={item.id} item={item} isLast={idx === items.length - 1} />
          ))}
        </ScrollView>

        {/* ─── Right: Details ─── */}
        <ScrollView
          style={{ flex: 1, paddingHorizontal: 14, paddingVertical: 12 }}
          showsVerticalScrollIndicator={false}
        >
          {/* Status chips */}
          <SectionLabel label="Status" />
          <View style={{ flexDirection: "row", flexWrap: "wrap", marginBottom: 12 }}>
            {orderTypeLabel ? <StatusPill label={orderTypeLabel} color={colors.teal} /> : null}
            <StatusPill label={orderToView.order_status.replace(/_/g, " ")} color={orderStatusColor} />
            <StatusPill
              label={orderToView.check_status}
              color={orderToView.check_status === "Opened" ? colors.success : colors.muted}
            />
          </View>

          {/* Pricing breakdown */}
          <SectionLabel label="Pricing" />
          <PriceRow label="Subtotal" amount={subtotal} />
          {discount > 0 && <PriceRow label="Discount" amount={-discount} color={colors.success} />}
          <PriceRow label="Tax" amount={tax} />

          <Divider />
          <PriceRow label="Total" amount={total} color={colors.heading} bold large />

          {cashSavings > 0 && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: colors.success + "15",
                borderWidth: 1,
                borderColor: colors.success + "30",
                borderRadius: 8,
                paddingHorizontal: 8,
                paddingVertical: 4,
                marginTop: 6,
              }}
            >
              <Text style={{ fontSize: 11, color: colors.success }}>
                Cash ${cashTotal.toFixed(2)}
              </Text>
              <Text style={{ fontSize: 11, color: colors.muted, marginHorizontal: 4 }}>·</Text>
              <Text style={{ fontSize: 11, color: colors.success, fontWeight: "600" }}>
                Save ${cashSavings.toFixed(2)}
              </Text>
            </View>
          )}

          {amountPaid > 0 && !isPaid && (
            <PriceRow label="Paid" amount={amountPaid} color={colors.success} />
          )}
          {amountDue > 0.01 && !isPaid && (
            <View style={{ marginTop: 2 }}>
              <PriceRow label="Balance Due" amount={amountDue} color={colors.warning} bold />
            </View>
          )}
          {isPaid && (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 5,
                marginTop: 4,
              }}
            >
              <View
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.success,
                }}
              />
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.success }}>
                Fully Paid
              </Text>
            </View>
          )}

          {/* Payments */}
          {validPayments.length > 0 && (
            <View style={{ marginTop: 14 }}>
              <SectionLabel label="Payments" />
              <View style={{ gap: 8 }}>
                {validPayments.map((p, i) => (
                  <View
                    key={p.id || i}
                    style={{
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                      borderRadius: 8,
                      paddingHorizontal: 10,
                      paddingVertical: 7,
                    }}
                  >
                    {/* Method + amount */}
                    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
                      <Text style={{ fontSize: 12, fontWeight: "600", color: colors.heading }}>
                        {p.method === "Card"
                          ? `${p.cardBrand || "Card"}${p.last4 ? ` ····${p.last4}` : ""}`
                          : "Cash"}
                      </Text>
                      <Text style={{ fontSize: 13, fontWeight: "700", color: colors.teal, fontVariant: ["tabular-nums"] }}>
                        ${p.amount.toFixed(2)}
                      </Text>
                    </View>

                    {/* Meta row */}
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 }}>
                      {p.timestamp && (
                        <Text style={{ fontSize: 10, color: colors.muted }}>{formatTime(p.timestamp)}</Text>
                      )}
                      <View
                        style={{
                          backgroundColor: colors.success + "20",
                          borderRadius: 20,
                          paddingHorizontal: 6,
                          paddingVertical: 1,
                        }}
                      >
                        <Text style={{ fontSize: 10, color: colors.success, fontWeight: "600" }}>
                          {p.status === "captured" ? "Captured" : p.status}
                        </Text>
                      </View>
                    </View>

                    {/* Cash details */}
                    {p.method === "Cash" && p.amountTendered != null && (
                      <Text style={{ fontSize: 10, color: colors.label, marginTop: 3 }}>
                        Tendered ${p.amountTendered.toFixed(2)}
                        {p.changeGiven ? ` · Change $${p.changeGiven.toFixed(2)}` : ""}
                      </Text>
                    )}

                    {/* Tip */}
                    {p.tip_amount > 0 && (
                      <Text style={{ fontSize: 10, color: colors.label, marginTop: 2 }}>
                        Tip ${p.tip_amount.toFixed(2)}
                      </Text>
                    )}
                  </View>
                ))}
              </View>
            </View>
          )}

          {/* Refunds */}
          {totalRefunded > 0 && (
            <View
              style={{
                marginTop: 12,
                backgroundColor: colors.danger + "15",
                borderWidth: 1,
                borderColor: colors.danger + "30",
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 7,
              }}
            >
              <SectionLabel label="Refunds" />
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.danger, fontVariant: ["tabular-nums"] }}>
                −${totalRefunded.toFixed(2)} refunded
              </Text>
            </View>
          )}
        </ScrollView>
      </View>

      {/* ═══ FOOTER ═══ */}
      <View
        style={{
          paddingHorizontal: 16,
          paddingVertical: 9,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          backgroundColor: colors.card,
          flexDirection: "row",
          justifyContent: "flex-end",
        }}
      >
        <TouchableOpacity
          onPress={onClose}
          style={{
            paddingHorizontal: 14,
            paddingVertical: 6,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border,
            backgroundColor: "transparent",
          }}
        >
          <Text style={{ fontSize: 12, fontWeight: "600", color: colors.label }}>Close</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default OrderLineItemsView;
