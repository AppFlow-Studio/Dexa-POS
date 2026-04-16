import { colors } from "@/lib/theme";
import { useMenuStore } from "@/stores/useMenuStore";
import { usePinOverrideStore } from "@/stores/usePinOverrideStore";
import { Clock, Lock, ShieldCheck, X } from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
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
    paddingTop: 10,
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
    gap: 5,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "transparent",
    borderWidth: 1,
    borderColor: "transparent",
  },
  tabActive: {
    backgroundColor: `${colors.teal}18`,
    borderColor: `${colors.teal}30`,
  },
  tabLocked: {
    backgroundColor: colors.screen,
    borderColor: colors.border,
    opacity: 0.7,
  },
  tabText: {
    fontSize: 13,
    fontWeight: "500",
    color: 'white',
  },
  tabTextActive: {
    color: colors.teal,
    fontWeight: "700",
  },
  tabTextLocked: {
    color: colors.label,
  },
  unlockBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: colors.teal + "15",
    borderWidth: 1,
    borderColor: colors.teal + "30",
    marginRight: 4,
    marginLeft: 8,
  },
});

// ─── Unlock session badge ────────────────────────────────────────────────────

const UnlockBadge = React.memo(() => {
  const { isUnlocked, unlockedUntil, lockNow } = usePinOverrideStore();
  const [, tick] = useState(0);

  // Re-render every 30 s to keep countdown fresh
  useEffect(() => {
    const id = setInterval(() => tick((n) => n + 1), 30_000);
    return () => clearInterval(id);
  }, []);

  if (!isUnlocked() || !unlockedUntil) return null;

  const remainingMs = unlockedUntil - Date.now();
  const remainingMin = Math.max(1, Math.ceil(remainingMs / 60_000));

  return (
    <View style={styles.unlockBadge}>
      <ShieldCheck size={12} color={colors.teal} />
      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.teal }}>
        Manager Mode · {remainingMin}m
      </Text>
      <TouchableOpacity onPress={lockNow} hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}>
        <X size={11} color={colors.teal} />
      </TouchableOpacity>
    </View>
  );
});
UnlockBadge.displayName = "UnlockBadge";

// ─── Main component ───────────────────────────────────────────────────────────

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
  const temporaryActiveMenus = useMenuStore((s) => s.temporaryActiveMenus);
  const addTemporaryCategoryAccess = useMenuStore((s) => s.addTemporaryCategoryAccess);
  const { requestPinOverride, isUnlocked } = usePinOverrideStore();

  const currentMenu = useMemo(
    () => menus.find(
      (m) => m.isActive && (isMenuAvailableNow(m.id) || temporaryActiveMenus.includes(m.name)) && m.name === activeMeal,
    ),
    [menus, activeMeal, isMenuAvailableNow, temporaryActiveMenus],
  );
  const categories = currentMenu?.categories;

  const handleCategoryPress = useCallback(
    (tab: string, isAvailable: boolean) => {
      if (isAvailable) {
        onCategoryChange(tab);
        return;
      }
      // If a manager session is active, bypass PIN and grant directly
      if (isUnlocked()) {
        addTemporaryCategoryAccess(tab);
        onCategoryChange(tab);
        return;
      }
      requestPinOverride({ type: "select_category", payload: { categoryName: tab } });
    },
    [onCategoryChange, requestPinOverride, isUnlocked, addTemporaryCategoryAccess],
  );

  return (
    <View style={styles.wrapper}>
      <View style={{ flexDirection: "row", alignItems: "center" }}>
        {/* Unlock session badge — only visible when manager mode is active */}
        <UnlockBadge />

        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={[styles.scrollContent, { paddingVertical: 0, paddingBottom: 10 }]}
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
            const showLock = isScheduled && !isAvailable;

            return (
              <TouchableOpacity
                key={cat.id || tab}
                onPress={() => handleCategoryPress(tab, isAvailable)}
                style={[
                  styles.tab,
                  isActive && styles.tabActive,
                  showLock && !isActive && styles.tabLocked,
                ]}
                activeOpacity={0.7}
              >
                {showLock && (
                  <Lock size={11} color={hasOverride ? colors.teal : colors.muted} />
                )}
                <Text
                  style={[
                    styles.tabText,
                    isActive && styles.tabTextActive,
                    showLock && !isActive && styles.tabTextLocked,
                  ]}
                >
                  {tab}
                </Text>
                {isScheduled && !isNormallyAvailable && hasOverride && (
                  <Clock size={11} color={colors.teal} />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
};

export default React.memo(MenuControls);
