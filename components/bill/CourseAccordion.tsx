import { colors } from '@/lib/theme'
import { CartItem, OrderProfile } from '@/lib/types'
import { useCustomerSheetStore } from '@/stores/useCustomerSheetStore'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useMenuStore } from '@/stores/useMenuStore'
import { useModifierSidebarStore } from '@/stores/useModifierSidebarStore'
import { useCoursingStore } from '@/stores/useCoursingStore'
import { useOrderItem } from '@/stores/selectors/orderSelectors'
import { useOrderStore } from '@/stores/useOrderStore'
import {
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
  Flame,
  Plus,
  Send,
  X
} from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Modal,
  Pressable,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  LinearTransition,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring
} from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'
import BillItem from './BillItem'

// --- Types ---
interface CourseAccordionProps {
  activeOrder: OrderProfile | undefined
  itemCourseMap?: Record<string, number>
  sentCourses?: Record<number, boolean>
  currentCourse?: number
  onSelectCourse?: (course: number | null) => void
  onPressStartNewCourse: () => void
  onDoubleTapCourse: (courseId: number) => void
  onOpenServerSheet?: () => void
  onRushCourse?: (courseId: number) => void
  onPrioritizeCourse?: (courseId: number) => void
  onResendCourse?: (courseId: number) => void
  onRemoveCourse?: (courseId: number) => void
  enableCoursing?: boolean
  isOvertime?: boolean
  overtimeMinutes?: number
}

interface CourseGroupProps {
  orderId: string
  courseId: number
  items: CartItem[]
  isExpanded: boolean
  isSent: boolean
  isCurrent: boolean
  onToggle: (id: number) => void
  onSelect: (id: number) => void
  onDoubleTap: (id: number) => void
  onRushCourse?: (courseId: number) => void
  onPrioritizeCourse?: (courseId: number) => void
  onResendCourse?: (courseId: number) => void
  onRemoveCourse?: (courseId: number) => void
}

// --- Helpers ---
type AggregateKitchenStatus = 'sent' | 'preparing' | 'ready' | 'served' | null

const BADGE_CONFIG: Record<
  NonNullable<AggregateKitchenStatus>,
  { bg: string; text: string; label: string }
> = {
  sent: { bg: 'bg-amber-600/20', text: 'text-amber-400', label: 'Queued' },
  preparing: {
    bg: 'bg-orange-600/20',
    text: 'text-orange-400',
    label: 'Preparing'
  },
  ready: { bg: 'bg-green-600/20', text: 'text-green-400', label: 'Ready' },
  served: { bg: 'bg-emerald-900/30', text: 'text-emerald-500', label: 'Served' }
}

function deriveAggregateStatus (items: CartItem[]): AggregateKitchenStatus {
  if (items.length === 0) return null
  if (items.every(i => i.kitchen_status === 'served')) return 'served'
  if (
    items.every(
      i => i.kitchen_status === 'ready' || i.kitchen_status === 'served'
    )
  )
    return 'ready'
  if (items.some(i => i.kitchen_status === 'preparing')) return 'preparing'
  if (items.some(i => i.kitchen_status === 'sent')) return 'sent'
  return null
}

function isKitchenItemUnsent (item: CartItem): boolean {
  return !item.kitchen_status || item.kitchen_status === 'new'
}

const CourseBillItemRow = React.memo(
  function CourseBillItemRow ({
    orderId,
    itemId,
    className
  }: {
    orderId: string
    itemId: string
    className?: string
  }) {
    const item = useOrderItem(orderId, itemId)
    if (!item) return null

    return (
      <View className={className}>
        <BillItem item={item} isEditable={true} />
      </View>
    )
  }
)

