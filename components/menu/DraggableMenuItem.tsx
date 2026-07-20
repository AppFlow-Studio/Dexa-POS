import OptimizedListImage from '@/components/ui/OptimizedListImage'
import { resolveMenuItemImageSource } from '@/lib/menuItemImageSource'
import {
  extractMenuItemPlaceholderIconKey,
  getMenuItemPlaceholderIcon,
  type MenuItemPlaceholderIconKey
} from '@/lib/menuItemPlaceholderIcon'
import { colors } from '@/lib/theme'
import {
  formatSnoozeCountdown,
  isActivelySnoozed
} from '@/lib/snoozeDurations'
import { MenuItemType } from '@/lib/types'
import { useUiScale } from '@/lib/uiScale'
import * as Haptics from 'expo-haptics'
import { Ban, GripVertical } from 'lucide-react-native'
import React, { useMemo } from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
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

interface DraggableMenuItemProps {
  item: MenuItemType
  index: number
  categoryId: string
  menuId: string
  onReorder: (fromIndex: number, toIndex: number) => void
  onItemPriceEdit: (
    item: MenuItemType,
    categoryId: string,
    menuId: string
  ) => void
  onItemSnooze: (item: MenuItemType) => void
  isEditable: boolean
  itemCount: number
  columnCount: number
  dragPreview: { fromIndex: number; toIndex: number } | null
  onDragPreviewChange: (fromIndex: number, toIndex: number) => void
  onDragPreviewEnd: () => void
}

const ITEM_CARD_WIDTH_BASE = 130
const ITEM_CARD_HEIGHT_BASE = 160
const ITEM_GRID_GAP_BASE = 6

const createStyles = (scale: number) => {
  const s = (n: number) => Math.round(n * scale)
  const cardWidth = s(ITEM_CARD_WIDTH_BASE)
  const cardHeight = s(ITEM_CARD_HEIGHT_BASE)
  const gridGap = s(ITEM_GRID_GAP_BASE)
  return {
    cardWidth,
    cardHeight,
    gridGap,
    gridCellWidth: cardWidth + gridGap,
    gridCellHeight: cardHeight + gridGap,
    styles: StyleSheet.create({
      card: {
        width: cardWidth,
        height: cardHeight,
        borderRadius: s(10),
        marginBottom: s(4),
        borderWidth: 1,
        overflow: 'hidden',
        flexDirection: 'column'
      },
      touchable: {
        flex: 1,
        flexDirection: 'column'
      },
      imageWrapper: {
        height: s(100),
        width: '100%'
      },
      placeholderContainer: {
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center'
      },
      contentContainer: {
        paddingHorizontal: s(8),
        paddingVertical: s(6),
        gap: s(2),
        flex: 1,
        justifyContent: 'flex-start'
      },
      nameText: {
        fontSize: s(11),
        fontWeight: '600',
        lineHeight: s(14)
      },
      priceText: {
        fontSize: s(11),
        fontWeight: '700'
      },
      gripHandle: {
        position: 'absolute',
        top: s(8),
        right: s(8),
        zIndex: 10,
        borderRadius: s(6),
        padding: s(4)
      },
      snoozeBadge: {
        position: 'absolute',
        top: s(6),
        left: s(6),
        zIndex: 10,
        flexDirection: 'row',
        alignItems: 'center',
        gap: s(3),
        paddingHorizontal: s(5),
        paddingVertical: s(2),
        borderRadius: s(6)
      },
      snoozeBadgeText: {
        fontSize: s(9),
        fontWeight: '700'
      },
      snoozeButton: {
        position: 'absolute',
        bottom: s(6),
        right: s(6),
        zIndex: 10,
        padding: s(5),
        borderRadius: s(6),
        borderWidth: 1
      }
    })
  }
}

const draggableMenuItemStylesByScale = new Map<number, ReturnType<typeof createStyles>>()

const getStylesForScale = (scale: number) => {
  const cached = draggableMenuItemStylesByScale.get(scale)
  if (cached) return cached
  const next = createStyles(scale)
  draggableMenuItemStylesByScale.set(scale, next)
  return next
}

