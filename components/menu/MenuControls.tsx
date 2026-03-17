import { colors } from "@/lib/theme";
import { useMenuStore } from "@/stores/useMenuStore";
import { usePinOverrideStore } from "@/stores/usePinOverrideStore";
import { Clock } from "lucide-react-native";
import React, { useMemo, useCallback } from "react";
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

interface MenuControlsProps {
  activeMeal: string;
  onMealChange?: (meal: string) => void;
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

const styles = StyleSheet.create({
  wrapper: {
    width: "100%",
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: `${colors.border}50`,
  },
  scrollContent: {
    paddingHorizontal: 8,
    gap: 6,
    alignItems: "center",
  },
  tab: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "transparent",
  },
  tabActive: {
    backgroundColor: `${colors.teal}18`,
  },
  tabUnavailable: {
    opacity: 0.4,
  },
  tabText: {
    fontSize: 14,
    fontWeight: "500",
    color: colors.muted,
  },
  tabTextActive: {
    color: colors.teal,
    fontWeight: "700",
  },
  tabTextUnavailable: {
    color: colors.muted,
  },
});

const MenuControls: React.FC<MenuControlsProps> = ({
  activeMeal,

  activeCategory,
  onCategoryChange,
}) => {
  const menus = useMenuStore((s) => s.menus);
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);
  const isCategoryActiveForMenu = useMenuStore((s) => s.isCategoryActiveForMenu);
  const temporaryActiveCategories = useMenuStore((s) => s.temporaryActiveCategories);
  const { requestPinOverride } = usePinOverrideStore();

  const currentMenu = useMemo(
    () => menus.find((m) => m.isActive && isMenuAvailableNow(m.id) && m.name === activeMeal),
    [menus, activeMeal, isMenuAvailableNow],
  );
  const categories = currentMenu?.categories;

  const handleCategoryPress = useCallback(
    (tab: string, isAvailable: boolean) => {
      if (isAvailable) {
        onCategoryChange(tab);
      } else {
        requestPinOverride({
          type: "select_category",
          payload: { categoryName: tab },
        });
      }
    },
    [onCategoryChange, requestPinOverride],
  );

  return (
    <View style={styles.wrapper}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollContent}
      >
        {categories?.map((cat) => {
          const tab = cat.name;
          const isScheduled = cat.schedules && cat.schedules.length > 0;
          const isNormallyAvailable =
            isCategoryAvailableNow(tab) && currentMenu
              ? isCategoryActiveForMenu(currentMenu.id, cat.id)
              : false;
          const hasOverride = temporaryActiveCategories.includes(tab);
          const isAvailable = isNormallyAvailable || hasOverride;
          const isActive = activeCategory === tab;

          return (
            <TouchableOpacity
              key={cat.id || tab}
              onPress={() => handleCategoryPress(tab, isAvailable)}
              style={[
                styles.tab,
                isActive && styles.tabActive,
                !isAvailable && styles.tabUnavailable,
              ]}
              activeOpacity={0.7}
            >

              <Text
                style={[
                  styles.tabText,
                  isActive && styles.tabTextActive,
                  !isAvailable && !isActive && styles.tabTextUnavailable,
                ]}
              >
                {tab}
              </Text>
              {isScheduled && !isNormallyAvailable && (
                <Clock
                  size={12}
                  color={hasOverride ? colors.info : colors.label}
                />
              )}
            </TouchableOpacity>
          );
        })}
      </ScrollView>
    </View>
  );
};

export default React.memo(MenuControls);
