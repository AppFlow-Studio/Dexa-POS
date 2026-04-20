import OptimizedListImage, {
  type ImageLoadPriority
} from '@/components/ui/OptimizedListImage'
import { useToast } from '@/contexts/ToastContext'
import { resolveMenuItemImageSource } from '@/lib/menuItemImageSource'
import { colors } from '@/lib/theme'
import { MenuItemType } from '@/lib/types'
import {
  isMenuBlockedSync,
  setMenuBlockedSync,
  useModifierSidebarStore
} from '@/stores/useModifierSidebarStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useTimeclockStore } from '@/stores/useTimeclockStore'
import { Utensils } from 'lucide-react-native'
import React, { useCallback, useMemo } from 'react'
import {
  ImageSourcePropType,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

const styles = StyleSheet.create({
  container: {
    width: '19%',
    borderRadius: 12,
    marginBottom: 4,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: `${colors.teal}30`,
    overflow: 'hidden'
  },
  containerWithImage: {
    minHeight: 176
  },
  containerDisabled: {
    opacity: 0.4
  },
  containerNoImage: {
    aspectRatio: undefined,
    height: 64
  },
  // Modifier corner triangle
  modifierCorner: {
    position: 'absolute',
    top: 0,
    left: 0,
    width: 0,
    height: 0,
    borderTopWidth: 18,
    borderRightWidth: 18,
    borderTopColor: colors.teal,
    borderRightColor: 'transparent',
    zIndex: 10
  },
  // Image area
  imageWrapper: {
    height: 120,
    width: '100%'
  },
  image: {
    width: '100%',
    height: '100%'
  },
  placeholderContainer: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: `${colors.teal}08`
  },
  // Content area
  contentContainer: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    gap: 2
  },
  nameText: {
    fontSize: 11,
    fontWeight: '600',
    color: colors.heading,
    lineHeight: 15
  },
  descriptionText: {
    marginTop: 3,
    fontSize: 9,
    fontWeight: '500',
    color: colors.muted,
    lineHeight: 12
  },
  // Price row overlay: top-right of whole card
  priceRow: {
    position: 'absolute',
    top: 6,
    right: 6,
    zIndex: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 4
  },
  cardPriceChip: {
    backgroundColor: 'rgba(17, 24, 39, 0.86)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.18)',
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1
  },
  cardPrice: {
    fontSize: 8,
    fontWeight: '700',
    color: '#F9FAFB'
  },
  cardPriceCustom: {
    fontSize: 8,
    fontWeight: '700',
    color: '#FCD34D'
  },
  cashPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(6, 78, 59, 0.9)',
    borderWidth: 1,
    borderColor: 'rgba(167, 243, 208, 0.35)',
    borderRadius: 5,
    paddingHorizontal: 4,
    paddingVertical: 1
  },
  cashLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: `${colors.success}99`,
    letterSpacing: 0.4,
    textTransform: 'uppercase'
  },
  cashAmount: {
    fontSize: 8,
    fontWeight: '700',
    color: '#D1FAE5'
  },
  // Divider between image and content
  divider: {
    height: 1,
    backgroundColor: `${colors.teal}20`,
    marginHorizontal: 10
  }
})

const PlaceholderIcon = React.memo(() => (
  <Utensils color={`${colors.label}60`} size={16} />
))
PlaceholderIcon.displayName = 'PlaceholderIcon'

interface MenuItemProps {
  item: MenuItemType
  imageSource?: ImageSourcePropType
  /** From FlatList index — viewport rows load first */
  imagePriority?: ImageLoadPriority
  onOrderClosedCheck?: () => boolean
  categoryId?: string
  menuId?: string
}