const DraggableMenuItem = React.memo(
  ({
    item,
    index,
    categoryId,
    menuId,
    onReorder,
    onItemPriceEdit,
    onItemSnooze,
    isEditable,
    itemCount,
    columnCount,
    dragPreview,
    onDragPreviewChange,
    onDragPreviewEnd
  }: DraggableMenuItemProps) => {
    const uiScale = useUiScale()
    const sc = (n: number) => Math.round(n * uiScale)
    const { styles: baseStyles, gridCellWidth, gridCellHeight, cardWidth } = useMemo(
      () => getStylesForScale(uiScale),
      [uiScale]
    )

    const translateX = useSharedValue(0)
    const translateY = useSharedValue(0)
    const scale = useSharedValue(1)
    const isDragging = useSharedValue(false)
    const dragOriginIndex = useSharedValue(index)
    const [isDragActive, setIsDragActive] = React.useState(false)

    const hapticStart = () => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    }

    const hapticDrop = () => {
      void Haptics.selectionAsync()
    }

    const panGesture = Gesture.Pan()
      .activateAfterLongPress(120)
      .activeOffsetX([-8, 8])
      .activeOffsetY([-8, 8])
      .onStart(() => {
        isDragging.value = true
        scale.value = withSpring(1.05)
        dragOriginIndex.value = index
        runOnJS(setIsDragActive)(true)
        runOnJS(onDragPreviewChange)(index, index)
        runOnJS(hapticStart)()
      })
      .onUpdate(event => {
        translateX.value = event.translationX
        translateY.value = event.translationY

        const safeColumns = Math.max(1, columnCount)
        const originColumn = dragOriginIndex.value % safeColumns
        const originRow = Math.floor(dragOriginIndex.value / safeColumns)
        const targetColumn = Math.round(
          originColumn + event.translationX / gridCellWidth
        )
        const targetRow = Math.round(
          originRow + event.translationY / gridCellHeight
        )
        const clampedColumn = Math.max(0, Math.min(safeColumns - 1, targetColumn))
        const unclampedIndex = targetRow * safeColumns + clampedColumn
        const newIndex = Math.max(0, Math.min(itemCount - 1, unclampedIndex))

        if (
          !dragPreview ||
          dragPreview.fromIndex !== dragOriginIndex.value ||
          dragPreview.toIndex !== newIndex
        ) {
          runOnJS(onDragPreviewChange)(dragOriginIndex.value, newIndex)
        }
      })
      .onEnd(event => {
        const safeColumns = Math.max(1, columnCount)
        const originColumn = dragOriginIndex.value % safeColumns
        const originRow = Math.floor(dragOriginIndex.value / safeColumns)
        const targetColumn = Math.round(
          originColumn + event.translationX / gridCellWidth
        )
        const targetRow = Math.round(
          originRow + event.translationY / gridCellHeight
        )
        const clampedColumn = Math.max(0, Math.min(safeColumns - 1, targetColumn))
        const unclampedIndex = targetRow * safeColumns + clampedColumn
        const newIndex = Math.max(0, Math.min(itemCount - 1, unclampedIndex))

        runOnJS(onDragPreviewEnd)()
        if (newIndex !== dragOriginIndex.value && newIndex >= 0) {
          runOnJS(onReorder)(dragOriginIndex.value, newIndex)
          runOnJS(hapticDrop)()
        }

        translateX.value = withTiming(0)
        translateY.value = withTiming(0)
        scale.value = withSpring(1)
        isDragging.value = false
        runOnJS(setIsDragActive)(false)
      })

    const animatedStyle = useAnimatedStyle(() => {
      const shadowOpacity = interpolate(
        scale.value,
        [1, 1.05],
        [0, 0.2],
        Extrapolate.CLAMP
      )
      const safeColumns = Math.max(1, columnCount)
      const currentColumn = index % safeColumns
      const currentRow = Math.floor(index / safeColumns)
      const originColumn = dragOriginIndex.value % safeColumns
      const originRow = Math.floor(dragOriginIndex.value / safeColumns)
      const dragCompensationX = isDragging.value
        ? (currentColumn - originColumn) * gridCellWidth
        : 0
      const dragCompensationY = isDragging.value
        ? (currentRow - originRow) * gridCellHeight
        : 0

      return {
        transform: [
          { translateX: translateX.value - dragCompensationX },
          { translateY: translateY.value - dragCompensationY },
          { scale: scale.value }
        ],
        shadowOpacity,
        elevation: isDragging.value ? 4 : 0,
        zIndex: isDragging.value ? 500 : 1
      }
    })

    const imageSource = resolveMenuItemImageSource(item.image)
    const snoozeLabel = formatSnoozeCountdown(item.snoozedUntil)
    const isSnoozed = isActivelySnoozed(item.snoozedUntil)
    const PlaceholderIcon = React.useMemo(() => {
      const iconKey =
        item.placeholderIcon ??
        extractMenuItemPlaceholderIconKey(item.cardBgColor)
      return getMenuItemPlaceholderIcon(
        iconKey as MenuItemPlaceholderIconKey | undefined
      )
    }, [item.placeholderIcon, item.cardBgColor])

    return (
      <Animated.View
        style={[animatedStyle, { width: cardWidth }]}
        layout={
          isDragActive
            ? undefined
            : Layout.springify().damping(24).stiffness(220)
        }
      >
        <TouchableOpacity
          onPress={() => onItemPriceEdit(item, categoryId, menuId)}
          style={[
            baseStyles.card,
            {
              backgroundColor: colors.card,
              borderColor: colors.teal + '35'
            },
            baseStyles.touchable
          ]}
          activeOpacity={0.7}
        >
          {/* Image */}
          <View style={baseStyles.imageWrapper}>
            {imageSource ? (
              <OptimizedListImage
                source={imageSource}
                style={{ width: '100%', height: '100%' }}
                contentFit='cover'
                recyclingKey={`${item.id}:${item.image ?? ''}`}
              />
            ) : (
              <View
                style={[
                  baseStyles.placeholderContainer,
                  { backgroundColor: `${colors.teal}08` }
                ]}
              >
                <PlaceholderIcon
                  color={`${colors.label}72`}
                  size={sc(18)}
                  strokeWidth={2}
                />
              </View>
            )}
          </View>

          {/* Content overlay at bottom */}
          <View
            style={[
              baseStyles.contentContainer,
              { backgroundColor: `${colors.card}f0`, paddingTop: sc(4) }
            ]}
          >
            <GestureDetector gesture={panGesture}>
              <View
                style={[
                  baseStyles.gripHandle,
                  {
                    backgroundColor: `${colors.panel}cc`,
                    opacity: isEditable ? 1 : 0.85
                  }
                ]}
              >
                <GripVertical size={sc(10)} color={colors.muted} />
              </View>
            </GestureDetector>
            <Text
              style={[baseStyles.nameText, { color: colors.heading }]}
              numberOfLines={2}
            >
              {item.name}
            </Text>
            <Text style={[baseStyles.priceText, { color: colors.teal }]}>
              ${item.price.toFixed(2)}
            </Text>
          </View>
        </TouchableOpacity>

        {/* 86 status badge (top-left) */}
        {snoozeLabel && (
          <View
            style={[baseStyles.snoozeBadge, { backgroundColor: colors.danger }]}
            pointerEvents='none'
          >
            <Ban size={sc(9)} color={colors.onSolid} />
            <Text style={[baseStyles.snoozeBadgeText, { color: colors.onSolid }]}>
              {snoozeLabel === '86' ? '86' : `86 · ${snoozeLabel}`}
            </Text>
          </View>
        )}

        {/* Quick 86 / out-of-stock action (bottom-right). Own touchable so it
            doesn't trigger the card's edit press. */}
        <TouchableOpacity
          onPress={() => onItemSnooze(item)}
          hitSlop={6}
          style={[
            baseStyles.snoozeButton,
            {
              backgroundColor: isSnoozed
                ? colors.danger
                : colors.danger + '18',
              borderColor: colors.danger + '35'
            }
          ]}
        >
          <Ban size={sc(13)} color={isSnoozed ? colors.onSolid : colors.danger} />
        </TouchableOpacity>
      </Animated.View>
    )
  }
)

DraggableMenuItem.displayName = 'DraggableMenuItem'

export default DraggableMenuItem
