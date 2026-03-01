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
import {
  isMenuBlockedSync,
  selectCancelAndRemoveDraft,
  selectIsMenuBlocked,
  useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
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
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  FlatList,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import MenuControls from "./MenuControls";
import MenuItem from "./MenuItem";
import ModifierScreenOverlay from "./ModifierScreenOverlay";
import OpenItemAdder from "./OpenItemAdder";
import OrderTypeDrawer from "./OrderTypeDrawer";
import PreviousOrdersSection from "./PreviousOrdersSection";
import Animated, { LinearTransition } from 'react-native-reanimated';

interface MenuSectionProps {
  onOrderClosedCheck?: () => boolean;
  isTableOrder?: boolean;
}

// OPTIMIZED: Pre-compiled StyleSheet for spacer (no runtime parsing)
import { colors } from "@/lib/theme";
import { useSearchStore } from "@/stores/searchStore";
import { StyleSheet } from "react-native";

const menuSectionStyles = StyleSheet.create({
  spacer: {
    width: "23%",
  },
  blockingOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    zIndex: 100,
  },
});

// OPTIMIZED: WeakMap cache for image sources to prevent object recreation
const imageSourceCache = new WeakMap<
  MenuItemType,
  ReturnType<typeof getImageSourceInternal> | undefined
>();

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

