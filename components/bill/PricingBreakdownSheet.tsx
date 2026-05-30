import { bottomSheetTheme, colors } from "@/lib/theme";
import { useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { useOrderStore } from "@/stores/useOrderStore";
import BottomSheet, {
  BottomSheetBackdrop,
  BottomSheetView,
} from "@gorhom/bottom-sheet";
import { BottomSheetMethods } from "@gorhom/bottom-sheet/lib/typescript/types";
import { ArrowRight, X } from "lucide-react-native";
import React, { forwardRef, useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface PricingBreakdownSheetProps {
  onClose: () => void;
  onPressProceedToPayment: () => void;
  totalDisplayAmount: number;
  hasPayments?: boolean;
}

const PricingBreakdownSheetComponent: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  PricingBreakdownSheetProps
> = function PricingBreakdownSheetComponent(
  {
    onClose,
    onPressProceedToPayment,
    totalDisplayAmount,
    hasPayments: hasPaymentsProp,
  },
  ref,
) {
  const snapPoints = useMemo(() => ["45%"], []);

  const activeOrderSubtotal = useOrderStore((s) => s.activeOrderSubtotal);
  const activeOrderTax = useOrderStore((s) => s.activeOrderTax);
  const activeOrderDiscount = useOrderStore((s) => s.activeOrderDiscount);
  const activeOrderOutstandingSubtotal = useOrderStore(
    (s) => s.activeOrderOutstandingSubtotal,
  );
  const activeOrderOutstandingTax = useOrderStore(
    (s) => s.activeOrderOutstandingTax,
  );
  const activeOrder = useOrderStore((s) =>
    s.activeOrderId ? s.ordersById[s.activeOrderId] : undefined,
  );
  // Live SC from the selector — reactive to seatCount + rule, so the row
  // appears the moment the calculator returns > 0 instead of waiting for
  // the deferred `_scheduleTotalsRecompute` to write `order.service_charge`,
  // which can race with rekey/broadcast hydration on a fresh seat.
  const liveTotals = useActiveOrderTotals();
  const liveServiceCharge = liveTotals?.serviceCharge ?? 0;
  const liveServiceChargeName = liveTotals?.serviceChargeName ?? "Service Charge";
  const liveServiceChargeRate = liveTotals?.serviceChargeRate ?? null;

  const hasPayments =
    hasPaymentsProp ?? (activeOrder?.payments?.length ?? 0) > 0;
  const paidAmount =
    activeOrder?.payments?.reduce((acc, p) => acc + p.amount, 0) ?? 0;
  const displayDiscount = hasPayments ? 0 : activeOrderDiscount;
  const displaySubtotal = hasPayments
    ? activeOrderOutstandingSubtotal
    : activeOrderSubtotal;
  const displayTax = hasPayments ? activeOrderOutstandingTax : activeOrderTax;
  const displayTotal = totalDisplayAmount;

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
      enablePanDownToClose={true}
      onClose={onClose}
      {...bottomSheetTheme}
      backdropComponent={renderBackdrop}
    >
      <BottomSheetView style={{ flex: 1, backgroundColor: colors.panel }}>
        {/* Header */}
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
          <Text
            style={{ fontSize: 15, fontWeight: "700", color: colors.heading }}
          >
            Pricing Breakdown
          </Text>
          <TouchableOpacity
            onPress={onClose}
            style={{
              padding: 6,
              borderRadius: 10,
              backgroundColor: colors.teal + "10",
              borderWidth: 1,
              borderColor: colors.teal + "30",
            }}
          >
            <X size={16} color={colors.teal} />
          </TouchableOpacity>
        </View>

        {/* Rows */}
        <View style={{ paddingHorizontal: 16, paddingTop: 12, gap: 2 }}>
          {/* Paid amount */}
          {hasPayments && paidAmount > 0 && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 12,
                borderRadius: 8,
                backgroundColor: colors.success + "10",
                marginBottom: 4,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.success }}>Paid</Text>
              <Text
                style={{
                  fontSize: 13,
                  fontWeight: "600",
                  color: colors.success,
                }}
              >
                ${paidAmount.toFixed(2)}
              </Text>
            </View>
          )}

          {/* Subtotal */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 9,
            }}
          >
            <Text style={{ fontSize: 13, color: colors.label }}>
              {hasPayments ? "Remaining Subtotal" : "Subtotal"}
            </Text>
            <Text style={{ fontSize: 13, color: colors.heading }}>
              ${displaySubtotal.toFixed(2)}
            </Text>
          </View>

          {/* Discount */}
          {displayDiscount > 0 && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 9,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.success }}>
                Discount
              </Text>
              <Text style={{ fontSize: 13, color: colors.success }}>
                −${displayDiscount.toFixed(2)}
              </Text>
            </View>
          )}

          {/* Service Charge */}
          {liveServiceCharge > 0.001 && (
            <View
              style={{
                flexDirection: "row",
                justifyContent: "space-between",
                alignItems: "center",
                paddingVertical: 9,
              }}
            >
              <Text style={{ fontSize: 13, color: colors.label }}>
                {liveServiceChargeName}
                {liveServiceChargeRate != null
                  ? ` (${Number(liveServiceChargeRate).toFixed(2)}%)`
                  : ""}
              </Text>
              <Text style={{ fontSize: 13, color: colors.heading }}>
                ${liveServiceCharge.toFixed(2)}
              </Text>
            </View>
          )}

          {/* Tax */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 9,
            }}
          >
            <Text style={{ fontSize: 13, color: colors.label }}>
              {hasPayments ? "Remaining Tax" : "Tax"}
            </Text>
            <Text style={{ fontSize: 13, color: colors.heading }}>
              ${displayTax.toFixed(2)}
            </Text>
          </View>

          {/* Divider */}
          <View
            style={{
              height: 1,
              backgroundColor: colors.border,
              marginVertical: 6,
            }}
          />

          {/* Total */}
          <View
            style={{
              flexDirection: "row",
              justifyContent: "space-between",
              alignItems: "center",
              paddingVertical: 6,
            }}
          >
            <Text
              style={{ fontSize: 14, fontWeight: "700", color: colors.heading }}
            >
              {hasPayments ? "Balance Due" : "Total"}
            </Text>
            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: hasPayments ? colors.warning : colors.heading,
              }}
            >
              ${displayTotal.toFixed(2)}
            </Text>
          </View>
        </View>

        {/* Proceed button */}
        <View style={{ paddingHorizontal: 16, paddingTop: 16 }}>
          <TouchableOpacity
            onPress={onPressProceedToPayment}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 6,
              paddingVertical: 11,
              borderRadius: 10,
              backgroundColor: colors.teal,
            }}
          >
            <Text
              style={{ fontSize: 13, fontWeight: "700", color: colors.onSolid }}
            >
              Proceed to Payment
            </Text>
            <ArrowRight size={15} color={colors.onSolid} />
          </TouchableOpacity>
        </View>
      </BottomSheetView>
    </BottomSheet>
  );
};

const PricingBreakdownSheet = forwardRef(PricingBreakdownSheetComponent);
PricingBreakdownSheet.displayName = "PricingBreakdownSheet";

export default PricingBreakdownSheet;
