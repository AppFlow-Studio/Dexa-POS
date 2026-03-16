import { colors } from "@/lib/theme";
import { useMenuStore } from "@/stores/useMenuStore";
import { usePinOverrideStore } from "@/stores/usePinOverrideStore";
import type { TriggerRef } from "@rn-primitives/select";
import { Clock } from "lucide-react-native";
import React, { useMemo, useCallback } from "react";
import {
  Platform,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

const MEAL_TABS = ["Lunch", "Dinner", "Brunch", "Specials"];
const CATEGORY_TABS = [
  "Appetizers",
  "Main Course",
  "Sides",
  "Drinks",
  "Dessert",
];

// Define the props the component will receive
interface MenuControlsProps {
  activeMeal: string;
  onMealChange: (meal: string) => void;
  activeCategory: string;
  onCategoryChange: (category: string) => void;
}

const MenuControls: React.FC<MenuControlsProps> = ({
  activeMeal,
  onMealChange,
  activeCategory,
  onCategoryChange,
}) => {
  const menus = useMenuStore((s) => s.menus);
  const storeCategories = useMenuStore((s) => s.categories);
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);
  const isCategoryActiveForMenu = useMenuStore((s) => s.isCategoryActiveForMenu);
  const getCategoryScheduleInfo = useMenuStore((s) => s.getCategoryScheduleInfo);
  const temporaryActiveCategories = useMenuStore((s) => s.temporaryActiveCategories);
  const { requestPinOverride } = usePinOverrideStore();

  // OPTIMIZED: Collapsed visibleMenus + currentMenu into a single lookup (no intermediate array)
  // Parent's availabilityTick timer already drives re-renders for availability updates
  const currentMenu = useMemo(
    () => menus.find((m) => m.isActive && isMenuAvailableNow(m.id) && m.name === activeMeal),
    [menus, activeMeal, isMenuAvailableNow],
  );
  const categories = currentMenu?.categories;

  // OPTIMIZED: Single stable handler extracted from .map() loop
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
  const ref = React.useRef<TriggerRef>(null);
  const insets = useSafeAreaInsets();
  const contentInsets = {
    top: insets.top,
    bottom: Platform.select({
      ios: insets.bottom,
      android: insets.bottom + 24,
    }),
    left: 12,
    right: 12,
  };

  return (
    <View className="flex-row justify-between items-start gap-4 w-full">
      <View className="bg-background w-full p-1.5 rounded-xl flex-shrink flex flex-row items-center justify-between">
        <View className="flex-row items-center gap-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-x-2"
          >
            {categories?.map((cat) => {
              const tab = cat.name;
              const catObj = cat; // We already have the object!
              const isScheduled =
                catObj?.schedules && catObj.schedules.length > 0;
              const isNormallyAvailable =
                isCategoryAvailableNow(tab) && currentMenu && catObj
                  ? isCategoryActiveForMenu(currentMenu.id, catObj.id)
                  : false;
              const hasOverride = temporaryActiveCategories.includes(tab);

              const isAvailable = isNormallyAvailable || hasOverride;
              const dotColor = isAvailable ? colors.success : colors.danger;

              return (
                <TouchableOpacity
                  key={cat.id || tab} // Use ID if available
                  onPress={() => handleCategoryPress(tab, isAvailable)}
                  className={`py-2 px-4 rounded-full flex-row items-center gap-2 border ${
                    activeCategory === tab
                      ? "bg-teal/10 border-teal font-semibold"
                      : !isAvailable
                      ? "bg-gray-700 border-transparent opacity-60"
                      : "bg-panel border-transparent"
                  }`}
                >
                  <Text
                    className={` text-lg ${
                      activeCategory === tab
                        ? "text-teal"
                        : !isAvailable
                        ? "text-gray-400"
                        : "text-gray-200"
                    }`}
                  >
                    {tab}
                  </Text>
                  {isScheduled && !isNormallyAvailable && (
                    <Clock
                      size={14}
                      color={hasOverride ? colors.info : colors.label}
                    />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

export default React.memo(MenuControls);
