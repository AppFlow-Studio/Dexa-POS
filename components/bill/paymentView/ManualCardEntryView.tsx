import {
  CardType,
  formatCardNumber,
  validateCardNumber,
  validateCVV,
  validateExpiry,
  validateName,
  validateZip,
} from "@/lib/card-validation";
import { useOrderStore } from "@/stores/useOrderStore";
import { usePaymentStore } from "@/stores/usePaymentStore";
import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

// A simple progress bar component
const ProgressBar = ({ progress }: { progress: number }) => (
  <View className="h-2 bg-gray-700 rounded-full">
    <View
      className="h-2 bg-blue-500 rounded-full"
      style={{ width: `${progress}%` }}
    />
  </View>
);

// A simple card brand icon component
const CardBrandIcon = ({ brand }: { brand: CardType }) => {
  if (brand === "visa") {
    return (
      <View className="bg-blue-600 px-3 py-1.5 rounded-lg flex items-center justify-center">
        <Text className="text-white font-bold text-sm">VISA</Text>
      </View>
    );
  }

  if (brand === "mastercard") {
    return (
      <View className="relative w-12 h-8 flex items-center justify-center">
        <View className="absolute left-1 w-6 h-6 rounded-full bg-red-500" />
        <View className="absolute right-1 w-6 h-6 rounded-full bg-yellow-500" style={{ opacity: 0.8 }} />
      </View>
    );
  }

  if (brand === "amex") {
    return (
      <View className="bg-blue-500 px-3 py-1.5 rounded-lg flex items-center justify-center">
        <Text className="text-white font-bold text-sm">AMEX</Text>
      </View>
    );
  }

  if (brand === "discover") {
    return (
      <View className="bg-orange-500 px-3 py-1.5 rounded-lg flex items-center justify-center">
        <Text className="text-white font-bold text-sm">D</Text>
      </View>
    );
  }

  return null;
};

