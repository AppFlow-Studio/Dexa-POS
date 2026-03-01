import DraggableMenuItem from "@/components/menu/DraggableMenuItem";
import MenuHeader from "@/components/menu/MenuHeader";
import PriceEditBottomSheet, {
  PriceEditBottomSheetRef,
} from "@/components/menu/PriceEditBottomSheet";
import ConfirmationModal from "@/components/settings/reset-application/ConfirmationModal";
import { useToast } from "@/contexts/ToastContext";
import { useTriggerPosSync } from "@/hooks/pos/usePosSync";
import { useSupabaseClient } from "@/hooks/useSupabaseClient";
import { MENU_IMAGE_MAP } from "@/lib/mockData";
import { colors } from "@/lib/theme";
import { Menu, MenuItemType } from "@/lib/types";
import { MenuService } from "@/services/menuService";
import { useMenuStore } from "@/stores/useMenuStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { router } from "expo-router";
import {
  ChevronDown,
  ChevronUp,
  Edit,
  Eye,
  EyeOff,
  GripVertical,
  MapPin,
  Settings,
  Trash2,
  Utensils,
} from "lucide-react-native";
import React, { useCallback, useMemo, useRef, useState } from "react";
import { FlatList, Image, Text, TouchableOpacity, View } from "react-native";
import {
  Gesture,
  GestureDetector,
  ScrollView,
} from "react-native-gesture-handler";
import Animated, {
  Extrapolate,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useMenuLayout } from "./_layout";
// Get image source for preview
const getImageSource = (image: string | undefined) => {
  if (image && image.length > 200) {
    return { uri: `data:image/jpeg;base64,${image}` };
  }

  if (image) {
    // Try to get image from assets
    return `${image}`;
  }

  return undefined;
};
// Menu Management Types
// Using Menu interface from types.ts
// Note: The store Menu interface has categories as string[] (category names)
// while the local display needs Category objects with items

interface Category {
  id: string;
  name: string;
  isActive: boolean;
  items: MenuItemType[];
  schedules: any[];
  order: number;
  location_id?: string | null;
}

interface ExtendedModifierGroup {
  id: string;
  name: string;
  type: "required" | "optional";
  selectionType: "single" | "multiple";
  maxSelections?: number;
  description?: string;
  options: any[];
  items: MenuItemType[];
  source: "menuItem" | "store";
}

// Draggable Menu Component
interface DraggableMenuProps {
  menu: any;
  index: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onReorderCategories: (
    menuId: string,
    fromIndex: number,
    toIndex: number
  ) => void;
  onToggleMenuActive: (menuId: string) => void;
  onToggleCategoryActive: (menuId: string, categoryId: string) => void;
  onSchedule: () => void;
  onEdit: () => void;
  onItemPriceEdit: (
    item: MenuItemType,
    categoryId: string,
    menuId: string
  ) => void;
  onReorderItems: (
    categoryId: string,
    fromIndex: number,
    toIndex: number
  ) => void;
  isEditable: boolean;
}

