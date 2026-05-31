import { colors } from "@/lib/theme";
import type { PaymentVerificationState } from "@/stores/usePaymentStore";
import { AlertTriangle, CheckCircle2, XCircle } from "lucide-react-native";
import { useState } from "react";
import {
    ActivityIndicator,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

interface PaymentTerminalReconciliationModalProps {
  visible: boolean;
  verification: PaymentVerificationState | null;
  isAdopting: boolean;
  adoptionError: string | null;
  onConfirmCharged: () => void;
  onConfirmNotCharged: () => void;
}

/**
 * Wave Cat-B (TCP-in-flight crash recovery): manual operator reconciliation.
 *
 * Surfaces when verification.reason === 'tcp_inflight_crash' (journal stuck
 * in 'initiated'). Server has no record; Castles SPI v6.0 has no
 * txnRecall/txnInquiry; only the operator can confirm whether the charge
 * went through by checking the terminal's display or batch report.
 */
export function PaymentTerminalReconciliationModal({
  visible,
  verification,
  isAdopting,
  adoptionError,
  onConfirmCharged,
  onConfirmNotCharged,
}: PaymentTerminalReconciliationModalProps) {
  const [discardConfirmOpen, setDiscardConfirmOpen] = useState(false);

  if (!verification || !visible) return null;

  const amountDollars = (verification.amountCents / 100).toFixed(2);
  const tipDollars =
    verification.tipCents != null
      ? (verification.tipCents / 100).toFixed(2)
      : null;
  const ageMinutes = Math.max(
    0,
    Math.round((Date.now() - verification.startedAt) / 60_000),
  );
  const ageLabel =
    ageMinutes < 1
      ? "just now"
      : ageMinutes === 1
        ? "1 minute ago"
        : `${ageMinutes} minutes ago`;

  return (
    <View style={{ width: "100%", alignItems: "center" }}>
      <View
        style={{
          backgroundColor: colors.panel,
          borderRadius: 16,
          width: "100%",
          maxWidth: 480,
          borderWidth: 1,
          borderColor: colors.warning + "60",
          overflow: "hidden",
        }}
      >
        <View style={{ padding: 22 }}>
            {/* Icon + title */}
            <View style={{ alignItems: "center", marginBottom: 14 }}>
              <View
                style={{
                  width: 60,
                  height: 60,
                  borderRadius: 30,
                  backgroundColor: colors.warning + "20",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <AlertTriangle size={30} color={colors.warning} />
              </View>
            </View>

            <Text
              style={{
                fontSize: 18,
                fontWeight: "700",
                color: colors.heading,
                textAlign: "center",
                marginBottom: 8,
              }}
            >
              Incomplete Payment Detected
            </Text>

            <Text
              style={{
                fontSize: 13,
                color: colors.label,
                textAlign: "center",
                marginBottom: 16,
                lineHeight: 19,
              }}
            >
              The app closed before we received the response from the
              terminal.{"\n"}
              <Text style={{ fontWeight: "700" }}>
                Check the terminal display or batch report
              </Text>{" "}
              to see if this payment went through.
            </Text>

            {/* Details panel */}
            <View
              style={{
                padding: 14,
                borderRadius: 10,
                backgroundColor: colors.screen,
                marginBottom: 12,
                gap: 8,
              }}
            >
              <DetailRow label="Amount" value={`$${amountDollars}`} highlight />
              {tipDollars != null && parseFloat(tipDollars) > 0 && (
                <DetailRow label="Tip" value={`$${tipDollars}`} />
              )}
              {verification.terminalTxnId && (
                <DetailRow
                  label="Reference ID"
                  value={verification.terminalTxnId}
                  mono
                />
              )}
              <DetailRow label="Age" value={ageLabel} />
            </View>

            {/* Adoption error */}
            {adoptionError && (
              <View
                style={{
                  padding: 10,
                  borderRadius: 8,
                  backgroundColor: colors.danger + "15",
                  borderWidth: 1,
                  borderColor: colors.danger + "40",
                  marginBottom: 12,
                }}
              >
                <Text style={{ color: colors.danger, fontSize: 12 }}>
                  {adoptionError}
                </Text>
              </View>
            )}

            {/* CTAs */}
            <View style={{ gap: 10 }}>
              <TouchableOpacity
                onPress={onConfirmCharged}
                disabled={isAdopting}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 14,
                  borderRadius: 10,
                  backgroundColor: colors.success,
                  opacity: isAdopting ? 0.6 : 1,
                }}
              >
                {isAdopting ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <CheckCircle2 size={18} color="#fff" />
                )}
                <Text
                  style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}
                >
                  {isAdopting
                    ? "Recording…"
                    : "Yes — record this payment"}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setDiscardConfirmOpen(true)}
                disabled={isAdopting}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 8,
                  paddingVertical: 12,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: colors.danger + "60",
                  opacity: isAdopting ? 0.4 : 1,
                }}
              >
                <XCircle size={16} color={colors.danger} />
                <Text
                  style={{
                    color: colors.danger,
                    fontWeight: "600",
                    fontSize: 14,
                  }}
                >
                  No — discard
                </Text>
              </TouchableOpacity>
            </View>

          <Text
            style={{
              fontSize: 11,
              color: colors.muted,
              textAlign: "center",
              marginTop: 12,
              lineHeight: 16,
            }}
          >
            The same payment is safe to record twice — the server
            de-duplicates by transaction key.
          </Text>
        </View>
      </View>

      {/* Double-tap confirm for discard (destructive).
          Rendered as an absoluteFill overlay (not a nested RN <Modal>) because
          this whole tree is already inside PaymentBottomSheet's <Modal> — a
          second nested <Modal> renders behind the parent on Android. */}
      {discardConfirmOpen && (
        <DiscardConfirmOverlay
          onConfirm={() => {
            setDiscardConfirmOpen(false);
            onConfirmNotCharged();
          }}
          onCancel={() => setDiscardConfirmOpen(false)}
        />
      )}
    </View>
  );
}

