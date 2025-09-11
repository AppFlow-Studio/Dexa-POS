import { images } from "@/lib/image";
import { SIDEBAR_DATA } from "@/lib/sidebar-data";
import { usePathname } from "expo-router";
import { Menu, X } from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
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

const SidebarFooter = () => (
  <View className="p-4 mt-auto border-t border-gray-100">
    <View className="flex-row items-center">
      <Image source={images.logo} className="h-8 w-8" resizeMode="contain" />
      <Text className="ml-2 text-2xl font-bold text-gray-800">MTechPOS</Text>
    </View>
    <Text className="text-gray-600 mt-2">
      The Dreamy taste & Magic of sweet moments in every bite from our bakery
    </Text>
    <View className="flex-row items-center justify-between mt-4 bg-gray-100 p-1 rounded-full">
      <Text className="text-gray-500 font-semibold px-3 text-sm">
        © 2025 MTechPOS
      </Text>
      <TouchableOpacity className="py-1 px-3 bg-white rounded-full">
        <Text className="font-semibold text-gray-700 text-sm">Contacts</Text>
      </TouchableOpacity>
      <TouchableOpacity className="py-1 px-3 bg-white rounded-full">
        <Text className="font-semibold text-gray-700 text-sm">Help</Text>
      </TouchableOpacity>
    </View>
  </View>
);

const Sidebar: React.FC = () => {
  const [isExpanded, setIsExpanded] = useState(false);
  const [openAccordions, setOpenAccordions] = useState<string[]>([]);

  const pathname = usePathname();
  const activePath = pathname;

  const scrollViewRef = useRef<ScrollView>(null);
  const activeItemYRef = useRef<number | null>(null); // Store the y-position of the active item

  const animationProgress = useSharedValue(0);

  useEffect(() => {
    animationProgress.value = withTiming(isExpanded ? 1 : 0, { duration: 0 });
  }, [isExpanded]);

  const animatedPanelStyle = useAnimatedStyle(() => {
    const translateX = withTiming(isExpanded ? 0 : -EXPANDED_WIDTH, {
      duration: 250,
    });
    return {
      transform: [{ translateX }],
    };
  });

  const animatedBackdropStyle = useAnimatedStyle(() => ({
    opacity: animationProgress.value,
    zIndex: isExpanded ? 20 : -1,
  }));

  const handleActiveLayout = (yPosition: number) => {
    // Store the y-position, but don't scroll immediately
    activeItemYRef.current = yPosition;
    //console.log("Active item Y position stored:", yPosition);
  };

  useEffect(() => {
    if (isExpanded) {
      const findPath = (items: typeof SIDEBAR_DATA, path: string): string[] => {
        for (const item of items) {
          if (item.href === path) return [item.id];
          if (item.subItems) {
            const found = findPath(item.subItems, path);
            if (found.length > 0) return [item.id, ...found];
          }
        }
        return [];
      };
      const openPath = findPath(SIDEBAR_DATA, activePath);
      setOpenAccordions(openPath);

      // After setting openAccordions, wait for a tick for layout to update
      // Then scroll to the active item if its position was captured.
      const scrollTimer = setTimeout(() => {
        if (scrollViewRef.current && activeItemYRef.current !== null) {
          // Adjust for header height or any other offset if needed
          const scrollOffset = activeItemYRef.current - 100; // Example offset
          scrollViewRef.current.scrollTo({
            y: scrollOffset > 0 ? scrollOffset : 0,
            animated: true,
          });
          activeItemYRef.current = null; // Reset after scrolling
        }
      }, 300); // Give enough time for accordions to open and elements to render

      return () => clearTimeout(scrollTimer);
    } else {
      // Reset active item Y when collapsed
      activeItemYRef.current = null;
    }
  }, [isExpanded, activePath]); // Depend on isExpanded and activePath

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
      <View className="w-20 h-full bg-white p-2 border-r border-gray-200 items-center z-10">
        <TouchableOpacity
          onPress={() => setIsExpanded(true)}
          className="p-2 my-2"
        >
          <Menu color="#1C1C28" size={24} />
        </TouchableOpacity>
        <View className="flex-1 justify-between">
          <View className="space-y-1 mt-4">
            {SIDEBAR_DATA.map((item) => (
              <SidebarAccordion
                key={item.id}
                item={item}
                isExpanded={false}
                onExpand={handleExpand}
                activePath={activePath}
                openAccordions={openAccordions}
                onToggle={handleToggleAccordion}
                onActiveLayout={handleActiveLayout}
              />
            ))}
          </View>
          {/* <View className="w "> */}
          <Image
            source={images.logo}
            className="h-8 w-8 mx-auto mb-4"
            resizeMode="contain"
          />
          {/* </View> */}
        </View>
      </View>

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
          ref={scrollViewRef} // Assign ref here
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
              <SidebarAccordion
                key={item.id}
                item={item}
                level={0}
                isExpanded={true}
                onExpand={() => {}}
                activePath={activePath}
                openAccordions={openAccordions}
                onToggle={handleToggleAccordion}
                onActiveLayout={handleActiveLayout}
              />
            ))}
          </View>
        </ScrollView>
        <SidebarFooter />
      </Animated.View>
    </>
  );
};

export default Sidebar;
