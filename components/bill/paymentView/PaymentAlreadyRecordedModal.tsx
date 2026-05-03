import type { CheckRecentPaymentMatch } from "@/hooks/usePaymentVerification";
import { colors } from "@/lib/theme";
import type { PaymentVerificationState } from "@/stores/usePaymentStore";
import { CheckCircle2 } from "lucide-react-native";
import { Modal, Text, TouchableOpacity, View } from "react-native";

interface PaymentAlreadyRecordedModalProps {
  visible: boolean;
  matchedPayment: CheckRecentPaymentMatch | null;
  verification: PaymentVerificationState | null;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Wave Cat-B (C5): adoption-confirmation dialog. Surfaces when
 * `check_recent_payment` finds the matching server row. Confirming runs the
 * adoption path (no new process_payment RPC); cancelling drops back to the
 * verifying overlay so the operator can decide manually.
 */
export function PaymentAlreadyRecordedModal({
  visible,
  matchedPayment,
  verification,
  onConfirm,
  onCancel,
}: PaymentAlreadyRecordedModalProps) {
  if (!matchedPayment || !verification) return null;

  const matchedAmountDollars =
    typeof matchedPayment.amount_cents === "number"
      ? (matchedPayment.amount_cents / 100).toFixed(2)
      : null;
  const localAmountDollars = (verification.amountCents / 100).toFixed(2);

  // Tip-only mismatch: principal matches but tip differs (server doesn't have it).
  // Principal mismatch: amounts diverge — manager-PIN gating recommended (deferred to UI consumer).
  const hasAmountMismatch =
    matchedPayment.amount_cents != null &&
    matchedPayment.amount_cents !== verification.amountCents;

  const hasKeyMismatch =
    !!matchedPayment.idempotency_key &&
    !!verification.idempotencyKey &&
    matchedPayment.idempotency_key !== verification.idempotencyKey;

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.75)",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        }}
      >
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 16,
            padding: 22,
            width: "100%",
            maxWidth: 420,
            borderWidth: 1,
            borderColor: colors.success + "60",
          }}
        >
          {/* Icon */}
          <View style={{ alignItems: "center", marginBottom: 14 }}>
            <View
              style={{
                width: 56,
                height: 56,
                borderRadius: 28,
                backgroundColor: colors.success + "20",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <CheckCircle2 size={28} color={colors.success} />
            </View>
          </View>

          {/* Title */}
          <Text
            style={{
              fontSize: 17,
              fontWeight: "700",
              color: colors.success,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Payment Already Recorded
          </Text>

          {/* Body */}
          <Text
            style={{
              fontSize: 13,
              color: colors.label,
              textAlign: "center",
              marginBottom: 16,
              lineHeight: 19,
            }}
          >
            We found this payment on the server. Marking complete will adopt
            the server record — no new charge will be made.
          </Text>

          {/* Details */}
          <View
            style={{
              padding: 12,
              borderRadius: 8,
              backgroundColor: colors.screen,
              marginBottom: 14,
              gap: 6,
            }}
          >
            <DetailRow label="Server payment id" value={matchedPayment.payment_id ?? "—"} mono />
            {matchedAmountDollars != null && (
              <DetailRow label="Server amount" value={`$${matchedAmountDollars}`} />
            )}
            <DetailRow label="Local amount" value={`$${localAmountDollars}`} />
          </View>

          {/* Mismatch warnings */}
          {hasAmountMismatch && (
            <Text
              style={{
                fontSize: 12,
                color: colors.warning,
                marginBottom: 10,
                textAlign: "center",
              }}
            >
              ⚠ Amounts differ. If this is a tip-only difference, the tip
              can be added later via the receipt. For principal differences,
              get manager approval before adopting.
            </Text>
          )}
          {hasKeyMismatch && (
            <Text
              style={{
                fontSize: 12,
                color: colors.warning,
                marginBottom: 10,
                textAlign: "center",
              }}
            >
              ⚠ The server payment was recorded by a different key — another
              station may have processed this. Confirm with operator before
              adopting.
            </Text>
          )}

          {/* CTAs */}
          <View style={{ flexDirection: "row", gap: 10 }}>
            <TouchableOpacity
              onPress={onCancel}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.heading, fontWeight: "600", fontSize: 14 }}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              style={{
                flex: 1,
                paddingVertical: 12,
                borderRadius: 10,
                backgroundColor: colors.success,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                Mark Complete
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DetailRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
      <Text
        style={{
          fontSize: 12,
          color: colors.heading,
          fontFamily: mono ? "monospace" : undefined,
          maxWidth: "65%",
        }}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}