function DetailRow({
  label,
  value,
  mono,
  highlight,
}: {
  label: string;
  value: string;
  mono?: boolean;
  highlight?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
      <Text style={{ fontSize: 12, color: colors.muted }}>{label}</Text>
      <Text
        style={{
          fontSize: highlight ? 16 : 12,
          fontWeight: highlight ? "700" : "600",
          color: highlight ? colors.heading : colors.label,
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

interface DiscardConfirmOverlayProps {
  onConfirm: () => void;
  onCancel: () => void;
}

function DiscardConfirmOverlay({
  onConfirm,
  onCancel,
}: DiscardConfirmOverlayProps) {
  return (
    <View
      style={[
        StyleSheet.absoluteFill,
        {
          backgroundColor: "rgba(0,0,0,0.85)",
          alignItems: "center",
          justifyContent: "center",
          padding: 24,
        },
      ]}
    >
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: 16,
            padding: 22,
            width: "100%",
            maxWidth: 360,
            borderWidth: 1,
            borderColor: colors.danger + "60",
          }}
        >
          <View style={{ alignItems: "center", marginBottom: 12 }}>
            <View
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                backgroundColor: colors.danger + "20",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertTriangle size={26} color={colors.danger} />
            </View>
          </View>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: colors.danger,
              textAlign: "center",
              marginBottom: 8,
            }}
          >
            Confirm: no charge happened?
          </Text>
          <Text
            style={{
              fontSize: 13,
              color: colors.label,
              textAlign: "center",
              marginBottom: 16,
              lineHeight: 19,
            }}
          >
            If the customer WAS charged and you discard this, it will not be
            recorded on the POS — caught only at end-of-day reconciliation.
          </Text>
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
                backgroundColor: colors.danger,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14 }}>
                Yes, discard
              </Text>
            </TouchableOpacity>
          </View>
        </View>
    </View>
  );
}
