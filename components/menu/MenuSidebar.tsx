import { colors } from "@/lib/theme";
import { useMenuStore } from "@/stores/useMenuStore";
import { router, usePathname } from "expo-router";
import {
  CalendarClock,
  Layers,
  ListOrdered,
  Plus,
  Settings2,
  Sliders,
} from "lucide-react-native";
import React, { useMemo } from "react";
import { Text, TouchableOpacity, View } from "react-native";

// Sidebar Tab Types
type SidebarTab = "menus" | "categories" | "items" | "modifiers" | "schedules";

interface MenuSidebarProps {
  activeTab?: SidebarTab;
  onTabChange?: (tab: SidebarTab) => void;
}

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
  ({
    activeTab: externalActiveTab,
    onTabChange,
  }: MenuSidebarProps) => {
    const menuItems = useMenuStore((s) => s.menuItems);
    const storeCategories = useMenuStore((s) => s.categories);
    const storeMenus = useMenuStore((s) => s.menus);
    const modifierGroups = useMenuStore((s) => s.modifierGroups);
    const pathname = usePathname();

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

    const showAdd = activeTab !== "schedules";

    return (
      <View
        style={{
          width: 220,
          backgroundColor: colors.panel,
          borderRightWidth: 1,
          borderRightColor: colors.border,
          height: "100%",
        }}
      >
        {/* Header */}
        <View
          style={{
            paddingHorizontal: 14,
            paddingVertical: 12,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Text
            style={{
              fontSize: 15,
              fontWeight: "700",
              color: colors.heading,
            }}
          >
            Menu Mgmt
          </Text>
          {showAdd && (
            <TouchableOpacity
              onPress={handleAddPress}
              style={{
                backgroundColor: colors.teal + "20",
                borderWidth: 1,
                borderColor: colors.teal + "50",
                borderRadius: 8,
                padding: 6,
              }}
            >
              <Plus size={14} color={colors.teal} />
            </TouchableOpacity>
          )}
        </View>

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
                  paddingHorizontal: 14,
                  paddingVertical: 10,
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
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    backgroundColor: isActive
                      ? colors.teal + "20"
                      : colors.card,
                    alignItems: "center",
                    justifyContent: "center",
                    marginRight: 10,
                  }}
                >
                  <Icon
                    size={14}
                    color={isActive ? colors.teal : colors.label}
                  />
                </View>
                <Text
                  style={{
                    flex: 1,
                    fontSize: 13,
                    fontWeight: isActive ? "600" : "400",
                    color: isActive ? colors.teal : colors.label,
                  }}
                >
                  {tab.label}
                </Text>
                {count !== null && (
                  <View
                    style={{
                      backgroundColor: isActive
                        ? colors.teal + "20"
                        : colors.card,
                      borderRadius: 10,
                      paddingHorizontal: 6,
                      paddingVertical: 2,
                      minWidth: 20,
                      alignItems: "center",
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: "600",
                        color: isActive ? colors.teal : colors.muted,
                      }}
                    >
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  }
);

export default MenuSidebar;
