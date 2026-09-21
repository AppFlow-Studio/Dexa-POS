import { colors } from "@/lib/theme";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { PIN_LENGTH, type PinVerdict } from "../lib/managerPin";
import { type } from "../lib/type";
import { Keypad, PageHeader, StickyActionBar } from "../primitives";

/** `.dots`: one 16dp disc per digit, filled as they are typed. */
function Dots({ filled }: { filled: number }) {
  return (
    <View className="flex-row justify-center gap-4 pt-6" style={{ paddingBottom: 10 }}>
      {Array.from({ length: PIN_LENGTH }, (_, i) => (
        <View
          key={i}
          className="h-4 w-4 rounded-full"
          style={{ backgroundColor: i < filled ? colors.teal : colors.card }}
        />
      ))}
    </View>
  );
}

/**
 * S6's full-screen PIN overlay (not a route, so the caller keeps its state):
 * `.bar` header, a prompt line, the dots, the big keypad, Cancel. The rule is
 * the caller's — `verify` runs on the fourth digit, sync or async, and a
 * miss clears the dots and shows its message. ManagerPinScreen and
 * StaffPinScreen are the two rules.
 */
export function PinScreen<T>({
  title,
  subtitle,
  prompt,
  verify,
  onVerified,
  onCancel,
}: {
  title: string;
  /** "Void order #1045" — the `.bar` subtitle. */
  subtitle: string;
  /** The line above the dots while no error is showing. */
  prompt: string;
  verify: (pin: string) => PinVerdict<T> | Promise<PinVerdict<T>>;
  onVerified: (value: T) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [checking, setChecking] = useState(false);

  // Driven from the key press, not an effect on `pin`: an async verify must
  // run exactly once per fourth digit, and a re-render after success must
  // not call onVerified again.
  const submit = async (entered: string) => {
    setChecking(true);
    try {
      const verdict = await verify(entered);
      if (verdict.ok) {
        onVerified(verdict.value);
        return;
      }
      setError(verdict.message);
      setPin("");
    } finally {
      setChecking(false);
    }
  };

  const onKey = (k: string) => {
    if (checking || pin.length >= PIN_LENGTH) return;
    setError(null);
    const next = pin + k;
    setPin(next);
    if (next.length === PIN_LENGTH) void submit(next);
  };

  return (
    <View className="absolute inset-0" style={{ backgroundColor: colors.screen }}>
      <PageHeader title={title} subtitle={subtitle} onBack={onCancel} />
      <View className="flex-1">
        <Text className="px-7 pt-5 text-center" style={[type.sheetDesc, { color: error ? colors.danger : colors.label }]}>
          {error ?? (checking ? "Checking…" : prompt)}
        </Text>
        <Dots filled={pin.length} />
        <View className="flex-1" />
        <Keypad
          size="big"
          leftKey={null}
          onKey={onKey}
          onBackspace={() => {
            if (!checking) setPin((p) => p.slice(0, -1));
          }}
        />
      </View>
      <StickyActionBar column actions={[{ label: "Cancel", variant: "text", onPress: onCancel }]} />
    </View>
  );
}
