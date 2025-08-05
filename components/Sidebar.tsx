import { images } from "@/lib/image";
import { SIDEBAR_DATA } from "@/lib/sidebar-data";
import { usePathname } from "expo-router"; // We only need usePathname now
import { Menu, X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Image, ScrollView, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import SidebarAccordion from "./sidebar/SidebarAccordion";

const EXPANDED_WIDTH = 288;
const COLLAPSED_WIDTH = 80;

const Sidebar: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [openAccordions, setOpenAccordions] = useState<string[]>([
    "settings",
    "basic",
  ]);

  const pathname = usePathname();
  const activePath = pathname;

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

  const handleExpand = () => {
    if (!isExpanded) {
      setIsExpanded(true);
    }
  };

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
              <Image
                source={images.logo}
                className="ml-4 h-8"
                resizeMode="contain"
              />
              <Text className="ml-2 text-2xl font-bold text-accent-300">
                MTechPOS
              </Text>
            </View>
          )}
          <TouchableOpacity
            onPress={() => setIsExpanded(!isExpanded)}
            className={`p-2 items-center justify-center ${isExpanded ? "" : "w-full"}`}
          >
            {isExpanded ? (
              <X color="#1C1C28" size={24} />
            ) : (
              <Menu color="#1C1C28" size={24} />
            )}
          </TouchableOpacity>
        </View>
        <View className="space-y-1 px-2">
          {SIDEBAR_DATA.map((item) => (
            <SidebarAccordion
              key={item.id}
              item={item}
              level={0}
              isExpanded={isExpanded}
              onExpand={handleExpand} // Pass the expand handler
              activePath={activePath}
              openAccordions={openAccordions}
              onToggle={handleToggleAccordion}
            />
          ))}
        </View>
      </ScrollView>
    </Animated.View>
  );
};

export default Sidebar;
