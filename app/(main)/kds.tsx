import KDSFlyingTicket, {
  type FlyingTicketData
} from '@/components/kds/KDSFlyingTicket'
import PinInputModal from '@/components/timeclock/PinInputModal'
import { useLocationRealtime } from '@/contexts/LocationRealtimeProvider'
import { useToast } from '@/contexts/ToastContext'
import {
  getBucketedElapsed,
  getUrgencyLevel,
  useKDSTimer,
  type UrgencyThresholds
} from '@/hooks/useKDSTimer'
import { useSupabaseClient } from '@/hooks/useSupabaseClient'
import { getDeviceId } from '@/lib/deviceId'
import { replaceRoute } from '@/lib/rootNavigation'
import { colors, URGENCY_COLORS } from '@/lib/theme'
import { clearStationData } from '@/services/cacheService'
import KDSSoundService, {
  DEFAULT_SOUND_CONFIG
} from '@/services/kds/kdsSoundService'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useKDSStore } from '@/stores/useKDSStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useStoreSettingsStore } from '@/stores/useStoreSettingsStore'
import { KDSTicket, KDSTicketItem } from '@/types/kds'
import { useRouter } from 'expo-router'
import {
  ArrowUpToLine,
  CheckSquare,
  CircleDotDashed,
  Flame,
  RotateCcw,
  ShoppingBag,
  Square,
  Star,
  Truck,
  UtensilsCrossed
} from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  Dimensions,
  GestureResponderEvent,
  InteractionManager,
  Pressable,
  Animated as RNAnimated,
  Text,
  TouchableOpacity,
  View
} from 'react-native'
import Animated, {
  Easing,
  FadeOut,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming
} from 'react-native-reanimated'

// ─── Status Tab Config ────────────────────────────────────────────
type StatusFilter = 'pending' | 'cooking' | 'ready' | 'done'
type OrderTypeFilter = 'all' | 'delivery' | 'takeout' | 'dine_in'

const STATUS_TABS: { key: StatusFilter; label: string }[] = [
  { key: 'pending', label: 'Pending' },
  { key: 'cooking', label: 'Cooking' },
  { key: 'ready', label: 'Served' },
  { key: 'done', label: 'Done' }
]

const TYPE_TABS: { key: OrderTypeFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'delivery', label: 'Delivery' },
  { key: 'takeout', label: 'To Go' },
  { key: 'dine_in', label: 'Dine-In' }
]

// ─── Urgency border colors by level (from theme) ────────────────
const URGENCY_BORDER_COLORS = URGENCY_COLORS
const MODIFIER_ADD_COLOR = '#0B5E56'

// ─── Manager roles for bulk operations ──────────────────────────
const MANAGER_ROLES = ['merchant.manager', 'merchant.admin', 'merchant.owner']

// ─── Memoized animation configs (avoid re-allocation per render) ─
const LAYOUT_ANIM = LinearTransition.springify().damping(18).stiffness(200)
const CARD_EXIT_ANIM = FadeOut.duration(150)

// ─── Pulsing Dot (for connection status) ─────────────────────────
const PulsingDot = () => {
  const opacity = useRef(new RNAnimated.Value(0.4)).current

  useEffect(() => {
    const animation = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true
        }),
        RNAnimated.timing(opacity, {
          toValue: 0.4,
          duration: 1000,
          useNativeDriver: true
        })
      ])
    )
    animation.start()
    return () => animation.stop()
  }, [])

  return (
    <RNAnimated.View
      style={{
        width: 8,
        height: 8,
        borderRadius: 4,
        backgroundColor: colors.teal,
        opacity,
        marginLeft: 8
      }}
    />
  )
}

// ─── Skeleton ─────────────────────────────────────────────────────
const SkeletonBar = ({
  width,
  height,
  style
}: {
  width: number | string
  height: number
  style?: any
}) => {
  const opacity = useRef(new RNAnimated.Value(0.3)).current

  useEffect(() => {
    const animation = RNAnimated.loop(
      RNAnimated.sequence([
        RNAnimated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true
        }),
        RNAnimated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true
        })
      ])
    )
    animation.start()
    return () => animation.stop()
  }, [])

  return (
    <RNAnimated.View
      style={[
        {
          width: typeof width === 'number' ? width : undefined,
          height,
          backgroundColor: colors.muted,
          borderRadius: 4,
          opacity
        },
        style
      ]}
    />
  )
}

const KDSSkeletonCard = () => (
  <View
    style={{
      margin: 4,
      borderRadius: 10,
      overflow: 'hidden',
      backgroundColor: colors.skeleton,
      borderWidth: 2,
      borderColor: colors.border,
      height: 180
    }}
  >
    <View
      style={{
        backgroundColor: colors.skeletonHighlight,
        paddingHorizontal: 10,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        flexDirection: 'row',
        justifyContent: 'space-between'
      }}
    >
      <View>
        <SkeletonBar width={80} height={18} style={{ marginBottom: 6 }} />
        <SkeletonBar width={60} height={12} />
      </View>
      <View style={{ alignItems: 'flex-end' }}>
        <SkeletonBar width={40} height={14} style={{ marginBottom: 6 }} />
        <SkeletonBar width={50} height={14} />
      </View>
    </View>
    <View style={{ padding: 12, flex: 1 }}>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}
      >
        <SkeletonBar
          width={24}
          height={24}
          style={{ marginRight: 8, borderRadius: 4 }}
        />
        <SkeletonBar width={120} height={16} />
      </View>
      <View
        style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 12 }}
      >
        <SkeletonBar
          width={24}
          height={24}
          style={{ marginRight: 8, borderRadius: 4 }}
        />
        <SkeletonBar width={100} height={16} />
      </View>
      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
        <SkeletonBar
          width={24}
          height={24}
          style={{ marginRight: 8, borderRadius: 4 }}
        />
        <SkeletonBar width={140} height={16} />
      </View>
    </View>
  </View>
)

// ─── Order Type Helpers ───────────────────────────────────────────
function getOrderTypeLabel (type: string | null): string {
  const t = (type || '').toLowerCase()
  if (t === 'delivery') return 'DELIVERY'
  if (t === 'takeout' || t === 'to_go' || t === 'to go') return 'TO GO'
  return 'DINE IN'
}

function getOrderTypeIcon (type: string | null) {
  const t = (type || '').toLowerCase()
  if (t === 'delivery')
    return <Truck size={11} color={colors.orderTypeDelivery} />
  if (t === 'takeout' || t === 'to_go' || t === 'to go')
    return <ShoppingBag size={11} color={colors.orderTypeToGo} />
  return <UtensilsCrossed size={11} color={colors.orderTypeDineIn} />
}

function matchesTypeFilter (
  ticket: KDSTicket,
  filter: OrderTypeFilter
): boolean {
  if (filter === 'all') return true
  const t = (ticket.order_type || '').toLowerCase()
  if (filter === 'delivery') return t === 'delivery'
  if (filter === 'takeout')
    return t === 'takeout' || t === 'to_go' || t === 'to go'
  // dine_in
  return t === 'dine_in' || t === 'dine in' || t === '' || !ticket.order_type
}

// ─── Allergen Detection ────────────────────────────────────────────
const ALLERGEN_KEYWORDS: Record<string, { label: string; color: string }> = {
  shellfish: { label: 'SHELLFISH', color: colors.danger },
  dairy: { label: 'DAIRY', color: colors.warning },
  nuts: { label: 'NUTS', color: '#8B5CF6' },
  gluten: { label: 'GLUTEN', color: colors.warning },
  soy: { label: 'SOY', color: colors.success }
}

function detectAllergen (
  modifierName: string | null | undefined
): { label: string; color: string } | null {
  if (!modifierName) return null
  const lower = modifierName.toLowerCase()
  for (const [keyword, allergen] of Object.entries(ALLERGEN_KEYWORDS)) {
    if (lower.includes(keyword)) {
      return allergen
    }
  }
  return null
}

// ─── Display Settings Interface ───────────────────────────────────
interface KDSTicketDisplaySettings {
  highlightNotes: boolean
  itemNameLines: number // 0 = unlimited
  modifierGroupName: 'for_group_priced' | 'always' | 'never'
  exclusionsAtTop: boolean
  alphabeticalSort: boolean
  aggregateIdenticalItems: boolean
}

// ─── Ticket Card ──────────────────────────────────────────────────
export interface CardPosition {
  x: number
  y: number
  width: number
  height: number
}

interface KDSTicketCardProps {
  ticket: KDSTicket
  onAdvance: (
    ticketId: string,
    itemIds: string[],
    newStatus: 'preparing' | 'ready' | 'served',
    cardPos?: CardPosition
  ) => void
  bulkMode: boolean
  onToggleSelect: (id: string) => void
  onFocus?: (ticketId: string | null) => void
  isFocused?: boolean
  onLongPress?: (
    ticketId: string,
    ticket: KDSTicket,
    event: GestureResponderEvent
  ) => void
  onItemPress?: (ticketId: string, itemId: string) => void
  hideDoneItems: boolean
  displaySettings: KDSTicketDisplaySettings
  urgencyThresholds: UrgencyThresholds
}

