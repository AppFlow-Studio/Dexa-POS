import { useTableTimerTick } from '@/hooks/useTableTimerTick'
import { TABLE_SHAPES } from '@/lib/table-shapes'
import {
  registerTablePosition,
  unregisterTablePosition
} from '@/lib/tablePositionRegistry'
import { isLocalOnlyStatus } from '@/lib/tableStateMachine'
import { colors, TABLE_STATUS_COLORS } from '@/lib/theme'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useOrderByAnyId } from '@/stores/selectors/orderSelectors'
import { useSettingsStore } from '@/stores/useSettingsStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { FloorPlanObject } from '@/types/db-floor-plan-types'
import { BrushCleaning } from 'lucide-react-native'
import React, { useEffect, useMemo, useState } from 'react'
import { Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  runOnJS,
  SharedValue,
  useAnimatedReaction,
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated'

/**
 * Isolated pulsing border overlay — uses setInterval so it can't be killed by parent re-renders.
 * Renders as an absolute overlay on top of the table.
 */
const PulsingBorder = React.memo(
  ({
    active,
    width,
    height
  }: {
    active: boolean
    width: number
    height: number
  }) => {
    const [opacity, setOpacity] = useState(1)

    useEffect(() => {
      if (!active) return
      let rising = false
      const interval = setInterval(() => {
        setOpacity(prev => {
          if (prev <= 0.3) rising = true
          if (prev >= 1) rising = false
          return rising ? prev + 0.07 : prev - 0.07
        })
      }, 50)
      return () => clearInterval(interval)
    }, [active])

    if (!active) return null

    return (
      <View
        pointerEvents='none'
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width,
          height,
          borderRadius: 16,
          borderWidth: 2.5,
          borderColor: `rgba(248,113,113,${opacity})`
        }}
      />
    )
  }
)

interface DraggableTableProps {
  table: FloorPlanObject
  layoutId: string // Kept for prop compatibility, though unused
  isEditMode: boolean
  isSelected: boolean
  interactionMode: 'normal' | 'selection' | 'merge'
  onSelect: () => void
  canvasScale: SharedValue<number>
  onPress?: () => void
  index?: number // For staggered entry animation
  sectionColor?: string
  onLongPress?: () => void
  disableLongPress?: boolean
}

