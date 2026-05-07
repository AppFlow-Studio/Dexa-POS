import DraggableMenuItem from '@/components/menu/DraggableMenuItem'
import MenuHeader from '@/components/menu/MenuHeader'
import PriceEditBottomSheet, {
  PriceEditBottomSheetRef
} from '@/components/menu/PriceEditBottomSheet'
import ConfirmationModal from '@/components/settings/reset-application/ConfirmationModal'
import { useToast } from '@/contexts/ToastContext'
import { useTriggerPosSync } from '@/hooks/pos/usePosSync'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { resolveMenuItemImageSource } from '@/lib/menuItemImageSource'
import {
  extractMenuItemPlaceholderIconKey,
  getMenuItemPlaceholderIcon,
  type MenuItemPlaceholderIconKey
} from '@/lib/menuItemPlaceholderIcon'
import { MENU_IMAGE_MAP } from '@/lib/mockData'
import { colors } from '@/lib/theme'
import { Menu, MenuItemType } from '@/lib/types'
import { MenuService } from '@/services/menuService'
import { useMenuStore } from '@/stores/useMenuStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useMenuVisibilityStore } from '@/stores/useMenuVisibilityStore'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import {
  ChevronDown,
  ChevronUp,
  Edit,
  Eye,
  EyeOff,
  GripVertical,
  MapPin,
  Pencil,
  Power,
  Trash2
} from 'lucide-react-native'
import React, { useCallback, useMemo, useRef, useState } from 'react'
import { FlatList, Image, Text, TouchableOpacity, View } from 'react-native'
import {
  Gesture,
  GestureDetector,
  ScrollView
} from 'react-native-gesture-handler'
import { useShallow } from 'zustand/react/shallow'
import Animated, {
  Extrapolate,
  Layout,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { useMenuLayout } from './_layout'
// Get image source for preview
const getImageSource = (image: string | undefined) => {
  if (image && image.length > 200) {
    return { uri: `data:image/jpeg;base64,${image}` }
  }

  if (image) {
    // Try to get image from assets
    return `${image}`
  }

  return undefined
}

const getPlaceholderIconForItem = (item: MenuItemType) => {
  const iconKey =
    (item.placeholderIcon as MenuItemPlaceholderIconKey | undefined) ??
    extractMenuItemPlaceholderIconKey(item.cardBgColor)
  return getMenuItemPlaceholderIcon(iconKey)
}
// Menu Management Types
// Using Menu interface from types.ts
// Note: The store Menu interface has categories as string[] (category names)
// while the local display needs Category objects with items

interface Category {
  id: string
  name: string
  isActive: boolean
  items: MenuItemType[]
  schedules: any[]
  order: number
  location_id?: string | null
}

interface ExtendedModifierGroup {
  id: string
  name: string
  type: 'required' | 'optional'
  selectionType: 'single' | 'multiple'
  maxSelections?: number
  description?: string
  options: any[]
  items: MenuItemType[]
  source: 'menuItem' | 'store'
}

// Draggable Menu Component
interface DraggableMenuProps {
  menu: any
  index: number
  onReorder: (fromIndex: number, toIndex: number) => void
  onReorderCategories: (
    menuId: string,
    fromIndex: number,
    toIndex: number
  ) => void
  onToggleMenuActive: (menuId: string) => void
  onToggleCategoryActive: (menuId: string, categoryId: string) => void
  onSchedule: () => void
  onEdit: () => void
  onItemPriceEdit: (
    item: MenuItemType,
    categoryId: string,
    menuId: string
  ) => void
  onReorderItems: (
    categoryId: string,
    fromIndex: number,
    toIndex: number
  ) => void
  isEditable: boolean
  menuCount: number
  dragPreview: { fromIndex: number; toIndex: number } | null
  onDragPreviewChange: (fromIndex: number, toIndex: number) => void
  onDragPreviewEnd: () => void
  onAutoScroll?: (absoluteY: number) => void
  onToggleHidden: (menuId: string) => void
  isHidden: boolean
}

// Helper to check if now is within a schedule
const checkAvailability = (schedules: any[] | undefined): boolean => {
  if (!schedules || schedules.length === 0) return true

  const now = new Date()

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
  const currentDay = dayNames[now.getDay()]
  const currentMinutes = now.getHours() * 60 + now.getMinutes()

  return schedules.some(rule => {
    if (!rule.isActive) return false
    // Respect the day if it exists and is not empty
    if (rule.days && rule.days.length > 0 && !rule.days.includes(currentDay)) {
      return false
    }

    let startMinutes = 0
    let endMinutes = 0

    // Helper to get minutes from time string (ISO or HH:MM)
    const getMinutes = (timeStr: string) => {
      if (!timeStr) return 0
      if (timeStr.includes('T')) {
        // ISO String: Parse as Date (converts to local time)
        const date = new Date(timeStr)
        if (isNaN(date.getTime())) return 0
        return date.getHours() * 60 + date.getMinutes()
      } else if (timeStr.includes(':')) {
        // HH:MM format
        const [h, m] = timeStr.split(':').map(Number)
        return (h || 0) * 60 + (m || 0)
      }
      return 0
    }

    startMinutes = getMinutes(rule.startTime)
    endMinutes = getMinutes(rule.endTime)

    // Handle overnight shift (e.g. 22:00 - 02:00)
    if (endMinutes < startMinutes) {
      // Available if we are after start (e.g. 23:00) OR before end (e.g. 01:00)
      return currentMinutes >= startMinutes || currentMinutes < endMinutes
    }

    return currentMinutes >= startMinutes && currentMinutes < endMinutes
  })
}

// Helper to format time string for display (e.g. converts ISO to 6:00 AM)
const formatTimeDisplay = (timeStr: string) => {
  if (!timeStr) return ''

  if (timeStr.includes('T')) {
    const date = new Date(timeStr)
    if (isNaN(date.getTime())) return timeStr
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  }

  return timeStr
}

const MENU_DRAG_ROW_HEIGHT = 96

const DraggableMenu = React.memo(
  ({
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
    menuCount,
    dragPreview,
    onDragPreviewChange,
    onDragPreviewEnd,
    onAutoScroll,
    onToggleHidden,
    isHidden
  }: DraggableMenuProps) => {
    const onToggleHiddenPress = () => {
      onToggleHidden(menu.id)
    }

    const translateY = useSharedValue(0)
    const scale = useSharedValue(1)
    const isDragging = useSharedValue(false)
    const dragOriginIndex = useSharedValue(index)
    const [isDragActive, setIsDragActive] = useState(false)
    const [isCollapsed, setIsCollapsed] = useState(true)
    const [categoryDragPreview, setCategoryDragPreview] = useState<{
      fromIndex: number
      toIndex: number
    } | null>(null)

    const hapticStart = () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }

    const hapticDrop = () => {
      void Haptics.selectionAsync()
    }

    const panGesture = Gesture.Pan()
      .activateAfterLongPress(80)
      .activeOffsetY([-4, 4])
      .onStart(() => {
        isDragging.value = true
        runOnJS(setIsDragActive)(true)
        scale.value = withSpring(1.05)
        dragOriginIndex.value = index
        runOnJS(onDragPreviewChange)(index, index)
        runOnJS(hapticStart)()
      })
      .onUpdate(event => {
        translateY.value = event.translationY

        const itemHeight = MENU_DRAG_ROW_HEIGHT
        const targetIndex = Math.round(
          dragOriginIndex.value + event.translationY / itemHeight
        )
        const newIndex = Math.max(0, Math.min(menuCount - 1, targetIndex))

        if (
          !dragPreview ||
          dragPreview.fromIndex !== dragOriginIndex.value ||
          dragPreview.toIndex !== newIndex
        ) {
          runOnJS(onDragPreviewChange)(dragOriginIndex.value, newIndex)
        }

        if (onAutoScroll && typeof event.absoluteY === 'number') {
          runOnJS(onAutoScroll)(event.absoluteY)
        }
      })
      .onEnd(event => {
        const itemHeight = MENU_DRAG_ROW_HEIGHT
        const targetIndex = Math.round(
          dragOriginIndex.value + event.translationY / itemHeight
        )
        const newIndex = Math.max(0, Math.min(menuCount - 1, targetIndex))

        if (newIndex !== dragOriginIndex.value && newIndex >= 0) {
          runOnJS(onReorder)(dragOriginIndex.value, newIndex)
          runOnJS(hapticDrop)()
        }

        translateY.value = withSpring(0)
        scale.value = withSpring(1)
        isDragging.value = false
        runOnJS(setIsDragActive)(false)
        runOnJS(onDragPreviewEnd)()
      })

    const animatedStyle = useAnimatedStyle(() => {
      const shadowOpacity = interpolate(
        scale.value,
        [1, 1.05],
        [0, 0.3],
        Extrapolate.CLAMP
      )
      const dragCompensation = isDragging.value
        ? (index - dragOriginIndex.value) * MENU_DRAG_ROW_HEIGHT
        : 0

      return {
        transform: [
          { translateY: translateY.value - dragCompensation },
          { scale: scale.value }
        ],
        shadowOpacity,
        opacity: isDragging.value ? 0.96 : 1,
        elevation: isDragging.value ? 8 : 0,
        zIndex: isDragging.value ? 1000 : 1
      }
    })

    const isAvailable = checkAvailability(menu.schedules)
    const statusActive = menu.isActive && isAvailable
    const menuCategories = Array.isArray(menu.categories) ? menu.categories : []
    const visibleCategories = useMemo(() => {
      if (
        !categoryDragPreview ||
        categoryDragPreview.fromIndex === categoryDragPreview.toIndex
      ) {
        return menuCategories
      }

      const reordered = [...menuCategories]
      const [moved] = reordered.splice(categoryDragPreview.fromIndex, 1)
      if (!moved) return menuCategories
      reordered.splice(categoryDragPreview.toIndex, 0, moved)
      return reordered
    }, [menuCategories, categoryDragPreview])

    return (
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: colors.card,
            borderRadius: 12,
            borderWidth: 1,
            borderColor: colors.border,
            padding: 12,
            marginBottom: 8,
            opacity: isHidden ? 0.5 : 1
          }
        ]}
        layout={
          isDragActive
            ? undefined
            : Layout.springify().damping(24).stiffness(260)
        }
      >
        {/* Menu row */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 8
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 8,
              flex: 1
            }}
          >
            <GestureDetector gesture={panGesture}>
              <View style={{ padding: 4 }}>
                <GripVertical size={14} color={colors.muted} />
              </View>
            </GestureDetector>
            <Text
              style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}
              numberOfLines={1}
            >
              {menu.name}
            </Text>
            <View
              style={{
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 20,
                backgroundColor: statusActive
                  ? colors.teal + '20'
                  : colors.danger + '15',
                borderWidth: 1,
                borderColor: statusActive
                  ? colors.teal + '50'
                  : colors.danger + '30'
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: statusActive ? colors.teal : colors.danger
                }}
              >
                {menu.isActive
                  ? isAvailable
                    ? 'Available'
                    : 'Unavailable'
                  : 'Inactive'}
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <TouchableOpacity
              onPress={onToggleHiddenPress}
              style={{
                padding: 6,
                backgroundColor: colors.panel,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: 1
              }}
            >
              <EyeOff size={14} color={colors.label} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onToggleMenuActive(menu.id)}
              disabled={!isEditable}
              style={{
                padding: 6,
                backgroundColor: colors.panel,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: isEditable ? 1 : 0.4
              }}
            >
              <Power
                size={14}
                color={isEditable ? colors.label : colors.muted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onEdit}
              disabled={!isEditable}
              style={{
                padding: 6,
                backgroundColor: colors.panel,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border,
                opacity: isEditable ? 1 : 0.4
              }}
              >
                <Pencil
                  size={14}
                  color={isEditable ? colors.label : colors.muted}
                />
              </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setIsCollapsed(prev => !prev)}
              style={{
                padding: 6,
                backgroundColor: colors.panel,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              {isCollapsed ? (
                <ChevronDown size={14} color={colors.label} />
              ) : (
                <ChevronUp size={14} color={colors.label} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Categories */}
        {!isCollapsed && (
          <View style={{ marginLeft: 22, gap: 4 }}>
          <Text
            style={{
              fontSize: 11,
              fontWeight: '600',
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: 4
            }}
          >
            Categories ({menuCategories.length})
          </Text>
          {visibleCategories.map((category: any, categoryIndex: number) => (
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
              itemCount={menuCategories.length}
              dragPreview={categoryDragPreview}
              onDragPreviewChange={(fromIndex, toIndex) =>
                setCategoryDragPreview({ fromIndex, toIndex })
              }
              onDragPreviewEnd={() => setCategoryDragPreview(null)}
              isEditable={
                !!(
                  category.location_id &&
                  isEditable &&
                  category.location_id === menu.location_id
                )
              }
            />
          ))}
          </View>
        )}
      </Animated.View>
    )
  }
)

