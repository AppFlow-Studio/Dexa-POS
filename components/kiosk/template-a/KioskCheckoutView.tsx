import { KioskCustomerInfoStep } from "@/components/kiosk/shared/KioskCustomerInfoStep";
import {
  kioskFont,
  kioskRadius,
  useKioskTheme,
  type KioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { isKioskHandheld } from "@/components/kiosk/shared/kioskLayout";
import { KioskPressable } from "@/components/kiosk/shared/KioskPressable";
import {
  kioskFontPx,
  kioskPx,
} from "@/components/kiosk/shared/KioskScaleProvider";
import {
  useKioskCheckout,
  type KioskCheckoutTotals,
} from "@/components/kiosk/shared/useKioskCheckout";
import { useActiveProcessor } from "@/hooks/useActiveProcessor";
import { useKioskUiScale } from "@/lib/uiScale";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import type { KioskConfig } from "@/types/kiosk";
import {
  CheckCircle2,
  ChevronLeft,
  CreditCard,
  Heart,
} from "@/lib/icons";
import { useEffect, useState, type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  useWindowDimensions,
  View,
} from "react-native";

/**
 * Template A checkout flow: prepare order (real totals incl. tax) → optional tip
 * → processing → success. All payment/order logic lives in the shared
 * useKioskCheckout hook; this is presentation only. On success the cart is
 * cleared and `onDone` returns the kiosk to idle/attract.
 */
type Step = "customer" | "tip" | "processing" | "success";

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
  const t = useKioskTheme(config);
  const clearCart = useKioskCartStore((state) => state.clear);
  const { status, error, totals, assistanceRef, computeTotals, payOrder, cancelCharge } =
    useKioskCheckout();

  // The active processor decides whether the card read can be cancelled from the
  // kiosk: Castles/Valor/Dejavoo support a cancel-before-card, ATOM does not (no
  // endpoint in v1), so we hide the Back button for it rather than promise a
  // cancel we can't honour.
  const { activeType } = useActiveProcessor();
  const canCancelCharge = activeType !== "atom";

  // No backend order exists until the customer pays, so backing out is a plain
  // navigation — nothing to void or clean up.
  const handleBack = () => {
    onBack();
  };

  // Back pressed during the card read — abort the sale on the terminal. payOrder
  // resolves the real outcome (cancelled / verify-with-staff / raced-to-paid).
  const handleCancelCharge = () => {
    void cancelCharge();
  };

  const tipEnabled = config.tipScreenEnabled;
  // Customer capture (phone + name, REQUIRED) is the first checkout step — it
  // sits before tip/pay so every template gets it via this shared view.
  const [step, setStep] = useState<Step>("customer");
  const [pickupNumber, setPickupNumber] = useState<string | undefined>();

  const muted = t.textMuted;

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

  // If tipping is disabled, pay as soon as totals are ready — but ONLY after the
  // customer step is done (step advances to "processing"), never on mount.
  useEffect(() => {
    if (step === "processing" && !tipEnabled && status === "ready") {
      void runPayment(0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, tipEnabled, status]);

  // ---- CUSTOMER (phone + name, required) ----
  if (step === "customer") {
    return (
      <KioskCustomerInfoStep
        config={config}
        onBack={onBack}
        onComplete={() => setStep(tipEnabled ? "tip" : "processing")}
      />
    );
  }

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

  // ---- CANCELLING (Back pressed during the card read) ----
  if (status === "cancelling") {
    return <CancellingScreen config={config} />;
  }

  // ---- CANCELLED (confirmed — no charge; order voided) ----
  if (status === "cancelled") {
    return <CancelledScreen config={config} onDone={handleBack} />;
  }

  // ---- PROCESSING / ERROR ----
  return (
    <StatusLayout theme={t} scale={scale}>
      {status === "assistance" ? (
        <>
          <Text style={{ fontSize: kioskPx(24, scale), ...kioskFont(t, "bold"), color: t.text }}>
            Please see a staff member
          </Text>
          <Text style={{ fontSize: kioskPx(16, scale), color: muted, textAlign: "center" }}>
            {error}
          </Text>
          {assistanceRef && (
            <Text
              style={{
                fontSize: kioskFontPx(13, scale),
                color: muted,
                textAlign: "center",
              }}
            >
              {assistanceRef.displayNumber
                ? `Order #${assistanceRef.displayNumber}`
                : assistanceRef.dbOrderId
                  ? `Order ${assistanceRef.dbOrderId.slice(0, 8)}`
                  : "Order not started"}
              {"  ·  "}
              {new Date(assistanceRef.at).toLocaleTimeString()}
            </Text>
          )}
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
                borderColor: `${t.text}30`,
              }}
            >
              <Text
                style={{
                  color: t.text,
                  fontSize: kioskPx(16, scale),
                  ...kioskFont(t, "bold"),
                }}
              >
                Back to order
              </Text>
            </Pressable>
          </View>
        </>
      ) : status === "error" ? (
        <>
          <Text
            style={{
              fontSize: kioskPx(24, scale),
              ...kioskFont(t, "bold"),
              color: t.text,
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
                borderColor: `${t.text}30`,
              }}
            >
              <Text
                style={{
                  color: t.text,
                  fontSize: kioskPx(16, scale),
                  ...kioskFont(t, "bold"),
                }}
              >
                Back to cart
              </Text>
            </Pressable>
          </View>
        </>
      ) : status === "charging" ? (
        <TapCardScreen
          config={config}
          scale={scale}
          onCancel={canCancelCharge ? handleCancelCharge : undefined}
        />
      ) : (
        <>
          <ActivityIndicator size="large" color={t.primary} />
          <Text
            style={{
              fontSize: kioskPx(20, scale),
              ...kioskFont(t, "bold"),
              color: t.text,
            }}
          >
            Processing your order…
          </Text>
          <Text style={{ fontSize: kioskPx(15, scale), color: muted }}>
            Please don&apos;t leave this screen.
          </Text>
        </>
      )}
    </StatusLayout>
  );
}

