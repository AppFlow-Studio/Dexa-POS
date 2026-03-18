import {
  CardType,
  formatCardNumber,
  validateCardNumber,
  validateExpiry,
} from "@/lib/card-validation";
import { colors } from "@/lib/theme";
import { useActiveOrderTotals } from "@/stores/selectors/orderSelectors";
import { usePaymentStore } from "@/stores/usePaymentStore";
import {
  AlertCircle,
  ArrowLeft,
  CreditCard,
  DollarSign,
  Eye,
  EyeOff,
  Lock,
  ShieldCheck,
} from "lucide-react-native";
import { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

const cardBgMap: Record<string, string> = {
  visa: "#1e3a5f",
  mastercard: "#4a1c00",
  amex: "#003d4a",
  discover: "#7c2d00",
  unknown: "#1e2130",
};

const VirtualCard = ({
  number, name, expiry, type,
}: {
  number: string; name: string; expiry: string; type: CardType;
}) => (
  <Animated.View
    entering={FadeInUp.duration(500)}
    style={{
      width: "100%", aspectRatio: 1.586,
      backgroundColor: (type ? cardBgMap[type] : null) ?? cardBgMap["unknown"],
      borderRadius: 16, padding: 24, justifyContent: "space-between",
      borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", overflow: "hidden",
    }}
  >
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
      <View style={{ width: 48, height: 32, backgroundColor: "rgba(234,179,8,0.2)", borderRadius: 6, borderWidth: 1, borderColor: "rgba(234,179,8,0.4)" }} />
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 14, textTransform: "uppercase", letterSpacing: 1 }}>
        {type || "BANK CARD"}
      </Text>
    </View>
    <View>
      <Text style={{ color: "#fff", fontSize: 22, fontWeight: "700", letterSpacing: 4, marginBottom: 16 }}>
        {number || "•••• •••• •••• ••••"}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ flex: 1, marginRight: 16 }}>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, textTransform: "uppercase", marginBottom: 2 }}>Card Holder</Text>
          <Text style={{ color: "#fff", fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.5 }} numberOfLines={1}>
            {name || "YOUR NAME"}
          </Text>
        </View>
        <View>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 10, textTransform: "uppercase", marginBottom: 2 }}>Expires</Text>
          <Text style={{ color: "#fff", fontWeight: "600" }}>{expiry || "MM/YY"}</Text>
        </View>
      </View>
    </View>
  </Animated.View>
);

const ErrorText = ({ error }: { error?: string }) => {
  if (!error) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 4, marginLeft: 4, gap: 6 }}>
      <AlertCircle size={12} color={colors.danger} />
      <Text style={{ color: colors.danger, fontSize: 11 }}>{error}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 11, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 6, marginLeft: 2 },
  inputBase: {
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
    fontSize: 15, color: colors.heading,
  },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border,
    borderRadius: 12, paddingHorizontal: 12,
  },
  inputInRow: { flex: 1, fontSize: 15, color: colors.heading, paddingVertical: 14, paddingHorizontal: 6 },
});

