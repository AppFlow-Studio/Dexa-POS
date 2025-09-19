import { HelpCircle } from "lucide-react-native";
import React, { useState } from "react";
import { Modal, Text, TouchableOpacity, View } from "react-native";

interface KpiTooltipProps {
    definition: string;
}

const KpiTooltip: React.FC<KpiTooltipProps> = ({ definition }) => {
    const [showTooltip, setShowTooltip] = useState(false);

    return (
        <>
            <TouchableOpacity
                onPress={() => setShowTooltip(true)}
                className="ml-2"
                activeOpacity={0.7}
            >
                <HelpCircle color="#6b7280" size={16} />
            </TouchableOpacity>

            <Modal
                visible={showTooltip}
                transparent
                animationType="fade"
                onRequestClose={() => setShowTooltip(false)}
            >
                <TouchableOpacity
                    className="flex-1 bg-black/50 items-center justify-center p-6"
                    activeOpacity={1}
                    onPress={() => setShowTooltip(false)}
                >
                    <View className="bg-[#303030] rounded-2xl p-6 max-w-sm border border-gray-600">
                        <View className="flex-row items-center mb-3">
                            <HelpCircle color="#60A5FA" size={20} />
                            <Text className="text-white font-semibold ml-2">Definition</Text>
                        </View>
                        <Text className="text-gray-300 text-base leading-6">
                            {definition}
                        </Text>
                        <TouchableOpacity
                            onPress={() => setShowTooltip(false)}
                            className="mt-4 bg-blue-600 py-3 rounded-xl items-center"
                        >
                            <Text className="text-white font-semibold">Got it</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </>
    );
};

export default KpiTooltip;
