import { images } from "@/lib/image";
import { SIDEBAR_DATA } from "@/lib/sidebar-data";
import { usePathname } from "expo-router";
import { Menu, X } from "lucide-react-native";
import React, { useEffect, useState } from "react";
import {
  Image,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
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
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);

  const pathname = usePathname();
  const activePath = pathname;

  const animationProgress = useSharedValue(0);

  useEffect(() => {
    animationProgress.value = withTiming(isExpanded ? 1 : 0, { duration: 0 });
  }, [isExpanded]);

  // --- THIS IS THE KEY: Animate translateX for a smooth slide ---
  const animatedPanelStyle = useAnimatedStyle(() => {
    // When collapsed (progress=0), the panel is moved completely off-screen to the left.
    // When expanded (progress=1), the panel slides to its final position at left: 0.
    const translateX = withTiming(isExpanded ? 0 : -EXPANDED_WIDTH, {
      duration: 250,
    });
    return {
      transform: [{ translateX }],
    };
  });

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: animationProgress.value,
    // When collapsed, move it off-screen and disable pointer events
    zIndex: isExpanded ? 20 : -1,
  }));

  const handleToggleAccordion = (id: string) => {
    setOpenAccordions((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleExpand = () => {
    if (!isExpanded) setIsExpanded(true);
  };

  return (
    <>
      {/* The Static, Always-Visible Icon Bar --- */}
      <View className="w-20 h-full bg-white p-2 border-r border-gray-200 items-center z-10">
        <TouchableOpacity
          onPress={() => setIsExpanded(true)}
          className="p-2 my-2"
        >
          <Menu color="#1C1C28" size={24} />
        </TouchableOpacity>
        <View className="space-y-1 mt-4">
          {SIDEBAR_DATA.map((item) => (
            // This instance of the accordion is ALWAYS rendered in collapsed mode
            <SidebarAccordion
              key={item.id}
              item={item}
              isExpanded={false}
              onExpand={handleExpand}
              activePath={activePath}
              openAccordions={openAccordions}
              onToggle={handleToggleAccordion}
            />
          ))}
        </View>
      </View>

      {/*The Animated Overlay and Expanded Panel --- */}
      {/* These float on top of the main content and the static icon bar */}

      <Animated.View
        style={animatedBackdropStyle}
        className="absolute inset-0 bg-black/50"
      >
        <Pressable
          onPress={() => setIsExpanded(false)}
          className="w-full h-full"
        />
      </Animated.View>

      <Animated.View
        style={[animatedPanelStyle, { width: EXPANDED_WIDTH }]}
        className="absolute top-0 left-0 h-full bg-white p-2 border-r border-gray-200 z-30"
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          className="overflow-hidden"
        >
          <View
            className="flex-row items-center p-2 mb-4"
            style={{ width: EXPANDED_WIDTH - 16 }}
          >
            <TouchableOpacity
              onPress={() => setIsExpanded(false)}
              className="p-2"
            >
              <X color="#1C1C28" size={24} />
            </TouchableOpacity>
            <View className="flex-row items-center ml-4">
              <Image
                source={images.logo}
                className="h-8 w-8"
                resizeMode="contain"
              />
              <Text
                className="ml-2 text-2xl font-bold text-accent-300"
                numberOfLines={1}
              >
                MTechPOS
              </Text>
            </View>
          </View>

          <View
            className="space-y-1 px-2"
            style={{ width: EXPANDED_WIDTH - 16 }}
          >
            {SIDEBAR_DATA.map((item) => (
              // This instance of the accordion is ALWAYS rendered in expanded mode
              <SidebarAccordion
                key={item.id}
                item={item}
                level={0}
                isExpanded={true}
                onExpand={() => {}}
                activePath={activePath}
                openAccordions={openAccordions}
                onToggle={handleToggleAccordion}
              />
            ))}
          </View>
        </ScrollView>
      </Animated.View>
    </>
  );
};

export default Sidebar;
