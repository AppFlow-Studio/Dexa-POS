import { round2 } from "@/lib/order-calculator";
import InKindLogo from "@/components/brand/InKindLogo";
import { INKIND_LABEL } from "@/lib/paymentMethod";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { useUiScale } from "@/lib/uiScale";
import {
  useActiveOrder,
  useActiveOrderTotals,
} from "@/stores/selectors/orderSelectors";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { AlertTriangle, ArrowLeft } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { Text, TextInput, TouchableOpacity, View } from "react-native";

/**
 * In-kind settlement: marks the check fully paid at CARD pricing while
 * collecting no money (donated meals, promo/staff comps that still post
 * revenue at menu price).
 *
 * Deliberate design points:
 *  • CARD pricing, always. It reads `outstanding_total` (never
 *    `cashAmountDue`) and the store's `method: "InKind"` takes the card
 *    branch throughout, matching what the backend records.
 *  • No tip input. A tip on money never collected would post to employee
 *    tip payouts as a real liability; the server strips it regardless
 *    (trg_inkind_normalize), so offering the field would be a lie.
 *  • No cash drawer. Unlike CashPaymentView this never calls
 *    PrinterService.openCashDrawer — nothing goes in the till.
 *  • Two-step confirm. There is no PIN gate (any staff member may record
 *    one), so an explicit confirmation screen is the only thing standing
 *    between a mis-tap and a zeroed-out check.
 */