// --- Sub-Component: CourseGroup with Animations ---
function CourseGroupInner ({
  orderId,
  courseId,
  items,
  isExpanded,
  isSent,
  isCurrent,
  onToggle,
  onSelect,
  onDoubleTap,
  onRushCourse,
  onPrioritizeCourse,
  onResendCourse,
  onRemoveCourse
}: CourseGroupProps) {
  const scale = useSharedValue(1)
  const [showActions, setShowActions] = useState(false)

  // Header tap animation
  const animatedHeaderStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }]
  }))

  // Gesture Definitions
  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(250)
    .onStart(() => {
      scale.value = withSequence(
        withSpring(0.95, { damping: 10, stiffness: 200 }),
        withSpring(1)
      )
      runOnJS(onDoubleTap)(courseId)
    })

  // Single tap on the body of the header → select as working course only.
  // Expansion is controlled by the dedicated chevron pressable on the right.
  const singleTap = Gesture.Tap().onEnd(() => {
    scale.value = withSequence(
      withSpring(0.98, { damping: 15, stiffness: 300 }),
      withSpring(1)
    )
    runOnJS(onSelect)(courseId)
  })

  const courseItemCount = items.reduce((sum, item) => sum + item.quantity, 0)
  const aggregateStatus = useMemo(() => deriveAggregateStatus(items), [items])
  const hasUnsentItems = useMemo(
    () => items.some(isKitchenItemUnsent),
    [items]
  )

  const longPress = Gesture.LongPress()
    .minDuration(500)
    .onStart(() => {
      if (isSent && aggregateStatus && aggregateStatus !== 'served') {
        runOnJS(setShowActions)(true)
      }
    })

  const composedGesture = Gesture.Exclusive(longPress, doubleTap, singleTap)

  return (
    <Animated.View layout={LinearTransition.duration(200)} className='mb-1'>
      {/* Header — body selects working course; chevron toggles expansion. */}
      <Animated.View
        style={animatedHeaderStyle}
        className='flex-row items-center justify-between py-3 px-2'
      >
        <GestureDetector gesture={composedGesture}>
          <Animated.View className='flex-row items-center flex-1'>
            <View
              className='w-2 h-2 rounded-full mr-2.5'
              style={{
                backgroundColor: isCurrent ? colors.success : colors.muted
              }}
            />
            <Text
              style={{ fontSize: 12, fontWeight: '700', color: colors.heading }}
            >
              Course {courseId}
            </Text>
            {aggregateStatus && (
              <View
                className={`ml-2 px-2 py-0.5 rounded ${BADGE_CONFIG[aggregateStatus].bg}`}
              >
                <Text
                  className={`text-xs font-bold ${BADGE_CONFIG[aggregateStatus].text}`}
                >
                  {BADGE_CONFIG[aggregateStatus].label}
                </Text>
              </View>
            )}
            <Text style={{ fontSize: 11, color: colors.muted, marginLeft: 6 }}>
              {courseItemCount} item{courseItemCount !== 1 ? 's' : ''}
            </Text>
          </Animated.View>
        </GestureDetector>

        <View className='flex-row items-center gap-2'>
          {!isSent && courseItemCount === 0 && courseId !== 1 && onRemoveCourse && (
            <TouchableOpacity
              onPress={() => onRemoveCourse(courseId)}
              hitSlop={8}
              style={{
                width: 24,
                height: 24,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 6
              }}
              activeOpacity={0.5}
            >
              <X size={14} color={colors.muted} />
            </TouchableOpacity>
          )}
          {hasUnsentItems && (
            <TouchableOpacity
              onPress={() => onDoubleTap(courseId)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 9,
                paddingVertical: 4,
                borderRadius: 8,
                backgroundColor: colors.teal + '18',
                borderWidth: 1,
                borderColor: colors.teal + '50'
              }}
              activeOpacity={0.6}
            >
              <Send size={13} color={colors.teal} />
              <Text
                style={{
                  color: colors.teal,
                  fontSize: 12,
                  fontWeight: '700'
                }}
              >
                Send to Kitchen
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            onPress={() => onToggle(courseId)}
            hitSlop={8}
            style={{
              width: 28,
              height: 28,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 6
            }}
            activeOpacity={0.5}
          >
            {isExpanded ? (
              <ChevronDown size={18} color={colors.label} />
            ) : (
              <ChevronRight size={18} color={colors.label} />
            )}
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Content — no enter/exit animations for instant expand */}
      {isExpanded && (
        <View className='pl-4 gap-y-2'>
          {items.map(item => (
            <CourseBillItemRow
              key={item.id}
              orderId={orderId}
              itemId={item.id}
            />
          ))}
        </View>
      )}

      {/* Long-press action menu for sent courses */}
      {showActions && (
        <Modal
          transparent
          animationType='fade'
          visible
          onRequestClose={() => setShowActions(false)}
        >
          <Pressable
            style={{
              flex: 1,
              backgroundColor: 'rgba(0,0,0,0.4)',
              justifyContent: 'center',
              alignItems: 'center'
            }}
            onPress={() => setShowActions(false)}
          >
            <View
              style={{
                backgroundColor: colors.panel,
                borderRadius: 12,
                padding: 8,
                width: 220,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 4 },
                shadowOpacity: 0.3,
                shadowRadius: 8,
                elevation: 8
              }}
            >
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '700',
                  color: colors.heading,
                  paddingHorizontal: 12,
                  paddingVertical: 6
                }}
              >
                Course {courseId} Actions
              </Text>
              {onRushCourse && (
                <TouchableOpacity
                  onPress={() => {
                    setShowActions(false)
                    onRushCourse(courseId)
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 8
                  }}
                  activeOpacity={0.7}
                >
                  <Flame size={16} color={colors.danger} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: colors.danger
                    }}
                  >
                    Rush Course
                  </Text>
                </TouchableOpacity>
              )}
              {onPrioritizeCourse && (
                <TouchableOpacity
                  onPress={() => {
                    setShowActions(false)
                    onPrioritizeCourse(courseId)
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 8
                  }}
                  activeOpacity={0.7}
                >
                  <ArrowUpToLine size={16} color='#f59e0b' />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: '#f59e0b'
                    }}
                  >
                    Prioritize Course
                  </Text>
                </TouchableOpacity>
              )}
              {onResendCourse && (
                <TouchableOpacity
                  onPress={() => {
                    setShowActions(false)
                    onResendCourse(courseId)
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 10,
                    paddingHorizontal: 12,
                    paddingVertical: 10,
                    borderRadius: 8
                  }}
                  activeOpacity={0.7}
                >
                  <Send size={16} color={colors.teal} />
                  <Text
                    style={{
                      fontSize: 13,
                      fontWeight: '600',
                      color: colors.teal
                    }}
                  >
                    Resend Course
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          </Pressable>
        </Modal>
      )}
    </Animated.View>
  )
}

