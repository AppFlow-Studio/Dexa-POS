import { bottomSheetTheme, colors } from "@/lib/theme";
import {
  useActiveOrderTotals,
  useOrderTotals,
} from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import PanelSheet, {
  PanelSheetScrollView as BottomSheetScrollView,
} from "@/components/ui/PanelSheet";
import { BottomSheetMethods } from "@/components/ui/bottomSheet";
import { ArrowRight, CreditCard, Banknote, X } from "lucide-react-native";
import React, { forwardRef, useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import { useUiScale } from "@/lib/uiScale";

interface PricingBreakdownSheetProps {
  onClose: () => void;
  onPressProceedToPayment: () => void;
  totalDisplayAmount: number;
  hasPayments?: boolean;
  orderId?: string;
}

// ── helpers ──────────────────────────────────────────────────────────────────

function fmt(n: number) {
  return `$${n.toFixed(2)}`;
}

function Row({
  label,
  card,
  cash,
  labelColor,
  valueColor,
  bold,
  large,
  negate,
  s,
}: {
  label: string;
  card: number;
  cash: number;
  labelColor?: string;
  valueColor?: string;
  bold?: boolean;
  large?: boolean;
  negate?: boolean;
  s: (n: number) => number;
}) {
  const lc = labelColor ?? colors.label;
  const vc = valueColor ?? colors.heading;
  const fs = large ? s(15) : s(13);
  const fw = bold ? "700" : "500";
  const prefix = negate ? "−" : "";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: s(7),
      }}
    >
      <Text style={{ flex: 1, fontSize: fs, fontWeight: fw, color: lc }}>
        {label}
      </Text>
      {/* card column */}
      <Text
        style={{
          width: s(90),
          textAlign: "right",
          fontSize: fs,
          fontWeight: fw,
          color: vc,
        }}
      >
        {prefix}
        {fmt(card)}
      </Text>
      {/* cash column */}
      <Text
        style={{
          width: s(90),
          textAlign: "right",
          fontSize: fs,
          fontWeight: fw,
          color: cash !== card ? colors.success : vc,
        }}
      >
        {prefix}
        {fmt(cash)}
      </Text>
    </View>
  );
}

function Divider({ dim, s }: { dim?: boolean; s: (n: number) => number }) {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: dim ? colors.border + "60" : colors.border,
        marginVertical: s(4),
      }}
    />
  );
}

// ── component ─────────────────────────────────────────────────────────────────

const PricingBreakdownSheetComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  PricingBreakdownSheetProps
> = function PricingBreakdownSheetComponent(
  {
    onClose,
    onPressProceedToPayment,
    totalDisplayAmount,
    hasPayments: hasPaymentsProp,
    orderId,
  },
  ref,
) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const snapPoints = useMemo(() => ["78%"], []);

  const activeOrder = useOrderStore((s) =>
    orderId
      ? s.ordersById[orderId]
      : s.activeOrderId
        ? s.ordersById[s.activeOrderId]
        : undefined,
  );
  const activeOrderSubtotal = useOrderStore((s) => s.activeOrderSubtotal);
  const activeOrderTax = useOrderStore((s) => s.activeOrderTax);
  const activeOrderDiscount = useOrderStore((s) => s.activeOrderDiscount);
  const activeOrderOutstandingSubtotal = useOrderStore(
    (s) => s.activeOrderOutstandingSubtotal,
  );
  const activeOrderOutstandingTax = useOrderStore(
    (s) => s.activeOrderOutstandingTax,
  );

  const activeOrderTotals = useActiveOrderTotals(!orderId);
  const orderTotals = useOrderTotals(orderId ?? null);
  const liveTotals = orderTotals ?? activeOrderTotals;
  const liveServiceCharge = liveTotals?.serviceCharge ?? 0;
  const liveServiceChargeName = liveTotals?.serviceChargeName ?? "Service Charge";
  const liveServiceChargeRate = liveTotals?.serviceChargeRate ?? null;
  const cashSubtotal = liveTotals?.cashSubtotal ?? 0;
  const cashDiscount = liveTotals?.cashDiscount ?? 0;
  const cashTax = liveTotals?.cashTax ?? 0;
  const cashTotal = liveTotals?.cashTotal ?? 0;
  const cashAmountDue = liveTotals?.cashAmountDue ?? 0;
  // cash service charge from live totals (uses cash subtotal as base)
  const cashServiceCharge = liveTotals?.cashServiceCharge ?? liveServiceCharge;
  // Remaining (unpaid) SC — shown instead of the full SC once a payment exists,
  // so Remaining Subtotal + SC + Remaining Tax reconciles to Balance Due.
  const outstandingServiceCharge =
    liveTotals?.outstandingServiceCharge ?? liveServiceCharge;
  const cashOutstandingServiceCharge =
    liveTotals?.cashOutstandingServiceCharge ?? cashServiceCharge;

  const hasPayments =
    hasPaymentsProp ?? (activeOrder?.payments?.length ?? 0) > 0;
  // p.amount is stored by the server in the pricing mode the payment was
  // taken in (cash terms when isCashPriced=true, card terms otherwise) per
  // process_payment_v14; original_amount holds the card-equivalent for
  // reporting. The previous body subtracted cashSavings under the pre-v14
  // assumption that p.amount was always card-equivalent — that became a
  // double-deduction once v14 began writing cash-terms p.amount directly
  // (S6-0010 Mocha repro on 2026-05-30: $7.82 displayed as $4.61).
  //
  // Refund handling: refunded_amount is stored in the payment's own currency,
  // so for a fully-refunded cash payment we must subtract the full amount (it
  // already matches because we're in cash terms). For partial refunds, the
  // subtraction is direct. A separate void-with-is_returned cancellation also
  // counts as a refund per MEMORY project_voided_payment_refunded_amount.
  const paidAmount =
    activeOrder?.payments
      ?.filter((p) => !p.isVoided || p.isReturned === true)
      .reduce((acc, p) => {
        const refunded = (p as any).refundedAmount ?? 0;
        return acc + Math.max(0, p.amount - refunded);
      }, 0) ?? 0;

  const displayDiscount = hasPayments
    ? 0
    : (liveTotals?.discount ?? activeOrderDiscount);
  const displaySubtotal = hasPayments
    ? Math.max(
        0,
        liveTotals?.outstandingSubtotal ?? activeOrderOutstandingSubtotal,
      )
    : (liveTotals?.subtotal ?? activeOrderSubtotal);
  const displayCashSubtotal = hasPayments
    ? Math.max(0, liveTotals?.cashOutstandingSubtotal ?? 0)
    : cashSubtotal;
  const displayTax = hasPayments
    ? Math.max(0, liveTotals?.outstandingTax ?? activeOrderOutstandingTax)
    : (liveTotals?.tax ?? activeOrderTax);
  const displayCashTax = hasPayments
    ? Math.max(0, liveTotals?.cashOutstandingTax ?? 0)
    : cashTax;
  const displayServiceCharge = hasPayments
    ? Math.max(0, outstandingServiceCharge)
    : liveServiceCharge;
  const displayCashServiceCharge = hasPayments
    ? Math.max(0, cashOutstandingServiceCharge)
    : cashServiceCharge;
  const cardTotal = Math.max(0, totalDisplayAmount);
  const displayCashTotal = hasPayments ? Math.max(0, cashAmountDue) : cashTotal;

  const hasDualPricing =
    Math.abs(displayCashSubtotal - displaySubtotal) > 0.005;
  const scLabel =
    liveServiceChargeName +
    (liveServiceChargeRate != null
      ? ` (${Number(liveServiceChargeRate).toFixed(0)}%)`
      : "");

  return (
    <PanelSheet
      ref={ref}
      presentation="bill-column"
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      {...bottomSheetTheme}
    >
      <BottomSheetScrollView
        style={{ flex: 1, backgroundColor: colors.panel }}
        contentContainerStyle={{ paddingBottom: s(24) }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: s(16),
            paddingTop: s(14),
            paddingBottom: s(12),
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text style={{ fontSize: s(15), fontWeight: "700", color: colors.heading }}>
            Order Breakdown
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={{
              padding: s(6),
              borderRadius: s(10),
              backgroundColor: colors.teal + "15",
              borderWidth: 1,
              borderColor: colors.teal + "30",
            }}
          >
            <X size={s(16)} color={colors.teal} />
          </TouchableOpacity>
        </View>

        {/* ── Column headers ─────────────────────────────────────── */}
        {hasDualPricing && (
          <View
            style={{
              flexDirection: "row",
              paddingHorizontal: s(16),
              paddingTop: s(10),
              paddingBottom: s(6),
            }}
          >
            <View style={{ flex: 1 }} />
            {/* Card header */}
            <View
              style={{
                width: s(90),
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: s(4),
              }}
            >
              <CreditCard size={s(12)} color={colors.info} />
              <Text style={{ fontSize: s(11), fontWeight: "600", color: colors.info }}>
                CARD
              </Text>
            </View>
            {/* Cash header */}
            <View
              style={{
                width: s(90),
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: s(4),
              }}
            >
              <Banknote size={s(12)} color={colors.success} />
              <Text style={{ fontSize: s(11), fontWeight: "600", color: colors.success }}>
                CASH
              </Text>
            </View>
          </View>
        )}

        <View style={{ paddingHorizontal: s(16), paddingTop: hasDualPricing ? 0 : s(10) }}>
          {/* ── Paid badge ─────────────────────────────────────── */}
          {hasPayments && paidAmount > 0 && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: s(8),
                paddingHorizontal: s(12),
                borderRadius: s(8),
                backgroundColor: colors.success + "15",
                borderWidth: 1,
                borderColor: colors.success + "40",
                marginBottom: s(8),
              }}
            >
              <Text style={{ fontSize: s(13), fontWeight: "600", color: colors.success }}>
                Amount Paid
              </Text>
              <Text style={{ fontSize: s(13), fontWeight: "700", color: colors.success }}>
                {fmt(paidAmount)}
              </Text>
            </View>
          )}

          {/* ── Subtotal ───────────────────────────────────────── */}
          {hasDualPricing ? (
            <Row
              label={hasPayments ? "Remaining Subtotal" : "Subtotal"}
              card={displaySubtotal}
              cash={displayCashSubtotal}
              s={s}
            />
          ) : (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: s(7),
              }}
            >
              <Text style={{ fontSize: s(13), color: colors.label }}>
                {hasPayments ? "Remaining Subtotal" : "Subtotal"}
              </Text>
              <Text style={{ fontSize: s(13), color: colors.heading }}>
                {fmt(displaySubtotal)}
              </Text>
            </View>
          )}

          {/* ── Discount ───────────────────────────────────────── */}
          {displayDiscount > 0 && (
            hasDualPricing ? (
              <Row
                label="Discount"
                card={displayDiscount}
                cash={cashDiscount}
                labelColor={colors.success}
                valueColor={colors.success}
                negate
                s={s}
              />
            ) : (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: s(7),
                }}
              >
                <Text style={{ fontSize: s(13), color: colors.success }}>Discount</Text>
                <Text style={{ fontSize: s(13), color: colors.success }}>
                  −{fmt(displayDiscount)}
                </Text>
              </View>
            )
          )}

          {/* ── Service Charge ─────────────────────────────────── */}
          {displayServiceCharge > 0.001 && (
            hasDualPricing ? (
              <Row
                label={hasPayments ? `Remaining ${scLabel}` : scLabel}
                card={displayServiceCharge}
                cash={displayCashServiceCharge}
                s={s}
              />
            ) : (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: s(7),
                }}
              >
                <Text style={{ fontSize: s(13), color: colors.label }}>
                  {hasPayments ? `Remaining ${scLabel}` : scLabel}
                </Text>
                <Text style={{ fontSize: s(13), color: colors.heading }}>
                  {fmt(displayServiceCharge)}
                </Text>
              </View>
            )
          )}

          {/* ── Tax ────────────────────────────────────────────── */}
          {hasDualPricing ? (
            <Row
              label={hasPayments ? "Remaining Tax" : "Tax"}
              card={displayTax}
              cash={displayCashTax}
              s={s}
            />
          ) : (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: s(7),
              }}
            >
              <Text style={{ fontSize: s(13), color: colors.label }}>
                {hasPayments ? "Remaining Tax" : "Tax"}
              </Text>
              <Text style={{ fontSize: s(13), color: colors.heading }}>
                {fmt(displayTax)}
              </Text>
            </View>
          )}

          <Divider s={s} />

          {/* ── Total ──────────────────────────────────────────── */}
          {hasDualPricing ? (
            <Row
              label={hasPayments ? "Balance Due" : "Total"}
              card={cardTotal}
              cash={displayCashTotal}
              bold
              large
              valueColor={hasPayments ? colors.warning : colors.heading}
              s={s}
            />
          ) : (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: s(6),
              }}
            >
              <Text style={{ fontSize: s(14), fontWeight: "700", color: colors.heading }}>
                {hasPayments ? "Balance Due" : "Total"}
              </Text>
              <Text
                style={{
                  fontSize: s(18),
                  fontWeight: "700",
                  color: hasPayments ? colors.warning : colors.heading,
                }}
              >
                {fmt(cardTotal)}
              </Text>
            </View>
          )}

          
          
        </View>

        {/* ── Proceed button ─────────────────────────────────────── */}
        <View style={{ paddingHorizontal: s(16), paddingTop: s(16) }}>
          <TouchableOpacity
            onPress={onPressProceedToPayment}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: s(6),
              paddingVertical: s(13),
              borderRadius: s(10),
              backgroundColor: colors.teal,
            }}
          >
            <Text style={{ fontSize: s(14), fontWeight: "700", color: colors.onSolid }}>
              Proceed to Payment
            </Text>
            <ArrowRight size={s(15)} color={colors.onSolid} />
          </TouchableOpacity>
        </View>
      </BottomSheetScrollView>
    </PanelSheet>
  );
};

const PricingBreakdownSheet = forwardRef(PricingBreakdownSheetComponent);
PricingBreakdownSheet.displayName = "PricingBreakdownSheet";

export default PricingBreakdownSheet;