const MenuItem: React.FC<MenuItemProps> = ({
  item,
  imageSource,
  imagePriority = 'normal',
  onOrderClosedCheck,
  categoryId,
  menuId
}) => {
  const { activeEmployeeId, getSession, showClockInWall } = useTimeclockStore()
  const { show } = useToast()
  const showMenuItemPrices = useSettingsStore(s => s.showMenuItemPrices)
  const showMenuImages = useSettingsStore(s => s.showMenuImages)

  const isClockedIn = useMemo(() => {
    if (!activeEmployeeId) return false
    const session = getSession(activeEmployeeId)
    return session?.status === 'clockedIn'
  }, [activeEmployeeId, getSession])

  const priceData = useMemo(() => {
    const displayPrice = item.price
    const basePrice =
      item.priceLevels?.level_2_location_item ??
      item.priceLevels?.level_1_base ??
      item.price
    const hasCustomPricing = displayPrice !== basePrice
    return { displayPrice, hasCustomPricing, basePrice }
  }, [item])

  const hasModifiers = useMemo(
    () => item.modifierGroupIds && item.modifierGroupIds.length > 0,
    [item.modifierGroupIds]
  )

  const isDisabled = item.availability === false

  const handlePressIn = useCallback(() => {
    setMenuBlockedSync(true)

    if (!isClockedIn) {
      setMenuBlockedSync(false)
      showClockInWall()
      return
    }

    if (onOrderClosedCheck?.()) {
      setMenuBlockedSync(false)
      return
    }

    const { activeOrderId, ordersById } = useOrderStore.getState()
    const currentOrder = activeOrderId ? ordersById[activeOrderId] : undefined

    // if (!currentOrder?.order_type) {
    //   setMenuBlockedSync(false);
    //   show({
    //     title: "Order Type Required",
    //     message: "Please select an order type before adding items.",
    //     type: "warning",
    //   });
    //   return;
    // }

    useModifierSidebarStore.getState().preWarm(item, categoryId, menuId)
  }, [
    item,
    categoryId,
    menuId,
    isClockedIn,
    onOrderClosedCheck,
    showClockInWall,
    show
  ])

  const handlePress = useCallback(() => {
    if (!isMenuBlockedSync()) return
    const { activeOrderId } = useOrderStore.getState()
    useModifierSidebarStore
      .getState()
      .openToAdd(item, activeOrderId, categoryId, menuId)
  }, [item, categoryId, menuId])

  const resolvedImageSource =
    imageSource ?? resolveMenuItemImageSource(item.image)

  return (
    <TouchableOpacity
      disabled={isDisabled}
      onPressIn={handlePressIn}
      onPress={handlePress}
      style={[
        styles.container,
        showMenuImages && styles.containerWithImage,
        isDisabled && styles.containerDisabled,
        !showMenuImages && styles.containerNoImage
      ]}
    >
      {/* Modifier triangle corner */}
      {hasModifiers && <View style={styles.modifierCorner} />}

      {showMenuItemPrices && (
        <View style={styles.priceRow}>
          <View style={styles.cardPriceChip}>
            <Text
              style={
                priceData.hasCustomPricing
                  ? styles.cardPriceCustom
                  : styles.cardPrice
              }
            >
              ${priceData.displayPrice?.toFixed(2)}
            </Text>
          </View>

          {item.cashPrice && (
            <View style={styles.cashPill}>
              <Text style={styles.cashAmount}>
                ${item.cashPrice.toFixed(2)}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Image */}
      {showMenuImages && (
        <View style={styles.imageWrapper}>
          {resolvedImageSource ? (
            <OptimizedListImage
              source={resolvedImageSource}
              style={styles.image}
              contentFit='cover'
              priority={imagePriority}
              recyclingKey={`${item.id}:${item.image ?? ''}`}
            />
          ) : (
            <View style={styles.placeholderContainer}>
              <PlaceholderIcon />
            </View>
          )}
        </View>
      )}

      {/* Divider */}
      {showMenuImages && <View style={styles.divider} />}

      {/* Content */}
      <View style={styles.contentContainer}>
        <Text style={styles.nameText} numberOfLines={2}>
          {item.name}
        </Text>
        {!!item.description?.trim() && (
          <Text style={styles.descriptionText} numberOfLines={2}>
            {item.description.trim()}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  )
}

export default React.memo(MenuItem, (prevProps, nextProps) => {
  return (
    prevProps.item.id === nextProps.item.id &&
    prevProps.item.price === nextProps.item.price &&
    prevProps.item.availability === nextProps.item.availability &&
    prevProps.item.stockQuantity === nextProps.item.stockQuantity &&
    prevProps.item.name === nextProps.item.name &&
    prevProps.item.image === nextProps.item.image &&
    prevProps.categoryId === nextProps.categoryId &&
    prevProps.imageSource === nextProps.imageSource &&
    prevProps.imagePriority === nextProps.imagePriority
  )
})
