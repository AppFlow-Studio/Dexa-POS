import { iosOnly } from '@/lib/safeAnimations'
import { colors } from '@/lib/theme'
import { CartItem } from '@/lib/types'
import React, { useEffect, useMemo, useRef } from 'react'
import { ScrollView, Text, View } from 'react-native'
import Animated, { FadeInDown, LinearTransition } from 'react-native-reanimated'
import BillItem from './BillItem'

interface BillSummaryProps {
  cart: CartItem[]
  expandedItemId?: string | null
  onToggleExpand?: (itemId: string) => void
  currentCourse?: number
  itemCourseMap?: Record<string, number>
  sentCourses?: Record<number, boolean>
}

const BillSummaryComponent: React.FC<BillSummaryProps> = ({
  cart,
  expandedItemId,
  onToggleExpand,
  currentCourse,
  itemCourseMap,
  sentCourses
}) => {
  // 1. Create a ref for the ScrollView
  const scrollViewRef = useRef<ScrollView>(null)

  // 2. useEffect to scroll to bottom when cart items change
  useEffect(() => {
    if (cart.length > 0) {
      // OPTIMIZED: Use requestAnimationFrame instead of 100ms setTimeout
      // This waits for the next frame (16ms max) instead of fixed 100ms delay
      requestAnimationFrame(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true })
      })
    }
  }, [cart.length])

  // OPTIMIZED: Pre-compute grouped courses outside render for O(1) lookup
  const groupedCourses = useMemo(() => {
    const grouped: Record<number, CartItem[]> = {}
    cart.forEach(item => {
      const course = itemCourseMap?.[item.id] ?? 1
      if (!grouped[course]) grouped[course] = []
      grouped[course].push(item)
    })
    return Object.keys(grouped)
      .map(Number)
      .sort((a, b) => a - b)
      .map(course => ({ course, items: grouped[course] }))
  }, [cart, itemCourseMap])

  return (
    <View className='flex-1' style={{ backgroundColor: colors.screen }}>
      <View className='px-3 h-full'>
        <View className='flex-1 h-full w-full'>
          <ScrollView
            ref={scrollViewRef}
            showsVerticalScrollIndicator={true}
            className='flex-1 h-full my-1'
            style={{ backgroundColor: colors.screen }}
            contentContainerStyle={{ backgroundColor: colors.screen }}
            nestedScrollEnabled={true}
          >
            {cart.length > 0 ? (
              <View>
                {groupedCourses.map(({ course, items }) => {
                  const isCourseActive =
                    currentCourse !== undefined && course === currentCourse
                  return (
                    <View key={`course-${course}`} className='mb-3'>
                      {items.map((item, index) => {
                        return (
                          <Animated.View
                            key={item.id}
                            entering={iosOnly(FadeInDown.duration(200))}
                            layout={LinearTransition.duration(200)}
                            className={`rounded-xl mb-1 ${
                              isCourseActive ? 'border border-blue-500' : ''
                            }`}
                          >
                            <BillItem
                              item={item}
                              isEditable={true}
                              showPaidBadge={true}
                            />
                          </Animated.View>
                        )
                      })}
                    </View>
                  )
                })}
              </View>
            ) : (
              <View className='h-full items-center justify-center'>
                <Text style={{ fontSize: 20, color: colors.muted }}>
                  Order is empty.
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </View>
  )
}

// OPTIMIZED: Memoize to prevent re-renders when parent updates
const BillSummary = React.memo(BillSummaryComponent, (prev, next) => {
  // Return true if props are equal (skip re-render)
  return (
    prev.cart === next.cart &&
    prev.expandedItemId === next.expandedItemId &&
    prev.currentCourse === next.currentCourse &&
    prev.itemCourseMap === next.itemCourseMap &&
    prev.sentCourses === next.sentCourses
  )
})

export default BillSummary
