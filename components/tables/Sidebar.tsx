import { images } from "@/lib/image";
import { cn } from "@/lib/utils";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import {
  BarChart3,
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
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
import PinDisplay from "../auth/PinDisplay";
import PinNumpad from "../auth/PinNumpad";
import HistoryPanel from "../panels/HistoryPanel";
import SeatedPanel from "../panels/SeatedPanel";
import TablesPanel from "../panels/TablesPanel";
import WaitlistPanel from "../panels/WaitlistPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

type TabMode = "tables" | "waitlist" | "seated" | "history";

interface SidebarProps {
  activeLayoutId: string | null;
  setActiveLayout: (id: string) => void;
  // layouts prop removed
}

const EXPANDED_WIDTH = 280;
const COLLAPSED_WIDTH = 72;

const Sidebar: React.FC<SidebarProps> = ({
  activeLayoutId,
  setActiveLayout,
}) => {
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<TabMode>("tables");

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [targetTab, setTargetTab] = useState<TabMode | null>(null);

  // Shared values for animations
  const widthSV = useSharedValue(EXPANDED_WIDTH);
  const opacitySV = useSharedValue(1);

  const { realtimeStatus } = useFloorPlanStore();

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
    { id: "tables", icon: Utensils, label: "Tables", isLocked: false },
    { id: "waitlist", icon: Clock, label: "Waitlist", isLocked: false },
    { id: "seated", icon: Users, label: "Seated", isLocked: false },
    { id: "history", icon: BarChart3, label: "History", isLocked: true },
  ] as const;

  const handleLockedAccess = (tab: TabMode) => {
    setTargetTab(tab);
    setPinDialogOpen(true);
    setCurrentPin("");
  };

  const handlePinSubmit = () => {
    // TODO: Implement actual PIN validation logic
    // For now, we'll accept any 4-digit PIN
    if (currentPin.length === 4) {
      setPinDialogOpen(false);
      if (targetTab) {
        setActiveTab(targetTab);
      }
      setCurrentPin("");
      setTargetTab(null);
    }
  };

  return (
    <>
      <Animated.View
        style={[containerStyle, { height: "100%", zIndex: 20 }]}
        className="bg-[#292929] border-r border-gray-800 shadow-xl overflow-visible"
      >
        {/* Floating Toggle Button */}
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
        </TouchableOpacity>

        {/* Navigation Tabs */}
        <View className="flex flex-col gap-2 p-3 shrink-0 border-b border-gray-800">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  if (item.isLocked) {
                    handleLockedAccess(item.id);
                  } else {
                    setActiveTab(item.id);
                  }
                  if (!isExpanded) setIsExpanded(true);
                }}
                className={cn(
                  "flex-row items-center rounded-xl h-12 px-3 transition-all duration-100",
                  isActive ? "bg-blue-600" : "hover:bg-[#252525]"
                )}
              >
                <View className="w-6 items-center justify-center">
                  <item.icon
                    size={22}
                    color={isActive ? "#FFFFFF" : "#9CA3AF"}
                  />
                </View>

                <Animated.View style={[textStyle, { marginLeft: 12, flex: 1 }]}>
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

                {/* Lock Icon - Only for locked items when expanded */}
                {item.isLocked && isExpanded && (
                  <View className="ml-2">
                    <Lock size={18} color="#9CA3AF" />
                  </View>
                )}

                {!isExpanded && isActive && (
                  <View className="absolute right-2 top-2 w-2 h-2 bg-blue-400 rounded-full" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Panel Content */}
        <Animated.View
          style={{ flex: 1, opacity: opacitySV }}
          className="bg-[#181818]"
        >
          {isExpanded && renderPanel()}
        </Animated.View>

        {/* Live Status Indicator - Bottom of Sidebar */}
        <View className="p-3 border-t border-gray-800 flex-row items-center justify-center">
          <View
            className={`w-2.5 h-2.5 rounded-full ${
              realtimeStatus === "connected"
                ? "bg-green-500"
                : realtimeStatus === "reconnecting"
                  ? "bg-amber-500"
                  : "bg-red-500"
            }`}
          />
          {isExpanded && (
            <Animated.Text
              style={textStyle}
              className="text-sm text-gray-400 ml-2"
            >
              {realtimeStatus === "connected"
                ? "Live"
                : realtimeStatus === "reconnecting"
                  ? "Syncing..."
                  : "Offline"}
            </Animated.Text>
          )}
        </View>
      </Animated.View>
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="w-fit h-fit bg-[#303030] border-gray-600 p-8">
          <DialogHeader>
            <DialogTitle className="text-center text-3xl font-semibold text-white">
              Manager Access Required
            </DialogTitle>
          </DialogHeader>
          <View className="py-4">
            <Text className="text-center text-2xl text-gray-300 mb-6">
              Enter your manager PIN to access this feature
            </Text>
            <PinDisplay pinLength={currentPin.length} maxLength={4} />
            <PinNumpad
              onKeyPress={(input) => {
                if (typeof input === "number") {
                  if (currentPin.length < 4) {
                    const newPin = currentPin + input.toString();
                    setCurrentPin(newPin);
                    if (newPin.length === 4) {
                      setTimeout(() => {
                        handlePinSubmit();
                      }, 100);
                    }
                  }
                } else if (input === "clear") {
                  setCurrentPin("");
                } else if (input === "backspace") {
                  setCurrentPin(currentPin.slice(0, -1));
                }
              }}
            />

            <TouchableOpacity
              onPress={handlePinSubmit}
              className="p-4 bg-blue-600 rounded-lg w-full self-center mt-6"
            >
              <Text className="text-center text-2xl font-bold text-white">
                Enter
              </Text>
            </TouchableOpacity>
          </View>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Sidebar;
