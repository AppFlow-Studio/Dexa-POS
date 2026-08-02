import { useLocationRealtime } from "@/contexts/LocationRealtimeProvider";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useFloorPlanStore } from "@/stores/useFloorPlanStore";
import {
    CalendarClock,
    ChevronLeft,
    ChevronRight,
    Clock,
    Lock,
    Utensils,
} from "lucide-react-native";
import React, { useEffect, useRef, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import PinDisplay from "../auth/PinDisplay";
import PinNumpad from "../auth/PinNumpad";
import HistoryPanel from "../panels/HistoryPanel";
import ReservationsPanel from "../panels/ReservationsPanel";
import TablesPanel from "../panels/TablesPanel";
import WaitlistPanel from "../panels/WaitlistPanel";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "../ui/dialog";

type TabMode = "tables" | "waitlist" | "reservations" | "history";

interface SidebarProps {
  activeLayoutId: string | null;
  setActiveLayout: (id: string) => void;
  onFocusTable?: (tableId: string) => void;
}

const Sidebar: React.FC<SidebarProps> = ({
  activeLayoutId,
  setActiveLayout,
  onFocusTable,
}) => {
  const uiScale = useUiScale();
  const s = (n: number) => Math.round(n * uiScale);
  const EXPANDED_WIDTH = Math.round(280 * uiScale);
  const COLLAPSED_WIDTH = Math.round(72 * uiScale);
  const [isExpanded, setIsExpanded] = useState(true);
  const [activeTab, setActiveTab] = useState<TabMode>("tables");
  const [tabsCollapsed, setTabsCollapsed] = useState(false);

  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [currentPin, setCurrentPin] = useState("");
  const [targetTab, setTargetTab] = useState<TabMode | null>(null);

  // Get actual Realtime Channel status (not store status)
  const { floor } = useLocationRealtime();
  const reconnectFloorRef = useRef(floor.reconnect);

  useEffect(() => {
    reconnectFloorRef.current = floor.reconnect;
  }, [floor.reconnect]);

  // Determine connection status based on actual channel state
  // "Offline" = CHANNEL_ERROR (max retries reached) or CLOSED
  // "Syncing..." = actively reconnecting (TIMED_OUT or reconnectAttempts > 0 but not error)
  const isOffline =
    !floor.isConnected && floor.status.state === "CHANNEL_ERROR";
  const isSyncing = !floor.isConnected && !isOffline;

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
      reconnectFloorRef.current();
    }, 5000);

    // Then periodic retry every 30 seconds
    const intervalId = setInterval(() => {
      console.log("[Sidebar] Periodic retry attempt...");
      reconnectFloorRef.current();
    }, 30000); // 30 seconds

    return () => {
      clearTimeout(initialRetryId);
      clearInterval(intervalId);
    };
  }, [isOffline]);

  // Manual reconnect handler (for tappable status indicator)
  const handleManualReconnect = () => {
    console.log("[Sidebar] Manual reconnect triggered");
    reconnectFloorRef.current();
    // Refetch floor plan data to recover missed events during connection drop
    useFloorPlanStore.getState().loadFloorPlanStatus();
  };

  const toggleSidebar = () => {
    setIsExpanded((prev) => !prev);
  };

  const renderPanel = () => {
    switch (activeTab) {
      case "tables":
        return <TablesPanel onFocusTable={onFocusTable} />;
      case "waitlist":
        return <WaitlistPanel />;
      case "reservations":
        return <ReservationsPanel />;
      case "history":
        return <HistoryPanel />;
      default:
        return <TablesPanel onFocusTable={onFocusTable} />;
    }
  };

  const navItems = [
    { id: "tables", icon: Utensils, label: "Tables", isLocked: false },
    { id: "waitlist", icon: Clock, label: "Waitlist", isLocked: false },
    {
      id: "reservations",
      icon: CalendarClock,
      label: "Reservations",
      isLocked: false,
    },
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
      <View
        style={{
          width: isExpanded ? EXPANDED_WIDTH : COLLAPSED_WIDTH,
          height: "100%",
          zIndex: 20,
          backgroundColor: colors.panel,
          borderRightWidth: 1,
          borderRightColor: colors.border,
        }}
      >
        {/* Floating Toggle Button */}
        <TouchableOpacity
          onPress={toggleSidebar}
          hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
          activeOpacity={0.7}
          style={{
            position: "absolute",
            right: s(-14),
            top: "50%",
            marginTop: s(-16),
            zIndex: 50,
            width: s(32),
            height: s(32),
            borderRadius: s(16),
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          {isExpanded ? (
            <ChevronLeft size={s(16)} color={colors.label} />
          ) : (
            <ChevronRight size={s(16)} color={colors.label} />
          )}
        </TouchableOpacity>

        {/* Navigation Tabs */}
        <View
          style={{
            paddingHorizontal: s(4),
            paddingTop: s(6),
            flexShrink: 0,
            flexDirection: isExpanded ? "row" : "column",
            gap: s(2),
            backgroundColor: colors.panel,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
          }}
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;

            return (
              <TouchableOpacity
                key={item.id}
                onPress={() => {
                  if (!isExpanded) {
                    setIsExpanded(true);
                    if (!item.isLocked) setActiveTab(item.id);
                    else handleLockedAccess(item.id);
                    return;
                  }
                  if (item.isLocked) {
                    handleLockedAccess(item.id);
                  } else {
                    setActiveTab(item.id);
                  }
                }}
                style={{
                  flex: isExpanded ? 1 : undefined,
                  flexDirection: "column",
                  alignItems: "center",
                  justifyContent: "center",
                  height: s(44),
                  gap: s(3),
                  borderRadius: s(8),
                  borderBottomWidth: isActive ? s(3) : 0,
                  borderBottomColor: colors.teal,
                }}
              >
                <item.icon
                  size={s(16)}
                  color={isActive ? colors.teal : colors.label}
                />
                {isExpanded && (
                  <Text
                    style={{
                      fontSize: s(11),
                      fontWeight: "600",
                      color: isActive ? colors.teal : colors.label,
                    }}
                    numberOfLines={1}
                  >
                    {item.label}
                  </Text>
                )}
                {item.isLocked && !isActive && (
                  <Lock size={s(11)} color={colors.muted} />
                )}
              </TouchableOpacity>
            );
          })}
        </View>

        {/* Panel Content */}
        <View
          style={{
            flex: 1,
            backgroundColor: colors.screen,
          }}
        >
          {isExpanded && renderPanel()}
        </View>

        {/* Live Status Indicator — iOS footer style */}
        <TouchableOpacity
          style={{
            paddingVertical: s(8),
            paddingHorizontal: s(14),
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            borderTopWidth: 1,
            borderTopColor: colors.border + "40",
            backgroundColor: colors.panel,
          }}
          onPress={!floor.isConnected ? handleManualReconnect : undefined}
          activeOpacity={!floor.isConnected ? 0.7 : 1}
        >
          <View
            style={{
              width: s(7),
              height: s(7),
              borderRadius: s(4),
              backgroundColor: floor.isConnected
                ? colors.success
                : isSyncing
                  ? colors.warning
                  : colors.danger,
            }}
          />
          {isExpanded && (
            <Text
              style={{ marginLeft: s(7), fontSize: s(11), color: colors.muted }}
            >
              {floor.isConnected
                ? "Live"
                : isSyncing
                  ? "Syncing..."
                  : "Offline · Tap to retry"}
            </Text>
          )}
        </TouchableOpacity>
      </View>

      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent
          style={{
            backgroundColor: colors.panel,
            borderColor: colors.border,
            borderWidth: 1,
            borderRadius: s(16),
            padding: s(24),
            width: s(360),
          }}
        >
          <DialogHeader>
            <DialogTitle>
              <Text
                style={{
                  fontSize: s(16),
                  fontWeight: "700",
                  color: colors.heading,
                  textAlign: "center",
                }}
              >
                Manager Access Required
              </Text>
            </DialogTitle>
          </DialogHeader>
          <View style={{ paddingTop: s(16) }}>
            <Text
              style={{
                fontSize: s(13),
                color: colors.label,
                textAlign: "center",
                marginBottom: s(20),
              }}
            >
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
              style={{
                marginTop: s(16),
                paddingVertical: s(12),
                borderRadius: s(8),
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "50",
                alignItems: "center",
              }}
            >
              <Text
                style={{
                  fontSize: s(14),
                  fontWeight: "700",
                  color: colors.teal,
                }}
              >
                Confirm
              </Text>
            </TouchableOpacity>
          </View>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default Sidebar;
