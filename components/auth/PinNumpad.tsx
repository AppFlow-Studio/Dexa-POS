import { Delete, X } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";
// Define the types of actions the numpad can perform
export type NumpadAction = "clear" | "backspace";
export type NumpadInput = number | NumpadAction;

interface PinNumpadProps {
  onKeyPress: (input: NumpadInput) => void;
}

const PinButton = ({
  value,
  onPress,
}: {
  value: React.ReactNode;
  onPress: () => void;
}) => (
  <TouchableOpacity
    onPress={onPress}
    className="w-40 h-20 bg-white border border-neutral-200 rounded-xl items-center justify-center"
  >
    {typeof value === "string" ? (
      <Text className="text-base font-bold text-accent-500">{value}</Text>
    ) : (
      value
    )}
  </TouchableOpacity>
);

const PinNumpad: React.FC<PinNumpadProps> = ({ onKeyPress }) => {
  // We now call onKeyPress directly without the haptic feedback
  const handlePress = (input: NumpadInput) => {
    onKeyPress(input);
  };

  // Define the layout of the numpad buttons
  const numpadLayout = [
    "1",
    "2",
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "9",
    { icon: <X className="text-accent-500" size={21} />, action: "clear" },
    "0",
    {
      icon: <Delete className="text-accent-500" size={21} />,
      action: "backspace",
    },
  ];

  return (
    <View className="flex-row flex-wrap justify-center gap-5">
      {numpadLayout.map((item, index) => {
        if (typeof item === "string") {
          return (
            <PinButton
              key={index}
              value={item}
              onPress={() => handlePress(parseInt(item, 10))}
            />
          );
        }
        return (
          <PinButton
            key={index}
            value={item.icon}
            onPress={() => handlePress(item.action as NumpadAction)}
          />
        );
      })}
    </View>
  );
};

export default PinNumpad;
