import { useUiScale } from "@/lib/uiScale";
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
import { PaymentTerminalReconciliationModal } from "./PaymentTerminalReconciliationModal";

/**
 * Wave Cat-B (C4): renders the verifying-state UI when the payment store has
 * an active `verification` entry. Reads polling state from
 * `usePaymentVerification`. When the server poll matches, surfaces the
 * PaymentAlreadyRecordedModal (Wave 8 / C5). Try Again (C6) is gated by
 * `canRetryNow` AND a secondary tap-confirm modal.
 */
export default function PaymentVerifyingOverlay() {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
  const {
    isVerifying,
    elapsedMs,
    totalMs,
    canRetryNow,
    matchedPayment,
    manualCheckNow,
    markComplete,
    retryWithNewCharge,
    markAsCharged,
    markAsNotCharged,
    isAdopting,
    adoptionError,
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

  // Wave Cat-B (TCP-in-flight crash recovery): branch on reason. The polling
  // overlay assumes the server may have a row to find — that's NOT true for
  // 'tcp_inflight_crash' (RPC was never called). Render the manual
  // reconciliation modal instead and skip the polling UI entirely.
  if (verification?.reason === "tcp_inflight_crash") {
    // Render inline — PaymentTerminalReconciliationModal no longer wraps in a
    // native <Modal> because this whole tree is already inside
    // PaymentBottomSheet's <Modal> (nested RN Modals don't reliably present
    // on Android — symptom was a blank colors.panel "white body").
    return (
      <View
        style={{
          minHeight: s(500),
          padding: s(24),
          backgroundColor: colors.panel,
          alignItems: "center",
        }}
      >
        <PaymentTerminalReconciliationModal
          visible={true}
          verification={verification}
          isAdopting={isAdopting}
          adoptionError={adoptionError}
          onConfirmCharged={markAsCharged}
          onConfirmNotCharged={markAsNotCharged}
        />
      </View>
    );
  }

  const matched = matchedPayment?.matched === true;

  return (
    <View
      style={{
        // No `justifyContent: center` — when this renders inside a flex-1
        // ScrollView child, vertical-centering pushes the card past the
        // visible viewport ("below the sheet"). Top-anchor instead so the
        // card sits right under the progress-strip header.
        minHeight: s(500),
        padding: s(24),
        backgroundColor: colors.panel,
        alignItems: "center",
      }}
    >
      <View
        style={{
          width: "100%",
          maxWidth: 480,
          padding: s(24),
          borderRadius: s(16),
          backgroundColor: colors.screen,
          borderWidth: 1,
          borderColor: colors.border,
        }}
      >
        {/* Icon + title */}
        <View style={{ alignItems: "center", marginBottom: s(16) }}>
          <View
            style={{
              width: s(64),
              height: s(64),
              borderRadius: s(32),
              backgroundColor: colors.warning + "20",
              alignItems: "center",
              justifyContent: "center",
              marginBottom: s(12),
            }}
          >
            <ActivityIndicator size="large" color={colors.warning} />
          </View>
          <Text
            style={{
              fontSize: s(20),
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
            fontSize: s(14),
            color: colors.label,
            textAlign: "center",
            marginBottom: s(20),
            lineHeight: s(20),
          }}
        >
          {verification?.reason === "crash_recovery"
            ? "An incomplete payment from a previous session was detected. Checking with the server…"
            : "The network was slow when we tried to record this payment. Checking with the server before letting you retry — this prevents a duplicate charge."}
        </Text>

        {/* Progress bar */}
        <View style={{ marginBottom: s(16) }}>
          <View
            style={{
              backgroundColor: colors.border,
              height: 6,
              borderRadius: s(3),
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
              marginTop: s(6),
              fontSize: s(12),
              color: colors.muted,
              textAlign: "center",
            }}
          >
            {elapsedSeconds}s / {totalSeconds}s · network: {quality}
          </Text>
        </View>

        {/* CTAs */}
        <View style={{ gap: s(8) }}>
          <TouchableOpacity
            onPress={manualCheckNow}
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              gap: s(8),
              paddingVertical: s(12),
              borderRadius: s(10),
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Loader2 size={s(16)} color={colors.heading} />
            <Text style={{ color: colors.heading, fontWeight: "600", fontSize: s(14) }}>
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
              gap: s(8),
              paddingVertical: s(12),
              borderRadius: s(10),
              backgroundColor: canRetryNow ? colors.danger : colors.muted + "40",
              opacity: canRetryNow ? 1 : 0.5,
            }}
          >
            <RefreshCw size={s(16)} color={canRetryNow ? "#fff" : colors.muted} />
            <Text
              style={{
                color: canRetryNow ? "#fff" : colors.muted,
                fontWeight: "700",
                fontSize: s(14),
              }}
            >
              Try Again with new charge
            </Text>
          </TouchableOpacity>
          {!canRetryNow && (
            <Text
              style={{
                fontSize: s(11),
                color: colors.muted,
                textAlign: "center",
                marginTop: s(4),
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
        scale={uiScale}
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
  scale: number;
  onConfirm: () => void;
  onCancel: () => void;
}

function RetryConfirmModal({ visible, scale, onConfirm, onCancel }: RetryConfirmModalProps) {
  const s = (n: number) => Math.round(n * scale)
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent>
      <View
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.75)",
          alignItems: "center",
          justifyContent: "center",
          padding: s(24),
        }}
      >
        <View
          style={{
            backgroundColor: colors.panel,
            borderRadius: s(16),
            padding: s(22),
            width: "100%",
            maxWidth: 360,
            borderWidth: 1,
            borderColor: colors.danger + "60",
          }}
        >
          <View style={{ alignItems: "center", marginBottom: s(12) }}>
            <View
              style={{
                width: s(52),
                height: s(52),
                borderRadius: s(26),
                backgroundColor: colors.danger + "20",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <AlertTriangle size={s(26)} color={colors.danger} />
            </View>
          </View>
          <Text
            style={{
              fontSize: s(16),
              fontWeight: "700",
              color: colors.danger,
              textAlign: "center",
              marginBottom: s(8),
            }}
          >
            Charge Customer Again?
          </Text>
          <Text
            style={{
              fontSize: s(13),
              color: colors.label,
              textAlign: "center",
              marginBottom: s(16),
              lineHeight: s(19),
            }}
          >
            This will charge the customer again. Are you sure no payment
            posted? If you're unsure, choose Cancel and check with the
            customer or your manager.
          </Text>
          <View style={{ flexDirection: "row", gap: s(10) }}>
            <TouchableOpacity
              onPress={onCancel}
              style={{
                flex: 1,
                paddingVertical: s(12),
                borderRadius: s(10),
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: "center",
              }}
            >
              <Text style={{ color: colors.heading, fontWeight: "600", fontSize: s(14) }}>
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onConfirm}
              style={{
                flex: 1,
                paddingVertical: s(12),
                borderRadius: s(10),
                backgroundColor: colors.danger,
                alignItems: "center",
              }}
            >
              <Text style={{ color: "#fff", fontWeight: "700", fontSize: s(14) }}>
                Yes, Charge Again
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
}