/**
 * Centred column for the one-message checkout screens (processing, error,
 * cancelled, success, …).
 *
 * Scrolls only when the column is taller than the panel. A landscape phone is
 * ~360dp tall, and a centred View there clips its button off the bottom with no
 * way to reach it; everywhere else the content fits and this is the same
 * centred column it always was. `overlay` is for absolutely-positioned chrome
 * (a Back button) that must stay put rather than scroll — it renders above the
 * scroller so it keeps its taps.
 */
function StatusLayout({
  theme: t,
  scale: s,
  overlay,
  children,
}: {
  theme: KioskTheme;
  scale: number;
  overlay?: ReactNode;
  children: ReactNode;
}) {
  return (
    <View style={{ flex: 1, backgroundColor: t.page }}>
      <ScrollView
        style={{ flex: 1 }}
        bounces={false}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: kioskPx(40, s),
          paddingVertical: kioskPx(24, s),
          gap: kioskPx(20, s),
        }}
      >
        {children}
      </ScrollView>
      {overlay}
    </View>
  );
}

/**
 * Prominent "Swipe / Tap your card" screen shown while waiting for the card
 * terminal. Uses the same CreditCard icon from lucide that the POS uses.
 */
function TapCardScreen({
  config,
  scale,
  onCancel,
}: {
  config: KioskConfig;
  scale: number;
  /** When provided, a circular Back button cancels the card read on the device. */
  onCancel?: () => void;
}) {
  const t = useKioskTheme(config);
  const muted = t.textMuted;

  return (
    // Full-bleed wrapper so the Back button anchors to the real screen edge.
    // `self-stretch` overrides the parent's `items-center`, which would
    // otherwise collapse this to content width and float the button mid-screen.
    <View
      className="flex-1 self-stretch"
      style={{ backgroundColor: t.page }}
    >
      <View
        className="flex-1 items-center justify-center px-10"
        style={{ gap: kioskPx(20, scale) }}
      >
        <CreditCard size={kioskPx(96, scale)} color={t.primary} />

        <Text
          style={{
            fontSize: kioskPx(26, scale),
            ...kioskFont(t, "bold"),
            color: t.text,
            textAlign: "center",
          }}
        >
          Swipe, Tap, or Insert your card
        </Text>

        <Text
          style={{
            fontSize: kioskPx(16, scale),
            color: muted,
            textAlign: "center",
            lineHeight: kioskPx(24, scale),
          }}
        >
          Follow the prompts on the card reader.
          {"\n"}Please don&apos;t leave this screen.
        </Text>

        <ActivityIndicator
          size="large"
          color={t.primary}
          style={{ marginTop: kioskPx(8, scale) }}
        />
      </View>

      {/* Back pill — bottom-left of the screen. Cancels the sale on the
          terminal (return2Idle / cancel-before-card) and returns to cart. */}
      {onCancel ? (
        <KioskPressable
          onPress={onCancel}
          pressedScale={0.9}
          accessibilityLabel="Cancel payment and go back"
          style={{
            position: "absolute",
            bottom: kioskPx(28, scale),
            left: kioskPx(28, scale),
            zIndex: 10,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: kioskPx(8, scale),
            height: kioskPx(56, scale),
            paddingHorizontal: kioskPx(22, scale),
            borderRadius: kioskPx(28, scale),
            backgroundColor: t.outline,
          }}
        >
          <ChevronLeft size={kioskPx(28, scale)} color={t.text} />
          <Text
            style={{
              fontSize: kioskPx(18, scale),
              ...kioskFont(t, "bold"),
              color: t.text,
            }}
          >
            Back
          </Text>
        </KioskPressable>
      ) : null}
    </View>
  );
}

