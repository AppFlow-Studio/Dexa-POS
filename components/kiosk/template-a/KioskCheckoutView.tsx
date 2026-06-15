import {
  useKioskCheckout,
  type KioskCheckoutTotals,
} from "@/components/kiosk/shared/useKioskCheckout";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { CheckCircle2, ChevronLeft, Heart } from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import { ActivityIndicator, Pressable, Text, View } from "react-native";

/**
 * Template A checkout flow: prepare order (real totals incl. tax) → optional tip
 * → processing → success. All payment/order logic lives in the shared
 * useKioskCheckout hook; this is presentation only. On success the cart is
 * cleared and `onDone` returns the kiosk to idle/attract.
 */
type Step = "tip" | "processing" | "success";

export function KioskCheckoutView({
  config,
  onBack,
  onDone,
}: {
  config: KioskConfig;
  onBack: () => void;
  onDone: () => void;
}) {
  const clearCart = useKioskCartStore((s) => s.clear);
  const { status, error, totals, prepareOrder, payOrder, reset, abandon } =
    useKioskCheckout();

  // Backing out of checkout voids the eagerly-created order so it doesn't
  // linger as an orphaned draft, then returns to the cart.
  const handleBack = () => {
    abandon();
    onBack();
  };

  const tipEnabled = config.tipScreenEnabled;
  const [step, setStep] = useState<Step>(tipEnabled ? "tip" : "processing");
  const [pickupNumber, setPickupNumber] = useState<string | undefined>();

  const muted = `${config.textColor}99`;

  // Create the order up-front so we have real tax/total to show. Guard against
  // double-invocation (re-renders / strict mode) so we don't create duplicate
  // orders.
  const preparedRef = useRef(false);
  useEffect(() => {
    if (preparedRef.current) return;
    preparedRef.current = true;
    void prepareOrder();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runPayment = async (tipAmount: number) => {
    setStep("processing");
    const res = await payOrder(tipAmount);
    if (res) {
      setPickupNumber(res.displayNumber);
      clearCart();
      setStep("success");
    }
  };

  // If tipping is disabled, pay as soon as the order is ready.
  useEffect(() => {
    if (!tipEnabled && status === "ready") {
      void runPayment(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipEnabled, status]);

  // ---- TIP STEP ----
  if (step === "tip") {
    return (
      <TipStep
        config={config}
        totals={totals}
        loading={status === "creating" || status === "idle" || !totals}
        onBack={handleBack}
        onConfirm={(tip) => runPayment(tip)}
      />
    );
  }

  // ---- SUCCESS ----
  if (step === "success") {
    return (
      <View
        className="flex-1 items-center justify-center px-10"
        style={{ backgroundColor: config.backgroundColor, gap: 20 }}
      >
        <CheckCircle2 size={96} color={config.primaryColor} />
        <Text
          style={{ fontSize: 30, fontWeight: "800", color: config.textColor }}
        >
          Thank you!
        </Text>
        <Text style={{ fontSize: 18, color: muted, textAlign: "center" }}>
          Your order has been sent to the kitchen.
        </Text>
        {pickupNumber ? (
          <View style={{ alignItems: "center", marginTop: 8 }}>
            <Text style={{ fontSize: 16, color: muted }}>Your number</Text>
            <Text
              style={{
                fontSize: 56,
                fontWeight: "900",
                color: config.primaryColor,
              }}
            >
              {config.pickupNumberPrefix}
              {pickupNumber}
            </Text>
          </View>
        ) : null}
        <Pressable
          onPress={onDone}
          style={{
            marginTop: 16,
            paddingHorizontal: 36,
            paddingVertical: 16,
            borderRadius: 16,
            backgroundColor: config.primaryColor,
          }}
        >
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "700" }}>
            Done
          </Text>
        </Pressable>
      </View>
    );
  }

  // ---- PROCESSING / ERROR ----
  return (
    <View
      className="flex-1 items-center justify-center px-10"
      style={{ backgroundColor: config.backgroundColor, gap: 20 }}
    >
      {status === "error" ? (
        <>
          <Text
            style={{ fontSize: 24, fontWeight: "800", color: config.textColor }}
          >
            Payment didn’t go through
          </Text>
          <Text style={{ fontSize: 16, color: muted, textAlign: "center" }}>
            {error ?? "Please try again."}
          </Text>
          <View style={{ flexDirection: "row", gap: 12, marginTop: 8 }}>
            <Pressable
              onPress={handleBack}
              style={{
                paddingHorizontal: 28,
                paddingVertical: 14,
                borderRadius: 16,
                borderWidth: 1.5,
                borderColor: `${config.textColor}30`,
              }}
            >
              <Text style={{ color: config.textColor, fontSize: 16, fontWeight: "700" }}>
                Back to cart
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={config.primaryColor} />
          <Text style={{ fontSize: 20, fontWeight: "700", color: config.textColor }}>
            {status === "charging"
              ? "Follow the prompts on the card reader…"
              : "Processing your order…"}
          </Text>
          <Text style={{ fontSize: 15, color: muted }}>
            Please don’t leave this screen.
          </Text>
        </>
      )}
    </View>
  );
}

function TipStep({
  config,
  totals,
  loading,
  onBack,
  onConfirm,
}: {
  config: KioskConfig;
  totals: KioskCheckoutTotals | null;
  loading: boolean;
  onBack: () => void;
  onConfirm: (tipAmount: number) => void;
}) {
  const [selected, setSelected] = useState<number | null>(null); // percent, -1 = no tip
  const muted = `${config.textColor}99`;
  const faint = `${config.textColor}12`;
  const presets = config.tipPresets.length > 0 ? config.tipPresets : [15, 18, 20];

  const subtotal = totals?.subtotal ?? 0;
  const tax = totals?.tax ?? 0;
  const baseTotal = totals?.total ?? 0;

  // Tip is a % of subtotal (pre-tax), the common convention.
  const tipAmount =
    selected != null && selected > 0 ? (subtotal * selected) / 100 : 0;
  const grandTotal = baseTotal + tipAmount;

  const noTip = selected === -1;
  const disabled = selected == null || loading || !totals;

  return (
    <View className="flex-1" style={{ backgroundColor: config.backgroundColor }}>
      {/* Back */}
      <Pressable
        onPress={onBack}
        hitSlop={8}
        style={{
          position: "absolute",
          top: 20,
          left: 20,
          zIndex: 10,
          width: 48,
          height: 48,
          borderRadius: 24,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: faint,
        }}
      >
        <ChevronLeft size={26} color={config.textColor} />
      </Pressable>

      <View className="flex-1 items-center justify-center px-8" style={{ gap: 28 }}>
        {/* Heading */}
        <View style={{ alignItems: "center", gap: 12 }}>
          <View
            style={{
              width: 72,
              height: 72,
              borderRadius: 36,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: `${config.primaryColor}14`,
            }}
          >
            <Heart size={34} color={config.primaryColor} fill={config.primaryColor} />
          </View>
          <Text style={{ fontSize: 30, fontWeight: "800", color: config.textColor }}>
            Add a tip?
          </Text>
          
        </View>

        {/* Tip preview */}
        <Text
          style={{
            fontSize: 44,
            fontWeight: "900",
            color: tipAmount > 0 ? config.primaryColor : `${config.textColor}40`,
          }}
        >
          {tipAmount > 0 ? `$${tipAmount.toFixed(2)}` : "$0.00"}
        </Text>

        {/* Preset row — equal width */}
        <View style={{ flexDirection: "row", gap: 12, width: "100%", maxWidth: 560 }}>
          {presets.map((pct) => {
            const active = selected === pct;
            return (
              <Pressable
                key={pct}
                onPress={() => setSelected(pct)}
                style={{
                  flex: 1,
                  paddingVertical: 22,
                  borderRadius: 20,
                  alignItems: "center",
                  gap: 4,
                  borderWidth: 2,
                  borderColor: active ? config.primaryColor : faint,
                  backgroundColor: active ? config.primaryColor : "transparent",
                }}
              >
                <Text style={{ fontSize: 28, fontWeight: "800", color: active ? "#FFFFFF" : config.textColor }}>
                  {pct}%
                </Text>
                <Text style={{ fontSize: 14, fontWeight: "600", color: active ? "rgba(255,255,255,0.85)" : muted }}>
                  ${((subtotal * pct) / 100).toFixed(2)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* No tip pill */}
        <Pressable
          onPress={() => setSelected(-1)}
          style={{
            paddingHorizontal: 28,
            paddingVertical: 12,
            borderRadius: 999,
            borderWidth: 2,
            borderColor: noTip ? config.primaryColor : faint,
            backgroundColor: noTip ? `${config.primaryColor}10` : "transparent",
          }}
        >
          <Text
            style={{
              fontSize: 16,
              fontWeight: "700",
              color: noTip ? config.primaryColor : muted,
            }}
          >
            No tip
          </Text>
        </Pressable>
      </View>

      {/* Footer — summary card + pay */}
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 18,
          paddingBottom: 24,
          gap: 14,
        }}
      >
        <View
          style={{
            padding: 16,
            borderRadius: 18,
            backgroundColor: faint,
            gap: 10,
          }}
        >
          <SummaryRow label="Subtotal" value={subtotal} muted={muted} color={config.textColor} />
          <SummaryRow
            label={
              subtotal > 0
                ? `Tax (${((tax / subtotal) * 100).toFixed(3).replace(/\.?0+$/, "")}%)`
                : "Tax"
            }
            value={tax}
            muted={muted}
            color={config.textColor}
          />
          <SummaryRow label="Tip" value={tipAmount} muted={muted} color={config.textColor} />
          <View style={{ height: 1, backgroundColor: `${config.textColor}15` }} />
          <SummaryRow label="Total" value={grandTotal} muted={muted} color={config.textColor} emphasize />
        </View>

        <Pressable
          disabled={disabled}
          onPress={() => onConfirm(tipAmount)}
          style={{
            flexDirection: "row",
            gap: 10,
            height: 64,
            borderRadius: 20,
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: disabled ? `${config.primaryColor}40` : config.primaryColor,
          }}
        >
          {(loading || !totals) && <ActivityIndicator size="small" color="#FFFFFF" />}
          <Text style={{ color: "#FFFFFF", fontSize: 19, fontWeight: "800" }}>
            {loading || !totals ? "Preparing your order…" : `Pay $${grandTotal.toFixed(2)}`}
          </Text>
        </Pressable>
      </View>
    </View>
  );
}

function SummaryRow({
  label,
  value,
  muted,
  color,
  emphasize,
}: {
  label: string;
  value: number;
  muted: string;
  color: string;
  emphasize?: boolean;
}) {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
      <Text style={{ fontSize: emphasize ? 18 : 15, color: emphasize ? color : muted, fontWeight: emphasize ? "800" : "400" }}>
        {label}
      </Text>
      <Text style={{ fontSize: emphasize ? 22 : 15, fontWeight: emphasize ? "800" : "600", color }}>
        ${value.toFixed(2)}
      </Text>
    </View>
  );
}
