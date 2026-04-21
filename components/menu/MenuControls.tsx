import { colors } from '@/lib/theme'
import { useColorScheme } from '@/lib/useColorScheme'
import { useMenuStore } from '@/stores/useMenuStore'
import { usePinOverrideStore } from '@/stores/usePinOverrideStore'
import {
  ChevronLeft,
  ChevronRight,
  Clock,
  Lock,
  ShieldCheck,
  X
} from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native'

interface MenuControlsProps {
  activeMeal: string
  onMealChange?: (meal: string) => void
  activeCategory: string
  onCategoryChange: (category: string) => void
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
      paddingHorizontal: 28,
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
      backgroundColor: `${colors.teal}18`,
      borderColor: `${colors.teal}30`
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
      color: colors.teal,
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
    rightSlotWrap: {
      marginLeft: 6,
      flexShrink: 0
    }
  })

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
  activeCategory,
  onCategoryChange,
  rightSlot
}) => {
  const { colorScheme } = useColorScheme()
  const styles = useMemo(() => createStyles(), [colorScheme])
  const menus = useMenuStore(s => s.menus)
  const isCategoryAvailableNow = useMenuStore(s => s.isCategoryAvailableNow)
  const isCategoryActiveForMenu = useMenuStore(s => s.isCategoryActiveForMenu)
  const temporaryActiveCategories = useMenuStore(
    s => s.temporaryActiveCategories
  )
  const addTemporaryCategoryAccess = useMenuStore(
    s => s.addTemporaryCategoryAccess
  )
  const { requestPinOverride, isUnlocked } = usePinOverrideStore()
  const categoriesScrollRef = useRef<ScrollView>(null)
  const categoriesScrollXRef = useRef(0)
  const categoriesViewportWidthRef = useRef(0)
  const categoriesContentWidthRef = useRef(0)
  const [canScrollLeft, setCanScrollLeft] = useState(false)
  const [canScrollRight, setCanScrollRight] = useState(false)

  const updateScrollAffordance = useCallback((offsetX: number) => {
    const maxOffset = Math.max(
      0,
      categoriesContentWidthRef.current - categoriesViewportWidthRef.current
    )
    setCanScrollLeft(offsetX > 2)
    setCanScrollRight(offsetX < maxOffset - 2)
  }, [])

  const currentMenu = useMemo(
    () => menus.find(m => m.name === activeMeal),
    [menus, activeMeal]
  )
  const categories = currentMenu?.categories

  useEffect(() => {
    if (!__DEV__) return
    console.log('[MenuControls] resolve categories', {
      activeMeal,
      foundMenu: !!currentMenu,
      currentMenuId: currentMenu?.id,
      categoryCount: categories?.length ?? 0,
      categories: (categories || []).map(c => c.name)
    })
  }, [activeMeal, currentMenu?.id, categories?.length])

  const handleCategoryPress = useCallback(
    (tab: string, isAvailable: boolean) => {
      if (__DEV__) {
        console.log('[MenuControls] handleCategoryPress', {
          tab,
          isAvailable,
          activeMeal,
          currentMenuId: currentMenu?.id
        })
      }
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
      addTemporaryCategoryAccess,
      activeMeal,
      currentMenu?.id
    ]
  )

  return (
    <View style={styles.wrapper}>
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
            {categories?.map(cat => {
              const tab = cat.name
              const isScheduled = cat.schedules && cat.schedules.length > 0
              const isNormallyAvailable =
                isCategoryAvailableNow(tab) && currentMenu
                  ? isCategoryActiveForMenu(currentMenu.id, cat.id)
                  : false
              const hasOverride = temporaryActiveCategories.includes(tab)
              const isAvailable = isNormallyAvailable || hasOverride
              const isActive = activeCategory === tab
              const showLock = isScheduled && !isAvailable

              return (
                <TouchableOpacity
                  key={cat.id || tab}
                  onPress={() => handleCategoryPress(tab, isAvailable)}
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
    </View>
  )
}

export default React.memo(MenuControls)