const InKindPaymentView = () => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);

  const activeOrder = useActiveOrder();
  const orderTotals = useActiveOrderTotals();
  const setView = usePaymentStore((st) => st.setView);
  const handlePaymentCompletion = usePaymentStore(
    (st) => st.handlePaymentCompletion,
  );
  const expandSheetToFull = usePaymentStore((st) => st.expandSheetToFull);
  const setTransactionProcessing = usePaymentStore(
    (st) => st.setTransactionProcessing,
  );

  const [isConfirming, setIsConfirming] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    expandSheetToFull();
  }, [expandSheetToFull]);

  useEffect(() => {
    setTransactionProcessing(isProcessing);
    return () => setTransactionProcessing(false);
  }, [isProcessing, setTransactionProcessing]);

  // CARD pricing by design — never cashAmountDue. Mirrors the card path's
  // fallback chain so a freshly-synced order with zeroed local totals still
  // shows the real balance.
  const outstandingCard = orderTotals?.amountDue ?? 0;
  const effectiveOutstanding =
    outstandingCard > 0
      ? outstandingCard
      : activeOrder?.amount_due !== undefined && activeOrder.amount_due >= 0.01
        ? activeOrder.amount_due
        : (orderTotals?.total ?? 0);

  const total = round2(effectiveOutstanding);

  // Freeze the amount at confirm time: handlePaymentCompletion zeroes the
  // order totals, which would otherwise flash $0.00 mid-transition.
  const frozenTotal = useRef(total);
  const displayTotal = isProcessing ? frozenTotal.current : total;

  const handleBack = () => {
    if (isConfirming) {
      setIsConfirming(false);
      return;
    }
    setView("payment-method-selection");
  };

  const handleConfirm = async () => {
    frozenTotal.current = total;
    setIsProcessing(true);
    try {
      await handlePaymentCompletion({
        method: "InKind",
        tipAmount: 0,
        transactionDetails: {
          // Card-priced: the backend records unit_price, not cash_price.
          isCashPriced: false,
          // Free-text justification, surfaced in payment history. Trimmed to
          // avoid persisting a whitespace-only string.
          ...(reason.trim() ? { note: reason.trim() } : {}),
        },
      });
      // Success view takes over; deliberately not clearing isProcessing so
      // the frozen total stays on screen through the transition.
    } catch (error) {
      console.error("[InKindPayment] Error recording settlement:", error);
      toastService.show({
        title: `${INKIND_LABEL} Settlement Failed`,
        message: error instanceof Error ? error.message : "Unknown error",
        type: "error",
        duration: 5000,
      });
      setIsProcessing(false);
      setIsConfirming(false);
    }
  };

  const labelStyle = {
    color: colors.muted,
    fontSize: s(10),
    fontWeight: "700" as const,
    textTransform: "uppercase" as const,
    letterSpacing: 0.8,
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* ── Header ── */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingHorizontal: s(20),
          paddingVertical: s(12),
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          backgroundColor: colors.panel,
        }}
      >
        <TouchableOpacity
          onPress={handleBack}
          disabled={isProcessing}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: s(5),
            opacity: isProcessing ? 0.4 : 1,
            minWidth: s(72),
          }}
        >
          <ArrowLeft size={s(15)} color={colors.muted} />
          <Text
            style={{ color: colors.muted, fontSize: s(13), fontWeight: "600" }}
          >
            Back
          </Text>
        </TouchableOpacity>

        <Text
          style={{
            flex: 1,
            textAlign: "center",
            fontSize: s(15),
            fontWeight: "700",
            color: colors.heading,
          }}
        >
          {INKIND_LABEL} Settlement
        </Text>

        <View style={{ minWidth: s(72) }} />
      </View>

      {/* ── Body ── */}
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          padding: s(24),
        }}
      >
        <View style={{ width: "100%", maxWidth: s(520), gap: s(16) }}>
          {/* Amount being written off */}
          <View
            style={{
              // Normal panel with a brand-gold border, not a black slab —
              // the lockup below carries the identity, so this reads
              // correctly in both themes.
              backgroundColor: colors.panel,
              borderRadius: s(12),
              borderWidth: 1.5,
              borderColor: colors.inKindOn,
              padding: s(20),
              alignItems: "center",
              gap: s(6),
            }}
          >
            {/* Black chip: the lockup is gold-on-black and only reads on a
                dark field, so the chip stays black in both themes. */}
            <View
              style={{
                backgroundColor: colors.inKindField,
                borderRadius: s(10),
                paddingHorizontal: s(14),
                paddingVertical: s(11),
                marginBottom: s(10),
              }}
            >
              <InKindLogo width={s(104)} />
            </View>
            <Text style={labelStyle}>Amount Settled</Text>
            <Text
              style={{
                fontSize: s(34),
                fontWeight: "800",
                color: colors.heading,
              }}
            >
              ${displayTotal.toFixed(2)}
            </Text>
            <Text
              style={{
                fontSize: s(11),
                color: colors.muted,
                textAlign: "center",
              }}
            >
              Menu (card) pricing — no cash discount applied
            </Text>
          </View>

          {/* The warning that carries the weight, since there is no PIN gate */}
          <View
            style={{
              flexDirection: "row",
              gap: s(10),
              backgroundColor: `${colors.warning}12`,
              borderRadius: s(10),
              borderWidth: 1,
              borderColor: `${colors.warning}45`,
              padding: s(14),
            }}
          >
            <AlertTriangle
              size={s(18)}
              color={colors.warning}
              strokeWidth={2.2}
            />
            <View style={{ flex: 1, gap: s(3) }}>
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "700",
                  color: colors.warning,
                }}
              >
                No money will be collected
              </Text>
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.label,
                  lineHeight: s(17),
                }}
              >
                This marks the check fully paid and closes it. Nothing goes in
                the drawer and no card is charged. It is reported separately
                from cash and card sales.
              </Text>
            </View>
          </View>

          {/* Optional justification */}
          {!isConfirming && (
            <View style={{ gap: s(6) }}>
              <Text style={labelStyle}>Reason (optional)</Text>
              <TextInput
                value={reason}
                onChangeText={setReason}
                editable={!isProcessing}
                placeholder="e.g. Donation, staff meal, service recovery"
                placeholderTextColor={colors.muted}
                maxLength={120}
                style={{
                  backgroundColor: colors.panel,
                  borderRadius: s(8),
                  borderWidth: 1.5,
                  borderColor: colors.border,
                  paddingHorizontal: s(12),
                  paddingVertical: s(10),
                  fontSize: s(14),
                  color: colors.heading,
                }}
              />
            </View>
          )}

          {/* Step 2: explicit confirmation */}
          {isConfirming && (
            <View
              style={{
                backgroundColor: colors.panel,
                borderRadius: s(10),
                borderWidth: 1.5,
                borderColor: colors.inKindOn,
                padding: s(16),
                gap: s(4),
              }}
            >
              <Text
                style={{
                  fontSize: s(14),
                  fontWeight: "800",
                  color: colors.heading,
                  textAlign: "center",
                }}
              >
                Settle ${displayTotal.toFixed(2)} as {INKIND_LABEL}?
              </Text>
              <Text
                style={{
                  fontSize: s(11),
                  color: colors.label,
                  textAlign: "center",
                  lineHeight: s(17),
                }}
              >
                {reason.trim()
                  ? `Reason: ${reason.trim()}`
                  : "No reason recorded."}
              </Text>
            </View>
          )}
        </View>
      </View>

      {/* ── Bottom Bar ── */}
      <View
        style={{
          flexDirection: "row",
          borderTopWidth: 1,
          borderTopColor: colors.border,
          padding: s(12),
          gap: s(10),
          backgroundColor: colors.panel,
        }}
      >
        <TouchableOpacity
          onPress={handleBack}
          disabled={isProcessing}
          style={{
            flex: 1,
            paddingVertical: s(14),
            borderRadius: s(9),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: colors.screen,
            borderWidth: 1,
            borderColor: colors.border,
            opacity: isProcessing ? 0.35 : 1,
          }}
        >
          <Text
            style={{
              color: colors.heading,
              fontWeight: "600",
              fontSize: s(13),
            }}
          >
            {isConfirming ? "Go Back" : "Cancel"}
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => (isConfirming ? handleConfirm() : setIsConfirming(true))}
          disabled={isProcessing || total <= 0}
          style={{
            flex: 2,
            paddingVertical: s(14),
            borderRadius: s(9),
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "row",
            gap: s(7),
            // Brand gold fill in BOTH steps. The label carries the step
            // difference ("Continue" -> "Yes, Settle as inKind"), and step 2
            // deepens the border so the irreversible action still reads as
            // the heavier of the two without changing colour identity.
            // Label is inKindField (black) on the gold — 9.4:1 in light and
            // 11.3:1 in dark. Gold is never used AS text: at ~2:1 on white it
            // is a fill/border colour only.
            backgroundColor: colors.inKindOn,
            borderWidth: isConfirming ? 2.5 : 1.5,
            borderColor: isConfirming ? colors.inKindField : colors.inKindOn,
            opacity: isProcessing || total <= 0 ? 0.35 : 1,
          }}
        >
          <Text
            style={{
              fontWeight: "700",
              fontSize: s(13),
              color: colors.inKindField,
            }}
          >
            {isProcessing
              ? "Recording..."
              : isConfirming
                ? `Yes, Settle as ${INKIND_LABEL}`
                : "Continue"}
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

export default InKindPaymentView;
