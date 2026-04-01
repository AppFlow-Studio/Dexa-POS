import {
  CardType,
  formatCardNumber,
  validateCardNumber,
  validateExpiry,
} from "@/lib/card-validation";
import { useCFD } from "@/contexts/CFDProvider";
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
      borderRadius: 12, padding: 16, justifyContent: "space-between",
      borderWidth: 1, borderColor: "rgba(255,255,255,0.1)", overflow: "hidden",
    }}
  >
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
      <View style={{ width: 36, height: 24, backgroundColor: "rgba(234,179,8,0.2)", borderRadius: 4, borderWidth: 1, borderColor: "rgba(234,179,8,0.4)" }} />
      <Text style={{ color: "#fff", fontWeight: "700", fontSize: 11, textTransform: "uppercase", letterSpacing: 1 }}>
        {type || "BANK CARD"}
      </Text>
    </View>
    <View>
      <Text style={{ color: "#fff", fontSize: 16, fontWeight: "700", letterSpacing: 3, marginBottom: 10 }}>
        {number || "•••• •••• •••• ••••"}
      </Text>
      <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
        <View style={{ flex: 1, marginRight: 12 }}>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, textTransform: "uppercase", marginBottom: 2 }}>Card Holder</Text>
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12, textTransform: "uppercase", letterSpacing: 0.5 }} numberOfLines={1}>
            {name || "YOUR NAME"}
          </Text>
        </View>
        <View>
          <Text style={{ color: "rgba(255,255,255,0.5)", fontSize: 9, textTransform: "uppercase", marginBottom: 2 }}>Expires</Text>
          <Text style={{ color: "#fff", fontWeight: "600", fontSize: 12 }}>{expiry || "MM/YY"}</Text>
        </View>
      </View>
    </View>
  </Animated.View>
);