const KDSTicketCard = React.memo<KDSTicketCardProps>(
  ({
    ticket,
    onAdvance,
    bulkMode,
    onToggleSelect,
    onFocus,
    isFocused,
    onLongPress,
    onItemPress,
    hideDoneItems,
    displaySettings,
    urgencyThresholds
  }) => {
    // Subscribe to own selection state via Zustand selector — only the toggled card re-renders
    const isSelected = useKDSStore(
      useCallback(
        s => s.selectedTicketIds.has(ticket.ticket_id),
        [ticket.ticket_id]
      )
    )

    // Subscribe to timerTick via Zustand selector — only re-renders when bucketed string changes
    const timeElapsed = useKDSStore(
      useCallback(
        s => {
          void s.timerTick
          return getBucketedElapsed(ticket.start_time_epoch)
        },
        [ticket.start_time_epoch]
      )
    )

    // Urgency level — derived from timerTick, only changes at minute boundaries
    const urgencyLevel = useKDSStore(
      useCallback(
        s => {
          void s.timerTick
          return getUrgencyLevel(ticket.start_time_epoch, urgencyThresholds)
        },
        [ticket.start_time_epoch, urgencyThresholds]
      )
    )

    // Card ref for position measurement
    const cardRef = useRef<View>(null)

    // Double-tap detection
    const lastTapRef = useRef(0)
    // Lock in ticket.status at first tap — immune to in-flight re-renders from auto-fire/broadcast
    const firstTapStatusRef = useRef<KDSTicket['status'] | null>(null)
    // Pre-measured card position (cached on first tap for instant double-tap)
    const cachedPosRef = useRef<CardPosition | undefined>(undefined)
    // Delayed focus toggle to detect double-tap
    const focusTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    // Animation (Reanimated — runs entirely on UI thread)
    const scaleValue = useSharedValue(1)

    const scaleStyle = useAnimatedStyle(() => ({
      transform: [{ scale: scaleValue.value }]
    }))

    const handlePress = () => {
      if (bulkMode) {
        onToggleSelect(ticket.ticket_id)
        return
      }

      const now = Date.now()
      const isDoubleTap = now - lastTapRef.current < 300

      if (!isDoubleTap) {
        // First tap — gentle pulse to signal acknowledgment
        lastTapRef.current = now
        firstTapStatusRef.current = ticket.status  // lock in status at gesture start

        scaleValue.value = withSequence(
          withTiming(0.97, { duration: 80, easing: Easing.out(Easing.cubic) }),
          withTiming(1, { duration: 120, easing: Easing.out(Easing.cubic) })
        )

        // Pre-measure card position so double-tap fires instantly
        if (cardRef.current) {
          cardRef.current.measureInWindow((x, y, width, height) => {
            if (x === 0 && y === 0 && width === 0 && height === 0) return
            cachedPosRef.current = { x, y, width, height }
          })
        }

        // Schedule focus toggle for single tap (cancel if double-tap comes)
        if (focusTimeoutRef.current) clearTimeout(focusTimeoutRef.current)
        focusTimeoutRef.current = setTimeout(() => {
          // Only toggle focus if it's truly a single tap (no double-tap happened)
          firstTapStatusRef.current = null  // clear on single tap
          onFocus?.(isFocused ? null : ticket.ticket_id)
          focusTimeoutRef.current = null
        }, 300)
        return
      }

      // Double tap detected — cancel pending focus toggle and advance instead
      if (focusTimeoutRef.current) {
        clearTimeout(focusTimeoutRef.current)
        focusTimeoutRef.current = null
      }
      lastTapRef.current = 0

      // Determine next status — use captured status from first tap (immune to in-flight re-renders)
      const capturedStatus = firstTapStatusRef.current
      firstTapStatusRef.current = null  // clear for next gesture

      const itemIds = ticket.items.map(i => i.id)
      let newStatus: 'preparing' | 'ready' | 'served' | undefined
      if (capturedStatus === 'pending') newStatus = 'preparing'
      else if (capturedStatus === 'cooking') newStatus = 'ready'
      else if (capturedStatus === 'ready') newStatus = 'served'

      if (!newStatus) return

      // Fire advance synchronously with pre-measured position — no frame delay
      onAdvance(ticket.ticket_id, itemIds, newStatus, cachedPosRef.current)
      cachedPosRef.current = undefined
    }

    const handleLongPress = (e: GestureResponderEvent) => {
      if (bulkMode) return
      onLongPress?.(ticket.ticket_id, ticket, e)
    }

    // Determine border color based on state
    let borderColor = '#E5E7EB' // default light gray
    if (isFocused) {
      borderColor = colors.teal
    } else if (bulkMode && isSelected) {
      borderColor = colors.info
    }

    const isDineIn =
      ticket.order_type?.toLowerCase() === 'dine_in' ||
      ticket.order_type?.toLowerCase() === 'dine in' ||
      !ticket.order_type
    const hasMetaInfo = Boolean(
      ticket.customer_name || ticket.table_name || ticket.course_number > 1
    )

    const orderTypeLabel = getOrderTypeLabel(ticket.order_type)
    const hasRush = ticket.items.some(item => item.rush)
    const hasRefire = ticket.items.some(item => item.recalled)

    // Filter/track done items + apply display settings
    const doneItemCount = ticket.items.filter(
      i => i.kitchen_status === 'ready'
    ).length
    let processedItems = hideDoneItems
      ? ticket.items.filter(i => i.kitchen_status !== 'ready')
      : [...ticket.items]

    // Aggregate identical items (same name + modifiers + notes)
    if (displaySettings.aggregateIdenticalItems) {
      const aggregated: (KDSTicketItem & { _aggregatedIds?: string[] })[] = []
      const keyMap = new Map<string, number>()
      for (const item of processedItems) {
        const modKey = item.modifiers
          .map(m => m.modifier_name)
          .sort()
          .join('|')
        const key = `${item.name}__${modKey}__${
          item.special_instructions ?? ''
        }`
        const idx = keyMap.get(key)
        if (idx !== undefined) {
          const existing = aggregated[idx]
          aggregated[idx] = {
            ...existing,
            quantity: existing.quantity + item.quantity
          }
        } else {
          keyMap.set(key, aggregated.length)
          aggregated.push({ ...item })
        }
      }
      processedItems = aggregated
    }

    // Stable sort: alphabetical by name (then id tiebreaker), or just by id
    if (displaySettings.alphabeticalSort) {
      processedItems = [...processedItems].sort((a, b) => {
        const cmp = a.name.localeCompare(b.name)
        return cmp !== 0 ? cmp : a.id.localeCompare(b.id)
      })
    } else {
      processedItems = [...processedItems].sort((a, b) =>
        a.id.localeCompare(b.id)
      )
    }

    const visibleItems = processedItems
    const hasHiddenDoneItems = hideDoneItems && doneItemCount > 0

    return (
      <Pressable
        onPress={handlePress}
        onLongPress={handleLongPress}
        delayLongPress={400}
      >
        <View ref={cardRef} collapsable={false}>
          <Animated.View
            style={[
              {
                margin: 4,
                borderRadius: 10,
                overflow: 'hidden',
                backgroundColor: '#FFFFFF',
                borderTopWidth: 1,
                borderBottomWidth: 1,
                borderRightWidth: 1,
                borderLeftWidth: isDineIn ? 4 : 1,
                borderTopColor: borderColor,
                borderBottomColor: borderColor,
                borderRightColor: borderColor,
                borderLeftColor: isDineIn ? colors.teal : borderColor,
                shadowColor: '#000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: isFocused ? 0.15 : 0.08,
                shadowRadius: isFocused ? 8 : 4,
                elevation: isFocused ? 4 : 2
              },
              scaleStyle
            ]}
          >
            {/* Bulk mode checkbox overlay */}
            {bulkMode && (
              <View
                style={{
                  position: 'absolute',
                  top: 6,
                  right: 6,
                  zIndex: 10
                }}
              >
                {isSelected ? (
                  <CheckSquare
                    size={20}
                    color={colors.info}
                    fill={colors.info}
                  />
                ) : (
                  <Square size={20} color={colors.label} />
                )}
              </View>
            )}

            {/* RUSH badge (yellow pill, under timer) */}
            {hasRush && (
              <View
                style={{
                  position: 'absolute',
                  top: 34,
                  right: 12,
                  zIndex: 10,
                  backgroundColor: '#FEF08A',
                  borderWidth: 1,
                  borderColor: colors.warning + '50',
                  paddingHorizontal: 8,
                  paddingVertical: 3,
                  borderRadius: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 4
                }}
              >
                <Text
                  style={{
                    color: '#78350F',
                    fontSize: 10,
                    fontWeight: '800',
                    letterSpacing: 0.5
                  }}
                >
                  RUSHED
                </Text>
              </View>
            )}

            {/* Card Header: Order Number + Order Type + Timer (darker background) */}
            <View
              style={{
                backgroundColor: '#F3F4F6',
                paddingHorizontal: 12,
                paddingVertical: 10,
                borderBottomWidth: 1,
                borderBottomColor: '#E5E7EB',
                flexDirection: 'row',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12
              }}
            >
              <View style={{ flex: 1, gap: 4 }}>
                {/* Order Number */}
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
                >
                  <Text
                    style={{
                      color: '#111827',
                      fontSize: 16,
                      fontWeight: '700'
                    }}
                    numberOfLines={1}
                  >
                    #
                    {ticket.display_number ||
                      ticket.order_number?.slice(-4) ||
                      '----'}
                  </Text>
                  {ticket.prioritized && (
                    <Star
                      size={16}
                      color={colors.warning}
                      fill={colors.warning}
                    />
                  )}
                </View>

                {/* Order Type */}
                <View
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
                >
                  {ticket.order_type?.toLowerCase() === 'delivery' ? (
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: '#EF4444'
                      }}
                    />
                  ) : ticket.order_type?.toLowerCase() === 'takeout' ||
                    ticket.order_type?.toLowerCase() === 'to_go' ? (
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: '#3B82F6'
                      }}
                    />
                  ) : (
                    <View
                      style={{
                        width: 6,
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: '#22C55E'
                      }}
                    />
                  )}
                  <Text
                    style={{
                      color: '#374151',
                      fontSize: 11,
                      fontWeight: '600'
                    }}
                  >
                    {orderTypeLabel}
                  </Text>
                </View>
              </View>

              {/* Timer */}
              <Text
                style={{
                  color: urgencyLevel > 0 ? colors.danger : colors.label,
                  fontSize: 13,
                  fontWeight: urgencyLevel > 0 ? '700' : '600'
                }}
              >
                {timeElapsed}
              </Text>
            </View>

            {/* Row 3: Customer + Table + Course (only shown when populated) */}
            {hasMetaInfo && (
              <View
                style={{
                  backgroundColor: '#FFFFFF',
                  paddingHorizontal: 12,
                  paddingVertical: 5,
                  borderBottomWidth: 1,
                  borderBottomColor: '#E5E7EB'
                }}
              >
                <Text
                  style={{ color: '#6B7280', fontSize: 11, fontWeight: '500' }}
                  numberOfLines={1}
                >
                  {ticket.customer_name ? ticket.customer_name : ''}
                  {ticket.customer_name && ticket.table_name ? ' · ' : ''}
                  {ticket.table_name ? `Table ${ticket.table_name}` : ''}
                  {ticket.course_number > 1
                    ? ` · Course ${ticket.course_number}`
                    : ''}
                </Text>
              </View>
            )}

            {/* Items list */}
            <View style={{ padding: 10, backgroundColor: '#FFFFFF' }}>
              {visibleItems.map((item: KDSTicketItem, index: number) => {
                const isItemDone = item.kitchen_status === 'ready'
                return (
                  <Pressable
                    key={item.id}
                    onPress={() => {
                      if (!isItemDone && onItemPress) {
                        onItemPress(ticket.ticket_id, item.id)
                      }
                    }}
                    style={
                      index < visibleItems.length - 1
                        ? { marginBottom: 6 }
                        : undefined
                    }
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'flex-start',
                        opacity: isItemDone ? 0.5 : 1
                      }}
                    >
                      <View
                        style={{
                          backgroundColor: isItemDone
                            ? colors.success
                            : '#E5E7EB',
                          width: 22,
                          height: 22,
                          borderRadius: 4,
                          alignItems: 'center',
                          justifyContent: 'center',
                          marginRight: 8,
                          minWidth: 22
                        }}
                      >
                        <Text
                          style={{
                            color: isItemDone ? '#fff' : '#111827',
                            fontSize: 12,
                            fontWeight: '700'
                          }}
                        >
                          {item.quantity}
                        </Text>
                      </View>
                      {item.seat_number != null && (
                        <Text
                          style={{
                            color: '#0D9488',
                            fontSize: 11,
                            fontWeight: '700',
                            marginRight: 6
                          }}
                        >
                          [S{item.seat_number}]
                        </Text>
                      )}
                      <Text
                        style={{
                          color: isItemDone ? '#9CA3AF' : '#111827',
                          fontSize: 13,
                          fontWeight: '600',
                          flex: 1,
                          textDecorationLine: isItemDone
                            ? 'line-through'
                            : 'none'
                        }}
                        numberOfLines={
                          displaySettings.itemNameLines || undefined
                        }
                      >
                        {item.name}
                      </Text>
                    </View>
                    {/* Modifiers */}
                    {item.modifiers.length > 0 &&
                      (() => {
                        let mods = [...item.modifiers]
                        // Exclusions at top
                        if (displaySettings.exclusionsAtTop) {
                          mods.sort((a, b) => {
                            const aRemoval =
                              a.is_no ||
                              a.modifier_group_name
                                ?.toLowerCase()
                                .includes('remove') ||
                              a.modifier_name?.toLowerCase().startsWith('no ')
                                ? 0
                                : 1
                            const bRemoval =
                              b.is_no ||
                              b.modifier_group_name
                                ?.toLowerCase()
                                .includes('remove') ||
                              b.modifier_name?.toLowerCase().startsWith('no ')
                                ? 0
                                : 1
                            return aRemoval - bRemoval
                          })
                        }
                        return mods.map((mod, mi) => {
                          const isRemoval =
                            mod.is_no ||
                            mod.modifier_group_name
                              ?.toLowerCase()
                              .includes('remove') ||
                            mod.modifier_name?.toLowerCase().startsWith('no ')
                          // Modifier group name prefix with ✕ or +
                          let prefix = isRemoval ? '✕ ' : '+ '
                          if (
                            displaySettings.modifierGroupName === 'always' &&
                            mod.modifier_group_name
                          ) {
                            prefix = `${prefix}${mod.modifier_group_name}: `
                          } else if (
                            displaySettings.modifierGroupName ===
                              'for_group_priced' &&
                            mod.modifier_group_name &&
                            mod.price_modifier !== 0
                          ) {
                            prefix = `${prefix}${mod.modifier_group_name}: `
                          }
                          const allergen = detectAllergen(mod.modifier_name)
                          return (
                            <View
                              key={`${item.id}_m${mi}`}
                              style={{
                                marginTop: 2,
                                flexDirection: 'row',
                                alignItems: 'flex-start',
                                gap: 6
                              }}
                            >
                              <Text
                                style={{
                                  color: isRemoval
                                    ? colors.danger
                                    : MODIFIER_ADD_COLOR,
                                  fontSize: 12,
                                  fontWeight: '600',
                                  lineHeight: 16,
                                  marginLeft: 30,
                                  opacity: isItemDone ? 0.4 : 1,
                                  textDecorationLine: isItemDone
                                    ? 'line-through'
                                    : 'none',
                                  flex: 1
                                }}
                              >
                                {prefix}
                                {mod.modifier_name}
                              </Text>
                              {allergen && (
                                <View
                                  style={{
                                    backgroundColor: allergen.color + '20',
                                    paddingHorizontal: 6,
                                    paddingVertical: 2,
                                    borderRadius: 4,
                                    borderWidth: 1,
                                    borderColor: allergen.color
                                  }}
                                >
                                  <Text
                                    style={{
                                      color: allergen.color,
                                      fontSize: 8,
                                      fontWeight: '700'
                                    }}
                                  >
                                    {allergen.label}
                                  </Text>
                                </View>
                              )}
                            </View>
                          )
                        })
                      })()}
                    {/* Special instructions */}
                    {item.special_instructions && (
                      <Text
                        style={{
                          color: displaySettings.highlightNotes
                            ? colors.warning
                            : colors.muted,
                          fontSize: 10,
                          fontStyle: 'italic',
                          marginLeft: 30,
                          marginTop: 3,
                          opacity: isItemDone ? 0.4 : 1,
                          textDecorationLine: isItemDone
                            ? 'line-through'
                            : 'none'
                        }}
                        numberOfLines={2}
                      >
                        "{item.special_instructions}"
                      </Text>
                    )}
                  </Pressable>
                )
              })}
              {/* Hidden done items indicator */}
              {hasHiddenDoneItems && (
                <Text
                  style={{
                    color: '#9CA3AF',
                    fontSize: 11,
                    marginTop: 6,
                    textAlign: 'center'
                  }}
                >
                  {doneItemCount} done
                </Text>
              )}
            </View>

            {/* Progress bar at bottom */}
            <View
              style={{
                height: 4,
                backgroundColor: '#E5E7EB',
                overflow: 'hidden'
              }}
            >
              <View
                style={{
                  height: '100%',
                  backgroundColor: colors.teal,
                  width: `${(doneItemCount / ticket.item_count) * 100}%`
                }}
              />
            </View>
          </Animated.View>
        </View>
      </Pressable>
    )
  },
  (prev, next) => {
    // Check if ticket reference is the same AND items haven't changed
    if (prev.ticket !== next.ticket) return false
    // Check if item count or rush status changed
    if (prev.ticket.items.length !== next.ticket.items.length) return false
    if (
      prev.ticket.items.some(
        (item, i) => item.rush !== next.ticket.items[i]?.rush
      )
    )
      return false

    return (
      prev.onAdvance === next.onAdvance &&
      prev.bulkMode === next.bulkMode &&
      prev.onToggleSelect === next.onToggleSelect &&
      prev.onFocus === next.onFocus &&
      prev.isFocused === next.isFocused &&
      prev.onLongPress === next.onLongPress &&
      prev.onItemPress === next.onItemPress &&
      prev.hideDoneItems === next.hideDoneItems &&
      prev.displaySettings === next.displaySettings &&
      prev.urgencyThresholds === next.urgencyThresholds
    )
  }
)

