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
import { LayoutGrid, ShoppingBag, X } from "lucide-react-native";
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
  { key: "new", title: "New Orders", color: String(colors.teal), variant: "new" },
  { key: "kitchen", title: "In Kitchen", color: "#ef4444", variant: "kitchen" },
  { key: "ready", title: "Ready", color: "#22c55e", variant: "ready" },
];

type DrawerSection = (typeof SECTION_DEFS)[number] & { data: string[] };

interface OnlineOrderDrawerProps {
  /**
   * KDS stations render without the shared header/back affordance, so the
   * POS-only navigation (View board, card detail links) is hidden — the
   * drawer is act-in-place there.
   */
  kdsMode?: boolean;
}

/**
 * Global right-hand slide-out drawer for triaging online orders without
 * leaving the current screen. Pre-mounted shell (AttachedModifierPanel
 * recipe): visibility is animation-driven, list content mounts on first open
 * and stays mounted after. Open state lives in useOnlineOrderDrawerStore —
 * opening marks all active online orders "seen" (clears the edge-tab badge).
 */
const OnlineOrderDrawer: React.FC<OnlineOrderDrawerProps> = ({
  kdsMode = false,
}) => {
  const isOpen = useOnlineOrderDrawerStore(selectIsOpen);
  const uiScale = useUiScale();
  const panelWidth = Math.round(BASE_PANEL_WIDTH * uiScale);

  const [hasBeenShown, setHasBeenShown] = useState(false);

  // 0 = closed, 1 = open. translateX/backdrop opacity both derive from it.
  const progress = useSharedValue(0);

  useEffect(() => {
    if (isOpen) {
      if (!hasBeenShown) setHasBeenShown(true);
      progress.value = withSpring(1, {
        damping: 25,
        stiffness: 400,
        mass: 0.6,
      });
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
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents={isOpen ? "auto" : "none"}
    >
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
            borderTopLeftRadius: 20,
            borderBottomLeftRadius: 20,
            overflow: "hidden",
            shadowColor: "#000",
            shadowOffset: { width: -4, height: 0 },
            shadowOpacity: 0.35,
            shadowRadius: 16,
            elevation: 16,
          },
          panelStyle,
        ]}
      >
        {hasBeenShown && (
          <>
            {/* Header */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                paddingHorizontal: Math.round(16 * uiScale),
                paddingVertical: Math.round(12 * uiScale),
                borderBottomWidth: 1,
                borderBottomColor: colors.border,
              }}
            >
              <View
                style={{ flexDirection: "row", alignItems: "center", gap: Math.round(10 * uiScale) }}
              >
                <View
                  style={{
                    width: Math.round(34 * uiScale),
                    height: Math.round(34 * uiScale),
                    borderRadius: Math.round(11 * uiScale),
                    backgroundColor: colors.teal + "1A",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <ShoppingBag
                    size={Math.round(18 * uiScale)}
                    color={colors.teal}
                  />
                </View>
                <Text
                  style={{
                    fontSize: Math.round(20 * uiScale),
                    fontWeight: "700",
                    color: colors.heading,
                  }}
                >
                  Online Orders
                </Text>
              </View>
              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: Math.round(8 * uiScale),
                }}
              >
                {!kdsMode && (
                  <TouchableOpacity
                    onPress={openBoard}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: Math.round(6 * uiScale),
                      paddingHorizontal: Math.round(12 * uiScale),
                      paddingVertical: Math.round(8 * uiScale),
                      borderRadius: Math.round(12 * uiScale),
                      borderWidth: 1,
                      borderColor: colors.border,
                      backgroundColor: colors.card,
                    }}
                  >
                    <LayoutGrid
                      size={Math.round(16 * uiScale)}
                      color={colors.label}
                    />
                    <Text
                      style={{
                        fontSize: Math.round(14 * uiScale),
                        fontWeight: "600",
                        color: colors.label,
                      }}
                    >
                      View board
                    </Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity
                  onPress={closeDrawer}
                  style={{
                    padding: Math.round(8 * uiScale),
                    borderRadius: Math.round(12 * uiScale),
                    borderWidth: 1,
                    borderColor: colors.border,
                    backgroundColor: colors.card,
                  }}
                >
                  <X size={Math.round(18 * uiScale)} color={colors.label} />
                </TouchableOpacity>
              </View>
            </View>

            {/* Sections */}
            {sections.length === 0 ? (
              <View
                style={{
                  flex: 1,
                  alignItems: "center",
                  justifyContent: "center",
                  paddingHorizontal: Math.round(24 * uiScale),
                }}
              >
                <Text
                  style={{
                    fontSize: Math.round(16 * uiScale),
                    fontWeight: "600",
                    color: colors.label,
                    textAlign: "center",
                  }}
                >
                  No active online orders
                </Text>
                <Text
                  style={{
                    fontSize: Math.round(14 * uiScale),
                    color: colors.muted,
                    textAlign: "center",
                    marginTop: Math.round(4 * uiScale),
                  }}
                >
                  New orders will appear here as they come in.
                </Text>
              </View>
            ) : (
              <SectionList
                sections={sections}
                keyExtractor={(item) => item}
                stickySectionHeadersEnabled={false}
                contentContainerStyle={{
                  padding: Math.round(12 * uiScale),
                  paddingBottom: Math.round(24 * uiScale),
                }}
                renderSectionHeader={({ section }) => (
                  <View
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: Math.round(8 * uiScale),
                      marginTop: Math.round(8 * uiScale),
                      marginBottom: Math.round(8 * uiScale),
                    }}
                  >
                    <View
                      style={{
                        width: Math.round(10 * uiScale),
                        height: Math.round(10 * uiScale),
                        borderRadius: Math.round(5 * uiScale),
                        backgroundColor: (section as DrawerSection).color,
                      }}
                    />
                    <Text
                      style={{
                        fontSize: Math.round(16 * uiScale),
                        fontWeight: "700",
                        color: colors.heading,
                      }}
                    >
                      {(section as DrawerSection).title}
                    </Text>
                    <View
                      style={{
                        minWidth: Math.round(22 * uiScale),
                        paddingHorizontal: Math.round(6 * uiScale),
                        height: Math.round(20 * uiScale),
                        borderRadius: Math.round(10 * uiScale),
                        backgroundColor:
                          (section as DrawerSection).color + "1F",
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      <Text
                        style={{
                          fontSize: Math.round(12 * uiScale),
                          fontWeight: "700",
                          color: (section as DrawerSection).color,
                          textAlign: "center",
                        }}
                      >
                        {(section as DrawerSection).data.length}
                      </Text>
                    </View>
                  </View>
                )}
                renderItem={({ item, section }) => (
                  <View style={{ marginBottom: Math.round(12 * uiScale) }}>
                    <OnlineOrderCard
                      orderId={item}
                      variant={(section as DrawerSection).variant}
                      hideDetailsLink={kdsMode}
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
