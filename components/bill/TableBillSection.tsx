import ReadOnlyBanner from '@/components/order/ReadOnlyBanner'
import { isOrderReadOnly } from '@/lib/orderAccessControl'
import { colors } from '@/lib/theme'
import { CartItem, OrderProfile } from '@/lib/types'
import { useOrderItem } from '@/stores/selectors/orderSelectors'
import { useOrderStore } from '@/stores/useOrderStore'
import { BottomSheetMethods } from '@gorhom/bottom-sheet/lib/typescript/types'
import {
  ArrowUpToLine,
  ChevronDown,
  ChevronRight,
  Flame,
  Plus,
  Printer,
  Send,
  Users,
  X
} from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  FlatList,
  Modal,
  Pressable,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import BillItem from './BillItem'
import BottomActionBar from './BottomActionBar'
import CourseAccordion from './CourseAccordion'
import DiscountBottomSheet from './DiscountBottomSheet'
import PricingBreakdownSheet from './PricingBreakdownSheet'

// ============================================================================
// Helpers
// ============================================================================

type AggregateKitchenStatus = 'sent' | 'preparing' | 'ready' | null

const STATUS_BADGE: Record<
  NonNullable<AggregateKitchenStatus>,
  { label: string; color: string }
> = {
  sent: { label: 'Queued', color: colors.orderPreparing },
  preparing: { label: 'Preparing', color: colors.paymentPartialRefund },
  ready: { label: 'Ready', color: colors.orderReady }
}

function deriveAggregateStatus (items: CartItem[]): AggregateKitchenStatus {
  const active = items.filter(i => !i.is_voided)
  if (active.length === 0) return null
  if (
    active.every(
      i => i.kitchen_status === 'ready' || i.kitchen_status === 'served'
    )
  )
    return 'ready'
  if (active.some(i => i.kitchen_status === 'preparing')) return 'preparing'
  if (active.some(i => i.kitchen_status === 'sent')) return 'sent'
  return null
}

function isSentToKitchen (item: CartItem): boolean {
  return !!item.kitchen_status && item.kitchen_status !== 'new'
}

const DenseBillItemRow = React.memo(
  function DenseBillItemRow ({
    orderId,
    itemId,
    isSent,
    hasUnsentItems,
    indentLeft,
    enableCoursing,
    orderHasPayments,
    orderPayments
  }: {
    orderId: string
    itemId: string
    isSent: boolean
    hasUnsentItems: boolean
    indentLeft: number
    enableCoursing: boolean
    orderHasPayments: boolean
    orderPayments: OrderProfile['payments'] | null
  }) {
    const item = useOrderItem(orderId, itemId)
    if (!item) return null

    return (
      <View
        style={{
          paddingLeft: indentLeft,
          paddingRight: 4,
          paddingVertical: enableCoursing ? 2 : 3,
          opacity: enableCoursing && isSent ? 0.55 : 1
        }}
      >
        <BillItem
          item={item}
          isEditable={!isSent}
          orderHasPayments={orderHasPayments}
          payments={orderPayments}
        />
      </View>
    )
  }
)

const StatusPill = React.memo(
  ({ status }: { status: AggregateKitchenStatus }) => {
    if (!status) return null
    const cfg = STATUS_BADGE[status]
    return (
      <View
        style={{
          paddingHorizontal: 6,
          paddingVertical: 2,
          borderRadius: 4,
          backgroundColor: cfg.color + '20'
        }}
      >
        <Text style={{ fontSize: 9, fontWeight: '700', color: cfg.color }}>
          {cfg.label}
        </Text>
      </View>
    )
  }
)

// ============================================================================
// KitchenTimer — shows elapsed minutes since course was sent (30s refresh)
// ============================================================================

const KitchenTimer = React.memo(({ sentAt }: { sentAt: number }) => {
  const [elapsed, setElapsed] = useState(() =>
    Math.floor((Date.now() - sentAt) / 60000)
  )

  useEffect(() => {
    const interval = setInterval(() => {
      setElapsed(Math.floor((Date.now() - sentAt) / 60000))
    }, 30_000)
    return () => clearInterval(interval)
  }, [sentAt])

  if (elapsed < 1) return null
  return (
    <Text style={{ fontSize: 9, fontWeight: '600', color: colors.muted }}>
      · {elapsed}m
    </Text>
  )
})

// ============================================================================
// Collapsible Seat Header
// ============================================================================

