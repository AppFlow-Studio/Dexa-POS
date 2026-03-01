import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface GuestCountNumpadProps {
    onKeyPress: (value: string) => void;
}

const GuestCountNumpad: React.FC<GuestCountNumpadProps> = ({ onKeyPress }) => {
    const NumpadButton: React.FC<{
        value: string;
        onPress: () => void;
        isDestructive?: boolean;
    }> = ({ value, onPress, isDestructive }) => (
        <TouchableOpacity
            onPress={onPress}
            className={`flex-1 h-20 rounded-lg items-center justify-center ${isDestructive ? "bg-red-600" : "bg-surface border border-gray-600"
                }`}
        >
            <Text className="text-xl font-bold text-white">{value}</Text>
        </TouchableOpacity>
    );

    const handleInput = (value: string) => {
        // Clear all
        if (value === "clear") {
            onKeyPress("clear");
            return;
        }

        // Backspace behavior
        if (value === "backspace") {
            onKeyPress("backspace");
            return;
        }

        // Number input 0-9
        const isDigit = /^[0-9]$/.test(value);
        if (isDigit) {
            onKeyPress(value);
        }
    };

    const numpadButtons = [
        ["1", "2", "3"],
        ["4", "5", "6"],
        ["7", "8", "9"],
        ["clear", "0", "backspace"],
    ];

    return (
        <View className="gap-2">
            {numpadButtons.map((row, rowIndex) => (
                <View key={rowIndex} className="flex-row gap-2">
                    {row.map((btn) => (
                        <NumpadButton
                            key={btn}
                            value={btn === "backspace" ? "⌫" : btn === "clear" ? "C" : btn}
                            onPress={() => handleInput(btn)}
                            isDestructive={btn === "backspace"}
                        />
                    ))}
                </View>
            ))}
        </View>
    );
};

export default GuestCountNumpad;
