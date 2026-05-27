import PinNumpad, { NumpadInput } from "@/components/auth/PinNumpad";
import { KioskButton } from "@/components/kiosk/shared/KioskButton";
import { useKioskTheme } from "@/contexts/kiosk/KioskThemeProvider";
import React from "react";
import { Text, View } from "react-native";

export function KeypadEntry({
  title,
  value,
  maxLength,
  onChange,
  onContinue,
  onSkip,
}: {
  title: string;
  value: string;
  maxLength: number;
  onChange: (value: string) => void;
  onContinue: () => void;
  onSkip: () => void;
}) {
  const theme = useKioskTheme();
  const handleKey = (input: NumpadInput) => {
    if (input === "clear") {
      onChange("");
      return;
    }
    if (input === "backspace") {
      onChange(value.slice(0, -1));
      return;
    }
    if (typeof input === "number" && value.length < maxLength) {
      onChange(`${value}${input}`);
    }
  };

  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 24, gap: 18 }}>
      <Text style={{ color: theme.textColor, fontSize: 28, fontWeight: "900", textAlign: "center" }}>{title}</Text>
      <View style={{ minHeight: 58, minWidth: 280, borderRadius: 8, borderWidth: 1, borderColor: `${theme.textColor}22`, alignItems: "center", justifyContent: "center" }}>
        <Text style={{ color: theme.textColor, fontSize: 24, fontWeight: "800" }}>{value || " "}</Text>
      </View>
      <PinNumpad onKeyPress={handleKey} />
      <View style={{ flexDirection: "row", gap: 12 }}>
        <KioskButton label="Skip" variant="secondary" onPress={onSkip} />
        <KioskButton label="Continue" onPress={onContinue} />
      </View>
    </View>
  );
}
