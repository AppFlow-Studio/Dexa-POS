import OnlineOrderCard, {
  type OnlineColumnVariant,
} from "@/components/online-orders/OnlineOrderCard";
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useOnlineOrders } from "@/stores/selectors/orderSelectors";
import {
  selectIsOpen,
  useOnlineOrderDrawerStore,
} from "@/stores/useOnlineOrderDrawerStore";
import { router, usePathname } from "expo-router";
import { LayoutGrid, X } from "lucide-react-native";
import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import {
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

const BASE_PANEL_WIDTH = 420;

type SectionKey = "new" | "kitchen" | "ready";

const SECTION_DEFS: {
  key: SectionKey;
  title: string;
  color: string;
  variant: OnlineColumnVariant;
}[] = [
  { key: "new", title: "New Orders", color: "#3b82f6", variant: "new" },
  { key: "kitchen", title: "In Kitchen", color: "#ef4444", variant: "kitchen" },
  { key: "ready", title: "Ready", color: "#a855f7", variant: "ready" },
];

type DrawerSection = (typeof SECTION_DEFS)[number] & { data: string[] };

/**
 * Global right-hand slide-out drawer for triaging online orders without
 * leaving the current screen. Pre-mounted shell (AttachedModifierPanel
 * recipe): visibility is animation-driven, list content mounts on first open
 * and stays mounted after. Open state lives in useOnlineOrderDrawerStore —
 * opening marks all active online orders "seen" (clears the edge-tab badge).
 */
const OnlineOrderDrawer: React.FC = () => {
  const isOpen = useOnlineOrderDrawerStore(selectIsOpen);
  const uiScale = useUiScale();
  const panelWidth = Math.round(BASE_PANEL_WIDTH * uiScale);

  const [hasBeenShown, setHasBeenShown] = useState(false);

  // 0 = closed, 1 = open. translateX/backdrop opacity both derive from it.
  const progress = useSharedValue(0);

  useEffect(() => {
    if (isOpen) {
      if (!hasBeenShown) setHasBeenShown(true);
      progress.value = withSpring(1, { damping: 25, stiffness: 400, mass: 0.6 });
    } else {
      progress.value = withTiming(0, { duration: 160 });
    }
  }, [isOpen, hasBeenShown, progress]);

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
  }));

  const panelStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: (1 - progress.value) * (panelWidth + 16) }],
  }));

  // Stable list — only re-buckets on real order changes.
  const onlineOrders = useOnlineOrders();

  const sections = useMemo<DrawerSection[]>(() => {
    const buckets: Record<SectionKey, string[]> = {
      new: [],
      kitchen: [],
      ready: [],
    };
    for (const o of onlineOrders) {
      const key = o.db_order_id ?? o.id;
      switch (o.order_status) {
        case "pending":
          buckets.new.push(key);
          break;
        case "accepted":
        case "sent_to_kitchen":
        case "preparing":
          buckets.kitchen.push(key);
          break;
        case "ready":
          buckets.ready.push(key);
          break;
      }
    }
    return SECTION_DEFS.filter((d) => buckets[d.key].length > 0).map((d) => ({
      ...d,
      data: buckets[d.key],
    }));
  }, [onlineOrders]);

  // Arrivals while the drawer is open are marked seen immediately (staff is
  // looking at the list). markManySeen no-ops when nothing is new, so this
  // effect can't loop with the seen-map subscription in the unseen selector.
  useEffect(() => {
    if (!isOpen) return;
    const keys: string[] = [];
    for (const s of sections) keys.push(...s.data);
    if (keys.length > 0) {
      useOnlineOrderDrawerStore.getState().markManySeen(keys);
    }
  }, [isOpen, sections]);

  // Close on any navigation — covers the card's internal "View Order
  // Details" link and the "View board" button with zero card changes.
  const pathname = usePathname();
  const prevPathRef = useRef(pathname);
  useEffect(() => {
    if (pathname !== prevPathRef.current) {
      prevPathRef.current = pathname;
      if (isOpen) useOnlineOrderDrawerStore.getState().closeDrawer();
    }
  }, [pathname, isOpen]);

  const closeDrawer = () => useOnlineOrderDrawerStore.getState().closeDrawer();

  const openBoard = () => {
    closeDrawer();
    router.push("/online-orders");
  };

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents={isOpen ? "auto" : "none"}>
      {/* Backdrop */}
      <Animated.View
        style={[
          StyleSheet.absoluteFill,
          { backgroundColor: "rgba(0,0,0,0.45)" },
          backdropStyle,
        ]}
      >
        <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} />
      </Animated.View>

      {/* Panel */}
      <Animated.View
        style={[
          {
            position: "absolute",
            top: 0,
            right: 0,
            bottom: 0,
            width: panelWidth,
            backgroundColor: colors.panel,
            borderLeftWidth: 1,
            borderLeftColor: colors.border,
            shadowColor: "#000",
            shadowOffset: { width: -4, height: 0 },
            shadowOpacity: 0.35,
            shadowRadius: 12,
            elevation: 16,
          },
          panelStyle,
        ]}
      >
        {hasBeenShown && (
          <>
            {/* Header */}
            <View
              className="flex-row items-center justify-between px-4 py-3 border-b"
              style={{ borderBottomColor: colors.border }}
            >
              <Text className="text-xl font-bold text-heading">
                Online Orders
              </Text>
              <View className="flex-row items-center gap-x-2">
                <TouchableOpacity
                  onPress={openBoard}
                  className="flex-row items-center gap-x-1.5 px-3 py-2 rounded-xl border"
                  style={{
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  }}
                >
                  <LayoutGrid size={16} color={colors.label} />
                  <Text className="text-sm font-semibold text-label">
                    View board
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={closeDrawer}
                  className="p-2 rounded-xl border"
                  style={{
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  }}
                >
                  <X size={18} color={colors.label} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Sections */}
            {sections.length === 0 ? (
              <View className="flex-1 items-center justify-center px-6">
                <Text className="text-base font-semibold text-label text-center">
                  No active online orders
                </Text>
                <Text className="text-sm text-muted text-center mt-1">
                  New orders will appear here as they come in.
                </Text>
              </View>
            ) : (
              <SectionList
                sections={sections}
                keyExtractor={(item) => item}
                stickySectionHeadersEnabled={false}
                contentContainerStyle={{ padding: 12, paddingBottom: 24 }}
                renderSectionHeader={({ section }) => (
                  <View className="flex-row items-center gap-x-2 mt-2 mb-2">
                    <View
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: 5,
                        backgroundColor: (section as DrawerSection).color,
                      }}
                    />
                    <Text className="text-base font-bold text-heading">
                      {(section as DrawerSection).title}
                    </Text>
                    <Text className="text-sm font-semibold text-muted">
                      {(section as DrawerSection).data.length}
                    </Text>
                  </View>
                )}
                renderItem={({ item, section }) => (
                  <View className="mb-3">
                    <OnlineOrderCard
                      orderId={item}
                      variant={(section as DrawerSection).variant}
                    />
                  </View>
                )}
              />
            )}
          </>
        )}
      </Animated.View>
    </View>
  );
};

export default memo(OnlineOrderDrawer);
