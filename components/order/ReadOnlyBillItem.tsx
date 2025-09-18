import { CartItem } from "@/lib/types";
import { ChevronDown, ChevronUp } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface ReadOnlyBillItemProps {
    item: CartItem;
    expandedItemId?: string | null;
    onToggleExpand?: (itemId: string) => void;
}

const ReadOnlyBillItem: React.FC<ReadOnlyBillItemProps> = ({
    item,
    expandedItemId,
    onToggleExpand,
}) => {
    const isExpanded = expandedItemId === item.id;

    const handleItemPress = () => {
        if (onToggleExpand) {
            onToggleExpand(item.id);
        }
    };

    // Check if item has any modifiers to show
    const hasModifiers =
        (item.customizations.modifiers &&
            item.customizations.modifiers.length > 0) ||
        item.customizations.notes;

    return (
        <View className="rounded-xl overflow-hidden bg-[#303030] border border-gray-600">
            <TouchableOpacity onPress={handleItemPress} activeOpacity={0.9}>
                <View className="flex-row items-center p-3">
                    <View className="flex-1">
                        <View className="flex-row items-center">
                            <Text className="font-semibold text-2xl text-white">
                                {item.name}
                            </Text>
                        </View>
                        <View className="flex-row items-center mt-1">
                            <Text className="text-xl text-gray-300">x {item.quantity}</Text>

                            {hasModifiers && (
                                <TouchableOpacity className="flex-row items-center ml-3 px-3 py-1 bg-gray-700 border border-gray-500 rounded-3xl">
                                    <Text className="text-lg font-semibold text-gray-300 mr-1">
                                        Details
                                    </Text>

                                    {isExpanded ? (
                                        <ChevronUp color="#9CA3AF" size={16} />
                                    ) : (
                                        <ChevronDown color="#9CA3AF" size={16} />
                                    )}
                                </TouchableOpacity>
                            )}
                        </View>
                    </View>
                    <Text className="font-semibold text-2xl text-white">
                        ${(item.price * item.quantity).toFixed(2)}
                    </Text>
                </View>
            </TouchableOpacity>

            {/* Modifiers Dropdown - Only show if expanded and has modifiers */}
            {hasModifiers && isExpanded && (
                <View className="overflow-hidden">
                    <View className="px-3 pb-3 bg-[#212121] border-t border-gray-600">
                        {/* Modifiers */}
                        {item.customizations.modifiers &&
                            item.customizations.modifiers.length > 0 && (
                                <View className="py-2">
                                    {item.customizations.modifiers.map((modifier, index) => (
                                        <View key={index} className="">
                                            {modifier.options.length > 0 && (
                                                <View
                                                    key={index}
                                                    className="flex flex-row flex-wrap items-center mb-1"
                                                >
                                                    <Text className="text-xl font-medium text-gray-300">
                                                        {modifier.categoryName}:
                                                    </Text>
                                                    {modifier.options.map((option, optionIndex) => {
                                                        return (
                                                            <View
                                                                key={optionIndex}
                                                                className="flex-row justify-between items-center ml-1"
                                                            >
                                                                <Text className="text-xl text-gray-200">
                                                                    {option.name}
                                                                    {optionIndex <
                                                                        modifier.options.length - 1 && " • "}
                                                                </Text>
                                                                {option.price > 0 && (
                                                                    <Text className="text-xl font-medium ml-1 text-green-400">
                                                                        +${option.price.toFixed(2)}{" "}
                                                                        {optionIndex <
                                                                            modifier.options.length - 1 && ","}
                                                                    </Text>
                                                                )}
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                            )}
                                        </View>
                                    ))}
                                </View>
                            )}

                        {/* Notes */}
                        {item.customizations.notes && (
                            <View className="py-2">
                                <Text className="text-xl text-gray-300 mb-1">Notes:</Text>
                                <Text className="text-xl text-gray-200 ml-2 italic">
                                    {item.customizations.notes}
                                </Text>
                            </View>
                        )}
                    </View>
                </View>
            )}
            <View className="h-[1px] bg-gray-600 w-[90%] self-center mt-1" />
        </View>
    );
};

export default ReadOnlyBillItem;
