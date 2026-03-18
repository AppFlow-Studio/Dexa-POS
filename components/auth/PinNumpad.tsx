import { colors } from "@/lib/theme";
import { Delete, X } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

export type NumpadAction = "clear" | "backspace";
export type NumpadInput = number | NumpadAction;

interface PinNumpadProps {
  onKeyPress: (input: NumpadInput) => void;
}

const PinButton = ({
  value,
  onPress,
  isAction,
}: {
  value: React.ReactNode;
  onPress: () => void;
  isAction?: boolean;
}) => (
  <TouchableOpacity
    onPress={onPress}
    activeOpacity={0.7}
    style={{
      width: 112,
      height: 56,
      backgroundColor: isAction ? colors.screen : colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      alignItems: "center",
      justifyContent: "center",
    }}
  >
    {typeof value === "string" ? (
      <Text style={{ fontSize: 20, fontWeight: "700", color: colors.heading }}>
        {value}
      </Text>
    ) : (
      value
    )}
  </TouchableOpacity>
);

const PinNumpad: React.FC<PinNumpadProps> = ({ onKeyPress }) => {
  const numpadLayout = [
    "1", "2", "3",
    "4", "5", "6",
    "7", "8", "9",
    { icon: <X color={colors.muted} size={18} />, action: "clear" },
    "0",
    { icon: <Delete color={colors.label} size={18} />, action: "backspace" },
  ];

  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: 10, maxWidth: 370, alignSelf: "center" }}>
      {numpadLayout.map((item, index) => {
        if (typeof item === "string") {
          return (
            <PinButton
              key={index}
              value={item}
              onPress={() => onKeyPress(parseInt(item, 10))}
            />
          );
        }
        return (
          <PinButton
            key={index}
            value={item.icon}
            isAction
            onPress={() => onKeyPress(item.action as NumpadAction)}
          />
        );
      })}
    </View>
  );
};

export default PinNumpad;
