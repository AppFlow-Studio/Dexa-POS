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
    className="w-40 h-20 bg-[#212121] border-gray-700 rounded-xl items-center justify-center"
  >
    {typeof value === "string" ? (
      <Text className="text-3xl font-bold text-white">{value}</Text>
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
    { icon: <X color="white" size={24} />, action: "clear" },
    "0",
    {
      icon: <Delete color="white" size={24} />,
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