const ErrorText = ({ error }: { error?: string }) => {
  if (!error) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginTop: 3, marginLeft: 2, gap: 4 }}>
      <AlertCircle size={11} color={colors.danger} />
      <Text style={{ color: colors.danger, fontSize: 10 }}>{error}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  label: { color: colors.muted, fontSize: 10, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", marginBottom: 5, marginLeft: 2 },
  inputBase: {
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10,
    fontSize: 13, color: colors.heading,
  },
  inputRow: {
    flexDirection: "row", alignItems: "center",
    backgroundColor: colors.panel, borderWidth: 1, borderColor: colors.border,
    borderRadius: 8, paddingHorizontal: 10,
  },
  inputInRow: { flex: 1, fontSize: 13, color: colors.heading, paddingVertical: 10, paddingHorizontal: 4 },
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

  const {
    updateTip,
    showProcessing,
    showApproved,
    showDeclined,
    showIdle,
  } = useCFD();

  const TIP_PRESETS = [18, 20, 25];
  const cardInfo = validateCardNumber(cardNumber);
  const tipAmount = parseFloat(tipInput) || 0;
  const grandTotal = amountToPay + tipAmount;

  useEffect(() => {
    updateTip(tipAmount, selectedTipPreset);
  }, [tipAmount, selectedTipPreset, updateTip]);

  useEffect(() => {
    return () => {
      updateTip(0, null);
    };
  }, [updateTip]);

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
    updateTip(tipAmount, selectedTipPreset);
    showProcessing("manual", tipAmount);
    const success = await processManualCardPayment({
      cardBrand: cardInfo.cardType || "unknown",
      last4: cardNumber.slice(-4),
      tipAmount,
    });
    if (success) {
      showApproved();
      setStatus("success");
      setView("success");
      setTimeout(() => showIdle(), 3000);
    }
    else {
      showDeclined();
      setStatus("error");
      setTimeout(() => {
        setStatus("idle");
        showIdle();
      }, 3000);
    }
  };

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "padding"} style={{ backgroundColor: colors.screen }}>
      <View style={{ flexDirection: "row" }}>
        {/* LEFT: Card preview */}
        <View style={{ width: "38%", backgroundColor: colors.panel, borderRightWidth: 1, borderRightColor: colors.border, padding: 20, justifyContent: "center", alignItems: "center" }}>
          <View style={{ width: "100%", maxWidth: 340 }}>
            {/* Secure badge */}
            <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", marginBottom: 14, backgroundColor: `${colors.success}15`, paddingVertical: 5, paddingHorizontal: 12, borderRadius: 20, alignSelf: "center", borderWidth: 1, borderColor: `${colors.success}30`, gap: 5 }}>
              <Lock size={11} color={colors.success} />
              <Text style={{ color: colors.success, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8 }}>Secure Transaction</Text>
            </View>

            <VirtualCard
              number={formatCardNumber(cardNumber)}
              name={cardholderName}
              expiry={`${expiryMonth}/${expiryYear}`}
              type={cardInfo.cardType}
            />

            <View style={{ marginTop: 20, alignItems: "center" }}>
              <Text style={{ color: colors.muted, fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.8, marginBottom: 4 }}>
                {activeSplit ? `Total for ${activeSplit.customerName}` : "Total Amount"}
              </Text>
              <Text style={{ fontSize: 32, fontWeight: "700", color: colors.heading }}>
                ${amountToPay.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* RIGHT: Form */}
        <View style={{ flex: 1, backgroundColor: colors.screen }}>
          <ScrollView
            contentContainerStyle={{ padding: 20, paddingTop: 14, paddingBottom: 80 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text style={{ fontSize: 15, fontWeight: "700", color: colors.heading, marginBottom: 16 }}>Enter Card Details</Text>

            <View style={{ gap: 14, maxWidth: 600 }}>
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
                  <CreditCard size={15} color={colors.muted} />
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
              <View style={{ flexDirection: "row", gap: 10 }}>
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
                    <View style={{ width: 1, backgroundColor: colors.border, marginVertical: 6 }} />
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
                    <ShieldCheck size={14} color={colors.muted} />
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
                    <TouchableOpacity onPress={() => setShowCvv(!showCvv)} style={{ padding: 6 }}>
                      {showCvv ? <EyeOff size={15} color={colors.muted} /> : <Eye size={15} color={colors.muted} />}
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
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 8 }}>
                  {TIP_PRESETS.map((percent) => {
                    const isActive = selectedTipPreset === percent;
                    return (
                      <TouchableOpacity
                        key={percent}
                        onPress={() => handleTipPreset(percent)}
                        style={{
                          flex: 1, paddingVertical: 7, borderRadius: 8, borderWidth: 1,
                          backgroundColor: isActive ? `${colors.teal}15` : colors.panel,
                          borderColor: isActive ? colors.teal : colors.border,
                          alignItems: "center",
                        }}
                      >
                        <Text style={{ fontWeight: "700", color: isActive ? colors.heading : colors.muted, fontSize: 12 }}>{percent}%</Text>
                        <Text style={{ fontSize: 10, marginTop: 1, color: isActive ? colors.teal : colors.muted }}>
                          ${((percent / 100) * amountToPay).toFixed(2)}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
                <View style={[styles.inputRow, { width: "50%" }]}>
                  <DollarSign size={14} color={colors.muted} />
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
              <View style={{ flexDirection: "row", gap: 10, paddingTop: 8 }}>
                <TouchableOpacity
                  onPress={() => setView("payment-method-selection")}
                  style={{ flex: 1, paddingVertical: 10, backgroundColor: colors.panel, borderRadius: 8, borderWidth: 1, borderColor: colors.border, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6 }}
                >
                  <ArrowLeft size={15} color={colors.muted} />
                  <Text style={{ color: colors.muted, fontWeight: "600", fontSize: 13 }}>Back</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleProcessPayment}
                  disabled={status === "processing"}
                  style={{
                    flex: 2, paddingVertical: 10, borderRadius: 8,
                    alignItems: "center", justifyContent: "center",
                    backgroundColor: status === "processing" ? `${colors.teal}40` : colors.teal,
                    opacity: status === "processing" ? 0.7 : 1,
                  }}
                >
                  <Text style={{ fontWeight: "700", fontSize: 13, color: "#000000" }}>
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
