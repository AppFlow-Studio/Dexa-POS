import { useToast } from "@/contexts/ToastContext";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { colors } from "@/lib/theme";
import {
  isValidEmail,
  isValidPhone,
  sendReceipt,
  type SendReceiptDeliveryMethod,
} from "@/services/messaging/sendReceiptService";
import { Mail, MessageSquare, X } from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

interface SendReceiptSheetProps {
  isOpen: boolean;
  onClose: () => void;
  dbOrderId: string | null | undefined;
  defaultMethod?: SendReceiptDeliveryMethod;
  defaultEmail?: string | null;
  defaultPhone?: string | null;
}

const SendReceiptSheet: React.FC<SendReceiptSheetProps> = ({
  isOpen,
  onClose,
  dbOrderId,
  defaultMethod = "email",
  defaultEmail,
  defaultPhone,
}) => {
  const { show } = useToast();
  const client = useSupabaseClient();

  const [method, setMethod] = useState<SendReceiptDeliveryMethod>(defaultMethod);
  const [email, setEmail] = useState("");
  const [phoneDigits, setPhoneDigits] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setMethod(defaultMethod);
    setEmail(sanitizeEmail(defaultEmail ?? ""));
    setPhoneDigits(extractDigits(defaultPhone ?? "").slice(0, 10));
    setErrorMessage(null);
  }, [isOpen, defaultMethod, defaultEmail, defaultPhone]);

  const phoneFormatted = formatPhone(phoneDigits);
  const recipient = method === "email" ? email : phoneDigits;
  const isValid = useMemo(() => {
    if (method === "email") return isValidEmail(email);
    return isValidPhone(phoneDigits);
  }, [method, email, phoneDigits]);

  const canSend = !submitting && !!dbOrderId && isValid;

  const handleSend = async () => {
    if (!dbOrderId) {
      setErrorMessage("Order has not been synced yet. Please try again in a moment.");
      return;
    }
    if (!isValid) {
      setErrorMessage(
        method === "email"
          ? "Enter a valid email address."
          : "Enter a valid phone number."
      );
      return;
    }

    setSubmitting(true);
    setErrorMessage(null);
    const result = await sendReceipt({
      client,
      dbOrderId,
      deliveryMethod: method,
      recipient,
    });
    setSubmitting(false);

    if (result.success) {
      show({
        title: method === "email" ? "Email Sent" : "Text Sent",
        message: result.message,
        type: "success",
      });
      onClose();
    } else {
      setErrorMessage(result.message);
    }
  };

  const TabButton = ({
    value,
    label,
    icon,
  }: {
    value: SendReceiptDeliveryMethod;
    label: string;
    icon: React.ReactNode;
  }) => {
    const active = method === value;
    return (
      <TouchableOpacity
        onPress={() => {
          setMethod(value);
          setErrorMessage(null);
        }}
        style={{
          flex: 1,
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          paddingVertical: 10,
          borderRadius: 8,
          borderWidth: 1,
          borderColor: active ? colors.teal : colors.border,
          backgroundColor: active ? colors.teal + "15" : "transparent",
        }}
        disabled={submitting}
      >
        {icon}
        <Text
          style={{
            fontWeight: "600",
            fontSize: 13,
            color: active ? colors.teal : colors.label,
          }}
        >
          {label}
        </Text>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={isOpen}
      transparent
      animationType="fade"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        onPress={onClose}
        style={{
          flex: 1,
          backgroundColor: "rgba(0,0,0,0.5)",
          alignItems: "center",
          justifyContent: "center",
          padding: 20,
        }}
      >
        <Pressable
          onPress={(e) => e.stopPropagation()}
          style={{
            padding: 18,
            borderRadius: 16,
            backgroundColor: colors.panel,
            borderWidth: 1,
            borderColor: colors.border,
            width: 460,
            maxWidth: "100%",
          }}
        >
          <View style={{ gap: 14 }}>
            <View style={{ flexDirection: "row", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 16, fontWeight: "700", color: colors.heading }}>
                  Send Receipt
                </Text>
                <Text style={{ marginTop: 4, fontSize: 13, color: colors.label }}>
                  Choose how to send a copy of this receipt to the customer.
                </Text>
              </View>
              <TouchableOpacity
                onPress={onClose}
                disabled={submitting}
                style={{ padding: 4 }}
              >
                <X size={18} color={colors.label} />
              </TouchableOpacity>
            </View>

          <View style={{ flexDirection: "row", gap: 8 }}>
            <TabButton
              value="email"
              label="Email"
              icon={
                <Mail
                  size={14}
                  color={method === "email" ? colors.teal : colors.label}
                />
              }
            />
            <TabButton
              value="sms"
              label="Text"
              icon={
                <MessageSquare
                  size={14}
                  color={method === "sms" ? colors.teal : colors.label}
                />
              }
            />
          </View>

          {method === "email" ? (
            <View>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: colors.label,
                  marginBottom: 6,
                }}
              >
                Email address
              </Text>
              <TextInput
                value={email}
                onChangeText={(t) => {
                  setEmail(sanitizeEmail(t));
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="customer@example.com"
                placeholderTextColor={colors.muted}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                editable={!submitting}
                maxLength={254}
                style={{
                  borderWidth: 1.5,
                  borderColor: email && !isValidEmail(email) ? colors.danger + "60" : colors.border,
                  borderRadius: 4,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 16,
                  fontWeight: "500",
                  letterSpacing: 0.2,
                  color: colors.heading,
                  backgroundColor: colors.card,
                }}
              />
            </View>
          ) : (
            <View>
              <Text
                style={{
                  fontSize: 12,
                  fontWeight: "600",
                  color: colors.label,
                  marginBottom: 6,
                }}
              >
                Phone number
              </Text>
              <TextInput
                value={phoneFormatted}
                onChangeText={(t) => {
                  setPhoneDigits(extractDigits(t).slice(0, 10));
                  if (errorMessage) setErrorMessage(null);
                }}
                placeholder="(555) 123-4567"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                inputMode="numeric"
                editable={!submitting}
                maxLength={14}
                style={{
                  borderWidth: 1.5,
                  borderColor:
                    phoneDigits && !isValidPhone(phoneDigits)
                      ? colors.danger + "60"
                      : colors.border,
                  borderRadius: 4,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  fontSize: 18,
                  fontWeight: "600",
                  letterSpacing: 1,
                  fontVariant: ["tabular-nums"],
                  color: colors.heading,
                  backgroundColor: colors.card,
                }}
              />
              <Text
                style={{
                  marginTop: 6,
                  fontSize: 11,
                  color: colors.muted,
                }}
              >
                {phoneDigits.length}/10 digits · US numbers only
              </Text>
            </View>
          )}

          {errorMessage ? (
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderRadius: 8,
                backgroundColor: colors.danger + "10",
                borderWidth: 1,
                borderColor: colors.danger + "30",
              }}
            >
              <Text style={{ color: colors.danger, fontSize: 12 }}>
                {errorMessage}
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: "row", gap: 10, marginTop: 4 }}>
            <TouchableOpacity
              onPress={onClose}
              disabled={submitting}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 8,
                opacity: submitting ? 0.5 : 1,
              }}
            >
              <Text
                style={{
                  fontWeight: "600",
                  fontSize: 13,
                  color: colors.label,
                  textAlign: "center",
                }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSend}
              disabled={!canSend}
              style={{
                flex: 1,
                paddingVertical: 10,
                borderRadius: 8,
                backgroundColor: colors.teal,
                opacity: canSend ? 1 : 0.5,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
              }}
            >
              {submitting ? (
                <ActivityIndicator size="small" color={colors.onSolid} />
              ) : null}
              <Text
                style={{
                  fontWeight: "700",
                  fontSize: 13,
                  color: colors.onSolid,
                }}
              >
                {submitting ? "Sending..." : "Send"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
};

function extractDigits(value: string): string {
  return value.replace(/\D+/g, "");
}

function formatPhone(digits: string): string {
  const d = digits.slice(0, 10);
  if (d.length === 0) return "";
  if (d.length < 4) return `(${d}`;
  if (d.length < 7) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

function sanitizeEmail(value: string): string {
  return value.replace(/\s+/g, "").toLowerCase();
}

export default SendReceiptSheet;
