import { usePaymentVerification } from "@/hooks/usePaymentVerification";
import { colors } from "@/lib/theme";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react-native";
import { useMemo, useState } from "react";
import {
    ActivityIndicator,
    Modal,
    Text,
    TouchableOpacity,
    View,
} from "react-native";
import { PaymentAlreadyRecordedModal } from "./PaymentAlreadyRecordedModal";

/**
 * Wave Cat-B (C4): renders the verifying-state UI when the payment store has
 * an active `verification` entry. Reads polling state from
 * `usePaymentVerification`. When the server poll matches, surfaces the
 * PaymentAlreadyRecordedModal (Wave 8 / C5). Try Again (C6) is gated by
 * `canRetryNow` AND a secondary tap-confirm modal.
 */
export default function PaymentVerifyingOverlay() {
  const {
    isVerifying,
    elapsedMs,
    totalMs,
    canRetryNow,
    matchedPayment,
    manualCheckNow,
    markComplete,
    retryWithNewCharge,
    quality,
    verification,
  } = usePaymentVerification();

  const [retryConfirmOpen, setRetryConfirmOpen] = useState(false);

  const elapsedSeconds = Math.floor(elapsedMs / 1000);
  const totalSeconds = Math.ceil(totalMs / 1000);
  const progressPct = useMemo(
    () => Math.min(100, Math.round((elapsedMs / totalMs) * 100)),
    [elapsedMs, totalMs],
  );

  if (!isVerifying) return null;

  const matched = matchedPayment?.matched === true;

  return (
    <View
      style={{
        flex: 1,
        padding: 24,
        backgroundColor: colors.panel,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 480,
          padding: 24,
          borderRadius: 16,
          backgroundColor: colors.screen,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {/* Icon + title */}
        <View style={{ alignItems: "center", marginBottom: 16 }}>
          <View
            style={{
              width: 64,
              height: 64,
              borderRadius: 32,
              backgroundColor: colors.warning + "20",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 12,
            }}
          >
            <ActivityIndicator size="large" color={colors.warning} />
          </View>
          <Text
            style={{
              fontSize: 20,
              fontWeight: "700",
              color: colors.heading,
              textAlign: "center",
            }}
          >
            Verifying Payment
          </Text>
        </View>

        {/* Body copy */}
        <Text
          style={{
            fontSize: 14,
            color: colors.label,
            textAlign: "center",
            marginBottom: 20,
            lineHeight: 20,
          }}
        >
          {verification?.reason === "crash_recovery"
            ? "An incomplete payment from a previous session was detected. Checking with the server…"
            : "The network was slow when we tried to record this payment. Checking with the server before letting you retry — this prevents a duplicate charge."}
        </Text>

        {/* Progress bar */}
        <View style={{ marginBottom: 16 }}>
          <View
            style={{
              backgroundColor: colors.border,
              height: 6,
              borderRadius: 3,
              overflow: "hidden",
            }}
          >
            <View
              style={{
                backgroundColor: colors.warning,
                height: "100%",
                width: `${progressPct}%`,
              }}
            />
          </View>
          <Text
            style={{
              marginTop: 6,
              fontSize: 12,
              color: colors.muted,
              textAlign: "center",
            }}
          >
            {elapsedSeconds}s / {totalSeconds}s · network: {quality}
          </Text>
        </View>

        {/* CTAs */}
        <View style={{ gap: 8 }}>
          <TouchableOpacity
            onPress={manualCheckNow}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 12,
              borderRadius: 10,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Loader2 size={16} color={colors.heading} />
            <Text style={{ color: colors.heading, fontWeight: "600", fontSize: 14 }}>
              Check now
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => canRetryNow && setRetryConfirmOpen(true)}
            disabled={!canRetryNow}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
              paddingVertical: 12,
              borderRadius: 10,
              backgroundColor: canRetryNow ? colors.danger : colors.muted + "40",
              opacity: canRetryNow ? 1 : 0.5,
            }}
          >
            <RefreshCw size={16} color={canRetryNow ? "#fff" : colors.muted} />
            <Text
              style={{
                color: canRetryNow ? "#fff" : colors.muted,
                fontWeight: "700",
                fontSize: 14,
              }}
            >
              Try Again with new charge
            </Text>
          </TouchableOpacity>
          {!canRetryNow && (
            <Text
              style={{
                fontSize: 11,
                color: colors.muted,
                textAlign: "center",
                marginTop: 4,
              }}
            >
              Try Again unlocks once we confirm no payment landed (
              {Math.max(0, totalSeconds - elapsedSeconds)}s)
            </Text>
          )}
        </View>
      </View>

      {/* Wave 8 (C5): adoption-confirm dialog when matched */}
      <PaymentAlreadyRecordedModal
        visible={matched}
        matchedPayment={matchedPayment}
        verification={verification}
        onConfirm={markComplete}
        onCancel={() => {
          // Operator wants to keep verifying — no-op (next poll may revise).
        }}
      />

      {/* Wave 8 (C6): secondary tap-confirm for Try Again */}
      <RetryConfirmModal
        visible={retryConfirmOpen}
        onConfirm={() => {
          setRetryConfirmOpen(false);
          retryWithNewCharge();
        }}
        onCancel={() => setRetryConfirmOpen(false)}
      />
    </View>
  );
}

interface RetryConfirmModalProps {
  visible: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function RetryConfirmModal({ visible, onConfirm, onCancel }: RetryConfirmModalProps) {
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
            Charge Customer Again?
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
            This will charge the customer again. Are you sure no payment
            posted? If you're unsure, choose Cancel and check with the
            customer or your manager.
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
                Yes, Charge Again
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
