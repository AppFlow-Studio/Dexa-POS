import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import {
  NotifyContext,
  TemplateKey,
  describeContext,
  getTemplatesForContext,
  renderTemplate,
} from "@/lib/notifyTemplates";
import { Bell, MessageSquare, Phone, Send, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";

export interface NotifyResult {
  success: boolean;
  sms?: boolean;
  error?: string;
  message?: string;
  reason?: string;
}

interface NotifyCustomerModalProps {
  visible: boolean;
  onClose: () => void;
  context: NotifyContext;
  recipient: { phone?: string | null; partyName: string; storeName: string };
  onSend: (message: string, templateKey: TemplateKey) => Promise<NotifyResult>;
}

function formatPhone(phone?: string | null): string {
  if (!phone) return "No phone on file";
  const digits = phone.replace(/\D/g, "");
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  if (digits.length === 11 && digits[0] === "1") {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }
  return phone;
}

export const NotifyCustomerModal: React.FC<NotifyCustomerModalProps> = ({
  visible,
  onClose,
  context,
  recipient,
  onSend,
}) => {
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)

  const templates = useMemo(
    () => getTemplatesForContext(context),
    [context],
  );

  const defaultKey = templates[0]?.key ?? "custom";

  const [selectedKey, setSelectedKey] = useState<TemplateKey>(defaultKey);
  const [message, setMessage] = useState<string>("");
  const [isSending, setIsSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelectedKey(defaultKey);
    setMessage(renderTemplate(defaultKey, context));
    setError(null);
    setIsSending(false);
  }, [visible, defaultKey, context]);

  const handleSelectTemplate = useCallback(
    (key: TemplateKey) => {
      setSelectedKey(key);
      if (key === "custom") {
        setMessage("");
      } else {
        setMessage(renderTemplate(key, context));
      }
    },
    [context],
  );

  const trimmedMessage = message.trim();
  const hasPhone = !!recipient.phone && recipient.phone.replace(/\D/g, "").length > 0;
  const canSend = hasPhone && trimmedMessage.length > 0 && !isSending;

  const handleSend = useCallback(async () => {
    if (!canSend) return;
    setIsSending(true);
    setError(null);
    try {
      const result = await onSend(trimmedMessage, selectedKey);
      if (result.success) {
        onClose();
      } else {
        setError(result.message || result.error || "Could not send SMS");
      }
    } catch (err: any) {
      setError(err?.message || "Unexpected error sending SMS");
    } finally {
      setIsSending(false);
    }
  }, [canSend, trimmedMessage, selectedKey, onSend, onClose]);

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: "rgba(0,0,0,0.6)",
        }}
      >
        <Pressable
          onPress={() => {}}
          style={{
            width: s(520),
            maxHeight: "92%",
            backgroundColor: colors.panel,
            borderRadius: s(16),
            borderWidth: 1,
            borderColor: colors.border,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: 0, height: s(8) },
            shadowOpacity: 0.4,
            shadowRadius: s(24),
            elevation: 20,
          }}
        >
          {/* Header */}
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
              paddingHorizontal: s(16),
              paddingVertical: s(13),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <View style={{ flexDirection: "row", alignItems: "center", gap: s(10) }}>
              <View
                style={{
                  width: s(32),
                  height: s(32),
                  borderRadius: s(8),
                  backgroundColor: colors.teal + "20",
                  borderWidth: 1,
                  borderColor: colors.teal + "50",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Bell size={s(16)} color={colors.teal} />
              </View>
              <View>
                <Text
                  style={{
                    color: colors.heading,
                    fontSize: s(14),
                    fontWeight: "700",
                  }}
                >
                  Notify {recipient.partyName}
                </Text>
                <Text style={{ color: colors.muted, fontSize: s(11), marginTop: s(2) }}>
                  {describeContext(context)}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              disabled={isSending}
              style={{
                padding: s(6),
                borderRadius: s(8),
                backgroundColor: colors.screen,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: isSending ? 0.5 : 1,
              }}
            >
              <X size={s(14)} color={colors.label} />
            </TouchableOpacity>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ padding: s(16), gap: s(14) }}
          >
            {/* Phone chip */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: s(10),
                paddingHorizontal: s(12),
                paddingVertical: s(10),
                borderRadius: s(10),
                borderWidth: 1,
                borderColor: hasPhone
                  ? colors.success + "40"
                  : colors.warning + "40",
                backgroundColor: hasPhone
                  ? colors.success + "10"
                  : colors.warning + "10",
              }}
            >
              <Phone
                size={s(14)}
                color={hasPhone ? colors.success : colors.warning}
              />
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    color: colors.heading,
                    fontSize: s(13),
                    fontWeight: "700",
                  }}
                >
                  {formatPhone(recipient.phone)}
                </Text>
                <Text style={{ color: colors.muted, fontSize: s(11), marginTop: s(2) }}>
                  {hasPhone
                    ? "SMS will be sent to this number"
                    : "Send disabled — please notify guest verbally"}
                </Text>
              </View>
            </View>

            {/* Template chips */}
            <View>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: s(9),
                  fontWeight: "700",
                  textTransform: "uppercase",
                  letterSpacing: 0.8,
                  marginBottom: s(8),
                }}
              >
                Quick Templates
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: s(8) }}>
                {templates.map((t) => {
                  const isSelected = t.key === selectedKey;
                  return (
                    <TouchableOpacity
                      key={t.key}
                      onPress={() => handleSelectTemplate(t.key)}
                      style={{
                        paddingHorizontal: s(12),
                        paddingVertical: s(8),
                        borderRadius: s(20),
                        borderWidth: 1,
                        borderColor: isSelected
                          ? colors.teal
                          : colors.border,
                        backgroundColor: isSelected
                          ? colors.teal + "20"
                          : colors.card,
                      }}
                    >
                      <Text
                        style={{
                          color: isSelected ? colors.teal : colors.label,
                          fontSize: s(12),
                          fontWeight: isSelected ? "700" : "600",
                        }}
                      >
                        {t.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>

            {/* Message textarea */}
            <View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(6),
                  marginBottom: s(6),
                }}
              >
                <MessageSquare size={s(11)} color={colors.muted} />
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: s(9),
                    fontWeight: "700",
                    textTransform: "uppercase",
                    letterSpacing: 0.8,
                  }}
                >
                  Message
                </Text>
                <Text
                  style={{
                    color: colors.muted,
                    fontSize: s(10),
                    marginLeft: "auto",
                  }}
                >
                  {trimmedMessage.length}/320
                </Text>
              </View>
              <TextInput
                value={message}
                onChangeText={setMessage}
                placeholder="Type a message to send..."
                placeholderTextColor={colors.muted}
                multiline
                maxLength={320}
                style={{
                  backgroundColor: colors.screen,
                  borderRadius: s(10),
                  borderWidth: 1,
                  borderColor: colors.border,
                  paddingHorizontal: s(12),
                  paddingVertical: s(10),
                  fontSize: s(13),
                  color: colors.heading,
                  minHeight: s(110),
                  textAlignVertical: "top",
                }}
              />
            </View>

            {error && (
              <View
                style={{
                  padding: s(10),
                  borderRadius: s(8),
                  backgroundColor: colors.danger + "12",
                  borderWidth: 1,
                  borderColor: colors.danger + "40",
                }}
              >
                <Text style={{ color: colors.danger, fontSize: s(12) }}>{error}</Text>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View
            style={{
              flexDirection: "row",
              gap: s(10),
              paddingHorizontal: s(16),
              paddingVertical: s(12),
              borderTopWidth: 1,
              borderTopColor: colors.border,
              backgroundColor: colors.card,
            }}
          >
            <TouchableOpacity
              onPress={onClose}
              disabled={isSending}
              style={{
                flex: 1,
                paddingVertical: s(11),
                borderRadius: s(9),
                alignItems: "center",
                borderWidth: 1,
                borderColor: colors.border,
                backgroundColor: colors.screen,
                opacity: isSending ? 0.5 : 1,
              }}
            >
              <Text
                style={{ color: colors.label, fontWeight: "600", fontSize: s(13) }}
              >
                Cancel
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleSend}
              disabled={!canSend}
              style={{
                flex: 2,
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                gap: s(6),
                paddingVertical: s(11),
                borderRadius: s(9),
                backgroundColor: canSend ? colors.teal + "25" : colors.card,
                borderWidth: 1,
                borderColor: canSend ? colors.teal + "60" : colors.border,
                opacity: canSend ? 1 : 0.6,
              }}
            >
              {isSending ? (
                <ActivityIndicator color={colors.teal} size="small" />
              ) : (
                <>
                  <Send size={s(13)} color={canSend ? colors.teal : colors.muted} />
                  <Text
                    style={{
                      color: canSend ? colors.teal : colors.muted,
                      fontWeight: "800",
                      fontSize: s(13),
                      letterSpacing: 0.3,
                    }}
                  >
                    Send SMS
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </View>
        </Pressable>
      </KeyboardAvoidingView>
    </Modal>
  );
};

export default NotifyCustomerModal;