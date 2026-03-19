import { colors } from "@/lib/theme";
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
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        height: 64,
        backgroundColor: colors.screen,
        borderWidth: 1,
        borderColor: colors.border,
        borderRadius: 10,
        marginBottom: 12,
      }}
    >
      {Array.from({ length: maxLength }).map((_, index) => (
        <View
          key={index}
          style={{
            width: index < pinLength ? 14 : 10,
            height: index < pinLength ? 14 : 10,
            borderRadius: 999,
            backgroundColor: index < pinLength ? colors.teal : colors.border,
          }}
        />
      ))}
    </View>
  );
};

export default PinDisplay;
