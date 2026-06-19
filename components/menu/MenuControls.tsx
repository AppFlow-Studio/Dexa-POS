import { colors } from '@/lib/theme'
import type { Menu } from '@/lib/types'
import { useColorScheme } from '@/lib/useColorScheme'
import { useMenuStore } from '@/stores/useMenuStore'
import { usePinOverrideStore } from '@/stores/usePinOverrideStore'
import { LinearGradient } from 'expo-linear-gradient'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  ShieldCheck,
  UtensilsCrossed,
  X
} from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dimensions,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

interface MenuControlsProps {
  activeMeal: string
  menuOptions?: Menu[]
  showMenuButtons?: boolean
  onMealChange?: (meal: string) => void
  activeCategory: string
  onCategoryChange: (category: string) => void
  onMenuCategoryChange?: (meal: string, category: string) => void
  rightSlot?: React.ReactNode
}

const createStyles = () =>
  StyleSheet.create({
    wrapper: {
      width: '100%',
      paddingTop: 8,
      paddingHorizontal: 0,
      borderBottomWidth: 1,
      borderBottomColor: `${colors.border}50`
    },
    menuRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 4,
      paddingBottom: 8
    },
    menuRowArea: {
      position: 'relative',
      minHeight: 42
    },
    menuRowScroll: {
      minHeight: 42
    },
    menuButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 11,
      paddingVertical: 7,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: `${colors.border}e8`,
      backgroundColor: colors.panel
    },
    menuButtonActive: {
      borderColor: colors.teal,
      backgroundColor: `${colors.teal}16`
    },
    menuButtonOpen: {
      borderColor: `${colors.teal}90`,
      backgroundColor: colors.panel
    },
    menuButtonText: {
      color: colors.heading,
      fontSize: 11,
      fontWeight: '800',
      textTransform: 'uppercase',
      letterSpacing: 0.4
    },
    menuButtonTextActive: {
      color: colors.teal
    },
    menuButtonIconWrap: {
      width: 18,
      height: 18,
      borderRadius: 9,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.screen,
      borderWidth: 1,
      borderColor: `${colors.border}cc`
    },
    menuButtonIconWrapActive: {
      backgroundColor: `${colors.teal}20`,
      borderColor: `${colors.teal}60`
    },
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingBottom: 8,
      minHeight: 52
    },
    categoriesArea: {
      flex: 1,
      position: 'relative',
      minHeight: 40,
      justifyContent: 'center'
    },
    categoriesScroll: {
      minHeight: 40
    },
    scrollContent: {
      paddingHorizontal: 4,
      gap: 6,
      alignItems: 'center',
      minHeight: 40
    },
    tab: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 5,
      paddingHorizontal: 14,
      paddingVertical: 9,
      borderRadius: 10,
      backgroundColor: 'transparent',
      borderWidth: 1,
      borderColor: 'transparent'
    },
    tabActive: {
      backgroundColor: colors.teal,
      borderColor: colors.teal
    },
    tabLocked: {
      backgroundColor: colors.screen,
      borderColor: colors.border,
      opacity: 0.7
    },
    tabText: {
      fontSize: 13,
      fontWeight: '500',
      color: colors.heading
    },
    tabTextActive: {
      color: colors.onSolid,
      fontWeight: '700'
    },
    tabTextLocked: {
      color: colors.label
    },
    tailButton: {
      position: 'absolute',
      top: '50%',
      marginTop: -14,
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.panel,
      zIndex: 5,
      shadowColor: '#000',
      shadowOpacity: 0.28,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 2 },
      elevation: 4
    },
    leftTailButton: {
      left: -4
    },
    rightTailButton: {
      right: -4
    },
    menuTailButton: {
      top: 2,
      marginTop: 0
    },
    rightSlotWrap: {
      marginLeft: 6,
      flexShrink: 0
    },
    popupCard: {
      position: 'absolute',
      borderRadius: 8,
      borderWidth: 1,
      padding: 14,
      backgroundColor: colors.screen,
      borderColor: `${colors.teal}28`,
      shadowColor: '#000',
      shadowOpacity: 0.28,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 12
    },
    popupHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 12,
      paddingBottom: 10,
      borderBottomWidth: 1,
      borderBottomColor: `${colors.border}70`
    },
    popupTitle: {
      color: colors.heading,
      fontSize: 15,
      fontWeight: '800'
    },
    popupSubtitle: {
      color: colors.muted,
      fontSize: 11,
      fontWeight: '600',
      marginTop: 2
    },
    popupCloseButton: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.panel,
      borderWidth: 1,
      borderColor: colors.border
    },
    popupGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8
    },
    popupCategory: {
      width: '31.5%',
      minHeight: 62,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: `${colors.border}d0`,
      backgroundColor: colors.panel,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 10,
      paddingVertical: 8
    },
    popupCategoryActive: {
      borderColor: colors.teal,
      backgroundColor: `${colors.teal}18`
    },
    popupCategoryText: {
      color: colors.heading,
      fontSize: 12,
      fontWeight: '700',
      textAlign: 'center',
      lineHeight: 16
    },
    popupCategoryTextActive: {
      color: colors.teal
    }
  })

