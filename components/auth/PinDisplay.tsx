import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import React from "react";
import { View } from "react-native";

interface PinDisplayProps {
  pinLength: number;
  maxLength?: number;
}

const PinDisplay: React.FC<PinDisplayProps> = ({
  pinLength,
  maxLength = 6,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: s(16),
        height: s(64),
        backgroundColor: colors.screen,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: s(10),
        marginBottom: s(12),
      }}
    >
      {Array.from({ length: maxLength }).map((_, index) => (
        <View
          key={index}
          style={{
            width: index < pinLength ? s(14) : s(10),
            height: index < pinLength ? s(14) : s(10),
            borderRadius: 999,
            backgroundColor: index < pinLength ? colors.teal : colors.border,
          }}
        />
      ))}
    </View>
  );
};

export default PinDisplay;