interface DraggableMenuCategoryProps {
  category: any
  menuId: string
  index: number
  onReorder: (fromIndex: number, toIndex: number) => void
  onToggleActive: (menuId: string, categoryId: string) => void
  items: MenuItemType[]
  onItemPriceEdit: (
    item: MenuItemType,
    categoryId: string,
    menuId: string
  ) => void
  onReorderItems: (
    categoryId: string,
    fromIndex: number,
    toIndex: number
  ) => void
  isEditable: boolean
  itemCount: number
  dragPreview: { fromIndex: number; toIndex: number } | null
  onDragPreviewChange: (fromIndex: number, toIndex: number) => void
  onDragPreviewEnd: () => void
}

const DraggableMenuCategory = React.memo(
  ({
    category,
    menuId,
    index,
    onReorder,
    onToggleActive,
    items,
    onItemPriceEdit,
    isEditable,
    onReorderItems,
    itemCount,
    dragPreview,
    onDragPreviewChange,
    onDragPreviewEnd
  }: DraggableMenuCategoryProps) => {
    const translateY = useSharedValue(0)
    const scale = useSharedValue(1)
    const isDragging = useSharedValue(false)
    const dragOriginIndex = useSharedValue(index)
    const [isExpanded, setIsExpanded] = useState(false)

    const hapticStart = () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }

    const hapticDrop = () => {
      void Haptics.selectionAsync()
    }

    const panGesture = Gesture.Pan()
      .activateAfterLongPress(120)
      .activeOffsetY([-8, 8])
      .onStart(() => {
        isDragging.value = true
        scale.value = withTiming(1.03, { duration: 120 })
        dragOriginIndex.value = index
        runOnJS(onDragPreviewChange)(index, index)
        runOnJS(hapticStart)()
      })
      .onUpdate(event => {
        translateY.value = event.translationY

        const itemHeight = 60
        const targetIndex = Math.round(
          dragOriginIndex.value + event.translationY / itemHeight
        )
        const newIndex = Math.max(0, Math.min(itemCount - 1, targetIndex))

        if (
          !dragPreview ||
          dragPreview.fromIndex !== dragOriginIndex.value ||
          dragPreview.toIndex !== newIndex
        ) {
          runOnJS(onDragPreviewChange)(dragOriginIndex.value, newIndex)
        }
      })
      .onEnd(event => {
        const itemHeight = 60
        const targetIndex = Math.round(
          dragOriginIndex.value + event.translationY / itemHeight
        )
        const newIndex = Math.max(0, Math.min(itemCount - 1, targetIndex))

        runOnJS(onDragPreviewEnd)()
        if (newIndex !== dragOriginIndex.value && newIndex >= 0) {
          runOnJS(onReorder)(dragOriginIndex.value, newIndex)
          runOnJS(hapticDrop)()
        }

        translateY.value = withTiming(0)
        scale.value = withTiming(1, { duration: 140 })
        isDragging.value = false
      })

    const animatedStyle = useAnimatedStyle(() => {
      const shadowOpacity = interpolate(
        scale.value,
        [1, 1.05],
        [0, 0.2],
        Extrapolate.CLAMP
      )
      const dragCompensation = isDragging.value
        ? (index - dragOriginIndex.value) * 60
        : 0

      return {
        transform: [
          { translateY: translateY.value - dragCompensation },
          { scale: scale.value }
        ],
        shadowOpacity,
        elevation: isDragging.value ? 4 : 0,
        zIndex: isDragging.value ? 500 : 1,
        shadowRadius: isDragging.value ? 6 : 0
      }
    })

    return (
      <Animated.View
        style={[
          animatedStyle,
          {
            backgroundColor: colors.panel,
            borderRadius: 8,
            borderWidth: 1,
            borderColor: colors.border
          }
        ]}
        layout={
          isDragging.value
            ? undefined
            : Layout.springify().damping(30).stiffness(180).mass(0.9)
        }
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 10,
            paddingVertical: 8
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6,
              flex: 1
            }}
          >
            <GestureDetector gesture={panGesture}>
              <View style={{ padding: 2 }}>
                <GripVertical size={12} color={colors.muted} />
              </View>
            </GestureDetector>
            <TouchableOpacity
              onPress={() => setIsExpanded(!isExpanded)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
            >
              {isExpanded ? (
                <ChevronUp size={14} color={colors.label} />
              ) : (
                <ChevronDown size={14} color={colors.label} />
              )}
              <Text
                style={{
                  fontSize: 12,
                  color: colors.heading,
                  fontWeight: '500'
                }}
              >
                {category.name}
              </Text>
            </TouchableOpacity>
            <View
              style={{
                backgroundColor: colors.teal + '15',
                borderRadius: 10,
                paddingHorizontal: 6,
                paddingVertical: 2
              }}
            >
              <Text
                style={{ fontSize: 10, fontWeight: '600', color: colors.teal }}
              >
                {items.length}
              </Text>
            </View>
            <View
              style={{
                paddingHorizontal: 7,
                paddingVertical: 2,
                borderRadius: 20,
                backgroundColor: category.isActive
                  ? colors.teal + '20'
                  : colors.danger + '15',
                borderWidth: 1,
                borderColor: category.isActive
                  ? colors.teal + '50'
                  : colors.danger + '30'
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: category.isActive ? colors.teal : colors.danger
                }}
              >
                {category.isActive ? 'Active' : 'Inactive'}
              </Text>
            </View>
          </View>

          <TouchableOpacity
            onPress={() => onToggleActive(menuId, category.id)}
            disabled={!isEditable}
            style={{ padding: 4, opacity: isEditable ? 1 : 0.4 }}
          >
            {category.isActive ? (
              <Eye
                size={13}
                color={isEditable ? colors.success : colors.muted}
              />
            ) : (
              <EyeOff
                size={13}
                color={isEditable ? colors.danger : colors.muted}
              />
            )}
          </TouchableOpacity>
        </View>

        {isExpanded && (
          <View style={{ paddingHorizontal: 10, paddingBottom: 8 }}>
            {items.length === 0 ? (
              <Text style={{ fontSize: 12, color: colors.muted }}>
                No items in this category
              </Text>
            ) : (
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {items.map((item, itemIndex) => (
                  <DraggableMenuItem
                    key={item.id}
                    item={item}
                    index={itemIndex}
                    categoryId={category.id}
                    menuId={menuId}
                    onReorder={(from, to) =>
                      onReorderItems(category.id, from, to)
                    }
                    onItemPriceEdit={onItemPriceEdit}
                    isEditable={isEditable}
                    itemCount={items.length}
                  />
                ))}
              </View>
            )}
          </View>
        )}
      </Animated.View>
    )
  }
)