const MenuSectionContent: React.FC<MenuSectionProps> = ({
  onOrderClosedCheck,
  isTableOrder = false,
}) => {
  // ============================================================
  // MENU BLOCKING - For inline overlay pattern
  // ============================================================
  const isMenuBlocked = useModifierSidebarStore(selectIsMenuBlocked);
  const cancelAndRemoveDraft = useModifierSidebarStore(
    selectCancelAndRemoveDraft,
  );

  // State for the active filters
  const menus = useMenuStore((s) => s.menus);
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const temporaryActiveMenus = useMenuStore((s) => s.temporaryActiveMenus);
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);
  const categories = useMenuStore((s) => s.categories);
  const lastSelectedMenuId = useMenuStore((s) => s.lastSelectedMenuId);
  const setLastSelectedMenuId = useMenuStore((s) => s.setLastSelectedMenuId);

  const { requestPinOverride } = usePinOverrideStore();

  // OPTIMIZED: Use computed selector to get only order_type, avoiding re-renders on item changes
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  // Only subscribe to the order_type, not the entire ordersById object
  const currentOrderType = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.order_type || "Takeaway";
  });
  const updateActiveOrderDetails = useOrderStore(
    (s) => s.updateActiveOrderDetails,
  );

  const { isOpen: isOrderTypeDrawerOpen, closeDrawer } =
    useOrderTypeDrawerStore();

  // Tick each minute to refresh availability indicators
  const [availabilityTick, setAvailabilityTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setAvailabilityTick((t) => t + 1), 60_000);
    return () => clearInterval(id);
  }, []);

  const [activeTab, setActiveTab] = useState("Menu");

  // Helper to check if a menu has items (not empty)
  const menuHasItems = (menu: (typeof menus)[0]) => {
    return menu.categories.some((cat) => cat.items && cat.items.length > 0);
  };

  // Helper to find the first menu that is currently available, unlocked, and has items
  const getFirstAvailableMenuWithItems = () => {
    return menus.find(
      (m) =>
        (isMenuAvailableNow(m.id) || temporaryActiveMenus.includes(m.name)) &&
        menuHasItems(m),
    );
  };

  // Helper to get the preferred menu: last used (if valid) OR first available with items
  const getPreferredMenu = () => {
    // Priority 1: Check last selected menu
    if (lastSelectedMenuId) {
      const lastMenu = menus.find((m) => m.id === lastSelectedMenuId);
      if (
        lastMenu &&
        (isMenuAvailableNow(lastMenu.id) ||
          temporaryActiveMenus.includes(lastMenu.name)) &&
        menuHasItems(lastMenu)
      ) {
        return lastMenu;
      }
    }
    // Priority 2: First available menu with items
    return getFirstAvailableMenuWithItems() || null;
  };

  // Initialize with the preferred menu (last used or first available with items)
  const [activeMeal, setActiveMeal] = useState<string | null>(() => {
    const startMenu = getPreferredMenu();
    return startMenu ? startMenu.name : null;
  });

  const [activeCategory, setActiveCategory] = useState<string | null>(() => {
    const startMenu = getPreferredMenu();
    return startMenu ? startMenu.categories[0]?.name || "" : null;
  });

  const [isMenuDialogOpen, setIsMenuDialogOpen] = useState(false);

  // Ref for auto-scrolling to selected menu in dialog
  const menuScrollViewRef = useRef<ScrollView>(null);

  // Auto-scroll to selected menu when dialog opens
  useEffect(() => {
    if (isMenuDialogOpen && activeMeal) {
      const selectedIndex = menus.findIndex((m) => m.name === activeMeal);
      if (selectedIndex >= 0) {
        // Estimate ~140px per menu item (card height + gap)
        const scrollOffset = selectedIndex * 140;
        // Longer delay to ensure Dialog and ScrollView are fully rendered
        const timeoutId = setTimeout(() => {
          menuScrollViewRef.current?.scrollTo({
            y: scrollOffset,
            animated: true,
          });
        }, 300);
        return () => clearTimeout(timeoutId);
      }
    }
  }, [isMenuDialogOpen, activeMeal, menus]);

  // Effect to ensure we always have a valid available menu selected
  useEffect(() => {
    // If we have an active selection...
    if (activeMeal) {
      const currentMenu = menus.find((m) => m.name === activeMeal);
      // Check if it's still available and has items
      if (currentMenu) {
        const isAvailable =
          isMenuAvailableNow(currentMenu.id) ||
          temporaryActiveMenus.includes(currentMenu.name);
        const hasItems = menuHasItems(currentMenu);
        // If it IS available and has items, we are good.
        if (isAvailable && hasItems) return;
      }
    }

    // If we reached here, either activeMeal is null OR the current selection is unavailable/empty.
    // Try to auto-switch to the next preferred one.
    const nextAvailable = getPreferredMenu();

    if (nextAvailable) {
      // Switch to next available with items
      if (activeMeal !== nextAvailable.name) {
        setActiveMeal(nextAvailable.name);
        setActiveCategory(nextAvailable.categories[0]?.name || "");
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
    lastSelectedMenuId,
  ]);
  // ModifierScreen is now rendered via ModifierScreenOverlay - no subscription needed here

  // OPTIMIZED: Stable callbacks for tab switching (avoid inline arrows)
  const handleTabMenu = useCallback(() => setActiveTab("Menu"), []);
  const handleTabOpenItem = useCallback(() => setActiveTab("Open Item"), []);
  const handleTabOrders = useCallback(() => setActiveTab("Orders"), []);

  // OPTIMIZED: Stable callback for meal change (avoid inline arrow in JSX)
  const handleMealChange = useCallback((value: string) => {
    setActiveMeal(value);
    const menu = menus.find((m) => m.name === value);
    setActiveCategory(menu?.categories[0]?.name || "");
    // Persist selection
    const menuStore = useMenuStore.getState();
    const menuObj = menuStore.menus.find((m) => m.name === value);
    if (menuObj) menuStore.setLastSelectedMenuId(menuObj.id);
  }, [menus]);

  // State to hold the items that are actually displayed after filtering
  const [filteredMenuItems, setFilteredMenuItems] = useState<MenuItemType[]>(
    [],
  );
  const openSearch = useSearchStore((state) => state.openSearch);

  // currentOrderType now comes from the optimized selector above
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
      setActiveCategory(menu.categories[0]?.name || "");
      setIsMenuDialogOpen(false);
      // Persist the selection for next launch
      setLastSelectedMenuId(menu.id);
    } else {
      // Request override
      requestPinOverride({ type: "select_menu", payload: { menuName } });
    }
  };

  useEffect(() => {
    if (!activeCategory || !activeMeal) {
      setFilteredMenuItems([]);
      return;
    }

    // Find the active menu and category to get the context-specific items
    const currentMenu = menus.find((m) => m.name === activeMeal);
    const currentCategory = currentMenu?.categories.find(
      (c) => c.name === activeCategory,
    );

    if (!currentCategory || !currentCategory.items) {
      setFilteredMenuItems([]);
      return;
    }

    // Use items directly from the tree (inheriting context prices)
    const filtered = currentCategory.items.filter((item) => {
      // Logic for availability
      // Note: effective_availability is already set on the item in the tree
      return item.availability;
    });

    // Also respect category availability
    const categoryAvailable = isCategoryAvailableNow(activeCategory);
    if (!categoryAvailable) {
      setFilteredMenuItems([]);
      return;
    }

    setFilteredMenuItems(filtered);
  }, [
    activeMeal,
    activeCategory,
    isCategoryAvailableNow,
    menus, // Depend on menus to catch updates
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

  const activeMenuId = useMemo(() => {
    if (!activeMeal) return undefined;
    return menus.find((m) => m.name === activeMeal)?.id;
  }, [activeMeal, menus]);

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
          menuId={activeMenuId}
        />
      );
    },
    [onOrderClosedCheck, currentCategoryId, activeMenuId],
  );

  const formatTime = (d?: Date | null) =>
    d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

  // ModifierScreen is now rendered as an overlay in parent components (order-processing.tsx, tables/[tableId].tsx)
  // This eliminates re-renders when opening/closing the modifier screen
  return (
    <>
      <View
        className={`mt-4 flex-1 bg-background ${isTableOrder ? "rounded-tl-3xl" : ""}`}
      >
        <View
          className={`${isTableOrder ? "px-3 py-2" : ""} flex flex-row items-center justify-between pb-3`}
        >
          <View className="flex-row items-center gap-3">
            <Text className="text-xl font-bold text-white">Menu</Text>
            {!isTableOrder && (
              <TouchableOpacity
                onPress={() => {}}
                className="flex-row items-center bg-panel border border-gray-600 rounded-lg px-3 py-2"
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
            )}
          </View>
          <View
            className={`flex-1 flex-row justify-end items-center gap-x-2 ${isTableOrder ? "px-3" : ""}`}
          >
            <TouchableOpacity
              onPress={handleTabMenu}
              className={`flex-row items-center bg-panel rounded-lg p-3 justify-start ${
                activeTab == "Menu"
                  ? "border-2 border-blue-400"
                  : "border border-gray-600"
              }`}
            >
              <Table color={colors.label} size={20} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={openSearch}
              className={`flex-row items-center bg-panel border border-gray-600 rounded-lg p-3 justify-start`}
            >
              <Search color={colors.label} size={20} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={handleTabOpenItem}
              className={`flex-row items-center bg-panel rounded-lg p-3 justify-start ${
                activeTab == "Open Item"
                  ? "border-2 border-blue-400"
                  : "border border-gray-600"
              }`}
            >
              <PackagePlus color={colors.label} size={20} />
            </TouchableOpacity>

            {!isTableOrder && (
              <Link
                href="/tables"
                className={`flex-row items-center bg-panel border border-gray-600 rounded-lg p-3 justify-start`}
              >
                <Sofa color={colors.label} size={20} />
              </Link>
            )}

            {!isTableOrder && (
              <TouchableOpacity
                onPress={handleTabOrders}
                className={`flex-row items-center bg-panel rounded-lg px-3 py-2.5 justify-start ${
                  activeTab == "Orders"
                    ? "border-2 border-blue-400"
                    : "border border-gray-600"
                }`}
              >
                <Logs color={colors.label} size={20} />
                <Text className="text-gray-300 ml-2 text-base">Orders</Text>
              </TouchableOpacity>
            )}

            <Dialog open={isMenuDialogOpen} onOpenChange={setIsMenuDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  className="w-fit bg-panel border-gray-600 flex-row items-center gap-2 h-14"
                >
                  <Text className="text-white font-medium text-lg">
                    {activeMeal || "Select Menu"}
                  </Text>

                  <ChevronDown color={colors.label} size={18} />
                </Button>
              </DialogTrigger>
              <DialogContent className="min-w-2xl w-[500px] aspect-square bg-card border-gray-700">
                <DialogHeader className="border-b border-gray-700 pb-4">
                  <DialogTitle className="text-white text-center">
                    <Text className="text-xl font-bold text-white">
                      Select Menu
                    </Text>
                  </DialogTitle>
                </DialogHeader>
                <ScrollView
                  ref={menuScrollViewRef}
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
                        className={`p-4 rounded-xl border-2 ${
                          isSelected
                            ? "bg-blue-600 border-blue-400"
                            : !isAvailable
                              ? "bg-card border-gray-700 opacity-50"
                              : "bg-card border-border"
                        }`}
                        style={
                          isSelected
                            ? {
                                shadowColor: colors.info,
                                shadowOffset: { width: 0, height: 4 },
                                shadowOpacity: 0.3,
                                shadowRadius: 8,
                                elevation: 8,
                              }
                            : undefined
                        }
                      >
                        <View className="flex-row justify-between items-center">
                          <Text
                            className={`font-bold text-lg ${
                              isSelected ? "text-white" : "text-gray-100"
                            }`}
                          >
                            {menu.name}
                          </Text>
                          {isScheduled && (
                            <Clock
                              size={18}
                              color={isSelected ? colors.info : colors.info}
                            />
                          )}
                        </View>
                        <Text
                          className={`text-sm mt-1 ${
                            isSelected ? "text-blue-100" : "text-gray-400"
                          }`}
                        >
                          {menu.description}
                        </Text>
                        <View className="flex-row flex-wrap gap-2 mt-3">
                          {menu.categories.map((category, index) => (
                            <View
                              key={index}
                              className={`px-3 py-1.5 rounded-full ${
                                isSelected
                                  ? "bg-blue-500/80"
                                  : "bg-blue-900/40 border border-blue-800/50"
                              }`}
                            >
                              <Text
                                className={`text-xs font-medium ${
                                  isSelected ? "text-white" : "text-blue-300"
                                }`}
                              >
                                {category.name}
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

        <View className={`flex-1 ${isTableOrder ? "px-3" : ""}`}>
          {activeTab === "Menu" &&
            (activeMeal ? (
              <MenuControls
                activeMeal={activeMeal}
                onMealChange={handleMealChange}
                activeCategory={activeCategory || ""}
                onCategoryChange={setActiveCategory}
              />
            ) : (
              <View className="flex-1 items-center justify-center mt-20">
                <Clock size={64} color={colors.muted} />
                <Text className="text-white text-2xl font-bold mt-4">
                  No Menu Available
                </Text>
                <Text className="text-gray-400 text-base mt-2 text-center px-10">
                  There are currently no menus scheduled for this time. Please
                  check back later or select a different order type.
                </Text>
              </View>
            ))}

          {activeTab === "Menu" ? (
            activeMeal ? (
              <View key={"Menu"} className={`${isTableOrder ? "px-3" : ""}`}>
                <Animated.FlatList
                  data={dataWithSpacers}
                  keyExtractor={keyExtractor}
                  numColumns={numColumns}
                  className="mt-4 h-[93%] pb-32"
                  ItemSeparatorComponent={SpacerItem}
                  getItemLayout={(item, index) => ({
                    length: 100,
                    offset: 100 * index,
                    index,
                  })}
                  showsVerticalScrollIndicator={false}
                  columnWrapperStyle={{
                    justifyContent: "space-between",
                    marginBottom: 16,
                  }}
                  // OPTIMIZED: FlatList performance props
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={8}
                  windowSize={4}
                  initialNumToRender={8}
                  ListEmptyComponent={
                    <View className="flex-1 items-center justify-center h-48">
                      <Text className="text-gray-400 text-lg">
                        No items match the current filters.
                      </Text>
                    </View>
                  }
                  renderItem={renderMenuItem}
                  itemLayoutAnimation={LinearTransition.duration(500)}
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

        {/* ============================================================
            BLOCKING OVERLAY - Prevents touch during modifier editing
            Native-level blocking via Pressable for 60fps performance
            Checks BOTH React state AND sync ref for zero-gap blocking
            Clicking overlay cancels and removes draft items
            ============================================================ */}
        {(isMenuBlocked || isMenuBlockedSync()) && (
          <Pressable
            style={menuSectionStyles.blockingOverlay}
            onPress={cancelAndRemoveDraft}
          />
        )}
      </View>

      {/* ModifierScreenOverlay renders on top when opened - keeps cart visible to cashier */}
      <ModifierScreenOverlay />

      <OrderTypeDrawer
        isVisible={isOrderTypeDrawerOpen}
        onClose={closeDrawer}
        onOrderTypeSelect={handleOrderTypeSelect}
        currentOrderType={currentOrderType}
      />
    </>
  );
};

const MenuSection = React.memo(MenuSectionContent);
export default MenuSection;
