import { colors } from "@/lib/theme";
import React, { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { PIN_LENGTH, verifyManagerPin } from "../../lib/managerPin";
import { type } from "../../lib/type";
import { Keypad, PageHeader, StickyActionBar } from "../../primitives";

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
 * S6: a full-screen overlay (not a route, so the caller keeps its state)
 * that asks a manager for their PIN and reports who approved. Verification
 * is the register's rule in lib/managerPin.ts; a wrong PIN clears and says why.
 */
export function ManagerPinScreen({
  action,
  onApproved,
  onCancel,
}: {
  /** "Void order #1045" — the `.bar` subtitle. */
  action: string;
  onApproved: (managerName: string) => void;
  onCancel: () => void;
}) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (pin.length < PIN_LENGTH) return;
    const verdict = verifyManagerPin(pin);
    if (verdict.ok) {
      onApproved(verdict.name);
      return;
    }
    setError(verdict.message);
    setPin("");
  }, [pin, onApproved]);

  return (
    <View className="absolute inset-0" style={{ backgroundColor: colors.screen }}>
      <PageHeader title="Manager approval" subtitle={action} onBack={onCancel} />
      <View className="flex-1">
        <Text className="px-7 pt-5 text-center" style={[type.sheetDesc, { color: error ? colors.danger : colors.label }]}>
          {error ?? "Ask a manager to enter their PIN"}
        </Text>
        <Dots filled={pin.length} />
        <View className="flex-1" />
        <Keypad
          size="big"
          leftKey={null}
          onKey={(k) => {
            setError(null);
            setPin((p) => (p.length < PIN_LENGTH ? p + k : p));
          }}
          onBackspace={() => setPin((p) => p.slice(0, -1))}
        />
      </View>
      <StickyActionBar column actions={[{ label: "Cancel", variant: "text", onPress: onCancel }]} />
    </View>
  );
}
