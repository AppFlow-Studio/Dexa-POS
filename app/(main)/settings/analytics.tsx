
import React from "react";
import { ScrollView, Text, View } from "react-native";

const AnalyticsScreen = () => {
    return (
        <View className="flex-1 bg-[#212121] p-6">
            <View className="mb-6">
                <Text className="text-3xl font-bold text-white">Real-Time Analytics</Text>
                <Text className="text-gray-400 mt-2">Configure dashboards and real-time alerts.</Text>
            </View>

            <View className="h-[1px] w-full bg-gray-700 mb-6" />

            <ScrollView>
                {/* Checklist items will be implemented here */}
            </ScrollView>
        </View>
    );
};

export default AnalyticsScreen;
