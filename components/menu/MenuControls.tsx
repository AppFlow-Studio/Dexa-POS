import { useMenuStore } from "@/stores/useMenuStore";
import { usePinOverrideStore } from "@/stores/usePinOverrideStore";
import type { TriggerRef } from "@rn-primitives/select";
import { Clock } from "lucide-react-native";
import React from "react";
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
  const {
    menus,
    categories: storeCategories,
    isMenuAvailableNow,
    isCategoryAvailableNow,
    isCategoryActiveForMenu,
    getCategoryScheduleInfo,
    temporaryActiveCategories,
  } = useMenuStore();
  const { requestPinOverride } = usePinOverrideStore();
  const visibleMenus = menus.filter(
    (m) => m.isActive && isMenuAvailableNow(m.id)
  );
  // Trigger re-render every minute so availability updates as time passes
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  React.useEffect(() => {
    const interval = setInterval(() => {
      forceUpdate();
    }, 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  const currentMenu = visibleMenus.find((menu) => menu.name === activeMeal);
  const categories = currentMenu?.categories;
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
    <View className="flex-row justify-between items-start gap-4">
      {/* Left Section: All Tabs */}
      <View className="bg-[#303030] w-full p-2 rounded-2xl flex-shrink flex flex-row items-center justify-between">
        {/* Category Pills Container */}
        <View className="flex-1 p-2 rounded-xl flex-row items-center gap-2">
          <ScrollView
            horizontal
            className=" p-2 rounded-lg w-fit bg-[#303030] "
          >
            {categories?.map((tab, index) => {
              const catObj = storeCategories.find((c) => c.name === tab);
              const isScheduled =
                catObj?.schedules && catObj.schedules.length > 0;
              const isNormallyAvailable =
                isCategoryAvailableNow(tab) && currentMenu && catObj
                  ? isCategoryActiveForMenu(currentMenu.id, catObj.id)
                  : false;
              const hasOverride = temporaryActiveCategories.includes(tab);

              const isAvailable = isNormallyAvailable || hasOverride;
              const dotColor = isAvailable ? "#10B981" : "#EF4444";
              const isDisabled = !isAvailable;

              return (
                <View key={tab} className="w-fit flex-row items-center">
                  <TouchableOpacity
                    onPress={() => !isDisabled && onCategoryChange(tab)}
                    className={`py-3 px-6 rounded-full flex-row items-center gap-2 ${
                      activeCategory === tab
                        ? "border border-accent-300 bg-accent-100"
                        : isDisabled
                          ? "border border-gray-600 bg-gray-700 opacity-60"
                          : "border border-transparent"
                    }`}
                  >
                    {/* Availability dot */}
                    <View
                      className="w-3.5 h-3.5 rounded-full"
                      style={{ backgroundColor: dotColor }}
                    />
                    <Text
                      className={`font-semibold text-2xl ${
                        activeCategory === tab
                          ? "text-accent-400"
                          : isDisabled
                            ? "text-gray-400"
                            : "text-accent-100"
                      }`}
                    >
                      {tab}
                    </Text>
                    {isScheduled && !isNormallyAvailable && (
                      <Clock
                        size={16}
                        color={hasOverride ? "#60A5FA" : "#9CA3AF"}
                      />
                    )}
                  </TouchableOpacity>
                  <View
                    className={`${index !== categories.length - 1 ? "border-r border-gray-400 h-[50%] mx-3" : ""}`}
                  />
                </View>
              );
            })}
          </ScrollView>
        </View>
      </View>
    </View>
  );
};

export default MenuControls;
