import { images } from "@/lib/image";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  Users,
  Utensils,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import HistoryPanel from "../panels/HistoryPanel";
import SeatedPanel from "../panels/SeatedPanel";
import TablesPanel from "../panels/TablesPanel";
import WaitlistPanel from "../panels/WaitlistPanel";

type TabMode = "tables" | "waitlist" | "seated" | "history";

interface SidebarProps {
  activeLayoutId: string | null;
  setActiveLayout: (id: string) => void;
  layouts: { id: string; name: string }[];
}

const EXPANDED_WIDTH = 280;
const COLLAPSED_WIDTH = 72;

const Sidebar: React.FC<SidebarProps> = ({
  activeLayoutId,
  setActiveLayout,
  layouts,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<TabMode>("tables");

  // Shared values for animations
  const widthSV = useSharedValue(EXPANDED_WIDTH);
  const opacitySV = useSharedValue(1);

  useEffect(() => {
    const config = {
      duration: 200,
      easing: Easing.out(Easing.quad),
    };

    widthSV.value = withTiming(
      isExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
      config
    );
    opacitySV.value = withTiming(isExpanded ? 1 : 0, { duration: 150 });
  }, [isExpanded]);

  const containerStyle = useAnimatedStyle(() => ({
    width: widthSV.value,
  }));

  const textStyle = useAnimatedStyle(() => ({
    opacity: opacitySV.value,
    display: opacitySV.value === 0 ? "none" : "flex",
  }));

  const toggleSidebar = () => {
    setIsExpanded((prev) => !prev);
  };

  const renderPanel = () => {
    switch (activeTab) {
      case "tables":
        return <TablesPanel />;
      case "waitlist":
        return <WaitlistPanel />;
      case "seated":
        return <SeatedPanel />;
      case "history":
        return <HistoryPanel />;
      default:
        return <TablesPanel />;
    }
  };

  const navItems = [
    { id: "tables", icon: Utensils, label: "Tables" },
    { id: "waitlist", icon: Clock, label: "Waitlist" },
    { id: "seated", icon: Users, label: "Seated" },
    { id: "history", icon: BarChart3, label: "History" },
  ] as const;

  return (
    <Animated.View
      style={[containerStyle, { height: "100%", zIndex: 20 }]}
      // CHANGED: bg-[#181818] is a subtle, professional dark gray.
      // It contrasts slightly with your main #212121 without being pitch black.
      className="bg-[#292929] border-r border-gray-800 shadow-xl overflow-visible"
    >
      {/* 
        Floating Toggle Button 
        Kept the larger size as requested
      */}
      <TouchableOpacity
        onPress={toggleSidebar}
        hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
        activeOpacity={0.7}
        className="absolute -right-5 top-8 w-9 h-9 bg-[#303030] border border-gray-600 rounded-full flex items-center justify-center shadow-md z-50"
      >
        {isExpanded ? (
          <ChevronLeft size={20} color="#FFFFFF" />
        ) : (
          <ChevronRight size={20} color="#FFFFFF" />
        )}
      </TouchableOpacity>

      {/* Header */}
      <TouchableOpacity
        onPress={toggleSidebar}
        activeOpacity={0.8}
        className="h-20 flex-row items-center border-b border-gray-600 shrink-0 px-4"
      >
        <View className="w-10 h-10 items-center justify-center">
          <Image
            source={images.dexalogo}
            style={{ width: 32, height: 32 }}
            resizeMode="contain"
          />
        </View>

        <Animated.View style={[textStyle, { marginLeft: 12, flex: 1 }]}>
          <Text className="text-lg font-bold text-white" numberOfLines={1}>
            DexaPOS
          </Text>
          <Text className="text-xs text-gray-400" numberOfLines={1}>
            Main Floor
          </Text>
        </Animated.View>
      </TouchableOpacity>

      {/* Navigation Tabs */}
      <View className="flex flex-col gap-2 p-3 shrink-0 border-b border-gray-800">
        {navItems.map((item) => {
          const isActive = activeTab === item.id;
          return (
            <TouchableOpacity
              key={item.id}
              onPress={() => {
                setActiveTab(item.id);
                if (!isExpanded) setIsExpanded(true);
              }}
              className={cn(
                "flex-row items-center rounded-xl h-12 px-3 transition-all duration-100",
                isActive ? "bg-blue-600" : "hover:bg-[#252525]" // Hover color adjusted for new bg
              )}
            >
              <View className="w-6 items-center justify-center">
                <item.icon size={22} color={isActive ? "#FFFFFF" : "#9CA3AF"} />
              </View>

              <Animated.View style={[textStyle, { marginLeft: 12 }]}>
                <Text
                  className={cn(
                    "text-base font-medium",
                    isActive ? "text-white" : "text-gray-300"
                  )}
                  numberOfLines={1}
                >
                  {item.label}
                </Text>
              </Animated.View>

              {!isExpanded && isActive && (
                <View className="absolute right-2 top-2 w-2 h-2 bg-blue-400 rounded-full" />
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {/* Panel Content */}
      {/* Matched background to sidebar */}
      <Animated.View
        style={{ flex: 1, opacity: opacitySV }}
        className="bg-[#181818]"
      >
        {isExpanded && renderPanel()}
      </Animated.View>
    </Animated.View>
  );
};

export default Sidebar;