const SeatHeader = React.memo(
  ({
    label,
    itemCount,
    total,
    isCurrent,
    expanded,
    onPress
  }: {
    label: string
    itemCount: number
    total: number
    isCurrent: boolean
    expanded: boolean
    onPress?: () => void
  }) => (
    <TouchableOpacity
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      style={{
        height: 34,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 10,
        marginTop: 6,
        backgroundColor: isCurrent ? colors.teal + '12' : colors.card + '80',
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        borderTopWidth: 1,
        borderTopColor: colors.border + '60'
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <View
          style={{
            width: 6,
            height: 6,
            borderRadius: 3,
            backgroundColor: isCurrent ? colors.teal : colors.muted
          }}
        />
        <Text
          style={{
            fontSize: 12,
            fontWeight: '800',
            color: colors.heading,
            letterSpacing: 0.2
          }}
        >
          {label}
        </Text>
        <Text style={{ fontSize: 10, color: colors.muted }}>
          · {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Text style={{ fontSize: 12, fontWeight: '800', color: colors.teal }}>
          ${total.toFixed(2)}
        </Text>
        {expanded ? (
          <ChevronDown size={14} color={colors.label} />
        ) : (
          <ChevronRight size={14} color={colors.label} />
        )}
      </View>
    </TouchableOpacity>
  )
)

// ============================================================================
// Dense Course Sub-header (24px, indented under seat)
// ============================================================================

const CourseSubHeader = React.memo(
  ({
    course,
    itemCount,
    isSent,
    hasUnsentItems,
    isCurrentCourse,
    expanded,
    status,
    sentAt,
    onPress,
    onSend,
    onLongPress,
    onRemove
  }: {
    course: number
    itemCount: number
    isSent: boolean
    hasUnsentItems: boolean
    isCurrentCourse: boolean
    expanded: boolean
    status: AggregateKitchenStatus
    sentAt?: number
    onPress?: () => void
    onSend?: () => void
    onLongPress?: () => void
    onRemove?: () => void
  }) => (
    <TouchableOpacity
      activeOpacity={0.7}
      onPress={onPress}
      onLongPress={onLongPress}
      style={{
        height: 26,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingLeft: 22,
        paddingRight: 10,
        marginTop: 2
      }}
    >
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        <View
          style={{
            width: 4,
            height: 4,
            borderRadius: 2,
            backgroundColor: isCurrentCourse ? colors.success : colors.muted
          }}
        />
        <Text style={{ fontSize: 10, fontWeight: '600', color: colors.label }}>
          Course {course}
        </Text>
        <StatusPill status={status} />
        {sentAt && status && <KitchenTimer sentAt={sentAt} />}
        <Text style={{ fontSize: 9, color: colors.muted }}>
          {itemCount} {itemCount === 1 ? 'item' : 'items'}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
        {!isSent && itemCount === 0 && course !== 1 && onRemove && (
          <TouchableOpacity
            onPress={e => {
              e.stopPropagation()
              onRemove()
            }}
            hitSlop={6}
            style={{
              width: 18,
              height: 18,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 4
            }}
            activeOpacity={0.5}
          >
            <X size={11} color={colors.muted} />
          </TouchableOpacity>
        )}
        {hasUnsentItems && onSend && (
          <TouchableOpacity
            onPress={e => {
              e.stopPropagation()
              onSend()
            }}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              height: 24,
              borderRadius: 6,
              backgroundColor: colors.teal
            }}
            activeOpacity={0.8}
          >
            <Printer size={11} color={colors.onSolid} />
            <Text
              style={{ color: colors.onSolid, fontSize: 11, fontWeight: '600' }}
            >
              Send
            </Text>
          </TouchableOpacity>
        )}
        {expanded ? (
          <ChevronDown size={12} color={colors.label} />
        ) : (
          <ChevronRight size={12} color={colors.label} />
        )}
      </View>
    </TouchableOpacity>
  )
)

type SeatListRow =
  | {
      id: string
      type: 'empty'
    }
  | {
      id: string
      type: 'seat-header'
      seatKey: string | number
      seatNumber: number | null
      label: string
      isCurrent: boolean
      expanded: boolean
      itemCount: number
      total: number
    }
  | {
      id: string
      type: 'course-header'
      seatKey: string | number
      course: number
      itemCount: number
      isSent: boolean
      hasUnsentItems: boolean
      isCurrentCourse: boolean
      expanded: boolean
      status: AggregateKitchenStatus
    }
  | {
      id: string
      type: 'item'
      itemId: string
      isSent: boolean
      hasUnsentItems: boolean
      indentLeft: number
      seatKey?: string | number
      courseKey?: string
    }

// ============================================================================
// DenseSeatView — collapsible seats & courses, supports optional coursing
// ============================================================================

const DenseSeatView = React.memo(
  ({
    activeOrder,
    itemSeatMap,
    itemCourseMap,
    sentCourses,
    courseSentAtMap,
    currentCourse,
    activeSeat,
    seatCount,
    onSelectSeat,
    onSelectCourse,
    onPressStartNewCourse,
    onDoubleTapCourse,
    onRushCourse,
    onPrioritizeCourse,
    onResendCourse,
    onRemoveCourse,
    onPressSendAllToKitchen,
    enableCoursing = false,
    isOvertime,
    overtimeMinutes
  }: {
    activeOrder: OrderProfile | undefined
    itemSeatMap?: Record<string, number | null>
    itemCourseMap?: Record<string, number>
    sentCourses?: Record<number, boolean>
    courseSentAtMap?: Record<number, number>
    currentCourse?: number
    activeSeat?: number | null
    seatCount: number
    onSelectSeat?: (seat: number | null) => void
    onSelectCourse?: (course: number | null) => void
    onPressStartNewCourse?: () => void
    onDoubleTapCourse?: (courseId: number) => void
    onRushCourse?: (courseId: number) => void
    onPrioritizeCourse?: (courseId: number) => void
    onResendCourse?: (courseId: number) => void
    onRemoveCourse?: (courseId: number) => void
    onPressSendAllToKitchen?: () => void
    enableCoursing?: boolean
    isOvertime?: boolean
    overtimeMinutes?: number
  }) => {
    const [actionCourse, setActionCourse] = useState<number | null>(null)
    const [collapsedSeats, setCollapsedSeats] = useState<Set<string | number>>(
      new Set()
    )
    const [collapsedCourses, setCollapsedCourses] = useState<Set<string>>(
      new Set()
    )

    const toggleSeat = useCallback((seatKey: string | number) => {
      setCollapsedSeats(prev => {
        const next = new Set(prev)
        if (next.has(seatKey)) next.delete(seatKey)
        else next.add(seatKey)
        return next
      })
    }, [])

    const toggleCourse = useCallback(
      (seatKey: string | number, course: number) => {
        const key = `${seatKey}-${course}`
        setCollapsedCourses(prev => {
          const next = new Set(prev)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        })
      },
      []
    )

    // Group items: seat -> course -> items
    const { seatGroups, sortedSeatKeys } = useMemo(() => {
      const groups: Record<string, Record<number, CartItem[]>> = {}

      activeOrder?.items?.forEach(item => {
        const seat = item.seatNumber ?? itemSeatMap?.[item.id] ?? null
        const course = enableCoursing
          ? item.courseNumber ?? itemCourseMap?.[item.id] ?? 1
          : 1
        const seatKey = seat === null ? 'shared' : String(seat)

        if (!groups[seatKey]) groups[seatKey] = {}
        if (!groups[seatKey][course]) groups[seatKey][course] = []
        groups[seatKey][course].push(item)
      })

      // Sorted seat keys: numbered first, shared last
      const numbered = Object.keys(groups)
        .filter(k => k !== 'shared')
        .map(Number)
        .sort((a, b) => a - b)

      const allSeats = new Set(numbered)
      for (let i = 1; i <= seatCount; i++) allSeats.add(i)

      const keys: (number | 'shared')[] = Array.from(allSeats).sort(
        (a, b) => a - b
      )
      if (groups['shared'] && Object.keys(groups['shared']).length > 0) {
        keys.push('shared')
      }

      return { seatGroups: groups, sortedSeatKeys: keys }
    }, [
      activeOrder?.items,
      itemSeatMap,
      itemCourseMap,
      seatCount,
      enableCoursing
    ])

    const handleCourseAction = useCallback(
      (action: 'rush' | 'prioritize' | 'resend') => {
        if (actionCourse === null) return
        const c = actionCourse
        setActionCourse(null)
        if (action === 'rush') onRushCourse?.(c)
        else if (action === 'prioritize') onPrioritizeCourse?.(c)
        else if (action === 'resend') onResendCourse?.(c)
      },
      [actionCourse, onRushCourse, onPrioritizeCourse, onResendCourse]
    )

    const orderPayments = activeOrder?.payments ?? null
    const orderHasPayments = !!orderPayments?.some(payment => !payment.isVoided)
    const activeOrderId = activeOrder?.id ?? null
    const activeOrderItemCount = activeOrder?.items?.length ?? 0

    // Memo 1: Structure — expensive grouping, only recomputes when items/seats/courses change
    const structuredRows = useMemo<SeatListRow[]>(() => {
      if (!activeOrderId) return []
      if (!activeOrderItemCount) {
        return [{ id: 'empty-order', type: 'empty' }]
      }

      const nextRows: SeatListRow[] = []

      sortedSeatKeys.forEach(seatKey => {
        const seatNumber = seatKey === 'shared' ? null : (seatKey as number)
        const label = seatKey === 'shared' ? 'Shared' : `Seat ${seatKey}`
        const courseGroups =
          seatGroups[seatKey === 'shared' ? 'shared' : String(seatKey)] || {}
        const sortedCourses = Object.keys(courseGroups)
          .map(Number)
          .sort((a, b) => a - b)

        const allItems = sortedCourses.flatMap(
          course => courseGroups[course] || []
        )
        const nonVoided = allItems.filter(item => !item.is_voided)
        const seatTotal = nonVoided.reduce(
          (sum, item) => sum + item.price * item.quantity,
          0
        )
        const seatItemCount = nonVoided.reduce(
          (sum, item) => sum + item.quantity,
          0
        )

        nextRows.push({
          id: `seat-${seatKey}`,
          type: 'seat-header',
          seatKey,
          seatNumber,
          label,
          isCurrent: false, // set in visibility pass
          expanded: true, // set in visibility pass
          itemCount: seatItemCount,
          total: seatTotal
        })

        if (enableCoursing) {
          sortedCourses.forEach(course => {
            const items = courseGroups[course] || []
            const courseNonVoided = items.filter(item => !item.is_voided)
            const courseItemCount = courseNonVoided.reduce(
              (sum, item) => sum + item.quantity,
              0
            )
            const isSent = !!sentCourses?.[course]
            const hasUnsentItems = courseNonVoided.some(
              item => !isSentToKitchen(item)
            )
            const isCurrentCourse = currentCourse === course

            nextRows.push({
              id: `course-${seatKey}-${course}`,
              type: 'course-header',
              seatKey,
              course,
              itemCount: courseItemCount,
              isSent,
              hasUnsentItems,
              isCurrentCourse,
              expanded: true, // set in visibility pass
              status: deriveAggregateStatus(items)
            })

            items.forEach(item => {
              nextRows.push({
                id: `item-${item.id}`,
                type: 'item',
                itemId: item.id,
                isSent: isSentToKitchen(item) && !item.is_voided,
                hasUnsentItems,
                indentLeft: 14,
                seatKey,
                courseKey: `${seatKey}-${course}`
              })
            })
          })
          return
        }

        const seatHasUnsentItems = allItems.some(item => !isSentToKitchen(item) && !item.is_voided)
        allItems.forEach(item => {
          nextRows.push({
            id: `item-${item.id}`,
            type: 'item',
            itemId: item.id,
            isSent: isSentToKitchen(item) && !item.is_voided,
            hasUnsentItems: seatHasUnsentItems,
            indentLeft: 6,
            seatKey
          })
        })
      })

      return nextRows
    }, [
      activeOrderId,
      activeOrderItemCount,
      seatGroups,
      sortedSeatKeys,
      enableCoursing,
      sentCourses,
      currentCourse
    ])

    // Memo 2: Visibility — cheap pass that sets expanded flags and filters collapsed children
    const rows = useMemo<SeatListRow[]>(() => {
      if (structuredRows.length <= 1) return structuredRows // empty or single empty-order row

      const result: SeatListRow[] = []
      for (const row of structuredRows) {
        if (row.type === 'empty') {
          result.push(row)
          continue
        }

        if (row.type === 'seat-header') {
          const seatExpanded = !collapsedSeats.has(row.seatKey)
          result.push(
            seatExpanded === row.expanded &&
              (activeSeat === row.seatNumber) === row.isCurrent
              ? row
              : {
                  ...row,
                  expanded: seatExpanded,
                  isCurrent: activeSeat === row.seatNumber
                }
          )
          continue
        }

        if (row.type === 'course-header') {
          // Skip if parent seat is collapsed
          if (collapsedSeats.has(row.seatKey)) continue
          const courseKey = `${row.seatKey}-${row.course}`
          const courseExpanded = !collapsedCourses.has(courseKey)
          result.push(
            courseExpanded === row.expanded
              ? row
              : { ...row, expanded: courseExpanded }
          )
          continue
        }

        // type === 'item'
        if (row.seatKey !== undefined && collapsedSeats.has(row.seatKey))
          continue
        if (row.courseKey && collapsedCourses.has(row.courseKey)) continue

        result.push(row)
      }
      return result
    }, [structuredRows, collapsedSeats, collapsedCourses, activeSeat])

    // Stable ref for volatile data so renderRow doesn't need these as deps
    const renderDataRef = useRef({
      enableCoursing,
      orderHasPayments,
      orderPayments,
      orderId: activeOrder?.id ?? null,
      toggleSeat,
      toggleCourse,
      onSelectSeat,
      onDoubleTapCourse,
      setActionCourse,
      courseSentAtMap,
      onRemoveCourse
    })
    renderDataRef.current = {
      enableCoursing,
      orderHasPayments,
      orderPayments,
      orderId: activeOrder?.id ?? null,
      toggleSeat,
      toggleCourse,
      onSelectSeat,
      onDoubleTapCourse,
      setActionCourse,
      courseSentAtMap,
      onRemoveCourse
    }

    // Stable renderRow — reads volatile data from ref, no deps to invalidate
    const renderRow = useCallback(
      ({ item: row }: { item: SeatListRow }) => {
        const d = renderDataRef.current

        if (row.type === 'empty') {
          return (
            <View
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                paddingVertical: 40
              }}
            >
              <Text style={{ fontSize: 12, color: colors.muted }}>
                Add items to start an order.
              </Text>
            </View>
          )
        }

        if (row.type === 'seat-header') {
          return (
            <SeatHeader
              label={row.label}
              itemCount={row.itemCount}
              total={row.total}
              isCurrent={row.isCurrent}
              expanded={row.expanded}
              onPress={() => {
                d.toggleSeat(row.seatKey)
                d.onSelectSeat?.(row.seatNumber)
              }}
            />
          )
        }

        if (row.type === 'course-header') {
          return (
            <CourseSubHeader
              course={row.course}
              itemCount={row.itemCount}
              isSent={row.isSent}
              hasUnsentItems={row.hasUnsentItems}
              isCurrentCourse={row.isCurrentCourse}
              expanded={row.expanded}
              status={row.status}
              sentAt={d.courseSentAtMap?.[row.course]}
              onPress={() => d.toggleCourse(row.seatKey, row.course)}
              onSend={
                d.onDoubleTapCourse
                  ? () => d.onDoubleTapCourse!(row.course)
                  : undefined
              }
              onLongPress={
                row.isSent ? () => d.setActionCourse(row.course) : undefined
              }
              onRemove={
                d.onRemoveCourse
                  ? () => d.onRemoveCourse!(row.course)
                  : undefined
              }
            />
          )
        }

        if (!d.orderId) return null

        return (
          <DenseBillItemRow
            orderId={d.orderId}
            itemId={row.itemId}
            isSent={row.isSent}
            hasUnsentItems={row.hasUnsentItems}
            indentLeft={row.indentLeft}
            enableCoursing={d.enableCoursing}
            orderHasPayments={d.orderHasPayments}
            orderPayments={d.orderPayments}
          />
        )
      },
      [] // stable — reads from renderDataRef
    )

    if (!activeOrder) {
      return (
        <View
          style={{
            flex: 1,
            alignItems: 'center',
            justifyContent: 'center',
            paddingVertical: 40
          }}
        >
          <Text style={{ fontSize: 12, color: colors.muted }}>
            No active order.
          </Text>
        </View>
      )
    }

    const hasItems = activeOrder.items && activeOrder.items.length > 0

    return (
      <View style={{ flex: 1, backgroundColor: colors.panel }}>
        {/* Order header */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 10,
            paddingVertical: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border
          }}
        >
          <Text
            style={{ fontSize: 13, fontWeight: '700', color: colors.heading }}
          >
            Order{' '}
            {activeOrder.display_number
              ? activeOrder.display_number.startsWith('#')
                ? activeOrder.display_number
                : `#${activeOrder.display_number}`
              : activeOrder.order_number
              ? `#${activeOrder.order_number}`
              : ''}
          </Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
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
            {hasItems && (
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <Users size={11} color={colors.muted} />
                <Text style={{ fontSize: 10, color: colors.muted }}>
                  {seatCount} {seatCount === 1 ? 'seat' : 'seats'}
                </Text>
              </View>
            )}
            {enableCoursing && onPressStartNewCourse && (
              <TouchableOpacity
                onPress={onPressStartNewCourse}
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4,
                  paddingHorizontal: 8,
                  paddingVertical: 4,
                  borderRadius: 6,
                  borderWidth: 1,
                  borderColor: colors.teal + '50'
                }}
                activeOpacity={0.8}
              >
                <Plus size={12} color={colors.teal} />
                <Text
                  style={{
                    fontSize: 10,
                    fontWeight: '600',
                    color: colors.teal
                  }}
                >
                  Course
                </Text>
              </TouchableOpacity>
            )}
            {onPressSendAllToKitchen &&
              (() => {
                const unsent =
                  activeOrder?.items?.reduce(
                    (sum, i) =>
                      !i.is_voided &&
                      (!i.kitchen_status || i.kitchen_status === 'new')
                        ? sum + (i.quantity ?? 1)
                        : sum,
                    0
                  ) ?? 0
                return (
                  <TouchableOpacity
                    onPress={onPressSendAllToKitchen}
                    disabled={unsent === 0}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 4,
                      paddingHorizontal: 9,
                      paddingVertical: 5,
                      borderRadius: 6,
                      backgroundColor: colors.teal,
                      opacity: unsent === 0 ? 0.4 : 1
                    }}
                    activeOpacity={0.8}
                  >
                    <Printer size={12} color={colors.onSolid} />
                    <Text
                      style={{
                        fontSize: 10,
                        fontWeight: '600',
                        color: colors.onSolid
                      }}
                    >
                      Send All{unsent > 0 ? ` (${unsent})` : ''}
                    </Text>
                  </TouchableOpacity>
                )
              })()}
          </View>
        </View>

        <FlatList
          data={
            hasItems ? rows : [{ id: 'empty-order', type: 'empty' as const }]
          }
          keyExtractor={row => row.id}
          renderItem={renderRow}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ paddingBottom: 8 }}
          initialNumToRender={24}
          maxToRenderPerBatch={24}
          windowSize={7}
          updateCellsBatchingPeriod={16}
          removeClippedSubviews
        />

        {/* Long-press course action menu */}
        {actionCourse !== null && (
          <Modal
            transparent
            animationType='fade'
            visible
            onRequestClose={() => setActionCourse(null)}
          >
            <Pressable
              style={{
                flex: 1,
                backgroundColor: 'rgba(0,0,0,0.4)',
                justifyContent: 'center',
                alignItems: 'center'
              }}
              onPress={() => setActionCourse(null)}
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
                  Course {actionCourse} Actions
                </Text>
                {onRushCourse && (
                  <TouchableOpacity
                    onPress={() => handleCourseAction('rush')}
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
                    onPress={() => handleCourseAction('prioritize')}
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
                    onPress={() => handleCourseAction('resend')}
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
      </View>
    )
  }
)

// ============================================================================
// Main Component
// ============================================================================

const TableBillSection = ({
  showOrderDetails = true,
  itemCourseMap,
  sentCourses,
  courseSentAtMap,
  currentCourse,
  onSelectCourse,
  onPressStartNewCourse,
  onDoubleTapCourse,
  activeOrder: passedActiveOrder,
  onOpenServerSheet,
  onPressMore,
  onPressTotal,
  onPressCloseCheck,
  onPressReopenCheck,
  onPressClearTable,
  totalDisplayAmount,
  pricingSheetRef,
  onClosePricingSheet,
  onPressProceedToPayment,
  setCurrentCourse,
  isFullyPaid,
  // Seating props
  itemSeatMap,
  activeSeat,
  seatCount,
  onSelectSeat,
  enablePerSeatOrdering = false,
  enableCoursing = true,
  // Course action props
  onRushCourse,
  onPrioritizeCourse,
  onResendCourse,
  onRemoveCourse,
  onPressSendAllToKitchen,
  isOvertime,
  overtimeMinutes
}: {
  showOrderDetails?: boolean
  itemCourseMap?: Record<string, number>
  sentCourses?: Record<number, boolean>
  courseSentAtMap?: Record<number, number>
  currentCourse?: number
  onSelectCourse?: (course: number | null) => void
  onPressStartNewCourse: () => void
  onDoubleTapCourse: (courseId: number) => void
  activeOrder?: OrderProfile
  onOpenServerSheet?: () => void
  onPressMore: () => void
  onPressTotal: () => void
  onPressCloseCheck: () => void
  onPressReopenCheck: () => void
  onPressClearTable: () => void
  totalDisplayAmount: number
  pricingSheetRef: React.RefObject<BottomSheetMethods>
  onClosePricingSheet: () => void
  onPressProceedToPayment: () => void
  setCurrentCourse: (course: number) => void
  isFullyPaid?: boolean
  // Seating props
  itemSeatMap?: Record<string, number | null>
  activeSeat?: number | null
  seatCount?: number
  onSelectSeat?: (seat: number | null) => void
  enablePerSeatOrdering?: boolean
  enableCoursing?: boolean
  // Course action props
  onRushCourse?: (courseId: number) => void
  onPrioritizeCourse?: (courseId: number) => void
  onResendCourse?: (courseId: number) => void
  onRemoveCourse?: (courseId: number) => void
  onPressSendAllToKitchen?: () => void
  isOvertime?: boolean
  overtimeMinutes?: number
}) => {
  const removeCheckDiscount = useOrderStore(state => state.removeCheckDiscount)
  const currentStationId = useOrderStore(s => s.currentStationId)
  const claimActiveOrder = useOrderStore(s => s.claimActiveOrder)
  const discountSheetRef = useRef<BottomSheetMethods>(null)
  const [discountOpenedOnce, setDiscountOpenedOnce] = useState(false)
  const [isClaiming, setClaiming] = useState(false)

  const activeOrder = passedActiveOrder
  const appliedDiscount = activeOrder?.checkDiscount
  const isReadOnly = isOrderReadOnly(activeOrder, currentStationId)
  const sourceStationName =
    activeOrder?.station_name ?? activeOrder?._sourceStationName ?? null

  const handleTakeOver = useCallback(async () => {
    if (isClaiming) return
    setClaiming(true)
    try {
      await claimActiveOrder()
    } finally {
      setClaiming(false)
    }
  }, [claimActiveOrder, isClaiming])

  const handleRemoveDiscount = () => {
    if (activeOrder?.id) {
      removeCheckDiscount(activeOrder.id)
    }
  }

  const handleOpenDiscountSheet = useCallback(() => {
    if (discountSheetRef.current) {
      discountSheetRef.current.expand()
      return
    }
    setDiscountOpenedOnce(true)
  }, [])

  useEffect(() => {
    if (discountOpenedOnce) {
      const id = setTimeout(() => discountSheetRef.current?.expand(), 80)
      return () => clearTimeout(id)
    }
  }, [discountOpenedOnce])

  // Determine which view to render
  const renderOrderView = () => {
    if (enablePerSeatOrdering) {
      // Collapsible seat view (with or without coursing)
      return (
        <DenseSeatView
          activeOrder={activeOrder}
          itemSeatMap={itemSeatMap}
          itemCourseMap={itemCourseMap}
          sentCourses={sentCourses}
          courseSentAtMap={courseSentAtMap}
          currentCourse={currentCourse}
          activeSeat={activeSeat}
          seatCount={seatCount ?? 2}
          onSelectSeat={onSelectSeat}
          onSelectCourse={onSelectCourse}
          onPressStartNewCourse={onPressStartNewCourse}
          onDoubleTapCourse={onDoubleTapCourse}
          onRushCourse={onRushCourse}
          onPrioritizeCourse={onPrioritizeCourse}
          onResendCourse={onResendCourse}
          onRemoveCourse={onRemoveCourse}
          onPressSendAllToKitchen={onPressSendAllToKitchen}
          enableCoursing={enableCoursing}
          isOvertime={isOvertime}
          overtimeMinutes={overtimeMinutes}
        />
      )
    }

    // Course only or neither (existing accordion behavior)
    return (
      <CourseAccordion
        activeOrder={activeOrder}
        itemCourseMap={itemCourseMap}
        sentCourses={sentCourses}
        currentCourse={currentCourse}
        onSelectCourse={onSelectCourse}
        onPressStartNewCourse={onPressStartNewCourse}
        onDoubleTapCourse={onDoubleTapCourse}
        onOpenServerSheet={onOpenServerSheet}
        onRushCourse={onRushCourse}
        onPrioritizeCourse={onPrioritizeCourse}
        onResendCourse={onResendCourse}
        onRemoveCourse={onRemoveCourse}
        onPressSendAllToKitchen={onPressSendAllToKitchen}
        enableCoursing={enableCoursing}
        isOvertime={isOvertime}
        overtimeMinutes={overtimeMinutes}
      />
    )
  }

  return (
    <>
      <View
        className='max-w-lg  flex-1 flex-col'
        style={{ backgroundColor: colors.panel }}
      >
        {isReadOnly && (
          <ReadOnlyBanner
            sourceStationName={sourceStationName}
            isClaiming={isClaiming}
            onTakeOver={handleTakeOver}
          />
        )}

        {renderOrderView()}

        {/* --- INLINED ACTIVE DISCOUNT INDICATOR --- */}
        {appliedDiscount && (
          <View className='px-4 pb-2'>
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingHorizontal: 10,
                paddingVertical: 6,
                height: 36,
                backgroundColor: colors.info + '15',
                borderWidth: 1,
                borderColor: colors.info + '40',
                borderRadius: 8,
                gap: 8
              }}
            >
              <Text
                style={{ fontSize: 12, fontWeight: '600', color: colors.info }}
              >
                {appliedDiscount.label}
              </Text>
              <TouchableOpacity
                onPress={handleRemoveDiscount}
                style={{ padding: 4 }}
              >
                <X color={colors.info} size={14} />
              </TouchableOpacity>
            </View>
          </View>
        )}

        {/* Send All now lives next to "New Course" in each view's header
            (DenseSeatView + CourseAccordion), so the bottom bar was removed. */}

        <BottomActionBar
          activeOrder={activeOrder}
          onPressMore={onPressMore}
          onPressTotal={onPressTotal}
          onPressCloseCheck={onPressCloseCheck}
          onPressReopenCheck={onPressReopenCheck}
          onPressClearTable={onPressClearTable}
          totalDisplayAmount={totalDisplayAmount}
          onPressDiscount={handleOpenDiscountSheet}
          isFullyPaid={isFullyPaid}
          paymentCount={activeOrder?.payments?.length ?? 0}
        />

        <PricingBreakdownSheet
          ref={pricingSheetRef}
          onClose={onClosePricingSheet}
          onPressProceedToPayment={onPressProceedToPayment}
          totalDisplayAmount={totalDisplayAmount}
          hasPayments={(activeOrder?.payments?.length ?? 0) > 0}
          orderId={activeOrder?.id}
        />
        {discountOpenedOnce && (
          <DiscountBottomSheet
            ref={discountSheetRef}
            onClose={() => discountSheetRef.current?.close()}
          />
        )}
      </View>
    </>
  )
}

