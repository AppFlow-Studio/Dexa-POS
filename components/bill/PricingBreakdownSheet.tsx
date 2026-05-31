import { bottomSheetTheme, colors } from "@/lib/theme";
import { useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetScrollView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { ArrowRight, CreditCard, Banknote, X } from "lucide-react-native";
import React, { forwardRef, useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface PricingBreakdownSheetProps {
  onClose: () => void;
  onPressProceedToPayment: () => void;
  totalDisplayAmount: number;
  hasPayments?: boolean;
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
}: {
  label: string;
  card: number;
  cash: number;
  labelColor?: string;
  valueColor?: string;
  bold?: boolean;
  large?: boolean;
  negate?: boolean;
}) {
  const lc = labelColor ?? colors.label;
  const vc = valueColor ?? colors.heading;
  const fs = large ? 15 : 13;
  const fw = bold ? "700" : "500";
  const prefix = negate ? "−" : "";
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        paddingVertical: 7,
      }}
    >
      <Text style={{ flex: 1, fontSize: fs, fontWeight: fw, color: lc }}>
        {label}
      </Text>
      {/* card column */}
      <Text
        style={{
          width: 90,
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
          width: 90,
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

function Divider({ dim }: { dim?: boolean }) {
  return (
    <View
      style={{
        height: 1,
        backgroundColor: dim ? colors.border + "60" : colors.border,
        marginVertical: 4,
      }}
    />
  );
}

// ── component ─────────────────────────────────────────────────────────────────

const PricingBreakdownSheetComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  PricingBreakdownSheetProps
> = function PricingBreakdownSheetComponent(
  { onClose, onPressProceedToPayment, totalDisplayAmount, hasPayments: hasPaymentsProp },
  ref,
) {
  const snapPoints = useMemo(() => ["48%"], []);

  const activeOrder = useOrderStore((s) =>
    s.activeOrderId ? s.ordersById[s.activeOrderId] : undefined,
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

  const liveTotals = useActiveOrderTotals();
  const liveServiceCharge = liveTotals?.serviceCharge ?? 0;
  const liveServiceChargeName = liveTotals?.serviceChargeName ?? "Service Charge";
  const liveServiceChargeRate = liveTotals?.serviceChargeRate ?? null;
  const cashSubtotal = liveTotals?.cashSubtotal ?? 0;
  const cashTax = liveTotals?.cashTax ?? 0;
  const cashTotal = liveTotals?.cashTotal ?? 0;
  const cashAmountDue = liveTotals?.cashAmountDue ?? 0;
  // cash service charge from live totals (uses cash subtotal as base)
  const cashServiceCharge = liveTotals?.cashServiceCharge ?? liveServiceCharge;

  const hasPayments =
    hasPaymentsProp ?? (activeOrder?.payments?.length ?? 0) > 0;
  const paidAmount =
    activeOrder?.payments
      ?.filter((p) => !p.isVoided)
      .reduce((acc, p) => acc + p.amount, 0) ?? 0;
  // p.amount is stored by the server in the pricing mode the payment was
  // taken in (cash terms when isCashPriced=true, card terms otherwise) per
  // process_payment_v14; original_amount holds the card-equivalent for
  // reporting. The previous body subtracted cashSavings under the pre-v14
  // assumption that p.amount was always card-equivalent — that became a
  // double-deduction once v14 began writing cash-terms p.amount directly
  // (S6-0010 Mocha repro on 2026-05-30: $7.82 displayed as $4.61).

  const displayDiscount = hasPayments ? 0 : activeOrderDiscount;
  const displaySubtotal = hasPayments
    ? activeOrderOutstandingSubtotal
    : activeOrderSubtotal;
  const displayCashSubtotal = hasPayments
    ? (cashAmountDue - cashTax - cashServiceCharge)
    : cashSubtotal;
  const displayTax = hasPayments ? activeOrderOutstandingTax : activeOrderTax;
  const displayCashTax = cashTax;
  const cardTotal = totalDisplayAmount;

  const hasDualPricing = Math.abs(cashSubtotal - activeOrderSubtotal) > 0.005;
  const scLabel =
    liveServiceChargeName +
    (liveServiceChargeRate != null
      ? ` (${Number(liveServiceChargeRate).toFixed(0)}%)`
      : "");

  const renderBackdrop = useMemo(
    () => (props: any) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.7}
      />
    ),
    [],
  );

  return (
    <BottomSheet
      ref={ref}
      index={-1}
      snapPoints={snapPoints}
      enablePanDownToClose
      onClose={onClose}
      {...bottomSheetTheme}
      backdropComponent={renderBackdrop}
    >
      <BottomSheetScrollView
        style={{ flex: 1, backgroundColor: colors.panel }}
        contentContainerStyle={{ paddingBottom: 24 }}
      >
        {/* ── Header ─────────────────────────────────────────────── */}
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            paddingHorizontal: 16,
            paddingTop: 14,
            paddingBottom: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}>
            Order Breakdown
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={{
              padding: 6,
              borderRadius: 10,
              backgroundColor: colors.teal + "15",
              borderWidth: 1,
              borderColor: colors.teal + "30",
            }}
          >
            <X size={16} color={colors.teal} />
          </TouchableOpacity>
        </View>

        {/* ── Column headers ─────────────────────────────────────── */}
        {hasDualPricing && (
          <View
            style={{
              flexDirection: "row",
              paddingHorizontal: 16,
              paddingTop: 10,
              paddingBottom: 6,
            }}
          >
            <View style={{ flex: 1 }} />
            {/* Card header */}
            <View
              style={{
                width: 90,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 4,
              }}
            >
              <CreditCard size={12} color={colors.info} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.info }}>
                CARD
              </Text>
            </View>
            {/* Cash header */}
            <View
              style={{
                width: 90,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "flex-end",
                gap: 4,
              }}
            >
              <Banknote size={12} color={colors.success} />
              <Text style={{ fontSize: 11, fontWeight: "600", color: colors.success }}>
                CASH
              </Text>
            </View>
          </View>
        )}

        <View style={{ paddingHorizontal: 16, paddingTop: hasDualPricing ? 0 : 10 }}>
          {/* ── Paid badge ─────────────────────────────────────── */}
          {hasPayments && paidAmount > 0 && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: colors.success + "15",
                borderWidth: 1,
                borderColor: colors.success + "40",
                marginBottom: 8,
              }}
            >
              <Text style={{ fontSize: 13, fontWeight: "600", color: colors.success }}>
                Amount Paid
              </Text>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.success }}>
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
            />
          ) : (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 7,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.label }}>
                {hasPayments ? "Remaining Subtotal" : "Subtotal"}
              </Text>
              <Text style={{ fontSize: 13, color: colors.heading }}>
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
                cash={displayDiscount}
                labelColor={colors.success}
                valueColor={colors.success}
                negate
              />
            ) : (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 7,
                }}
              >
                <Text style={{ fontSize: 13, color: colors.success }}>Discount</Text>
                <Text style={{ fontSize: 13, color: colors.success }}>
                  −{fmt(displayDiscount)}
                </Text>
              </View>
            )
          )}

          {/* ── Service Charge ─────────────────────────────────── */}
          {liveServiceCharge > 0.001 && (
            hasDualPricing ? (
              <Row
                label={scLabel}
                card={liveServiceCharge}
                cash={cashServiceCharge}
              />
            ) : (
              <View
                style={{
                  flexDirection: "row",
                  justifyContent: "space-between",
                  alignItems: "center",
                  paddingVertical: 7,
                }}
              >
                <Text style={{ fontSize: 13, color: colors.label }}>{scLabel}</Text>
                <Text style={{ fontSize: 13, color: colors.heading }}>
                  {fmt(liveServiceCharge)}
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
            />
          ) : (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 7,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.label }}>
                {hasPayments ? "Remaining Tax" : "Tax"}
              </Text>
              <Text style={{ fontSize: 13, color: colors.heading }}>
                {fmt(displayTax)}
              </Text>
            </View>
          )}

          <Divider />

          {/* ── Total ──────────────────────────────────────────── */}
          {hasDualPricing ? (
            <Row
              label={hasPayments ? "Balance Due" : "Total"}
              card={cardTotal}
              cash={hasPayments ? cashAmountDue : cashTotal}
              bold
              large
              valueColor={hasPayments ? colors.warning : colors.heading}
            />
          ) : (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 6,
              }}
            >
              <Text style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}>
                {hasPayments ? "Balance Due" : "Total"}
              </Text>
              <Text
                style={{
                  fontSize: 18,
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
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <TouchableOpacity
            onPress={onPressProceedToPayment}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 13,
              borderRadius: 10,
              backgroundColor: colors.teal,
            }}
          >
            <Text style={{ fontSize: 14, fontWeight: "700", color: colors.onSolid }}>
              Proceed to Payment
            </Text>
            <ArrowRight size={15} color={colors.onSolid} />
          </TouchableOpacity>
        </View>
      </BottomSheetScrollView>
    </BottomSheet>
  );
};

const PricingBreakdownSheet = forwardRef(PricingBreakdownSheetComponent);
PricingBreakdownSheet.displayName = "PricingBreakdownSheet";

export default PricingBreakdownSheet;
