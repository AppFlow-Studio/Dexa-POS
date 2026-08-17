import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { useNetworkStatus } from "@/hooks/useNetworkStatus";
import { prefetchMenuItemRemoteImages } from "@/lib/menuImagePrefetch";
import { resolveMenuItemImageSource } from "@/lib/menuItemImageSource";
import {
  beginMenuModifierPreWarm,
  isMenuModifierPreWarmCurrent,
} from "@/lib/menuModifierPreWarmControl";
import { MenuItemType } from "@/lib/types";
// import { useSearchStore } from "@/stores/searchStore";
import { useMenuStore } from "@/stores/useMenuStore";
import { useMenuVisibilityStore } from "@/stores/useMenuVisibilityStore";
import {
  isMenuBlockedSync,
  selectCancelAndRemoveDraft,
  selectIsMenuBlocked,
  useModifierSidebarStore,
} from "@/stores/useModifierSidebarStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { useOrderTypeDrawerStore } from "@/stores/useOrderTypeDrawerStore";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { usePinOverrideStore } from "@/stores/usePinOverrideStore";
import { useTableSessionStore } from "@/stores/useTableSessionStore";
import { FlashList, type ListRenderItemInfo } from "@shopify/flash-list";
import { BlurView } from "expo-blur";
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
  ActivityIndicator,
  InteractionManager,
  Pressable,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { ScrollView } from "react-native-gesture-handler";
import MenuControls from "./MenuControls";
import MenuStaleBanner from "./MenuStaleBanner";
import MenuUnavailableState from "./MenuUnavailableState";
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

// OPTIMIZED: Pre-compiled StyleSheet for the grid (no runtime parsing)
import { colors } from "@/lib/theme";
import { useUiScale } from "@/lib/uiScale";
import { useColorScheme } from "@/lib/useColorScheme";
import { useSearchStore } from "@/stores/searchStore";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import { useSettingsStore } from "@/stores/useSettingsStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { StyleSheet, ViewStyle } from "react-native";

type MenuSectionStyles = ReturnType<typeof createMenuSectionStyles>;
const menuSectionStylesByScale = new Map<string, MenuSectionStyles>();

const createMenuSectionStyles = (scale: number) => {
  const s = (n: number) => Math.round(n * scale);
  return StyleSheet.create({
    // Perf F8 (FlashList): each grid cell is width/numColumns; gutters live on
    // the cell wrapper (3+3 horizontal between columns, 6 vertical between
    // rows) since FlashList has no columnWrapperStyle.
    gridCell: {
      // FlashList lays each row of `numColumns` cells out in a flex row; flex:1
      // makes every cell take an equal share of the row width. Static (no onLayout
      // measurement race that left the first category cramped until a switch).
      flex: 1,
      paddingHorizontal: s(3),
      paddingBottom: s(6),
    },
    gridContainer: {
      flex: 1,
      marginTop: s(8),
      // NOTE: backgroundColor is applied inline at the render site, NOT here.
      // `colors` is a theme Proxy that defaults to dark; StyleSheet.create runs
      // at module load (before setThemeMode('light')), so a themed color frozen
      // here would lock to the dark value (#1E2340) and show as a dark rectangle
      // below short lists. Inline styles read the live (light) value.
    },
  });
};

const getMenuSectionStyles = (scale: number) => {
  const key = String(scale);
  const cached = menuSectionStylesByScale.get(key);
  if (cached) return cached;
  const next = createMenuSectionStyles(scale);
  menuSectionStylesByScale.set(key, next);
  return next;
};
const menuSectionStyles = createMenuSectionStyles(1);
const EMPTY_HIDDEN_MENU_IDS: string[] = [];

const getBlockingOverlayStyle = (overlayColor: string): ViewStyle => ({
  ...StyleSheet.absoluteFillObject,
  backgroundColor: overlayColor,
  zIndex: 100,
});

// OPTIMIZED: Map cache for image sources to prevent object recreation.
// Keyed by item.id + image hash so cache hits survive store re-renders.
// Hard-capped to prevent unbounded growth from stale menu items.
const IMAGE_SOURCE_CACHE_MAX = 500;
const imageSourceCache = new Map<
  string,
  ReturnType<typeof getImageSourceInternal> | undefined
>();

const getImageSourceInternal = (item: MenuItemType) =>
  resolveMenuItemImageSource(item.image);

const getImageSourceCacheKey = (item: MenuItemType) =>
  `${item.id}:${item.image ?? ""}`;

// Get image source with caching
const getImageSource = (item: MenuItemType) => {
  const key = getImageSourceCacheKey(item);
  if (imageSourceCache.has(key)) {
    return imageSourceCache.get(key);
  }
  // Evict oldest entries when at capacity before adding new
  if (imageSourceCache.size >= IMAGE_SOURCE_CACHE_MAX) {
    const firstKey = imageSourceCache.keys().next().value;
    if (firstKey !== undefined) imageSourceCache.delete(firstKey);
  }
  const source = getImageSourceInternal(item);
  imageSourceCache.set(key, source);
  return source;
};

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