/**
 * Shown while the Back-triggered cancel is being dispatched to the terminal.
 * The real outcome (cancelled / verify-with-staff / raced-to-paid) is resolved
 * by the checkout hook when the in-flight charge settles.
 */
function CancellingScreen({ config }: { config: KioskConfig }) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  const muted = t.textMuted;

  return (
    <StatusLayout theme={t} scale={s}>
      <ActivityIndicator size="large" color={t.primary} />
      <Text
        style={{
          fontSize: kioskPx(20, s),
          ...kioskFont(t, "bold"),
          color: t.text,
        }}
      >
        Cancelling…
      </Text>
      <Text
        style={{ fontSize: kioskPx(15, s), color: muted, textAlign: "center" }}
      >
        Cancelling the payment on the card reader.
      </Text>
    </StatusLayout>
  );
}

/**
 * Confirmed cancellation — no charge was made and the half-built order has been
 * voided. Auto-returns to the cart so the customer can retry, with an explicit
 * Back-to-cart action if they don't want to wait.
 */
function CancelledScreen({
  config,
  onDone,
}: {
  config: KioskConfig;
  onDone: () => void;
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  const muted = t.textMuted;

  useEffect(() => {
    const t = setTimeout(onDone, 1800);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <StatusLayout theme={t} scale={s}>
      <CheckCircle2 size={kioskPx(84, s)} color={t.primary} />
      <Text
        style={{
          fontSize: kioskPx(24, s),
          ...kioskFont(t, "bold"),
          color: t.text,
        }}
      >
        Payment cancelled
      </Text>
      <Text
        style={{ fontSize: kioskPx(16, s), color: muted, textAlign: "center" }}
      >
        No charge was made. Taking you back to your cart…
      </Text>
      <Pressable
        onPress={onDone}
        style={{
          marginTop: kioskPx(8, s),
          paddingHorizontal: kioskPx(36, s),
          paddingVertical: kioskPx(16, s),
          borderRadius: kioskPx(16, s),
          backgroundColor: t.primary,
        }}
      >
        <Text
          style={{ color: t.onPrimary, fontSize: kioskPx(18, s), ...kioskFont(t, "bold") }}
        >
          Back to cart
        </Text>
      </Pressable>
    </StatusLayout>
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
  const t = useKioskTheme(config);
  const muted = t.textMuted;

  useEffect(() => {
    const t = setTimeout(onDone, 10_000);
    return () => clearTimeout(t);
  }, [onDone]);

  return (
    <StatusLayout theme={t} scale={s}>
      <CheckCircle2 size={kioskPx(96, s)} color={t.primary} />
      <Text
        style={{
          fontSize: kioskPx(30, s),
          ...kioskFont(t, "bold"),
          color: t.text,
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
              ...kioskFont(t, "bold"),
              color: t.primary,
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
          backgroundColor: t.primary,
        }}
      >
        <Text
          style={{
            color: t.onPrimary,
            fontSize: kioskPx(18, s),
            ...kioskFont(t, "bold"),
          }}
        >
          Done
        </Text>
      </Pressable>
    </StatusLayout>
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
  const t = useKioskTheme(config);
  const muted = t.textMuted;
  const isError = !!error;

  // Back — hidden while loading so the customer can't bail mid-creation and
  // orphan an in-flight order. Shown only in the error state, where Back is the
  // intended escape (alongside the Back-to-cart button).
  const backButton = isError ? (
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
        backgroundColor: t.outline,
      }}
    >
      <ChevronLeft size={kioskPx(26, s)} color={t.text} />
    </Pressable>
  ) : null;

  return (
    <StatusLayout theme={t} scale={s} overlay={backButton}>
      {isError ? (
        <>
          <Text
            style={{
              fontSize: kioskPx(24, s),
              ...kioskFont(t, "bold"),
              color: t.text,
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
              backgroundColor: t.primary,
            }}
          >
            <Text
              style={{
                color: t.onPrimary,
                fontSize: kioskPx(18, s),
                ...kioskFont(t, "bold"),
              }}
            >
              Back to cart
            </Text>
          </Pressable>
        </>
      ) : (
        <>
          <ActivityIndicator size="large" color={t.primary} />
          <Text
            style={{
              fontSize: kioskPx(20, s),
              ...kioskFont(t, "bold"),
              color: t.text,
            }}
          >
            Getting your order ready…
          </Text>
          <Text style={{ fontSize: kioskPx(15, s), color: muted }}>
            Just a moment.
          </Text>
        </>
      )}
    </StatusLayout>
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
  const t = useKioskTheme(config);
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  // Landscape has roughly half the vertical budget of portrait but nearly
  // double the width, and this screen was a single centred column either way:
  // measured, it ran 32-47px past the viewport on every landscape panel, and
  // since nothing scrolled the summary and Pay button were clipped. Two panes
  // spend the width instead — same structure KioskItemDetail uses.
  const isHorizontal = screenWidth > screenHeight;
  // A landscape phone is ~360dp tall: the heading's heart badge is the one
  // piece of the chooser that carries no information, so it gives its height
  // back there.
  const showHeart = !(isHorizontal && isKioskHandheld(screenWidth, screenHeight));
  const [selected, setSelected] = useState<number | null>(null); // percent, -1 = no tip
  const muted = t.textMuted;
  const faint = t.outline;
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

  const backButton = (
    <KioskPressable
      onPress={onBack}
      pressedScale={0.9}
      style={{
        position: "absolute",
        top: kioskPx(20, s),
        left: kioskPx(20, s),
        zIndex: 10,
        width: kioskPx(52, s),
        height: kioskPx(52, s),
        borderRadius: kioskPx(26, s),
        alignItems: "center",
        justifyContent: "center",
        backgroundColor: faint,
      }}
    >
      <ChevronLeft size={kioskPx(28, s)} color={t.text} />
    </KioskPressable>
  );

  const chooser = (
    <>
      {/* Heading */}
        <View style={{ alignItems: "center", gap: kioskPx(12, s) }}>
          {showHeart ? (
            <View
              style={{
                width: kioskPx(72, s),
                height: kioskPx(72, s),
                borderRadius: kioskPx(36, s),
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: `${t.primary}14`,
              }}
            >
              <Heart
                size={kioskPx(34, s)}
                color={t.primary}
                fill={t.primary}
              />
            </View>
          ) : null}
          <Text
            style={{
              fontSize: kioskPx(30, s),
              ...kioskFont(t, "bold"),
              color: t.text,
            }}
          >
            Add a tip?
          </Text>
        </View>

        {/* Tip preview */}
        <Text
          style={{
            fontSize: kioskPx(44, s),
            ...kioskFont(t, "bold"),
            color:
              tipAmount > 0 ? t.primary : t.textFaint,
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
            maxWidth: kioskPx(isHorizontal ? 760 : 560, s),
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
                  borderColor: active ? t.primary : faint,
                  backgroundColor: active ? t.primary : "transparent",
                }}
              >
                <Text
                  style={{
                    fontSize: kioskPx(28, s),
                    ...kioskFont(t, "bold"),
                    color: active ? t.onPrimary : t.text,
                  }}
                >
                  {pct}%
                </Text>
                <Text
                  style={{
                    fontSize: kioskFontPx(14, s),
                    ...kioskFont(t, "regular"),
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
            borderRadius: kioskPx(kioskRadius.md, s),
            borderWidth: 2,
            borderColor: noTip ? t.primary : faint,
            backgroundColor: noTip ? `${t.primary}10` : "transparent",
          }}
        >
          <Text
            style={{
              fontSize: kioskPx(16, s),
              ...kioskFont(t, "bold"),
              color: noTip ? t.primary : muted,
            }}
          >
            No tip
          </Text>
        </Pressable>
    </>
  );

  const summary = (
    <>
        <View
          style={{
            padding: kioskPx(16, s),
            borderRadius: kioskPx(18, s),
            backgroundColor: faint,
            gap: kioskPx(10, s),
          }}
        >
          <SummaryRow
            theme={t}
            label="Subtotal"
            value={subtotal}
            muted={muted}
            color={t.text}
          />
          <SummaryRow
            theme={t}
            label={
              subtotal > 0
                ? `Tax (${((tax / subtotal) * 100).toFixed(3).replace(/\.?0+$/, "")}%)`
                : "Tax"
            }
            value={tax}
            muted={muted}
            color={t.text}
          />
          <SummaryRow
            theme={t}
            label="Tip"
            value={tipAmount}
            muted={muted}
            color={t.text}
          />
          <View
            style={{ height: 1, backgroundColor: `${t.text}15` }}
          />
          <SummaryRow
            theme={t}
            label="Total"
            value={grandTotal}
            muted={muted}
            color={t.text}
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
              ? `${t.primary}40`
              : t.primary,
          }}
        >
          {(loading || !totals) && (
            <ActivityIndicator size="small" color={t.onPrimary} />
          )}
          <Text
            style={{
              color: t.onPrimary,
              fontSize: kioskPx(19, s),
              ...kioskFont(t, "bold"),
            }}
          >
            {loading || !totals
              ? "Preparing your order…"
              : `Pay $${grandTotal.toFixed(2)}`}
          </Text>
        </Pressable>
    </>
  );

  // ─── Landscape: chooser left, summary + pay right ────────────────
  if (isHorizontal) {
    return (
      <View
        className="flex-1"
        style={{ backgroundColor: t.page }}
      >
        {backButton}
        <View style={{ flex: 1, flexDirection: "row" }}>
          {/* Scrolls only if the chooser outgrows a short panel (a landscape
              phone, or a long preset row); centred otherwise. */}
          <ScrollView
            style={{ flex: 1.35 }}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{
              flexGrow: 1,
              alignItems: "center",
              justifyContent: "center",
              paddingHorizontal: kioskPx(32, s),
              paddingVertical: kioskPx(24, s),
              gap: kioskPx(22, s),
            }}
          >
            {chooser}
          </ScrollView>

          <View
            style={{
              flex: 1,
              justifyContent: "center",
              paddingHorizontal: kioskPx(28, s),
              paddingVertical: kioskPx(24, s),
              gap: kioskPx(16, s),
              borderLeftWidth: 1,
              borderLeftColor: faint,
              backgroundColor: `${t.primary}06`,
            }}
          >
            {summary}
          </View>
        </View>
      </View>
    );
  }

  // ─── Portrait: single column, summary pinned at the foot ─────────
  return (
    <View
      className="flex-1"
      style={{ backgroundColor: t.page }}
    >
      {backButton}

      {/* Scrolls only if a long preset row ever exceeds the space; centred
          otherwise, so short menus keep the original balanced look. */}
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: kioskPx(32, s),
          gap: kioskPx(28, s),
        }}
      >
        {chooser}
      </ScrollView>

      <View
        style={{
          paddingHorizontal: kioskPx(24, s),
          paddingTop: kioskPx(18, s),
          paddingBottom: kioskPx(24, s),
          gap: kioskPx(14, s),
        }}
      >
        {summary}
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
  theme: t,
}: {
  label: string;
  value: number;
  muted: string;
  color: string;
  emphasize?: boolean;
  /** Passed in rather than derived: this row has no `config` of its own. */
  theme: KioskTheme;
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
          ...kioskFont(t, emphasize ? "bold" : "regular"),
        }}
      >
        {label}
      </Text>
      <Text
        style={{
          fontSize: kioskPx(emphasize ? 22 : 15, s),
          ...kioskFont(t, emphasize ? "bold" : "regular"),
          color,
        }}
      >
        ${value.toFixed(2)}
      </Text>
    </View>
  );
}
