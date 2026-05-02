import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
} from "@/components/ui/dialog";
import { prefetchMenuItemRemoteImages } from "@/lib/menuImagePrefetch";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
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
    CheckCircle2,
    ChevronDown,
    Clock,
    Lock,
    Logs,
    PackagePlus,
    Search,
    Sofa,
    Table,
    UtensilsCrossed,
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
    InteractionManager,
    ListRenderItemInfo,
    Platform,
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

interface MenuSectionProps {
  onOrderClosedCheck?: () => boolean;
  isTableOrder?: boolean;
  headerLeft?: React.ReactNode;
  headerBelow?: React.ReactNode;
  forceOrdersView?: boolean;
  showPreviousOrdersSection?: boolean;
  showSearchButton?: boolean;
  toolbarSearchSlot?: React.ReactNode;
  showMenuTabButton?: boolean;
  showOpenItemButton?: boolean;
  showTablesButton?: boolean;
  rightToolbarSlot?: React.ReactNode;
  placeMenuSelectorInMenuRow?: boolean;
}

// OPTIMIZED: Pre-compiled StyleSheet for spacer (no runtime parsing)
import { colors } from "@/lib/theme";
import { useColorScheme } from "@/lib/useColorScheme";
import { useSearchStore } from "@/stores/searchStore";
import { StyleSheet, ViewStyle } from "react-native";

const menuSectionStyles = StyleSheet.create({
  spacer: {
    width: "23%",
  },
});

const getBlockingOverlayStyle = (overlayColor: string): ViewStyle => ({
  ...StyleSheet.absoluteFillObject,
  backgroundColor: overlayColor,
  zIndex: 100,
});

// OPTIMIZED: WeakMap cache for image sources to prevent object recreation
const imageSourceCache = new WeakMap<
  MenuItemType,
  ReturnType<typeof getImageSourceInternal> | undefined
>();

const getImageSourceInternal = (item: MenuItemType) =>
  resolveMenuItemImageSource(item.image);

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

// Isolated overlay — only this re-renders when modifier opens, not the FlatList
const MenuBlockingOverlay = React.memo(() => {
  const isMenuBlocked = useModifierSidebarStore(selectIsMenuBlocked);
  const cancelAndRemoveDraft = useModifierSidebarStore(
    selectCancelAndRemoveDraft,
  );
  if (!isMenuBlocked && !isMenuBlockedSync()) return null;
  return (
    <Pressable
      style={getBlockingOverlayStyle(colors.background + "80")}
      onPress={cancelAndRemoveDraft}
    />
  );
});
MenuBlockingOverlay.displayName = "MenuBlockingOverlay";

