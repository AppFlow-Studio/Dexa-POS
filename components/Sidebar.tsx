import { SIDEBAR_DATA } from "@/lib/sidebar-data";
import { usePathname } from "expo-router"; // We only need usePathname now
import { Menu, X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import SidebarAccordion from "./sidebar/SidebarAccordion";

const EXPANDED_WIDTH = 288;
const COLLAPSED_WIDTH = 80;

const Sidebar: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [openAccordions, setOpenAccordions] = useState<string[]>([
    "settings",
    "basic",
  ]);

  const pathname = usePathname();
  const activeId = pathname.substring(1);

  const animatedWidth = useSharedValue(
    isExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH
  );

  useEffect(() => {
    animatedWidth.value = withTiming(
      isExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
      {
        duration: 300,
      }
    );
  }, [isExpanded]);

  const animatedStyle = useAnimatedStyle(() => ({
    width: animatedWidth.value,
  }));

  const handleToggleAccordion = (id: string) => {
    setOpenAccordions((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  return (
    <Animated.View
      style={animatedStyle}
      className="h-full bg-white p-2 border-r border-gray-200"
    >
      <ScrollView showsVerticalScrollIndicator={false}>
        <View className="flex-row items-center justify-between p-2 mb-4">
          {isExpanded && (
            <View className="flex-row items-center flex-shrink-1">
              <View className="w-8 h-8 bg-blue-500 rounded-md" />
              <Text
                className="ml-3 text-2xl font-bold text-gray-800"
                numberOfLines={1}
              >
                MTechPOS
              </Text>
            </View>
          )}
          <TouchableOpacity
            onPress={() => setIsExpanded(!isExpanded)}
            className="p-2"
          >
            {isExpanded ? (
              <X color="#4b5563" size={24} />
            ) : (
              <Menu color="#4b5563" size={24} />
            )}
          </TouchableOpacity>
        </View>
        <View className="space-y-1">
          {SIDEBAR_DATA.map((item) => (
            <SidebarAccordion
              key={item.id}
              item={item}
              level={0}
              isExpanded={isExpanded}
              activeId={activeId}
              openAccordions={openAccordions}
              onToggle={handleToggleAccordion}
              activePath={pathname}
            />
          ))}
        </View>
      </ScrollView>
    </Animated.View>
  );
};

export default Sidebar;