const menuControlStylesByScheme = new Map<string, ReturnType<typeof createStyles>>()

const getStylesForScheme = (scheme: string) => {
  const cached = menuControlStylesByScheme.get(scheme)
  if (cached) return cached
  const next = createStyles()
  menuControlStylesByScheme.set(scheme, next)
  return next
}

// ─── Unlock session badge ────────────────────────────────────────────────────

const UnlockBadge = React.memo(() => {
  const { isUnlocked, unlockedUntil, lockNow } = usePinOverrideStore()
  const [, tick] = useState(0)

  // Re-render every 30 s to keep countdown fresh
  useEffect(() => {
    const id = setInterval(() => tick(n => n + 1), 30_000)
    return () => clearInterval(id)
  }, [])

  if (!isUnlocked() || !unlockedUntil) return null

  const remainingMs = unlockedUntil - Date.now()
  const remainingMin = Math.max(1, Math.ceil(remainingMs / 60_000))

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 5,
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        backgroundColor: colors.teal + '15',
        borderWidth: 1,
        borderColor: colors.teal + '30',
        marginRight: 4,
        marginLeft: 8
      }}
    >
      <ShieldCheck size={12} color={colors.teal} />
      <Text style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}>
        Manager Mode · {remainingMin}m
      </Text>
      <TouchableOpacity
        onPress={lockNow}
        hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
      >
        <X size={11} color={colors.teal} />
      </TouchableOpacity>
    </View>
  )
})
UnlockBadge.displayName = 'UnlockBadge'

// ─── Main component ───────────────────────────────────────────────────────────

