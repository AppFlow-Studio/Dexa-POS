import { round2 } from "@/lib/order-calculator";
import { INKIND_LABEL } from "@/lib/paymentMethod";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { useUiScale } from "@/lib/uiScale";
import {
  useActiveOrder,
  useActiveOrderTotals,
} from "@/stores/selectors/orderSelectors";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { AlertTriangle, ArrowLeft, HandHeart } from "lucide-react-native";
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
              // inKind field/on pair from the palette: black-on-yellow in
              // dark, inverted in light so it doesn't punch a hole in the UI.
              backgroundColor: colors.inKindField,
              borderRadius: s(12),
              borderWidth: 1.5,
              borderColor: colors.inKindOn,
              padding: s(20),
              alignItems: "center",
              gap: s(6),
            }}
          >
            <View
              style={{
                width: s(52),
                height: s(52),
                borderRadius: s(13),
                backgroundColor: `${colors.inKindOn}22`,
                alignItems: "center",
                justifyContent: "center",
                marginBottom: s(6),
              }}
            >
              <HandHeart size={s(26)} color={colors.inKindOn} strokeWidth={2.2} />
            </View>
            <Text style={[labelStyle, { color: `${colors.inKindOn}B3` }]}>
              Amount Settled
            </Text>
            <Text
              style={{
                fontSize: s(34),
                fontWeight: "800",
                color: colors.inKindOn,
              }}
            >
              ${displayTotal.toFixed(2)}
            </Text>
            <Text
              style={{
                fontSize: s(11),
                color: `${colors.inKindOn}B3`,
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
            // Step 1 (Continue) uses the tile's own field/on pair. Step 2
            // SWAPS them so the irreversible action reads as the loudest
            // thing on screen. Because the pair is semantic rather than a
            // literal black/yellow, the swap stays correct in both themes:
            // dark goes black->yellow fill, light goes yellow->near-black.
            backgroundColor: isConfirming
              ? colors.inKindOn
              : colors.inKindField,
            borderWidth: 1.5,
            borderColor: colors.inKindOn,
            opacity: isProcessing || total <= 0 ? 0.35 : 1,
          }}
        >
          <Text
            style={{
              fontWeight: "700",
              fontSize: s(13),
              color: isConfirming ? colors.inKindField : colors.inKindOn,
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
