import PinDisplay from "@/components/auth/PinDisplay";
import PinNumpad from "@/components/auth/PinNumpad";
import { usePinEntry } from "@/hooks/usePinEntry";
import { useVerifyStaffPin } from "@/hooks/useVerifyStaffPin";
import { UserRound } from "@/lib/icons";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { getIsOnline } from "@/services/offlineSyncService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import {
  OrderPinGateRequest,
  useOrderPinGateStore,
} from "@/stores/useOrderPinGateStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  BackHandler,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";

const MAX_PIN_LENGTH = 4;

/**
 * Attribution-only PIN gate shown over the order screen before each new order
 * when `requirePinPerOrder` is on. Verifies the PIN (no session/clock side
 * effects) and records the verified staff as the next order's creator via
 * `setOrderAttributionStaff`. Non-dismissable — the only ways out are a valid
 * PIN or, when `onCancel` is given, Cancel.
 *
 * This only declares the prompt; `<OrderPinGateHost />` at the app root draws
 * it, so opening and closing never mount a dialog.
 */
export default function OrderPinGate({
  open,
  attributionOrderId,
  onVerified,
  onCancel,
}: {
  open: boolean;
  /**
   * The target this verification is bound to: the active order id (QSR) or
   * PENDING_SEAT_ATTRIBUTION (dine-in seating). Stored alongside the staff id so
   * a verification can only satisfy the gate for the exact target it was for.
   */
  attributionOrderId: string | null;
  /** Called with the verified staff_profile_id after a successful PIN. */
  onVerified?: (staffProfileId: string) => void;
  /**
   * Called when the operator cancels the PIN entry to abort the process. When
   * provided, a Cancel button is shown. The caller is responsible for backing
   * out (e.g. closing the gate, discarding the pending order/seat).
   */
  onCancel?: () => void;
}) {
  // Latest callbacks, read when the prompt is answered — so a re-render of the
  // owner (new inline closures) doesn't re-register the prompt.
  const handlers = useRef({ onVerified, onCancel });
  useLayoutEffect(() => {
    handlers.current = { onVerified, onCancel };
  });
  const cancellable = !!onCancel;

  // A layout effect, so the prompt is up in the same commit that opened it.
  useLayoutEffect(() => {
    if (!open) return;
    const owner = {};
    useOrderPinGateStore.getState().show({
      owner,
      attributionOrderId,
      onVerified: (staffProfileId) =>
        handlers.current.onVerified?.(staffProfileId),
      onCancel: cancellable ? () => handlers.current.onCancel?.() : undefined,
    });
    return () => useOrderPinGateStore.getState().hide(owner);
  }, [open, attributionOrderId, cancellable]);

  return null;
}

/**
 * Draws the per-order PIN prompt. Mounted once at the app root and never
 * unmounted: when no prompt is up it is `display: none`, so opening is a style
 * flip on an already-built card. In-tree (not an RN Modal), so no native
 * window re-reveals the immersive Android bars.
 */
export function OrderPinGateHost() {
  const request = useOrderPinGateStore((st) => st.request);
  const answered = useOrderPinGateStore((st) => st.answered);
  const visible = request !== null && request !== answered;

  // Hardware back must not reach the screen behind the gate.
  useEffect(() => {
    if (!visible) return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => true);
    return () => sub.remove();
  }, [visible]);

  return (
    <View
      pointerEvents={visible ? "auto" : "none"}
      accessibilityViewIsModal={visible}
      style={[styles.overlay, !visible && styles.hidden]}
    >
      <OrderPinCard request={visible ? request : null} />
    </View>
  );
}

/**
 * Hide the prompt now and let its owner react on the next frame. The owner's
 * reaction (attribution → the order screen re-renders and starts the backend
 * order; cancel → back to the empty state) is a heavy render, and the prompt
 * shouldn't stay on screen behind it. If the owner still wants a PIN after
 * reacting, its request is still in the store and shows again.
 */
function answer(request: OrderPinGateRequest, respond: () => void) {
  const store = useOrderPinGateStore.getState();
  store.setAnswered(request);
  requestAnimationFrame(() => {
    respond();
    setTimeout(() => {
      if (useOrderPinGateStore.getState().answered === request) {
        useOrderPinGateStore.getState().setAnswered(null);
      }
    }, 0);
  });
}

