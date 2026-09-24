import {
  isKioskHandheld,
  KIOSK_HANDHELD_SHORT_EDGE,
} from "@/components/kiosk/shared/kioskLayout";
import { kioskPx } from "@/components/kiosk/shared/KioskScaleProvider";
import {
  kioskFont,
  useKioskTheme,
} from "@/components/kiosk/shared/kioskDesign";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { formatUsPhone, normalizeUsPhoneDigits } from "@/lib/phone";
import { useKioskUiScale } from "@/lib/uiScale";
import { isValidPhone } from "@/services/messaging/sendReceiptService";
import { findOrCreateCustomerByPhone } from "@/services/loyalty/loyaltyService";
import { useKioskCartStore } from "@/stores/useKioskCartStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import type { KioskConfig } from "@/types/kiosk";
import { ChevronLeft, Delete } from "@/lib/icons";
import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from "react-native";

/**
 * Pre-payment customer capture — phone-first, REQUIRED. Rendered as the first
 * step of the kiosk checkout (before tip/pay), so every template gets it.
 *
 * Flow:
 *   1. Phone screen (on-screen numeric keypad). Continue when 10 digits.
 *   2. Look up the customer by phone (findOrCreateCustomerByPhone):
 *        - returning customer WITH a name  → capture it and continue straight
 *          to the next step (no name prompt, no interstitial)
 *        - new / no name on file           → ask for a name, save it → done
 *   3. The captured { id, name, phone } lands on useKioskCartStore and is
 *      attached to the order + used for the confirmation-receipt SMS.
 *
 * Resilient to a failed lookup (e.g. offline): falls through to the name screen
 * and still captures name + phone locally so checkout can proceed.
 */
type Sub = "phone" | "name";