const CourseGroup = React.memo(CourseGroupInner, (prev, next) => {
  if (prev.orderId !== next.orderId) return false
  if (prev.courseId !== next.courseId) return false
  if (prev.isExpanded !== next.isExpanded) return false
  if (prev.isSent !== next.isSent) return false
  if (prev.isCurrent !== next.isCurrent) return false
  if (prev.onToggle !== next.onToggle) return false
  if (prev.onSelect !== next.onSelect) return false
  if (prev.onDoubleTap !== next.onDoubleTap) return false
  if (prev.onRushCourse !== next.onRushCourse) return false
  if (prev.onPrioritizeCourse !== next.onPrioritizeCourse) return false
  if (prev.onResendCourse !== next.onResendCourse) return false
  if (prev.onRemoveCourse !== next.onRemoveCourse) return false
  if (prev.items.length !== next.items.length) return false
  for (let i = 0; i < prev.items.length; i++) {
    const p = prev.items[i]
    const n = next.items[i]
    if (
      p.id !== n.id ||
      p.quantity !== n.quantity ||
      p.is_voided !== n.is_voided ||
      p.kitchen_status !== n.kitchen_status ||
      p.price !== n.price ||
      p.customizations !== n.customizations
    )
      return false
  }
  return true
})

// --- Main Component ---
const CourseAccordion: React.FC<CourseAccordionProps> = ({
  activeOrder,
  itemCourseMap,
  sentCourses,
  currentCourse,
  onSelectCourse,
  onPressStartNewCourse,
  onDoubleTapCourse,
  onOpenServerSheet,
  onRushCourse,
  onPrioritizeCourse,
  onResendCourse,
  onRemoveCourse,
  enableCoursing = true,
  isOvertime,
  overtimeMinutes
}) => {
  const [expandedCourseIds, setExpandedCourseIds] = useState<Set<number>>(
    new Set()
  )
  const prevItemCount = useRef<number>(0)
  // Narrow selectors — subscribe only to the specific fields we display, not the whole order
  const orderMeta = useOrderStore(
    useShallow(s => {
      const o = s.activeOrderId ? s.ordersById[s.activeOrderId] : null
      return {
        serviceLocationId: o?.service_location_id ?? null,
        guestCount: o?.guest_count ?? 0,
        serverName: o?.server_name ?? null,
        customerName: o?.customer_name ?? null,
        displayNumber: o?.display_number ?? null,
        orderNumber: o?.order_number ?? null,
        dbOrderId: o?.db_order_id ?? null
      }
    })
  )
  const openCustomerSheet = useCustomerSheetStore(s => s.openSheet)
  const tableName = useFloorPlanStore(s => {
    const locId = orderMeta.serviceLocationId
    if (!locId) return null
    return s.tablesById[locId]?.name ?? locId
  })

  // Group items by course — recalculates when grouping changes OR item content changes
  const groupedItems = useMemo(() => {
    const groups: Record<number, CartItem[]> = {}
    activeOrder?.items?.forEach(item => {
      if (item.is_voided) return
      const course = item.courseNumber ?? itemCourseMap?.[item.id] ?? 1
      if (!groups[course]) {
        groups[course] = []
      }
      groups[course].push(item)
    })
    // Stable sort within each course so broadcast re-ordering doesn't cause visual jumps
    Object.values(groups).forEach(arr => {
      arr.sort((a, b) => {
        const ka = a.db_order_item_id ?? a.id
        const kb = b.db_order_item_id ?? b.id
        return ka < kb ? -1 : ka > kb ? 1 : 0
      })
    })
    return groups
  }, [activeOrder?.items, itemCourseMap])

  // Flat (no-coursing) item list — same filter + sort as groupedItems.
  // Used when enableCoursing=false so the bill renders without any course header.
  // Depend on activeOrder.items so discount/subtotal-only updates render immediately.
  const flatItems = useMemo(() => {
    const items = (activeOrder?.items ?? []).filter(i => !i.is_voided)
    items.sort((a, b) => {
      const ka = a.db_order_item_id ?? a.id
      const kb = b.db_order_item_id ?? b.id
      return ka < kb ? -1 : ka > kb ? 1 : 0
    })
    return items
  }, [activeOrder?.items])

  // All course numbers tracked in the coursing store (includes empty open
  // courses created via "New Course" that don't yet have items). Without this,
  // tapping a previous course to set it as working would drop empty headers
  // from the visible set.
  const storeCourseNumbers = useCoursingStore(
    useShallow(s => {
      const oid = activeOrder?.id
      if (!oid) return [] as number[]
      const o = s.byOrderId[oid]
      if (!o) return [] as number[]
      return Object.keys(o.courses).map(Number)
    })
  )

  // Sort course keys
  const sortedCourses = useMemo(() => {
    const coursesFromItems = Object.keys(groupedItems).map(Number)
    const allCourses = new Set<number>(coursesFromItems)

    for (const n of storeCourseNumbers) allCourses.add(n)

    if (activeOrder && currentCourse !== undefined && currentCourse !== null) {
      allCourses.add(currentCourse)
    }

    return Array.from(allCourses).sort((a, b) => a - b)
  }, [groupedItems, activeOrder, currentCourse, storeCourseNumbers])

  // Track previous values to prevent re-triggering
  const prevCurrentCourse = useRef<number | undefined>(currentCourse)

  // Auto-expand logic: When items are added, expand the current/working course
  useEffect(() => {
    const currentItemCount = activeOrder?.items?.length ?? 0

    // Only auto-expand when items are ADDED (count increased)
    if (
      currentItemCount > prevItemCount.current &&
      currentCourse !== undefined
    ) {
      setExpandedCourseIds(prev => {
        if (prev.has(currentCourse)) return prev
        const next = new Set(prev)
        next.add(currentCourse)
        return next
      })
    }

    prevItemCount.current = currentItemCount
  }, [activeOrder?.items?.length, currentCourse])

  // Also auto-expand when currentCourse changes (e.g., "Start New Course")
  useEffect(() => {
    if (
      currentCourse !== undefined &&
      currentCourse !== null &&
      currentCourse !== prevCurrentCourse.current
    ) {
      setExpandedCourseIds(prev => {
        if (prev.has(currentCourse)) return prev
        const next = new Set(prev)
        next.add(currentCourse)
        return next
      })
      prevCurrentCourse.current = currentCourse
    }
  }, [currentCourse])

  const onSelectCourseRef = useRef(onSelectCourse)
  onSelectCourseRef.current = onSelectCourse

  // Toggle expansion only. Selecting a working course is now a separate
  // action wired to handleSelectCourseTap (chevron taps don't change the
  // working course).
  const handleToggleCourse = useCallback((courseId: number) => {
    setExpandedCourseIds(prev => {
      const next = new Set(prev)
      if (next.has(courseId)) {
        next.delete(courseId)
      } else {
        next.add(courseId)
      }
      return next
    })
  }, [])

  // Tap on the header body: select as working course without toggling expansion.
  const handleSelectCourseTap = useCallback((courseId: number) => {
    queueMicrotask(() => onSelectCourseRef.current?.(courseId))
  }, [])

  // Pre-warm modifier cache for ALL items regardless of accordion state.
  // BillItem's own preWarm only fires when mounted (expanded). This ensures
  // the cache is warm before the user taps any course → item.
  const allItemIdsKey = useMemo(
    () =>
      Array.from(
        new Set(
          (activeOrder?.items ?? []).map(i => i.menuItemId).filter(Boolean)
        )
      ).join(','),
    [activeOrder?.items]
  )
  useEffect(() => {
    const allItemIds = allItemIdsKey ? allItemIdsKey.split(',') : []
    if (allItemIds.length === 0) return
    const handle = setTimeout(() => {
      const store = useModifierSidebarStore.getState()
      const menuStore = useMenuStore.getState()
      for (const menuItemId of allItemIds) {
        const menuItem = menuStore.getMenuItemById(menuItemId)
        if (menuItem?.modifierGroupIds?.length) {
          store.preWarm(menuItem)
        }
      }
    }, 50) // slight delay to not block initial render
    return () => clearTimeout(handle)
  }, [allItemIdsKey])

  if (!activeOrder) {
    return (
      <View className='flex-1 items-center justify-center'>
        <Text style={{ fontSize: 12, color: colors.muted }}>
          No active order.
        </Text>
      </View>
    )
  }

  const Dot = () => (
    <Text style={{ fontSize: 10, color: colors.muted, marginHorizontal: 3 }}>
      ·
    </Text>
  )
  const guestCount = orderMeta.guestCount

  return (
    <View
      className='flex-1'
      style={{ backgroundColor: colors.panel, padding: 16 }}
    >
      {/* Meta info row */}
      <View
        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}
      >
        {tableName && (
          <Text
            style={{ fontSize: 10, fontWeight: '600', color: colors.label }}
          >
            {tableName}
          </Text>
        )}
        <Dot />
        <Text style={{ fontSize: 10, color: colors.muted }}>
          {guestCount || 1} guest{(guestCount || 1) !== 1 ? 's' : ''}
        </Text>
        <Dot />
        <TouchableOpacity
          onPress={onOpenServerSheet}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text
            style={{
              fontSize: 10,
              color: orderMeta.serverName ? colors.muted : colors.teal
            }}
          >
            {orderMeta.serverName || 'Assign server'}
          </Text>
        </TouchableOpacity>
        <Dot />
        <TouchableOpacity
          onPress={openCustomerSheet}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          <Text
            style={{
              fontSize: 10,
              color: orderMeta.customerName ? colors.muted : colors.teal
            }}
          >
            {orderMeta.customerName || 'Add customer'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Main Header */}
      <View className='flex-row items-center justify-between pb-3 mb-2'>
        <Text
          style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}
        >
          Order{' '}
          {orderMeta.displayNumber
            ? orderMeta.displayNumber.startsWith('#')
              ? orderMeta.displayNumber
              : `#${orderMeta.displayNumber}`
            : orderMeta.orderNumber
            ? `#${orderMeta.orderNumber}`
            : orderMeta.dbOrderId
            ? `#${orderMeta.dbOrderId.substring(0, 8)}`
            : ''}
        </Text>
        <View className='flex-row items-center gap-2'>
          {isOvertime && (
            <View
              style={{
                backgroundColor: colors.warning + '30',
                paddingHorizontal: 10,
                paddingVertical: 4,
                borderRadius: 999
              }}
            >
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '600',
                  color: colors.warning
                }}
              >
                {overtimeMinutes}min exceeded
              </Text>
            </View>
          )}
          {enableCoursing && (
            <TouchableOpacity
              onPress={onPressStartNewCourse}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                paddingHorizontal: 12,
                paddingVertical: 6,
                borderRadius: 8,
                borderWidth: 1,
                borderColor: colors.teal
              }}
              activeOpacity={0.8}
            >
              <Plus size={16} color={colors.teal} />
              <Text
                style={{ fontSize: 11, fontWeight: '600', color: colors.teal }}
              >
                New Course
              </Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false}>
        <Animated.View layout={LinearTransition.duration(250)}>
          {enableCoursing ? (
            sortedCourses.length > 0 ? (
              sortedCourses.map(courseId => (
                <CourseGroup
                  key={`course-${courseId}`}
                  orderId={activeOrder.id}
                  courseId={courseId}
                  items={groupedItems[courseId] || []}
                  isExpanded={expandedCourseIds.has(courseId)}
                  isSent={!!sentCourses?.[courseId]}
                  isCurrent={currentCourse === courseId}
                  onToggle={handleToggleCourse}
                  onSelect={handleSelectCourseTap}
                  onDoubleTap={onDoubleTapCourse}
                  onRushCourse={onRushCourse}
                  onPrioritizeCourse={onPrioritizeCourse}
                  onResendCourse={onResendCourse}
                  onRemoveCourse={onRemoveCourse}
                />
              ))
            ) : (
              <View className='flex-1 items-center justify-center mt-10'>
                <Text style={{ fontSize: 12, color: colors.muted }}>
                  Add items to start an order.
                </Text>
              </View>
            )
          ) : flatItems.length > 0 ? (
            <View className='gap-y-2'>
              {flatItems.map(item => (
                <CourseBillItemRow
                  key={item.id}
                  orderId={activeOrder.id}
                  itemId={item.id}
                  className='overflow-hidden'
                />
              ))}
            </View>
          ) : (
            <View className='flex-1 items-center justify-center mt-10'>
              <Text style={{ fontSize: 12, color: colors.muted }}>
                Add items to start an order.
              </Text>
            </View>
          )}
        </Animated.View>
      </ScrollView>
    </View>
  )
}

export default CourseAccordion
