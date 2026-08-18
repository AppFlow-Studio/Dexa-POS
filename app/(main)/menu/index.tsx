import DraggableMenuItem from '@/components/menu/DraggableMenuItem'
import MenuHeader from '@/components/menu/MenuHeader'
import {
  ITEM_CARD_HEIGHT,
  ITEM_CARD_WIDTH,
  MenuItemGridCard,
  getPlaceholderIconForItem
} from '@/components/menu/MenuItemGridCard'
import PriceEditBottomSheet, {
  PriceEditBottomSheetRef
} from '@/components/menu/PriceEditBottomSheet'
import SnoozeBottomSheet, {
  SnoozeBottomSheetRef
} from '@/components/menu/SnoozeBottomSheet'
import OutOfStockSheet, {
  OutOfStockSheetRef
} from '@/components/menu/OutOfStockSheet'
import ConfirmationModal from '@/components/settings/reset-application/ConfirmationModal'
import { useToast } from '@/contexts/ToastContext'
import { useIsSingleLocation } from '@/hooks/pos/useIsSingleLocation'
import { useOnlineMenu } from '@/hooks/pos/useOnlineMenu'
import { useTriggerPosSync } from '@/hooks/pos/usePosSync'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import {
  formatSnoozeCountdown,
  isActivelySnoozed,
  SNOOZE_INFINITY
} from '@/lib/snoozeDurations'
import { resolveMenuItemImageSource } from '@/lib/menuItemImageSource'
import {
  extractMenuItemPlaceholderIconKey,
  getMenuItemPlaceholderIcon,
  type MenuItemPlaceholderIconKey
} from '@/lib/menuItemPlaceholderIcon'
import { colors } from '@/lib/theme'
import { Menu, MenuItemType } from '@/lib/types'
import { useUiScale } from '@/lib/uiScale'
import { MenuService } from '@/services/menuService'
import { useMenuStore } from '@/stores/useMenuStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { useMenuVisibilityStore } from '@/stores/useMenuVisibilityStore'
import { router } from 'expo-router'
import * as Haptics from 'expo-haptics'
import {
  Ban,
  ChevronDown,
  ChevronUp,
  Edit,
  Eye,
  EyeOff,
  Globe,
  GripVertical,
  MapPin,
  Pencil,
  Power,
  Trash2
} from 'lucide-react-native'
import { Image as ExpoImage } from 'expo-image'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Text, TouchableOpacity, View } from 'react-native'
import { FlashList } from '@shopify/flash-list'
import MenuManagementImage from '@/components/menu/MenuManagementImage'
import DraggableFlatList, {
  RenderItemParams,
  ScaleDecorator
} from 'react-native-draggable-flatlist'
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

// Keep-alive tab panel styles (no theme colors → safe as module constants).
const TAB_PANEL_ACTIVE = { flex: 1 } as const
const TAB_PANEL_HIDDEN = { display: 'none' as const }

// Item-card geometry. Cards are a fixed size, so a letter-group's height is
// exactly computable — which lets FlashList size cells properly instead of
// guessing. A single flat `estimatedItemSize` was badly wrong here: a group is
// one letter, so "C" with 20 items and "X" with 1 differ by ~1000px, and the
// bad estimate is what produced blank gaps and a jumping scrollbar.
const ITEM_CARD_GAP = 6
const ITEM_GROUP_HEADER_HEIGHT = 26
const DEFAULT_ITEMS_PER_ROW = 4

// Hoisted so FlashList doesn't see a new component identity every render.
const CategoryRowSeparator = () => <View style={{ height: 8 }} />