export function KioskCustomerInfoStep({
  config,
  onComplete,
  onBack,
}: {
  config: KioskConfig;
  onComplete: () => void;
  onBack: () => void;
}) {
  const s = useKioskUiScale();
  const t = useKioskTheme(config);
  const supabase = useSupabaseClient();
  const setCustomer = useKioskCartStore((st) => st.setCustomer);
  const { width: winWidth, height: winHeight } = useWindowDimensions();

  const [sub, setSub] = useState<Sub>("phone");
  const [digits, setDigits] = useState("");
  const [name, setName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const muted = t.textMuted;
  const faint = t.outline;
  // On a narrow screen (a portrait phone) the centred heading spans the full
  // width and would run under the floating Back chevron, so the content starts
  // below it. Wider panels centre it clear of the corner.
  const narrow = winWidth < KIOSK_HANDHELD_SHORT_EDGE;
  const backClearance = kioskPx(76, s);

  const pressDigit = useCallback((d: string) => {
    setError(null);
    setDigits((prev) => normalizeUsPhoneDigits(prev + d));
  }, []);
  const backspace = useCallback(() => {
    setDigits((prev) => prev.slice(0, -1));
  }, []);

  const phoneValid = isValidPhone(digits);

  const submitPhone = useCallback(async () => {
    if (!phoneValid || loading) return;
    setLoading(true);
    setError(null);
    const merchantId =
      useStoreSettingsStore.getState().selectedStore?.merchant_id ?? "";
    try {
      const found = await findOrCreateCustomerByPhone(
        digits,
        merchantId,
        supabase,
      );
      const trimmedName = found.name?.trim() ?? "";
      if (trimmedName) {
        // Returning customer with a name on file — capture it and skip straight
        // to the next step. No name prompt, no "welcome" interstitial.
        setCustomer({ id: found.id, name: trimmedName, phone: digits });
        onComplete();
        return;
      }
      // New / unnamed — ask for a name next.
      setCustomerId(found.id);
      setSub("name");
    } catch {
      // Lookup failed (e.g. offline) — still collect a name and proceed; the
      // phone + name attach to the order regardless of the customer row.
      setCustomerId(null);
      setSub("name");
    } finally {
      setLoading(false);
    }
  }, [digits, phoneValid, loading, supabase, setCustomer, onComplete]);

  const submitName = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed || loading) return;
    setLoading(true);
    // Best-effort: persist the name on the customer row so next time is personal.
    if (customerId) {
      try {
        await supabase
          .from("customers")
          .update({ name: trimmed })
          .eq("id", customerId);
      } catch {
        /* non-fatal — name still lands on the order */
      }
    }
    setCustomer({ id: customerId, name: trimmed, phone: digits });
    setLoading(false);
    onComplete();
  }, [name, loading, customerId, digits, supabase, setCustomer, onComplete]);

  // ── Back chevron shared across sub-steps ──
  const BackButton = ({ onPress }: { onPress: () => void }) => (
    <Pressable
      onPress={onPress}
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
      <ChevronLeft size={kioskPx(26, s)} color={t.text} />
    </Pressable>
  );

  // ── NAME ENTRY ──
  if (sub === "name") {
    const nameValid = name.trim().length > 0;
    // A landscape kiosk loses roughly half its height to the software keyboard
    // (the app runs adjustResize, so the window itself shrinks). Centred, this
    // block is taller than what's left and the input and Continue button end up
    // behind the keyboard or clipped off the resized window — so in landscape
    // it anchors to the top and tightens its rhythm instead. Portrait keeps the
    // centred layout: there is enough height above the keyboard for it.
    //
    // Keyed to orientation, not to a keyboard-visibility listener, on purpose:
    // the input autofocuses, so the keyboard is up for essentially the whole
    // life of this screen, and reacting to the event would just add a visible
    // jump ~300ms after entry. The ScrollView is the backstop either way —
    // whatever the panel size, everything stays reachable.
    const lift = winWidth > winHeight;
    return (
      <View className="flex-1" style={{ backgroundColor: t.page }}>
        <BackButton onPress={() => setSub("phone")} />
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{
            flexGrow: 1,
            alignItems: "center",
            justifyContent: lift ? "flex-start" : "center",
            // Clears the absolutely-positioned back chevron when top-anchored,
            // or whenever the screen is narrow enough for the heading to reach
            // under it.
            paddingTop: lift || narrow ? backClearance : 0,
            paddingBottom: kioskPx(28, s),
            paddingHorizontal: kioskPx(40, s),
            gap: kioskPx(lift ? 14 : 24, s),
          }}
        >
          <Text
            style={{
              fontSize: kioskPx(lift ? 26 : 32, s),
              ...kioskFont(t, "bold"),
              color: t.text,
              textAlign: "center",
            }}
          >
            {"What's your name?"}
          </Text>
          <Text style={{ fontSize: kioskPx(16, s), color: muted, textAlign: "center" }}>
            So we can personalize your order.
          </Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={muted}
            autoFocus
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={submitName}
            style={{
              width: "100%",
              maxWidth: kioskPx(460, s),
              fontSize: kioskPx(24, s),
              color: t.text,
              backgroundColor: faint,
              borderRadius: kioskPx(16, s),
              paddingHorizontal: kioskPx(20, s),
              paddingVertical: kioskPx(18, s),
              textAlign: "center",
            }}
          />
          <Pressable
            disabled={!nameValid || loading}
            onPress={submitName}
            style={{
              flexDirection: "row",
              gap: kioskPx(10, s),
              width: "100%",
              maxWidth: kioskPx(460, s),
              height: kioskPx(64, s),
              borderRadius: kioskPx(18, s),
              alignItems: "center",
              justifyContent: "center",
              backgroundColor:
                !nameValid || loading
                  ? `${t.primary}40`
                  : t.primary,
            }}
          >
            {loading && <ActivityIndicator size="small" color={t.onPrimary} />}
            <Text style={{ color: t.onPrimary, fontSize: kioskPx(19, s), ...kioskFont(t, "bold") }}>
              Continue
            </Text>
          </Pressable>
        </ScrollView>
      </View>
    );
  }

  // ── PHONE ENTRY ──
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  // Heading, number, four keypad rows and Continue stack to ~560dp at the phone
  // scale; a landscape phone has ~360. There the keypad moves beside the
  // prompt instead of under it. The ScrollView is the backstop either way.
  const splitKeypad =
    winWidth > winHeight && isKioskHandheld(winWidth, winHeight);

  const prompt = (
    <>
      <Text
        style={{
          fontSize: kioskPx(32, s),
          ...kioskFont(t, "bold"),
          color: t.text,
          textAlign: "center",
        }}
      >
        Enter your phone number
      </Text>
      <Text style={{ fontSize: kioskPx(16, s), color: muted, textAlign: "center" }}>
        {"We'll text your receipt and order updates."}
      </Text>

      {/* Number display */}
      <Text
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.7}
        style={{
          fontSize: kioskPx(40, s),
          ...kioskFont(t, "bold"),
          letterSpacing: 1,
          color: digits ? t.text : t.textFaint,
          marginVertical: kioskPx(6, s),
        }}
      >
        {digits ? formatUsPhone(digits) : "(___) ___-____"}
      </Text>

      {error ? (
        <Text style={{ fontSize: kioskPx(15, s), color: "#dc2626", textAlign: "center" }}>
          {error}
        </Text>
      ) : null}
    </>
  );

  const keypad = (
    <View
      style={{
        flexDirection: "row",
        flexWrap: "wrap",
        width: kioskPx(300, s),
        justifyContent: "space-between",
        rowGap: kioskPx(12, s),
      }}
    >
      {keys.map((k, i) => {
        if (k === "") return <View key={i} style={{ width: kioskPx(88, s) }} />;
        const isBack = k === "back";
        return (
          <Pressable
            key={i}
            onPress={() => (isBack ? backspace() : pressDigit(k))}
            disabled={loading}
            style={{
              width: kioskPx(88, s),
              height: kioskPx(72, s),
              borderRadius: kioskPx(18, s),
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: faint,
            }}
          >
            {isBack ? (
              <Delete size={kioskPx(26, s)} color={t.text} />
            ) : (
              <Text
                style={{
                  fontSize: kioskPx(28, s),
                  ...kioskFont(t, "bold"),
                  color: t.text,
                }}
              >
                {k}
              </Text>
            )}
          </Pressable>
        );
      })}
    </View>
  );

  const continueButton = (
    <Pressable
      disabled={!phoneValid || loading}
      onPress={submitPhone}
      style={{
        flexDirection: "row",
        gap: kioskPx(10, s),
        width: kioskPx(300, s),
        height: kioskPx(64, s),
        borderRadius: kioskPx(18, s),
        alignItems: "center",
        justifyContent: "center",
        marginTop: kioskPx(6, s),
        backgroundColor:
          !phoneValid || loading
            ? `${t.primary}40`
            : t.primary,
      }}
    >
      {loading && <ActivityIndicator size="small" color={t.onPrimary} />}
      <Text style={{ color: t.onPrimary, fontSize: kioskPx(19, s), ...kioskFont(t, "bold") }}>
        Continue
      </Text>
    </Pressable>
  );

  return (
    <View className="flex-1" style={{ backgroundColor: t.page }}>
      <ScrollView
        style={{ flex: 1 }}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{
          flexGrow: 1,
          alignItems: "center",
          justifyContent: "center",
          paddingHorizontal: kioskPx(32, s),
          paddingTop: narrow ? backClearance : kioskPx(24, s),
          paddingBottom: kioskPx(24, s),
        }}
      >
        {splitKeypad ? (
          <View
            style={{
              // Stretch, or the prompt column's `flex: 1` has no width to
              // take — the scroller centres its children.
              alignSelf: "stretch",
              flexDirection: "row",
              alignItems: "center",
              gap: kioskPx(40, s),
            }}
          >
            <View style={{ flex: 1, alignItems: "center", gap: kioskPx(18, s) }}>
              {prompt}
              {continueButton}
            </View>
            {keypad}
          </View>
        ) : (
          <View style={{ alignItems: "center", gap: kioskPx(18, s) }}>
            {prompt}
            {keypad}
            {continueButton}
          </View>
        )}
      </ScrollView>
      {/* After the scroller, so it paints — and takes taps — above it. */}
      <BackButton onPress={onBack} />
    </View>
  );
}