const MenuSectionContent: React.FC<MenuSectionProps> = ({
  onOrderClosedCheck,
  isTableOrder = false,
  headerLeft,
  headerBelow,
  forceOrdersView = false,
  showPreviousOrdersSection = true,
  showSearchButton = true,
  toolbarSearchSlot,
  showMenuTabButton = true,
  showOpenItemButton = true,
  showTablesButton = true,
  rightToolbarSlot,
  placeMenuSelectorInMenuRow = false,
}) => {
  const { colorScheme } = useColorScheme();
  // State for the active filters
  const menus = useMenuStore((s) => s.menus);
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const temporaryActiveMenus = useMenuStore((s) => s.temporaryActiveMenus);
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);
  const lastSelectedMenuId = useMenuStore((s) => s.lastSelectedMenuId);
  const setLastSelectedMenuId = useMenuStore((s) => s.setLastSelectedMenuId);

  const { requestPinOverride, isUnlocked } = usePinOverrideStore();
  const addTemporaryMenuAccess = useMenuStore((s) => s.addTemporaryMenuAccess);

  // OPTIMIZED: Use computed selector to get only order_type, avoiding re-renders on item changes
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  // Only subscribe to the order_type, not the entire ordersById object
  const currentOrderType = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.order_type || "takeout";
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

  const temporaryActiveMenuSet = useMemo(
    () => new Set(temporaryActiveMenus),
    [temporaryActiveMenus],
  );

  const menusById = useMemo(() => {
    const next = new Map<string, (typeof menus)[number]>();
    for (const menu of menus) next.set(menu.id, menu);
    return next;
  }, [menus]);

  const menusByName = useMemo(() => {
    const next = new Map<string, (typeof menus)[number]>();
    for (const menu of menus) next.set(menu.name, menu);
    return next;
  }, [menus]);

  const availableMenus = useMemo(
    () =>
      menus.filter(
        (menu) =>
          isMenuAvailableNow(menu.id) || temporaryActiveMenuSet.has(menu.name),
      ),
    [menus, isMenuAvailableNow, temporaryActiveMenuSet],
  );

  useEffect(() => {
    if (!showPreviousOrdersSection && activeTab === "Orders") {
      setActiveTab("Menu");
    }
  }, [showPreviousOrdersSection, activeTab]);

  // Helper to check if a menu has items (not empty)
  const menuHasItems = (menu: (typeof menus)[0]) => {
    return menu.categories.some((cat) => cat.items && cat.items.length > 0);
  };

  // Helper to find the first menu that is currently available (with items preferred)
  const getFirstAvailableMenuWithItems = () => {
    // Prefer a menu that also has items; fall back to any available menu
    return (
      availableMenus.find((menu) => menuHasItems(menu)) ??
      availableMenus[0] ??
      undefined
    );
  };

  // Helper to get the preferred menu: last used (if valid) OR first available with items
  const getPreferredMenu = () => {
    // Priority 1: Check last selected menu
    if (lastSelectedMenuId) {
      const lastMenu = menusById.get(lastSelectedMenuId);
      if (
        lastMenu &&
        (isMenuAvailableNow(lastMenu.id) ||
          temporaryActiveMenuSet.has(lastMenu.name))
      ) {
        return lastMenu;
      }
    }
    // Priority 2: First available menu (with items preferred)
    return getFirstAvailableMenuWithItems() || null;
  };

  // Initialize with the preferred menu (last used or first available with items)
  const [activeMeal, setActiveMeal] = useState<string | null>(() => {
    const startMenu = getPreferredMenu();
    return startMenu ? startMenu.name : null;
  });

  // Derive the active menu object once so MenuControls doesn't need to re-derive it
  const activeMenu = useMemo(
    () => (activeMeal ? menusByName.get(activeMeal) : undefined),
    [activeMeal, menusByName],
  );

  const [activeCategory, setActiveCategory] = useState<string | null>(() => {
    const startMenu = getPreferredMenu();
    return startMenu ? startMenu.categories[0]?.name || "" : null;
  });

  const activeCategoryEntry = useMemo(
    () =>
      activeMenu?.categories.find(
        (category) => category.name === activeCategory,
      ),
    [activeMenu, activeCategory],
  );

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
      const currentMenu = activeMeal ? menusByName.get(activeMeal) : undefined;
      // Keep the current menu as long as it's available — items may still be loading
      if (currentMenu) {
        const isAvailable =
          isMenuAvailableNow(currentMenu.id) ||
          temporaryActiveMenuSet.has(currentMenu.name);
        if (isAvailable) return;
      }
    }

    // If we reached here, either activeMeal is null OR the current selection became unavailable.
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activeMeal,
    menus,
    // isMenuAvailableNow intentionally omitted: it's a store method whose reference
    // changes on every store update, causing an infinite loop when included here.
    // The function itself is stable in behavior — only its JS reference is unstable.
    temporaryActiveMenus,
    temporaryActiveMenuSet,
    availabilityTick,
    lastSelectedMenuId,
    menusByName,
  ]);
  // ModifierScreen is now rendered via ModifierScreenOverlay - no subscription needed here

  // OPTIMIZED: Stable callbacks for tab switching (avoid inline arrows)
  const handleTabMenu = useCallback(() => setActiveTab("Menu"), []);
  const handleTabOpenItem = useCallback(() => setActiveTab("Open Item"), []);
  const handleTabOrders = useCallback(() => setActiveTab("Orders"), []);

  // OPTIMIZED: Stable callback for meal change (avoid inline arrow in JSX)
  const handleMealChange = useCallback(
    (value: string) => {
      setActiveTab("Menu");
      setActiveMeal(value);
      const menu = menusByName.get(value);
      setActiveCategory(menu?.categories[0]?.name || "");
      // Persist selection
      if (menu) setLastSelectedMenuId(menu.id);
    },
    [menusByName, setLastSelectedMenuId],
  );

  const openSearch = useSearchStore((state) => state.openSearch);

  // currentOrderType now comes from the optimized selector above
  const handleOrderTypeSelect = (orderType: string) => {
    if (activeOrderId) {
      updateActiveOrderDetails({ order_type: orderType as any });
    }
  };

  const handleMenuSelect = (menuName: string) => {
    const menu = menusByName.get(menuName);
    if (!menu) return;

    const isAvailable =
      isMenuAvailableNow(menu.id) || temporaryActiveMenuSet.has(menu.name);

    if (isAvailable) {
      setActiveTab("Menu");
      setActiveMeal(menuName);
      setActiveCategory(menu.categories[0]?.name || "");
      setIsMenuDialogOpen(false);
      setLastSelectedMenuId(menu.id);
    } else if (isUnlocked()) {
      // Manager session active — bypass PIN and grant directly
      addTemporaryMenuAccess(menuName);
      setActiveTab("Menu");
      setActiveMeal(menuName);
      setActiveCategory(menu.categories[0]?.name || "");
      setIsMenuDialogOpen(false);
      setLastSelectedMenuId(menu.id);
    } else {
      requestPinOverride({ type: "select_menu", payload: { menuName } });
    }
  };

  const filteredMenuItems = useMemo(() => {
    if (!activeCategoryEntry?.items || !activeCategory) return [];
    if (!isCategoryAvailableNow(activeCategory)) return [];
    return activeCategoryEntry.items.filter(
      (item) => item.availability !== false,
    );
  }, [
    activeCategory,
    activeCategoryEntry,
    isCategoryAvailableNow,
    availabilityTick,
  ]);
  const numColumns = 5;
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
    return activeCategoryEntry?.id;
  }, [activeCategoryEntry]);

  const activeMenuId = activeMenu?.id;

  // Pre-warm modifier data for visible items so first tap is instant.
  // Wave 2: schedule via InteractionManager so the precompute doesn't block
  // the category-switch frame. Chunk into rAF-paced batches so a single
  // category change can't burn one long task.
  useEffect(() => {
    if (!filteredMenuItems.length || !currentCategoryId || !activeMenuId)
      return;
    const visibleItems = filteredMenuItems.slice(0, 12);
    let cancelled = false;
    let pendingRaf: number | null = null;

    const handle = InteractionManager.runAfterInteractions(() => {
      if (cancelled) return;
      // Image prefetch is fire-and-forget — kick it off immediately, it
      // doesn't compete with the JS thread.
      prefetchMenuItemRemoteImages(visibleItems);

      // Chunk modifier precompute 5 items per frame so a 15-item burst
      // spreads across ~3 frames instead of one ~30–50ms task.
      const CHUNK_SIZE = 5;
      const store = useModifierSidebarStore.getState();
      let cursor = 0;
      const step = () => {
        if (cancelled) return;
        const slice = visibleItems.slice(cursor, cursor + CHUNK_SIZE);
        if (slice.length === 0) {
          pendingRaf = null;
          return;
        }
        store.preWarmMany(slice, currentCategoryId, activeMenuId);
        cursor += CHUNK_SIZE;
        pendingRaf = requestAnimationFrame(step);
      };
      pendingRaf = requestAnimationFrame(step);
    });

    return () => {
      cancelled = true;
      handle.cancel?.();
      if (pendingRaf !== null) cancelAnimationFrame(pendingRaf);
    };
  }, [filteredMenuItems, currentCategoryId, activeMenuId]);

  // OPTIMIZED: Memoized keyExtractor to prevent recreation
  // NOTE: All hooks must be called before any early returns
  const keyExtractor = useCallback((item: MenuItemType) => item.id, []);

  // OPTIMIZED: Memoized renderItem using hoisted category ID and SpacerItem
  const renderMenuItem = useCallback(
    ({ item, index }: ListRenderItemInfo<MenuItemType>) => {
      if ((item as any).name === "spacer") {
        return <SpacerItem />;
      }
      const highThrough = numColumns * 3;
      const normalThrough = numColumns * 10;
      const imagePriority =
        index < highThrough ? "high" : index < normalThrough ? "normal" : "low";
      return (
        <MenuItem
          item={item}
          imageSource={getImageSource(item)}
          imagePriority={imagePriority}
          onOrderClosedCheck={onOrderClosedCheck}
          categoryId={currentCategoryId}
          menuId={activeMenuId}
        />
      );
    },
    [onOrderClosedCheck, currentCategoryId, activeMenuId, numColumns],
  );

  const formatTime = (d?: Date | null) =>
    d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

  // ModifierScreen is now rendered as an overlay in parent components (order-processing.tsx, tables/[tableId].tsx)
  // This eliminates re-renders when opening/closing the modifier screen
  return (
    <>
      <View
        key={colorScheme}
        className={`mt-0 flex-1 relative overflow-hidden px-2 ${
          isTableOrder ? "rounded-tl-3xl" : ""
        }`}
        style={{ backgroundColor: colors.card }}
      >
        {/* Row 1: Header (Order Line) + Toolbar */}
        <View
          className={`${
            isTableOrder ? "px-0 py-2" : "px-0 py-2"
          } flex-row items-center`}
        >
          {headerLeft}
          <View
            className={`flex-1 flex-row justify-end items-center gap-x-2 ${
              isTableOrder ? "px-3" : ""
            }`}
          >
            {toolbarSearchSlot !== undefined ? (
              toolbarSearchSlot
            ) : showSearchButton ? (
              <TouchableOpacity
                onPress={openSearch}
                className="flex-row items-center rounded-lg p-3 justify-start"
                style={{ backgroundColor: colors.panel }}
              >
                <Search color={colors.label} size={14} />
              </TouchableOpacity>
            ) : null}
            {showMenuTabButton && (
              <TouchableOpacity
                onPress={handleTabMenu}
                className="flex-row items-center rounded-lg p-3 justify-start"
                style={{
                  backgroundColor:
                    activeTab == "Menu" ? `${colors.teal}15` : colors.panel,
                }}
              >
                <Table
                  color={activeTab == "Menu" ? colors.teal : colors.label}
                  size={14}
                />
              </TouchableOpacity>
            )}
            {showOpenItemButton && (
              <TouchableOpacity
                onPress={handleTabOpenItem}
                className="flex-row items-center rounded-lg p-3 justify-start"
                style={{
                  backgroundColor:
                    activeTab == "Open Item"
                      ? `${colors.teal}15`
                      : colors.panel,
                }}
              >
                <PackagePlus
                  color={activeTab == "Open Item" ? colors.teal : colors.label}
                  size={14}
                />
              </TouchableOpacity>
            )}

            {!isTableOrder && showTablesButton && (
              <Link
                href="/tables"
                className="flex-row items-center rounded-lg p-3 justify-start"
                style={{ backgroundColor: colors.panel }}
              >
                <Sofa color={colors.label} size={14} />
              </Link>
            )}

            {!isTableOrder && showPreviousOrdersSection && (
              <TouchableOpacity
                onPress={handleTabOrders}
                className="flex-row items-center rounded-lg px-3 py-2.5 justify-start"
                style={{
                  backgroundColor:
                    activeTab == "Orders" ? `${colors.teal}15` : colors.panel,
                }}
              >
                <Logs
                  color={activeTab == "Orders" ? colors.teal : colors.label}
                  size={14}
                />
                <Text
                  style={{
                    color: activeTab == "Orders" ? colors.teal : colors.muted,
                  }}
                  className="ml-2 text-sm"
                >
                  Orders
                </Text>
              </TouchableOpacity>
            )}

            {rightToolbarSlot}

            <Dialog open={isMenuDialogOpen} onOpenChange={setIsMenuDialogOpen}>
              {!placeMenuSelectorInMenuRow && (
                <DialogTrigger asChild>
                  <TouchableOpacity
                    className="flex-row items-center rounded-lg px-3 py-2.5 gap-2"
                    style={{ backgroundColor: colors.panel }}
                  >
                    <UtensilsCrossed color={colors.label} size={13} />
                    <Text
                      style={{
                        color: colors.heading,
                        fontSize: 13,
                        fontWeight: "500",
                      }}
                    >
                      {activeMeal || "Select Menu"}
                    </Text>
                    <ChevronDown color={colors.label} size={13} />
                  </TouchableOpacity>
                </DialogTrigger>
              )}
              <DialogContent
                className="w-[480px] max-h-[80vh] bg-screen border border-border rounded-2xl p-0 overflow-hidden"
                style={{
                  backgroundColor: colors.screen,
                  borderColor: colors.border,
                }}
              >
                <DialogHeader
                  className="px-6 pt-6 pb-4 border-b border-border"
                  style={{ borderBottomColor: colors.border }}
                >
                  <DialogTitle>
                    <Text
                      style={{
                        fontSize: 18,
                        fontWeight: "600",
                        color: colors.heading,
                      }}
                    >
                      Menu
                    </Text>
                  </DialogTitle>
                </DialogHeader>
                <ScrollView
                  ref={menuScrollViewRef}
                  className="w-full"
                  contentContainerStyle={{ padding: 16, gap: 10 }}
                >
                  {menus.map((menu) => {
                    const isAvailable =
                      isMenuAvailableNow(menu.id) ||
                      temporaryActiveMenuSet.has(menu.name);
                    const isScheduled =
                      menu.schedules && menu.schedules.length > 0;
                    const isSelected = activeMeal === menu.name;

                    return (
                      <TouchableOpacity
                        key={menu.id}
                        onPress={() => handleMenuSelect(menu.name)}
                        className="p-4 rounded-xl border"
                        style={{
                          backgroundColor: isSelected
                            ? colors.teal + "20"
                            : !isAvailable
                              ? colors.screen
                              : colors.panel,
                          borderColor: isSelected
                            ? colors.teal
                            : !isAvailable
                              ? colors.border
                              : colors.border,
                          opacity: !isAvailable ? 0.75 : 1,
                        }}
                      >
                        <View className="flex-row justify-between items-center">
                          <Text
                            style={{
                              fontWeight: "600",
                              fontSize: 16,
                              color: colors.heading,
                            }}
                          >
                            {menu.name}
                          </Text>
                          <View className="flex-row items-center gap-2">
                            {isScheduled && !isAvailable && (
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: 4,
                                  backgroundColor: colors.border + "60",
                                  paddingHorizontal: 7,
                                  paddingVertical: 3,
                                  borderRadius: 6,
                                }}
                              >
                                <Lock size={11} color={colors.muted} />
                                <Text
                                  style={{ fontSize: 10, color: colors.muted }}
                                >
                                  Schedule
                                </Text>
                              </View>
                            )}
                            {isScheduled && isAvailable && (
                              <Clock size={14} color={colors.label} />
                            )}
                            {isSelected && (
                              <CheckCircle2 size={16} color={colors.teal} />
                            )}
                          </View>
                        </View>
                        {menu.description ? (
                          <Text
                            style={{
                              fontSize: 12,
                              color: colors.muted,
                              marginTop: 4,
                            }}
                          >
                            {menu.description}
                          </Text>
                        ) : null}
                        {menu.categories.length > 0 && (
                          <View
                            style={{
                              flexDirection: "row",
                              flexWrap: "wrap",
                              gap: 6,
                              marginTop: 10,
                            }}
                          >
                            {menu.categories.map((category, index) => (
                              <View
                                key={index}
                                style={{
                                  paddingHorizontal: 10,
                                  paddingVertical: 4,
                                  borderRadius: 12,
                                  backgroundColor: colors.panel,
                                  borderWidth: 1,
                                  borderColor: colors.border,
                                }}
                              >
                                <Text
                                  style={{ fontSize: 12, color: colors.label }}
                                >
                                  {category.name}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </DialogContent>
            </Dialog>
          </View>
        </View>

        {/* Row 2: Optional content below header (e.g. order badges) */}
        {headerBelow}

        {/* Row 3: Category controls */}
        {!forceOrdersView &&
          activeTab === "Menu" &&
          (activeMeal ? (
            <View className={`${isTableOrder ? "px-3" : ""} pb-3`}>
              <MenuControls
                activeMeal={activeMeal}
                onMealChange={handleMealChange}
                activeCategory={activeCategory || ""}
                onCategoryChange={setActiveCategory}
                rightSlot={
                  placeMenuSelectorInMenuRow ? (
                    <TouchableOpacity
                      onPress={() => setIsMenuDialogOpen(true)}
                      className="flex-row items-center rounded-lg px-3 py-2.5 gap-2"
                      style={{ backgroundColor: colors.panel }}
                    >
                      <UtensilsCrossed color={colors.label} size={13} />
                      <Text
                        style={{
                          color: colors.heading,
                          fontSize: 13,
                          fontWeight: "500",
                        }}
                      >
                        {activeMeal || "Select Menu"}
                      </Text>
                      <ChevronDown color={colors.label} size={13} />
                    </TouchableOpacity>
                  ) : undefined
                }
              />
            </View>
          ) : (
            <View
              style={{
                flex: 1,
                alignItems: "center",
                justifyContent: "center",
                marginTop: 80,
              }}
            >
              <Clock size={64} color={colors.muted} />
              <Text
                style={{
                  color: colors.heading,
                  fontSize: 24,
                  fontWeight: "bold",
                  marginTop: 16,
                }}
              >
                No Menu Available
              </Text>
              <Text
                style={{
                  color: colors.muted,
                  fontSize: 16,
                  marginTop: 8,
                  textAlign: "center",
                  paddingHorizontal: 40,
                }}
              >
                There are currently no menus scheduled for this time. Please
                check back later or select a different order type.
              </Text>
            </View>
          ))}

        <View className={`flex-1 ${isTableOrder ? "px-3" : ""}`}>
          {forceOrdersView ? (
            <View key={"Orders"} className="flex-1">
              <PreviousOrdersSection />
            </View>
          ) : activeTab === "Menu" ? (
            activeMeal ? (
              <View
                key={"Menu"}
                className={`flex-1 ${isTableOrder ? "px-3" : ""}`}
              >
                <FlatList
                  data={dataWithSpacers}
                  keyExtractor={keyExtractor}
                  numColumns={numColumns}
                  style={{
                    flex: 1,
                    marginTop: 8,
                    backgroundColor: colors.card,
                  }}
                  contentContainerStyle={{
                    backgroundColor: colors.card,
                    paddingBottom: 128,
                  }}
                  ItemSeparatorComponent={SpacerItem}
                  getItemLayout={(_item, index) => {
                    const ROW_HEIGHT = 80 + 12;
                    const row = Math.floor(index / numColumns);
                    return { length: 80, offset: row * ROW_HEIGHT, index };
                  }}
                  showsVerticalScrollIndicator={false}
                  columnWrapperStyle={{
                    justifyContent: "flex-start",
                    gap: 6,
                    marginBottom: 6,
                  }}
                  removeClippedSubviews={Platform.OS === "android"}
                  maxToRenderPerBatch={10}
                  updateCellsBatchingPeriod={32}
                  windowSize={2}
                  initialNumToRender={15}
                  ListEmptyComponent={
                    <View
                      style={{
                        flex: 1,
                        alignItems: "center",
                        justifyContent: "center",
                        height: 192,
                      }}
                    >
                      <Text style={{ color: colors.muted, fontSize: 18 }}>
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
          ) : activeTab === "Orders" && showPreviousOrdersSection ? (
            <View key={"Orders"} className="flex-1">
              <PreviousOrdersSection />
            </View>
          ) : null}
        </View>

        {/* Blocking overlay isolated — only re-renders when modifier opens */}
        <MenuBlockingOverlay />

        {/* ModifierScreenOverlay renders on top when opened - keeps cart visible to cashier */}
        <ModifierScreenOverlay />
      </View>

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
