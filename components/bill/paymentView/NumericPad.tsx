import { colors } from "@/lib/theme";
import { Delete } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface NumericPadProps {
  onInput: (value: string) => void;
  onBackspace: () => void;
  enabled?: boolean;
}

const NumericPad: React.FC<NumericPadProps> = ({ onInput, onBackspace, enabled = true }) => {
  const buttons = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    [".", "0", "backspace"],
  ];

  const handlePress = (value: string) => {
    if (value === "backspace") {
      onBackspace();
    } else {
      onInput(value);
    }
  };

  return (
    <View style={{ gap: 8, padding: 14, backgroundColor: colors.panel, borderRadius: 12, borderWidth: 1, borderColor: colors.border }}>
      {buttons.map((row, rowIdx) => (
        <View key={rowIdx} style={{ flexDirection: "row", gap: 8 }}>
          {row.map((btn) => (
            <TouchableOpacity
              key={btn}
              onPress={() => handlePress(btn)}
              disabled={!enabled}
              style={{
                flex: 1,
                paddingVertical: 16,
                backgroundColor: !enabled
                  ? colors.screen + "80"
                  : btn === "backspace"
                    ? colors.danger + "15"
                    : colors.screen,
                borderWidth: 1,
                borderColor: !enabled
                  ? colors.border + "40"
                  : btn === "backspace"
                    ? colors.danger + "30"
                    : colors.border,
                borderRadius: 8,
                alignItems: "center",
                justifyContent: "center",
                opacity: enabled ? 1 : 0.5,
              }}
            >
              {btn === "backspace" ? (
                <Delete size={18} color={!enabled ? colors.muted : colors.danger} />
              ) : (
                <Text style={{ fontSize: 18, fontWeight: "700", color: !enabled ? colors.muted : colors.heading }}>
                  {btn}
                </Text>
              )}
            </TouchableOpacity>
          ))}
        </View>
      ))}
    </View>
  );
};

export default NumericPad;
