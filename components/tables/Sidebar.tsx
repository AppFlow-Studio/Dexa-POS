import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";
import { images } from "@/lib/image";
import { colors } from "@/lib/theme";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import { cn } from "@/lib/utils";
import {
  BarChart3,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Lock,
  Users,
  Utensils,
} from "lucide-react-native";
import React, { useEffect, useState } from "react";
import { Image, LayoutAnimation, Text, TouchableOpacity, View } from "react-native";
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
  const [tabsCollapsed, setTabsCollapsed] = useState(true);

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [targetTab, setTargetTab] = useState<TabMode | null>(null);

  // Shared values for animations
  const widthSV = useSharedValue(EXPANDED_WIDTH);
  const opacitySV = useSharedValue(1);

  // Get actual Realtime Channel status (not store status)
  const { floor } = useLocationRealtime();

  // Determine connection status based on actual channel state
  // "Offline" = CHANNEL_ERROR (max retries reached) or CLOSED
  // "Syncing..." = actively reconnecting (TIMED_OUT or reconnectAttempts > 0 but not error)
  const isOffline =
    !floor.isConnected &&
    (floor.status.state === "CHANNEL_ERROR" || floor.status.state === "CLOSED");
  const isSyncing =
    !floor.isConnected && !isOffline && floor.status.reconnectAttempts > 0;

  // Background periodic retry when channel is in error state
  // This handles both: internet restored AND server restored scenarios
  useEffect(() => {
    // Only set up retry interval when we're offline (channel error)
    if (!isOffline) return;

    console.log(
      "[Sidebar] Channel offline, starting periodic retry (every 30s)...",
    );

    // Initial retry after 5 seconds
    const initialRetryId = setTimeout(() => {
      console.log("[Sidebar] Initial retry attempt...");
      floor.reconnect();
    }, 5000);

    // Then periodic retry every 30 seconds
    const intervalId = setInterval(() => {
      console.log("[Sidebar] Periodic retry attempt...");
      floor.reconnect();
    }, 30000); // 30 seconds

    return () => {
      clearTimeout(initialRetryId);
      clearInterval(intervalId);
    };
  }, [isOffline, floor]);

  // Manual reconnect handler (for tappable status indicator)
  const handleManualReconnect = () => {
    console.log("[Sidebar] Manual reconnect triggered");
    floor.reconnect();
    // Refetch floor plan data to recover missed events during connection drop
    useFloorPlanStore.getState().loadFloorPlanStatus();
  };

  useEffect(() => {
    const config = {
      duration: 200,
      easing: Easing.out(Easing.quad),
    };

    widthSV.value = withTiming(
      isExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
      config,
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
        return <WaitlistPanel />
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
    // { id: "history", icon: BarChart3, label: "History", isLocked: true },
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
        className="bg-panel border-r border-border shadow-xl overflow-visible"
      >
        {/* Floating Toggle Button */}
        <TouchableOpacity
          onPress={toggleSidebar}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          activeOpacity={0.7}
          className="absolute -right-5 top-8 w-9 h-9 bg-surface border border-border rounded-full flex items-center justify-center shadow-md z-50"
        >
          {isExpanded ? (
            <ChevronLeft size={20} color={colors.heading} />
          ) : (
            <ChevronRight size={20} color={colors.heading} />
          )}
        </TouchableOpacity>

        {/* Header */}
        <TouchableOpacity
          onPress={toggleSidebar}
          activeOpacity={0.8}
          className="h-20 flex-row items-center border-b border-border shrink-0 px-4"
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
        <View className="flex flex-col gap-2 p-3 shrink-0 border-b border-border">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;

            // When sidebar is expanded and tabs are collapsed, only show the active tab
            if (isExpanded && tabsCollapsed && !isActive) return null;

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  // Sidebar collapsed → expand sidebar
                  if (!isExpanded) {
                    setIsExpanded(true);
                    return;
                  }

                  // Tabs collapsed → expand tabs (tapping the active tab header)
                  if (tabsCollapsed && isActive) {
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setTabsCollapsed(false);
                    return;
                  }

                  // Tabs expanded → handle selection
                  if (isActive) {
                    // Tapping active tab again → just collapse
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setTabsCollapsed(true);
                    return;
                  }

                  if (item.isLocked) {
                    handleLockedAccess(item.id);
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setTabsCollapsed(true);
                  } else {
                    setActiveTab(item.id);
                    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
                    setTabsCollapsed(true);
                  }
                }}
                className={cn(
                  "flex-row items-center rounded-xl h-12 px-3 transition-all duration-100",
                  isActive ? "bg-teal" : "hover:bg-surface",
                )}
              >
                <View className="w-6 items-center justify-center">
                  <item.icon
                    size={22}
                    color={isActive ? colors.heading : colors.label}
                  />
                </View>

                <Animated.View style={[textStyle, { marginLeft: 12, flex: 1 }]}>
                  <Text
                    className={cn(
                      "text-base font-medium",
                      isActive ? "text-heading" : "text-label",
                    )}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                </Animated.View>

                {/* Chevron indicator on active tab when sidebar is expanded */}
                {isActive && isExpanded && (
                  <View className="ml-2">
                    {tabsCollapsed ? (
                      <ChevronDown size={18} color={colors.heading} />
                    ) : (
                      <ChevronUp size={18} color={colors.heading} />
                    )}
                  </View>
                )}

                {/* Lock Icon - Only for locked items when expanded and tabs are open */}
                {item.isLocked && isExpanded && !isActive && (
                  <View className="ml-2">
                    <Lock size={18} color={colors.label} />
                  </View>
                )}

                {!isExpanded && isActive && (
                  <View className="absolute right-2 top-2 w-2 h-2 bg-teal rounded-full" />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Panel Content */}
        <Animated.View
          style={{ flex: 1, opacity: opacitySV }}
          className="bg-screen"
        >
          {isExpanded && renderPanel()}
        </Animated.View>

        {/* Live Status Indicator - Bottom of Sidebar */}
        {/* Tappable when offline/syncing to trigger manual reconnect */}
        <TouchableOpacity
          className="p-2 border-t border-border flex-row items-center justify-center"
          onPress={!floor.isConnected ? handleManualReconnect : undefined}
          activeOpacity={!floor.isConnected ? 0.7 : 1}
        >
          <View
            className="w-2 h-2 rounded-full"
            style={{
              backgroundColor: floor.isConnected
                ? colors.success
                : isSyncing
                  ? colors.warning
                  : colors.danger,
            }}
          />
          {isExpanded && (
            <Animated.Text
              style={textStyle}
              className="text-xs text-hint ml-2"
            >
              {floor.isConnected
                ? "Live"
                : isSyncing
                  ? "Syncing..."
                  : "Offline - Tap to retry"}
            </Animated.Text>
          )}
        </TouchableOpacity>
      </Animated.View>
      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent className="w-fit h-fit bg-surface border-border p-8">
          <DialogHeader>
            <DialogTitle className="text-center text-3xl font-semibold text-white">
              Manager Access Required
            </DialogTitle>
          </DialogHeader>
          <View className="py-4">
            <Text className="text-center text-2xl text-label mb-6">
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
              className="p-4 bg-teal rounded-lg w-full self-center mt-6"
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
