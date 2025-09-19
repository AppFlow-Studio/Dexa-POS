// components/analytics/KpiTooltip.tsx

import { HelpCircle, X } from 'lucide-react-native';
import React, { useState } from 'react';
import { Modal, Text, TouchableOpacity, View } from 'react-native';

interface KpiTooltipProps {
    definition: string;
}

export default function KpiTooltip({ definition }: KpiTooltipProps) {
    const [isVisible, setIsVisible] = useState(false);

    return (
        <>
            <TouchableOpacity
                onPress={() => setIsVisible(true)}
                className="ml-2"
            >
                <HelpCircle color="#9CA3AF" size={16} />
            </TouchableOpacity>

            <Modal
                visible={isVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setIsVisible(false)}
            >
                <View className="flex-1 bg-black/50 items-center justify-center p-6">
                    <View className="bg-[#303030] rounded-2xl border border-gray-600 p-6 max-w-sm">
                        <View className="flex-row items-center justify-between mb-4">
                            <Text className="text-white text-lg font-semibold">Definition</Text>
                            <TouchableOpacity
                                onPress={() => setIsVisible(false)}
                                className="p-1"
                            >
                                <X color="#9CA3AF" size={20} />
                            </TouchableOpacity>
                        </View>

                        <Text className="text-gray-300 text-sm leading-5">
                            {definition}
                        </Text>
                    </View>
                </View>
            </Modal>
        </>
    );
}