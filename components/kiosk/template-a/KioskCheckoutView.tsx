import {
  useKioskCheckout,
  type KioskCheckoutTotals,
} from "@/components/kiosk/shared/useKioskCheckout";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { CheckCircle2, ChevronLeft } from "lucide-react-native";
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

  return (
    <View className="flex-1" style={{ backgroundColor: config.backgroundColor }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 12,
          paddingHorizontal: 24,
          paddingVertical: 18,
        }}
      >
        <Pressable onPress={onBack} hitSlop={8}>
          <ChevronLeft size={28} color={config.textColor} />
        </Pressable>
        <Text style={{ fontSize: 26, fontWeight: "800", color: config.textColor }}>
          Add a tip?
        </Text>
      </View>

      <View className="flex-1 items-center justify-center px-10" style={{ gap: 20 }}>
        <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 14 }}>
          {presets.map((pct) => {
            const active = selected === pct;
            return (
              <Pressable
                key={pct}
                onPress={() => setSelected(pct)}
                style={{
                  width: 130,
                  height: 110,
                  borderRadius: 18,
                  alignItems: "center",
                  justifyContent: "center",
                  gap: 4,
                  borderWidth: 2,
                  borderColor: active ? config.primaryColor : `${config.textColor}20`,
                  backgroundColor: active ? config.primaryColor : "transparent",
                }}
              >
                <Text style={{ fontSize: 26, fontWeight: "800", color: active ? "#FFFFFF" : config.textColor }}>
                  {pct}%
                </Text>
                <Text style={{ fontSize: 14, color: active ? "#FFFFFF" : muted }}>
                  ${((subtotal * pct) / 100).toFixed(2)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={() => setSelected(-1)} style={{ padding: 10 }}>
          <Text
            style={{
              fontSize: 16,
              fontWeight: "600",
              color: selected === -1 ? config.primaryColor : muted,
            }}
          >
            No tip
          </Text>
        </Pressable>
      </View>

      {/* Footer — order summary + pay */}
      <View
        style={{
          paddingHorizontal: 24,
          paddingTop: 16,
          paddingBottom: 22,
          borderTopWidth: 1,
          borderTopColor: faint,
          gap: 12,
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
        {tipAmount > 0 && (
          <SummaryRow label="Tip" value={tipAmount} muted={muted} color={config.textColor} />
        )}
        <View style={{ height: 1, backgroundColor: faint }} />
        <SummaryRow label="Total" value={grandTotal} muted={muted} color={config.textColor} emphasize />

        <Pressable
          disabled={selected == null || loading || !totals}
          onPress={() => onConfirm(tipAmount)}
          style={{
            flexDirection: "row",
            gap: 10,
            height: 60,
            borderRadius: 18,
            alignItems: "center",
            justifyContent: "center",
            marginTop: 4,
            backgroundColor:
              selected == null || loading || !totals
                ? `${config.primaryColor}40`
                : config.primaryColor,
          }}
        >
          {(loading || !totals) && (
            <ActivityIndicator size="small" color="#FFFFFF" />
          )}
          <Text style={{ color: "#FFFFFF", fontSize: 18, fontWeight: "800" }}>
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