function OrderPinCard({ request }: { request: OrderPinGateRequest | null }) {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const [verifying, setVerifying] = useState(false);
  // The 4th digit submits (there is no confirm button); keys are ignored while
  // a PIN is being verified.
  const { pin, setPin, onKeyPress } = usePinEntry({
    length: MAX_PIN_LENGTH,
    disabled: verifying,
    onComplete: (entered) => void submit(entered),
  });
  const [error, setError] = useState<string | null>(null);
  const shakeX = useSharedValue(0);
  const { verifyPin } = useVerifyStaffPin();

  // The card stays mounted between prompts; each prompt starts empty.
  useEffect(() => {
    if (request) return;
    setPin("");
    setError(null);
  }, [request, setPin]);

  const shake = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(-10, { duration: 100 }),
      withTiming(10, { duration: 100 }),
      withTiming(0, { duration: 100 }),
    );
  };

  const submit = async (entered: string) => {
    const selectedStore = useStoreSettingsStore.getState().selectedStore;
    if (!request || !selectedStore || verifying) return;
    setVerifying(true);
    setError(null);
    try {
      const verified = await verifyPin({
        pin: entered,
        locationId: selectedStore.id,
        isOnline: getIsOnline(),
      });
      if (!verified) {
        shake();
        setError("Incorrect PIN. Please try again.");
        setPin("");
        return;
      }
      answer(request, () => {
        useEmployeeStore
          .getState()
          .setOrderAttributionStaff(
            verified.staffProfileId,
            request.attributionOrderId,
          );
        request.onVerified(verified.staffProfileId);
      });
    } finally {
      setVerifying(false);
    }
  };

  const cancel = () => {
    if (!request?.onCancel || verifying) return;
    const onCancel = request.onCancel;
    answer(request, onCancel);
  };

  const shakeStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shakeX.value }],
  }));

  return (
    <View
      style={{
        backgroundColor: colors.panel,
        borderRadius: s(14),
        borderWidth: 1,
        borderColor: colors.border,
        overflow: "hidden",
      }}
    >
      {/* Header */}
      <View
        style={{
          backgroundColor: colors.screen,
          paddingVertical: s(14),
          paddingHorizontal: s(20),
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: s(8),
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
        }}
      >
        <View
          style={{
            width: s(28),
            height: s(28),
            borderRadius: 999,
            backgroundColor: colors.teal + "20",
            borderWidth: 1,
            borderColor: colors.teal + "40",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <UserRound size={s(14)} color={colors.teal} />
        </View>
        <Text
          accessibilityRole="header"
          style={{ fontSize: s(14), fontWeight: "700", color: colors.heading }}
        >
          Start New Order
        </Text>
      </View>

      {/* Body */}
      <Animated.View style={[shakeStyle, { padding: s(20) }]}>
        <Text
          style={{
            fontSize: s(12),
            color: colors.muted,
            textAlign: "center",
            marginBottom: s(14),
          }}
        >
          Enter your PIN to start this order
        </Text>

        <PinDisplay pinLength={pin.length} maxLength={MAX_PIN_LENGTH} />

        <View style={{ marginTop: s(10) }}>
          <PinNumpad onKeyPress={onKeyPress} />
        </View>

        {/* Error / status */}
        <View
          style={{
            height: s(20),
            marginTop: s(8),
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {error ? (
            <Text
              style={{
                fontSize: s(11),
                color: colors.danger,
                textAlign: "center",
              }}
            >
              {error}
            </Text>
          ) : verifying ? (
            <Text
              style={{
                fontSize: s(11),
                color: colors.muted,
                textAlign: "center",
              }}
            >
              Verifying…
            </Text>
          ) : null}
        </View>

        {/* Actions */}
        {request?.onCancel ? (
          <View
            style={{
              borderTopWidth: 1,
              borderTopColor: colors.border,
              paddingTop: s(14),
            }}
          >
            <TouchableOpacity
              onPress={cancel}
              disabled={verifying}
              style={{
                alignItems: "center",
                justifyContent: "center",
                paddingVertical: s(10),
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: s(8),
                backgroundColor: colors.screen,
                opacity: verifying ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  fontSize: s(12),
                  fontWeight: "600",
                  color: colors.label,
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
    // Same scrim as the shared Dialog overlay (bg-black/80).
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    // Above anything the root PortalHost draws (sheets carry a high elevation).
    zIndex: 1000,
    elevation: 1000,
  },
  hidden: { display: "none" },
});