const ManualCardEntryView = () => {
  const { activeOrderId, activeOrderOutstandingTotal } = useOrderStore();
  const { setView, processManualCardPayment } = usePaymentStore();

  // Refs for auto-focus
  const expiryYearRef = useRef<TextInput>(null);

  // Form state
  const [cardholderName, setCardholderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [cvv, setCvv] = useState("");
  const [zipCode, setZipCode] = useState("");

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isTouched, setIsTouched] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<
    "idle" | "processing" | "success" | "error"
  >("idle");

  const cardInfo = validateCardNumber(cardNumber);

  // Real-time validation
  useEffect(() => {
    if (isTouched.cardholderName) {
      const { isValid, error } = validateName(cardholderName);
      setErrors((prev) => ({
        ...prev,
        cardholderName: isValid ? "" : error || "",
      }));
    }
  }, [cardholderName, isTouched.cardholderName]);

  useEffect(() => {
    if (isTouched.cardNumber) {
      const { isValid, error } = validateCardNumber(cardNumber);
      setErrors((prev) => ({
        ...prev,
        cardNumber: isValid ? "" : error || "",
      }));
    } // The error type for validateCardNumber is string | undefined, so ensure it's always a string
  }, [cardNumber, isTouched.cardNumber]);

  useEffect(() => {
    if (isTouched.expiry) {
      const { isValid, error } = validateExpiry(expiryMonth, expiryYear);
      setErrors((prev) => ({ ...prev, expiry: isValid ? "" : error || "" }));
    }
  }, [expiryMonth, expiryYear, isTouched.expiry]);

  useEffect(() => {
    if (isTouched.cvv) {
      const { isValid, error } = validateCVV(cvv, cardInfo.cardType);
      setErrors((prev) => ({ ...prev, cvv: isValid ? "" : error || "" }));
    }
  }, [cvv, cardInfo.cardType, isTouched.cvv]);

  useEffect(() => {
    if (isTouched.zipCode) {
      const { isValid, error } = validateZip(zipCode);
      setErrors((prev) => ({ ...prev, zipCode: isValid ? "" : error || "" }));
    }
  }, [zipCode, isTouched.zipCode]);

  const handleBlur = (field: string) => {
    setIsTouched((prev) => ({ ...prev, [field]: true }));
  };

  const calculateProgress = () => {
    const fields = [
      validateName(cardholderName).isValid,
      validateCardNumber(cardNumber).isValid,
      validateExpiry(expiryMonth, expiryYear).isValid,
      validateCVV(cvv, cardInfo.cardType).isValid,
      validateZip(zipCode).isValid,
    ];
    const validFields = fields.filter(Boolean).length;
    return (validFields / fields.length) * 100;
  };

  const checkFormValidity = () => {
    // Check if there are no active errors and all required fields have content
    const noActiveErrors = Object.values(errors).every((error) => !error);

    const hasRequiredContent =
      cardholderName.trim() !== "" &&
      cardNumber.trim() !== "" &&
      expiryMonth.trim() !== "" &&
      expiryYear.trim() !== "" &&
      cvv.trim() !== "" &&
      zipCode.trim() !== "";

    return noActiveErrors && hasRequiredContent;
  };

  const handleProcessPayment = async () => {
    // Touch all fields to show all errors on submit
    setIsTouched({
      cardholderName: true,
      cardNumber: true,
      expiry: true,
      cvv: true,
      zipCode: true,
    });

    // Check if any errors exist
    if (Object.values(errors).some((e) => e)) {
      return;
    }

    setStatus("processing");
    const success = await processManualCardPayment({
      cardBrand: cardInfo.cardType!,
      last4: cardNumber.slice(-4),
    });

    if (success) {
      setStatus("success");
      setView("success");
    } else {
      setStatus("error");
      // The toast is already shown in the store action,
      // so we just reset the status here.
      setTimeout(() => setStatus("idle"), 3000);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === "ios" ? "padding" : "height"}
      className="w-[550px]"
    >
      <View className="rounded-2xl overflow-hidden bg-[#212121] border border-gray-700">
        <View className="p-4">
          <Text className="text-2xl text-white font-bold text-center mb-2">
            Manual Card Entry
          </Text>
          <ProgressBar progress={calculateProgress()} />
        </View>
        <ScrollView className="p-4 bg-[#303030] max-h-[70vh]">
          {/* Cardholder Name */}
          <View className="mb-4">
            <Text className="text-lg font-semibold text-gray-300 mb-2">
              Cardholder Name
            </Text>
            <TextInput
              value={cardholderName}
              onChangeText={setCardholderName}
              onBlur={() => handleBlur("cardholderName")}
              placeholder="John M. Doe"
              className={`w-full px-4 py-3 bg-[#212121] border ${
                errors.cardholderName ? "border-red-500" : "border-gray-600"
              } rounded-lg text-lg text-white`}
              placeholderTextColor="#6B7280"
            />
            {errors.cardholderName && (
              <Text className="text-red-400 mt-1">{errors.cardholderName}</Text>
            )}
          </View>
          {/* Card Number */}
          <View className="mb-4">
            <Text className="text-lg font-semibold text-gray-300 mb-2">
              Card Number
            </Text>
            <View className="flex-row items-center">
              <TextInput
                value={formatCardNumber(cardNumber)}
                onChangeText={(text) => setCardNumber(text.replace(/\s/g, ""))}
                onBlur={() => handleBlur("cardNumber")}
                placeholder="XXXX XXXX XXXX XXXX"
                keyboardType="numeric"
                maxLength={19}
                className={`flex-1 px-4 py-3 bg-[#212121] border ${
                  errors.cardNumber ? "border-red-500" : "border-gray-600"
                } rounded-lg text-lg text-white`}
                placeholderTextColor="#6B7280"
              />
              <View className="absolute right-3">
                <CardBrandIcon brand={cardInfo.cardType} />
              </View>
            </View>
            {errors.cardNumber && (
              <Text className="text-red-400 mt-1">{errors.cardNumber}</Text>
            )}
          </View>

          {/* Expiry Date and CVV */}
          <View className="flex-row justify-between mb-4">
            <View className="flex-1 mr-2">
              <Text className="text-lg font-semibold text-gray-300 mb-2">
                Expiry Date
              </Text>
              <View className="flex-row items-center">
                <TextInput
                  value={expiryMonth}
                  onChangeText={(text) => {
                    setExpiryMonth(text);
                    if (text.length === 2) {
                      expiryYearRef.current?.focus();
                    }
                  }}
                  onBlur={() => handleBlur("expiry")}
                  placeholder="MM"
                  keyboardType="numeric"
                  maxLength={2}
                  className={`w-1/2 px-4 py-3 bg-[#212121] border ${
                    errors.expiry ? "border-red-500" : "border-gray-600"
                  } rounded-l-lg text-lg text-white text-center`}
                  placeholderTextColor="#6B7280"
                />
                <TextInput
                  ref={expiryYearRef}
                  value={expiryYear}
                  onChangeText={setExpiryYear}
                  onBlur={() => handleBlur("expiry")}
                  placeholder="YY"
                  keyboardType="numeric"
                  maxLength={2}
                  className={`w-1/2 px-4 py-3 bg-[#212121] border ${
                    errors.expiry ? "border-red-500" : "border-gray-600"
                  } rounded-r-lg text-lg text-white text-center border-l-0`}
                  placeholderTextColor="#6B7280"
                />
              </View>
              {errors.expiry && (
                <Text className="text-red-400 mt-1">{errors.expiry}</Text>
              )}
            </View>
            <View className="w-2/5 ml-2">
              <Text className="text-lg font-semibold text-gray-300 mb-2">
                CVV
              </Text>
              <TextInput
                value={cvv}
                onChangeText={setCvv}
                onBlur={() => handleBlur("cvv")}
                placeholder="XXX"
                keyboardType="numeric"
                maxLength={cardInfo.cardType === "amex" ? 4 : 3}
                className={`w-full px-4 py-3 bg-[#212121] border ${
                  errors.cvv ? "border-red-500" : "border-gray-600"
                } rounded-lg text-lg text-white`}
                placeholderTextColor="#6B7280"
              />
              {errors.cvv && (
                <Text className="text-red-400 mt-1">{errors.cvv}</Text>
              )}
            </View>
          </View>

          {/* Zip Code */}
          <View className="mb-4">
            <Text className="text-lg font-semibold text-gray-300 mb-2">
              Zip Code
            </Text>
            <TextInput
              value={zipCode}
              onChangeText={setZipCode}
              onBlur={() => handleBlur("zipCode")}
              placeholder="XXXXX"
              keyboardType="numeric"
              maxLength={5}
              className={`w-full px-4 py-3 bg-[#212121] border ${
                errors.zipCode ? "border-red-500" : "border-gray-600"
              } rounded-lg text-lg text-white`}
              placeholderTextColor="#6B7280"
            />
            {errors.zipCode && (
              <Text className="text-red-400 mt-1">{errors.zipCode}</Text>
            )}
          </View>
          {/* Payment Summary */}
          <View className="flex-row justify-between pt-4 border-t border-dashed border-gray-600 my-4">
            <Text className="text-2xl font-bold text-white">Total</Text>
            <Text className="text-2xl font-bold text-white">
              ${activeOrderOutstandingTotal.toFixed(2)}
            </Text>
          </View>

          {/* Actions */}
          <View className="flex-row gap-4 border-t border-gray-700 pt-4 mb-4">
            <TouchableOpacity
              onPress={() => setView("cardOptions")}
              disabled={status === "processing"}
              className="flex-1 py-3 bg-[#303030] border border-gray-600 rounded-xl items-center flex-row justify-center"
            >
              <Ionicons
                name="arrow-back"
                size={24}
                color="white"
                className="mr-2"
              />
              <Text className="text-lg font-bold text-white text-center ml-2">
                Back
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleProcessPayment}
              disabled={status === "processing" || !checkFormValidity()}
              className={`flex-1 py-3 rounded-xl items-center flex-row justify-center ${
                status === "processing" || !checkFormValidity()
                  ? "bg-gray-500"
                  : "bg-blue-600"
              }`}
            >
              <Ionicons name="card" size={24} color="white" className="mr-2" />
              <Text className="text-lg font-bold text-white text-center ml-2">
                {status === "processing"
                  ? "Processing..."
                  : "Process Payment"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </View>
    </KeyboardAvoidingView>
  );
};
export default ManualCardEntryView;
