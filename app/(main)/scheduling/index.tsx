import { useRouter } from "expo-router";
import { BarChart3, Calendar, Sparkles } from "lucide-react-native"; // Added Sparkles
import React from "react";
import { Text, TouchableOpacity, View } from "react-native";

interface SchedulingCardProps {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  onPress: () => void;
  iconBgColor?: string;
}

const SchedulingCard: React.FC<SchedulingCardProps> = ({
  icon,
  title,
  subtitle,
  onPress,
  iconBgColor,
}) => {
  return (
    <TouchableOpacity
      onPress={onPress}
      className="w-1/3 h-1/4 rounded-2xl border border-gray-600 p-6 bg-[#303030] justify-center items-center"
    >
      <View className={`mb-3 p-4 rounded-full ${iconBgColor}`}>{icon}</View>
      <Text className="text-3xl font-bold text-white mb-1 text-center">
        {title}
      </Text>
      <Text className="text-xl text-gray-300 text-center">{subtitle}</Text>
    </TouchableOpacity>
  );
};

const SchedulingMenuScreen = () => {
  const router = useRouter();

  const menuItems = [
    {
      id: "dashboard",
      icon: <Calendar color="#60A5FA" size={48} />,
      title: "Dashboard",
      subtitle: "Manage Schedules",
      route: "/scheduling/dashboard",
      iconBgColor: "bg-blue-600/20",
    },
    {
      id: "reports",
      icon: <BarChart3 color="#34D399" size={48} />,
      title: "Reports",
      subtitle: "Analytics & Insights",
      route: "/scheduling/reports",
      iconBgColor: "bg-green-600/20",
    },
    {
      id: "templates",
      icon: <Sparkles color="#A78BFA" size={48} />, // Purple Sparkles
      title: "Templates",
      subtitle: "Manage Shift Patterns",
      route: "/scheduling/templates",
      iconBgColor: "bg-purple-600/20", // Purple background
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
            iconBgColor={item.iconBgColor}
          />
        ))}
      </View>
    </View>
  );
};

export default SchedulingMenuScreen;