const DraggableTable: React.FC<DraggableTableProps> = ({
  table,
  layoutId,
  isEditMode,
  isSelected,
  interactionMode,
  onSelect,
  canvasScale,
  onPress,
  index = 0,
  sectionColor,
  onLongPress,
  disableLongPress = false
}) => {
  const DRAG_HOLD_MS = 220
  const tablesById = useFloorPlanStore(s => s.tablesById)
  const updateTablePosition = useFloorPlanStore(s => s.updateTablePosition)
  const saveSnapshot = useFloorPlanStore(s => s.saveSnapshot)
  const { defaultSittingTimeMinutes } = useSettingsStore()
  const tick = useTableTimerTick()

  // Subscribe directly to live session so table color/status updates without needing
  // the floor plan store sync (matches how Sidebar's TableListItem works)
  const sessionStoreSession = useTableSessionStore(s => s.sessions[table.id])
  const liveSession = sessionStoreSession ?? table.session

  if (
    liveSession?.status === 'served' ||
    liveSession?.status === 'check_presented'
  ) {
    console.log('[DraggableTable] Table with served/check_presented status:', {
      tableId: table.id,
      tableStatus: liveSession?.status,
      fromSessionStore: !!sessionStoreSession,
      fromFloorPlan: !!table.session,
      sessionStoreSession: sessionStoreSession?.status,
      floorPlanSession: table.session?.status
    })
  }

  // --- COMPONENT LOOKUP ---
  const shapeDef =
    TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES] ||
    TABLE_SHAPES['square-4']
  const TableComponent = shapeDef?.component

  // --- COMPUTE EFFECTIVE DIMENSIONS ---
  const effectiveWidth = table.width ?? shapeDef?.width ?? 100
  const effectiveHeight = table.height ?? shapeDef?.height ?? 100

  const effectiveOrder = useOrderByAnyId(liveSession?.order_id) ?? undefined

  const openedAt = effectiveOrder?.opened_at ?? null
  const liveSessionStatus = liveSession?.status ?? null

  const { duration, isOvertime } = useMemo(() => {
    const status = liveSessionStatus?.toLowerCase()
    const isInUse =
      status === 'seating' ||
      status === 'seated' ||
      status === 'ordering' ||
      status === 'ordered' ||
      status === 'served' ||
      status === 'check_presented' ||
      status === 'paying' ||
      status === 'paid' ||
      status === 'closing' ||
      !!openedAt

    if (!isInUse || !openedAt) {
      return { duration: '', isOvertime: false }
    }

    const startTime = new Date(openedAt).getTime()
    const diffMins = Math.floor((Date.now() - startTime) / 60000)

    const hours = Math.floor(diffMins / 60)
    const mins = diffMins % 60
    const durationStr = hours > 0 ? `${hours}hr ${mins}m` : `${mins}m`

    return {
      duration: durationStr,
      isOvertime:
        defaultSittingTimeMinutes > 0 && diffMins > defaultSittingTimeMinutes
    }
    // tick drives the 60s refresh; openedAt/liveSessionStatus are primitive deps
    // so this only recomputes when data actually changes OR the minute ticks
  }, [tick, liveSessionStatus, openedAt, defaultSittingTimeMinutes])

  const serverInitials = useMemo(() => {
    const staffId = liveSession?.server_staff_id
    if (!staffId) return null
    const emp = useEmployeeStore.getState().getEmployeeByStaffId(staffId)
    if (!emp?.fullName) return null
    const parts = emp.fullName.trim().split(' ')
    return parts.length >= 2
      ? `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase()
      : parts[0].slice(0, 2).toUpperCase()
  }, [liveSession?.server_staff_id])

  const activeTabAmount = useMemo(() => {
    const payments = effectiveOrder?.payments
    if (!payments) return null
    const preAuth = payments.find(
      (p: any) => p.status === 'authorized' && p.isPreAuth && !p.isVoided
    )
    return preAuth?.preAuthAmount ?? null
  }, [effectiveOrder?.payments])

  const displayName = useMemo(() => {
    if (
      liveSession &&
      liveSession.merged_tables &&
      liveSession.merged_tables.length > 0
    ) {
      const otherTableNames = liveSession.merged_tables
        .filter(id => id !== table.id)
        .map(id => tablesById[id]?.name)
        .filter(Boolean)
        .join(', ')

      if (otherTableNames) {
        return `${table.name} (Merged: ${otherTableNames})`
      }
    }
    return table.name
  }, [table, tablesById])

  // --- ANIMATED VALUES ---
  const translateX = useSharedValue(table.x)
  const translateY = useSharedValue(table.y)
  const rotation = useSharedValue(table.rotation)
  const dragContext = useSharedValue({ x: 0, y: 0 })
  const rotateContext = useSharedValue(0)

  // Entry animation shared values
  const entryScale = useSharedValue(0.8)
  const entryOpacity = useSharedValue(0)

  // Pulse animation for realtime updates
  const pulseScale = useSharedValue(1)

  const isMergedShared = useSharedValue(false)
  const attentionShared = useSharedValue(false)

  // Staggered entry animation on mount
  useEffect(() => {
    const delay = index * 30 // 30ms stagger per table
    const timeout = setTimeout(() => {
      entryScale.value = withSpring(1, { damping: 15, stiffness: 200 })
      entryOpacity.value = withTiming(1, { duration: 200 })
    }, delay)
    return () => clearTimeout(timeout)
  }, [index])

  // Pulse animation when session status changes
  useEffect(() => {
    // Skip initial render
    if (entryOpacity.value === 0) return

    pulseScale.value = withSequence(
      withTiming(1.05, { duration: 100 }),
      withSpring(1, { damping: 10 })
    )
  }, [liveSession?.status, liveSession?.order_id])

  // Sync merged + attention state to shared values (keeps useAnimatedStyle on UI thread)
  const newMerged = !!(
    liveSession?.merged_tables && liveSession.merged_tables.length > 0
  )
  if (isMergedShared.value !== newMerged) {
    isMergedShared.value = newMerged
  }
  const newAttention = liveSession?.needs_attention ?? false
  if (attentionShared.value !== newAttention) {
    attentionShared.value = newAttention
  }

  // --- SYNC WITH UNDO/REDO ---
  useAnimatedReaction(
    () => ({ x: table.x, y: table.y, r: table.rotation }),
    (current, prev) => {
      if (
        !prev ||
        current.x !== prev.x ||
        current.y !== prev.y ||
        current.r !== prev.r
      ) {
        translateX.value = current.x
        translateY.value = current.y
        rotation.value = current.r || 0
      }
    },
    [table.x, table.y, table.rotation]
  )

  useEffect(() => {
    registerTablePosition(table.id, translateX, translateY)
    return () => unregisterTablePosition(table.id)
  }, [table.id])

  const dragGesture = Gesture.Pan()
    .enabled(isEditMode)
    .activateAfterLongPress(DRAG_HOLD_MS)
    .minDistance(12)
    .activeOffsetX([-12, 12])
    .activeOffsetY([-12, 12])
    .onStart(() => {
      runOnJS(saveSnapshot)()
      dragContext.value = { x: translateX.value, y: translateY.value }
    })
    .onUpdate(event => {
      translateX.value =
        dragContext.value.x + event.translationX / canvasScale.value
      translateY.value =
        dragContext.value.y + event.translationY / canvasScale.value
    })
    .onEnd(() => {
      runOnJS(updateTablePosition)(
        table.id,
        translateX.value,
        translateY.value,
        rotation.value
      )
    })

  // Rotation gesture: disabled in favor of UI buttons in PropertiesPanel
  const rotateGesture = Gesture.Rotation()
    .enabled(false)
    .onStart(() => {
      runOnJS(saveSnapshot)()
      rotateContext.value = rotation.value
    })
    .onUpdate(event => {
      rotation.value = rotateContext.value + event.rotation
    })
    .onEnd(() => {
      const snappedRotation = Math.round(rotation.value / 45) * 45
      rotation.value = snappedRotation
      runOnJS(updateTablePosition)(
        table.id,
        translateX.value,
        translateY.value,
        snappedRotation
      )
    })

  // Long-press enabled on all tables in normal mode
  const longPressGesture = Gesture.LongPress()
    .minDuration(300)
    .enabled(!isEditMode && !disableLongPress)
    .onStart(() => {
      if (onLongPress) runOnJS(onLongPress)()
    })

  const tapGesture = Gesture.Tap().onEnd(() => {
    if (isEditMode) runOnJS(onSelect)()
    else if (onPress) runOnJS(onPress)()
  })

  const composedGesture = isEditMode
    ? Gesture.Simultaneous(dragGesture, rotateGesture, tapGesture)
    : disableLongPress
    ? tapGesture
    : Gesture.Race(longPressGesture, tapGesture)

  const animatedStyle = useAnimatedStyle(() => {
    const isMerged = isMergedShared.value
    const hasAttention = attentionShared.value
    const showStaticBorder =
      !hasAttention && (isSelected || isMerged || !!sectionColor)

    return {
      position: 'absolute',
      top: 0,
      left: 0,
      transform: [
        { translateX: translateX.value },
        { translateY: translateY.value },
        { rotate: `${rotation.value}deg` },
        { scale: entryScale.value * pulseScale.value }
      ],
      opacity: entryOpacity.value,
      borderWidth: showStaticBorder ? 2 : 0,
      borderColor: isSelected
        ? colors.info
        : isMerged
        ? colors.warning
        : sectionColor
        ? sectionColor + '99'
        : 'transparent',
      borderRadius: 18,
      padding: showStaticBorder ? 4 : 0
    }
  })

  const orderTotal =
    effectiveOrder?.items?.reduce(
      (acc: number, item: any) => acc + item.price * item.quantity,
      0
    ) || 0

  const isReservedSoon =
    !liveSession &&
    !!table.next_reservation &&
    (() => {
      const resTime = new Date(table.next_reservation!.time).getTime()
      return resTime > Date.now() && resTime - Date.now() <= 30 * 60 * 1000
    })()

  // Determine table color status from DB-synced session status only (skip local-only intermediates)
  const sessionStatus = liveSession?.status
  const tableStatus =
    (sessionStatus && !isLocalOnlyStatus(sessionStatus)
      ? sessionStatus
      : null) ||
    (table.is_active === false && 'not_in_service') ||
    'available'

  const tableColor = isOvertime
    ? TABLE_STATUS_COLORS.Overtime
    : isReservedSoon
    ? colors.info // blue for reserved soon
    : TABLE_STATUS_COLORS[tableStatus] || TABLE_STATUS_COLORS.available

  if (
    liveSession?.status === 'served' ||
    liveSession?.status === 'check_presented'
  ) {
    console.log('[DraggableTable] Color determination for', table.name, {
      sessionStatus,
      isLocalOnly: sessionStatus ? isLocalOnlyStatus(sessionStatus) : 'N/A',
      tableStatus,
      tableColor,
      fromCOLORSMap: TABLE_STATUS_COLORS[tableStatus],
      allColors: TABLE_STATUS_COLORS
    })
  }

  // Type check for category is effective if we trust the object
  const isTableType = table.category === 'table' || table.category === 'booth'

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={animatedStyle}>
        <View style={{ width: effectiveWidth, height: effectiveHeight }}>
          {/* Subtle elevation shadow */}
          {isTableType && (
            <View
              pointerEvents='none'
              style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: effectiveWidth,
                height: effectiveHeight,
                borderRadius: 16,
                shadowColor: '#000000',
                shadowOffset: { width: 0, height: 2 },
                shadowOpacity: 0.35,
                shadowRadius: 6,
                elevation: 4
              }}
            />
          )}

          {TableComponent ? (
            <TableComponent
              color={isTableType ? tableColor : colors.label}
              {...(isTableType && { chairColor: tableColor })}
              width={effectiveWidth}
              height={effectiveHeight}
            />
          ) : (
            <View
              style={{
                width: effectiveWidth,
                height: effectiveHeight,
                backgroundColor: isTableType ? tableColor : colors.label,
                borderRadius: 16
              }}
            />
          )}
          <View className='absolute inset-0 items-center justify-center px-1'>
            <Text
              style={{
                fontSize: 10,
                fontWeight: '700',
                textAlign: 'center',
                color: isTableType ? tableColor : colors.label,
              }}
              numberOfLines={1}
            >
              {displayName ? displayName : table.name}
            </Text>

            {isTableType && tableStatus === 'available' && (
              <Text style={{ color: tableColor + 'AA', fontSize: 7, fontWeight: '600' }}>
                {table.capacity ||
                  TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES]
                    ?.capacity ||
                  0}{' '}
                SEATS
              </Text>
            )}

            {isTableType &&
              (tableStatus === 'seating' ||
                tableStatus === 'seated' ||
                tableStatus === 'ordering' ||
                tableStatus === 'ordered' ||
                tableStatus === 'served' ||
                tableStatus === 'check_presented' ||
                tableStatus === 'paying' ||
                tableStatus === 'paid') && (
                <>
                  {!effectiveOrder && liveSession?.order_id ? (
                    <Text style={{ color: tableColor + '99', fontSize: 8, fontWeight: '600' }}>
                      ...
                    </Text>
                  ) : (
                    <>
                      <Text style={{
                        color: '#FFFFFF',
                        fontSize: 9,
                        fontWeight: '700',
                        marginTop: 2,
                      }}>
                        ${orderTotal.toFixed(2)}
                      </Text>
                      <Text style={{
                        color: tableColor + 'CC',
                        fontSize: 7,
                        fontWeight: '600',
                      }}>
                        {duration}{liveSession?.party_size ? ` · ${liveSession.party_size} ${liveSession.party_size === 1 ? 'guest' : 'guests'}` : ''}
                      </Text>
                    </>
                  )}
                </>
              )}

            {isTableType &&
              (tableStatus === 'cleaning' || tableStatus === 'closing') && (
                <BrushCleaning size={16} color={tableColor + '99'} />
              )}
          </View>

          {/* Server initials badge */}
          {serverInitials && (
            <View
              style={{
                position: 'absolute',
                top: 4,
                right: 4,
                width: 20,
                height: 20,
                borderRadius: 10,
                backgroundColor: 'rgba(0,0,0,0.6)',
                borderWidth: 1,
                borderColor: (sectionColor ?? tableColor) + '99',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Text
                style={{
                  color: sectionColor ?? tableColor,
                  fontSize: 8,
                  fontWeight: '700'
                }}
              >
                {serverInitials}
              </Text>
            </View>
          )}

          {/* Tab (pre-auth) badge */}
          {activeTabAmount != null && (
            <View
              style={{
                position: 'absolute',
                bottom: 4,
                left: 4,
                paddingHorizontal: 4,
                paddingVertical: 2,
                borderRadius: 6,
                backgroundColor: 'rgba(0,0,0,0.7)',
                borderWidth: 1,
                borderColor: colors.teal + '99',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Text
                style={{
                  color: colors.teal,
                  fontSize: 7,
                  fontWeight: '700'
                }}
              >
                TAB ${activeTabAmount.toFixed(0)}
              </Text>
            </View>
          )}
        </View>
        <PulsingBorder
          active={newAttention}
          width={effectiveWidth}
          height={effectiveHeight}
        />
      </Animated.View>
    </GestureDetector>
  )
}

export default React.memo(DraggableTable, (prev, next) => {
  // Re-render if dimensions change
  if (
    prev.table.width !== next.table.width ||
    prev.table.height !== next.table.height
  ) {
    return false
  }
  // Re-render if position/rotation changes (for dragging)
  if (
    prev.table.x !== next.table.x ||
    prev.table.y !== next.table.y ||
    prev.table.rotation !== next.table.rotation
  ) {
    return false
  }
  // Re-render if selected state changes
  if (prev.isSelected !== next.isSelected) {
    return false
  }
  if (prev.interactionMode !== next.interactionMode) {
    return false
  }
  // Re-render if session changed (status, party size, etc.)
  // Session updates come from polling and should trigger visual updates
  if (
    prev.table.session?.id !== next.table.session?.id ||
    prev.table.session?.status !== next.table.session?.status ||
    prev.table.session?.party_size !== next.table.session?.party_size ||
    prev.table.session?.guest_name !== next.table.session?.guest_name ||
    prev.table.session?.server_staff_id !==
      next.table.session?.server_staff_id ||
    prev.table.session?.current_course !== next.table.session?.current_course ||
    prev.table.session?.needs_attention !==
      next.table.session?.needs_attention ||
    prev.table.session?.is_vip !== next.table.session?.is_vip ||
    prev.table.session?.merged_tables?.length !==
      next.table.session?.merged_tables?.length
  ) {
    return false
  }
  // Otherwise skip re-render
  return true
})
