import OptimizedListImage from '@/components/ui/OptimizedListImage'
import { resolveMenuItemImageSource } from '@/lib/menuItemImageSource'
import {
  extractMenuItemPlaceholderIconKey,
  getMenuItemPlaceholderIcon,
  type MenuItemPlaceholderIconKey
} from '@/lib/menuItemPlaceholderIcon'
import { colors } from '@/lib/theme'
import { MenuItemType } from '@/lib/types'
import * as Haptics from 'expo-haptics'
import { GripVertical } from 'lucide-react-native'
import React from 'react'
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
  isEditable: boolean
  itemCount: number
  columnCount: number
  dragPreview: { fromIndex: number; toIndex: number } | null
  onDragPreviewChange: (fromIndex: number, toIndex: number) => void
  onDragPreviewEnd: () => void
}

const ITEM_CARD_WIDTH = 130
const ITEM_CARD_HEIGHT = 160
const ITEM_GRID_GAP = 6
const ITEM_GRID_CELL_WIDTH = ITEM_CARD_WIDTH + ITEM_GRID_GAP
const ITEM_GRID_CELL_HEIGHT = ITEM_CARD_HEIGHT + ITEM_GRID_GAP

const baseStyles = StyleSheet.create({
  card: {
    width: ITEM_CARD_WIDTH,
    height: ITEM_CARD_HEIGHT,
    borderRadius: 10,
    marginBottom: 4,
    borderWidth: 1,
    overflow: 'hidden',
    flexDirection: 'column'
  },
  touchable: {
    flex: 1,
    flexDirection: 'column'
  },
  imageWrapper: {
    height: 100,
    width: '100%'
  },
  placeholderContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center'
  },
  contentContainer: {
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 2,
    flex: 1,
    justifyContent: 'flex-start'
  },
  nameText: {
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 14
  },
  priceText: {
    fontSize: 11,
    fontWeight: '700'
  },
  gripHandle: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    borderRadius: 6,
    padding: 4
  }
})

const DraggableMenuItem = React.memo(
  ({
    item,
    index,
    categoryId,
    menuId,
    onReorder,
    onItemPriceEdit,
    isEditable,
    itemCount,
    columnCount,
    dragPreview,
    onDragPreviewChange,
    onDragPreviewEnd
  }: DraggableMenuItemProps) => {
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
          originColumn + event.translationX / ITEM_GRID_CELL_WIDTH
        )
        const targetRow = Math.round(
          originRow + event.translationY / ITEM_GRID_CELL_HEIGHT
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
          originColumn + event.translationX / ITEM_GRID_CELL_WIDTH
        )
        const targetRow = Math.round(
          originRow + event.translationY / ITEM_GRID_CELL_HEIGHT
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
        ? (currentColumn - originColumn) * ITEM_GRID_CELL_WIDTH
        : 0
      const dragCompensationY = isDragging.value
        ? (currentRow - originRow) * ITEM_GRID_CELL_HEIGHT
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
        style={[animatedStyle, { width: ITEM_CARD_WIDTH }]}
        layout={
          isDragActive
            ? undefined
            : Layout.springify().damping(24).stiffness(220)
        }
      >
        <TouchableOpacity
          onPress={() => {}}
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
                  size={18}
                  strokeWidth={2}
                />
              </View>
            )}
          </View>

          {/* Content overlay at bottom */}
          <View
            style={[
              baseStyles.contentContainer,
              { backgroundColor: `${colors.card}f0`, paddingTop: 4 }
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
                <GripVertical size={10} color={colors.muted} />
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
      </Animated.View>
    )
  }
)

DraggableMenuItem.displayName = 'DraggableMenuItem'

export default DraggableMenuItem