export default React.memo(TableBillSection, (prev, next) => {
  if (prev.totalDisplayAmount !== next.totalDisplayAmount) return false
  if (prev.isFullyPaid !== next.isFullyPaid) return false
  if (prev.currentCourse !== next.currentCourse) return false
  if (prev.enableCoursing !== next.enableCoursing) return false
  if (prev.enablePerSeatOrdering !== next.enablePerSeatOrdering) return false
  if (prev.activeSeat !== next.activeSeat) return false
  if (prev.seatCount !== next.seatCount) return false
  if (prev.activeOrder?.id !== next.activeOrder?.id) return false
  if (prev.activeOrder?.paid_status !== next.activeOrder?.paid_status)
    return false
  if (prev.activeOrder?.check_status !== next.activeOrder?.check_status)
    return false
  if (prev.activeOrder?.station_id !== next.activeOrder?.station_id)
    return false
  if (prev.activeOrder?.station_name !== next.activeOrder?.station_name)
    return false
  if (prev.activeOrder?.checkDiscount !== next.activeOrder?.checkDiscount)
    return false
  if (prev.activeOrder?.items !== next.activeOrder?.items) return false
  if (
    (prev.activeOrder?.items?.length ?? 0) !==
    (next.activeOrder?.items?.length ?? 0)
  )
    return false
  const prevHasUnsent =
    prev.activeOrder?.items?.some(
      i => !i.is_voided && (!i.kitchen_status || i.kitchen_status === 'new')
    ) ?? false
  const nextHasUnsent =
    next.activeOrder?.items?.some(
      i => !i.is_voided && (!i.kitchen_status || i.kitchen_status === 'new')
    ) ?? false
  if (prevHasUnsent !== nextHasUnsent) return false
  if (prev.activeOrder?.payments !== next.activeOrder?.payments) return false
  if (
    (prev.activeOrder?.payments?.length ?? 0) !==
    (next.activeOrder?.payments?.length ?? 0)
  )
    return false
  if (prev.sentCourses !== next.sentCourses) return false
  if (prev.courseSentAtMap !== next.courseSentAtMap) return false
  if (prev.itemCourseMap !== next.itemCourseMap) return false
  if (prev.itemSeatMap !== next.itemSeatMap) return false
  if (prev.onPressMore !== next.onPressMore) return false
  if (prev.onPressTotal !== next.onPressTotal) return false
  if (prev.onPressClearTable !== next.onPressClearTable) return false
  if (prev.onPressCloseCheck !== next.onPressCloseCheck) return false
  if (prev.onDoubleTapCourse !== next.onDoubleTapCourse) return false
  if (prev.onOpenServerSheet !== next.onOpenServerSheet) return false
  if (prev.onPressSendAllToKitchen !== next.onPressSendAllToKitchen)
    return false
  if (prev.onRemoveCourse !== next.onRemoveCourse) return false
  return true
})
