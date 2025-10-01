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
      <View className="bg-[#303030] w-full p-1.5 rounded-xl flex-shrink flex flex-row items-center justify-between">
        <View className="flex-1 flex-row items-center gap-2">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerClassName="gap-x-2"
          >
            {categories?.map((tab) => {
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

              const handlePress = () => {
                if (isAvailable) {
                  onCategoryChange(tab);
                } else {
                  requestPinOverride({
                    type: "select_category",
                    payload: { categoryName: tab },
                  });
                }
              };

              return (
                <TouchableOpacity
                  key={tab}
                  onPress={handlePress}
                  className={`py-2 px-4 rounded-lg flex-row items-center gap-2 ${
                    activeCategory === tab
                      ? "bg-[#212121]"
                      : !isAvailable
                        ? "bg-gray-700 opacity-60"
                        : "bg-transparent"
                  }`}
                >
                  <View
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: dotColor }}
                  />
                  <Text
                    className={`font-semibold text-lg ${
                      activeCategory === tab
                        ? "text-blue-400"
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
                      color={hasOverride ? "#60A5FA" : "#9CA3AF"}
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

export default MenuControls;
