import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { MenuItemType } from "@/lib/types";
// import { useSearchStore } from "@/stores/searchStore";
import { useMenuStore } from "@/stores/useMenuStore";
// useModifierSidebarStore no longer needed - overlay handles modifier screen
import { useOrderStore } from "@/stores/useOrderStore";
import { useOrderTypeDrawerStore } from "@/stores/useOrderTypeDrawerStore";
import { usePinOverrideStore } from "@/stores/usePinOverrideStore";
import { Link } from "expo-router";
import {
  ChevronDown,
  Clock,
  Logs,
  PackagePlus,
  Search,
  Sofa,
  Table,
} from "lucide-react-native";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { FlatList, Text, TouchableOpacity, View } from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import MenuControls from "./MenuControls";
import MenuItem from "./MenuItem";
// ModifierScreen is now rendered via ModifierScreenOverlay in parent components
import OpenItemAdder from "./OpenItemAdder";
import OrderTypeDrawer from "./OrderTypeDrawer";
import PreviousOrdersSection from "./PreviousOrdersSection";
interface MenuSectionProps {
  onOrderClosedCheck?: () => boolean;
}

// OPTIMIZED: Pre-compiled StyleSheet for spacer (no runtime parsing)
import { useSearchStore } from "@/stores/searchStore";
import { StyleSheet } from "react-native";
import ModifierScreenOverlay from "./ModifierScreenOverlay";

const menuSectionStyles = StyleSheet.create({
  spacer: {
    width: "23%",
  },
});

// OPTIMIZED: WeakMap cache for image sources to prevent object recreation
const imageSourceCache = new WeakMap<MenuItemType, ReturnType<typeof getImageSourceInternal> | undefined>();

const getImageSourceInternal = (item: MenuItemType) => {
  if (item.image && item.image.length > 200) {
    return { uri: `data:image/jpeg;base64,${item.image}` };
  }

  if (item.image) {
    // Try to get image from assets
    try {
      return MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP];
    } catch {
      return undefined;
    }
  }

  return undefined;
};

// Get image source with caching
const getImageSource = (item: MenuItemType) => {
  if (imageSourceCache.has(item)) {
    return imageSourceCache.get(item);
  }
  const source = getImageSourceInternal(item);
  imageSourceCache.set(item, source);
  return source;
};

