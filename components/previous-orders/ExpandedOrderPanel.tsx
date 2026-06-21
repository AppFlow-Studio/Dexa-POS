import {
    derivePaymentRefundState,
    getCashPricedOrderTotal,
    usesCashPricing,
} from "@/lib/paymentStatus";
import { colors } from "@/lib/theme";
import { OrderProfile } from "@/lib/types";
import { useUiScale } from "@/lib/uiScale";
import { formatAddress } from "@/utils/addressUtils";
import {
    Banknote,
    Clock,
    CreditCard,
    DollarSign,
    Mail,
    MapPin,
    Phone,
    Play,
    Printer,
    RotateCcw,
    User,
} from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ExpandedOrderPanelProps {
  order: OrderProfile;
  onPrint: (order: OrderProfile) => void;
  onViewTimeline: (order: OrderProfile) => void;
  onTipAdjust: (order: OrderProfile) => void;
  onRefund?: (order: OrderProfile) => void;
  onContinue?: (order: OrderProfile) => void;
}

const ExpandedOrderPanel: React.FC<ExpandedOrderPanelProps> = ({
  order,
  onPrint,
  onViewTimeline,
  onTipAdjust,
  onRefund,
  onContinue,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const paymentSummary = useMemo(() => {
    const isCashPricing = usesCashPricing(order.payments);
    const subtotal = order.items.reduce((sum, item) => {
      if (isCashPricing) {
        return (
          sum +
          (item.cashSubtotal ?? item.subtotal ?? item.price * item.quantity)
        );
      }
      return sum + (item.subtotal ?? item.price * item.quantity);
    }, 0);
    const tax = isCashPricing
      ? order.items.reduce(
          (sum, item) => sum + (item.cashTaxAmount ?? item.taxAmount ?? 0),
          0,
        )
      : (order.total_tax ?? 0);
    const tip = (order.payments || [])
      .filter((p) => !p.isVoided)
      .reduce((sum, p) => sum + (p.tip_amount || 0), 0);
    const refund = (order.payments || []).reduce(
      (sum, p) => sum + (p.refundedAmount ?? 0),
      0,
    );
    const total = getCashPricedOrderTotal(order) ?? order.total_amount ?? 0;
    const netRaw = total - refund;
    const net = Math.abs(netRaw) < 0.005 ? 0 : netRaw;

    const activePayments = (order.payments || []).filter(
      (p) => !p.isPreAuth && (!p.isVoided || (p.refundedAmount ?? 0) > 0),
    );
    let paymentMethodLabel = "";
    let isCashPayment = false;
    if (activePayments.length > 0) {
      const p = activePayments[0];
      if (p.method === "Cash") {
        paymentMethodLabel = "Cash";
        isCashPayment = true;
      } else {
        const brand = p.cardBrand || "Card";
        paymentMethodLabel = p.last4 ? `${brand} ending in ${p.last4}` : brand;
      }
      if (activePayments.length > 1) {
        paymentMethodLabel += ` +${activePayments.length - 1} more`;
      }
    }

    return {
      subtotal,
      tax,
      tip,
      refund,
      net,
      paymentMethodLabel,
      isCashPayment,
      isCashPricing,
    };
  }, [order]);

  const hasCardPayments = useMemo(() => {
    return (order.payments || []).some(
      (p) => p.method !== "Cash" && !p.isVoided,
    );
  }, [order.payments]);

  const canRefund = useMemo(
    () =>
      !!onRefund && !derivePaymentRefundState(order.payments).isFullyRefunded,
    [onRefund, order.payments],
  );

  const customerName = order.customer_name?.trim();
  const customerPhone = order.customer_phone?.trim();
  const customerEmail = order.customer_email?.trim();
  const deliveryAddress = formatAddress(order.delivery_address).trim();
  const hasCustomerInfo = !!(
    customerName ||
    customerPhone ||
    customerEmail ||
    deliveryAddress
  );

  return (
    <View
      className="border-t px-4 py-3"
      style={{
        backgroundColor: colors.card,
        borderTopColor: colors.border,
        borderLeftWidth: s(4),
        borderLeftColor: colors.teal,
      }}
    >
      {hasCustomerInfo && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            flexWrap: "wrap",
            gap: s(12),
            marginBottom: s(10),
            paddingBottom: s(10),
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "center", gap: s(6) }}
          >
            <View
              style={{
                width: s(3),
                height: s(16),
                backgroundColor: colors.teal,
                borderRadius: s(1.5),
              }}
            />
            <Text
              style={{
                fontSize: s(11),
                fontWeight: "700",
                color: colors.teal,
                textTransform: "uppercase",
                letterSpacing: s(0.5),
              }}
            >
              Customer
            </Text>
          </View>
          {customerName ? (
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s(6),
                paddingHorizontal: s(10),
                paddingVertical: s(5),
                borderRadius: s(8),
                backgroundColor: colors.teal + "18",
                borderWidth: 1,
                borderColor: colors.teal + "40",
              }}
            >
              <User color={colors.teal} size={s(14)} />
              <Text
                style={{
                  fontSize: s(13),
                  fontWeight: "700",
                  color: colors.teal,
                }}
                numberOfLines={1}
              >
                {customerName}
              </Text>
            </View>
          ) : null}
          {customerPhone ? (
            <CustomerChip
              icon={<Phone color={colors.label} size={12} />}
              text={customerPhone}
            />
          ) : null}
          {customerEmail ? (
            <CustomerChip
              icon={<Mail color={colors.label} size={12} />}
              text={customerEmail}
            />
          ) : null}
          {deliveryAddress ? (
            <CustomerChip
              icon={<MapPin color={colors.label} size={12} />}
              text={deliveryAddress}
            />
          ) : null}
        </View>
      )}
      <View className="flex-row" style={{ gap: s(6) }}>
        {/* Column 1: Items (~50%) */}
        <View style={{ flex: 5 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(6),
              marginBottom: s(8),
            }}
          >
            <View
              style={{
                width: s(3),
                height: s(16),
                backgroundColor: colors.teal,
                borderRadius: s(1.5),
              }}
            />
            <Text
              style={{
                fontSize: s(11),
                fontWeight: "700",
                color: colors.teal,
                textTransform: "uppercase",
                letterSpacing: s(0.5),
              }}
            >
              Items
            </Text>
          </View>
          {order.items.slice(0, 3).map((item, idx) => (
            <View
              key={item.id || idx}
              className="flex-row justify-between"
              style={{ marginBottom: s(2) }}
            >
              <Text
                style={{
                  fontSize: s(13),
                  color: colors.label,
                  flex: 1,
                  marginRight: s(8),
                }}
                numberOfLines={1}
              >
                {item.quantity > 1 ? `${item.quantity}x ` : "1x "}
                {item.name}
              </Text>
              <Text style={{ fontSize: s(13), color: colors.label }}>
                $
                {(paymentSummary.isCashPricing
                  ? (item.cashSubtotal ??
                    item.subtotal ??
                    item.price * item.quantity)
                  : (item.subtotal ?? item.price * item.quantity)
                ).toFixed(2)}
              </Text>
            </View>
          ))}
          {order.items.length > 3 && (
            <Text style={{ fontSize: s(12), color: colors.muted, marginTop: s(4) }}>
              ...and {order.items.length - 3} more items
            </Text>
          )}
        </View>

        {/* Vertical divider */}
        <View className="border-r border-border" />

        {/* Column 2: Payment (~28%) */}
        <View style={{ flex: 2.8 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(6),
              marginBottom: s(8),
            }}
          >
            <View
              style={{
                width: s(3),
                height: s(16),
                backgroundColor: colors.teal,
                borderRadius: s(1.5),
              }}
            />
            <Text
              style={{
                fontSize: s(11),
                fontWeight: "700",
                color: colors.teal,
                textTransform: "uppercase",
                letterSpacing: s(0.5),
              }}
            >
              Payment
            </Text>
          </View>
          <PaymentLine label="Subtotal" amount={paymentSummary.subtotal} />
          <PaymentLine label="Tax" amount={paymentSummary.tax} />
          {paymentSummary.tip > 0 && (
            <PaymentLine
              label="Tip"
              amount={paymentSummary.tip}
              colorValue={colors.success}
            />
          )}
          {paymentSummary.refund > 0 && (
            <PaymentLine
              label="Refund"
              amount={-paymentSummary.refund}
              colorValue={colors.danger}
            />
          )}
          <View className="border-t border-border" style={{ marginVertical: s(6) }} />
          <View className="flex-row justify-between" style={{ marginBottom: s(2) }}>
            <Text
              style={{ fontSize: s(13), fontWeight: "700", color: colors.heading }}
            >
              Net Total
            </Text>
            <Text
              style={{ fontSize: s(13), fontWeight: "700", color: colors.heading }}
            >
              ${paymentSummary.net.toFixed(2)}
            </Text>
          </View>
          {paymentSummary.paymentMethodLabel ? (
            <View className="flex-row items-center" style={{ gap: s(2), marginTop: s(3) }}>
              {paymentSummary.isCashPayment ? (
                <Banknote color={colors.teal} size={s(14)} />
              ) : (
                <CreditCard color={colors.teal} size={s(14)} />
              )}
              <Text
                style={{ fontSize: s(12), fontWeight: "700", color: colors.teal }}
              >
                {paymentSummary.paymentMethodLabel}
              </Text>
            </View>
          ) : null}
        </View>

        {/* Vertical divider */}
        <View className="border-r border-border" />

        {/* Column 3: Actions (~22%) */}
        <View style={{ flex: 2.2 }}>
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: s(6),
              marginBottom: s(8),
            }}
          >
            <View
              style={{
                width: s(3),
                height: s(16),
                backgroundColor: colors.teal,
                borderRadius: s(1.5),
              }}
            />
            <Text
              style={{
                fontSize: s(11),
                fontWeight: "700",
                color: colors.teal,
                textTransform: "uppercase",
                letterSpacing: s(0.5),
              }}
            >
              Actions
            </Text>
          </View>
          <View style={{ gap: s(2) }}>
            {onContinue && (
              <QuickActionButton
                icon={<Play color={colors.teal} size={s(14)} />}
                label="Continue Order"
                onPress={() => onContinue(order)}
              />
            )}
            <QuickActionButton
              icon={<Printer color={colors.teal} size={s(14)} />}
              label="Print Receipt"
              onPress={() => onPrint(order)}
            />
            <QuickActionButton
              icon={<Clock color={colors.teal} size={s(14)} />}
              label="View Timeline"
              onPress={() => onViewTimeline(order)}
            />
            {hasCardPayments && (
              <QuickActionButton
                icon={<DollarSign color={colors.teal} size={s(14)} />}
                label="Adjust Tip"
                onPress={() => onTipAdjust(order)}
              />
            )}
            {canRefund && onRefund && (
              <QuickActionButton
                icon={<RotateCcw color={colors.teal} size={s(14)} />}
                label="Process Refund"
                onPress={() => onRefund(order)}
              />
            )}
          </View>
        </View>
      </View>
    </View>
  );
};