// Helper to check if now is within a schedule
const checkAvailability = (schedules: any[]): boolean => {
  if (!schedules || schedules.length === 0) return true;

  const now = new Date();

  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const currentDay = dayNames[now.getDay()];
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  return schedules.some((rule) => {
    if (!rule.isActive) return false;
    // Respect the day if it exists and is not empty
    if (rule.days && rule.days.length > 0 && !rule.days.includes(currentDay)) {
      return false;
    }

    let startMinutes = 0;
    let endMinutes = 0;

    // Helper to get minutes from time string (ISO or HH:MM)
    const getMinutes = (timeStr: string) => {
      if (!timeStr) return 0;
      if (timeStr.includes("T")) {
        // ISO String: Parse as Date (converts to local time)
        const date = new Date(timeStr);
        if (isNaN(date.getTime())) return 0;
        return date.getHours() * 60 + date.getMinutes();
      } else if (timeStr.includes(":")) {
        // HH:MM format
        const [h, m] = timeStr.split(":").map(Number);
        return (h || 0) * 60 + (m || 0);
      }
      return 0;
    };

    startMinutes = getMinutes(rule.startTime);
    endMinutes = getMinutes(rule.endTime);

    // Handle overnight shift (e.g. 22:00 - 02:00)
    if (endMinutes < startMinutes) {
      // Available if we are after start (e.g. 23:00) OR before end (e.g. 01:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  });
};

// Helper to format time string for display (e.g. converts ISO to 6:00 AM)
const formatTimeDisplay = (timeStr: string) => {
  if (!timeStr) return "";

  if (timeStr.includes("T")) {
    const date = new Date(timeStr);
    if (isNaN(date.getTime())) return timeStr;
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  return timeStr;
};

const DraggableMenu = React.memo(({
  menu,
  index,
  onReorder,
  onReorderCategories,
  onToggleMenuActive,
  onToggleCategoryActive,
  onSchedule,
  onEdit,
  onItemPriceEdit,
  isEditable,
  onReorderItems,
}: DraggableMenuProps) => {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const isDragging = useSharedValue(false);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.05);
    })
    .onUpdate((event) => {
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const itemHeight = 200; // Approximate height of each menu item
      const newIndex = Math.round(index + event.translationY / itemHeight);

      if (newIndex !== index && newIndex >= 0) {
        runOnJS(onReorder)(index, newIndex);
      }

      translateY.value = withSpring(0);
      scale.value = withSpring(1);
      isDragging.value = false;
    });

  const animatedStyle = useAnimatedStyle(() => {
    const shadowOpacity = interpolate(
      scale.value,
      [1, 1.05],
      [0, 0.3],
      Extrapolate.CLAMP
    );

    return {
      transform: [{ translateY: translateY.value }, { scale: scale.value }],
      shadowOpacity,
      elevation: isDragging.value ? 8 : 0,
      zIndex: isDragging.value ? 1000 : 1,
    };
  });

  const isAvailable = checkAvailability(menu.schedules);

  return (
    <Animated.View
      style={animatedStyle}
      className="bg-surface rounded-lg border border-gray-700 p-4 mb-3"
    >
      <View className="flex-row items-center justify-between mb-1.5">
        <View className="flex-row items-center gap-2">
          <GestureDetector gesture={panGesture}>
            <View className="p-2 cursor-grab">
              <GripVertical size={20} color={colors.label} />
            </View>
          </GestureDetector>
          <Text className="text-2xl font-semibold text-white">{menu.name}</Text>
          <View
            className={`px-2.5 py-1.5 rounded-full ${
              menu.isActive && isAvailable
                ? "bg-green-900/30 border border-green-500"
                : "bg-red-900/30 border border-red-500"
            }`}
          >
            <Text
              className={`text-lg font-medium ${
                menu.isActive && isAvailable ? "text-green-400" : "text-red-400"
              }`}
            >
              {menu.isActive
                ? isAvailable
                  ? "Available Now"
                  : "Unavailable Now"
                : "Inactive"}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => onToggleMenuActive(menu.id)}
            disabled={!isEditable}
            className={`p-2 bg-panel rounded border ${
              isEditable ? "border-gray-600" : "border-gray-800 opacity-50"
            }`}
          >
            {menu.isActive ? (
              <Eye size={20} color={isEditable ? "#10B981" : "#4B5563"} />
            ) : (
              <EyeOff size={20} color={isEditable ? colors.danger : "#4B5563"} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            onPress={onEdit}
            disabled={!isEditable}
            className={`p-2 bg-panel rounded border ${
              isEditable ? "border-gray-600" : "border-gray-800 opacity-50"
            }`}
          >
            <Settings size={20} color={isEditable ? colors.label : "#4B5563"} />
          </TouchableOpacity>
        </View>
      </View>
      <View className="ml-6">
        <Text className="text-xl font-medium text-gray-300 mb-1.5">
          Categories ({menu.categories.length})
        </Text>
        <View className="gap-2">
          {menu.categories.map((category: any, categoryIndex: number) => (
            <DraggableMenuCategory
              key={category.id}
              category={category}
              menuId={menu.id}
              index={categoryIndex}
              onReorder={(fromIndex, toIndex) =>
                onReorderCategories(menu.id, fromIndex, toIndex)
              }
              onToggleActive={onToggleCategoryActive}
              items={category.items || []}
              onItemPriceEdit={onItemPriceEdit}
              onReorderItems={onReorderItems}
              isEditable={
                !!(
                  category.location_id &&
                  isEditable &&
                  category.location_id === menu.location_id
                )
              } // Simplistic check - refined in main component if needed
            />
          ))}
        </View>
      </View>
    </Animated.View>
  );
});

interface DraggableMenuCategoryProps {
  category: any;
  menuId: string;
  index: number;
  onReorder: (fromIndex: number, toIndex: number) => void;
  onToggleActive: (menuId: string, categoryId: string) => void;
  items: MenuItemType[];
  onItemPriceEdit: (
    item: MenuItemType,
    categoryId: string,
    menuId: string
  ) => void;
  onReorderItems: (
    categoryId: string,
    fromIndex: number,
    toIndex: number
  ) => void;
  isEditable: boolean;
}

const DraggableMenuCategory = React.memo(({
  category,
  menuId,
  index,
  onReorder,
  onToggleActive,
  items,
  onItemPriceEdit,
  isEditable,
  onReorderItems,
}: DraggableMenuCategoryProps) => {
  const translateY = useSharedValue(0);
  const scale = useSharedValue(1);
  const isDragging = useSharedValue(false);
  const [isExpanded, setIsExpanded] = useState(false);

  const panGesture = Gesture.Pan()
    .onStart(() => {
      isDragging.value = true;
      scale.value = withSpring(1.05);
    })
    .onUpdate((event) => {
      translateY.value = event.translationY;
    })
    .onEnd((event) => {
      const itemHeight = 60;
      const newIndex = Math.round(index + event.translationY / itemHeight);

      if (newIndex !== index && newIndex >= 0) {
        runOnJS(onReorder)(index, newIndex);
      }

      translateY.value = withTiming(0);
      scale.value = withSpring(1);
      isDragging.value = false;
    });

  const animatedStyle = useAnimatedStyle(() => {
    const shadowOpacity = interpolate(
      scale.value,
      [1, 1.05],
      [0, 0.2],
      Extrapolate.CLAMP
    );

    return {
      transform: [{ translateY: translateY.value }, { scale: scale.value }],
      shadowOpacity,
      elevation: isDragging.value ? 4 : 0,
      zIndex: isDragging.value ? 500 : 1,
    };
  });

  return (
    <Animated.View
      style={animatedStyle}
      className="bg-panel rounded border border-gray-700"
    >
      <View className="flex-row items-center justify-between p-4">
        <View className="flex-row items-center gap-2">
          <GestureDetector gesture={panGesture}>
            <View className="p-2 -ml-2 cursor-grab">
              <GripVertical size={20} color={colors.muted} />
            </View>
          </GestureDetector>
          <TouchableOpacity
            onPress={() => setIsExpanded(!isExpanded)}
            className="flex-row items-center gap-2"
          >
            {isExpanded ? (
              <ChevronUp size={18} color={colors.label} />
            ) : (
              <ChevronDown size={18} color={colors.label} />
            )}
            <Text className="text-gray-200 text-xl">{category.name}</Text>
            <View className="bg-blue-900/30 border border-blue-500 px-2 py-1 rounded">
              <Text className="text-sm text-blue-400">
                {items.length} items
              </Text>
            </View>
          </TouchableOpacity>
          <View
            className={`px-2.5 py-1.5 rounded-full ${
              category.isActive
                ? "bg-green-900/30 border border-green-500"
                : "bg-red-900/30 border border-red-500"
            }`}
          >
            <Text
              className={`text-lg ${
                category.isActive ? "text-green-400" : "text-red-400"
              }`}
            >
              {category.isActive ? "Available Now" : "Unavailable"}
            </Text>
          </View>
        </View>

        <View className="flex-row items-center gap-2">
          <TouchableOpacity
            onPress={() => onToggleActive(menuId, category.id)}
            disabled={!isEditable}
            className={`p-2 ${!isEditable ? "opacity-50" : ""}`}
          >
            {category.isActive ? (
              <Eye size={20} color={isEditable ? "#10B981" : "#4B5563"} />
            ) : (
              <EyeOff size={20} color={isEditable ? colors.danger : "#4B5563"} />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Expandable Items List for Level 5 Menu Price Editing */}
      {isExpanded && (
        <View className="px-4 pb-4 gap-2">
          {items.length === 0 ? (
            <Text className="text-gray-400">No items in this category</Text>
          ) : (
            items.map((item, itemIndex) => (
              <DraggableMenuItem
                key={item.id}
                item={item}
                index={itemIndex}
                categoryId={category.id}
                menuId={menuId}
                onReorder={(from, to) => onReorderItems(category.id, from, to)}
                onItemPriceEdit={onItemPriceEdit}
                isEditable={isEditable}
              />
            ))
          )}
        </View>
      )}
    </Animated.View>
  );
});

const MenuPage: React.FC = () => {
  const menuItems = useMenuStore((s) => s.menuItems);
  const storeCategories = useMenuStore((s) => s.categories);
  const storeMenus = useMenuStore((s) => s.menus);
  const modifierGroups = useMenuStore((s) => s.modifierGroups);
  const deleteMenuItem = useMenuStore((s) => s.deleteMenuItem);
  const toggleItemAvailability = useMenuStore((s) => s.toggleItemAvailability);
  const getItemsInCategory = useMenuStore((s) => s.getItemsInCategory);
  const getMenuItems = useMenuStore((s) => s.getMenuItems);
  const toggleMenuActive = useMenuStore((s) => s.toggleMenuActive);
  const toggleCategoryActive = useMenuStore((s) => s.toggleCategoryActive);
  const toggleMenuCategoryActive = useMenuStore((s) => s.toggleMenuCategoryActive);
  const isMenuAvailableNow = useMenuStore((s) => s.isMenuAvailableNow);
  const isCategoryAvailableNow = useMenuStore((s) => s.isCategoryAvailableNow);
  const isCategoryActiveForMenu = useMenuStore((s) => s.isCategoryActiveForMenu);
  const updateMenu = useMenuStore((s) => s.updateMenu);
  const reorderMenus = useMenuStore((s) => s.reorderMenus);
  const reorderCategoryItems = useMenuStore((s) => s.reorderCategoryItems);
  const selectedStore = useStoreSettingsStore((s) => s.selectedStore);
  const supabase = useSupabaseClient();
  const { activeTab, searchQuery } = useMenuLayout();
  const triggerPosSync = useTriggerPosSync();

  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefreshMenu = async () => {
    if (!selectedStore?.id || isRefreshing) return;
    setIsRefreshing(true);
    try {
      await triggerPosSync(selectedStore.id, selectedStore.merchant_id);
    } finally {
      setIsRefreshing(false);
    }
  };

  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  );
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({});
  const [scheduleViewType, setScheduleViewType] = useState<
    "menus" | "categories"
  >("menus");

  // Price edit bottom sheet ref
  const priceEditRef = useRef<PriceEditBottomSheetRef>(null);

  // Toast for error messages
  const { show: showToast } = useToast();

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [itemToDelete, setItemToDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);

  // Convert store menus to display format
  // Since storeMenus now contains the full tree (Menu -> Category -> Item),
  // we just need to add computed availability for the top-level menu.
  // Availability is calculated inline in DraggableMenu via checkAvailability(),
  // so no need for a periodic forceUpdate here.
  const menus = useMemo(
    () =>
      storeMenus.map((storeMenu) => ({
        ...storeMenu,
        isAvailableNow: isMenuAvailableNow(storeMenu.id),
      })),
    [storeMenus, isMenuAvailableNow]
  );

  // Pre-compute modifier → items mapping with O(N) instead of O(N*M)
  const modifierToItemsMap = useMemo(() => {
    const map = new Map<string, MenuItemType[]>();
    menuItems.forEach((item) => {
      item.modifierGroupIds?.forEach((groupId) => {
        if (!map.has(groupId)) map.set(groupId, []);
        map.get(groupId)!.push(item);
      });
    });
    return map;
  }, [menuItems]);

  const uniqueModifierGroups = useMemo(() => {
    return modifierGroups
      .map((group) => ({
        ...group,
        items: modifierToItemsMap.get(group.id) || [],
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [modifierGroups, modifierToItemsMap]);

  // Filter menu items based on search — memoized to avoid O(N) on every render
  const filteredItems = useMemo(() => {
    if (!searchQuery) return menuItems;
    const query = searchQuery.toLowerCase();
    return menuItems.filter(
      (item) =>
        item.name.toLowerCase().includes(query) ||
        item.description?.toLowerCase().includes(query)
    );
  }, [menuItems, searchQuery]);

  const handleAddMenu = useCallback(() => {
    router.push("/menu/add-menu");
  }, []);

  const handleAddCategory = useCallback(() => {
    router.push("/menu/add-category");
  }, []);

  const handleAddItem = useCallback(() => {
    router.push("/menu/add-item");
  }, []);

  const handleEditItem = useCallback((item: MenuItemType) => {
    router.push(`/menu/edit-item?itemId=${item.id}`);
  }, []);

  const handleDeleteItem = useCallback((item: MenuItemType) => {
    setItemToDelete({ id: item.id, name: item.name });
    setShowDeleteModal(true);
  }, []);

  const confirmDeleteItem = useCallback(async () => {
    if (!itemToDelete) return;

    // Delete from backend first
    const { success, error } = await MenuService.deleteMenuItem(
      supabase,
      itemToDelete.id
    );
    if (!success) {
      showToast({
        title: "Error",
        message: error?.message || "Failed to delete item",
        type: "error",
      });
      setShowDeleteModal(false);
      setItemToDelete(null);
      return;
    }
    // Then update local store
    deleteMenuItem(itemToDelete.id);
    setShowDeleteModal(false);
    setItemToDelete(null);
  }, [itemToDelete, supabase, deleteMenuItem, showToast]);

  const handleCategoryActive = useCallback(async (id: string) => {
    // Get current state for rollback
    const category = storeCategories.find((c) => c.id === id);
    if (!category) return;

    const newIsActive = !category.isActive;

    // Optimistic update
    toggleCategoryActive(id);

    // Sync to backend
    const { error } = await MenuService.updateCategory(supabase, id, {
      isActive: newIsActive,
    });

    if (error) {
      // Rollback on failure
      toggleCategoryActive(id);
      showToast({
        title: "Error",
        type: "error",
        message: "Failed to update category status",
      });
    }
  }, [storeCategories, toggleCategoryActive, supabase, showToast]);

  const handleToggleAvailability = useCallback(async (id: string) => {
    // Get current state for rollback
    const item = menuItems.find((i) => i.id === id);
    if (!item) return;

    const newAvailability = item.availability === false ? true : false;

    // Optimistic update
    toggleItemAvailability(id);

    // Sync to backend
    const { error } = await MenuService.updateMenuItem(supabase, id, {
      availability: newAvailability,
    });

    if (error) {
      // Rollback on failure
      toggleItemAvailability(id);
      showToast({
        title: "Error",
        type: "error",
        message: "Failed to update item availability",
      });
    }
  }, [menuItems, toggleItemAvailability, supabase, showToast]);

  const handleToggleMenuActive = useCallback(async (menuId: string) => {
    // Get current state for rollback
    const menu = menus.find((m) => m.id === menuId);
    if (!menu) return;

    const newIsActive = !menu.isActive;

    // Optimistic update
    toggleMenuActive(menuId);

    // Sync to backend
    const { error } = await MenuService.updateMenu(supabase, menuId, {
      isActive: newIsActive,
    });

    if (error) {
      // Rollback on failure
      toggleMenuActive(menuId);
      showToast({
        title: "Error",
        type: "error",
        message: "Failed to update menu status",
      });
    }
  }, [menus, toggleMenuActive, supabase, showToast]);

  const handleToggleCategoryActiveForMenu = useCallback((
    menuId: string,
    categoryId: string
  ) => {
    toggleMenuCategoryActive(menuId, categoryId);
  }, [toggleMenuCategoryActive]);

  const handleReorderMenus = useCallback(async (fromIndex: number, toIndex: number) => {
    reorderMenus(fromIndex, toIndex);

    // Persist each menu's display_order to backend
    const updatedMenus = useMenuStore.getState().menus;
    const updates = updatedMenus.map((menu, idx) =>
      MenuService.updateMenu(supabase, menu.id, { displayOrder: idx })
    );

    try {
      const results = await Promise.all(updates);
      if (results.some((r) => r.error)) {
        showToast({
          title: "Error",
          message: "Failed to save menu order",
          type: "error",
        });
        if (selectedStore?.id) triggerPosSync(selectedStore.id, selectedStore.merchant_id);
      }
    } catch {
      if (selectedStore?.id) triggerPosSync(selectedStore.id, selectedStore.merchant_id);
    }
  }, [reorderMenus, supabase, showToast, triggerPosSync, selectedStore]);

  const handleReorderMenuCategories = useCallback(async (
    menuId: string,
    fromIndex: number,
    toIndex: number
  ) => {
    const menu = storeMenus.find((m) => m.id === menuId);
    if (!menu || !menu.categories) return;

    const newCategories = [...menu.categories];
    const [movedCategory] = newCategories.splice(fromIndex, 1);
    newCategories.splice(toIndex, 0, movedCategory);

    // Optimistic update
    updateMenu(menuId, { categories: newCategories });

    // Persist
    const categoryOrders = newCategories.map((c, idx) => ({
      categoryId: c.id,
      displayOrder: idx,
    }));
    const { error } = await MenuService.reorderMenuCategories(
      supabase,
      menuId,
      selectedStore!.id,
      categoryOrders
    );

    if (error) {
      showToast({
        title: "Error",
        message: "Failed to save category order",
        type: "error",
      });
      // Revert would be nice but complex to implement here without full refresh
      triggerPosSync(selectedStore?.id || "", selectedStore?.merchant_id);
    }
  }, [storeMenus, updateMenu, supabase, showToast, triggerPosSync, selectedStore]);

  const handleReorderCategoryItems = useCallback(async (
    categoryId: string,
    fromIndex: number,
    toIndex: number
  ) => {
    // Call store action for immediate UI update
    reorderCategoryItems(categoryId, fromIndex, toIndex);

    // Read reordered items from the UPDATED store tree (not getItemsInCategory which ignores order)
    const updatedMenus = useMenuStore.getState().menus;
    let reorderedItems: MenuItemType[] | undefined;
    for (const menu of updatedMenus) {
      const cat = menu.categories.find((c: any) => c.id === categoryId);
      if (cat?.items) { reorderedItems = cat.items; break; }
    }
    if (!reorderedItems?.length) return;

    const itemOrders = reorderedItems.map((item, idx) => ({
      menuItemId: item.id,
      displayOrder: idx,
    }));
    const { error } = await MenuService.reorderCategoryItems(
      supabase,
      categoryId,
      selectedStore!.id,
      itemOrders
    );

    if (error) {
      showToast({
        title: "Error",
        message: "Failed to save item order",
        type: "error",
      });
      if (selectedStore?.id) {
        triggerPosSync(selectedStore.id, selectedStore.merchant_id);
      }
    }
  }, [reorderCategoryItems, supabase, showToast, triggerPosSync, selectedStore]);

  const isEntityEditable = useCallback((
    entityLocationId: string | null | undefined,
    entityName?: string
  ) => {
    if (!selectedStore?.id) {
      return false;
    }

    // If entity has a location_id, it must match current store
    if (entityLocationId) return entityLocationId === selectedStore.id;
    // If entity has NO location_id, it is global -> NOT editable
    return false;
  }, [selectedStore?.id]);

  const renderMenusContent = () => (
    <View className="flex-1 p-4 bg-panel">
      <MenuHeader
        title={`Menus (${menus.length})`}
        onAddPress={handleAddMenu}
        addButtonLabel="Add Menu"
        onRefresh={handleRefreshMenu}
        isRefreshing={isRefreshing}
      />

      <ScrollView className="flex-1" nestedScrollEnabled={true}>
        <View className="gap-3">
          {menus.map((menu, index) => (
            <DraggableMenu
              key={menu.id}
              menu={menu}
              index={index}
              onReorder={handleReorderMenus}
              onReorderCategories={handleReorderMenuCategories}
              onToggleMenuActive={handleToggleMenuActive}
              onToggleCategoryActive={handleToggleCategoryActiveForMenu}
              onSchedule={() => {
                // Find the original menu from storeMenus to avoid type issues
                const originalMenu = storeMenus.find((m) => m.id === menu.id);
                if (originalMenu) {
                  setSelectedMenu(originalMenu);
                  setScheduleViewType("menus");
                  setShowScheduleModal(true);
                }
              }}
              onEdit={() => router.push(`/menu/edit-menu?id=${menu.id}`)}
              onItemPriceEdit={(item, categoryId, menuId) => {
                priceEditRef.current?.open(
                  {
                    id: item.id,
                    name: item.name,
                    currentPrice: item.price,
                    currentCashPrice: item.cashPrice,
                    currentAvailability: item.availability,
                  },
                  { categoryId, menuId }
                );
              }}
              onReorderItems={handleReorderCategoryItems}
              isEditable={isEntityEditable(menu.location_id, menu.name)}
            />
          ))}
        </View>
      </ScrollView>
    </View>
  );

  const renderCategoriesContent = () => (
    <View className="flex-1 p-4 bg-panel">
      <MenuHeader
        title={`Categories (${storeCategories.length})`}
        onAddPress={handleAddCategory}
        addButtonLabel="Add Category"
        onRefresh={handleRefreshMenu}
        isRefreshing={isRefreshing}
      />

      <FlatList
        key="categories-list"
        data={storeCategories}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 12 }}
        removeClippedSubviews={true}
        maxToRenderPerBatch={8}
        windowSize={5}
        initialNumToRender={8}
        renderItem={({ item: categoryName }) => {
            const categoryItems = getItemsInCategory(categoryName.name);
            const isExpanded = !!expandedCategories[categoryName.name];
            return (
              <View
                className="bg-surface rounded-lg border border-gray-700 p-4"
              >
                <View className="flex-row justify-between items-center">
                  <TouchableOpacity
                    onPress={() =>
                      setExpandedCategories((prev) => ({
                        ...prev,
                        [categoryName.name]: !isExpanded,
                      }))
                    }
                    className="flex-row items-center gap-2 flex-1"
                  >
                    {isExpanded ? (
                      <ChevronUp size={20} color={colors.label} />
                    ) : (
                      <ChevronDown size={20} color={colors.label} />
                    )}
                    <Text className="font-medium text-white text-2xl">
                      {categoryName.name}
                    </Text>
                    <View className="bg-blue-900/30 border border-blue-500 px-2.5 py-1.5 rounded">
                      <Text className="text-lg text-blue-400">
                        {categoryItems.length} items
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <View className="flex-row items-center gap-2">
                    <TouchableOpacity
                      onPress={() => handleCategoryActive(categoryName?.id)}
                      disabled={
                        !isEntityEditable(
                          categoryName.location_id,
                          categoryName.name
                        )
                      }
                      className={`p-2 bg-panel rounded border ${
                        isEntityEditable(
                          categoryName.location_id,
                          categoryName.name
                        )
                          ? "border-gray-600"
                          : "border-gray-800 opacity-50"
                      }`}
                    >
                      {categoryName.isActive ? (
                        <Eye
                          size={20}
                          color={
                            isEntityEditable(
                              categoryName.location_id,
                              categoryName.name
                            )
                              ? "#10B981"
                              : "#4B5563"
                          }
                        />
                      ) : (
                        <EyeOff
                          size={20}
                          color={
                            isEntityEditable(
                              categoryName.location_id,
                              categoryName.name
                            )
                              ? colors.danger
                              : "#4B5563"
                          }
                        />
                      )}
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        const cat = storeCategories.find(
                          (c) => c.name === categoryName.name
                        );
                        if (cat)
                          router.push(`/menu/edit-category?id=${cat.id}`);
                      }}
                      disabled={
                        !isEntityEditable(
                          categoryName.location_id,
                          categoryName.name
                        )
                      }
                      className={`p-2 bg-panel rounded border ${
                        isEntityEditable(
                          categoryName.location_id,
                          categoryName.name
                        )
                          ? "border-gray-600"
                          : "border-gray-800 opacity-50"
                      }`}
                    >
                      <Settings
                        size={20}
                        color={
                          isEntityEditable(
                            categoryName.location_id,
                            categoryName.name
                          )
                            ? colors.label
                            : "#4B5563"
                        }
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {isExpanded && (
                  <View className="mt-3 gap-2">
                    {categoryItems.length === 0 ? (
                      <Text className="text-lg text-gray-400">
                        No items in this category.
                      </Text>
                    ) : (
                      <View className="gap-2 flex flex-row flex-wrap">
                        {categoryItems.map((item) => {
                          const category = storeCategories.find(
                            (c) => c.name === categoryName.name
                          );
                          const categoryPrice = item.price;
                          const hasCustomPricing =
                            item.customPricing &&
                            item.customPricing.some(
                              (p) => p.categoryId === category?.id && p.isActive
                            );

                          return (
                            <TouchableOpacity
                              key={item.id}
                              onPress={() => {
                                priceEditRef.current?.open(
                                  {
                                    id: item.id,
                                    name: item.name,
                                    currentPrice: categoryPrice,
                                    currentCashPrice: item.cashPrice,
                                    currentAvailability: item.availability,
                                  },
                                  {
                                    categoryId: category?.id || null,
                                    menuId: null,
                                  }
                                );
                              }}
                              className="flex-row items-center justify-between bg-panel border border-gray-700 rounded-lg px-3 py-2"
                            >
                              <View className="flex-row items-center gap-2 ">
                                <Text className="text-lg text-white">
                                  {item.name}
                                </Text>
                                {hasCustomPricing && (
                                  <View className="rounded">
                                    <Text className="text-base text-yellow-400">
                                      Custom
                                    </Text>
                                  </View>
                                )}
                              </View>
                              <View className="flex-row items-center gap-2 ml-2">
                                <Text
                                  className={`text-lg ${
                                    hasCustomPricing
                                      ? "text-yellow-400"
                                      : "text-gray-300"
                                  }`}
                                >
                                  ${categoryPrice.toFixed(2)}
                                </Text>
                                {hasCustomPricing && (
                                  <Text className="text-base text-gray-500 line-through">
                                    ${item.price.toFixed(2)}
                                  </Text>
                                )}
                              </View>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )}
                  </View>
                )}
              </View>
            );
          }}
      />
    </View>
  );

  const renderItemsContent = () => (
    <View className="flex-1 p-4 bg-panel">
      <MenuHeader
        title={`Menu Items (${filteredItems.length})`}
        onAddPress={handleAddItem}
        addButtonLabel="Add Item"
        onRefresh={handleRefreshMenu}
        isRefreshing={isRefreshing}
      />

      <FlatList
        key="items-list"
        data={filteredItems}
        keyExtractor={(item) => item.id}
        numColumns={2}
        className="flex-1"
        columnWrapperStyle={{
          justifyContent: "space-between",
          marginBottom: 12,
        }}
        removeClippedSubviews={true}
        maxToRenderPerBatch={8}
        windowSize={5}
        initialNumToRender={8}
        showsVerticalScrollIndicator={false}
        ListEmptyComponent={
          <View className="flex-1 items-center justify-center">
            <Text className="text-xl text-gray-400 text-center">
              No menu items found matching your criteria.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <View className="w-[49%]">
            <MenuItemCard
              item={item}
              onEdit={handleEditItem}
              onDelete={handleDeleteItem}
              onToggleAvailability={handleToggleAvailability}
              onPriceEdit={(editItem) => {
                priceEditRef.current?.open(
                  {
                    id: editItem.id,
                    name: editItem.name,
                    currentPrice: editItem.price,
                    currentCashPrice: editItem.cashPrice,
                    currentAvailability: editItem.availability,
                  },
                  { categoryId: null, menuId: null }
                );
              }}
              editDisabled={
                !isEntityEditable(item.location_id, item.name)
              }
            />
          </View>
        )}
      />
    </View>
  );

  const renderModifiersContent = () => (
    <View className="flex-1 p-4 bg-panel">
      <MenuHeader
        title={`Modifier Groups (${uniqueModifierGroups.length})`}
        onAddPress={() => router.push("/menu/add-modifier")}
        addButtonLabel="Add Modifier"
        onRefresh={handleRefreshMenu}
        isRefreshing={isRefreshing}
      />

      <FlatList
        key="modifiers-list"
        data={uniqueModifierGroups}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ gap: 12 }}
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        windowSize={5}
        initialNumToRender={5}
        renderItem={({ item: modifierGroup }) => (
            <View
              className="bg-surface rounded-lg border border-gray-700 p-4"
            >
              <View className="flex-row items-center justify-between mb-3">
                <View className="flex-row items-center gap-2 flex-wrap">
                  <Text className="text-2xl font-semibold text-white">
                    {modifierGroup.name}
                  </Text>

                  {/* Location Badge */}
                  {modifierGroup.location_id ? (
                    <View className="flex-row items-center bg-purple-900/30 border border-purple-500 px-2.5 py-1 rounded-full gap-1">
                      <MapPin size={14} color="#C084FC" />
                      <Text className="text-sm font-medium text-purple-400">
                        {modifierGroup.location_name || "Local"}
                      </Text>
                    </View>
                  ) : (
                    <View className="bg-green-900/30 border border-green-500 px-2.5 py-1 rounded-full">
                      <Text className="text-sm font-medium text-green-400">
                        Global
                      </Text>
                    </View>
                  )}

                  <View
                    className={`px-3 py-1 rounded-full ${
                      modifierGroup.type === "required"
                        ? "bg-red-900/30 border border-red-500"
                        : "bg-blue-900/30 border border-blue-500"
                    }`}
                  >
                    <Text
                      className={`text-sm font-medium ${
                        modifierGroup.type === "required"
                          ? "text-red-400"
                          : "text-blue-400"
                      }`}
                    >
                      {modifierGroup.type === "required"
                        ? "Required"
                        : "Optional"}
                    </Text>
                  </View>
                  <View className="bg-gray-600/30 border border-gray-500 px-3 py-1 rounded-full">
                    <Text className="text-sm text-gray-300">
                      {modifierGroup.selectionType === "single"
                        ? "Single"
                        : "Multiple"}
                    </Text>
                  </View>
                </View>

                <View className="flex-row items-center gap-2">
                  <TouchableOpacity
                    onPress={() =>
                      router.push(`/menu/edit-modifier?id=${modifierGroup.id}`)
                    }
                    disabled={
                      !isEntityEditable(
                        modifierGroup.location_id,
                        modifierGroup.name
                      )
                    }
                    className={`p-2 bg-panel rounded border ${
                      isEntityEditable(
                        modifierGroup.location_id,
                        modifierGroup.name
                      )
                        ? "border-gray-600"
                        : "border-gray-800 opacity-50"
                    }`}
                  >
                    <Settings
                      size={20}
                      color={
                        isEntityEditable(
                          modifierGroup.location_id,
                          modifierGroup.name
                        )
                          ? colors.label
                          : "#4B5563"
                      }
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Modifier Options */}
              <View className="mb-3">
                <Text className="text-lg font-medium text-gray-300 mb-1.5">
                  Options ({modifierGroup.options.length})
                </Text>
                <View className="flex-row flex-wrap gap-2">
                  {modifierGroup.options.slice(0, 5).map((option, index) => (
                    <View
                      key={index}
                      className="bg-panel border border-gray-600 px-3 py-2 rounded-lg"
                    >
                      <Text className="text-lg text-gray-200">
                        {option.name}
                        {option.price > 0 && (
                          <Text className="text-green-400">
                            {" "}
                            (+${option.price.toFixed(2)})
                          </Text>
                        )}
                      </Text>
                    </View>
                  ))}
                  {modifierGroup.options.length > 5 && (
                    <View className="bg-panel border border-gray-600 px-3 py-2 rounded-lg">
                      <Text className="text-lg text-gray-400">
                        +{modifierGroup.options.length - 5} more
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Items using this modifier */}
              <View className="ml-4">
                <Text className="text-lg font-medium text-gray-300 mb-1.5">
                  Used by Items ({modifierGroup.items.length})
                </Text>
                <View className="gap-2">
                  {modifierGroup.items.slice(0, 3).map((item) => (
                    <View
                      key={item.id}
                      className="flex-row items-center justify-between bg-panel p-3 rounded border border-gray-700"
                    >
                      <View className="flex-row items-center gap-3">
                        <View className="w-10 h-10 rounded border border-gray-600 overflow-hidden">
                          {getImageSource(item.image) ? (
                            <Image
                              source={
                                typeof getImageSource(item.image) === "string"
                                  ? MENU_IMAGE_MAP[
                                      item.image as keyof typeof MENU_IMAGE_MAP
                                    ]
                                  : getImageSource(item.image)
                              }
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <View className="w-full h-full bg-gray-600 items-center justify-center">
                              <Utensils color={colors.label} size={20} />
                            </View>
                          )}
                        </View>
                        <View>
                          <Text className="text-lg text-gray-200 font-medium">
                            {item.name}
                          </Text>
                          <Text className="text-base text-gray-400">
                            {Array.isArray(item.category)
                              ? item.category.join(", ")
                              : item.category || ""}{" "}
                            • ${item.price.toFixed(2)}
                          </Text>
                        </View>
                      </View>
                      <View
                        className={`px-2.5 py-1.5 rounded-full ${
                          item.availability !== false
                            ? "bg-green-900/30 border border-green-500"
                            : "bg-red-900/30 border border-red-500"
                        }`}
                      >
                        <Text
                          className={`text-base ${
                            item.availability !== false
                              ? "text-green-400"
                              : "text-red-400"
                          }`}
                        >
                          {item.availability !== false
                            ? "Available"
                            : "Unavailable"}
                        </Text>
                      </View>
                    </View>
                  ))}
                  {modifierGroup.items.length > 3 && (
                    <View className="bg-panel p-3 rounded border border-gray-700 items-center">
                      <Text className="text-lg text-gray-400">
                        +{modifierGroup.items.length - 3} more items use this
                        modifier
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            </View>
          )}
      />
    </View>
  );

  const renderSchedulesContent = () => (
    <View className="flex-1 p-4 bg-panel">
      <View className="flex-row items-center justify-between mb-4">
        <Text className="text-2xl font-bold text-white">Schedules</Text>
        <View className="flex-row bg-surface border border-gray-600 rounded-lg p-1">
          <TouchableOpacity
            onPress={() => setScheduleViewType("menus")}
            className={`px-4 py-2 rounded-md ${
              scheduleViewType === "menus" ? "bg-blue-600" : ""
            }`}
          >
            <Text
              className={`text-lg font-medium ${
                scheduleViewType === "menus" ? "text-white" : "text-gray-300"
              }`}
            >
              Menus
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setScheduleViewType("categories")}
            className={`px-4 py-2 rounded-md ${
              scheduleViewType === "categories" ? "bg-blue-600" : ""
            }`}
          >
            <Text
              className={`text-lg font-medium ${
                scheduleViewType === "categories"
                  ? "text-white"
                  : "text-gray-300"
              }`}
            >
              Categories
            </Text>
          </TouchableOpacity>
        </View>
      </View>
      <ScrollView className="flex-1">
        <View className="gap-3">
          {scheduleViewType === "menus"
            ? menus.map((menu) => (
                <View
                  key={menu.id}
                  className="bg-surface rounded-lg border border-gray-700 p-4"
                >
                  <View className="flex-row items-center justify-between mb-1.5">
                    <Text className="text-xl text-white font-semibold">
                      {menu.name}
                    </Text>
                    <View
                      className={`px-2.5 py-1.5 rounded-full ${
                        menu.isActive && menu.isAvailableNow
                          ? "bg-green-900/30 border border-green-500"
                          : "bg-red-900/30 border border-red-500"
                      }`}
                    >
                      <Text
                        className={`text-lg ${
                          menu.isActive && menu.isAvailableNow
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {menu.isActive
                          ? menu.isAvailableNow
                            ? "Available Now"
                            : "Unavailable Now"
                          : "Inactive"}
                      </Text>
                    </View>
                  </View>
                  {(menu.schedules ?? []).length === 0 ? (
                    <View>
                      <Text className="text-lg text-gray-400">
                        Always available (no schedule rules)
                      </Text>
                    </View>
                  ) : (
                    <View className="gap-1.5">
                      {menu.schedules!.map((r) => (
                        <View
                          key={r.id}
                          className="flex-row justify-between bg-panel p-3 rounded border border-gray-700"
                        >
                          <Text className="text-lg text-gray-200">
                            {r.name || r.id}
                          </Text>
                          <Text className="text-lg text-gray-400">
                            {(r.days || []).join(", ")} •{" "}
                            {formatTimeDisplay(r.startTime)} -{" "}
                            {formatTimeDisplay(r.endTime)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View className="mt-2.5">
                    <TouchableOpacity
                      onPress={() =>
                        router.push(`/menu/edit-menu?id=${menu.id}`)
                      }
                      className="self-start px-3 py-2 rounded-lg bg-blue-600"
                    >
                      <Text className="text-lg text-white">Edit Schedules</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))
            : storeCategories.map((category) => (
                <View
                  key={category.id}
                  className="bg-surface rounded-lg border border-gray-700 p-4"
                >
                  <View className="flex-row items-center justify-between mb-1.5">
                    <Text className="text-xl text-white font-semibold">
                      {category.name}
                    </Text>
                    <View
                      className={`px-2.5 py-1.5 rounded-full ${
                        category.isActive &&
                        isCategoryAvailableNow(category.name)
                          ? "bg-green-900/30 border border-green-500"
                          : "bg-red-900/30 border border-red-500"
                      }`}
                    >
                      <Text
                        className={`text-lg ${
                          category.isActive &&
                          isCategoryAvailableNow(category.name)
                            ? "text-green-400"
                            : "text-red-400"
                        }`}
                      >
                        {category.isActive
                          ? isCategoryAvailableNow(category.name)
                            ? "Available Now"
                            : "Unavailable Now"
                          : "Inactive"}
                      </Text>
                    </View>
                  </View>
                  {(category.schedules ?? []).length === 0 ? (
                    <View>
                      <Text className="text-lg text-gray-400">
                        Always available (no schedule rules)
                      </Text>
                    </View>
                  ) : (
                    <View className="gap-1.5">
                      {category.schedules!.map((r) => (
                        <View
                          key={r.id}
                          className="flex-row justify-between bg-panel p-3 rounded border border-gray-700"
                        >
                          <Text className="text-lg text-gray-200">
                            {r.name || r.id}
                          </Text>
                          <Text className="text-lg text-gray-400">
                            {(r.days || []).join(", ")} •{" "}
                            {formatTimeDisplay(r.startTime)} -{" "}
                            {formatTimeDisplay(r.endTime)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <View className="mt-2.5">
                    <TouchableOpacity
                      onPress={() =>
                        router.push(`/menu/edit-category?id=${category.id}`)
                      }
                      className="self-start px-3 py-2 rounded-lg bg-blue-600"
                    >
                      <Text className="text-lg text-white">Edit Schedules</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
        </View>
      </ScrollView>
    </View>
  );

  const renderContent = () => {
    switch (activeTab) {
      case "menus":
        return renderMenusContent();
      case "categories":
        return renderCategoriesContent();
      case "items":
        return renderItemsContent();
      case "modifiers":
        return renderModifiersContent();
      case "schedules":
        return renderSchedulesContent();
      default:
        return null;
    }
  };

  return (
    <View className="flex-1 bg-panel">
      {renderContent()}
      <PriceEditBottomSheet
        ref={priceEditRef}
        onSave={(itemId, newPrice) => {
          // Refresh menu data after price update
          // The price will be reflected on next sync
          console.log(`Price updated for item ${itemId}: $${newPrice}`);
        }}
        onReset={(itemId) => {
          console.log(`Price reset for item ${itemId}`);
        }}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false);
          setItemToDelete(null);
        }}
        onConfirm={confirmDeleteItem}
        title="Delete Item"
        description={`Are you sure you want to delete '${itemToDelete?.name}'?`}
        confirmText="Delete"
        variant="destructive"
      />
    </View>
  );
};

// Menu Item Card Component
interface MenuItemCardProps {
  item: MenuItemType;
  onEdit: (item: MenuItemType) => void;
  onDelete: (item: MenuItemType) => void;
  onToggleAvailability: (id: string) => void;
  onPriceEdit?: (item: MenuItemType) => void;
  editDisabled?: boolean;
}

const MenuItemCard = React.memo(({
  item,
  onEdit,
  onDelete,
  onToggleAvailability,
  onPriceEdit,
  editDisabled = false,
}: MenuItemCardProps) => {
  return (
    <TouchableOpacity
      onPress={() => onPriceEdit?.(item)}
      activeOpacity={onPriceEdit ? 0.7 : 1}
      className="bg-surface max-h-48 rounded-lg border border-gray-700 p-3"
    >
      <View className="flex-row items-start gap-3">
        <View className="h-full aspect-square rounded-lg border border-gray-600">
          {getImageSource(item.image) ? (
            <Image
              source={
                typeof getImageSource(item.image) === "string"
                  ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP]
                  : getImageSource(item.image)
              }
              className="w-full h-full rounded-lg object-cover"
            />
          ) : (
            <View className="w-full h-full rounded-lg bg-gray-100 items-center justify-center">
              <Utensils color={colors.label} size={24} />
            </View>
          )}
        </View>
        <View className="flex-1">
          <View className="flex-row items-center gap-2 mb-1.5">
            <Text className="text-lg font-semibold text-white">
              {item.name}
            </Text>
          </View>

          {item.description && (
            <Text className="text-gray-300 text-xs mb-1.5 flex-1">
              {item.description.length > 40
                ? item.description.substring(0, 40) + "..."
                : item.description}
            </Text>
          )}

          <View className="flex-row gap-4">
            <Text className="text-xs text-gray-400">
              Price: ${item.price.toFixed(2)}
            </Text>
          </View>

          {item.customPricing && item.customPricing.length > 0 && (
            <View className="mt-1.5">
              <Text className="text-[10px] text-yellow-400 mb-1">
                Custom Pricing:{" "}
                {item.customPricing.filter((p) => p.isActive).length} active
                rules
              </Text>
              <View className="flex-row flex-wrap gap-1">
                {item.customPricing.slice(0, 2).map((pricing) => (
                  <View
                    key={pricing.id}
                    className="bg-yellow-900/30 border border-yellow-500 px-1.5 py-0.5 rounded"
                  >
                    <Text className="text-[10px] text-yellow-400">
                      {pricing.categoryName}: ${pricing.price.toFixed(2)}
                    </Text>
                  </View>
                ))}
                {item.customPricing.length > 2 && (
                  <View className="bg-gray-600/30 border border-gray-500 px-1.5 py-0.5 rounded">
                    <Text className="text-[10px] text-gray-400">
                      +{item.customPricing.length - 2} more
                    </Text>
                  </View>
                )}
              </View>
            </View>
          )}

          <View className="flex-row gap-2 mt-1.5">
            {item.meal.map((meal, index) => (
              <View
                key={index}
                className="bg-blue-900/30 border border-blue-500 px-1.5 py-0.5 rounded"
              >
                <Text className="text-[10px] text-blue-400">{meal}</Text>
              </View>
            ))}
          </View>
        </View>

        <View className="flex-col gap-y-1.5 ml-2">
          <TouchableOpacity
            onPress={editDisabled ? undefined : () => onEdit(item)}
            disabled={editDisabled}
            className={`p-1.5 rounded ${
              editDisabled
                ? "bg-gray-600/30 border border-gray-600 opacity-50"
                : "bg-blue-900/30 border border-blue-500"
            }`}
          >
            <Edit size={20} color={editDisabled ? colors.muted : colors.info} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={editDisabled ? undefined : () => onDelete(item)}
            disabled={editDisabled}
            className={`p-1.5 rounded ${
              editDisabled
                ? "bg-gray-600/30 border border-gray-600 opacity-50"
                : "bg-red-900/30 border border-red-500"
            }`}
          >
            <Trash2 size={20} color={editDisabled ? colors.muted : colors.danger} />
          </TouchableOpacity>
          <TouchableOpacity
            onPress={
              editDisabled ? undefined : () => onToggleAvailability(item.id)
            }
            disabled={editDisabled}
            className={`p-1.5 ${editDisabled ? "opacity-50" : ""}`}
          >
            {item.availability !== false ? (
              <Eye size={20} color={editDisabled ? colors.muted : "#10B981"} />
            ) : (
              <EyeOff size={20} color={editDisabled ? colors.muted : colors.danger} />
            )}
          </TouchableOpacity>
        </View>
      </View>
    </TouchableOpacity>
  );
}, (prev, next) => (
  prev.item.id === next.item.id &&
  prev.item.price === next.item.price &&
  prev.item.availability === next.item.availability &&
  prev.item.name === next.item.name &&
  prev.item.image === next.item.image &&
  prev.item.customPricing === next.item.customPricing &&
  prev.editDisabled === next.editDisabled &&
  prev.onEdit === next.onEdit &&
  prev.onDelete === next.onDelete &&
  prev.onToggleAvailability === next.onToggleAvailability &&
  prev.onPriceEdit === next.onPriceEdit
));

export default MenuPage;
