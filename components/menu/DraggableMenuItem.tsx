import OptimizedListImage from '@/components/ui/OptimizedListImage'
import { resolveMenuItemImageSource } from '@/lib/menuItemImageSource'
import {
  extractMenuItemPlaceholderIconKey,
  getMenuItemPlaceholderIcon,
  type MenuItemPlaceholderIconKey
} from '@/lib/menuItemPlaceholderIcon'
import { colors } from '@/lib/theme'
import { MenuItemType } from '@/lib/types'
import { GripVertical } from 'lucide-react-native'
import React from 'react'
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  Extrapolate,
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
}

const styles = StyleSheet.create({
  card: {
    width: 130,
    height: 160,
    borderRadius: 10,
    marginBottom: 4,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
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
    justifyContent: 'center',
    backgroundColor: `${colors.teal}08`
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
    color: colors.heading,
    lineHeight: 14
  },
  priceText: {
    fontSize: 11,
    fontWeight: '700',
    color: colors.teal
  },
  gripHandle: {
    position: 'absolute',
    top: 8,
    right: 8,
    zIndex: 10,
    backgroundColor: `${colors.panel}cc`,
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
    isEditable
  }: DraggableMenuItemProps) => {
    const translateY = useSharedValue(0)
    const scale = useSharedValue(1)
    const isDragging = useSharedValue(false)

    const panGesture = Gesture.Pan()
      .enabled(isEditable)
      .onStart(() => {
        isDragging.value = true
        scale.value = withSpring(1.05)
      })
      .onUpdate(event => {
        translateY.value = event.translationY
      })
      .onEnd(event => {
        const itemHeight = 140 // Approximate height of each item card
        const newIndex = Math.round(index + event.translationY / itemHeight)

        if (newIndex !== index && newIndex >= 0) {
          runOnJS(onReorder)(index, newIndex)
        }

        translateY.value = withTiming(0)
        scale.value = withSpring(1)
        isDragging.value = false
      })

    const animatedStyle = useAnimatedStyle(() => {
      const shadowOpacity = interpolate(
        scale.value,
        [1, 1.05],
        [0, 0.2],
        Extrapolate.CLAMP
      )

      return {
        transform: [{ translateY: translateY.value }, { scale: scale.value }],
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
      <Animated.View style={[animatedStyle, { width: 130 }]}>
        <TouchableOpacity
          onPress={() => {}}
          style={[styles.card, styles.touchable]}
          activeOpacity={0.7}
        >
          {/* Image */}
          <View style={styles.imageWrapper}>
            {imageSource ? (
              <OptimizedListImage
                source={imageSource}
                style={{ width: '100%', height: '100%' }}
                contentFit='cover'
                recyclingKey={`${item.id}:${item.image ?? ''}`}
              />
            ) : (
              <View style={styles.placeholderContainer}>
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
              styles.contentContainer,
              { backgroundColor: `${colors.card}f0`, paddingTop: 4 }
            ]}
          >
            {isEditable && (
              <GestureDetector gesture={panGesture}>
                <View style={styles.gripHandle}>
                  <GripVertical size={10} color={colors.muted} />
                </View>
              </GestureDetector>
            )}
            <Text style={styles.nameText} numberOfLines={2}>
              {item.name}
            </Text>
            <Text style={styles.priceText}>${item.price.toFixed(2)}</Text>
          </View>
        </TouchableOpacity>
      </Animated.View>
    )
  }
)

DraggableMenuItem.displayName = 'DraggableMenuItem'

export default DraggableMenuItem
