// components/analytics/KpiTooltip.tsx

import { colors } from "@/lib/theme";
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
                <HelpCircle color={colors.label} size={14} />
            </TouchableOpacity>

            <Modal
                visible={isVisible}
                transparent
                animationType="fade"
                onRequestClose={() => setIsVisible(false)}
            >
                <View className="flex-1 bg-black/50 items-center justify-center p-6">
                    <View
                        style={{
                            backgroundColor: colors.panel,
                            borderRadius: 12,
                            borderWidth: 1,
                            borderColor: colors.border,
                            padding: 14,
                            maxWidth: 320
                        }}
                    >
                        <View className="flex-row items-center justify-between mb-3">
                            <Text style={{ fontSize: 13, fontWeight: '600', color: colors.heading }}>Definition</Text>
                            <TouchableOpacity
                                onPress={() => setIsVisible(false)}
                                style={{ padding: 2 }}
                            >
                                <X color={colors.label} size={16} />
                            </TouchableOpacity>
                        </View>

                        <Text style={{ fontSize: 12, color: colors.label, lineHeight: 18 }}>
                            {definition}
                        </Text>
                    </View>
                </View>
            </Modal>
        </>
    );
}