const MenuPage: React.FC = () => {
  const menuItems = useMenuStore(s => s.menuItems)
  const storeCategories = useMenuStore(s => s.categories)
  const storeMenus = useMenuStore(s => s.menus)
  const modifierGroups = useMenuStore(s => s.modifierGroups)
  const deleteMenuItem = useMenuStore(s => s.deleteMenuItem)
  const toggleItemAvailability = useMenuStore(s => s.toggleItemAvailability)
  const getItemsInCategory = useMenuStore(s => s.getItemsInCategory)
  const getMenuItems = useMenuStore(s => s.getMenuItems)
  const toggleMenuActive = useMenuStore(s => s.toggleMenuActive)
  const toggleCategoryActive = useMenuStore(s => s.toggleCategoryActive)
  const toggleMenuCategoryActive = useMenuStore(s => s.toggleMenuCategoryActive)
  const isMenuAvailableNow = useMenuStore(s => s.isMenuAvailableNow)
  const isCategoryAvailableNow = useMenuStore(s => s.isCategoryAvailableNow)
  const isCategoryActiveForMenu = useMenuStore(s => s.isCategoryActiveForMenu)
  const updateMenu = useMenuStore(s => s.updateMenu)
  const reorderMenus = useMenuStore(s => s.reorderMenus)
  const reorderCategoryItems = useMenuStore(s => s.reorderCategoryItems)
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const supabase = useSupabaseClient()
  const { activeTab, searchQuery } = useMenuLayout()
  const triggerPosSync = useTriggerPosSync()

  const [isRefreshing, setIsRefreshing] = useState(false)
  const menuListScrollRef = useRef<any>(null)
  const menuListScrollYRef = useRef(0)
  const menuListLayoutRef = useRef({ y: 0, height: 0 })
  const [menuDragPreview, setMenuDragPreview] = useState<{
    fromIndex: number
    toIndex: number
  } | null>(null)
  const [menuDragSnapshot, setMenuDragSnapshot] = useState<any[] | null>(null)
  const hiddenMenuMap = useMenuVisibilityStore(
    useShallow(s => s.hiddenMenuIdsByLocation)
  )
  const toggleHiddenMenu = useMenuVisibilityStore(s => s.toggleHiddenMenu)
  const hiddenMenuIds = useMemo(
    () => (selectedStore?.id ? hiddenMenuMap[selectedStore.id] ?? [] : []),
    [hiddenMenuMap, selectedStore?.id]
  )

  const handleRefreshMenu = async () => {
    if (!selectedStore?.id || isRefreshing) return
    setIsRefreshing(true)
    try {
      await triggerPosSync(selectedStore.id, selectedStore.merchant_id)
    } finally {
      setIsRefreshing(false)
    }
  }

  const [selectedMenu, setSelectedMenu] = useState<Menu | null>(null)
  const [selectedCategory, setSelectedCategory] = useState<Category | null>(
    null
  )
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [expandedCategories, setExpandedCategories] = useState<
    Record<string, boolean>
  >({})
  const [scheduleViewType, setScheduleViewType] = useState<
    'menus' | 'categories'
  >('menus')

  // Price edit bottom sheet ref
  const priceEditRef = useRef<PriceEditBottomSheetRef>(null)

  // Toast for error messages
  const { show: showToast } = useToast()

  // Delete confirmation modal state
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [itemToDelete, setItemToDelete] = useState<{
    id: string
    name: string
  } | null>(null)

  // Convert store menus to display format
  // Since storeMenus now contains the full tree (Menu -> Category -> Item),
  // we just need to add computed availability for the top-level menu.
  // Availability is calculated inline in DraggableMenu via checkAvailability(),
  // so no need for a periodic forceUpdate here.
  const menus = useMemo(
    () =>
      (Array.isArray(storeMenus) ? storeMenus : [])
        .map(storeMenu => ({
          ...storeMenu,
          isAvailableNow: isMenuAvailableNow(storeMenu.id)
        }))
        .sort((a, b) => {
          // Sort by displayOrder if available, otherwise by name
          const aOrder = a.displayOrder ?? Number.MAX_SAFE_INTEGER
          const bOrder = b.displayOrder ?? Number.MAX_SAFE_INTEGER
          if (aOrder !== bOrder) return aOrder - bOrder
          return a.name.localeCompare(b.name)
        }),
    [storeMenus, isMenuAvailableNow]
  )

  const visibleMenus = useMemo(() => {
    if (!menuDragPreview) return menus
    const sourceMenus = menuDragSnapshot ?? menus
    const nextMenus = [...sourceMenus]
    const [movedMenu] = nextMenus.splice(menuDragPreview.fromIndex, 1)
    if (!movedMenu) return sourceMenus
    nextMenus.splice(menuDragPreview.toIndex, 0, movedMenu)
    return nextMenus
  }, [menus, menuDragPreview, menuDragSnapshot])

  const hiddenMenus = useMemo(
    () => menus.filter(menu => hiddenMenuIds.includes(menu.id)),
    [menus, hiddenMenuIds]
  )

  const refreshMenuListMetrics = useCallback(() => {
    requestAnimationFrame(() => {
      menuListScrollRef.current?.measureInWindow(
        (x: number, y: number, width: number, height: number) => {
          menuListLayoutRef.current = { y, height }
        }
      )
    })
  }, [])

  const handleMenuAutoScroll = useCallback((absoluteY: number) => {
    const { y, height } = menuListLayoutRef.current
    const topThreshold = y + 96
    const bottomThreshold = y + height - 96
    const currentY = menuListScrollYRef.current
    const scrollStep = 18

    if (absoluteY < topThreshold) {
      menuListScrollRef.current?.scrollTo({
        y: Math.max(0, currentY - scrollStep),
        animated: false
      })
      return
    }

    if (absoluteY > bottomThreshold) {
      menuListScrollRef.current?.scrollTo({
        y: currentY + scrollStep,
        animated: false
      })
    }
  }, [])

  // Pre-compute modifier → items mapping with O(N) instead of O(N*M)
  const modifierToItemsMap = useMemo(() => {
    const map = new Map<string, MenuItemType[]>()
    ;(Array.isArray(menuItems) ? menuItems : []).forEach(item => {
      item.modifierGroupIds?.forEach(groupId => {
        if (!map.has(groupId)) map.set(groupId, [])
        map.get(groupId)!.push(item)
      })
    })
    return map
  }, [menuItems])

  const uniqueModifierGroups = useMemo(() => {
    return (Array.isArray(modifierGroups) ? modifierGroups : [])
      .map(group => ({
        ...group,
        items: modifierToItemsMap.get(group.id) || []
      }))
      .sort((a, b) => a.name.localeCompare(b.name))
  }, [modifierGroups, modifierToItemsMap])

  // Filter menu items based on search — memoized to avoid O(N) on every render
  const filteredItems = useMemo(() => {
    const items = !searchQuery
      ? menuItems
      : (() => {
          const query = searchQuery.toLowerCase()
          return (Array.isArray(menuItems) ? menuItems : []).filter(
            item =>
              item.name.toLowerCase().includes(query) ||
              item.description?.toLowerCase().includes(query)
          )
        })()
    return [...items].sort((a, b) => a.name.localeCompare(b.name))
  }, [menuItems, searchQuery])

  const handleAddMenu = useCallback(() => {
    router.push('/menu/add-menu')
  }, [])

  const handleAddCategory = useCallback(() => {
    router.push('/menu/add-category')
  }, [])

  const handleAddItem = useCallback(() => {
    router.push('/menu/add-item')
  }, [])

  const handleEditItem = useCallback((item: MenuItemType) => {
    router.push(`/menu/edit-item?itemId=${item.id}`)
  }, [])

  const handleDeleteItem = useCallback((item: MenuItemType) => {
    setItemToDelete({ id: item.id, name: item.name })
    setShowDeleteModal(true)
  }, [])

  const confirmDeleteItem = useCallback(async () => {
    if (!itemToDelete) return

    // Delete from backend first
    const { success, error } = await MenuService.deleteMenuItem(
      supabase,
      itemToDelete.id
    )
    if (!success) {
      showToast({
        title: 'Error',
        message: error?.message || 'Failed to delete item',
        type: 'error'
      })
      setShowDeleteModal(false)
      setItemToDelete(null)
      return
    }
    // Then update local store
    deleteMenuItem(itemToDelete.id)
    setShowDeleteModal(false)
    setItemToDelete(null)
  }, [itemToDelete, supabase, deleteMenuItem, showToast])

  const handleCategoryActive = useCallback(
    async (id: string) => {
      // Get current state for rollback
      const category = storeCategories.find(c => c.id === id)
      if (!category) return

      const newIsActive = !category.isActive

      // Optimistic update
      toggleCategoryActive(id)

      // Sync to backend
      const { error } = await MenuService.updateCategory(supabase, id, {
        isActive: newIsActive
      })

      if (error) {
        // Rollback on failure
        toggleCategoryActive(id)
        showToast({
          title: 'Error',
          type: 'error',
          message: 'Failed to update category status'
        })
      }
    },
    [storeCategories, toggleCategoryActive, supabase, showToast]
  )

  const handleToggleAvailability = useCallback(
    async (id: string) => {
      // Get current state for rollback
      const item = menuItems.find(i => i.id === id)
      if (!item) return

      const newAvailability = item.availability === false ? true : false

      // Optimistic update
      toggleItemAvailability(id)

      // Sync to backend
      const { error } = await MenuService.updateMenuItem(supabase, id, {
        availability: newAvailability
      })

      if (error) {
        // Rollback on failure
        toggleItemAvailability(id)
        showToast({
          title: 'Error',
          type: 'error',
          message: 'Failed to update item availability'
        })
      }
    },
    [menuItems, toggleItemAvailability, supabase, showToast]
  )

  const handleToggleMenuActive = useCallback(
    async (menuId: string) => {
      // Get current state for rollback
      const menu = menus.find(m => m.id === menuId)
      if (!menu) return

      const newIsActive = !menu.isActive

      // Optimistic update
      toggleMenuActive(menuId)

      // Sync to backend
      const { error } = await MenuService.updateMenu(supabase, menuId, {
        isActive: newIsActive
      })

      if (error) {
        // Rollback on failure
        toggleMenuActive(menuId)
        showToast({
          title: 'Error',
          type: 'error',
          message: 'Failed to update menu status'
        })
      }
    },
    [menus, toggleMenuActive, supabase, showToast]
  )

  const handleToggleCategoryActiveForMenu = useCallback(
    (menuId: string, categoryId: string) => {
      toggleMenuCategoryActive(menuId, categoryId)
    },
    [toggleMenuCategoryActive]
  )

  const handleReorderMenus = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!selectedStore?.id) {
        showToast({
          title: 'Error',
          message: 'Select a store before reordering menus',
          type: 'error'
        })
        return
      }

      reorderMenus(fromIndex, toIndex)

      // Persist the effective order the sync RPC reads for this location.
      const updatedMenus = useMenuStore.getState().menus
      const menuOrders = updatedMenus.map((menu, idx) => ({
        menuId: menu.id,
        displayOrder: idx
      }))

      try {
        const { error } = await MenuService.reorderLocationMenus(
          supabase,
          selectedStore.id,
          menuOrders
        )
        if (error) {
          showToast({
            title: 'Error',
            message: 'Failed to save menu order',
            type: 'error'
          })
          triggerPosSync(selectedStore.id, selectedStore.merchant_id)
        }
      } catch {
        triggerPosSync(selectedStore.id, selectedStore.merchant_id)
      }
    },
    [reorderMenus, supabase, showToast, triggerPosSync, selectedStore]
  )

  const handleReorderMenuCategories = useCallback(
    async (menuId: string, fromIndex: number, toIndex: number) => {
      const menu = storeMenus.find(m => m.id === menuId)
      if (!menu || !menu.categories) return

      const newCategories = [...menu.categories]
      const [movedCategory] = newCategories.splice(fromIndex, 1)
      newCategories.splice(toIndex, 0, movedCategory)

      // Optimistic update
      updateMenu(menuId, { categories: newCategories })

      // Persist
      const categoryOrders = newCategories.map((c, idx) => ({
        category_id: c.id,
        display_order: idx
      }))
      const { error } = await MenuService.reorderMenuCategories(
        supabase,
        menuId,
        selectedStore!.id,
        categoryOrders
      )

      if (error) {
        showToast({
          title: 'Error',
          message: 'Failed to save category order',
          type: 'error'
        })
        // Revert would be nice but complex to implement here without full refresh
        triggerPosSync(selectedStore?.id || '', selectedStore?.merchant_id)
      }
    },
    [storeMenus, updateMenu, supabase, showToast, triggerPosSync, selectedStore]
  )

  const handleReorderCategoryItems = useCallback(
    async (categoryId: string, fromIndex: number, toIndex: number) => {
      // Call store action for immediate UI update
      reorderCategoryItems(categoryId, fromIndex, toIndex)

      // Read reordered items from the UPDATED store tree (not getItemsInCategory which ignores order)
      const updatedMenus = useMenuStore.getState().menus
      let reorderedItems: MenuItemType[] | undefined
      for (const menu of updatedMenus) {
        const cat = menu.categories.find((c: any) => c.id === categoryId)
        if (cat?.items) {
          reorderedItems = cat.items
          break
        }
      }
      if (!reorderedItems?.length) return

      const itemOrders = reorderedItems.map((item, idx) => ({
        menuItemId: item.id,
        displayOrder: idx
      }))
      const { error } = await MenuService.reorderCategoryItems(
        supabase,
        categoryId,
        selectedStore!.id,
        itemOrders
      )

      if (error) {
        showToast({
          title: 'Error',
          message: 'Failed to save item order',
          type: 'error'
        })
        if (selectedStore?.id) {
          triggerPosSync(selectedStore.id, selectedStore.merchant_id)
        }
      }
    },
    [reorderCategoryItems, supabase, showToast, triggerPosSync, selectedStore]
  )

  const isEntityEditable = useCallback(
    (entityLocationId: string | null | undefined, entityName?: string) => {
      if (!selectedStore?.id) {
        return false
      }

      // If entity has a location_id, it must match current store
      if (entityLocationId) return entityLocationId === selectedStore.id
      // If entity has NO location_id, it is global -> NOT editable
      return false
    },
    [selectedStore?.id]
  )

  const renderMenusContent = () => (
    <View style={{ flex: 1, padding: 14, backgroundColor: colors.panel }}>
      <MenuHeader
        title={`Menus (${menus.length})`}
        onAddPress={handleAddMenu}
        addButtonLabel='Add Menu'
        onRefresh={handleRefreshMenu}
        isRefreshing={isRefreshing}
      />

      <ScrollView
        ref={menuListScrollRef}
        className='flex-1'
        nestedScrollEnabled={true}
        onLayout={refreshMenuListMetrics}
        onContentSizeChange={refreshMenuListMetrics}
        onScroll={event => {
          menuListScrollYRef.current = event.nativeEvent.contentOffset.y
        }}
        scrollEventThrottle={16}
      >
        <View className='gap-3'>
          {visibleMenus
            .filter(menu => !hiddenMenuIds.includes(menu.id))
            .map((menu, index) => (
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
                const originalMenu = storeMenus.find(m => m.id === menu.id)
                if (originalMenu) {
                  setSelectedMenu(originalMenu)
                  setScheduleViewType('menus')
                  setShowScheduleModal(true)
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
                    currentAvailability: item.availability
                  },
                  { categoryId, menuId }
                )
              }}
              onReorderItems={handleReorderCategoryItems}
              isEditable={isEntityEditable(menu.location_id, menu.name)}
              menuCount={menus.length}
              dragPreview={menuDragPreview}
              onDragPreviewChange={(fromIndex, toIndex) => {
                setMenuDragSnapshot(prev => prev ?? menus)
                setMenuDragPreview({ fromIndex, toIndex })
              }}
              onDragPreviewEnd={() => {
                setMenuDragPreview(null)
                setMenuDragSnapshot(null)
              }}
              onAutoScroll={handleMenuAutoScroll}
              onToggleHidden={menuId => {
                if (selectedStore?.id) {
                  toggleHiddenMenu(selectedStore.id, menuId)
                }
              }}
              isHidden={hiddenMenuIds.includes(menu.id)}
            />
          ))}
          {hiddenMenus.length > 0 && (
            <View style={{ gap: 8, marginTop: 8 }}>
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: colors.muted,
                  textTransform: 'uppercase'
                }}
              >
                Hidden Menus
              </Text>
              {hiddenMenus.map((menu, index) => (
                <DraggableMenu
                  key={menu.id}
                  menu={menu}
                  index={index}
                  onReorder={handleReorderMenus}
                  onReorderCategories={handleReorderMenuCategories}
                  onToggleMenuActive={handleToggleMenuActive}
                  onToggleCategoryActive={handleToggleCategoryActiveForMenu}
                  onSchedule={() => {
                    const originalMenu = storeMenus.find(m => m.id === menu.id)
                    if (originalMenu) {
                      setSelectedMenu(originalMenu)
                      setScheduleViewType('menus')
                      setShowScheduleModal(true)
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
                        currentAvailability: item.availability
                      },
                      { categoryId, menuId }
                    )
                  }}
                  onReorderItems={handleReorderCategoryItems}
                  isEditable={isEntityEditable(menu.location_id, menu.name)}
                  menuCount={menus.length}
                  dragPreview={menuDragPreview}
                  onDragPreviewChange={(fromIndex, toIndex) => {
                    setMenuDragSnapshot(prev => prev ?? menus)
                    setMenuDragPreview({ fromIndex, toIndex })
                  }}
                  onDragPreviewEnd={() => {
                    setMenuDragPreview(null)
                    setMenuDragSnapshot(null)
                  }}
                  onAutoScroll={handleMenuAutoScroll}
                  onToggleHidden={menuId => {
                    if (selectedStore?.id) {
                      toggleHiddenMenu(selectedStore.id, menuId)
                    }
                  }}
                  isHidden={true}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )

  const renderCategoriesContent = () => (
    <View style={{ flex: 1, padding: 14, backgroundColor: colors.panel }}>
      <MenuHeader
        title={`Categories (${(Array.isArray(storeCategories) ? storeCategories : []).length})`}
        onAddPress={handleAddCategory}
        addButtonLabel='Add Category'
        onRefresh={handleRefreshMenu}
        isRefreshing={isRefreshing}
      />

      <FlatList
        key='categories-list'
        data={[...(Array.isArray(storeCategories) ? storeCategories : [])].sort(
          (a, b) => a.name.localeCompare(b.name)
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={{ gap: 8 }}
        removeClippedSubviews={true}
        maxToRenderPerBatch={8}
        windowSize={5}
        initialNumToRender={8}
        renderItem={({ item: categoryName }) => {
          const categoryItems = Array.isArray(
            getItemsInCategory(categoryName.name)
          )
            ? getItemsInCategory(categoryName.name)
            : []
          const isExpanded = !!expandedCategories[categoryName.name]
          const editable = isEntityEditable(
            categoryName.location_id,
            categoryName.name
          )
          return (
            <View
              style={{
                backgroundColor: colors.panel,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.teal + '35',
                padding: 12
              }}
            >
              <View
                style={{
                  flexDirection: 'row',
                  justifyContent: 'space-between',
                  alignItems: 'center'
                }}
              >
                <TouchableOpacity
                  onPress={() =>
                    setExpandedCategories(prev => ({
                      ...prev,
                      [categoryName.name]: !isExpanded
                    }))
                  }
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 8,
                    flex: 1
                  }}
                >
                  {isExpanded ? (
                    <ChevronUp size={14} color={colors.label} />
                  ) : (
                    <ChevronDown size={14} color={colors.label} />
                  )}
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: colors.heading
                    }}
                  >
                    {categoryName.name}
                  </Text>
                  <View
                    style={{
                      backgroundColor: colors.teal + '15',
                      borderRadius: 10,
                      paddingHorizontal: 7,
                      paddingVertical: 2
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '600',
                        color: colors.teal
                      }}
                    >
                      {categoryItems.length}
                    </Text>
                  </View>
                  <View
                    style={{
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 20,
                      backgroundColor: categoryName.isActive
                        ? colors.teal + '20'
                        : colors.danger + '15',
                      borderWidth: 1,
                      borderColor: categoryName.isActive
                        ? colors.teal + '50'
                        : colors.danger + '30'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '600',
                        color: categoryName.isActive
                          ? colors.teal
                          : colors.danger
                      }}
                    >
                      {categoryName.isActive ? 'Active' : 'Inactive'}
                    </Text>
                  </View>
                </TouchableOpacity>

                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <TouchableOpacity
                    onPress={() => handleCategoryActive(categoryName?.id)}
                    disabled={!editable}
                    style={{
                      padding: 6,
                      backgroundColor: colors.teal + '18',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.teal + '35',
                      opacity: editable ? 1 : 0.4
                    }}
                  >
                    {categoryName.isActive ? (
                      <Eye
                        size={14}
                        color={editable ? colors.success : colors.muted}
                      />
                    ) : (
                      <EyeOff
                        size={14}
                        color={editable ? colors.danger : colors.muted}
                      />
                    )}
                  </TouchableOpacity>
                  <TouchableOpacity
                    onPress={() => {
                      const cat = storeCategories.find(
                        c => c.name === categoryName.name
                      )
                      if (cat) router.push(`/menu/edit-category?id=${cat.id}`)
                    }}
                    disabled={!editable}
                    style={{
                      padding: 6,
                      backgroundColor: colors.teal + '18',
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.teal + '35',
                      opacity: editable ? 1 : 0.4
                    }}
                  >
                    <Pencil
                      size={14}
                      color={editable ? colors.label : colors.muted}
                    />
                  </TouchableOpacity>
                </View>
              </View>

              {isExpanded && (
                <View style={{ marginTop: 10, gap: 4 }}>
                  {categoryItems.length === 0 ? (
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      No items in this category.
                    </Text>
                  ) : (
                    <View
                      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
                    >
                      {categoryItems.map(item => {
                        const PlaceholderIcon = getPlaceholderIconForItem(item)
                        return (
                          <View
                            key={item.id}
                            style={{
                              width: 152,
                              minHeight: 186,
                              borderRadius: 10,
                              backgroundColor: colors.panel,
                              borderWidth: 1,
                              borderColor: colors.teal + '35',
                              overflow: 'hidden',
                              position: 'relative'
                            }}
                          >
                            <View style={{ height: 104, width: '100%' }}>
                              {item.image ? (
                                <Image
                                  source={{
                                    uri:
                                      item.image.length > 200
                                        ? `data:image/jpeg;base64,${item.image}`
                                        : item.image
                                  }}
                                  style={{ width: '100%', height: '100%' }}
                                  resizeMode='cover'
                                />
                              ) : (
                                <View
                                  style={{
                                    flex: 1,
                                    backgroundColor: `${colors.teal}08`,
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  <PlaceholderIcon
                                    color={`${colors.label}60`}
                                    size={18}
                                    strokeWidth={2}
                                  />
                                </View>
                              )}
                            </View>
                            <View
                              style={{
                                paddingHorizontal: 8,
                                paddingTop: 7,
                                paddingBottom: 42,
                                gap: 3
                              }}
                            >
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: '600',
                                  color: colors.heading,
                                  lineHeight: 15,
                                  flexShrink: 1
                                }}
                                numberOfLines={2}
                              >
                                {item.name}
                              </Text>
                              <Text
                                style={{
                                  fontSize: 12,
                                  fontWeight: '700',
                                  color: colors.teal
                                }}
                              >
                                ${item.price.toFixed(2)}
                              </Text>
                            </View>
                            {/* Action overlay */}
                            <View
                              style={{
                                position: 'absolute',
                                bottom: 7,
                                right: 7,
                                flexDirection: 'row',
                                gap: 4,
                                zIndex: 20
                              }}
                            >
                              <TouchableOpacity
                                onPress={() =>
                                  handleToggleAvailability(item.id)
                                }
                                disabled={!editable}
                                style={{
                                  padding: 6,
                                  backgroundColor: colors.teal + '18',
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: colors.teal + '35',
                                  opacity: editable ? 1 : 0.4
                                }}
                              >
                                {item.availability !== false ? (
                                  <Eye size={16} color={colors.success} />
                                ) : (
                                  <EyeOff size={16} color={colors.danger} />
                                )}
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() => handleEditItem(item)}
                                disabled={!editable}
                                style={{
                                  padding: 6,
                                  backgroundColor: colors.teal + '18',
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: colors.teal + '35',
                                  opacity: editable ? 1 : 0.4
                                }}
                              >
                                <Pencil
                                  size={16}
                                  color={editable ? colors.teal : colors.muted}
                                />
                              </TouchableOpacity>
                            </View>
                          </View>
                        )
                      })}
                    </View>
                  )}
                </View>
              )}
            </View>
          )
        }}
      />
    </View>
  )

  const renderItemsContent = () => (
    <View style={{ flex: 1, padding: 14, backgroundColor: colors.panel }}>
      <MenuHeader
        title={`Menu Items (${filteredItems.length})`}
        onAddPress={handleAddItem}
        addButtonLabel='Add Item'
        onRefresh={handleRefreshMenu}
        isRefreshing={isRefreshing}
      />

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        {filteredItems.length === 0 ? (
          <View
            style={{
              alignItems: 'center',
              justifyContent: 'center',
              paddingTop: 40
            }}
          >
            <Text style={{ fontSize: 13, color: colors.muted }}>
              No menu items found.
            </Text>
          </View>
        ) : (
          <View style={{ gap: 16 }}>
            {Object.entries(
              filteredItems.reduce((groups, item) => {
                const letter = item.name[0].toUpperCase()
                if (!groups[letter]) groups[letter] = []
                groups[letter].push(item)
                return groups
              }, {} as Record<string, typeof filteredItems>)
            )
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([letter, items]) => (
                <View key={letter}>
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: '700',
                      color: colors.muted,
                      letterSpacing: 1,
                      textTransform: 'uppercase',
                      marginBottom: 8,
                      paddingHorizontal: 4
                    }}
                  >
                    {letter}
                  </Text>
                  <View
                    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}
                  >
                    {items.map(item => {
                      const editable = isEntityEditable(
                        item.location_id,
                        item.name
                      )
                      const isAvailable = item.availability !== false
                      const PlaceholderIcon = getPlaceholderIconForItem(item)
                      return (
                        <View
                          key={item.id}
                          style={{
                            position: 'relative',
                            width: 152,
                            minHeight: 186,
                            borderRadius: 10,
                            backgroundColor: colors.panel,
                            borderWidth: 1,
                            borderColor: colors.teal + '35',
                            overflow: 'hidden'
                          }}
                        >
                          {/* Image */}
                          <View style={{ height: 104, width: '100%' }}>
                            {item.image ? (
                              <Image
                                source={{
                                  uri:
                                    item.image.length > 200
                                      ? `data:image/jpeg;base64,${item.image}`
                                      : item.image
                                }}
                                style={{ width: '100%', height: '100%' }}
                                resizeMode='cover'
                              />
                            ) : (
                              <View
                                style={{
                                  flex: 1,
                                  backgroundColor: `${colors.teal}08`,
                                  alignItems: 'center',
                                  justifyContent: 'center'
                                }}
                              >
                                <PlaceholderIcon
                                  color={`${colors.label}60`}
                                  size={18}
                                  strokeWidth={2}
                                />
                              </View>
                            )}
                          </View>
                          {/* Content */}
                          <View
                            style={{
                              paddingHorizontal: 8,
                              paddingTop: 7,
                              paddingBottom: 42,
                              gap: 3
                            }}
                          >
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: '600',
                                color: colors.heading,
                                lineHeight: 15,
                                flexShrink: 1
                              }}
                              numberOfLines={2}
                            >
                              {item.name}
                            </Text>
                            <Text
                              style={{
                                fontSize: 12,
                                fontWeight: '700',
                                color: colors.teal
                              }}
                            >
                              ${item.price.toFixed(2)}
                            </Text>
                          </View>
                          {/* Action overlay */}
                          <View
                            style={{
                              position: 'absolute',
                              bottom: 7,
                              right: 7,
                              flexDirection: 'row',
                              gap: 4,
                              zIndex: 20
                            }}
                          >
                            <TouchableOpacity
                              onPress={() => handleToggleAvailability(item.id)}
                              disabled={!editable}
                              style={{
                                padding: 6,
                                backgroundColor: colors.teal + '18',
                                borderRadius: 6,
                                borderWidth: 1,
                                borderColor: colors.teal + '35',
                                opacity: editable ? 1 : 0.4
                              }}
                            >
                              {isAvailable ? (
                                <Eye size={16} color={colors.success} />
                              ) : (
                                <EyeOff size={16} color={colors.danger} />
                              )}
                            </TouchableOpacity>
                            <TouchableOpacity
                              onPress={() => handleEditItem(item)}
                              disabled={!editable}
                              style={{
                                padding: 6,
                                backgroundColor: colors.teal + '18',
                                borderRadius: 6,
                                borderWidth: 1,
                                borderColor: colors.teal + '35',
                                opacity: editable ? 1 : 0.4
                              }}
                            >
                              <Pencil
                                size={16}
                                color={editable ? colors.teal : colors.muted}
                              />
                            </TouchableOpacity>
                          </View>
                        </View>
                      )
                    })}
                  </View>
                </View>
              ))}
          </View>
        )}
      </ScrollView>
    </View>
  )

  const renderModifiersContent = () => (
    <View style={{ flex: 1, padding: 14, backgroundColor: colors.panel }}>
      <MenuHeader
        title={`Modifier Groups (${uniqueModifierGroups.length})`}
        onAddPress={() => router.push('/menu/add-modifier')}
        addButtonLabel='Add Modifier'
        onRefresh={handleRefreshMenu}
        isRefreshing={isRefreshing}
      />

      <FlatList
        key='modifiers-list'
        data={[...uniqueModifierGroups].sort((a, b) =>
          a.name.localeCompare(b.name)
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={{ gap: 8 }}
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        windowSize={5}
        initialNumToRender={5}
        renderItem={({ item: modifierGroup }) => {
          const editable = isEntityEditable(
            modifierGroup.location_id,
            modifierGroup.name
          )
          return (
            <View
              style={{
                backgroundColor: colors.card,
                borderRadius: 12,
                borderWidth: 1,
                borderColor: colors.border,
                padding: 12
              }}
            >
              {/* Header row */}
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  marginBottom: 10
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 6,
                    flex: 1,
                    flexWrap: 'wrap'
                  }}
                >
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '700',
                      color: colors.heading
                    }}
                  >
                    {modifierGroup.name}
                  </Text>

                  {modifierGroup.location_id ? (
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 4,
                        backgroundColor: colors.teal + '20',
                        borderWidth: 1,
                        borderColor: colors.teal + '50',
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 20
                      }}
                    >
                      <MapPin size={10} color={colors.teal} />
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '600',
                          color: colors.teal
                        }}
                      >
                        {modifierGroup.location_name || 'Local'}
                      </Text>
                    </View>
                  ) : (
                    <View
                      style={{
                        backgroundColor: colors.teal + '20',
                        borderWidth: 1,
                        borderColor: colors.teal + '50',
                        paddingHorizontal: 7,
                        paddingVertical: 2,
                        borderRadius: 20
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 10,
                          fontWeight: '600',
                          color: colors.teal
                        }}
                      >
                        Global
                      </Text>
                    </View>
                  )}

                  <View
                    style={{
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 20,
                      backgroundColor:
                        modifierGroup.type === 'required'
                          ? colors.danger + '15'
                          : colors.teal + '15',
                      borderWidth: 1,
                      borderColor:
                        modifierGroup.type === 'required'
                          ? colors.danger + '30'
                          : colors.teal + '30'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '600',
                        color:
                          modifierGroup.type === 'required'
                            ? colors.danger
                            : colors.teal
                      }}
                    >
                      {modifierGroup.type === 'required'
                        ? 'Required'
                        : 'Optional'}
                    </Text>
                  </View>

                  <View
                    style={{
                      backgroundColor: colors.card,
                      borderWidth: 1,
                      borderColor: colors.border,
                      paddingHorizontal: 7,
                      paddingVertical: 2,
                      borderRadius: 20
                    }}
                  >
                    <Text style={{ fontSize: 10, color: colors.label }}>
                      {modifierGroup.selectionType === 'single'
                        ? 'Single'
                        : 'Multi'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  onPress={
                    editable
                      ? () =>
                          router.push(`/menu/edit-modifier?id=${modifierGroup.id}`)
                      : undefined
                  }
                  disabled={!editable}
                  style={{
                    padding: 6,
                    backgroundColor: colors.panel,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.border,
                    opacity: editable ? 1 : 0.4
                  }}
                >
                  <Pencil
                    size={14}
                    color={editable ? colors.label : colors.muted}
                  />
                </TouchableOpacity>
              </View>

              {/* Options */}
              <View style={{ marginBottom: 10 }}>
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: '600',
                    color: colors.muted,
                    textTransform: 'uppercase',
                    letterSpacing: 0.5,
                    marginBottom: 6
                  }}
                >
                  Options ({Array.isArray(modifierGroup.options) ? modifierGroup.options.length : 0})
                </Text>
                <View
                  style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}
                >
                  {(Array.isArray(modifierGroup.options)
                    ? modifierGroup.options
                    : []
                  )
                    .slice(0, 5)
                    .map((option, index) => (
                    <View
                      key={index}
                      style={{
                        backgroundColor: colors.panel,
                        borderWidth: 1,
                        borderColor: colors.border,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6
                      }}
                    >
                      <Text style={{ fontSize: 11, color: colors.heading }}>
                        {option.name}
                        {option.price > 0 && (
                          <Text style={{ color: colors.teal }}>
                            {' '}
                            (+${option.price.toFixed(2)})
                          </Text>
                        )}
                      </Text>
                    </View>
                  ))}
                  {(Array.isArray(modifierGroup.options)
                    ? modifierGroup.options
                    : []
                  ).length > 5 && (
                    <View
                      style={{
                        backgroundColor: colors.panel,
                        borderWidth: 1,
                        borderColor: colors.border,
                        paddingHorizontal: 8,
                        paddingVertical: 4,
                        borderRadius: 6
                      }}
                    >
                      <Text style={{ fontSize: 11, color: colors.muted }}>
                        +{(Array.isArray(modifierGroup.options)
                          ? modifierGroup.options
                          : []
                        ).length - 5} more
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* Items using this modifier */}
              {modifierGroup.items.length > 0 && (
                <View>
                  <Text
                    style={{
                      fontSize: 11,
                      fontWeight: '600',
                      color: colors.muted,
                      textTransform: 'uppercase',
                      letterSpacing: 0.5,
                      marginBottom: 6
                    }}
                  >
                    Used by ({modifierGroup.items.length})
                  </Text>
                  <View
                    style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}
                  >
                    {modifierGroup.items.slice(0, 6).map(item =>
                      (() => {
                        const imageSource = resolveMenuItemImageSource(
                          item.image
                        )
                        const PlaceholderIcon = getPlaceholderIconForItem(item)
                        return (
                          <View
                            key={item.id}
                            style={{
                              flexDirection: 'row',
                              alignItems: 'center',
                              gap: 7,
                              backgroundColor: colors.panel,
                              paddingHorizontal: 10,
                              paddingVertical: 6,
                              borderRadius: 8,
                              borderWidth: 1,
                              borderColor: colors.border
                            }}
                          >
                            <View
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: 6,
                                overflow: 'hidden',
                                backgroundColor: colors.card
                              }}
                            >
                              {imageSource ? (
                                <Image
                                  source={imageSource}
                                  style={{ width: '100%', height: '100%' }}
                                  resizeMode='cover'
                                />
                              ) : (
                                <View
                                  style={{
                                    flex: 1,
                                    alignItems: 'center',
                                    justifyContent: 'center'
                                  }}
                                >
                                  <PlaceholderIcon
                                    color={colors.muted}
                                    size={12}
                                    strokeWidth={2}
                                  />
                                </View>
                              )}
                            </View>
                            <Text
                              style={{
                                fontSize: 12,
                                color: colors.heading,
                                fontWeight: '500'
                              }}
                              numberOfLines={1}
                            >
                              {item.name}
                            </Text>
                            <Text
                              style={{
                                fontSize: 12,
                                color: colors.teal,
                                fontWeight: '600'
                              }}
                            >
                              ${item.price.toFixed(2)}
                            </Text>
                          </View>
                        )
                      })()
                    )}
                    {modifierGroup.items.length > 6 && (
                      <View
                        style={{
                          backgroundColor: colors.panel,
                          borderWidth: 1,
                          borderColor: colors.border,
                          paddingHorizontal: 7,
                          paddingVertical: 4,
                          borderRadius: 8
                        }}
                      >
                        <Text style={{ fontSize: 11, color: colors.muted }}>
                          +{modifierGroup.items.length - 6} more
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}
            </View>
          )
        }}
      />
    </View>
  )

  const renderSchedulesContent = () => (
    <View style={{ flex: 1, padding: 16, backgroundColor: colors.panel }}>
      {/* Header */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.border
        }}
      >
        <Text
          style={{ fontSize: 15, fontWeight: '700', color: colors.heading }}
        >
          Schedules
        </Text>
        <View
          style={{
            flexDirection: 'row',
            backgroundColor: colors.card,
            borderWidth: 1,
            borderColor: colors.border,
            borderRadius: 8,
            padding: 2,
            gap: 2
          }}
        >
          <TouchableOpacity
            onPress={() => setScheduleViewType('menus')}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 6,
              backgroundColor:
                scheduleViewType === 'menus'
                  ? colors.teal + '20'
                  : 'transparent',
              borderWidth: scheduleViewType === 'menus' ? 1 : 0,
              borderColor: colors.teal + '50'
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color: scheduleViewType === 'menus' ? colors.teal : colors.label
              }}
            >
              Menus
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setScheduleViewType('categories')}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 5,
              borderRadius: 6,
              backgroundColor:
                scheduleViewType === 'categories'
                  ? colors.teal + '20'
                  : 'transparent',
              borderWidth: scheduleViewType === 'categories' ? 1 : 0,
              borderColor: colors.teal + '50'
            }}
          >
            <Text
              style={{
                fontSize: 12,
                fontWeight: '600',
                color:
                  scheduleViewType === 'categories' ? colors.teal : colors.label
              }}
            >
              Categories
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
        <View style={{ gap: 12 }}>
          {scheduleViewType === 'menus'
            ? (Array.isArray(menus) ? menus : []).map(menu => (
                <View
                  key={menu.id}
                  style={{
                    backgroundColor: colors.card + 'cc',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 14,
                    gap: 12
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: colors.heading
                      }}
                    >
                      {menu.name}
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor: menu.isAvailableNow
                          ? colors.teal + '20'
                          : colors.danger + '15',
                        borderWidth: 1,
                        borderColor: menu.isAvailableNow
                          ? colors.teal + '40'
                          : colors.danger + '30'
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '600',
                          color: menu.isAvailableNow
                            ? colors.teal
                            : colors.danger
                        }}
                      >
                        {menu.isAvailableNow ? 'Available' : 'Unavailable'}
                      </Text>
                    </View>
                  </View>
                  {((menu.schedules ?? []) as any[]).length === 0 ? (
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      Always available (no schedule rules)
                    </Text>
                  ) : (
                    <View style={{ gap: 6 }}>
                      {(Array.isArray(menu.schedules) ? menu.schedules : []).map(r => (
                        <View
                          key={r.id}
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            backgroundColor: colors.screen,
                            padding: 10,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: colors.border
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '500',
                              color: colors.heading
                            }}
                          >
                            {r.name || r.id}
                          </Text>
                          <Text style={{ fontSize: 12, color: colors.label }}>
                            {(r.days || []).join(', ')} ·{' '}
                            {formatTimeDisplay(r.startTime)} –{' '}
                            {formatTimeDisplay(r.endTime)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={
                      menu.location_id === selectedStore?.id
                        ? () => router.push(`/menu/edit-menu?id=${menu.id}`)
                        : undefined
                    }
                    disabled={menu.location_id !== selectedStore?.id}
                    style={{
                      alignSelf: 'flex-start',
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: colors.teal + '20',
                      borderWidth: 1,
                      borderColor: colors.teal + '50',
                      opacity: menu.location_id === selectedStore?.id ? 1 : 0.4
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: colors.teal
                      }}
                    >
                      Edit Schedules
                    </Text>
                  </TouchableOpacity>
                </View>
              ))
            : (Array.isArray(storeCategories) ? storeCategories : []).map(
                category => (
                <View
                  key={category.id}
                  style={{
                    backgroundColor: colors.card + 'cc',
                    borderRadius: 12,
                    borderWidth: 1,
                    borderColor: colors.border,
                    padding: 14,
                    gap: 12
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between'
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 13,
                        fontWeight: '600',
                        color: colors.heading
                      }}
                    >
                      {category.name}
                    </Text>
                    <View
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 4,
                        borderRadius: 6,
                        backgroundColor: isCategoryAvailableNow(category.name)
                          ? colors.teal + '20'
                          : colors.danger + '15',
                        borderWidth: 1,
                        borderColor: isCategoryAvailableNow(category.name)
                          ? colors.teal + '40'
                          : colors.danger + '30'
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: '600',
                          color: isCategoryAvailableNow(category.name)
                            ? colors.teal
                            : colors.danger
                        }}
                      >
                        {isCategoryAvailableNow(category.name)
                          ? 'Available'
                          : 'Unavailable'}
                      </Text>
                    </View>
                  </View>
                  {((category.schedules ?? []) as any[]).length === 0 ? (
                    <Text style={{ fontSize: 12, color: colors.muted }}>
                      Always available (no schedule rules)
                    </Text>
                  ) : (
                    <View style={{ gap: 6 }}>
                      {(Array.isArray(category.schedules)
                        ? category.schedules
                        : []
                      ).map(r => (
                        <View
                          key={r.id}
                          style={{
                            flexDirection: 'row',
                            justifyContent: 'space-between',
                            backgroundColor: colors.screen,
                            padding: 10,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: colors.border
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 12,
                              fontWeight: '500',
                              color: colors.heading
                            }}
                          >
                            {r.name || r.id}
                          </Text>
                          <Text style={{ fontSize: 12, color: colors.label }}>
                            {(r.days || []).join(', ')} ·{' '}
                            {formatTimeDisplay(r.startTime)} –{' '}
                            {formatTimeDisplay(r.endTime)}
                          </Text>
                        </View>
                      ))}
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={
                      category.location_id === selectedStore?.id
                        ? () =>
                            router.push(`/menu/edit-category?id=${category.id}`)
                        : undefined
                    }
                    disabled={category.location_id !== selectedStore?.id}
                    style={{
                      alignSelf: 'flex-start',
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: colors.teal + '20',
                      borderWidth: 1,
                      borderColor: colors.teal + '50',
                      opacity:
                        category.location_id === selectedStore?.id ? 1 : 0.4
                    }}
                  >
                    <Text
                      style={{
                        fontSize: 12,
                        fontWeight: '600',
                        color: colors.teal
                      }}
                    >
                      Edit Schedules
                    </Text>
                  </TouchableOpacity>
                </View>
              )
            )}
        </View>
      </ScrollView>
    </View>
  )

  const renderContent = () => {
    switch (activeTab) {
      case 'menus':
        return renderMenusContent()
      case 'categories':
        return renderCategoriesContent()
      case 'items':
        return renderItemsContent()
      case 'modifiers':
        return renderModifiersContent()
      case 'schedules':
        return renderSchedulesContent()
      default:
        return null
    }
  }

  return (
    <View className='flex-1 bg-screen'>
      {renderContent()}
      <PriceEditBottomSheet
        ref={priceEditRef}
        onSave={(itemId, newPrice) => {
          // Refresh menu data after price update
          // The price will be reflected on next sync
          console.log(`Price updated for item ${itemId}: $${newPrice}`)
        }}
        onReset={itemId => {
          console.log(`Price reset for item ${itemId}`)
        }}
        onDelete={(itemId, itemName) => {
          setItemToDelete({ id: itemId, name: itemName })
          setShowDeleteModal(true)
        }}
      />

      {/* Delete Confirmation Modal */}
      <ConfirmationModal
        isOpen={showDeleteModal}
        onClose={() => {
          setShowDeleteModal(false)
          setItemToDelete(null)
        }}
        onConfirm={confirmDeleteItem}
        title='Delete Item'
        description={`Are you sure you want to delete '${itemToDelete?.name}'?`}
        confirmText='Delete'
        variant='destructive'
      />
    </View>
  )
}

