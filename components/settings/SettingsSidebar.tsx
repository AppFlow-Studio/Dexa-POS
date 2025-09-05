import { useRouter } from "expo-router";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface SettingsSubsection {
    id: string;
    title: string;
    subtitle: string;
    route: string;
    icon: React.ReactNode;
    isLocked?: boolean;
}

interface SettingsSidebarProps {
    title: string;
    subsections: SettingsSubsection[];
    currentRoute: string;
    onLockedAccess?: (route: string) => void;
}

const SettingsSidebar: React.FC<SettingsSidebarProps> = ({
    title,
    subsections,
    currentRoute,
    onLockedAccess,
}) => {
    const router = useRouter();

    const handleNavigation = (route: string, isLocked?: boolean) => {
        if (isLocked && onLockedAccess) {
            onLockedAccess(route);
        } else {
            router.push(route as any);
        }
    };

    return (
        <View className="w-80 bg-white rounded-2xl border border-gray-200 p-4 h-fit">
            <Text className="text-lg font-bold text-gray-800 mb-4">{title}</Text>
            <View className="gap-y-2">
                {subsections.map((subsection) => {
                    const isActive = currentRoute.includes(subsection.id);
                    return (
                        <TouchableOpacity
                            key={subsection.id}
                            onPress={() => handleNavigation(subsection.route, subsection.isLocked)}
                            className={`p-3 rounded-xl border ${isActive
                                ? "bg-primary-50 border-primary-200"
                                : "bg-gray-50 border-gray-200"
                                }`}
                        >
                            <View className="flex-row items-center">
                                <View className="mr-3">
                                    {subsection.icon}
                                </View>
                                <View className="flex-1">
                                    <Text
                                        className={`font-semibold ${isActive ? "text-primary-600" : "text-gray-800"
                                            }`}
                                    >
                                        {subsection.title}
                                    </Text>
                                    <Text
                                        className={`text-sm ${isActive ? "text-primary-500" : "text-gray-500"
                                            }`}
                                    >
                                        {subsection.subtitle}
                                    </Text>
                                </View>
                                {subsection.isLocked && (
                                    <View className="ml-2">
                                        <View className="w-2 h-2 bg-orange-400 rounded-full" />
                                    </View>
                                )}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
};

export default SettingsSidebar;