// ─── Done Ticket Card (gray, muted, tap to recall) ───────────────
interface KDSDoneTicketCardProps {
  ticket: KDSTicket
  onRecall: (ticketId: string) => void
}

const KDSDoneTicketCard = React.memo<KDSDoneTicketCardProps>(
  ({ ticket, onRecall }) => {
    const timeElapsed = useKDSStore(
      useCallback(
        s => {
          void s.timerTick
          return getBucketedElapsed(ticket.start_time_epoch)
        },
        [ticket.start_time_epoch]
      )
    )

    const orderTypeLabel = getOrderTypeLabel(ticket.order_type)
    const orderTypeIcon = getOrderTypeIcon(ticket.order_type)
    const hasMetaInfo = Boolean(
      ticket.customer_name || ticket.table_name || ticket.course_number > 1
    )

    return (
      <Pressable onPress={() => onRecall(ticket.ticket_id)}>
        <View
          style={{
            margin: 4,
            borderRadius: 10,
            overflow: 'hidden',
            backgroundColor: '#FFFFFF',
            borderWidth: 1,
            borderColor: '#E5E7EB',
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 1 },
            shadowOpacity: 0.05,
            shadowRadius: 2,
            elevation: 1
          }}
        >
          {/* Card Header: Order Number + Order Type + Time */}
          <View
            style={{
              backgroundColor: '#F3F4F6',
              paddingHorizontal: 12,
              paddingVertical: 10,
              borderBottomWidth: 1,
              borderBottomColor: '#D1D5DB',
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'flex-start',
              gap: 12
            }}
          >
            <View style={{ flex: 1, gap: 4 }}>
              {/* Order Number */}
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}
              >
                <Text
                  style={{ color: '#6B7280', fontSize: 16, fontWeight: '700' }}
                  numberOfLines={1}
                >
                  #
                  {ticket.display_number ||
                    ticket.order_number?.slice(-4) ||
                    '----'}
                </Text>
              </View>

              {/* Order Type */}
              <View
                style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
              >
                <View
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: '#D1D5DB'
                  }}
                />
                <Text
                  style={{ color: '#9CA3AF', fontSize: 11, fontWeight: '600' }}
                >
                  {orderTypeLabel}
                </Text>
              </View>
            </View>

            {/* Timer */}
            <Text style={{ color: '#9CA3AF', fontSize: 12, fontWeight: '600' }}>
              {timeElapsed}
            </Text>
          </View>

          {/* Customer + Table + Course Info (only shown when populated) */}
          {hasMetaInfo && (
            <View
              style={{
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderBottomWidth: 1,
                borderBottomColor: '#D1D5DB'
              }}
            >
              <Text
                style={{ color: '#6B7280', fontSize: 11, fontWeight: '500' }}
                numberOfLines={1}
              >
                {ticket.customer_name ? ticket.customer_name : ''}
                {ticket.customer_name && ticket.table_name ? ' · ' : ''}
                {ticket.table_name ? `Table ${ticket.table_name}` : ''}
                {ticket.course_number > 1
                  ? ` · Course ${ticket.course_number}`
                  : ''}
              </Text>
            </View>
          )}

          {/* Items list */}
          <View style={{ padding: 12, gap: 6 }}>
            {ticket.items.map((item: KDSTicketItem) => (
              <View
                key={item.id}
                style={{
                  flexDirection: 'row',
                  alignItems: 'flex-start',
                  gap: 6
                }}
              >
                <View
                  style={{
                    backgroundColor: '#E5E7EB',
                    width: 22,
                    height: 22,
                    borderRadius: 4,
                    alignItems: 'center',
                    justifyContent: 'center',
                    minWidth: 22
                  }}
                >
                  <Text
                    style={{
                      color: '#9CA3AF',
                      fontSize: 12,
                      fontWeight: '700'
                    }}
                  >
                    {item.quantity}
                  </Text>
                </View>
                <Text
                  style={{
                    color: '#9CA3AF',
                    fontSize: 13,
                    fontWeight: '500',
                    flex: 1
                  }}
                  numberOfLines={2}
                >
                  {item.name}
                </Text>
              </View>
            ))}
          </View>

          {/* Tap to recall hint */}
          <View
            style={{
              backgroundColor: '#FFFFFF',
              paddingVertical: 6,
              borderTopWidth: 1,
              borderTopColor: '#D1D5DB',
              alignItems: 'center'
            }}
          >
            <Text
              style={{ color: colors.muted, fontSize: 10, fontWeight: '600' }}
            >
              Tap to Recall
            </Text>
          </View>
        </View>
      </Pressable>
    )
  },
  (prev, next) => prev.ticket === next.ticket && prev.onRecall === next.onRecall
)