// Menu Item Card Component
interface MenuItemCardProps {
  item: MenuItemType
  onEdit: (item: MenuItemType) => void
  onDelete: (item: MenuItemType) => void
  onToggleAvailability: (id: string) => void
  onPriceEdit?: (item: MenuItemType) => void
  editDisabled?: boolean
}

const MenuItemCard = React.memo(
  ({
    item,
    onEdit,
    onDelete,
    onToggleAvailability,
    onPriceEdit,
    editDisabled = false
  }: MenuItemCardProps) => {
    const PlaceholderIcon = getPlaceholderIconForItem(item)
    return (
      <TouchableOpacity
        onPress={() => onPriceEdit?.(item)}
        activeOpacity={onPriceEdit ? 0.7 : 1}
        className='bg-surface max-h-48 rounded-lg border border-gray-700 p-3'
      >
        <View className='flex-row items-start gap-3'>
          <View className='h-full aspect-square rounded-lg border border-gray-600'>
            {getImageSource(item.image) ? (
              <Image
                source={
                  typeof getImageSource(item.image) === 'string'
                    ? MENU_IMAGE_MAP[item.image as keyof typeof MENU_IMAGE_MAP]
                    : getImageSource(item.image)
                }
                className='w-full h-full rounded-lg object-cover'
              />
            ) : (
              <View className='w-full h-full rounded-lg bg-gray-100 items-center justify-center'>
                <PlaceholderIcon
                  color={colors.label}
                  size={24}
                  strokeWidth={2}
                />
              </View>
            )}
          </View>
          <View className='flex-1'>
            <View className='flex-row items-center gap-2 mb-1.5'>
              <Text className='text-lg font-semibold text-white'>
                {item.name}
              </Text>
            </View>

            {item.description && (
              <Text className='text-gray-300 text-xs mb-1.5 flex-1'>
                {item.description.length > 40
                  ? item.description.substring(0, 40) + '...'
                  : item.description}
              </Text>
            )}

            <View className='flex-row gap-4'>
              <Text className='text-xs text-gray-400'>
                Price: ${item.price.toFixed(2)}
              </Text>
            </View>

            {item.customPricing && item.customPricing.length > 0 && (
              <View className='mt-1.5'>
                <Text className='text-[10px] text-yellow-400 mb-1'>
                  Custom Pricing:{' '}
                  {(Array.isArray(item.customPricing) ? item.customPricing : []).filter(
                    p => p.isActive
                  ).length} active
                  rules
                </Text>
                <View className='flex-row flex-wrap gap-1'>
                  {(Array.isArray(item.customPricing) ? item.customPricing : [])
                    .slice(0, 2)
                    .map(pricing => (
                    <View
                      key={pricing.id}
                      className='bg-yellow-900/30 border border-yellow-500 px-1.5 py-0.5 rounded'
                    >
                      <Text className='text-[10px] text-yellow-400'>
                        {pricing.categoryName}: ${pricing.price.toFixed(2)}
                      </Text>
                    </View>
                  ))}
                  {(Array.isArray(item.customPricing) ? item.customPricing : []).length > 2 && (
                    <View className='bg-gray-600/30 border border-gray-500 px-1.5 py-0.5 rounded'>
                      <Text className='text-[10px] text-gray-400'>
                        +{(Array.isArray(item.customPricing) ? item.customPricing : []).length - 2} more
                      </Text>
                    </View>
                  )}
                </View>
              </View>
            )}

            <View className='flex-row gap-2 mt-1.5'>
              {(Array.isArray(item.meal) ? item.meal : []).map((meal, index) => (
                <View
                  key={index}
                  className='bg-blue-900/30 border border-blue-500 px-1.5 py-0.5 rounded'
                >
                  <Text className='text-[10px] text-blue-400'>{meal}</Text>
                </View>
              ))}
            </View>
          </View>

          <View className='flex-col gap-y-1.5 ml-2'>
            <TouchableOpacity
              onPress={editDisabled ? undefined : () => onEdit(item)}
              disabled={editDisabled}
              className={`p-1.5 rounded ${
                editDisabled
                  ? 'bg-gray-600/30 border border-gray-600 opacity-50'
                  : 'bg-blue-900/30 border border-blue-500'
              }`}
            >
              <Edit
                size={20}
                color={editDisabled ? colors.muted : colors.info}
              />
            </TouchableOpacity>

            <TouchableOpacity
              onPress={editDisabled ? undefined : () => onDelete(item)}
              disabled={editDisabled}
              className={`p-1.5 rounded ${
                editDisabled
                  ? 'bg-gray-600/30 border border-gray-600 opacity-50'
                  : 'bg-red-900/30 border border-red-500'
              }`}
            >
              <Trash2
                size={20}
                color={editDisabled ? colors.muted : colors.danger}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={
                editDisabled ? undefined : () => onToggleAvailability(item.id)
              }
              disabled={editDisabled}
              className={`p-1.5 ${editDisabled ? 'opacity-50' : ''}`}
            >
              {item.availability !== false ? (
                <Eye
                  size={20}
                  color={editDisabled ? colors.muted : '#10B981'}
                />
              ) : (
                <EyeOff
                  size={20}
                  color={editDisabled ? colors.muted : colors.danger}
                />
              )}
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    )
  },
  (prev, next) =>
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
)

export default MenuPage