// OPTIMIZED: Memoized spacer component
const SpacerItem = React.memo(() => <View style={menuSectionStyles.spacer} />);
SpacerItem.displayName = "SpacerItem";
const MenuSection: React.FC<MenuSectionProps> = ({ onOrderClosedCheck }) => {
  // State for the active filters
  const {
    menuItems,
    menus,
    isMenuAvailableNow,
    temporaryActiveMenus,
    isCategoryAvailableNow,
    categories,
    getItemPriceForCategory,
  } = useMenuStore();
  const { requestPinOverride } = usePinOverrideStore();

  // OPTIMIZED: Use O(1) ordersById lookup instead of O(n) orders.find()
  const { activeOrderId, ordersById, updateActiveOrderDetails } = useOrderStore();

  const { isOpen: isOrderTypeDrawerOpen, closeDrawer } =
    useOrderTypeDrawerStore();

  // Tick each minute to refresh availability indicators
  const [availabilityTick, setAvailabilityTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAvailabilityTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const [activeTab, setActiveTab] = useState("Menu");

  // Helper to find the first menu that is currently available or unlocked
  const getFirstAvailableMenu = () => {
    return menus.find(
      (m) => isMenuAvailableNow(m.id) || temporaryActiveMenus.includes(m.name)
    );
  };

  // Initialize with an available menu if possible, otherwise null
  const [activeMeal, setActiveMeal] = useState<string | null>(() => {
    const startMenu = getFirstAvailableMenu();
    return startMenu ? startMenu.name : null; // activeMeal is now nullable string
  });

  const [activeCategory, setActiveCategory] = useState<string | null>(() => {
    const startMenu = getFirstAvailableMenu();
    return startMenu ? startMenu.categories[0] || "" : null;
  });

  const [isMenuDialogOpen, setIsMenuDialogOpen] = useState(false);

  // Effect to ensure we always have a valid available menu selected
  useEffect(() => {
    // If we have an active selection...
    if (activeMeal) {
      const currentMenu = menus.find((m) => m.name === activeMeal);
      // Check if it's still available
      if (currentMenu) {
        const isAvailable =
          isMenuAvailableNow(currentMenu.id) ||
          temporaryActiveMenus.includes(currentMenu.name);
        // If it IS available, we are good.
        if (isAvailable) return;
      }
    }

    // If we reached here, either activeMeal is null OR the current selection is unavailable.
    // Try to auto-switch to the next available one.
    const nextAvailable = getFirstAvailableMenu();

    if (nextAvailable) {
      // Switch to next available
      if (activeMeal !== nextAvailable.name) {
        setActiveMeal(nextAvailable.name);
        setActiveCategory(nextAvailable.categories[0] || "");
      }
    } else {
      // Nothing available: Show graceful "No Menu" state
      if (activeMeal !== null) {
        setActiveMeal(null);
        setActiveCategory(null);
      }
    }
  }, [
    activeMeal,
    menus,
    isMenuAvailableNow,
    temporaryActiveMenus,
    availabilityTick,
  ]);
  // ModifierScreen is now rendered via ModifierScreenOverlay - no subscription needed here

  // State to hold the items that are actually displayed after filtering
  const [filteredMenuItems, setFilteredMenuItems] = useState<MenuItemType[]>(
    []
  );
  const openSearch = useSearchStore((state) => state.openSearch);



  // OPTIMIZED: O(1) lookup via ordersById instead of O(n) orders.find()
  const activeOrder = activeOrderId ? ordersById[activeOrderId] : undefined;
  const currentOrderType = activeOrder?.order_type || "Takeaway";
  const handleOrderTypeSelect = (orderType: string) => {
    if (activeOrderId) {
      updateActiveOrderDetails({ order_type: orderType as any });
    }
  };

  const handleMenuSelect = (menuName: string) => {
    const menu = menus.find((m) => m.name === menuName);
    if (!menu) return;

    const isAvailable =
      isMenuAvailableNow(menu.id) || temporaryActiveMenus.includes(menu.name);

    if (isAvailable) {
      setActiveMeal(menuName);
      setActiveCategory(menu.categories[0] || "");
      setIsMenuDialogOpen(false);
    } else {
      // Request override
      requestPinOverride({ type: "select_menu", payload: { menuName } });
    }
  };

  // Compute next availability window for the active category
  // const nextAvailability = useMemo(() => {
  //   const cat = categories.find((c) => c.name === activeCategory);
  //   const rules = (cat?.schedules || []).filter((r) => r.isActive);
  //   const availableNow = activeCategory
  //     ? isCategoryAvailableNow(activeCategory)
  //     : false;
  //   const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  //   const now = new Date();

  //   let bestStart: Date | null = null;
  //   let bestEnd: Date | null = null;

  //   // Search up to two weeks ahead for the next window
  //   for (let offset = 0; offset < 14 && !availableNow; offset++) {
  //     const check = new Date(now);
  //     check.setDate(now.getDate() + offset);
  //     const dayKey = dayNames[check.getDay()];
  //     const todays = rules.filter((r) => r.days.includes(dayKey as any));
  //     for (const r of todays) {
  //       const [sh, sm] = r.startTime.split(":").map(Number);
  //       const [eh, em] = r.endTime.split(":").map(Number);
  //       const start = new Date(check);
  //       start.setHours(sh, sm || 0, 0, 0);
  //       const end = new Date(check);
  //       end.setHours(eh, em || 0, 0, 0);
  //       if (start > now) {
  //         if (!bestStart || start < bestStart) {
  //           bestStart = start;
  //           bestEnd = end;
  //         }
  //       }
  //     }
  //     if (bestStart) break;
  //   }

  //   return { availableNow, start: bestStart, end: bestEnd };
  // }, [activeCategory, categories, isCategoryAvailableNow, availabilityTick]);

  useEffect(() => {
    if (!activeCategory) {
      setFilteredMenuItems([]);
      return;
    }
    const filtered = menuItems.filter((item) => {
      const categoryMatch = item.category.includes(activeCategory);
      const categoryAvailable = isCategoryAvailableNow(activeCategory);
      return categoryMatch && categoryAvailable;
    });
    setFilteredMenuItems(filtered);
  }, [
    activeMeal,
    activeCategory,
    isCategoryAvailableNow,
    menuItems,
    availabilityTick,
  ]);
  const numColumns = 4;
  const dataWithSpacers = useMemo(() => {
    const items = [...filteredMenuItems];
    const numberOfElementsLastRow = items.length % numColumns;
    if (numberOfElementsLastRow === 0) {
      return items;
    }
    const numberOfSpacers = numColumns - numberOfElementsLastRow;
    for (let i = 0; i < numberOfSpacers; i++) {
      items.push({
        id: `spacer-${i}`,
        name: "spacer",
        price: 0,
        category: [],
        meal: [],
      } as any);
    }
    return items;
  }, [filteredMenuItems]);

  // OPTIMIZED: Hoist category lookup OUTSIDE renderItem (runs once, not 100+ times)
  const currentCategoryId = useMemo(() => {
    if (!activeCategory) return undefined;
    const { getCategoryByName } = useMenuStore.getState();
    return getCategoryByName(activeCategory)?.id;
  }, [activeCategory]);

  // OPTIMIZED: Memoized keyExtractor to prevent recreation
  // NOTE: All hooks must be called before any early returns
  const keyExtractor = useCallback((item: MenuItemType) => item.id, []);

  // OPTIMIZED: Memoized renderItem using hoisted category ID and SpacerItem
  const renderMenuItem = useCallback(
    ({ item }: { item: MenuItemType }) => {
      if ((item as any).name === "spacer") {
        return <SpacerItem />;
      }
      return (
        <MenuItem
          item={item}
          imageSource={getImageSource(item)}
          onOrderClosedCheck={onOrderClosedCheck}
          categoryId={currentCategoryId}
          getItemPriceForCategory={getItemPriceForCategory}
        />
      );
    },
    [onOrderClosedCheck, currentCategoryId, getItemPriceForCategory]
  );

  const formatTime = (d?: Date | null) =>
    d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

  // ModifierScreen is now rendered as an overlay in parent components (order-processing.tsx, tables/[tableId].tsx)
  // This eliminates re-renders when opening/closing the modifier screen
  return (
    <>
      <View className="mt-4 flex-1 bg-[#212121]">
        <View className="flex flex-row items-center justify-between pb-3">
          <View className="flex-row items-center gap-3">
            <Text className="text-xl font-bold text-white">Menu</Text>
            <TouchableOpacity
              onPress={() => { }}
              className="flex-row items-center bg-[#303030] border border-gray-600 rounded-lg px-3 py-2"
            >
              <Text className="text-white font-medium mr-2 text-base">
                Order Type:
              </Text>
              <Text className="text-blue-400 font-semibold text-base">
                {typeof currentOrderType === "string"
                  ? currentOrderType
                  : (currentOrderType as any)?.label || "Takeaway"}
              </Text>
            </TouchableOpacity>
          </View>
          <View className="flex-1 flex-row justify-end items-center gap-x-2">
            <TouchableOpacity
              onPress={() => setActiveTab("Menu")}
              className={`flex-row items-center bg-[#303030] rounded-lg p-3 justify-start ${activeTab == "Menu"
                ? "border-2 border-blue-400"
                : "border border-gray-600"
                }`}
            >
              <Table color="#9CA3AF" size={20} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openSearch}
              className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg p-3 justify-start`}
            >
              <Search color="#9CA3AF" size={20} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setActiveTab("Open Item")}
              className={`flex-row items-center bg-[#303030] rounded-lg p-3 justify-start ${activeTab == "Open Item"
                ? "border-2 border-blue-400"
                : "border border-gray-600"
                }`}
            >
              <PackagePlus color="#9CA3AF" size={20} />
            </TouchableOpacity>

            <Link
              href="/tables"
              className={`flex-row items-center bg-[#303030] border border-gray-600 rounded-lg p-3 justify-start`}
            >
              <Sofa color="#9CA3AF" size={20} />
            </Link>

            <TouchableOpacity
              onPress={() => setActiveTab("Orders")}
              className={`flex-row items-center bg-[#303030] rounded-lg px-3 py-2.5 justify-start ${activeTab == "Orders"
                ? "border-2 border-blue-400"
                : "border border-gray-600"
                }`}
            >
              <Logs color="#9CA3AF" size={20} />
              <Text className="text-gray-300 ml-2 text-base">Orders</Text>
            </TouchableOpacity>

            <Dialog open={isMenuDialogOpen} onOpenChange={setIsMenuDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-fit bg-[#303030] border-gray-600 flex-row items-center gap-2 h-14"
                >
                  <Text className="text-white font-medium text-lg">
                    {activeMeal || "Select Menu"}
                  </Text>

                  <ChevronDown color="#9CA3AF" size={18} />
                </Button>
              </DialogTrigger>
              <DialogContent className="min-w-2xl w-[500px] aspect-square bg-[#212121] border-gray-700">
                <DialogHeader className="border-b border-gray-700 pb-4">
                  <DialogTitle className="text-white text-center">
                    <Text className="text-xl font-bold text-white">Select Menu</Text>
                  </DialogTitle>
                </DialogHeader>
                <ScrollView
                  className="gap-3 mt-4 w-full"
                  contentContainerStyle={{ gap: 12 }}
                >
                  {menus.map((menu) => {
                    const isAvailable =
                      isMenuAvailableNow(menu.id) ||
                      temporaryActiveMenus.includes(menu.name);
                    const isScheduled =
                      menu.schedules && menu.schedules.length > 0;
                    const isSelected = activeMeal === menu.name;

                    return (
                      <TouchableOpacity
                        key={menu.id}
                        onPress={() => handleMenuSelect(menu.name)}
                        className={`p-4 rounded-xl border-2 ${isSelected
                          ? "bg-blue-600 border-blue-400"
                          : !isAvailable
                            ? "bg-[#252538] border-gray-700 opacity-50"
                            : "bg-[#252538] border-[#3a3a5c]"
                          }`}
                        style={isSelected ? {
                          shadowColor: '#3b82f6',
                          shadowOffset: { width: 0, height: 4 },
                          shadowOpacity: 0.3,
                          shadowRadius: 8,
                          elevation: 8,
                        } : undefined}
                      >
                        <View className="flex-row justify-between items-center">
                          <Text className={`font-bold text-lg ${isSelected ? 'text-white' : 'text-gray-100'}`}>
                            {menu.name}
                          </Text>
                          {isScheduled && <Clock size={18} color={isSelected ? "#93c5fd" : "#60a5fa"} />}
                        </View>
                        <Text
                          className={`text-sm mt-1 ${isSelected
                            ? "text-blue-100"
                            : "text-gray-400"
                            }`}
                        >
                          {menu.description}
                        </Text>
                        <View className="flex-row flex-wrap gap-2 mt-3">
                          {menu.categories.map((category, index) => (
                            <View
                              key={index}
                              className={`px-3 py-1.5 rounded-full ${isSelected
                                ? "bg-blue-500/80"
                                : "bg-blue-900/40 border border-blue-800/50"
                                }`}
                            >
                              <Text
                                className={`text-xs font-medium ${isSelected
                                  ? "text-white"
                                  : "text-blue-300"
                                  }`}
                              >
                                {category}
                              </Text>
                            </View>
                          ))}
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </DialogContent>
            </Dialog>
          </View>
        </View>

        <View className="flex-1">
          {activeTab === "Menu" &&
            (activeMeal ? (
              <MenuControls
                activeMeal={activeMeal}
                onMealChange={(value) => {
                  setActiveMeal(value);
                  setActiveCategory(
                    menus.find((menu) => menu.name === value)?.categories[0] ||
                    ""
                  );
                }}
                activeCategory={activeCategory || ""}
                onCategoryChange={setActiveCategory}
              />
            ) : (
              <View className="flex-1 items-center justify-center mt-20">
                <Clock size={64} color="#4B5563" />
                <Text className="text-white text-2xl font-bold mt-4">
                  No Menu Available
                </Text>
                <Text className="text-gray-400 text-base mt-2 text-center px-10">
                  There are currently no menus scheduled for this time. Please
                  check back later or select a different order type.
                </Text>
              </View>
            ))}

          {/* Availability indicator for active category */}
          {/* {activeTab === "Menu" && (
            <View className="mt-3 mb-1 flex-row items-center gap-3">
              <View
                className={`px-3 py-2 rounded-full ${nextAvailability.availableNow
                    ? "bg-green-900/30 border border-green-500"
                    : "bg-red-900/30 border border-red-500"
                  }`}
              >
                <Text
                  className={`text-sm ${nextAvailability.availableNow ? "text-green-400" : "text-red-400"
                    }`}
                >
                  {nextAvailability.availableNow ? "Available now" : "Unavailable now"}
                </Text>
              </View>
              {!nextAvailability.availableNow && (
                <Text className="text-sm text-gray-300">
                  {(() => {
                    const s = nextAvailability.start as Date | null | undefined;
                    const e = nextAvailability.end as Date | null | undefined;
                    return s
                      ? `Next: ${s.toLocaleDateString(undefined, { weekday: "short" })} ${formatTime(s)} – ${formatTime(e)}`
                      : "No upcoming window";
                  })()}
                </Text>
              )}
            </View>
          )} */}

          {activeTab === "Menu" ? (
            activeMeal ? (
              <View key={"Menu"}>

                <FlatList
                  data={dataWithSpacers}
                  keyExtractor={keyExtractor}
                  numColumns={numColumns}
                  className="mt-4 h-[93%] pb-32"
                  ItemSeparatorComponent={() => <SpacerItem />}
                  getItemLayout={(item, index) => ({
                    length: 100,
                    offset: 100 * index,
                    index,
                  })}
                  showsVerticalScrollIndicator={false}
                  columnWrapperStyle={{
                    justifyContent: "space-between",
                    marginBottom: 16
                  }}
                  // OPTIMIZED: FlatList performance props
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={8}
                  windowSize={5}
                  initialNumToRender={8}
                  ListEmptyComponent={
                    <View className="flex-1 items-center justify-center h-48">
                      <Text className="text-gray-400 text-lg">
                        No items match the current filters.
                      </Text>
                    </View>
                  }
                  renderItem={renderMenuItem}
                />
              </View>
            ) : null
          ) : activeTab === "Open Item" ? (
            <View key={"Open Item"} className={"flex-1"}>
              <OpenItemAdder />
            </View>
          ) : activeTab === "Orders" ? (
            <View key={"Orders"} className="flex-1">
              <PreviousOrdersSection />
            </View>
          ) : null}
        </View>
      </View>

      <OrderTypeDrawer
        isVisible={isOrderTypeDrawerOpen}
        onClose={closeDrawer}
        onOrderTypeSelect={handleOrderTypeSelect}
        currentOrderType={currentOrderType}
      />
      {/* ModifierScreen overlay - renders on top when opened, eliminates MenuSection re-renders */}
      <ModifierScreenOverlay />
    </>
  );
};

export default MenuSection;