const SeatingBlockingOverlay = React.memo(
  ({
    isVisible,
    title,
    message,
    showSpinner = true,
  }: {
    isVisible: boolean;
    title: string;
    message: string;
    showSpinner?: boolean;
  }) => {
    const uiScale = useUiScale();
    const s = (n: number) => Math.round(n * uiScale);
    if (!isVisible) return null;
    return (
      <Pressable style={getBlockingOverlayStyle("transparent")}>
        <BlurView
          intensity={22}
          tint="dark"
          style={StyleSheet.absoluteFill}
        />
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            backgroundColor: colors.background + "66",
          }}
        />
        {/* absoluteFill, NOT flex:1. This layer's parent is itself absolutely
            positioned (top/left/right/bottom: 0), and a flex:1 child only fills
            such a parent if the parent's height resolves from its insets before
            the child measures — which Fabric does not guarantee. When it didn't,
            this box collapsed to its content height and, laid out after the two
            absolutely-positioned siblings, the card sat low in the column
            instead of centered. Pinning to the parent's box makes the centering
            depend on nothing. */}
        <View
          style={{
            ...StyleSheet.absoluteFillObject,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: s(24),
          }}
        >
          <View
            style={{
              alignItems: "center",
              gap: s(8),
              paddingHorizontal: s(18),
              paddingVertical: s(14),
              borderRadius: s(12),
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.panel + "E6",
            }}
          >
            {showSpinner && (
              <ActivityIndicator size="small" color={colors.teal} />
            )}
            <Text
              style={{
                color: colors.heading,
                fontSize: s(15),
                fontWeight: "700",
                textAlign: "center",
              }}
            >
              {title}
            </Text>
            <Text
              style={{
                color: colors.muted,
                fontSize: s(12),
                textAlign: "center",
              }}
            >
              {message}
            </Text>
          </View>
        </View>
      </Pressable>
    );
  },
);
SeatingBlockingOverlay.displayName = "SeatingBlockingOverlay";

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
  const uiScale = useUiScale();
  const sc = (n: number) => Math.round(n * uiScale);
  // State for the active filters
  const menus = useMenuStore((s) => s.menus);
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const temporaryActiveMenus = useMenuStore((s) => s.temporaryActiveMenus);
  const temporaryActiveCategories = useMenuStore(
    (s) => s.temporaryActiveCategories,
  );
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);
  const lastSelectedMenuId = useMenuStore((s) => s.lastSelectedMenuId);
  const setLastSelectedMenuId = useMenuStore((s) => s.setLastSelectedMenuId);
  const menuNavigationMode = useSettingsStore(
    (s) => s.posMenuNavigationMode ?? "classic",
  );
  const usePopupMenuNavigation = menuNavigationMode === "popup";

  const requestPinOverride = usePinOverrideStore((s) => s.requestPinOverride);
  const overrideTimeoutMinutes = useLocationConfigStore(
    (s) => s.config.security.managerOverrideTimeoutMinutes,
  );
  const selectedStoreId = useStoreSettingsStore(
    (s) => s.selectedStore?.id ?? null,
  );
  const hiddenMenuIds = useMenuVisibilityStore(
    (s) =>
      (selectedStoreId ? s.hiddenMenuIdsByLocation[selectedStoreId] : null) ??
      EMPTY_HIDDEN_MENU_IDS,
  );

  // OPTIMIZED: Use computed selector to get only order_type, avoiding re-renders on item changes
  const activeOrderId = useOrderStore((s) => s.activeOrderId);
  // Only subscribe to the order_type, not the entire ordersById object
  const currentOrderType = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.order_type || "takeout";
  });
  const currentOrderDbId = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.db_order_id ?? null;
  });
  const currentOrderSessionId = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.session_id ?? null;
  });
  const currentOrderLocalSessionId = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.local_session_id ?? null;
  });
  const currentOrderTableId = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.service_location_id ?? null;
  });
  const isTableSeating = useTableSessionStore((s) => {
    if (currentOrderType !== "dine_in") return false;
    const sessionIds = [
      currentOrderSessionId,
      currentOrderLocalSessionId,
    ].filter(Boolean);
    const orderIds = [activeOrderId].filter(Boolean);
    if (
      Object.values(s.sessions).some(
        (session) =>
          session.status === "seating" &&
          (sessionIds.includes(session.id) ||
            (!!session.order_id && orderIds.includes(session.order_id))),
      )
    ) {
      return true;
    }
    return currentOrderTableId
      ? s.sessions[currentOrderTableId]?.status === "seating"
      : false;
  });
  // Block menu adds until the backend order exists — for ALL order types now.
  // Dine-in creates at seating; takeout eager-creates on order start. In both
  // cases the order has no db_order_id until the backend row lands.
  //
  // OFFLINE: a backend row can't be created, so the order is created locally and
  // its create_order op is queued — items legitimately proceed under the local ID
  // (mirrors the offline carve-out in addItemToActiveOrder). Only block while
  // ONLINE, otherwise the overlay would stick on "Creating order" forever offline.
  const { isOnline } = useNetworkStatus();
  // Guard against stale/orphaned activeOrderId: if the order object doesn't
  // exist in ordersById, it's not "creating" — it's the no-active-order state
  // (blocked below with its own overlay message).
  const currentOrderExists = useOrderStore((s) =>
    s.activeOrderId ? !!s.ordersById[s.activeOrderId] : false,
  );
  const isCreatingOrder =
    isOnline && !!activeOrderId && !currentOrderDbId && currentOrderExists;
  // No order to add to: activeOrderId unset (e.g. auto-create OFF before the
  // operator starts a ticket) or set but pruned from ordersById. BillSection
  // shows its "No Active Order" panel in this state — block the menu so item
  // taps can't open the add flow with nowhere to land.
  const hasNoActiveOrder = !activeOrderId || !currentOrderExists;

  // Timeout + retry for the "Creating order" gate. If the eager-create RPC
  // failed or was skipped, the order is permanently stuck with no db_order_id
  // and the menu overlay blocks all interaction — the deadlock described in
  // order-processing.tsx eager-create comment ("addItemToActiveOrder shows a
  // toast and returns without triggering creation"). After the timeout elapses,
  // retry ensureActiveOrderCreated once. If it still doesn't produce a
  // db_order_id, unblock the menu so the on-demand creation path in
  // addItemToActiveOrder can fire when the user taps an item.
  const CREATE_ORDER_TIMEOUT_MS = 8_000;
  const [creationRetryAt, setCreationRetryAt] = useState<number | null>(null);
  const creationRetryRef = useRef(false);
  useEffect(() => {
    if (!isCreatingOrder) {
      setCreationRetryAt(null);
      creationRetryRef.current = false;
      return;
    }
    if (creationRetryAt === null) {
      setCreationRetryAt(Date.now() + CREATE_ORDER_TIMEOUT_MS);
      return;
    }
    if (Date.now() < creationRetryAt) return;
    if (creationRetryRef.current) return; // already retried
    creationRetryRef.current = true;
    console.log(
      "[MenuSection] Creating order timed out — retrying ensureActiveOrderCreated",
    );
    void useOrderStore.getState().ensureActiveOrderCreated(activeOrderId);
    // After the retry, give it another window; if still no db_order_id,
    // unblock so addItemToActiveOrder's on-demand path can fire.
    const secondChanceMs = 3_000;
    const timer = setTimeout(() => {
      const dbId =
        useOrderStore.getState().ordersById[activeOrderId]?.db_order_id;
      if (!dbId) {
        console.log(
          "[MenuSection] Second chance expired — unblocking menu (addItemToActiveOrder will handle creation on-demand)",
        );
        setCreationRetryAt(0); // sentinel: unblock
      }
    }, secondChanceMs);
    return () => clearTimeout(timer);
  }, [isCreatingOrder, creationRetryAt, activeOrderId]);

  // Effective gate: blocked while creating (unless we've unblocked after timeout).
  const effectiveCreatingOrder = isCreatingOrder && creationRetryAt !== 0;
  // Per-order PIN attribution: block adding items (which is what creates the
  // backend order row) until the staff who's ringing has been verified. This
  // closes the timing gap where an order could be created — and attributed —
  // before the PIN is entered. The PIN prompt itself (OrderPinGate) is rendered
  // by BillSection; here we only gate adds and surface the right message.
  const requirePinPerOrder = useStoreSettingsStore((s) => s.requirePinPerOrder);
  const orderAttributionOrderId = useEmployeeStore(
    (s) => s.orderAttributionOrderId,
  );
  const currentOrderPaidStatus = useOrderStore((s) => {
    const order = s.activeOrderId ? s.ordersById[s.activeOrderId] : null;
    return order?.paid_status ?? null;
  });
  // Block adds until a PIN was verified for THIS specific order. Order-bound so
  // a stale verification from another order can't unblock this one. Skips once
  // the order is created (db_order_id) — seated dine-in / mid-order — and never
  // on the empty / just-paid state.
  const isAwaitingOrderPin =
    requirePinPerOrder &&
    !!activeOrderId &&
    orderAttributionOrderId !== activeOrderId &&
    !currentOrderDbId &&
    currentOrderPaidStatus !== "Paid";
  const isMenuAddDisabled =
    hasNoActiveOrder ||
    isTableSeating ||
    effectiveCreatingOrder ||
    isAwaitingOrderPin;
  // Seating takes precedence over "creating" in the label (a dine-in order is
  // also db_order_id-less while seating, but "Seating in progress" is clearer).
  const menuDisabledTitle = hasNoActiveOrder
    ? "No Active Order"
    : isTableSeating
      ? "Seating in progress"
      : isAwaitingOrderPin
        ? "Enter PIN to start"
        : "Creating order";
  const menuDisabledMessage = hasNoActiveOrder
    ? "Start an order to add items."
    : isTableSeating
      ? "Items can be added once the table is seated."
      : isAwaitingOrderPin
        ? "Enter your PIN to start this order."
        : "Items can be added once the order is ready.";
  const updateActiveOrderDetails = useOrderStore(
    (s) => s.updateActiveOrderDetails,
  );

  const isOrderTypeDrawerOpen = useOrderTypeDrawerStore((s) => s.isOpen);
  const closeDrawer = useOrderTypeDrawerStore((s) => s.closeDrawer);

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

  const temporaryActiveCategorySet = useMemo(
    () => new Set(temporaryActiveCategories),
    [temporaryActiveCategories],
  );

  // Self-reference so the menu-level PIN callback can resume the same selection.
  const handleMenuCategorySelectRef = useRef<
    (
      menuName: string,
      categoryName: string,
      menuAlreadyApproved?: boolean,
    ) => void
  >(() => {});

  const visibleMenus = useMemo(
    () => menus.filter((menu) => !hiddenMenuIds.includes(menu.id)),
    [menus, hiddenMenuIds],
  );

  const menusById = useMemo(() => {
    const next = new Map<string, (typeof menus)[number]>();
    for (const menu of visibleMenus) next.set(menu.id, menu);
    return next;
  }, [visibleMenus]);

  const menusByName = useMemo(() => {
    const next = new Map<string, (typeof menus)[number]>();
    for (const menu of visibleMenus) next.set(menu.name, menu);
    return next;
  }, [visibleMenus]);

  const availableMenus = useMemo(
    () =>
      visibleMenus.filter(
        (menu) =>
          isMenuAvailableNow(menu.id) || temporaryActiveMenuSet.has(menu.name),
      ),
    [visibleMenus, isMenuAvailableNow, temporaryActiveMenuSet],
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
      const selectedIndex = visibleMenus.findIndex(
        (m) => m.name === activeMeal,
      );
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
  }, [isMenuDialogOpen, activeMeal, visibleMenus]);

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

    const applySelection = () => {
      setActiveTab("Menu");
      setActiveMeal(menuName);
      setActiveCategory(menu.categories[0]?.name || "");
      setIsMenuDialogOpen(false);
      setLastSelectedMenuId(menu.id);
    };

    const isAvailable =
      isMenuAvailableNow(menu.id) || temporaryActiveMenuSet.has(menu.name);

    if (isAvailable) {
      applySelection();
    } else {
      // Every locked menu needs its own PIN — no "already unlocked" shortcut.
      // The callback completes this one selection, so "always require PIN"
      // needs no lingering grant to fall back on.
      requestPinOverride(
        { type: "select_menu", payload: { menuName } },
        applySelection,
      );
    }
  };

  const handleMenuCategorySelect = useCallback(
    (
      menuName: string,
      categoryName: string,
      // Set when the operator has just cleared the menu-level PIN gate for this
      // very selection. Without it, a re-entry under "always require PIN"
      // (which leaves no grant behind) would prompt for the menu forever.
      menuAlreadyApproved = false,
    ) => {
      const menu = menusByName.get(menuName);
      if (!menu) return;

      const applySelection = () => {
        setActiveTab("Menu");
        setActiveMeal(menuName);
        setActiveCategory(categoryName);
        setLastSelectedMenuId(menu.id);
        setIsMenuDialogOpen(false);
      };

      const isAvailable =
        menuAlreadyApproved ||
        isMenuAvailableNow(menu.id) ||
        temporaryActiveMenuSet.has(menu.name);

      // Each lock is cleared on its own — no global "manager is unlocked" state.
      if (!isAvailable) {
        requestPinOverride({ type: "select_menu", payload: { menuName } }, () =>
          handleMenuCategorySelectRef.current(menuName, categoryName, true),
        );
        return;
      }

      const category = menu.categories.find(
        (entry) => entry.name === categoryName,
      );
      const categoryKey = category?.id ?? categoryName;
      const isCategoryAvailable =
        // An existing grant on this category (or on the menu holding it) counts,
        // so a still-valid unlock doesn't re-prompt on every tap.
        temporaryActiveCategorySet.has(categoryName) ||
        temporaryActiveMenuSet.has(menu.name) ||
        (isCategoryAvailableNow(categoryName) &&
          useMenuStore.getState().isCategoryActiveForMenu(menu.id, categoryKey));

      if (!isCategoryAvailable) {
        requestPinOverride(
          {
            type: "select_category",
            payload: { categoryName },
          },
          applySelection,
        );
        return;
      }

      applySelection();
    },
    [
      isCategoryAvailableNow,
      isMenuAvailableNow,
      menusByName,
      temporaryActiveCategorySet,
      requestPinOverride,
      setLastSelectedMenuId,
      temporaryActiveMenuSet,
    ],
  );

  handleMenuCategorySelectRef.current = handleMenuCategorySelect;

  // A manager grant must not outlive what justified it. Without this, a grant
  // issued once stayed in the store for the app's lifetime and every later
  // access to that menu/category silently skipped the PIN gate.
  //
  //  - timeout 0 ("always require PIN"): the grant covers only the selection it
  //    opened. Navigating elsewhere revokes it, so coming back re-prompts.
  //  - timed session: grants die with the session.
  useEffect(() => {
    const store = useMenuStore.getState();
    const { temporaryActiveMenus: grantedMenus, temporaryActiveCategories } =
      store;
    if (!grantedMenus.length && !temporaryActiveCategories.length) return;

    if (overrideTimeoutMinutes > 0) {
      if (!usePinOverrideStore.getState().isUnlocked()) {
        store.clearTemporaryAccess();
      }
      return;
    }

    const staleMenus = grantedMenus.filter((name) => name !== activeMeal);
    const staleCategories = temporaryActiveCategories.filter(
      (name) => name !== activeCategory,
    );
    if (staleMenus.length || staleCategories.length) {
      store.revokeTemporaryAccess(staleMenus, staleCategories);
    }
  }, [activeMeal, activeCategory, overrideTimeoutMinutes, availabilityTick]);

  const filteredMenuItems = useMemo(() => {
    // TEMP(menu-override-debug): remove once the empty-grid report is resolved.
    const debug = (stage: string, extra: Record<string, unknown> = {}) => {
      if (!__DEV__) return;
      console.log("[menu-override]", stage, {
        activeMeal,
        activeCategory,
        menuGrants: [...temporaryActiveMenuSet],
        categoryGrants: [...temporaryActiveCategorySet],
        categoryEntryFound: !!activeCategoryEntry,
        rawItemCount: activeCategoryEntry?.items?.length ?? 0,
        // If more than one entry appears here, two menus share a name and
        // Map-last-wins (MenuSection) disagrees with find-first-wins
        // (MenuControls) about which one is open.
        menusNamed: visibleMenus
          .filter((m) => m.name === activeMeal)
          .map((m) => `${m.id}:[${m.categories.map((c) => c.name).join("|")}]`),
        ...extra,
      });
    };

    if (!activeCategoryEntry?.items || !activeCategory) {
      debug("bail:no-category-entry-or-name");
      return [];
    }
    // isCategoryAvailableNow is schedule-only, so an off-schedule category that
    // a manager just unlocked would otherwise render zero items. A manager
    // grant on the category itself — or on the menu containing it, since
    // unlocking a menu means browsing it — counts as reachable.
    const unlockedByOverride =
      temporaryActiveCategorySet.has(activeCategory) ||
      (!!activeMeal && temporaryActiveMenuSet.has(activeMeal));
    const scheduleAllows = isCategoryAvailableNow(activeCategory);
    if (!scheduleAllows && !unlockedByOverride) {
      debug("bail:category-gate", { scheduleAllows, unlockedByOverride });
      return [];
    }
    const visible = activeCategoryEntry.items.filter(
      (item) => item.availability !== false,
    );
    debug("pass", {
      scheduleAllows,
      unlockedByOverride,
      visibleItemCount: visible.length,
      // If rawItemCount > 0 but visibleItemCount is 0, effective_availability
      // from the sync payload is the culprit, not the override logic.
      availabilityValues: activeCategoryEntry.items
        .slice(0, 8)
        .map((i) => `${i.name}=${String(i.availability)}`),
    });
    return visible;
  }, [
    activeCategory,
    activeCategoryEntry,
    activeMeal,
    isCategoryAvailableNow,
    temporaryActiveCategorySet,
    temporaryActiveMenuSet,
    visibleMenus,
    availabilityTick,
  ]);
  const numColumns = 5;
  // NOTE: no last-row spacer padding here (the FlatList-era hack). FlashList's
  // grid layout sizes every cell to containerWidth/numColumns via span, so a
  // partial last row already renders left-aligned at the right width. Filler
  // cells actively broke the grid: they render at height 0, and FlashList feeds
  // every measured cell height into a running AverageWindow that becomes the
  // layout height for all not-yet-measured cells. Each category with a partial
  // last row pushed 1-4 zeros into that average (and it carries across layout
  // managers), so the next menu's rows were laid out shorter than the tiles
  // actually draw — rows overlapping each other on menu switch.

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
    // Perf F5: warm the WHOLE category, not just the first 6/12 — items past
    // the old window paid the full modifier-tree computation on tap (latency
    // cliff at index 12). The rAF-chunked loop below keeps each batch small,
    // and the cursor runs in list order so above-the-fold items still warm
    // first. Image prefetch stays capped to the visible window.
    const itemsToWarm = filteredMenuItems;
    const visibleItems = filteredMenuItems.slice(0, isTableOrder ? 6 : 12);
    let cancelled = false;
    let pendingRaf: number | null = null;
    let pendingTimeout: ReturnType<typeof setTimeout> | null = null;
    const generation = beginMenuModifierPreWarm();

    const handle = InteractionManager.runAfterInteractions(() => {
      if (cancelled || !isMenuModifierPreWarmCurrent(generation)) return;
      // Image prefetch is fire-and-forget — kick it off immediately, it
      // doesn't compete with the JS thread.
      pendingTimeout = setTimeout(
        () => {
          if (cancelled || !isMenuModifierPreWarmCurrent(generation)) return;
          prefetchMenuItemRemoteImages(visibleItems);

          // Dine-in favors responsiveness: warm fewer items in smaller chunks.
          const chunkSize = isTableOrder ? 2 : 5;
          const store = useModifierSidebarStore.getState();
          let cursor = 0;
          const step = () => {
            if (cancelled || !isMenuModifierPreWarmCurrent(generation)) return;
            const slice = itemsToWarm.slice(cursor, cursor + chunkSize);
            if (slice.length === 0) {
              pendingRaf = null;
              return;
            }
            store.preWarmMany(slice, currentCategoryId, activeMenuId);
            cursor += chunkSize;
            pendingRaf = requestAnimationFrame(step);
          };
          pendingRaf = requestAnimationFrame(step);
        },
        isTableOrder ? 180 : 0,
      );
    });

    return () => {
      cancelled = true;
      handle.cancel?.();
      if (pendingTimeout !== null) clearTimeout(pendingTimeout);
      if (pendingRaf !== null) cancelAnimationFrame(pendingRaf);
    };
  }, [filteredMenuItems, currentCategoryId, activeMenuId, isTableOrder]);

  // OPTIMIZED: Memoized keyExtractor to prevent recreation
  // NOTE: All hooks must be called before any early returns
  const keyExtractor = useCallback((item: MenuItemType) => item.id, []);

  // OPTIMIZED: Memoized renderItem using hoisted category ID
  const renderMenuItem = useCallback(
    ({ item, index }: ListRenderItemInfo<MenuItemType>) => {
      const highThrough = numColumns * 3;
      const normalThrough = numColumns * 10;
      const imagePriority =
        index < highThrough ? "high" : index < normalThrough ? "normal" : "low";
      return (
        <View style={menuSectionStyles.gridCell}>
          <MenuItem
            item={item}
            imageSource={getImageSource(item)}
            imagePriority={imagePriority}
            onOrderClosedCheck={onOrderClosedCheck}
            categoryId={currentCategoryId}
            menuId={activeMenuId}
            disabled={isMenuAddDisabled}
          />
        </View>
      );
    },
    [
      onOrderClosedCheck,
      currentCategoryId,
      activeMenuId,
      numColumns,
      isMenuAddDisabled,
    ],
  );

  const showMenuImages = useSettingsStore((s) => s.showMenuImages);
  // Row-height estimate. Image tiles are square at ~1/5 of the grid width;
  // text-only tiles are a fixed 80 (+6 gridCell paddingBottom).
  const estimatedItemSize = showMenuImages ? 240 : 86;

  const formatTime = (d?: Date | null) =>
    d ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }) : "";

  // ModifierScreen is now rendered as an overlay in parent components (order-processing.tsx, tables/[tableId].tsx)
  // This eliminates re-renders when opening/closing the modifier screen
  return (
    <>
      <View
        key={colorScheme}
        className={`mt-0 flex-1 relative overflow-hidden ${
          isTableOrder ? "pl-0 pr-2" : "px-2"
        }`}
        style={{ backgroundColor: colors.card }}
      >
        {/* Row 1: Header (Order Line) + Toolbar */}
        <View
          className="px-0 flex-row items-center"
          style={{ paddingVertical: sc(8) }}
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
                <Search color={colors.label} size={sc(14)} />
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
                  size={sc(14)}
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
                  size={sc(14)}
                />
              </TouchableOpacity>
            )}

            {!isTableOrder && showTablesButton && (
              <Link
                href="/tables"
                className="flex-row items-center rounded-lg p-3 justify-start"
                style={{ backgroundColor: colors.panel }}
              >
                <Sofa color={colors.label} size={sc(14)} />
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
                  size={sc(14)}
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
                    <UtensilsCrossed color={colors.label} size={sc(13)} />
                    <Text
                      style={{
                        color: colors.heading,
                        fontSize: sc(13),
                        fontWeight: "500",
                      }}
                    >
                      {activeMeal || "Select Menu"}
                    </Text>
                    <ChevronDown color={colors.label} size={sc(13)} />
                  </TouchableOpacity>
                </DialogTrigger>
              )}
              <DialogContent
                className="max-h-[80vh] bg-screen border border-border rounded-2xl p-0 overflow-hidden"
                style={{
                  backgroundColor: colors.screen,
                  borderColor: colors.border,
                  maxWidth: sc(480),
                  alignSelf: "center",
                  width: "90%",
                }}
              >
                <DialogHeader
                  className="px-6 pt-6 pb-4 border-b border-border"
                  style={{ borderBottomColor: colors.border }}
                >
                  <DialogTitle>
                    <Text
                      style={{
                        fontSize: sc(18),
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
                  contentContainerStyle={{ padding: sc(16), gap: sc(10) }}
                >
                  {visibleMenus.map((menu) => {
                    const isAvailable =
                      isMenuAvailableNow(menu.id) ||
                      temporaryActiveMenuSet.has(menu.name);
                    const isScheduled =
                      menu.schedules && menu.schedules.length > 0;
                    const isSelected = activeMeal === menu.name;
                    const menuCategories = Array.isArray(menu.categories)
                      ? menu.categories
                      : [];

                    return (
                      <TouchableOpacity
                        key={menu.id}
                        onPress={() => handleMenuSelect(menu.name)}
                        className="p-4 rounded-xl border"
                        style={{
                          backgroundColor: !isAvailable
                            ? colors.panel + "cc"
                            : colors.panel,
                          borderColor: isSelected
                            ? colors.teal + "b0"
                            : !isAvailable
                              ? colors.border + "90"
                              : colors.border,
                          opacity: !isAvailable ? 0.65 : 1,
                          shadowColor: "#000000",
                          shadowOpacity: 0.04,
                          shadowRadius: 4,
                          shadowOffset: { width: 0, height: 2 },
                          elevation: 1,
                        }}
                      >
                        <View className="flex-row justify-between items-center">
                          <Text
                            style={{
                              fontWeight: "600",
                              fontSize: sc(16),
                              color: !isAvailable
                                ? colors.muted
                                : colors.heading,
                            }}
                          >
                            {menu.name}
                          </Text>
                          <View className="flex-row items-center gap-2">
                            {isSelected && (
                              <View
                                style={{
                                  paddingHorizontal: sc(7),
                                  paddingVertical: sc(3),
                                  borderRadius: 999,
                                  backgroundColor: colors.teal + "1f",
                                  borderWidth: 1,
                                  borderColor: colors.teal + "66",
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: sc(10),
                                    fontWeight: "700",
                                    color: colors.teal,
                                  }}
                                >
                                  Selected
                                </Text>
                              </View>
                            )}
                            {isScheduled && !isAvailable && (
                              <View
                                style={{
                                  flexDirection: "row",
                                  alignItems: "center",
                                  gap: sc(4),
                                  backgroundColor: colors.danger + "18",
                                  borderWidth: 1,
                                  borderColor: colors.danger + "40",
                                  paddingHorizontal: sc(7),
                                  paddingVertical: sc(3),
                                  borderRadius: sc(6),
                                }}
                              >
                                <Lock size={sc(11)} color={colors.danger} />
                                <Text
                                  style={{
                                    fontSize: sc(10),
                                    color: colors.danger,
                                  }}
                                >
                                  Schedule
                                </Text>
                              </View>
                            )}
                            {isScheduled && isAvailable && (
                              <Clock size={sc(14)} color={colors.label} />
                            )}
                            {isSelected ? (
                              <CheckCircle2 size={sc(16)} color={colors.teal} />
                            ) : isAvailable ? (
                              <CheckCircle2
                                size={sc(16)}
                                color={colors.success}
                              />
                            ) : (
                              <Lock size={sc(16)} color={colors.muted} />
                            )}
                          </View>
                        </View>
                        {menu.description ? (
                          <Text
                            style={{
                              fontSize: sc(12),
                              color: colors.muted,
                              marginTop: sc(4),
                            }}
                          >
                            {menu.description}
                          </Text>
                        ) : null}
                        {menuCategories.length > 0 && (
                          <View
                            style={{
                              flexDirection: "row",
                              flexWrap: "wrap",
                              gap: sc(6),
                              marginTop: sc(10),
                            }}
                          >
                            {menuCategories.map((category, index) => {
                              const categoryLabel =
                                typeof category === "string"
                                  ? category
                                  : category?.name || "Category";
                              const isSelectedCategory =
                                isSelected && activeCategory === categoryLabel;

                              return (
                                <TouchableOpacity
                                  key={`${categoryLabel}-${index}`}
                                  onPress={() =>
                                    handleMenuCategorySelect(
                                      menu.name,
                                      categoryLabel,
                                    )
                                  }
                                  style={{
                                    paddingHorizontal: sc(10),
                                    paddingVertical: sc(4),
                                    borderRadius: sc(12),
                                    backgroundColor: isSelectedCategory
                                      ? colors.teal + "20"
                                      : colors.screen,
                                    borderWidth: 1,
                                    borderColor: isSelectedCategory
                                      ? colors.teal + "70"
                                      : colors.border,
                                  }}
                                  activeOpacity={0.78}
                                >
                                  <Text
                                    style={{
                                      fontSize: sc(12),
                                      color: isSelectedCategory
                                        ? colors.teal
                                        : colors.label,
                                      fontWeight: isSelectedCategory
                                        ? "700"
                                        : "500",
                                    }}
                                  >
                                    {categoryLabel}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
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

        {/* Row 2b: "menu may be out of date" strip. Self-hiding — renders
            nothing unless the grid is showing cached or no-longer-fresh data. */}
        {!forceOrdersView && activeTab === "Menu" && (
          <View className={isTableOrder ? "px-3" : ""}>
            <MenuStaleBanner />
          </View>
        )}

        {/* Row 3: Category controls */}
        {!forceOrdersView &&
          activeTab === "Menu" &&
          (activeMeal ? (
            <View
              className={isTableOrder ? "px-3" : ""}
              style={{ paddingBottom: sc(12) }}
            >
              <MenuControls
                activeMeal={activeMeal}
                activeMenuId={activeMenu?.id}
                menuOptions={visibleMenus}
                showMenuButtons={usePopupMenuNavigation}
                onMealChange={handleMealChange}
                activeCategory={activeCategory || ""}
                onCategoryChange={setActiveCategory}
                onMenuCategoryChange={handleMenuCategorySelect}
                rightSlot={
                  !usePopupMenuNavigation && placeMenuSelectorInMenuRow ? (
                    <TouchableOpacity
                      onPress={() => setIsMenuDialogOpen(true)}
                      className="flex-row items-center rounded-lg px-3 py-2.5 gap-2"
                      style={{ backgroundColor: colors.panel }}
                    >
                      <UtensilsCrossed color={colors.label} size={sc(13)} />
                      <Text
                        style={{
                          color: colors.heading,
                          fontSize: sc(13),
                          fontWeight: "500",
                        }}
                      >
                        {activeMeal || "Select Menu"}
                      </Text>
                      <ChevronDown color={colors.label} size={sc(13)} />
                    </TouchableOpacity>
                  ) : undefined
                }
              />
            </View>
          ) : (
            <MenuUnavailableState />
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
                {/* Perf F8: FlashList replaces the tuned FlatList — cell
                    recycling instead of mount/unmount during fling scrolls.
                    Column gutters moved into renderItem's gridCell wrapper
                    (no columnWrapperStyle in FlashList); the old batching
                    props (windowSize etc.) have no FlashList equivalent. */}
                <View
                  style={[
                    menuSectionStyles.gridContainer,
                    { backgroundColor: colors.card, marginTop: sc(8) },
                  ]}
                >
                  <FlashList
                    data={filteredMenuItems}
                    keyExtractor={keyExtractor}
                    numColumns={numColumns}
                    estimatedItemSize={estimatedItemSize}
                    // NOTE: do NOT set `disableAutoLayout` here. It turns off the
                    // native AutoLayoutView pass (`clearGapsAndOverlaps`), which is
                    // what corrects cells drawn at stale offsets when a measured
                    // tile height differs from the estimate — i.e. the exact
                    // overlapping-tiles artifact seen on menu switch. It was
                    // originally added to hide a dark rectangle below short lists;
                    // that turned out to be a themed `backgroundColor` frozen at
                    // module load (see the gridContainer note above) and is fixed
                    // properly by the inline background at this render site.
                    drawDistance={500}
                    contentContainerStyle={{
                      backgroundColor: colors.card,
                      paddingBottom: 128,
                    }}
                    showsVerticalScrollIndicator={false}
                    // Re-render visible cells when the add-disabled state flips
                    // (e.g. first order's db_order_id arrives → isMenuAddDisabled
                    // false). Without this, filteredMenuItems keeps the same item
                    // references so FlashList leaves the first category's cells
                    // grayed out until a category switch rebuilds the data.
                    extraData={isMenuAddDisabled}
                    ListEmptyComponent={
                      <View
                        style={{
                          flex: 1,
                          alignItems: "center",
                          justifyContent: "center",
                          height: sc(192),
                        }}
                      >
                        <Text style={{ color: colors.muted, fontSize: sc(18) }}>
                          No items match the current filters.
                        </Text>
                      </View>
                    }
                    renderItem={renderMenuItem}
                  />
                </View>
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
        <SeatingBlockingOverlay
          isVisible={isMenuAddDisabled}
          title={menuDisabledTitle}
          message={menuDisabledMessage}
          showSpinner={!hasNoActiveOrder}
        />
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