// ─── Main Screen ──────────────────────────────────────────────────
const KitchenDisplayScreen = () => {
  const router = useRouter()
  const supabase = useSupabaseClient()
  const selectedStore = useStoreSettingsStore(s => s.selectedStore)
  const locationId = selectedStore?.id
  const selectedStation = useStoreSettingsStore(s => s.selectedStation)
  const stationSessionId = useStoreSettingsStore(s => s.stationSessionId)
  const clearStationSession = useStoreSettingsStore(s => s.clearStationSession)
  const kdsConfig = useLocationConfigStore(s => s.config.kds)
  const kdsAutoFireEnabled = kdsConfig.autoFireEnabled
  const kdsAutoFireDelayMinutes = kdsConfig.autoFireDelayMinutes
  const kdsHideDoneItems = kdsConfig.hideDoneItems
  const kdsNewOrderPosition = kdsConfig.newOrderPosition ?? 'right'
  const setNewOrderPosition = useKDSStore(s => s.setNewOrderPosition)

  const tickets = useKDSStore(s => s.tickets)
  const counts = useKDSStore(s => s.counts)
  const isInitialLoading = useKDSStore(s => s.isInitialLoading)
  const hasHydrated = useKDSStore(s => s._hasHydrated)
  const isFetching = useKDSStore(s => s.isFetching)
  const fetchTickets = useKDSStore(s => s.fetchTickets)
  const backgroundFetchTickets = useKDSStore(s => s._backgroundFetchTickets)
  const advanceTicketStatus = useKDSStore(s => s.advanceTicketStatus)
  const fetchKDSDisplay = useKDSStore(s => s.fetchKDSDisplay)
  const kdsDisplayConfig = useKDSStore(s => s.kdsDisplayConfig)
  const enrichedRules = useKDSStore(s => s.enrichedRules)
  const routingMode = useKDSStore(s => s.routingMode)
  const displayName = useKDSStore(s => s.kdsDisplayConfig?.displayName)
  // Bulk mode state from store
  const bulkMode = useKDSStore(s => s.bulkMode)
  const selectedTicketIds = useKDSStore(s => s.selectedTicketIds)
  const toggleBulkMode = useKDSStore(s => s.toggleBulkMode)
  const toggleTicketSelection = useKDSStore(s => s.toggleTicketSelection)
  const selectAllVisible = useKDSStore(s => s.selectAllVisible)
  const clearSelection = useKDSStore(s => s.clearSelection)
  const bulkAdvanceTickets = useKDSStore(s => s.bulkAdvanceTickets)
  const setOnNewOrderCallback = useKDSStore(s => s.setOnNewOrderCallback)
  const recallTicket = useKDSStore(s => s.recallTicket)
  const doneTickets = useKDSStore(s => s.doneTickets)
  const doneCount = useKDSStore(s => s.doneCount)
  const recallDoneTicket = useKDSStore(s => s.recallDoneTicket)
  const prioritizeTicket = useKDSStore(s => s.prioritizeTicket)
  const toggleRush = useKDSStore(s => s.toggleRush)
  const markItemDone = useKDSStore(s => s.markItemDone)
  const isTicketRecalled = useKDSStore(s => s.isTicketRecalled)
  const kdsCleanup = useKDSStore(s => s._cleanup)

  // Cleanup retries + pending actions on unmount
  useEffect(() => () => kdsCleanup(), [kdsCleanup])

  // Sync new order position config into KDS store
  useEffect(() => {
    setNewOrderPosition(kdsNewOrderPosition)
  }, [kdsNewOrderPosition, setNewOrderPosition])

  // Realtime connection status for adaptive polling
  const { orders: ordersChannel } = useLocationRealtime()
  const isRealtimeConnected = ordersChannel.isConnected

  // Employee + toast for PIN verification
  const findEmployeeByPin = useEmployeeStore(s => s.findEmployeeByPin)
  const toast = useToast()

  // KDS display settings (from unified config)
  const kdsHighlightNotes = kdsConfig.highlightNotes
  const kdsItemNameLines = kdsConfig.itemNameLines
  const kdsDisplayModifierGroupName = kdsConfig.displayModifierGroupName
  const kdsDisplayExclusionsAtTop = kdsConfig.displayExclusionsAtTop
  const kdsAlphabeticalSort = kdsConfig.alphabeticalSort
  const kdsAggregateIdenticalItems = kdsConfig.aggregateIdenticalItems
  const kdsYellowThresholdMinutes = kdsConfig.yellowThresholdMinutes
  const kdsOrangeThresholdMinutes = kdsConfig.orangeThresholdMinutes
  const kdsRedThresholdMinutes = kdsConfig.redThresholdMinutes

  const urgencyThresholds = useMemo<UrgencyThresholds>(
    () => ({
      yellow: kdsYellowThresholdMinutes,
      orange: kdsOrangeThresholdMinutes,
      red: kdsRedThresholdMinutes
    }),
    [
      kdsYellowThresholdMinutes,
      kdsOrangeThresholdMinutes,
      kdsRedThresholdMinutes
    ]
  )

  const displaySettings = useMemo<KDSTicketDisplaySettings>(
    () => ({
      highlightNotes: kdsHighlightNotes,
      itemNameLines: kdsItemNameLines,
      modifierGroupName: kdsDisplayModifierGroupName,
      exclusionsAtTop: kdsDisplayExclusionsAtTop,
      alphabeticalSort: kdsAlphabeticalSort,
      aggregateIdenticalItems: kdsAggregateIdenticalItems
    }),
    [
      kdsHighlightNotes,
      kdsItemNameLines,
      kdsDisplayModifierGroupName,
      kdsDisplayExclusionsAtTop,
      kdsAlphabeticalSort,
      kdsAggregateIdenticalItems
    ]
  )

  const workflowMode =
    useLocationConfigStore(s => s.config.kds.workflowMode) ?? '3-step'

  const visibleStatusTabs = useMemo(
    () =>
      workflowMode === '2-step'
        ? STATUS_TABS.filter(t => t.key !== 'pending')
        : STATUS_TABS,
    [workflowMode]
  )

  const [activeStatus, setActiveStatus] = useState<StatusFilter>(
    workflowMode === '2-step' ? 'cooking' : 'pending'
  )

  // Reset active tab when workflow mode changes (e.g. via broadcast from another device)
  useEffect(() => {
    if (workflowMode === '2-step' && activeStatus === 'pending') {
      setActiveStatus('cooking')
    }
  }, [workflowMode])

  const [activeType, setActiveType] = useState<OrderTypeFilter>('all')
  const [refreshing, setRefreshing] = useState(false)
  const [isReady, setIsReady] = useState(false)
  const [showDisconnected, setShowDisconnected] = useState(false)
  const [currentTime, setCurrentTime] = useState(
    new Date().toLocaleTimeString('en-US', {
      hour: 'numeric',
      minute: '2-digit',
      hour12: true
    })
  )

  // PIN modal state
  const [showPinModal, setShowPinModal] = useState(false)
  const [pendingBulkAction, setPendingBulkAction] = useState<
    'selected' | 'all' | null
  >(null)

  // Flying ticket animation state
  const [flyingTickets, setFlyingTickets] = useState<FlyingTicketData[]>([])
  const tabRefs = useRef<Record<string, View | null>>({}).current
  // Cached tab positions — tabs are static, no need to re-measure on every advance
  const tabPosCache = useRef<
    Record<
      string,
      { x: number; y: number; width: number; height: number } | null
    >
  >({})

  // Action menu state (long-press)
  const [actionMenu, setActionMenu] = useState<{
    ticketId: string
    ticket: KDSTicket
    position: { x: number; y: number }
  } | null>(null)

  // Focused ticket state (single-tap selection)
  const [focusedTicketId, setFocusedTicketId] = useState<string | null>(null)

  // KDS logout handler
  const handleKDSLogout = useCallback(async () => {
    if (stationSessionId && selectedStore?.id) {
      try {
        await supabase.rpc('pos_staff_logout', {
          p_session_id: stationSessionId,
          p_location_id: selectedStore.id,
          p_pin_code: '',
          p_device_id: getDeviceId(),
          p_clock_out: false
        })
      } catch (e) {
        console.error('KDS logout RPC error:', e)
      }
    }
    clearStationSession()
    clearStationData()
    replaceRoute('(auth)', 'pin-login')
  }, [stationSessionId, selectedStore?.id, supabase, clearStationSession])

  // Triple-tap station name → logout
  const stationTapCountRef = useRef(0)
  const stationTapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const handleStationTripleTap = useCallback(() => {
    stationTapCountRef.current += 1
    if (stationTapTimerRef.current) clearTimeout(stationTapTimerRef.current)
    if (stationTapCountRef.current >= 3) {
      stationTapCountRef.current = 0
      handleKDSLogout()
      return
    }
    stationTapTimerRef.current = setTimeout(() => {
      stationTapCountRef.current = 0
    }, 600)
  }, [handleKDSLogout])

  // Subscribe to all 3 status arrays — all 3 FlatLists are always mounted
  const pendingTickets = useKDSStore(s => s.ticketsByStatus.pending)
  const cookingTickets = useKDSStore(s => s.ticketsByStatus.cooking)
  const readyTickets = useKDSStore(s => s.ticketsByStatus.ready)

  // Start the single global timer
  useKDSTimer()

  // Initialize KDS display config for this station
  useEffect(() => {
    if (selectedStation?.id) {
      fetchKDSDisplay(selectedStation.id)
    }
  }, [selectedStation?.id, fetchKDSDisplay])

  // Update time display every 30 seconds
  useEffect(() => {
    const timer = setInterval(() => {
      setCurrentTime(
        new Date().toLocaleTimeString('en-US', {
          hour: 'numeric',
          minute: '2-digit',
          hour12: true
        })
      )
    }, 30000)
    return () => clearInterval(timer)
  }, [])

  // Dynamic column count from KDS display config
  const columnCount = kdsDisplayConfig?.columns ?? 4

  // Deferred loading after navigation animation
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      setIsReady(true)
    })
    return () => handle.cancel()
  }, [])

  // Track realtime connection in a ref to avoid polling teardown on flaps
  const isRealtimeConnectedRef = useRef(isRealtimeConnected)
  const prevRealtimeConnectedRef = useRef(isRealtimeConnected)
  useEffect(() => {
    isRealtimeConnectedRef.current = isRealtimeConnected
  }, [isRealtimeConnected])

  // Debounce disconnected indicator — only show after 2s of being disconnected
  useEffect(() => {
    if (isRealtimeConnected) {
      setShowDisconnected(false)
      return
    }
    const timer = setTimeout(() => setShowDisconnected(true), 2000)
    return () => clearTimeout(timer)
  }, [isRealtimeConnected])

  // Initial fetch + adaptive polling via setTimeout chain
  // Display-filtered KDS stations use 30s polling as a safety net since
  // client-side broadcast filtering may miss items that server-side routing includes.
  const hasDisplayFilter = routingMode !== null && routingMode !== 'all'
  useEffect(() => {
    if (!isReady || !locationId) return

    fetchTickets(locationId)

    let timeoutId: ReturnType<typeof setTimeout>
    const schedulePoll = () => {
      const interval = isRealtimeConnectedRef.current
        ? hasDisplayFilter
          ? 30_000
          : 120_000
        : 15_000
      timeoutId = setTimeout(() => {
        backgroundFetchTickets(locationId)
        schedulePoll()
      }, interval)
    }
    schedulePoll()

    return () => clearTimeout(timeoutId)
  }, [
    isReady,
    locationId,
    fetchTickets,
    backgroundFetchTickets,
    hasDisplayFilter
  ])

  // On reconnection (false -> true), trigger a single background fetch
  useEffect(() => {
    const wasDisconnected = !prevRealtimeConnectedRef.current
    prevRealtimeConnectedRef.current = isRealtimeConnected
    if (isRealtimeConnected && wasDisconnected && isReady && locationId) {
      backgroundFetchTickets(locationId)
    }
  }, [isRealtimeConnected, isReady, locationId, backgroundFetchTickets])

  // Auto-fire: pending → cooking after configured delay
  useEffect(() => {
    if (!kdsAutoFireEnabled || !isReady) return

    const intervalId = setInterval(() => {
      const now = Date.now()
      const delayMs = kdsAutoFireDelayMinutes * 60 * 1000

      pendingTickets.forEach(ticket => {
        if (ticket.start_time_epoch === 0) return
        const elapsed = now - ticket.start_time_epoch
        if (elapsed >= delayMs) {
          const displayNum =
            ticket.display_number ?? ticket.order_number?.slice(-4) ?? '?'
          toast.show({
            title: `#${displayNum} auto-fired`,
            message: `Started preparing after ${kdsAutoFireDelayMinutes}m`,
            type: 'info',
            duration: 3000
          })
          advanceTicketStatus(
            ticket.ticket_id,
            ticket.items.map(i => i.id),
            'preparing'
          )
        }
      })
    }, 15_000)

    return () => clearInterval(intervalId)
  }, [
    kdsAutoFireEnabled,
    kdsAutoFireDelayMinutes,
    pendingTickets,
    isReady,
    advanceTicketStatus,
    toast
  ])

  // Auto-bump: ready → served after configured delay
  const autoBumpMinutes = kdsDisplayConfig?.autoBumpMinutes
  useEffect(() => {
    if (!autoBumpMinutes || !isReady) return

    const intervalId = setInterval(() => {
      const now = Date.now()
      const delayMs = autoBumpMinutes * 60 * 1000

      readyTickets.forEach(ticket => {
        if (ticket.start_time_epoch === 0) return
        // Skip recalled tickets — check item-level flag (persisted in MMKV, survives
        // hot-reloads) + module-level Set (fast path) as belt-and-suspenders
        if (
          ticket.items.some(i => i.recalled) ||
          isTicketRecalled(ticket.ticket_id)
        )
          return
        if (now - ticket.start_time_epoch >= delayMs) {
          const displayNum =
            ticket.display_number ?? ticket.order_number?.slice(-4) ?? '?'
          toast.show({
            title: `#${displayNum} auto-bumped`,
            message: `Ticket served after ${autoBumpMinutes}m`,
            type: 'info',
            duration: 3000
          })
          advanceTicketStatus(
            ticket.ticket_id,
            ticket.items.map(i => i.id),
            'served'
          )
        }
      })
    }, 15_000)

    return () => clearInterval(intervalId)
  }, [autoBumpMinutes, readyTickets, isReady, advanceTicketStatus, isTicketRecalled, toast])

  // ─── Sound notifications on new orders ────────────────────────
  const soundServiceRef = useRef<KDSSoundService | null>(null)

  // Initialize sound service and register callback
  useEffect(() => {
    const service = new KDSSoundService()
    soundServiceRef.current = service
    service.init()

    setOnNewOrderCallback(orderSource => {
      service.playForSource(orderSource)
    })

    return () => {
      setOnNewOrderCallback(null)
      service.dispose()
      soundServiceRef.current = null
    }
  }, [setOnNewOrderCallback])

  // Sync display config into sound service
  useEffect(() => {
    const service = soundServiceRef.current
    if (!service) return

    const soundEnabled = kdsDisplayConfig?.soundOnNewOrder ?? false
    service.setEnabled(soundEnabled)

    if (kdsDisplayConfig?.soundConfig) {
      service.updateConfig(kdsDisplayConfig.soundConfig)
    } else {
      service.updateConfig(DEFAULT_SOUND_CONFIG)
    }
  }, [kdsDisplayConfig?.soundOnNewOrder, kdsDisplayConfig?.soundConfig])

  // Clear selection on tab switch
  const handleSetActiveStatus = useCallback(
    (status: StatusFilter) => {
      setActiveStatus(status)
      setFocusedTicketId(null)
      if (bulkMode) clearSelection()
    },
    [bulkMode, clearSelection]
  )

  // Pre-filter ALL 3 status arrays by order type (so all FlatLists stay current)
  const filteredPending = useMemo(() => {
    if (activeType === 'all') return pendingTickets
    return pendingTickets.filter(t => matchesTypeFilter(t, activeType))
  }, [pendingTickets, activeType])

  const filteredCooking = useMemo(() => {
    if (activeType === 'all') return cookingTickets
    return cookingTickets.filter(t => matchesTypeFilter(t, activeType))
  }, [cookingTickets, activeType])

  const filteredReady = useMemo(() => {
    if (activeType === 'all') return readyTickets
    return readyTickets.filter(t => matchesTypeFilter(t, activeType))
  }, [readyTickets, activeType])

  const filteredDone = useMemo(() => {
    if (activeType === 'all') return doneTickets
    return doneTickets.filter(t => matchesTypeFilter(t, activeType))
  }, [doneTickets, activeType])

  const filteredByStatus: Record<StatusFilter, KDSTicket[]> = useMemo(
    () => ({
      pending: filteredPending,
      cooking: filteredCooking,
      ready: filteredReady,
      done: filteredDone
    }),
    [filteredPending, filteredCooking, filteredReady, filteredDone]
  )

  // Active tab's filtered data — for bulk actions / select-all
  const activeFilteredTickets = filteredByStatus[activeStatus]

  // Type counts for badge display (active tab only)
  const activeRawTickets =
    activeStatus === 'pending'
      ? pendingTickets
      : activeStatus === 'cooking'
      ? cookingTickets
      : activeStatus === 'ready'
      ? readyTickets
      : doneTickets

  const typeCounts = useMemo(() => {
    const result: Record<OrderTypeFilter, number> = {
      all: activeRawTickets.length,
      delivery: 0,
      takeout: 0,
      dine_in: 0
    }
    for (const t of activeRawTickets) {
      const ot = (t.order_type || '').toLowerCase()
      if (ot === 'delivery') result.delivery++
      else if (ot === 'takeout' || ot === 'to_go' || ot === 'to go')
        result.takeout++
      else result.dine_in++
    }
    return result
  }, [activeRawTickets])

  const onRefresh = useCallback(async () => {
    if (!locationId) return
    setRefreshing(true)
    try {
      await fetchTickets(locationId)
    } catch (error) {
      console.error('KDS Refresh Failed:', error)
    } finally {
      setRefreshing(false)
    }
  }, [locationId, fetchTickets])

  // ─── Bulk Action Handlers ───────────────────────────────────────
  const handleBulkAction = useCallback((action: 'selected' | 'all') => {
    setPendingBulkAction(action)
    setShowPinModal(true)
  }, [])

  const handlePinConfirm = useCallback(
    async (pin: string) => {
      const employee = findEmployeeByPin(pin)
      if (!employee) {
        toast.show({
          title: 'Invalid PIN',
          message: 'No employee found with that PIN.',
          type: 'error'
        })
        return
      }

      if (!MANAGER_ROLES.includes(employee.role)) {
        toast.show({
          title: 'Unauthorized',
          message: 'Only managers can perform bulk operations.',
          type: 'error'
        })
        return
      }

      // PIN is valid and employee is a manager — execute bulk action
      setShowPinModal(false)

      const ticketIdsToAdvance =
        pendingBulkAction === 'all'
          ? activeFilteredTickets.map(t => t.ticket_id)
          : Array.from(selectedTicketIds)

      if (ticketIdsToAdvance.length === 0) {
        toast.show({
          title: 'No Tickets',
          message: 'No tickets to advance.',
          type: 'warning'
        })
        setPendingBulkAction(null)
        return
      }

      bulkAdvanceTickets(ticketIdsToAdvance, locationId || '')

      toast.show({
        title: 'Bulk Advance',
        message: `${ticketIdsToAdvance.length} ticket(s) advanced by ${employee.fullName}.`,
        type: 'success'
      })
      setPendingBulkAction(null)
    },
    [
      findEmployeeByPin,
      pendingBulkAction,
      activeFilteredTickets,
      selectedTicketIds,
      bulkAdvanceTickets,
      locationId,
      toast
    ]
  )

  const handlePinCancel = useCallback(() => {
    setShowPinModal(false)
    setPendingBulkAction(null)
  }, [])

  const handleSelectAll = useCallback(() => {
    selectAllVisible(activeFilteredTickets.map(t => t.ticket_id))
  }, [selectAllVisible, activeFilteredTickets])

  // ─── Long-Press Action Menu Handlers ────────────────────────────
  const handleTicketLongPress = useCallback(
    (ticketId: string, ticket: KDSTicket, event: GestureResponderEvent) => {
      const { pageX, pageY } = event.nativeEvent
      setActionMenu({ ticketId, ticket, position: { x: pageX, y: pageY } })
    },
    []
  )

  const handleDismissActionMenu = useCallback(() => {
    setActionMenu(null)
  }, [])

  const handleRecall = useCallback(() => {
    if (!actionMenu) return
    recallTicket(actionMenu.ticketId)
    setActionMenu(null)
  }, [actionMenu, recallTicket])

  const handlePrioritize = useCallback(() => {
    if (!actionMenu) return
    prioritizeTicket(actionMenu.ticketId)
    // Play alert sound for prioritize
    soundServiceRef.current?.playPreview('alert')
    setActionMenu(null)
  }, [actionMenu, prioritizeTicket])

  const handleToggleRush = useCallback(() => {
    if (!actionMenu) return
    toggleRush(actionMenu.ticketId)
    setActionMenu(null)
  }, [actionMenu, toggleRush])

  const handleItemPress = useCallback(
    (ticketId: string, itemId: string) => {
      markItemDone(ticketId, itemId)
    },
    [markItemDone]
  )

  // Remove completed flying ticket
  const handleFlyingComplete = useCallback((id: string) => {
    setFlyingTickets(prev => prev.filter(t => t.id !== id))
  }, [])

  // Wrap advanceTicketStatus with undo toast + flying animation
  const advanceWithUndo = useCallback(
    (
      ticketId: string,
      itemIds: string[],
      newStatus: 'preparing' | 'ready' | 'served',
      cardPos?: CardPosition
    ) => {
      // Read ticket data before advancing (advance mutates the store)
      const ticket = useKDSStore.getState()._ticketsById[ticketId]
      const displayNum =
        ticket?.display_number || ticket?.order_number?.slice(-4) || '----'
      const statusLabel =
        newStatus === 'preparing'
          ? 'Cooking'
          : newStatus === 'ready'
          ? 'Served'
          : 'Done'
      const urgencyColor = ticket
        ? URGENCY_BORDER_COLORS[
            getUrgencyLevel(ticket.start_time_epoch, urgencyThresholds)
          ]
        : colors.border

      // Fire store update FIRST — this is the critical path
      advanceTicketStatus(ticketId, itemIds, newStatus)

      // Trigger flying animation using cached tab positions (no async measureInWindow)
      if (cardPos) {
        const destTabKey =
          newStatus === 'preparing'
            ? 'cooking'
            : newStatus === 'ready'
            ? 'ready'
            : 'done'
        const cached = tabPosCache.current[destTabKey]
        if (cached) {
          // Synchronous — no frame delay
          setFlyingTickets(prev => [
            ...prev,
            {
              id: `fly_${ticketId}_${Date.now()}`,
              orderNumber: displayNum,
              urgencyColor,
              itemCount: ticket?.item_count ?? itemIds.length,
              source: cardPos,
              destination: cached
            }
          ])
        } else {
          // First time — measure and cache, then spawn flying ticket
          const tabRef = tabRefs[destTabKey]
          if (tabRef) {
            tabRef.measureInWindow((tx, ty, tw, th) => {
              if (tx === 0 && ty === 0 && tw === 0 && th === 0) return
              const pos = { x: tx, y: ty, width: tw, height: th }
              tabPosCache.current[destTabKey] = pos
              setFlyingTickets(prev => [
                ...prev,
                {
                  id: `fly_${ticketId}_${Date.now()}`,
                  orderNumber: displayNum,
                  urgencyColor,
                  itemCount: ticket?.item_count ?? itemIds.length,
                  source: cardPos,
                  destination: pos
                }
              ])
            })
          }
        }
      }

      // Build rich context for undo toast subtitle
      const tablePart = ticket?.table_name ? `Table ${ticket.table_name}` : ''
      const typePart = getOrderTypeLabel(ticket?.order_type ?? null)
      const itemPart = `${ticket?.item_count ?? itemIds.length} items`
      const parts = [tablePart, typePart, itemPart].filter(Boolean)
      const message = parts.join(' · ')

      toast.show({
        title: `Ticket ${displayNum} → ${statusLabel}`,
        message,
        type: 'success',
        duration: 5000,
        onUndo: () => {
          if (newStatus === 'served') {
            recallDoneTicket(ticketId)
          } else {
            recallTicket(ticketId)
          }
        }
      })
    },
    [
      advanceTicketStatus,
      recallTicket,
      recallDoneTicket,
      toast,
      urgencyThresholds,
      tabRefs
    ]
  )

  const _updateKdsConfig = useLocationConfigStore(s => s.updateConfig)
  const handleToggleHideDone = useCallback(() => {
    _updateKdsConfig('kds', { hideDoneItems: !kdsHideDoneItems })
  }, [kdsHideDoneItems, _updateKdsConfig])

  // ─── Render Helpers ─────────────────────────────────────────────
  const columnWidthPct = `${100 / columnCount}%` as const
  const renderItem = useCallback(
    ({ item }: { item: KDSTicket }) => (
      <Animated.View
        style={{ width: columnWidthPct, paddingHorizontal: 2 }}
        exiting={CARD_EXIT_ANIM}
      >
        <KDSTicketCard
          ticket={item}
          onAdvance={advanceWithUndo}
          bulkMode={bulkMode}
          onToggleSelect={toggleTicketSelection}
          onFocus={setFocusedTicketId}
          isFocused={focusedTicketId === item.ticket_id}
          onLongPress={handleTicketLongPress}
          onItemPress={workflowMode === '2-step' ? handleItemPress : undefined}
          hideDoneItems={kdsHideDoneItems}
          displaySettings={displaySettings}
          urgencyThresholds={urgencyThresholds}
        />
      </Animated.View>
    ),
    [
      advanceWithUndo,
      bulkMode,
      toggleTicketSelection,
      setFocusedTicketId,
      focusedTicketId,
      handleTicketLongPress,
      handleItemPress,
      workflowMode,
      kdsHideDoneItems,
      displaySettings,
      urgencyThresholds,
      columnWidthPct
    ]
  )

  const renderDoneItem = useCallback(
    ({ item }: { item: KDSTicket }) => (
      <View style={{ width: columnWidthPct, paddingHorizontal: 2 }}>
        <KDSDoneTicketCard ticket={item} onRecall={recallDoneTicket} />
      </View>
    ),
    [recallDoneTicket, columnWidthPct]
  )

  const keyExtractor = useCallback((item: KDSTicket) => item.ticket_id, [])

  // Skeleton grid for loading state
  const renderSkeletons = () => (
    <View
      style={{ flex: 1, flexDirection: 'row', flexWrap: 'wrap', padding: 4 }}
    >
      {Array.from({ length: columnCount * 4 }).map((_, i) => (
        <View
          key={`skel-${i}`}
          style={{ width: columnWidthPct, paddingHorizontal: 2 }}
        >
          <KDSSkeletonCard />
        </View>
      ))}
    </View>
  )

  const selectionCount = selectedTicketIds.size

  return (
    <View style={{ flex: 1, backgroundColor: colors.screen }}>
      {/* ─── Header ─── */}
      <View
        style={{
          backgroundColor: colors.panel,
          borderBottomWidth: 1,
          borderBottomColor: colors.border,
          paddingHorizontal: 16,
          paddingVertical: 10
        }}
      >
        {/* Single row: status tabs (left) — order types + station info (right) */}
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          {/* LEFT: Status tabs */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {visibleStatusTabs.map(tab => {
              const isActive = activeStatus === tab.key
              return (
                <View
                  key={tab.key}
                  ref={r => {
                    tabRefs[tab.key] = r
                  }}
                  collapsable={false}
                >
                  <TouchableOpacity
                    onPress={() => handleSetActiveStatus(tab.key)}
                    style={{
                      paddingHorizontal: 12,
                      paddingVertical: 6,
                      borderRadius: 16,
                      backgroundColor: isActive
                        ? colors.teal + '20'
                        : 'transparent',
                      borderWidth: 1,
                      borderColor: isActive
                        ? colors.teal + '50'
                        : colors.border,
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 6
                    }}
                  >
                    <Text
                      style={{
                        color: isActive ? colors.teal : colors.label,
                        fontSize: 13,
                        fontWeight: isActive ? '700' : '500'
                      }}
                    >
                      {tab.label}
                    </Text>
                    <View
                      style={{
                        backgroundColor: isActive
                          ? colors.teal + '50'
                          : colors.border,
                        paddingHorizontal: 6,
                        paddingVertical: 1,
                        borderRadius: 8,
                        minWidth: 22,
                        alignItems: 'center'
                      }}
                    >
                      <Text
                        style={{
                          color: isActive ? colors.teal : colors.label,
                          fontSize: 11,
                          fontWeight: '700',
                          opacity: isFetching ? 0.7 : 1
                        }}
                      >
                        {tab.key === 'done' ? doneCount : counts[tab.key]}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )
            })}
          </View>

          {/* RIGHT: Order types + display badge + station/time */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {/* Order type filters */}
            {TYPE_TABS.map(tab => {
              const isActive = activeType === tab.key
              const count = typeCounts[tab.key]
              return (
                <TouchableOpacity
                  key={tab.key}
                  onPress={() => setActiveType(tab.key)}
                  style={{
                    paddingHorizontal: 12,
                    paddingVertical: 6,
                    borderRadius: 14,
                    backgroundColor: isActive
                      ? colors.teal + '20'
                      : 'transparent',
                    borderWidth: 1,
                    borderColor: isActive ? colors.teal + '50' : colors.border,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 4
                  }}
                >
                  <Text
                    style={{
                      color: isActive ? colors.teal : colors.label,
                      fontSize: 12,
                      fontWeight: isActive ? '600' : '500'
                    }}
                  >
                    {tab.label}
                  </Text>
                  {count > 0 && (
                    <View
                      style={{
                        backgroundColor: isActive
                          ? colors.teal + '50'
                          : colors.border,
                        paddingHorizontal: 5,
                        paddingVertical: 1,
                        borderRadius: 6
                      }}
                    >
                      <Text
                        style={{
                          color: isActive ? colors.teal : colors.label,
                          fontSize: 10,
                          fontWeight: '600'
                        }}
                      >
                        {count}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              )
            })}

            {/* Divider */}
            <View
              style={{ width: 1, height: 20, backgroundColor: colors.border }}
            />

            {/* KDS Display Badge */}
            {displayName && (
              <View
                style={{
                  flexDirection: 'row',
                  alignItems: 'center',
                  backgroundColor: colors.teal + '15',
                  paddingHorizontal: 10,
                  paddingVertical: 5,
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: colors.teal + '30',
                  gap: 4
                }}
              >
                <Flame size={13} color={colors.urgencyElevated} />
                <Text
                  style={{
                    color: colors.heading,
                    fontSize: 12,
                    fontWeight: '600'
                  }}
                  numberOfLines={1}
                >
                  {displayName}
                </Text>
                {routingMode === 'all' ? (
                  <>
                    <View
                      style={{
                        width: 1,
                        height: 14,
                        backgroundColor: colors.muted
                      }}
                    />
                    <Text
                      style={{
                        color: colors.success,
                        fontSize: 11,
                        fontWeight: '700'
                      }}
                    >
                      EXPO
                    </Text>
                  </>
                ) : enrichedRules.length > 0 ? (
                  <>
                    <View
                      style={{
                        width: 1,
                        height: 14,
                        backgroundColor: colors.muted
                      }}
                    />
                    <CircleDotDashed size={12} color={colors.label} />
                    <Text
                      style={{
                        color: colors.label,
                        fontSize: 11,
                        fontWeight: '500'
                      }}
                      numberOfLines={1}
                    >
                      {enrichedRules.map(r => r.label).join(', ')}
                    </Text>
                  </>
                ) : null}
              </View>
            )}

            {/* Auto-fire badge */}
            {kdsAutoFireEnabled && kdsAutoFireDelayMinutes ? (
              <>
                <View style={{ width: 1, height: 20, backgroundColor: colors.border }} />
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.info + '15',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.info + '30',
                    gap: 4
                  }}
                >
                  <Flame size={11} color={colors.info} />
                  <Text style={{ color: colors.info, fontSize: 11, fontWeight: '600' }}>
                    Fire {kdsAutoFireDelayMinutes}m
                  </Text>
                </View>
              </>
            ) : null}

            {/* Auto-bump badge */}
            {autoBumpMinutes ? (
              <>
                <View
                  style={{ width: 1, height: 20, backgroundColor: colors.border }}
                />
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    backgroundColor: colors.warning + '15',
                    paddingHorizontal: 8,
                    paddingVertical: 4,
                    borderRadius: 10,
                    borderWidth: 1,
                    borderColor: colors.warning + '30',
                    gap: 4
                  }}
                >
                  <ArrowUpToLine size={11} color={colors.warning} />
                  <Text
                    style={{
                      color: colors.warning,
                      fontSize: 11,
                      fontWeight: '600'
                    }}
                  >
                    Auto {autoBumpMinutes}m
                  </Text>
                </View>
              </>
            ) : null}

            {/* Divider */}
            <View
              style={{ width: 1, height: 20, backgroundColor: colors.border }}
            />

            {/* Station Name | Time + Dot */}
            <View
              style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}
            >
              {selectedStation?.station_name && (
                <TouchableOpacity
                  onPress={handleStationTripleTap}
                  activeOpacity={1}
                >
                  <Text
                    style={{
                      color: colors.label,
                      fontSize: 12,
                      fontWeight: '500'
                    }}
                  >
                    {selectedStation.station_name}
                  </Text>
                </TouchableOpacity>
              )}
              {selectedStation?.station_name && (
                <Text style={{ color: colors.muted, fontSize: 12 }}>|</Text>
              )}
              <Text
                style={{ color: colors.label, fontSize: 12, fontWeight: '500' }}
              >
                {currentTime}
              </Text>
              {showDisconnected ? (
                <View
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: 4,
                    backgroundColor: colors.danger,
                    marginLeft: 4
                  }}
                />
              ) : (
                <PulsingDot />
              )}
            </View>
          </View>
        </View>
      </View>

      {/* ─── Bulk Action Bar ─── */}
      {bulkMode && activeStatus !== 'done' && (
        <View
          style={{
            backgroundColor: colors.panel,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            paddingHorizontal: 16,
            paddingVertical: 8,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Text style={{ color: colors.label, fontSize: 13 }}>
              {selectionCount} selected
            </Text>
            <TouchableOpacity
              onPress={handleSelectAll}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: colors.teal + '20',
                borderWidth: 1,
                borderColor: colors.teal + '50',
                borderRadius: 6
              }}
            >
              <Text
                style={{ color: colors.teal, fontSize: 12, fontWeight: '600' }}
              >
                Select All
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={clearSelection}
              style={{
                paddingHorizontal: 10,
                paddingVertical: 4,
                backgroundColor: 'transparent',
                borderWidth: 1,
                borderColor: colors.border,
                borderRadius: 6
              }}
            >
              <Text
                style={{ color: colors.label, fontSize: 12, fontWeight: '600' }}
              >
                Clear
              </Text>
            </TouchableOpacity>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              onPress={() => handleBulkAction('selected')}
              disabled={selectionCount === 0}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor:
                  selectionCount > 0 ? colors.teal + '20' : 'transparent',
                borderWidth: 1,
                borderColor:
                  selectionCount > 0 ? colors.teal + '50' : colors.border,
                borderRadius: 6,
                opacity: selectionCount > 0 ? 1 : 0.5
              }}
            >
              <Text
                style={{
                  color: selectionCount > 0 ? colors.teal : colors.label,
                  fontSize: 12,
                  fontWeight: '700'
                }}
              >
                Advance Selected
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={() => handleBulkAction('all')}
              disabled={activeFilteredTickets.length === 0}
              style={{
                paddingHorizontal: 12,
                paddingVertical: 6,
                backgroundColor:
                  activeFilteredTickets.length > 0
                    ? colors.danger + '20'
                    : 'transparent',
                borderWidth: 1,
                borderColor:
                  activeFilteredTickets.length > 0
                    ? colors.danger + '50'
                    : colors.border,
                borderRadius: 6,
                opacity: activeFilteredTickets.length > 0 ? 1 : 0.5
              }}
            >
              <Text
                style={{
                  color:
                    activeFilteredTickets.length > 0
                      ? colors.danger
                      : colors.label,
                  fontSize: 12,
                  fontWeight: '700'
                }}
              >
                Advance All in Tab
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ─── Grid: 4 pre-mounted FlatLists stacked ─── */}
      {!isReady || (isInitialLoading && !hasHydrated) ? (
        renderSkeletons()
      ) : (
        <Pressable
          style={{ flex: 1, position: 'relative' }}
          onPress={() => focusedTicketId && setFocusedTicketId(null)}
        >
          {(['pending', 'cooking', 'ready'] as const).map(status => {
            const isActive = activeStatus === status
            return (
              <View
                key={status}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  opacity: isActive ? 1 : 0,
                  zIndex: isActive ? 1 : 0
                }}
                pointerEvents={isActive ? 'auto' : 'none'}
              >
                <Animated.FlatList
                  key={columnCount}
                  data={filteredByStatus[status]}
                  keyExtractor={keyExtractor}
                  renderItem={renderItem}
                  numColumns={columnCount}
                  itemLayoutAnimation={LAYOUT_ANIM}
                  contentContainerStyle={{ padding: 4, paddingBottom: 20 }}
                  initialNumToRender={16}
                  maxToRenderPerBatch={8}
                  windowSize={5}
                  removeClippedSubviews={false}
                  extraData={bulkMode}
                  ListEmptyComponent={
                    <View
                      style={{
                        flex: 1,
                        alignItems: 'center',
                        justifyContent: 'center',
                        paddingVertical: 60
                      }}
                    >
                      <Text style={{ color: colors.muted, fontSize: 14 }}>
                        No {status} tickets
                      </Text>
                    </View>
                  }
                />
              </View>
            )
          })}
          {/* Done tab — separate FlatList with gray card renderer */}
          <View
            key='done'
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              opacity: activeStatus === 'done' ? 1 : 0,
              zIndex: activeStatus === 'done' ? 1 : 0
            }}
            pointerEvents={activeStatus === 'done' ? 'auto' : 'none'}
          >
            <Animated.FlatList
              key={columnCount}
              data={filteredDone}
              keyExtractor={keyExtractor}
              renderItem={renderDoneItem}
              numColumns={columnCount}
              contentContainerStyle={{ padding: 4, paddingBottom: 20 }}
              initialNumToRender={16}
              maxToRenderPerBatch={8}
              windowSize={5}
              removeClippedSubviews={false}
              ListEmptyComponent={
                <View
                  style={{
                    flex: 1,
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingVertical: 60
                  }}
                >
                  <Text style={{ color: colors.muted, fontSize: 14 }}>
                    No done tickets
                  </Text>
                </View>
              }
            />
          </View>
        </Pressable>
      )}

      {/* ─── Bottom Action Bar ─── */}
      {focusedTicketId && activeStatus !== 'done' && (
        <View
          style={{
            backgroundColor: colors.panel,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            paddingHorizontal: 16,
            paddingVertical: 12,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 12
          }}
        >
          {/* RECALL button — only show if ticket is ready */}
          {focusedTicketId &&
            tickets.find(t => t.ticket_id === focusedTicketId)?.status ===
              'ready' && (
              <TouchableOpacity
                onPress={() => {
                  if (focusedTicketId) {
                    recallTicket(focusedTicketId)
                    setFocusedTicketId(null)
                  }
                }}
                style={{
                  paddingHorizontal: 12,
                  paddingVertical: 6,
                  backgroundColor: 'transparent',
                  borderWidth: 1,
                  borderColor: colors.border,
                  borderRadius: 10,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 6
                }}
              >
                <RotateCcw size={14} color={colors.label} />
                <Text
                  style={{
                    color: colors.label,
                    fontSize: 12,
                    fontWeight: '600'
                  }}
                >
                  RECALL
                </Text>
              </TouchableOpacity>
            )}

          {/* BUMP ORDER button (center, teal) */}
          <TouchableOpacity
            onPress={() => {
              const ticket = tickets.find(t => t.ticket_id === focusedTicketId)
              if (ticket) {
                const itemIds = ticket.items.map(i => i.id)
                let newStatus: 'preparing' | 'ready' | 'served' | undefined
                if (ticket.status === 'pending') newStatus = 'preparing'
                else if (ticket.status === 'cooking') newStatus = 'ready'
                else if (ticket.status === 'ready') newStatus = 'served'
                if (newStatus) {
                  advanceTicketStatus(focusedTicketId, itemIds, newStatus)
                  setFocusedTicketId(null)
                }
              }
            }}
            style={{
              paddingHorizontal: 14,
              paddingVertical: 8,
              backgroundColor: colors.teal + '20',
              borderWidth: 1,
              borderColor: colors.teal + '50',
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 6
            }}
          >
            <CheckSquare size={18} color={colors.teal} />
            <Text
              style={{ color: colors.teal, fontSize: 13, fontWeight: '700' }}
            >
              BUMP ORDER
            </Text>
          </TouchableOpacity>

          {/* CANCEL button */}
          <TouchableOpacity
            onPress={() => setFocusedTicketId(null)}
            style={{
              paddingHorizontal: 12,
              paddingVertical: 6,
              backgroundColor: 'transparent',
              borderWidth: 1,
              borderColor: colors.border,
              borderRadius: 10,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 6
            }}
          >
            <Text
              style={{ color: colors.label, fontSize: 12, fontWeight: '600' }}
            >
              CANCEL
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ─── Flying Ticket Overlays ─── */}
      {flyingTickets.map(ft => (
        <KDSFlyingTicket
          key={ft.id}
          ticket={ft}
          onComplete={handleFlyingComplete}
        />
      ))}

      {/* ─── Action Menu Overlay ─── */}
      {actionMenu && (
        <Pressable
          onPress={handleDismissActionMenu}
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            zIndex: 100,
            backgroundColor: 'rgba(0,0,0,0.18)'
          }}
        >
          {(() => {
            const orderLabel =
              actionMenu.ticket.display_number ||
              actionMenu.ticket.order_number?.slice(-4) ||
              '----'
            const statusText =
              actionMenu.ticket.status === 'pending'
                ? 'Pending'
                : actionMenu.ticket.status === 'cooking'
                ? 'Cooking'
                : actionMenu.ticket.status === 'ready'
                ? 'Ready'
                : 'Done'
            const statusColor =
              actionMenu.ticket.status === 'pending'
                ? colors.warning
                : actionMenu.ticket.status === 'cooking'
                ? colors.info
                : actionMenu.ticket.status === 'ready'
                ? colors.success
                : colors.muted
            const menuWidth = 236
            const screen = Dimensions.get('window')
            const left = Math.max(
              12,
              Math.min(
                actionMenu.position.x - 10,
                screen.width - menuWidth - 12
              )
            )
            const top = Math.max(
              12,
              Math.min(actionMenu.position.y - 10, screen.height - 210)
            )

            return (
              <View
                style={{
                  position: 'absolute',
                  top,
                  left,
                  width: menuWidth,
                  backgroundColor: '#FFFFFF',
                  borderRadius: 12,
                  borderWidth: 1,
                  borderColor: '#E5E7EB',
                  padding: 8,
                  shadowColor: '#000',
                  shadowOffset: { width: 0, height: 8 },
                  shadowOpacity: 0.14,
                  shadowRadius: 16,
                  elevation: 12,
                  zIndex: 101
                }}
              >
                <View
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    marginBottom: 6
                  }}
                >
                  <Text
                    style={{
                      color: '#111827',
                      fontSize: 14,
                      fontWeight: '800'
                    }}
                  >
                    Order #{orderLabel}
                  </Text>
                  <View
                    style={{
                      backgroundColor: statusColor + '20',
                      borderWidth: 1,
                      borderColor: statusColor + '55',
                      borderRadius: 999,
                      paddingHorizontal: 8,
                      paddingVertical: 2
                    }}
                  >
                    <Text
                      style={{
                        color: statusColor,
                        fontSize: 10,
                        fontWeight: '700'
                      }}
                    >
                      {statusText}
                    </Text>
                  </View>
                </View>

                <Text
                  style={{ color: '#6B7280', fontSize: 10, marginBottom: 8 }}
                  numberOfLines={1}
                >
                  {getOrderTypeLabel(actionMenu.ticket.order_type)}
                  {actionMenu.ticket.table_name
                    ? ` · Table ${actionMenu.ticket.table_name}`
                    : ''}
                  {actionMenu.ticket.item_count
                    ? ` · ${actionMenu.ticket.item_count} items`
                    : ''}
                </Text>

                {/* Recall — only for ready tickets */}
                {actionMenu.ticket.status === 'ready' && (
                  <Pressable
                    onPress={handleRecall}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      paddingHorizontal: 12,
                      paddingVertical: 8,
                      borderRadius: 8,
                      borderWidth: 1,
                      borderColor: colors.teal + '66',
                      backgroundColor: colors.teal + '16',
                      marginBottom: 6
                    }}
                  >
                    <View
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: 8
                      }}
                    >
                      <RotateCcw size={15} color={colors.teal} />
                      <Text
                        style={{
                          color: '#111827',
                          fontSize: 13,
                          fontWeight: '700'
                        }}
                      >
                        Recall
                      </Text>
                    </View>
                  </Pressable>
                )}

                {/* Recall — only for ready tickets */}
                {/* Prioritize */}
                <Pressable
                  onPress={handlePrioritize}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.teal + '66',
                    backgroundColor: colors.teal + '16',
                    marginBottom: 6
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <ArrowUpToLine size={15} color={colors.teal} />
                    <Text
                      style={{
                        color: '#111827',
                        fontSize: 13,
                        fontWeight: '700'
                      }}
                    >
                      {actionMenu.ticket.prioritized
                        ? 'Unprioritize'
                        : 'Prioritize'}
                    </Text>
                  </View>
                </Pressable>

                {/* Rush / Un-Rush */}
                <Pressable
                  onPress={handleToggleRush}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: 8,
                    borderWidth: 1,
                    borderColor: colors.teal + '66',
                    backgroundColor: colors.teal + '16'
                  }}
                >
                  <View
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8
                    }}
                  >
                    <Flame size={15} color={colors.teal} />
                    <Text
                      style={{
                        color: '#111827',
                        fontSize: 13,
                        fontWeight: '700'
                      }}
                    >
                      {actionMenu.ticket.items.some(i => i.rush)
                        ? 'Remove Rush'
                        : 'Mark Rush'}
                    </Text>
                  </View>
                </Pressable>
              </View>
            )
          })()}
        </Pressable>
      )}

      {/* ─── PIN Modal ─── */}
      <PinInputModal
        isOpen={showPinModal}
        title='Manager PIN Required'
        subtitle='Enter a manager PIN to perform bulk operations'
        onConfirm={handlePinConfirm}
        onCancel={handlePinCancel}
      />
    </View>
  )
}

export default KitchenDisplayScreen
