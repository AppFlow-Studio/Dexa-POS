import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import {
  useKioskCheckout,
  type KioskCheckoutTotals,
} from "@/components/kiosk/shared/useKioskCheckout";
import { useKioskUiScale } from "@/lib/uiScale";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import { CheckCircle2, ChevronLeft, Heart } from "lucide-react-native";
import { useEffect, useState } from "react";
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
  onPaid,
  onDone,
}: {
  config: KioskConfig;
  onBack: () => void;
  /** Fired the instant payment succeeds, before the success screen shows. Lets
   * the parent stop treating this as an active (voidable) cart. */
  onPaid: () => void;
  onDone: () => void;
}) {
  const scale = useKioskUiScale();
  const clearCart = useKioskCartStore((state) => state.clear);
  const { status, error, totals, computeTotals, payOrder } = useKioskCheckout();

  // No backend order exists until the customer pays, so backing out is a plain
  // navigation — nothing to void or clean up.
  const handleBack = () => {
    onBack();
  };

  const tipEnabled = config.tipScreenEnabled;
  const [step, setStep] = useState<Step>(tipEnabled ? "tip" : "processing");
  const [pickupNumber, setPickupNumber] = useState<string | undefined>();

  const muted = `${config.textColor}99`;

  // Compute totals LOCALLY from the current cart — instant, no backend order.
  // Recomputed on every mount, so re-entering after a cart edit always shows
  // the correct amount.
  useEffect(() => {
    computeTotals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const runPayment = async (tipAmount: number) => {
    setStep("processing");
    const res = await payOrder(tipAmount);
    if (res) {
      onPaid(); // settled — parent stops treating this as a voidable cart
      setPickupNumber(res.displayNumber);
      clearCart();
      setStep("success");
    } else {
      // payOrder failed — surface the error on the processing screen.
      setStep("processing");
    }
  };

  // If tipping is disabled, pay as soon as totals are ready.
  useEffect(() => {
    if (!tipEnabled && status === "ready") {
      void runPayment(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipEnabled, status]);

  // ---- COMPUTING (brief) / ERROR before tip ----
  // Totals compute synchronously and locally, so this is essentially instant;
  // it only shows if the cart was empty or computation errored.
  if (step === "tip" && status === "error") {
    return (
      <PreparingScreen config={config} error={error} onBack={handleBack} />
    );
  }

  // ---- TIP STEP ----
  // Totals are computed locally and synchronously, so the tip screen shows
  // immediately on entry — no loading step between cart and checkout.
  if (step === "tip") {
    return (
      <TipStep
        config={config}
        totals={totals}
        loading={false}
        onBack={handleBack}
        onConfirm={(tip) => runPayment(tip)}
      />
    );
  }

  // ---- SUCCESS ----
  if (step === "success") {
    return (
      <SuccessScreen
        config={config}
        pickupNumber={pickupNumber}
        onDone={onDone}
      />
    );
  }

  // ---- PROCESSING / ERROR ----
  return (
    <View
      className="flex-1 items-center justify-center px-10"
      style={{
        backgroundColor: config.backgroundColor,
        gap: kioskPx(20, scale),
      }}
    >
      {status === "error" ? (
        <>
          <Text
            style={{
              fontSize: kioskPx(24, scale),
              fontWeight: "800",
              color: config.textColor,
            }}
          >
            Payment didn’t go through
          </Text>
          <Text
            style={{
              fontSize: kioskPx(16, scale),
              color: muted,
              textAlign: "center",
            }}
          >
            {error ?? "Please try again."}
          </Text>
          <View
            style={{
              flexDirection: "row",
              gap: kioskPx(12, scale),
              marginTop: kioskPx(8, scale),
            }}
          >
            <Pressable
              onPress={handleBack}
              style={{
                paddingHorizontal: kioskPx(28, scale),
                paddingVertical: kioskPx(14, scale),
                borderRadius: kioskPx(16, scale),
                borderWidth: 1.5,
                borderColor: `${config.textColor}30`,
              }}
            >
              <Text
                style={{
                  color: config.textColor,
                  fontSize: kioskPx(16, scale),
                  fontWeight: "700",
                }}
              >
                Back to cart
              </Text>
            </Pressable>
          </View>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={config.primaryColor} />
          <Text
            style={{
              fontSize: kioskPx(20, scale),
              fontWeight: "700",
              color: config.textColor,
            }}
          >
            {status === "charging"
              ? "Follow the prompts on the card reader…"
              : "Processing your order…"}
          </Text>
          <Text style={{ fontSize: kioskPx(15, scale), color: muted }}>
            Please don’t leave this screen.
          </Text>
        </>
      )}
    </View>
  );
}

/**
 * Post-payment confirmation. The order is already PAID — there is nothing to
 * void here. Auto-returns to idle after 10s if the customer walks away without
 * pressing Done (the parent's idle timer is suppressed once payment succeeds,
 * so this is the only thing that resets the kiosk).
 */
function SuccessScreen({
  config,
  pickupNumber,
  onDone,
}: {
  config: KioskConfig;
  pickupNumber?: string;
  onDone: () => void;
}) {
  const s = useKioskUiScale();
  const muted = `${config.textColor}99`;

  useEffect(() => {
    const t = setTimeout(onDone, 10_000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <View
      className="flex-1 items-center justify-center px-10"
      style={{ backgroundColor: config.backgroundColor, gap: kioskPx(20, s) }}
    >
      <CheckCircle2 size={kioskPx(96, s)} color={config.primaryColor} />
      <Text
        style={{
          fontSize: kioskPx(30, s),
          fontWeight: "800",
          color: config.textColor,
        }}
      >
        Thank you!
      </Text>
      <Text
        style={{ fontSize: kioskPx(18, s), color: muted, textAlign: "center" }}
      >
        Your order has been sent to the kitchen.
      </Text>
      {pickupNumber ? (
        <View style={{ alignItems: "center", marginTop: kioskPx(8, s) }}>
          <Text style={{ fontSize: kioskPx(16, s), color: muted }}>
            Your number
          </Text>
          <Text
            style={{
              fontSize: kioskPx(56, s),
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
          marginTop: kioskPx(16, s),
          paddingHorizontal: kioskPx(36, s),
          paddingVertical: kioskPx(16, s),
          borderRadius: kioskPx(16, s),
          backgroundColor: config.primaryColor,
        }}
      >
        <Text
          style={{
            color: "#FFFFFF",
            fontSize: kioskPx(18, s),
            fontWeight: "700",
          }}
        >
          Done
        </Text>
      </Pressable>
    </View>
  );
}

/**
 * Full-screen loader shown while the order is being created/synced, so the
 * customer never lands on a half-disabled tip screen. Doubles as the prep-error
 * surface (with a Back-to-cart action) when order creation fails.
 */
function PreparingScreen({
  config,
  error,
  onBack,
}: {
  config: KioskConfig;
  error?: string | null;
  onBack: () => void;
}) {
  const s = useKioskUiScale();
  const muted = `${config.textColor}99`;
  const isError = !!error;

  return (
    <View
      className="flex-1 items-center justify-center px-10"
      style={{ backgroundColor: config.backgroundColor, gap: kioskPx(20, s) }}
    >
      {/* Back — hidden while loading so the customer can't bail mid-creation
          and orphan an in-flight order. Shown only in the error state, where
          Back is the intended escape (alongside the Back-to-cart button). */}
      {isError && (
        <Pressable
          onPress={onBack}
          hitSlop={8}
          style={{
            position: "absolute",
            top: kioskPx(20, s),
            left: kioskPx(20, s),
            width: kioskPx(48, s),
            height: kioskPx(48, s),
            borderRadius: kioskPx(24, s),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: `${config.textColor}12`,
          }}
        >
          <ChevronLeft size={kioskPx(26, s)} color={config.textColor} />
        </Pressable>
      )}

      {isError ? (
        <>
          <Text
            style={{
              fontSize: kioskPx(24, s),
              fontWeight: "800",
              color: config.textColor,
            }}
          >
            We couldn’t start your order
          </Text>
          <Text
            style={{
              fontSize: kioskPx(16, s),
              color: muted,
              textAlign: "center",
            }}
          >
            {error}
          </Text>
          <Pressable
            onPress={onBack}
            style={{
              marginTop: kioskPx(8, s),
              paddingHorizontal: kioskPx(36, s),
              paddingVertical: kioskPx(16, s),
              borderRadius: kioskPx(16, s),
              backgroundColor: config.primaryColor,
            }}
          >
            <Text
              style={{
                color: "#FFFFFF",
                fontSize: kioskPx(18, s),
                fontWeight: "700",
              }}
            >
              Back to cart
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={config.primaryColor} />
          <Text
            style={{
              fontSize: kioskPx(20, s),
              fontWeight: "700",
              color: config.textColor,
            }}
          >
            Getting your order ready…
          </Text>
          <Text style={{ fontSize: kioskPx(15, s), color: muted }}>
            Just a moment.
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
  const s = useKioskUiScale();
  const [selected, setSelected] = useState<number | null>(null); // percent, -1 = no tip
  const muted = `${config.textColor}99`;
  const faint = `${config.textColor}12`;
  const presets =
    config.tipPresets.length > 0 ? config.tipPresets : [15, 18, 20];

  const subtotal = totals?.subtotal ?? 0;
  const tax = totals?.tax ?? 0;
  const baseTotal = totals?.total ?? 0;

  // Tip is a % of the post-tax total, matching the POS card flow
  // (CardPaymentView computes presets off totalToPay, not subtotal).
  const tipAmount =
    selected != null && selected > 0 ? (baseTotal * selected) / 100 : 0;
  const grandTotal = baseTotal + tipAmount;

  const noTip = selected === -1;
  const disabled = selected == null || loading || !totals;

  return (
    <View
      className="flex-1"
      style={{ backgroundColor: config.backgroundColor }}
    >
      {/* Back */}
      <Pressable
        onPress={onBack}
        hitSlop={8}
        style={{
          position: "absolute",
          top: kioskPx(20, s),
          left: kioskPx(20, s),
          zIndex: 10,
          width: kioskPx(48, s),
          height: kioskPx(48, s),
          borderRadius: kioskPx(24, s),
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: faint,
        }}
      >
        <ChevronLeft size={kioskPx(26, s)} color={config.textColor} />
      </Pressable>

      <View
        className="flex-1 items-center justify-center px-8"
        style={{ gap: kioskPx(28, s) }}
      >
        {/* Heading */}
        <View style={{ alignItems: "center", gap: kioskPx(12, s) }}>
          <View
            style={{
              width: kioskPx(72, s),
              height: kioskPx(72, s),
              borderRadius: kioskPx(36, s),
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: `${config.primaryColor}14`,
            }}
          >
            <Heart
              size={kioskPx(34, s)}
              color={config.primaryColor}
              fill={config.primaryColor}
            />
          </View>
          <Text
            style={{
              fontSize: kioskPx(30, s),
              fontWeight: "800",
              color: config.textColor,
            }}
          >
            Add a tip?
          </Text>
        </View>

        {/* Tip preview */}
        <Text
          style={{
            fontSize: kioskPx(44, s),
            fontWeight: "900",
            color:
              tipAmount > 0 ? config.primaryColor : `${config.textColor}40`,
          }}
        >
          {tipAmount > 0 ? `$${tipAmount.toFixed(2)}` : "$0.00"}
        </Text>

        {/* Preset row — equal width */}
        <View
          style={{
            flexDirection: "row",
            gap: kioskPx(12, s),
            width: "100%",
            maxWidth: kioskPx(560, s),
          }}
        >
          {presets.map((pct) => {
            const active = selected === pct;
            return (
              <Pressable
                key={pct}
                onPress={() => setSelected(pct)}
                style={{
                  flex: 1,
                  paddingVertical: kioskPx(22, s),
                  borderRadius: kioskPx(20, s),
                  alignItems: "center",
                  gap: kioskPx(4, s),
                  borderWidth: 2,
                  borderColor: active ? config.primaryColor : faint,
                  backgroundColor: active ? config.primaryColor : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: kioskPx(28, s),
                    fontWeight: "800",
                    color: active ? "#FFFFFF" : config.textColor,
                  }}
                >
                  {pct}%
                </Text>
                <Text
                  style={{
                    fontSize: kioskPx(14, s),
                    fontWeight: "600",
                    color: active ? "rgba(255,255,255,0.85)" : muted,
                  }}
                >
                  ${((baseTotal * pct) / 100).toFixed(2)}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* No tip pill */}
        <Pressable
          onPress={() => setSelected(-1)}
          style={{
            paddingHorizontal: kioskPx(28, s),
            paddingVertical: kioskPx(12, s),
            borderRadius: 999,
            borderWidth: 2,
            borderColor: noTip ? config.primaryColor : faint,
            backgroundColor: noTip ? `${config.primaryColor}10` : "transparent",
          }}
        >
          <Text
            style={{
              fontSize: kioskPx(16, s),
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
          paddingHorizontal: kioskPx(24, s),
          paddingTop: kioskPx(18, s),
          paddingBottom: kioskPx(24, s),
          gap: kioskPx(14, s),
        }}
      >
        <View
          style={{
            padding: kioskPx(16, s),
            borderRadius: kioskPx(18, s),
            backgroundColor: faint,
            gap: kioskPx(10, s),
          }}
        >
          <SummaryRow
            label="Subtotal"
            value={subtotal}
            muted={muted}
            color={config.textColor}
          />
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
          <SummaryRow
            label="Tip"
            value={tipAmount}
            muted={muted}
            color={config.textColor}
          />
          <View
            style={{ height: 1, backgroundColor: `${config.textColor}15` }}
          />
          <SummaryRow
            label="Total"
            value={grandTotal}
            muted={muted}
            color={config.textColor}
            emphasize
          />
        </View>

        <Pressable
          disabled={disabled}
          onPress={() => onConfirm(tipAmount)}
          style={{
            flexDirection: "row",
            gap: kioskPx(10, s),
            height: kioskPx(64, s),
            borderRadius: kioskPx(20, s),
            alignItems: "center",
            justifyContent: "center",
            backgroundColor: disabled
              ? `${config.primaryColor}40`
              : config.primaryColor,
          }}
        >
          {(loading || !totals) && (
            <ActivityIndicator size="small" color="#FFFFFF" />
          )}
          <Text
            style={{
              color: "#FFFFFF",
              fontSize: kioskPx(19, s),
              fontWeight: "800",
            }}
          >
            {loading || !totals
              ? "Preparing your order…"
              : `Pay $${grandTotal.toFixed(2)}`}
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
  const s = useKioskUiScale();
  return (
    <View
      style={{
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
      }}
    >
      <Text
        style={{
          fontSize: kioskPx(emphasize ? 18 : 15, s),
          color: emphasize ? color : muted,
          fontWeight: emphasize ? "800" : "400",
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: kioskPx(emphasize ? 22 : 15, s),
          fontWeight: emphasize ? "800" : "600",
          color,
        }}
      >
        ${value.toFixed(2)}
      </Text>
    </View>
  );
}
