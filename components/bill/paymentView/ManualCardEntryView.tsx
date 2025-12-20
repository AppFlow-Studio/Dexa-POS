import {
  CardType,
  formatCardNumber,
  validateCardNumber,
  validateExpiry,
  validateName,
} from "@/lib/card-validation";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { BottomSheetTextInput } from "@gorhom/bottom-sheet";
import {
  AlertCircle,
  ArrowLeft,
  CreditCard,
  DollarSign,
  Lock,
  ShieldCheck,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, { FadeInUp } from "react-native-reanimated";

// --- Visual Card Component ---
const VirtualCard = ({
  number,
  name,
  expiry,
  type,
}: {
  number: string;
  name: string;
  expiry: string;
  type: CardType;
}) => {
  const getCardColor = () => {
    switch (type) {
      case "visa":
        return "bg-blue-800";
      case "mastercard":
        return "bg-orange-900";
      case "amex":
        return "bg-cyan-800";
      case "discover":
        return "bg-orange-600";
      default:
        return "bg-gray-800";
    }
  };

  return (
    <Animated.View
      entering={FadeInUp.duration(500)}
      className={`w-full aspect-[1.586] ${getCardColor()} rounded-2xl p-6 justify-between shadow-2xl shadow-black/50 border border-white/10 relative overflow-hidden`}
    >
      <View className="absolute -right-10 -top-10 w-40 h-40 bg-white/10 rounded-full blur-2xl" />
      <View className="absolute -left-10 -bottom-10 w-40 h-40 bg-black/20 rounded-full blur-xl" />

      <View className="flex-row justify-between items-start">
        <View className="w-12 h-8 bg-yellow-500/20 rounded-md border border-yellow-500/40" />
        <Text className="text-white font-bold text-lg uppercase tracking-wider">
          {type || "BANK CARD"}
        </Text>
      </View>

      <View>
        <Text className="text-white text-2xl font-mono tracking-widest mb-4 shadow-sm">
          {number || "•••• •••• •••• ••••"}
        </Text>
        <View className="flex-row justify-between">
          <View className="flex-1 mr-4">
            <Text className="text-gray-400 text-xs uppercase mb-1">
              Card Holder
            </Text>
            <Text
              className="text-white font-medium uppercase tracking-wide"
              numberOfLines={1}
            >
              {name || "YOUR NAME"}
            </Text>
          </View>
          <View>
            <Text className="text-gray-400 text-xs uppercase mb-1">
              Expires
            </Text>
            <Text className="text-white font-medium">{expiry || "MM/YY"}</Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
};

// --- Error Message Component ---
const ErrorText = ({ error }: { error?: string }) => {
  if (!error) return null;
  return (
    <View className="flex-row items-center mt-1 ml-1 gap-2">
      <AlertCircle size={12} color="#EF4444" className="mr-1" />
      <Text className="text-red-400 text-xs">{error}</Text>
    </View>
  );
};

const ManualCardEntryView = () => {
  const { activeOrderOutstandingTotal, activeOrderTotal } = useOrderStore();
  // 1. Get Split Data from Store
  const { setView, processManualCardPayment, activeSplitId, splits } =
    usePaymentStore();

  // 2. Calculate Amount to Pay
  const activeSplit = splits.find((s) => s.id === activeSplitId);
  // Fallback to activeOrderTotal if outstandingTotal is 0 (handles async timing)
  const effectiveOutstandingTotal =
    activeOrderOutstandingTotal > 0
      ? activeOrderOutstandingTotal
      : activeOrderTotal;
  const amountToPay = activeSplit
    ? activeSplit.amount
    : effectiveOutstandingTotal;

  const expiryYearRef = useRef<TextInput>(null);
  const cvvRef = useRef<TextInput>(null);

  const [cardholderName, setCardholderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [tipInput, setTipInput] = useState("");

  // Calculate tip and grand total
  const tipAmount = parseFloat(tipInput) || 0;
  const grandTotal = amountToPay + tipAmount;

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isTouched, setIsTouched] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<
    "idle" | "processing" | "success" | "error"
  >("idle");

  const cardInfo = validateCardNumber(cardNumber);

  // Validation Logic
  useEffect(() => {
    if (isTouched.cardholderName) {
      const { isValid, error } = validateName(cardholderName);
      setErrors((p) => ({ ...p, cardholderName: isValid ? "" : error || "" }));
    }
  }, [cardholderName, isTouched.cardholderName]);

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

  const handleBlur = (field: string) => {
    setIsTouched((prev) => ({ ...prev, [field]: true }));
  };

  const checkFormValidity = () => {
    if (
      !cardholderName ||
      !cardNumber ||
      !expiryMonth ||
      !expiryYear ||
      !cvv ||
      !zipCode
    )
      return false;
    const hasErrors = Object.values(errors).some((e) => !!e);
    return !hasErrors;
  };

  const handleProcessPayment = async () => {
    setIsTouched({
      cardholderName: true,
      cardNumber: true,
      expiry: true,
      cvv: true,
      zipCode: true,
    });

    if (!cardholderName || !cardNumber || !expiryMonth || !expiryYear || !cvv)
      return;

    setStatus("processing");
    const success = await processManualCardPayment({
      cardBrand: cardInfo.cardType || "unknown",
      last4: cardNumber.slice(-4),
      tipAmount,
    });

    if (success) {
      setStatus("success");
      setView("success");
    } else {
      setStatus("error");
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "padding"}
      className=" bg-[#212121]"
    >
      <View className=" flex-row">
        {/* LEFT COLUMN: Visuals (Static) */}
        <View className="w-[40%] bg-[#1A1A1A] border-r border-[#333] p-8 justify-center items-center">
          <View className="w-full max-w-[380px]">
            {/* Secure Badge */}
            <View className="flex-row items-center justify-center mb-6 bg-green-900/20 py-2 px-4 rounded-full self-center border border-green-900/50">
              <Lock size={14} color="#10B981" className="mr-2" />
              <Text className="text-green-500 text-xs font-bold uppercase tracking-widest">
                Secure Transaction
              </Text>
            </View>

            {/* The Card */}
            <VirtualCard
              number={formatCardNumber(cardNumber)}
              name={cardholderName}
              expiry={`${expiryMonth}/${expiryYear}`}
              type={cardInfo.cardType}
            />

            {/* Total Amount Display */}
            <View className="mt-10 items-center">
              <Text className="text-gray-500 font-medium tracking-widest uppercase mb-2">
                {activeSplit
                  ? `Total for ${activeSplit.customerName}`
                  : "Total Amount"}
              </Text>
              <Text className="text-5xl font-bold text-white">
                ${amountToPay.toFixed(2)}
              </Text>
            </View>
          </View>
        </View>

        {/* RIGHT COLUMN: Form (Scrollable) */}
        <View className="flex-1 bg-[#212121]">
          <ScrollView
            contentContainerStyle={{
              padding: 32,
              paddingTop: 16,
              paddingBottom: 100,
            }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <Text className="text-2xl font-bold text-white mb-8">
              Enter Card Details
            </Text>

            <View className="gap-y-6 max-w-[600px]">
              {/* Name */}
              <View>
                <Text className="text-gray-400 mb-2 font-medium ml-1">
                  Cardholder Name
                </Text>
                <TextInput
                  value={cardholderName}
                  onChangeText={setCardholderName}
                  onBlur={() => handleBlur("cardholderName")}
                  placeholder="NAME ON CARD"
                  className={`bg-[#2A2A2A] text-white p-4 rounded-xl border text-lg ${
                    errors.cardholderName
                      ? "border-red-500"
                      : "border-[#404040]"
                  }`}
                  placeholderTextColor="#525252"
                />
                <ErrorText error={errors.cardholderName} />
              </View>

              {/* Number */}
              <View>
                <Text className="text-gray-400 mb-2 font-medium ml-1">
                  Card Number
                </Text>
                <View
                  className={`flex-row items-center bg-[#2A2A2A] rounded-xl border px-4 ${
                    errors.cardNumber ? "border-red-500" : "border-[#404040]"
                  }`}
                >
                  <CreditCard size={20} color="#666" className="ml-4" />
                  <TextInput
                    value={formatCardNumber(cardNumber)}
                    onChangeText={(t) =>
                      setCardNumber(t.replace(/\D/g, "").replace(/\s/g, ""))
                    }
                    onBlur={() => handleBlur("cardNumber")}
                    placeholder="0000 0000 0000 0000"
                    keyboardType="numeric"
                    maxLength={19}
                    className="flex-1 text-white p-4 font-mono text-lg"
                    placeholderTextColor="#525252"
                  />
                </View>
                <ErrorText error={errors.cardNumber} />
              </View>

              {/* Expiry & CVV Row */}
              <View className="flex-row gap-4">
                <View className="flex-1">
                  <Text className="text-gray-400 mb-2 font-medium ml-1">
                    Expiry (MM/YY)
                  </Text>
                  <View
                    className={`flex-row bg-[#2A2A2A] rounded-xl border ${
                      errors.expiry ? "border-red-500" : "border-[#404040]"
                    } overflow-hidden`}
                  >
                    <TextInput
                      value={expiryMonth}
                      onChangeText={(t) => {
                        setExpiryMonth(t.replace(/\D/g, ""));
                        if (t.length === 2) expiryYearRef.current?.focus();
                      }}
                      onBlur={() => handleBlur("expiry")}
                      placeholder="MM"
                      keyboardType="numeric"
                      maxLength={2}
                      className="flex-1 text-white p-4 text-center font-mono text-lg"
                      placeholderTextColor="#525252"
                    />
                    <View className="w-[1px] bg-[#404040] my-2" />
                    <TextInput
                      ref={expiryYearRef}
                      value={expiryYear}
                      onChangeText={(t) => {
                        setExpiryYear(t.replace(/\D/g, ""));
                        if (t.length === 2) cvvRef.current?.focus();
                      }}
                      onBlur={() => handleBlur("expiry")}
                      placeholder="YY"
                      keyboardType="numeric"
                      maxLength={2}
                      className="flex-1 text-white p-4 text-center font-mono text-lg"
                      placeholderTextColor="#525252"
                    />
                  </View>
                  <ErrorText error={errors.expiry} />
                </View>

                <View className="flex-1">
                  <Text className="text-gray-400 mb-2 font-medium ml-1">
                    CVV / CVC
                  </Text>
                  <View className="flex-row items-center bg-[#2A2A2A] rounded-xl border border-[#404040] px-4">
                    <ShieldCheck size={18} color="#666" className="ml-4" />
                    <TextInput
                      ref={cvvRef}
                      value={cvv}
                      onChangeText={(t) => setCvv(t.replace(/\D/g, ""))}
                      placeholder="123"
                      keyboardType="numeric"
                      maxLength={4}
                      secureTextEntry
                      className="flex-1 text-white p-4 font-mono text-lg"
                      placeholderTextColor="#525252"
                    />
                  </View>
                </View>
              </View>

              {/* Zip */}
              <View>
                <Text className="text-gray-400 mb-2 font-medium ml-1">
                  Billing Zip Code
                </Text>
                <TextInput
                  value={zipCode}
                  onChangeText={(t) => setZipCode(t.replace(/\D/g, ""))}
                  placeholder="12345"
                  keyboardType="numeric"
                  maxLength={5}
                  className="bg-[#2A2A2A] text-white p-4 rounded-xl border border-[#404040] w-1/2"
                  placeholderTextColor="#525252"
                />
              </View>

              {/* Tip Amount */}
              <View>
                <Text className="text-gray-400 mb-2 font-medium ml-1">
                  Tip Amount (Optional)
                </Text>
                <View className="flex-row items-center bg-[#2A2A2A] rounded-xl border border-[#404040] px-4 w-1/2">
                  <DollarSign size={18} color="#666" />
                  <BottomSheetTextInput
                    value={tipInput}
                    onChangeText={setTipInput}
                    placeholder="0.00"
                    keyboardType="numeric"
                    placeholderTextColor="#525252"
                    style={{
                      flex: 1,
                      color: "white",
                      padding: 16,
                      fontSize: 16,
                    }}
                  />
                </View>
              </View>

              {/* ACTION BUTTONS */}
              <View className="flex-row gap-4 pt-8">
                <TouchableOpacity
                  onPress={() => setView("payment-method-selection")}
                  className="flex-1 py-4 bg-[#2A2A2A] rounded-xl border border-[#404040] flex-row items-center justify-center active:bg-[#333]"
                >
                  <ArrowLeft size={20} color="#D1D5DB" className="mr-2" />
                  <Text className="text-gray-300 font-semibold text-lg">
                    Back
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleProcessPayment}
                  disabled={status === "processing"}
                  className={`flex-[2] py-4 rounded-xl flex-row items-center justify-center shadow-lg shadow-blue-900/20 
                                ${status === "processing" ? "bg-blue-900" : "bg-blue-600 active:bg-blue-700"}`}
                >
                  {status === "processing" ? (
                    <Text className="text-blue-200 font-bold text-lg">
                      Processing...
                    </Text>
                  ) : (
                    <Text className="text-white font-bold text-lg">
                      Pay ${grandTotal.toFixed(2)}
                    </Text>
                  )}
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