const ManualCardEntryView = () => {
  const orderTotals = useActiveOrderTotals();
  const activeOrderOutstandingTotal = orderTotals?.amountDue ?? 0;
  const activeOrderTotal = orderTotals?.total ?? 0;
  const setView = usePaymentStore((s) => s.setView);
  const processManualCardPayment = usePaymentStore((s) => s.processManualCardPayment);
  const activeSplitId = usePaymentStore((s) => s.activeSplitId);
  const splits = usePaymentStore((s) => s.splits);
  const expandSheetToFull = usePaymentStore((s) => s.expandSheetToFull);

  useEffect(() => { expandSheetToFull(); }, [expandSheetToFull]);

  const activeSplit = splits.find((s) => s.id === activeSplitId);
  const effectiveOutstandingTotal = activeOrderOutstandingTotal > 0 ? activeOrderOutstandingTotal : activeOrderTotal;
  const amountToPay = activeSplit ? activeSplit.amount : effectiveOutstandingTotal;

  const expiryYearRef = useRef<TextInput>(null);
  const cvvRef = useRef<TextInput>(null);

  const [cardholderName, setCardholderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [tipInput, setTipInput] = useState("");
  const [showCvv, setShowCvv] = useState(false);
  const [selectedTipPreset, setSelectedTipPreset] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isTouched, setIsTouched] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<"idle" | "processing" | "success" | "error">("idle");

  const TIP_PRESETS = [18, 20, 25];
  const cardInfo = validateCardNumber(cardNumber);
  const tipAmount = parseFloat(tipInput) || 0;
  const grandTotal = amountToPay + tipAmount;

  useEffect(() => {
    if (isTouched.cardNumber) {
      const { isValid, error } = validateCardNumber(cardNumber);
      setErrors((p) => ({ ...p, cardNumber: isValid ? "" : error || "" }));
    }
  }, [cardNumber, isTouched.cardNumber]);

  useEffect(() => {
    if (isTouched.expiry) {
      const { isValid, error } = validateExpiry(expiryMonth, expiryYear);
      setErrors((p) => ({ ...p, expiry: isValid ? "" : error || "" }));
    }
  }, [expiryMonth, expiryYear, isTouched.expiry]);

  const handleBlur = (field: string) => setIsTouched((prev) => ({ ...prev, [field]: true }));

  const handleTipPreset = (percentage: number) => {
    setTipInput(((percentage / 100) * amountToPay).toFixed(2));
    setSelectedTipPreset(percentage);
  };

  const handleTipInputChange = (value: string) => {
    if (/^\d*\.?\d{0,2}$/.test(value) || value === "") {
      setTipInput(value);
      setSelectedTipPreset(null);
    }
  };

  const handleProcessPayment = async () => {
    setIsTouched({ cardNumber: true, expiry: true, cvv: true, zipCode: true });
    if (!cardNumber || !expiryMonth || !expiryYear || !cvv) return;
    setStatus("processing");
    const success = await processManualCardPayment({
      cardBrand: cardInfo.cardType || "unknown",
      last4: cardNumber.slice(-4),
      tipAmount,
    });
    if (success) { setStatus("success"); setView("success"); }
    else { setStatus("error"); setTimeout(() => setStatus("idle"), 3000); }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "padding"} style={{ backgroundColor: colors.screen }}>
      <View style={{ flexDirection: "row" }}>
        {/* LEFT: Card preview */}
        <View style={{ width: "40%", backgroundColor: colors.panel, borderRightWidth: 1, borderRightColor: colors.border, padding: 32, justifyContent: "center", alignItems: "center" }}>
          <View style={{ width: "100%", maxWidth: 380 }}>
            {/* Secure badge */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 20, backgroundColor: `${colors.success}15`, paddingVertical: 8, paddingHorizontal: 16, borderRadius: 20, alignSelf: "center", borderWidth: 1, borderColor: `${colors.success}30`, gap: 6 }}>
              <Lock size={13} color={colors.success} />
              <Text style={{ color: colors.success, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1 }}>Secure Transaction</Text>
            </View>

            <VirtualCard
              number={formatCardNumber(cardNumber)}
              name={cardholderName}
              expiry={`${expiryMonth}/${expiryYear}`}
              type={cardInfo.cardType}
            />

            <View style={{ marginTop: 32, alignItems: "center" }}>
              <Text style={{ color: colors.muted, fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>
                {activeSplit ? `Total for ${activeSplit.customerName}` : "Total Amount"}
              </Text>
              <Text style={{ fontSize: 44, fontWeight: "700", color: colors.heading }}>
                ${amountToPay.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* RIGHT: Form */}
        <View style={{ flex: 1, backgroundColor: colors.screen }}>
          <ScrollView
            contentContainerStyle={{ padding: 32, paddingTop: 16, paddingBottom: 100 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={{ fontSize: 22, fontWeight: "700", color: colors.heading, marginBottom: 24 }}>Enter Card Details</Text>

            <View style={{ gap: 20, maxWidth: 600 }}>
              {/* Name */}
              <View>
                <Text style={styles.label}>Cardholder Name (Optional)</Text>
                <TextInput
                  value={cardholderName}
                  onChangeText={setCardholderName}
                  onBlur={() => handleBlur("cardholderName")}
                  placeholder="NAME ON CARD"
                  placeholderTextColor={colors.muted}
                  style={[styles.inputBase, errors.cardholderName ? { borderColor: colors.danger } : {}]}
                />
                <ErrorText error={errors.cardholderName} />
              </View>

              {/* Card Number */}
              <View>
                <Text style={styles.label}>Card Number</Text>
                <View style={[styles.inputRow, errors.cardNumber ? { borderColor: colors.danger } : {}]}>
                  <CreditCard size={18} color={colors.muted} />
                  <TextInput
                    value={formatCardNumber(cardNumber)}
                    onChangeText={(t) => setCardNumber(t.replace(/\D/g, "").replace(/\s/g, ""))}
                    onBlur={() => handleBlur("cardNumber")}
                    placeholder="0000 0000 0000 0000"
                    keyboardType="numeric"
                    maxLength={19}
                    placeholderTextColor={colors.muted}
                    style={styles.inputInRow}
                  />
                </View>
                <ErrorText error={errors.cardNumber} />
              </View>

              {/* Expiry & CVV */}
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>Expiry (MM/YY)</Text>
                  <View style={[styles.inputRow, errors.expiry ? { borderColor: colors.danger } : {}]}>
                    <TextInput
                      value={expiryMonth}
                      onChangeText={(t) => { setExpiryMonth(t.replace(/\D/g, "")); if (t.length === 2) expiryYearRef.current?.focus(); }}
                      onBlur={() => handleBlur("expiry")}
                      placeholder="MM"
                      keyboardType="numeric"
                      maxLength={2}
                      placeholderTextColor={colors.muted}
                      style={[styles.inputInRow, { textAlign: "center" }]}
                    />
                    <View style={{ width: 1, backgroundColor: colors.border, marginVertical: 8 }} />
                    <TextInput
                      ref={expiryYearRef}
                      value={expiryYear}
                      onChangeText={(t) => { setExpiryYear(t.replace(/\D/g, "")); if (t.length === 2) cvvRef.current?.focus(); }}
                      onBlur={() => handleBlur("expiry")}
                      placeholder="YY"
                      keyboardType="numeric"
                      maxLength={2}
                      placeholderTextColor={colors.muted}
                      style={[styles.inputInRow, { textAlign: "center" }]}
                    />
                  </View>
                  <ErrorText error={errors.expiry} />
                </View>

                <View style={{ flex: 1 }}>
                  <Text style={styles.label}>CVV / CVC</Text>
                  <View style={styles.inputRow}>
                    <ShieldCheck size={16} color={colors.muted} />
                    <TextInput
                      ref={cvvRef}
                      value={cvv}
                      onChangeText={(t) => setCvv(t.replace(/\D/g, ""))}
                      placeholder="123"
                      keyboardType="numeric"
                      maxLength={4}
                      secureTextEntry={!showCvv}
                      placeholderTextColor={colors.muted}
                      style={styles.inputInRow}
                    />
                    <TouchableOpacity onPress={() => setShowCvv(!showCvv)} style={{ padding: 8 }}>
                      {showCvv ? <EyeOff size={18} color={colors.muted} /> : <Eye size={18} color={colors.muted} />}
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Zip */}
              <View>
                <Text style={styles.label}>Billing Zip Code</Text>
                <TextInput
                  value={zipCode}
                  onChangeText={(t) => setZipCode(t.replace(/\D/g, ""))}
                  placeholder="12345"
                  keyboardType="numeric"
                  maxLength={5}
                  placeholderTextColor={colors.muted}
                  style={[styles.inputBase, { width: "50%" }]}
                />
              </View>

              {/* Tip */}
              <View>
                <Text style={styles.label}>Tip Amount (Optional)</Text>
                <View style={{ flexDirection: "row", gap: 8, marginBottom: 10 }}>
                  {TIP_PRESETS.map((percent) => {
                    const isActive = selectedTipPreset === percent;
                    return (
                      <TouchableOpacity
                        key={percent}
                        onPress={() => handleTipPreset(percent)}
                        style={{
                          flex: 1, paddingVertical: 10, borderRadius: 12, borderWidth: 1,
                          backgroundColor: isActive ? `${colors.teal}15` : colors.panel,
                          borderColor: isActive ? colors.teal : colors.border,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontWeight: "700", color: isActive ? colors.heading : colors.muted, fontSize: 14 }}>{percent}%</Text>
                        <Text style={{ fontSize: 11, marginTop: 2, color: isActive ? colors.teal : colors.muted }}>
                          ${((percent / 100) * amountToPay).toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={[styles.inputRow, { width: "50%" }]}>
                  <DollarSign size={16} color={colors.muted} />
                  <TextInput
                    value={tipInput}
                    onChangeText={handleTipInputChange}
                    placeholder="0.00"
                    keyboardType="numeric"
                    placeholderTextColor={colors.muted}
                    style={styles.inputInRow}
                  />
                </View>
              </View>

              {/* Buttons */}
              <View style={{ flexDirection: "row", gap: 12, paddingTop: 16 }}>
                <TouchableOpacity
                  onPress={() => setView("payment-method-selection")}
                  style={{ flex: 1, paddingVertical: 14, backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}
                >
                  <ArrowLeft size={18} color={colors.muted} />
                  <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 15 }}>Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleProcessPayment}
                  disabled={status === "processing"}
                  style={{
                    flex: 2, paddingVertical: 14, borderRadius: 12,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: status === "processing" ? `${colors.teal}40` : colors.teal,
                    opacity: status === "processing" ? 0.7 : 1,
                  }}
                >
                  <Text style={{ fontWeight: "700", fontSize: 16, color: "#000000" }}>
                    {status === "processing" ? "Processing..." : `Pay $${grandTotal.toFixed(2)}`}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </View>
      </View>
    </KeyboardAvoidingView>
  );
};

export default ManualCardEntryView;
