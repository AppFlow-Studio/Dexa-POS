import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useMenuStore } from "@/stores/useMenuStore";
import { router, usePathname } from "expo-router";
import {
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Layers,
  ListOrdered,
  Plus,
  Settings2,
  Sliders,
} from "lucide-react-native";
import React, { useEffect, useMemo, useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

// Sidebar Tab Types
type SidebarTab = "menus" | "categories" | "items" | "modifiers" | "schedules";

interface MenuSidebarProps {
  activeTab?: SidebarTab;
  onTabChange?: (tab: SidebarTab) => void;
}

const EXPANDED_WIDTH = 220;
const COLLAPSED_WIDTH = 72;

const TAB_CONFIG: {
  id: SidebarTab;
  label: string;
  icon: React.ComponentType<any>;
}[] = [
  { id: "menus", label: "Menus", icon: Layers },
  { id: "categories", label: "Categories", icon: ListOrdered },
  { id: "items", label: "Items", icon: Settings2 },
  { id: "modifiers", label: "Modifiers", icon: Sliders },
  { id: "schedules", label: "Schedules", icon: CalendarClock },
];

const MenuSidebar = React.memo(
  function MenuSidebarComponent({
    activeTab: externalActiveTab,
    onTabChange,
  }: MenuSidebarProps) {
    const menuItems = useMenuStore((s) => s.menuItems);
    const storeCategories = useMenuStore((s) => s.categories);
    const storeMenus = useMenuStore((s) => s.menus);
    const modifierGroups = useMenuStore((s) => s.modifierGroups);
    const pathname = usePathname();
    const uiScale = useUiScale();
    const s = (n: number) => Math.round(n * uiScale);

    const [isExpanded, setIsExpanded] = useState(true);
    const widthSV = useSharedValue(EXPANDED_WIDTH);
    const opacitySV = useSharedValue(1);

    const getActiveTab = (): SidebarTab => {
      if (
        pathname.includes("/menu/add-menu") ||
        pathname.includes("/menu/edit-menu")
      ) {
        return "menus";
      }
      if (
        pathname.includes("/menu/add-category") ||
        pathname.includes("/menu/edit-category")
      ) {
        return "categories";
      }
      if (
        pathname.includes("/menu/add-item") ||
        pathname.includes("/menu/edit-item")
      ) {
        return "items";
      }
      if (
        pathname.includes("/menu/add-modifier") ||
        pathname.includes("/menu/edit-modifier")
      ) {
        return "modifiers";
      }
      if (pathname.includes("/menu") && pathname.endsWith("/menu")) {
        return "menus";
      }
      return "menus";
    };

    const activeTab =
      externalActiveTab !== undefined ? externalActiveTab : getActiveTab();

    const menus = useMemo(
      () =>
        storeMenus.map((storeMenu) => ({
          ...storeMenu,
          categories: storeMenu.categories || [],
          schedules: storeMenu.schedules || [],
        })),
      [storeMenus]
    );

    const getCounts = (tab: SidebarTab): number | null => {
      switch (tab) {
        case "menus":
          return menus.length;
        case "categories":
          return storeCategories.length;
        case "items":
          return menuItems.length;
        case "modifiers":
          return modifierGroups.length;
        default:
          return null;
      }
    };

    const handleTabPress = (tab: SidebarTab) => {
      if (onTabChange) {
        if (pathname.includes("/menu/") && pathname.split("/").length > 2) {
          router.push(`/menu`);
        }
        onTabChange(tab);
        return;
      }
      router.push("/menu");
    };

    const handleAddPress = () => {
      switch (activeTab) {
        case "menus":
          router.push("/menu/add-menu");
          break;
        case "categories":
          router.push("/menu/add-category");
          break;
        case "items":
          router.push("/menu/add-item");
          break;
        case "modifiers":
          router.push("/menu/add-modifier");
          break;
        default:
          break;
      }
    };

    const toggleSidebar = () => {
      setIsExpanded((prev) => !prev);
    };

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

    const showAdd = activeTab !== "schedules";

    return (
      <Animated.View
        style={[
          containerStyle,
          {
            backgroundColor: colors.panel,
            borderRightWidth: 1,
            borderRightColor: colors.border,
            height: "100%",
            position: "relative",
          },
        ]}
      >
        {/* Floating Toggle Button */}
        <TouchableOpacity
          onPress={toggleSidebar}
          hitSlop={{ top: s(20), bottom: s(20), left: s(20), right: s(20) }}
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

        {/* Header */}
        <Animated.View
          style={[
            textStyle,
            {
              paddingHorizontal: s(14),
              paddingVertical: s(12),
              borderBottomWidth: 1,
              borderBottomColor: colors.border,
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "space-between",
            },
          ]}
        >
          <Text
            style={{
              fontSize: s(15),
              fontWeight: "700",
              color: colors.heading,
            }}
          >
            Menu Management
          </Text>
          {showAdd && (
            <TouchableOpacity
              onPress={handleAddPress}
              style={{
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "50",
                borderRadius: s(8),
                padding: s(6),
              }}
            >
              <Plus size={s(14)} color={colors.teal} />
            </TouchableOpacity>
          )}
        </Animated.View>

        {/* Tabs */}
        <View style={{ flex: 1 }}>
          {TAB_CONFIG.map((tab) => {
            const isActive = activeTab === tab.id;
            const count = getCounts(tab.id);
            const Icon = tab.icon;

            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => handleTabPress(tab.id)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  justifyContent: isExpanded ? "flex-start" : "center",
                  paddingHorizontal: isExpanded ? 14 : 8,
                  paddingVertical: s(10),
                  borderBottomWidth: 1,
                  borderBottomColor: colors.border,
                  backgroundColor: isActive
                    ? colors.teal + "10"
                    : "transparent",
                  borderLeftWidth: isActive ? 2 : 0,
                  borderLeftColor: colors.teal,
                }}
              >
                <View
                  style={{
                    width: s(32),
                    height: s(32),
                    borderRadius: s(9),
                    backgroundColor: isActive
                      ? colors.teal + "20"
                      : colors.card,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: isExpanded ? 10 : 0,
                    flexShrink: 0,
                  }}
                >
                  <Icon
                    size={s(16)}
                    color={isActive ? colors.teal : colors.label}
                  />
                </View>
                <Animated.View style={[textStyle, { flex: 1 }]}>
                  <Text
                    style={{
                      fontSize: s(13),
                      fontWeight: isActive ? "600" : "400",
                      color: isActive ? colors.teal : colors.label,
                    }}
                  >
                    {tab.label}
                  </Text>
                </Animated.View>
                {count !== null && (
                  <Animated.View
                    style={[
                      textStyle,
                      {
                        backgroundColor: isActive
                          ? colors.teal + "20"
                          : colors.card,
                        borderRadius: s(10),
                        paddingHorizontal: s(6),
                        paddingVertical: s(2),
                        minWidth: s(20),
                        alignItems: "center",
                        flexShrink: 0,
                      },
                    ]}
                  >
                    <Text
                      style={{
                        fontSize: s(10),
                        fontWeight: "600",
                        color: isActive ? colors.teal : colors.muted,
                      }}
                    >
                      {count}
                    </Text>
                  </Animated.View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </Animated.View>
    );
  }
);

MenuSidebar.displayName = "MenuSidebar";

export default MenuSidebar;
