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
import React, { useState } from "react";
import { Image, Text, TouchableOpacity, View } from "react-native"; // Removed StyleSheet
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
  // Define any props needed from the parent (e.g., activeLayout, layouts, etc.)
  activeLayoutId: string | null;
  setActiveLayout: (id: string) => void;
  layouts: { id: string; name: string }[];
}

const Sidebar: React.FC<SidebarProps> = ({
  activeLayoutId,
  setActiveLayout,
  layouts,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<TabMode>("tables");

  const sidebarWidth = useSharedValue(320); // Expanded width
  const animatedWidth = useAnimatedStyle(() => {
    return {
      width: withTiming(sidebarWidth.value, {
        duration: 250,
        easing: Easing.inOut(Easing.ease),
      }),
      height: "100%", // Inline style for sidebarContainer
      position: "relative", // Inline style for sidebarContainer
      zIndex: 20, // Inline style for sidebarContainer
    };
  });

  const toggleSidebar = () => {
    setIsExpanded(!isExpanded);
    sidebarWidth.value = isExpanded ? 64 : 320; // Collapsed width
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
      style={animatedWidth} // Use animatedWidth directly now
      className="bg-[#212121] border-r border-gray-700 shadow-xl"
    >
      {/* Toggle Button */}
      <TouchableOpacity
        onPress={toggleSidebar}
        className="absolute -right-3 top-6 w-6 h-6 bg-white border border-gray-300 rounded-full flex items-center justify-center shadow-sm z-30"
      >
        {isExpanded ? (
          <ChevronLeft size={16} color="#4B5563" />
        ) : (
          <ChevronRight size={16} color="#4B5563" />
        )}
      </TouchableOpacity>

      {/* Logo Area */}
      <View className="h-16 flex items-center justify-center border-b border-gray-700 shrink-0 overflow-hidden">
        {isExpanded ? (
          <Text className="text-xl font-bold text-white">DexaPOS</Text>
        ) : (
          <Image
            source={images.dexalogo}
            style={{ width: 40, height: 40 }} // Inline style for logoCollapsed
            resizeMode="contain"
          />
        )}
      </View>

      {/* Navigation Tabs */}
      <View className="flex flex-col gap-1 p-2 shrink-0 border-b border-gray-700">
        {navItems.map((item) => (
          <TouchableOpacity
            key={item.id}
            onPress={() => setActiveTab(item.id)}
            className={cn(
              "flex flex-row items-center p-2 rounded-lg transition-all duration-200",
              activeTab === item.id
                ? "bg-blue-900/40 text-blue-400"
                : "text-gray-400 hover:bg-gray-800"
            )}
          >
            <item.icon
              size={20}
              color={activeTab === item.id ? "#60A5FA" : "#9CA3AF"}
            />
            {isExpanded && (
              <Text className="ml-3 text-sm font-medium text-white">
                {item.label}
              </Text>
            )}
            {activeTab === item.id && (
              <View className="absolute left-0 w-1 h-6 bg-blue-500 rounded-r-full" />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {/* Panel Content */}
      <View
        style={{ flex: 1 }} // Inline style for panelContent
        className={isExpanded ? "" : "opacity-0"}
      >
        {renderPanel()}
      </View>
    </Animated.View>
  );
};

export default Sidebar;