const CustomerChip = ({
  icon,
  text,
}: {
  icon: React.ReactNode;
  text: string;
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: s(5),
        paddingHorizontal: s(8),
        paddingVertical: s(4),
        borderRadius: s(6),
        backgroundColor: colors.muted + "12",
      }}
    >
      {icon}
      <Text
        style={{ fontSize: s(12), fontWeight: "500", color: colors.label }}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
};

const PaymentLine = ({
  label,
  amount,
  colorValue,
  bold,
}: {
  label: string;
  amount: number;
  colorValue?: string;
  bold?: boolean;
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <View className="flex-row justify-between" style={{ marginBottom: s(2) }}>
      <Text
        style={{
          fontSize: s(12),
          fontWeight: bold ? "700" : "400",
          color: bold ? colors.heading : colors.label,
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: s(12),
          fontWeight: bold ? "700" : "400",
          color: bold ? colors.heading : colorValue || colors.label,
        }}
      >
        {amount < 0 ? "-" : ""}${Math.abs(amount).toFixed(2)}
      </Text>
    </View>
  );
};

const QuickActionButton = ({
  icon,
  label,
  onPress,
}: {
  icon: React.ReactNode;
  label: string;
  onPress: () => void;
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={0.8}
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: s(6),
        borderRadius: s(8),
        paddingHorizontal: s(10),
        paddingVertical: s(9),
        backgroundColor: colors.teal + "20",
        borderWidth: 1,
        borderColor: colors.teal + "40",
      }}
    >
      {icon}
      <Text style={{ fontSize: s(11), fontWeight: "700", color: colors.teal }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

export default React.memo(ExpandedOrderPanel);
