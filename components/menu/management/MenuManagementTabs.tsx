/**
 * Top tab strip for menu management, styled like Inventory's: a panel-coloured
 * track, a teal underline on the active tab, a count per tab. It scrolls
 * sideways when the screen is too narrow for all five, instead of squeezing
 * the labels. The 86'd shortcut and refresh sit to its right.
 */
import React from "react";
import { ScrollView, Text, TouchableOpacity, View } from "react-native";

import { useOutOfStockCount } from "@/hooks/menu/useMenuManagementData";
import {
  Ban,
  CalendarClock,
  Layers,
  ListOrdered,
  Package,
  RefreshCw,
  Sliders,
  type LucideIcon,
} from "@/lib/icons";
import { colors } from "@/lib/theme";
import {
  useMenuManagementUiStore,
  type MenuManagementTab,
} from "@/stores/useMenuManagementUiStore";
import { useMenuStore } from "@/stores/useMenuStore";

import { Button, useS } from "./ui";

const TABS: { id: MenuManagementTab; label: string; icon: LucideIcon }[] = [
  { id: "menus", label: "Menus", icon: Layers },
  { id: "categories", label: "Categories", icon: ListOrdered },
  { id: "items", label: "Items", icon: Package },
  { id: "modifiers", label: "Modifiers", icon: Sliders },
  { id: "schedules", label: "Schedules", icon: CalendarClock },
];

interface MenuManagementTabsProps {
  onRefresh: () => void;
  isRefreshing: boolean;
  onOpenOutOfStock: () => void;
  canWrite: boolean;
}

function MenuManagementTabs({
  onRefresh,
  isRefreshing,
  onOpenOutOfStock,
  canWrite,
}: MenuManagementTabsProps) {
  const s = useS();
  const activeTab = useMenuManagementUiStore((st) => st.activeTab);
  const setActiveTab = useMenuManagementUiStore((st) => st.setActiveTab);
  const menuCount = useMenuStore((st) => st.menus.length);
  const categoryCount = useMenuStore((st) => st.categories.length);
  const itemCount = useMenuStore((st) => st.menuItems.length);
  const modifierCount = useMenuStore((st) => st.modifierGroups.length);
  const outOfStockCount = useOutOfStockCount();

  const counts: Record<MenuManagementTab, number | null> = {
    menus: menuCount,
    categories: categoryCount,
    items: itemCount,
    modifiers: modifierCount,
    schedules: null,
  };

  // The side buttons match the strip's outer height: tab + padding + border.
  const tabHeight = s(40);
  const stripPadding = s(4);
  const controlHeight = { height: tabHeight + stripPadding * 2 + 2 };

  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: s(10) }}>
      <View
        style={{
          flex: 1,
          backgroundColor: colors.panel,
          borderWidth: 1,
          borderColor: colors.border,
          borderRadius: s(12),
          padding: stripPadding,
        }}
      >
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={{ gap: s(2) }}
        >
          {TABS.map((tab) => {
            const active = tab.id === activeTab;
            const count = counts[tab.id];
            const Icon = tab.icon;
            return (
              <TouchableOpacity
                key={tab.id}
                onPress={() => setActiveTab(tab.id)}
                accessibilityRole="tab"
                accessibilityState={{ selected: active }}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: s(8),
                  height: tabHeight,
                  paddingHorizontal: s(14),
                  borderRadius: s(8),
                  backgroundColor: active ? colors.teal + "12" : colors.panel,
                }}
              >
                {active && (
                  // A separate bar, not borderBottom: a one-sided border on a
                  // rounded view bends around the corners on Android.
                  <View
                    style={{
                      position: "absolute",
                      left: s(10),
                      right: s(10),
                      bottom: 0,
                      height: 2,
                      borderRadius: 1,
                      backgroundColor: colors.teal,
                    }}
                  />
                )}
                <Icon size={s(16)} color={active ? colors.teal : colors.label} />
                <Text
                  style={{
                    fontSize: s(14),
                    fontWeight: active ? "700" : "500",
                    color: active ? colors.teal : colors.label,
                  }}
                >
                  {tab.label}
                </Text>
                {count !== null && (
                  <View
                    style={{
                      minWidth: s(24),
                      height: s(20),
                      paddingHorizontal: s(6),
                      borderRadius: s(10),
                      alignItems: "center",
                      justifyContent: "center",
                      backgroundColor: active ? colors.teal + "22" : colors.card,
                    }}
                  >
                    <Text
                      style={{
                        fontSize: s(11),
                        fontWeight: "700",
                        color: active ? colors.teal : colors.muted,
                      }}
                    >
                      {count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {outOfStockCount > 0 && (
        <Button
          variant="danger"
          icon={Ban}
          label={`${outOfStockCount} 86'd`}
          accessibilityLabel={`${outOfStockCount} out of stock. Manage out of stock`}
          onPress={onOpenOutOfStock}
          disabled={!canWrite}
          style={controlHeight}
        />
      )}
      <Button
        icon={RefreshCw}
        accessibilityLabel="Refresh menu from server"
        onPress={onRefresh}
        loading={isRefreshing}
        style={[controlHeight, { width: controlHeight.height }]}
      />
    </View>
  );
}

export default React.memo(MenuManagementTabs);