/** One virtualized row of the Items tab: a letter header, or a row of cards. */
type ItemListRow =
  | { type: 'header'; key: string; letter: string }
  | { type: 'cards'; key: string; items: MenuItemType[] }

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
  displayOrder?: number
  type: 'required' | 'optional'
  selectionType: 'single' | 'multiple'
  maxSelections?: number
  description?: string
  options: any[]
  location_id?: string | null
  location_name?: string
  items: MenuItemType[]
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
  onItemSnooze: (item: MenuItemType) => void
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
  isOnlineMenu?: boolean
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
    onItemSnooze,
    isEditable,
    onReorderItems,
    menuCount,
    dragPreview,
    onDragPreviewChange,
    onDragPreviewEnd,
    onAutoScroll,
    onToggleHidden,
    isHidden,
    isOnlineMenu
  }: DraggableMenuProps) => {
    const uiScale = useUiScale()
    const s = (n: number) => Math.round(n * uiScale)
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
            borderRadius: s(12),
            borderWidth: 1,
            borderColor: colors.border,
            padding: s(12),
            marginBottom: s(8),
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
            marginBottom: s(8)
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(8),
              flex: 1
            }}
          >
            <GestureDetector gesture={panGesture}>
              <View style={{ padding: s(4) }}>
                <GripVertical size={s(14)} color={colors.muted} />
              </View>
            </GestureDetector>
            <Text
              style={{ fontSize: s(13), fontWeight: '700', color: colors.heading }}
              numberOfLines={1}
            >
              {menu.name}
            </Text>
            <View
              style={{
                paddingHorizontal: s(8),
                paddingVertical: s(3),
                borderRadius: s(20),
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
                  fontSize: s(10),
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
            {isOnlineMenu && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: s(3),
                  paddingHorizontal: s(8),
                  paddingVertical: s(3),
                  borderRadius: s(20),
                  backgroundColor: colors.info + '18',
                  borderWidth: 1,
                  borderColor: colors.info + '40'
                }}
              >
                <Globe size={s(10)} color={colors.info} />
                <Text
                  style={{ fontSize: s(10), fontWeight: '700', color: colors.info }}
                >
                  Online
                </Text>
              </View>
            )}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}>
            <TouchableOpacity
              onPress={onToggleHiddenPress}
              style={{
                padding: s(6),
                backgroundColor: colors.panel,
                borderRadius: s(8),
                borderWidth: 1,
                borderColor: colors.border,
                opacity: 1
              }}
            >
              <EyeOff size={s(14)} color={colors.label} />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => onToggleMenuActive(menu.id)}
              disabled={!isEditable}
              style={{
                padding: s(6),
                backgroundColor: colors.panel,
                borderRadius: s(8),
                borderWidth: 1,
                borderColor: colors.border,
                opacity: isEditable ? 1 : 0.4
              }}
            >
              <Power
                size={s(14)}
                color={isEditable ? colors.label : colors.muted}
              />
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onEdit}
              disabled={!isEditable}
              style={{
                padding: s(6),
                backgroundColor: colors.panel,
                borderRadius: s(8),
                borderWidth: 1,
                borderColor: colors.border,
                opacity: isEditable ? 1 : 0.4
              }}
              >
                <Pencil
                  size={s(14)}
                  color={isEditable ? colors.label : colors.muted}
                />
              </TouchableOpacity>
            <TouchableOpacity
              onPress={() => setIsCollapsed(prev => !prev)}
              style={{
                padding: s(6),
                backgroundColor: colors.panel,
                borderRadius: s(8),
                borderWidth: 1,
                borderColor: colors.border
              }}
            >
              {isCollapsed ? (
                <ChevronDown size={s(14)} color={colors.label} />
              ) : (
                <ChevronUp size={s(14)} color={colors.label} />
              )}
            </TouchableOpacity>
          </View>
        </View>

        {/* Categories */}
        {!isCollapsed && (
          <View style={{ marginLeft: s(22), gap: s(4) }}>
          <Text
            style={{
              fontSize: s(11),
              fontWeight: '600',
              color: colors.muted,
              textTransform: 'uppercase',
              letterSpacing: 0.5,
              marginBottom: s(4)
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
              onItemSnooze={onItemSnooze}
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
  onItemSnooze: (item: MenuItemType) => void
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
    onItemSnooze,
    isEditable,
    onReorderItems,
    itemCount,
    dragPreview,
    onDragPreviewChange,
    onDragPreviewEnd
  }: DraggableMenuCategoryProps) => {
    const uiScale = useUiScale()
    const s = (n: number) => Math.round(n * uiScale)
    const translateY = useSharedValue(0)
    const scale = useSharedValue(1)
    const isDragging = useSharedValue(false)
    const dragOriginIndex = useSharedValue(index)
    const [isExpanded, setIsExpanded] = useState(false)
    const [itemDragPreview, setItemDragPreview] = useState<{
      fromIndex: number
      toIndex: number
    } | null>(null)
    const [itemGridWidth, setItemGridWidth] = useState(0)

    const hapticStart = () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }

    const hapticDrop = () => {
      void Haptics.selectionAsync()
    }

    const visibleItems = useMemo(() => {
      if (
        !itemDragPreview ||
        itemDragPreview.fromIndex === itemDragPreview.toIndex
      ) {
        return items
      }

      const reorderedItems = [...items]
      const [movedItem] = reorderedItems.splice(itemDragPreview.fromIndex, 1)
      if (!movedItem) return items
      reorderedItems.splice(itemDragPreview.toIndex, 0, movedItem)
      return reorderedItems
    }, [items, itemDragPreview])

    const itemColumnCount = useMemo(() => {
      const estimatedWidth = 130
      const gap = 6
      if (itemGridWidth <= 0) return 1
      return Math.max(1, Math.floor((itemGridWidth + gap) / (estimatedWidth + gap)))
    }, [itemGridWidth])

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
            borderRadius: s(8),
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
            paddingHorizontal: s(10),
            paddingVertical: s(8)
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: s(6),
              flex: 1
            }}
          >
            <GestureDetector gesture={panGesture}>
              <View style={{ padding: s(2) }}>
                <GripVertical size={s(12)} color={colors.muted} />
              </View>
            </GestureDetector>
            <TouchableOpacity
              onPress={() => setIsExpanded(!isExpanded)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: s(6) }}
            >
              {isExpanded ? (
                <ChevronUp size={s(14)} color={colors.label} />
              ) : (
                <ChevronDown size={s(14)} color={colors.label} />
              )}
              <Text
                style={{
                  fontSize: s(12),
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
                borderRadius: s(10),
                paddingHorizontal: s(6),
                paddingVertical: s(2)
              }}
            >
              <Text
                style={{ fontSize: s(10), fontWeight: '600', color: colors.teal }}
              >
                {items.length}
              </Text>
            </View>
            <View
              style={{
                paddingHorizontal: s(7),
                paddingVertical: s(2),
                borderRadius: s(20),
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
                  fontSize: s(10),
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
            style={{ padding: s(4), opacity: isEditable ? 1 : 0.4 }}
          >
            {category.isActive ? (
              <Eye
                size={s(13)}
                color={isEditable ? colors.success : colors.muted}
              />
            ) : (
              <EyeOff
                size={s(13)}
                color={isEditable ? colors.danger : colors.muted}
              />
            )}
          </TouchableOpacity>
        </View>

        {isExpanded && (
          <View style={{ paddingHorizontal: s(10), paddingBottom: s(8) }}>
            {items.length === 0 ? (
              <Text style={{ fontSize: s(12), color: colors.muted }}>
                No items in this category
              </Text>
            ) : (
              <View
                style={{ flexDirection: 'row', flexWrap: 'wrap', gap: s(6) }}
                onLayout={event => {
                  setItemGridWidth(event.nativeEvent.layout.width)
                }}
              >
                {visibleItems.map((item, itemIndex) => (
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
                    onItemSnooze={onItemSnooze}
                    isEditable={isEditable}
                    itemCount={items.length}
                    columnCount={itemColumnCount}
                    dragPreview={itemDragPreview}
                    onDragPreviewChange={(fromIndex, toIndex) =>
                      setItemDragPreview({ fromIndex, toIndex })
                    }
                    onDragPreviewEnd={() => setItemDragPreview(null)}
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
  const uiScale = useUiScale()
  const s = (n: number) => Math.round(n * uiScale)
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
  const reorderModifierGroupsInStore = useMenuStore(
    s => s.reorderModifierGroups
  )
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const supabase = useSupabaseClient()
  const { activeTab, searchQuery } = useMenuLayout()
  const triggerPosSync = useTriggerPosSync()

  // Keep-alive tabs: mount each panel lazily on first visit, then keep it
  // mounted and just toggle visibility. Switching between already-visited tabs
  // (menus / items / categories) is then instant — no unmount/remount, no image
  // re-decode or list re-layout. Panels for never-visited tabs stay unmounted so
  // memory stays bounded to what the user actually opens.
  const [mountedTabs, setMountedTabs] = useState<Record<string, boolean>>(() => ({
    [activeTab]: true
  }))
  useEffect(() => {
    setMountedTabs(prev => (prev[activeTab] ? prev : { ...prev, [activeTab]: true }))
  }, [activeTab])
  const { isSingleLocation, isLoading: isSingleLocationLoading } =
    useIsSingleLocation()
  const { onlineMenuId } = useOnlineMenu(selectedStore?.id)

  // Release decoded base64 item-image bitmaps when leaving the menu management
  // screen. These images render as data: URIs (no disk cache), so their native
  // bitmaps sit pinned in the memory cache until explicitly cleared — this is
  // what made native memory climb on entry and not drop on exit. Clearing only
  // the MEMORY cache is safe: anything still needed re-decodes on next view.
  useEffect(() => {
    return () => {
      if (__DEV__) console.log('[memory] menu screen unmount → clearMemoryCache()')
      void ExpoImage.clearMemoryCache().catch(() => {})
    }
  }, [])

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
  // 86 / out-of-stock bottom sheet ref
  const snoozeSheetRef = useRef<SnoozeBottomSheetRef>(null)
  // Out-of-stock management sheet (items + grouped modifiers)
  const outOfStockRef = useRef<OutOfStockSheetRef>(null)

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
      .sort((a, b) => {
        const orderDiff =
          (a.displayOrder ?? Number.MAX_SAFE_INTEGER) -
          (b.displayOrder ?? Number.MAX_SAFE_INTEGER)
        if (orderDiff !== 0) return orderDiff
        return a.name.localeCompare(b.name)
      })
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

  // Measured width of the Items list, used to work out how many fixed-width
  // cards fit per row.
  const [itemsListWidth, setItemsListWidth] = useState(0)

  const itemsPerRow = useMemo(() => {
    if (!itemsListWidth) return DEFAULT_ITEMS_PER_ROW
    return Math.max(
      1,
      Math.floor(
        (itemsListWidth + ITEM_CARD_GAP) / (ITEM_CARD_WIDTH + ITEM_CARD_GAP)
      )
    )
  }, [itemsListWidth])

  // Flatten to FIXED-HEIGHT rows: one letter header, then rows of N cards.
  //
  // The previous shape was one cell per letter, which meant a letter with 20
  // items mounted 20 image cards in a single frame — FlashList cannot
  // virtualize inside a cell, so that cost was unavoidable and it is what made
  // scrolling stutter. One row per cell caps the per-frame work at `itemsPerRow`
  // cards and makes every cell height exactly predictable.
  const itemRows = useMemo(() => {
    const groups: Record<string, MenuItemType[]> = {}
    for (const item of filteredItems) {
      const letter = (item.name[0] || '#').toUpperCase()
      ;(groups[letter] ??= []).push(item)
    }

    const rows: ItemListRow[] = []
    for (const [letter, items] of Object.entries(groups).sort(([a], [b]) =>
      a.localeCompare(b)
    )) {
      rows.push({ type: 'header', key: `h:${letter}`, letter })
      for (let i = 0; i < items.length; i += itemsPerRow) {
        rows.push({
          type: 'cards',
          key: `r:${letter}:${i}`,
          items: items.slice(i, i + itemsPerRow)
        })
      }
    }
    return rows
  }, [filteredItems, itemsPerRow])

  // Exact per-cell heights — no guessing, so no blank gaps and no jumping
  // scrollbar.
  const overrideItemRowLayout = useCallback(
    (layout: { size?: number }, row: ItemListRow) => {
      layout.size =
        row.type === 'header'
          ? ITEM_GROUP_HEADER_HEIGHT
          : ITEM_CARD_HEIGHT + ITEM_CARD_GAP
    },
    []
  )

  // Lets FlashList keep separate recycle pools per row shape, so a header cell
  // is never recycled into a card row (which would force a full re-layout).
  const getItemRowType = useCallback((row: ItemListRow) => row.type, [])

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

      // "Owned" = the item is genuinely location-local to this store, so its own
      // menu_items row IS this location's copy and flipping its availability
      // boolean directly is correct.
      //
      // A GLOBAL item must NOT mutate the shared core — route the toggle through
      // the per-location 86/snooze override (infinity = hidden, null = available).
      // This INCLUDES single-location merchants: their availability lives on the
      // per-location override too (that is where the website's toggle + 86 write),
      // so a store's is_available can always be cleared from either app. Previously
      // single-loc was lumped in with "owned" and wrote the GLOBAL flag, which
      // diverged from the website's per-location override and could strand an item
      // that one app turned off (the item-311 class of bug). Writing via
      // set_item_snooze_v1 (SECURITY DEFINER) also keeps us on the POS's RLS-safe
      // write path — the POS never writes location_item_overrides directly.
      const isOwned = item.location_id === selectedStore?.id

      // Optimistic update
      toggleItemAvailability(id)

      if (isOwned) {
        const { error } = await MenuService.updateMenuItem(supabase, id, {
          availability: newAvailability
        })
        if (error) {
          toggleItemAvailability(id)
          showToast({
            title: 'Error',
            type: 'error',
            message: 'Failed to update item availability'
          })
        }
        return
      }

      if (!selectedStore?.id) {
        toggleItemAvailability(id)
        return
      }

      const { error } = await MenuService.setItemSnooze(supabase, {
        locationId: selectedStore.id,
        menuItemId: id,
        // Hiding -> 86 until manually restored; showing -> clear the 86.
        snoozedUntil: newAvailability ? null : 'infinity'
      })

      if (error) {
        toggleItemAvailability(id)
        showToast({
          title: 'Error',
          type: 'error',
          message: 'Failed to update item availability'
        })
      } else {
        triggerPosSync(selectedStore.id, selectedStore.merchant_id)
      }
    },
    [
      menuItems,
      toggleItemAvailability,
      supabase,
      showToast,
      selectedStore,
      triggerPosSync
    ]
  )

  // Open the 86 / out-of-stock sheet for an item.
  const handleSnooze = useCallback((item: MenuItemType) => {
    snoozeSheetRef.current?.open({
      id: item.id,
      name: item.name,
      snoozedUntil: item.snoozedUntil
    })
  }, [])

  // Count of everything currently 86'd (items + modifier options) for the header chip.
  const outOfStockCount = useMemo(() => {
    const items = menuItems.filter(i => isActivelySnoozed(i.snoozedUntil)).length
    const options = modifierGroups.reduce(
      (n, g) =>
        n + g.options.filter(o => isActivelySnoozed(o.snoozedUntil)).length,
      0
    )
    return items + options
  }, [menuItems, modifierGroups])

  const outOfStockChip =
    outOfStockCount > 0 ? (
      <TouchableOpacity
        onPress={() => outOfStockRef.current?.open()}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: s(5),
          paddingHorizontal: s(10),
          paddingVertical: s(6),
          borderRadius: s(8),
          backgroundColor: colors.danger + '18',
          borderWidth: 1,
          borderColor: colors.danger + '35'
        }}
      >
        <Ban size={s(13)} color={colors.danger} />
        <Text style={{ fontSize: s(12), fontWeight: '700', color: colors.danger }}>
          {`${outOfStockCount} 86'd`}
        </Text>
      </TouchableOpacity>
    ) : null

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

  const handleReorderModifierGroups = useCallback(
    async (fromIndex: number, toIndex: number) => {
      if (!selectedStore?.merchant_id) {
        showToast({
          title: 'Error',
          message: 'Select a store before reordering modifiers',
          type: 'error'
        })
        return
      }

      reorderModifierGroupsInStore(fromIndex, toIndex)

      const updatedGroups = useMenuStore.getState().modifierGroups
      const { error } = await MenuService.reorderModifierGroups(
        supabase,
        selectedStore.merchant_id,
        updatedGroups.map((group, index) => ({
          modifierGroupId: group.id,
          displayOrder: index
        }))
      )

      if (error) {
        showToast({
          title: 'Error',
          message: 'Failed to save modifier order',
          type: 'error'
        })
        if (selectedStore?.id) {
          triggerPosSync(selectedStore.id, selectedStore.merchant_id)
        }
      }
    },
    [
      reorderModifierGroupsInStore,
      selectedStore,
      showToast,
      supabase,
      triggerPosSync
    ]
  )

  // Full-form editability (name/details): a global entity is only editable by a
  // single-location merchant (their menu IS the global core). Multi-location
  // merchants get the read-only wall for global entities.
  const isEntityEditable = useCallback(
    (entityLocationId: string | null | undefined, entityName?: string) => {
      if (!selectedStore?.id) {
        return false
      }

      // If entity has a location_id, it must match current store
      if (entityLocationId) return entityLocationId === selectedStore.id
      // Global entity: editable only for single-location merchants.
      return isSingleLocation
    },
    [selectedStore?.id, isSingleLocation]
  )

  // Price + availability CAN be adjusted on global items even by multi-location
  // merchants, because those writes go through per-location overrides (never the
  // global core). Local items must still match the current store.
  const canEditAvailabilityAndPrice = useCallback(
    (entityLocationId: string | null | undefined) => {
      if (!selectedStore?.id) return false
      if (entityLocationId) return entityLocationId === selectedStore.id
      // Global item -> always allowed (per-location override).
      return true
    },
    [selectedStore?.id]
  )

  // Tapping an item inside a menu's category dropdown. Owned items (local to
  // this store, or global for single-location merchants) open the full editor.
  // Global / non-owned items can only have their per-location price &
  // availability adjusted, so they open the lightweight price sheet instead of
  // hitting the read-only wall.
  const handleMenuItemEdit = useCallback(
    (item: MenuItemType, categoryId: string, menuId: string) => {
      if (isEntityEditable(item.location_id, item.name)) {
        router.push(`/menu/edit-item?itemId=${item.id}`)
        return
      }
      priceEditRef.current?.open(
        {
          id: item.id,
          name: item.name,
          currentPrice: item.price,
          currentCashPrice: item.cashPrice,
          currentAvailability: item.availability,
          snoozedUntil: item.snoozedUntil
        },
        { categoryId, menuId }
      )
    },
    [isEntityEditable]
  )

  const renderMenusContent = () => (
    <View style={{ flex: 1, padding: s(14), backgroundColor: colors.panel }}>
      <MenuHeader
        title={`Menus (${menus.length})`}
        onAddPress={handleAddMenu}
        addButtonLabel='Add Menu'
        onRefresh={handleRefreshMenu}
        isRefreshing={isRefreshing}
        rightSlot={outOfStockChip}
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
              onItemPriceEdit={handleMenuItemEdit}
              onItemSnooze={handleSnooze}
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
              isOnlineMenu={!!onlineMenuId && menu.id === onlineMenuId}
            />
          ))}
          {hiddenMenus.length > 0 && (
            <View style={{ gap: s(8), marginTop: s(8) }}>
              <Text
                style={{
                  fontSize: s(11),
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
                  onItemPriceEdit={handleMenuItemEdit}
                  onItemSnooze={handleSnooze}
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
                  isOnlineMenu={!!onlineMenuId && menu.id === onlineMenuId}
                />
              ))}
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  )

  const renderCategoriesContent = () => (
    <View style={{ flex: 1, padding: s(14), backgroundColor: colors.panel }}>
      <MenuHeader
        title={`Categories (${(Array.isArray(storeCategories) ? storeCategories : []).length})`}
        onAddPress={handleAddCategory}
        addButtonLabel='Add Category'
        onRefresh={handleRefreshMenu}
        isRefreshing={isRefreshing}
        rightSlot={outOfStockChip}
      />

      <FlashList
        key='categories-list'
        data={[...(Array.isArray(storeCategories) ? storeCategories : [])].sort(
          (a, b) => a.name.localeCompare(b.name)
        )}
        keyExtractor={item => item.id}
        contentContainerStyle={{ paddingBottom: 8 }}
        ItemSeparatorComponent={CategoryRowSeparator}
        estimatedItemSize={64}
        drawDistance={2500}
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
                        const availEditable = canEditAvailabilityAndPrice(
                          item.location_id
                        )
                        const snoozeLabel = formatSnoozeCountdown(
                          item.snoozedUntil
                        )
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
                            {snoozeLabel && (
                              <View
                                style={{
                                  position: 'absolute',
                                  top: 6,
                                  left: 6,
                                  zIndex: 20,
                                  flexDirection: 'row',
                                  alignItems: 'center',
                                  gap: 3,
                                  paddingHorizontal: 6,
                                  paddingVertical: 3,
                                  borderRadius: 6,
                                  backgroundColor: colors.danger
                                }}
                              >
                                <Ban size={10} color={colors.onSolid} />
                                <Text
                                  style={{
                                    fontSize: 10,
                                    fontWeight: '700',
                                    color: colors.onSolid
                                  }}
                                >
                                  {snoozeLabel === '86'
                                    ? '86'
                                    : `86 · ${snoozeLabel}`}
                                </Text>
                              </View>
                            )}
                            <View style={{ height: 104, width: '100%' }}>
                              {item.image ? (
                                <MenuManagementImage
                                  image={item.image}
                                  recyclingKey={item.id}
                                  style={{ width: '100%', height: '100%' }}
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
                                onPress={() => handleSnooze(item)}
                                disabled={!selectedStore?.id}
                                style={{
                                  padding: 6,
                                  backgroundColor: colors.danger + '18',
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: colors.danger + '35',
                                  opacity: selectedStore?.id ? 1 : 0.4
                                }}
                              >
                                <Ban size={16} color={colors.danger} />
                              </TouchableOpacity>
                              <TouchableOpacity
                                onPress={() =>
                                  handleToggleAvailability(item.id)
                                }
                                disabled={!availEditable}
                                style={{
                                  padding: 6,
                                  backgroundColor: colors.teal + '18',
                                  borderRadius: 6,
                                  borderWidth: 1,
                                  borderColor: colors.teal + '35',
                                  opacity: availEditable ? 1 : 0.4
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

  const renderItemRow = useCallback(
    ({ item: row }: { item: ItemListRow }) => {
      if (row.type === 'header') {
        return (
          <Text
            style={{
              fontSize: 12,
              fontWeight: '700',
              color: colors.muted,
              letterSpacing: 1,
              textTransform: 'uppercase',
              paddingHorizontal: 4,
              lineHeight: ITEM_GROUP_HEADER_HEIGHT
            }}
          >
            {row.letter}
          </Text>
        )
      }
      return (
        <View
          style={{
            flexDirection: 'row',
            gap: ITEM_CARD_GAP,
            paddingBottom: ITEM_CARD_GAP
          }}
        >
          {row.items.map(item => (
            <MenuItemGridCard
              key={item.id}
              item={item}
              editable={isEntityEditable(item.location_id, item.name)}
              availEditable={canEditAvailabilityAndPrice(item.location_id)}
              canSnooze={!!selectedStore?.id}
              onSnooze={handleSnooze}
              onToggleAvailability={handleToggleAvailability}
              onEdit={handleEditItem}
            />
          ))}
        </View>
      )
    },
    [
      isEntityEditable,
      canEditAvailabilityAndPrice,
      selectedStore?.id,
      handleSnooze,
      handleToggleAvailability,
      handleEditItem
    ]
  )

  const renderItemsContent = () => (
    <View
      style={{ flex: 1, padding: 14, backgroundColor: colors.panel }}
      onLayout={event => {
        const width = event.nativeEvent.layout.width - 28 // minus padding
        if (width > 0 && width !== itemsListWidth) setItemsListWidth(width)
      }}
    >
      <MenuHeader
        title={`Menu Items (${filteredItems.length})`}
        onAddPress={handleAddItem}
        addButtonLabel='Add Item'
        onRefresh={handleRefreshMenu}
        isRefreshing={isRefreshing}
        rightSlot={outOfStockChip}
      />

      <FlashList
        data={itemRows}
        keyExtractor={row => row.key}
        renderItem={renderItemRow}
        getItemType={getItemRowType}
        showsVerticalScrollIndicator={false}
        estimatedItemSize={ITEM_CARD_HEIGHT + ITEM_CARD_GAP}
        overrideItemLayout={overrideItemRowLayout}
        // FlashList only renders ~250px past the viewport by default. At 192px
        // per row that is barely one row of buffer, so any real scroll velocity
        // outran it and you hit blank space until the cells caught up. ~5
        // screens of run-up costs a little more memory and removes the gap.
        drawDistance={2500}
        contentContainerStyle={{ paddingBottom: 24 }}
        ListEmptyComponent={
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
        }
      />
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
        rightSlot={outOfStockChip}
      />

      <DraggableFlatList
        key='modifiers-list'
        data={uniqueModifierGroups}
        keyExtractor={item => item.id}
        contentContainerStyle={{ gap: 8 }}
        removeClippedSubviews={true}
        maxToRenderPerBatch={5}
        windowSize={5}
        initialNumToRender={5}
        activationDistance={10}
        onDragEnd={({ from, to }) => {
          if (from !== to) {
            handleReorderModifierGroups(from, to)
          }
        }}
        renderItem={({
          item: modifierGroup,
          drag,
          isActive
        }: RenderItemParams<ExtendedModifierGroup>) => {
          const editable = isEntityEditable(
            modifierGroup.location_id,
            modifierGroup.name
          )
          const groupOptions = Array.isArray(modifierGroup.options)
            ? modifierGroup.options
            : []
          const snoozedOptionIds = groupOptions
            .filter(o => isActivelySnoozed(o.snoozedUntil))
            .map(o => o.id)
          const allOptionIds = groupOptions.map(o => o.id)
          const groupOutOfStock =
            allOptionIds.length > 0 &&
            snoozedOptionIds.length === allOptionIds.length
          return (
            <ScaleDecorator>
              <View
                style={{
                  backgroundColor: isActive ? colors.teal + '08' : colors.card,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: isActive ? colors.teal + '40' : colors.border,
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
                    <TouchableOpacity
                      onLongPress={drag}
                      delayLongPress={120}
                      style={{
                        padding: 4,
                        borderRadius: 8,
                        backgroundColor: colors.panel,
                        borderWidth: 1,
                        borderColor: colors.border
                      }}
                    >
                      <GripVertical size={13} color={colors.muted} />
                    </TouchableOpacity>
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
                  ) : !isSingleLocation && !isSingleLocationLoading ? (
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
                  ) : null}

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

                  <View
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                  >
                    {snoozedOptionIds.length > 0 && (
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 3,
                          paddingHorizontal: 7,
                          paddingVertical: 2,
                          borderRadius: 20,
                          backgroundColor: colors.danger + '18',
                          borderWidth: 1,
                          borderColor: colors.danger + '35'
                        }}
                      >
                        <Ban size={10} color={colors.danger} />
                        <Text
                          style={{
                            fontSize: 10,
                            fontWeight: '700',
                            color: colors.danger
                          }}
                        >
                          {groupOutOfStock
                            ? 'Out of stock'
                            : `${snoozedOptionIds.length} 86'd`}
                        </Text>
                      </View>
                    )}
                    {allOptionIds.length > 0 && (
                      <TouchableOpacity
                        onPress={() =>
                          snoozeSheetRef.current?.open({
                            kind: 'modifier-group',
                            id: modifierGroup.id,
                            name: modifierGroup.name,
                            optionIds: allOptionIds,
                            snoozedUntil: groupOutOfStock
                              ? SNOOZE_INFINITY
                              : null
                          })
                        }
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 4,
                          paddingHorizontal: 8,
                          paddingVertical: 5,
                          borderRadius: 6,
                          backgroundColor: groupOutOfStock
                            ? colors.danger + '18'
                            : colors.panel,
                          borderWidth: 1,
                          borderColor: groupOutOfStock
                            ? colors.danger + '35'
                            : colors.border
                        }}
                      >
                        <Ban size={12} color={colors.danger} />
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: '700',
                            color: colors.danger
                          }}
                        >
                          86
                        </Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      onPress={
                        editable
                          ? () =>
                              router.push(
                                `/menu/edit-modifier?id=${modifierGroup.id}`
                              )
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
                    ).map((option, index) => {
                      const optionSnoozed = isActivelySnoozed(
                        option.snoozedUntil
                      )
                      return (
                        <View
                          key={option.id ?? index}
                          style={{
                            flexDirection: 'row',
                            alignItems: 'center',
                            gap: 6,
                            backgroundColor: optionSnoozed
                              ? colors.danger + '12'
                              : colors.panel,
                            borderWidth: 1,
                            borderColor: optionSnoozed
                              ? colors.danger + '35'
                              : colors.border,
                            paddingLeft: 8,
                            paddingRight: 4,
                            paddingVertical: 3,
                            borderRadius: 6
                          }}
                        >
                          <Text
                            style={{
                              fontSize: 11,
                              color: colors.heading,
                              opacity: optionSnoozed ? 0.7 : 1
                            }}
                          >
                            {option.name}
                            {option.price > 0 && (
                              <Text style={{ color: colors.teal }}>
                                {' '}
                                (+${option.price.toFixed(2)})
                              </Text>
                            )}
                          </Text>
                          {/* Timed 86 flow (per-location override, works on
                              global modifiers) — same snooze sheet as items. */}
                          <TouchableOpacity
                            onPress={() =>
                              snoozeSheetRef.current?.open({
                                kind: 'modifier-option',
                                id: option.id,
                                name: option.name,
                                snoozedUntil: option.snoozedUntil
                              })
                            }
                            hitSlop={6}
                            style={{
                              padding: 4,
                              borderRadius: 6,
                              backgroundColor: optionSnoozed
                                ? colors.danger
                                : colors.danger + '18',
                              borderWidth: 1,
                              borderColor: colors.danger + '35'
                            }}
                          >
                            <Ban
                              size={11}
                              color={
                                optionSnoozed ? colors.onSolid : colors.danger
                              }
                            />
                          </TouchableOpacity>
                        </View>
                      )
                    })}
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
                                  <MenuManagementImage
                                    image={item.image}
                                    recyclingKey={item.id}
                                    decodeSize={48}
                                    style={{ width: '100%', height: '100%' }}
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
            </ScaleDecorator>
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

  const renderPanel = (tab: string) => {
    switch (tab) {
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

  const TAB_KEYS = ['menus', 'categories', 'items', 'modifiers', 'schedules']

  return (
    <View className='flex-1 bg-screen'>
      {TAB_KEYS.map(tab =>
        // Render if it's the active tab (immediately, no one-frame gap) or if it
        // was previously visited (kept alive for instant return).
        mountedTabs[tab] || activeTab === tab ? (
          <View
            key={tab}
            // display:none keeps the panel mounted but out of layout, so
            // returning to it is instant. RN supports display:none natively.
            style={activeTab === tab ? TAB_PANEL_ACTIVE : TAB_PANEL_HIDDEN}
            // Prevent hidden panels from capturing touches / accessibility.
            pointerEvents={activeTab === tab ? 'auto' : 'none'}
            aria-hidden={activeTab !== tab}
          >
            {renderPanel(tab)}
          </View>
        ) : null
      )}
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
        onSnooze={snoozeItem => snoozeSheetRef.current?.open(snoozeItem)}
      />

      {/* 86 / Out-of-stock bottom sheet */}
      <SnoozeBottomSheet ref={snoozeSheetRef} />

      {/* Out-of-stock management sheet (items + grouped modifiers) */}
      <OutOfStockSheet ref={outOfStockRef} />

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
              <MenuManagementImage
                image={item.image}
                recyclingKey={item.id}
                className='w-full h-full rounded-lg'
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
