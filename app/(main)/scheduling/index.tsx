import { useRouter } from "expo-router";
import { BarChart3, Calendar } from "lucide-react-native";
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface SchedulingCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
}

const SchedulingCard: React.FC<SchedulingCardProps> = ({ icon, title, subtitle, onPress }) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="w-1/3 h-1/4 rounded-2xl border border-gray-600 p-6 bg-[#303030] justify-center items-center"
    >
        <View className="mb-3">{icon}</View>
        <Text className="text-3xl font-bold text-white mb-1 text-center">{title}</Text>
        <Text className="text-xl text-gray-300 text-center">{subtitle}</Text>
    </TouchableOpacity>
  );
};

const SchedulingMenuScreen = () => {
  const router = useRouter();

  const menuItems = [
    {
      id: "dashboard",
      icon: <Calendar color="#3b82f6" size={48} />,
      title: "Dashboard",
      subtitle: "Manage Schedules",
      route: "/scheduling/dashboard",
    },
    {
      id: "reports",
      icon: <BarChart3 color="#3b82f6" size={48} />,
      title: "Reports",
      subtitle: "Analytics & Insights",
      route: "/scheduling/reports",
    },
  ];

  return (
    <View className="flex-1 p-4 bg-[#212121] justify-center items-center">
        <View className="flex-row flex-wrap gap-4 w-full h-full items-center justify-center">
            {menuItems.map((item) => (
                <SchedulingCard
                    key={item.id}
                    icon={item.icon}
                    title={item.title}
                    subtitle={item.subtitle}
                    onPress={() => router.push(item.route as any)}
                />
            ))}
        </View>
    </View>
  );
};

export default SchedulingMenuScreen;