const MenuControls: React.FC<MenuControlsProps> = ({
  activeMeal,
  menuOptions,
  showMenuButtons = true,
  onMealChange,
  activeCategory,
  onCategoryChange,
  onMenuCategoryChange,
  rightSlot
}) => {
  const { colorScheme } = useColorScheme()
  const styles = useMemo(() => getStylesForScheme(colorScheme), [colorScheme])
  const storeMenus = useMenuStore(s => s.menus)
  const menus = menuOptions ?? storeMenus
  const isCategoryAvailableNow = useMenuStore(s => s.isCategoryAvailableNow)
  const isCategoryActiveForMenu = useMenuStore(s => s.isCategoryActiveForMenu)
  const temporaryActiveCategories = useMenuStore(
    s => s.temporaryActiveCategories
  )
  const temporaryActiveCategorySet = useMemo(
    () => new Set(temporaryActiveCategories),
    [temporaryActiveCategories]
  )
  const addTemporaryCategoryAccess = useMenuStore(
    s => s.addTemporaryCategoryAccess
  )
  const { requestPinOverride, isUnlocked } = usePinOverrideStore()
  const menuScrollRef = useRef<ScrollView>(null)
  const categoriesScrollRef = useRef<ScrollView>(null)
  const menuButtonRefs = useRef<Record<string, any>>({})
  const categoryLayoutXRef = useRef<Record<string, number>>({})
  const menuScrollXRef = useRef(0)
  const menuViewportWidthRef = useRef(0)
  const menuContentWidthRef = useRef(0)
  const categoriesScrollXRef = useRef(0)
  const categoriesViewportWidthRef = useRef(0)
  const categoriesContentWidthRef = useRef(0)
  const [canScrollMenusLeft, setCanScrollMenusLeft] = useState(false)
  const [canScrollMenusRight, setCanScrollMenusRight] = useState(false)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)
  const [popupMenuName, setPopupMenuName] = useState<string | null>(null)
  const [popupAnchor, setPopupAnchor] = useState({
    x: 12,
    y: 96,
    width: 0,
    height: 0
  })

  const updateScrollAffordance = useCallback((offsetX: number) => {
    const maxOffset = Math.max(
      0,
      categoriesContentWidthRef.current - categoriesViewportWidthRef.current
    )
    setCanScrollLeft(offsetX > 2)
    setCanScrollRight(offsetX < maxOffset - 2)
  }, [])

  const updateMenuScrollAffordance = useCallback((offsetX: number) => {
    const maxOffset = Math.max(
      0,
      menuContentWidthRef.current - menuViewportWidthRef.current
    )
    setCanScrollMenusLeft(offsetX > 2)
    setCanScrollMenusRight(offsetX < maxOffset - 2)
  }, [])

  const currentMenu = useMemo(
    () => menus.find(m => m.name === activeMeal),
    [menus, activeMeal]
  )
  const categories = currentMenu?.categories
  const popupMenu = useMemo(
    () => menus.find(m => m.name === popupMenuName),
    [menus, popupMenuName]
  )

  useEffect(() => {
    if (!activeCategory) return
    const x = categoryLayoutXRef.current[activeCategory]
    if (typeof x !== 'number') return
    const centeredX = Math.max(
      0,
      x - Math.max(0, categoriesViewportWidthRef.current - 160) / 2
    )
    categoriesScrollRef.current?.scrollTo({ x: centeredX, animated: true })
  }, [activeCategory, activeMeal])

  const openMenuCategoryPopup = useCallback(
    (menuName: string, menuId: string) => {
      const menu = menus.find(m => m.name === menuName)
      const onlyCategory = menu?.categories?.length === 1
        ? menu.categories[0]
        : null

      if (onlyCategory) {
        onMenuCategoryChange?.(menuName, onlyCategory.name)
        if (!onMenuCategoryChange) {
          onMealChange?.(menuName)
          onCategoryChange(onlyCategory.name)
        }
        setPopupMenuName(null)
        return
      }

      if (popupMenuName === menuName) {
        setPopupMenuName(null)
        return
      }

      menuButtonRefs.current[menuId]?.measureInWindow?.(
        (x: number, y: number, width: number, height: number) => {
          setPopupAnchor({ x, y, width, height })
          setPopupMenuName(menuName)
        }
      )
    },
    [
      menus,
      onCategoryChange,
      onMealChange,
      onMenuCategoryChange,
      popupMenuName
    ]
  )

  const handleCategoryPress = useCallback(
    (tab: string, isAvailable: boolean) => {
      if (isAvailable) {
        onCategoryChange(tab)
        return
      }
      // If a manager session is active, bypass PIN and grant directly
      if (isUnlocked()) {
        addTemporaryCategoryAccess(tab)
        onCategoryChange(tab)
        return
      }
      requestPinOverride({
        type: 'select_category',
        payload: { categoryName: tab }
      })
    },
    [
      onCategoryChange,
      requestPinOverride,
      isUnlocked,
      addTemporaryCategoryAccess
    ]
  )

  return (
    <View style={styles.wrapper}>
      {showMenuButtons && (
      <View style={styles.menuRowArea}>
        <ScrollView
          ref={menuScrollRef}
          style={styles.menuRowScroll}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.menuRow}
          onScroll={event => {
            const nextX = event.nativeEvent.contentOffset.x
            menuScrollXRef.current = nextX
            updateMenuScrollAffordance(nextX)
          }}
          onLayout={event => {
            menuViewportWidthRef.current = event.nativeEvent.layout.width
            updateMenuScrollAffordance(menuScrollXRef.current)
          }}
          onContentSizeChange={width => {
            menuContentWidthRef.current = width
            updateMenuScrollAffordance(menuScrollXRef.current)
          }}
          scrollEventThrottle={16}
        >
          {menus.map(menu => {
            const isActive = activeMeal === menu.name
            const isOpen = popupMenuName === menu.name
            return (
              <TouchableOpacity
                key={menu.id}
                ref={ref => {
                  menuButtonRefs.current[menu.id] = ref
                }}
                onPress={() => openMenuCategoryPopup(menu.name, menu.id)}
                style={[
                  styles.menuButton,
                  isActive && styles.menuButtonActive,
                  isOpen && !isActive && styles.menuButtonOpen
                ]}
              activeOpacity={0.8}
            >
              <View
                style={[
                  styles.menuButtonIconWrap,
                  (isActive || isOpen) && styles.menuButtonIconWrapActive
                ]}
              >
                <UtensilsCrossed
                  size={10}
                  color={isActive || isOpen ? colors.teal : colors.label}
                />
              </View>
              <Text
                style={[
                  styles.menuButtonText,
                    (isActive || isOpen) && styles.menuButtonTextActive
                  ]}
                  numberOfLines={1}
                >
                  {menu.name}
                </Text>
              </TouchableOpacity>
            )
          })}
        </ScrollView>

        {canScrollMenusLeft && (
          <LinearGradient
            colors={[colors.card, colors.card + '00']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{
              position: 'absolute',
              left: 0,
              top: 0,
              bottom: 8,
              width: 40,
              zIndex: 4,
              pointerEvents: 'none'
            }}
          />
        )}

        {canScrollMenusRight && (
          <LinearGradient
            colors={[colors.card + '00', colors.card]}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={{
              position: 'absolute',
              right: 0,
              top: 0,
              bottom: 8,
              width: 40,
              zIndex: 4,
              pointerEvents: 'none'
            }}
          />
        )}

        {canScrollMenusLeft && (
          <TouchableOpacity
            onPress={() => {
              const nextX = Math.max(0, menuScrollXRef.current - 120)
              menuScrollRef.current?.scrollTo({ x: nextX, animated: true })
            }}
            style={[
              styles.tailButton,
              styles.leftTailButton,
              styles.menuTailButton
            ]}
            activeOpacity={0.85}
          >
            <ChevronLeft size={14} color={colors.label} />
          </TouchableOpacity>
        )}

        {canScrollMenusRight && (
          <TouchableOpacity
            onPress={() => {
              const nextX = menuScrollXRef.current + 120
              menuScrollRef.current?.scrollTo({ x: nextX, animated: true })
            }}
            style={[
              styles.tailButton,
              styles.rightTailButton,
              styles.menuTailButton
            ]}
            activeOpacity={0.85}
          >
            <ChevronRight size={14} color={colors.label} />
          </TouchableOpacity>
        )}
      </View>
      )}

      <View style={styles.controlsRow}>
        {/* Unlock session badge — only visible when manager mode is active */}
        <UnlockBadge />

        <View style={styles.categoriesArea}>
          <ScrollView
            ref={categoriesScrollRef}
            style={styles.categoriesScroll}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
            onScroll={event => {
              const nextX = event.nativeEvent.contentOffset.x
              categoriesScrollXRef.current = nextX
              updateScrollAffordance(nextX)
            }}
            onLayout={event => {
              categoriesViewportWidthRef.current =
                event.nativeEvent.layout.width
              updateScrollAffordance(categoriesScrollXRef.current)
            }}
            onContentSizeChange={width => {
              categoriesContentWidthRef.current = width
              updateScrollAffordance(categoriesScrollXRef.current)
            }}
            scrollEventThrottle={16}
          >
            {categories?.map((cat, index) => {
              const tab = typeof cat === 'string' ? cat : cat?.name
              if (!tab) return null

              const categoryId =
                typeof cat === 'string' ? `${tab}-${index}` : cat?.id || tab
              const isScheduled =
                typeof cat === 'string'
                  ? false
                  : !!(cat.schedules && cat.schedules.length > 0)
              const isNormallyAvailable =
                isCategoryAvailableNow(tab) && currentMenu
                  ? isCategoryActiveForMenu(
                      currentMenu.id,
                      typeof cat === 'string' ? tab : cat.id
                    )
                  : false
              const hasOverride = temporaryActiveCategorySet.has(tab)
              const isAvailable = isNormallyAvailable || hasOverride
              const isActive = activeCategory === tab
              const showLock = isScheduled && !isAvailable

              return (
                <TouchableOpacity
                  key={categoryId}
                  onPress={() => handleCategoryPress(tab, isAvailable)}
                  onLayout={event => {
                    categoryLayoutXRef.current[tab] = event.nativeEvent.layout.x
                  }}
                  style={[
                    styles.tab,
                    isActive && styles.tabActive,
                    showLock && !isActive && styles.tabLocked
                  ]}
                  activeOpacity={0.7}
                >
                  {showLock && (
                    <Lock
                      size={11}
                      color={hasOverride ? colors.teal : colors.muted}
                    />
                  )}
                  <Text
                    style={[
                      styles.tabText,
                      isActive && styles.tabTextActive,
                      showLock && !isActive && styles.tabTextLocked
                    ]}
                  >
                    {tab}
                  </Text>
                  {isScheduled && !isNormallyAvailable && hasOverride && (
                    <Clock size={11} color={colors.teal} />
                  )}
                </TouchableOpacity>
              )
            })}
          </ScrollView>

          {/* Left fade overlay */}
          {canScrollLeft && (
            <LinearGradient
              colors={[colors.card, colors.card + '00']}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{
                position: 'absolute',
                left: 0,
                top: 0,
                bottom: 0,
                width: 40,
                zIndex: 4,
                pointerEvents: 'none'
              }}
            />
          )}

          {/* Right fade overlay */}
          {canScrollRight && (
            <LinearGradient
              colors={[colors.card + '00', colors.card]}
              start={{ x: 0, y: 0.5 }}
              end={{ x: 1, y: 0.5 }}
              style={{
                position: 'absolute',
                right: 0,
                top: 0,
                bottom: 0,
                width: 40,
                zIndex: 4,
                pointerEvents: 'none'
              }}
            />
          )}

          {canScrollLeft && (
            <TouchableOpacity
              onPress={() => {
                const nextX = Math.max(0, categoriesScrollXRef.current - 120)
                categoriesScrollRef.current?.scrollTo({
                  x: nextX,
                  animated: true
                })
              }}
              style={[styles.tailButton, styles.leftTailButton]}
              activeOpacity={0.85}
            >
              <ChevronLeft size={14} color={colors.label} />
            </TouchableOpacity>
          )}

          {canScrollRight && (
            <TouchableOpacity
              onPress={() => {
                const nextX = categoriesScrollXRef.current + 120
                categoriesScrollRef.current?.scrollTo({
                  x: nextX,
                  animated: true
                })
              }}
              style={[styles.tailButton, styles.rightTailButton]}
              activeOpacity={0.85}
            >
              <ChevronRight size={14} color={colors.label} />
            </TouchableOpacity>
          )}
        </View>

        {rightSlot ? (
          <View style={styles.rightSlotWrap}>{rightSlot}</View>
        ) : null}
      </View>

      <Modal
        visible={!!popupMenu}
        transparent
        animationType='fade'
        onRequestClose={() => setPopupMenuName(null)}
      >
        <Pressable
          style={StyleSheet.absoluteFillObject}
          onPress={() => setPopupMenuName(null)}
        >
          <Pressable
            onPress={() => {}}
            style={[
              styles.popupCard,
              (() => {
                const screenWidth = Dimensions.get('window').width
                const cardWidth = Math.min(460, screenWidth * 0.92)
                const left = Math.max(12, Math.min(popupAnchor.x, screenWidth - cardWidth - 12))
                return {
                  top: popupAnchor.y + popupAnchor.height + 6,
                  left,
                  width: cardWidth,
                }
              })()
            ]}
          >
            <View style={styles.popupHeader}>
              <View style={{ flex: 1, paddingRight: 12 }}>
                <Text style={styles.popupTitle}>{popupMenu?.name}</Text>
                <Text style={styles.popupSubtitle}>
                  Choose a category
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPopupMenuName(null)}
                hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
                style={styles.popupCloseButton}
              >
                <X size={14} color={colors.label} />
              </TouchableOpacity>
            </View>
            <View style={styles.popupGrid}>
              {popupMenu?.categories?.map(category => {
                const isActive =
                  activeMeal === popupMenu.name &&
                  activeCategory === category.name
                return (
                  <TouchableOpacity
                    key={category.id}
                    onPress={() => {
                      onMenuCategoryChange?.(popupMenu.name, category.name)
                      if (!onMenuCategoryChange) {
                        onMealChange?.(popupMenu.name)
                        onCategoryChange(category.name)
                      }
                      setPopupMenuName(null)
                    }}
                    style={[
                      styles.popupCategory,
                      isActive && styles.popupCategoryActive
                    ]}
                    activeOpacity={0.82}
                  >
                    <Text
                      style={[
                        styles.popupCategoryText,
                        isActive && styles.popupCategoryTextActive
                      ]}
                    >
                      {category.name}
                    </Text>
                  </TouchableOpacity>
                )
              })}
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  )
}

export default React.memo(MenuControls)
