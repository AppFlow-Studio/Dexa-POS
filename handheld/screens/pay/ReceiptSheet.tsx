import React, { useState } from "react";
import { View } from "react-native";
import { BottomSheet, StickyActionBar } from "../../primitives";
import { CustomerField } from "../neworder/CustomerField";

const COPY = {
  text: { title: "Text a receipt", label: "Phone", placeholder: "(555) 123-4567", keyboard: "phone-pad" },
  email: { title: "Email a receipt", label: "Email", placeholder: "guest@example.com", keyboard: "email-address" },
} as const;

/** Enough to try: ten digits for a phone, a local part and a dotted domain for an email. */
function looksValid(channel: "text" | "email", value: string): boolean {
  const v = value.trim();
  if (channel === "text") return v.replace(/\D/g, "").length >= 10;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

/**
 * Where to send a text or email receipt, prefilled from the check's customer
 * when it has one. Sending is the caller's; this sheet only collects the
 * address.
 */
export function ReceiptSheet({
  channel,
  initial,
  subtitle,
  busy,
  onSend,
  onClose,
}: {
  channel: "text" | "email";
  initial: string;
  subtitle: string;
  busy: boolean;
  onSend: (to: string) => void;
  onClose: () => void;
}) {
  const copy = COPY[channel];
  const [value, setValue] = useState(initial);
  const valid = looksValid(channel, value);
  return (
    <BottomSheet
      visible
      onClose={onClose}
      title={copy.title}
      subtitle={subtitle}
      footer={
        <StickyActionBar
          actions={[{ label: busy ? "Sending…" : "Send", disabled: !valid || busy, onPress: () => onSend(value.trim()) }]}
        />
      }
    >
      <View className="pb-3 pt-1">
        <CustomerField
          label={copy.label}
          value={value}
          onChange={setValue}
          placeholder={copy.placeholder}
          keyboardType={copy.keyboard}
          onSheet
        />
      </View>
    </BottomSheet>
  );
}
