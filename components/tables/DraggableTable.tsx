import { useTableTimerTick } from '@/hooks/useTableTimerTick'
import {
  FREE_PLACEMENT_SHAPE_IDS,
  RIGHT_ANGLE_ROTATION_SHAPE_IDS,
  TABLE_SHAPES,
  WALL_CORNER_SNAP_SHAPE_IDS
} from '@/lib/table-shapes'
import {
  registerTablePosition,
  unregisterTablePosition
} from '@/lib/tablePositionRegistry'
import { isLocalOnlyStatus } from '@/lib/tableStateMachine'
import { colors, TABLE_STATUS_COLORS } from '@/lib/theme'
import { useColorScheme } from '@/lib/useColorScheme'
import {
  findWallCornerSnap,
  WallEdgeFlags
} from '@/lib/wallCornerSnap'
import {
  useOrderByAnyId,
  useOrderTotals
} from '@/stores/selectors/orderSelectors'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useFloorPlanEditorStore } from '@/stores/useFloorPlanEditorStore'
import { useReservationStore } from '@/stores/useReservationStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { FloorPlanObject } from '@/types/db-floor-plan-types'
import { BrushCleaning, Lock } from 'lucide-react-native'
import React, { useCallback, useEffect, useMemo } from 'react'
import { Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  cancelAnimation,
  interpolateColor,
  runOnJS,
  SharedValue,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withSpring,
  withTiming
} from 'react-native-reanimated'
import { useShallow } from 'zustand/react/shallow'

type NextReservationLike = {
  date?: string
  time: string
}

const compactTableName = (rawName: string): string => {
  const name = rawName.trim()
  if (!name) return ''

  const digits = name.match(/\d+/)?.[0] ?? ''
  const alphaToken = name.match(/[A-Za-z]+/)?.[0] ?? ''
  if (digits && alphaToken) {
    return `${alphaToken[0].toUpperCase()}${digits}`
  }

  const words = name.split(/\s+/).filter(Boolean)
  if (words.length >= 2) {
    return words
      .map(w => w[0]?.toUpperCase() ?? '')
      .join('')
      .slice(0, 3)
  }

  return name.slice(0, 4).toUpperCase()
}

// Prevent repeated network fetches for the same missing order during rapid rerenders.
const missingOrderSyncInFlight = new Set<string>()
const missingOrderLastAttemptAt: Record<string, number> = {}
const MISSING_ORDER_SYNC_THROTTLE_MS = 8000
const EMPTY_MERGED_TABLE_NAMES: (string | null)[] = []

const toLocalDateKey = (date: Date) => {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

const getReservationTimeMs = (
  reservation: NextReservationLike
): number | null => {
  const direct = new Date(reservation.time).getTime()
  if (Number.isFinite(direct)) return direct

  const dateKey = reservation.date || toLocalDateKey(new Date())
  const combined = new Date(`${dateKey}T${reservation.time}`).getTime()
  if (Number.isFinite(combined)) return combined

  return null
}

const ReservationBadge = React.memo(
  ({ label, urgent }: { label: string; urgent: boolean }) => {
    const opacity = useSharedValue(1)

    useEffect(() => {
      const duration = urgent ? 800 : 1200
      const minOpacity = urgent ? 0.3 : 0.5
      opacity.value = withRepeat(
        withSequence(
          withTiming(minOpacity, { duration }),
          withTiming(1, { duration })
        ),
        -1
      )
      return () => {
        cancelAnimation(opacity)
      }
    }, [urgent])

    const animStyle = useAnimatedStyle(() => ({
      opacity: opacity.value
    }))

    const badgeColor = urgent ? colors.danger : colors.warning

    return (
      <Animated.View
        style={[
          {
            position: 'absolute',
            bottom: 4,
            right: 4,
            paddingHorizontal: 5,
            paddingVertical: 3,
            borderRadius: 6,
            backgroundColor: badgeColor + '40',
            borderWidth: 1.5,
            borderColor: badgeColor,
            alignItems: 'center',
            justifyContent: 'center'
          },
          animStyle
        ]}
      >
        <Text
          style={{
            color: badgeColor,
            fontSize: 8,
            fontWeight: '800',
            letterSpacing: 0.3
          }}
        >
          {label}
        </Text>
      </Animated.View>
    )
  }
)

/**
 * Isolated pulsing border overlay — runs entirely on UI thread via Reanimated.
 * No JS-thread setInterval/setState, eliminating ~20 JS calls/sec per attention table.
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
    const progress = useSharedValue(1)

    useEffect(() => {
      if (!active) {
        progress.value = 1
        return
      }
      // Animate 1 → 0.3 → 1 endlessly on the UI thread
      progress.value = withRepeat(
        withSequence(
          withTiming(0.3, { duration: 500 }),
          withTiming(1, { duration: 500 })
        ),
        -1 // infinite
      )
      return () => {
        cancelAnimation(progress)
      }
    }, [active])

    const animatedBorderStyle = useAnimatedStyle(() => {
      const borderColor = interpolateColor(
        progress.value,
        [0.3, 1],
        ['rgba(248,113,113,0.3)', 'rgba(248,113,113,1)']
      )
      return {
        position: 'absolute' as const,
        top: 0,
        left: 0,
        width,
        height,
        borderRadius: 16,
        borderWidth: 2.5,
        borderColor
      }
    })

    if (!active) return null

    return <Animated.View pointerEvents='none' style={animatedBorderStyle} />
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
  enableEntryAnimation?: boolean
  sectionColor?: string
  wallEdgeFlags?: WallEdgeFlags
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
  enableEntryAnimation = true,
  sectionColor,
  wallEdgeFlags,
  onLongPress,
  disableLongPress = false
}) => {
  const DRAG_HOLD_MS = 220
  const isTableType = table.category === 'table' || table.category === 'booth'
  const isWall = table.shape_id === 'wall-section'
  const { isDarkColorScheme } = useColorScheme()
  const updateTablePosition = useFloorPlanStore(s => s.updateTablePosition)
  const updateTableGeometry = useFloorPlanStore(s => s.updateTableGeometry)
  const saveSnapshot = useFloorPlanStore(s => s.saveSnapshot)
  const isLocked = useFloorPlanEditorStore(s =>
    s.lockedObjectIds.includes(table.id)
  )
  const defaultSittingTimeMinutes = useLocationConfigStore(
    s => (isTableType ? s.config.dining.defaultSittingTimeMinutes : 0)
  )

  // Subscribe directly to live session so table color/status updates without needing
  // the floor plan store sync (matches how Sidebar's TableListItem works)
  const sessionStoreSession = useTableSessionStore(s =>
    isTableType ? s.sessions[table.id] : undefined
  )
  const liveSession = sessionStoreSession ?? table.session

  // --- COMPONENT LOOKUP ---
  const shapeDef =
    TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES] ||
    TABLE_SHAPES['square-4']
  const TableComponent = shapeDef?.component

  const snapsToWallCorners = WALL_CORNER_SNAP_SHAPE_IDS.has(table.shape_id)
  const hasFreePlacement = FREE_PLACEMENT_SHAPE_IDS.has(table.shape_id)
  const tick = useTableTimerTick(isTableType)
  const resolvedWallEdgeFlags: WallEdgeFlags = wallEdgeFlags ?? {
    hideTop: false,
    hideRight: false,
    hideBottom: false,
    hideLeft: false
  }

  // Stable key that changes whenever any wall's geometry changes — used to invalidate
  // edge flags without subscribing to a new array reference every render.

  const wallResizeWidth = useSharedValue(table.width ?? shapeDef?.width ?? 100)
  const wallResizeHeight = useSharedValue(
    table.height ?? shapeDef?.height ?? 100
  )
  const wallResizeStartWidth = useSharedValue(
    table.width ?? shapeDef?.width ?? 100
  )
  const wallResizeStartX = useSharedValue(table.x)
  const wallResizeStartY = useSharedValue(table.y)

  useEffect(() => {
    wallResizeWidth.value = table.width ?? shapeDef?.width ?? 100
    wallResizeHeight.value = table.height ?? shapeDef?.height ?? 100
    wallResizeStartWidth.value = table.width ?? shapeDef?.width ?? 100
    wallResizeStartX.value = table.x
    wallResizeStartY.value = table.y
  }, [
    table.width,
    table.height,
    table.x,
    table.y,
    shapeDef?.width,
    shapeDef?.height,
    wallResizeWidth,
    wallResizeHeight,
    wallResizeStartWidth,
    wallResizeStartX,
    wallResizeStartY
  ])

  // --- COMPUTE EFFECTIVE DIMENSIONS ---
  const effectiveWidth = isWall
    ? wallResizeWidth.value
    : table.width ?? shapeDef?.width ?? 100
  const effectiveHeight = isWall
    ? wallResizeHeight.value
    : table.height ?? shapeDef?.height ?? 100

  const effectiveOrder =
    useOrderByAnyId(isTableType ? liveSession?.order_id : null) ?? undefined

  useEffect(() => {
    const id = liveSession?.order_id
    if (!id || effectiveOrder) return

    const now = Date.now()
    const lastAttempt = missingOrderLastAttemptAt[id] ?? 0
    if (missingOrderSyncInFlight.has(id)) return
    if (now - lastAttempt < MISSING_ORDER_SYNC_THROTTLE_MS) return

    missingOrderLastAttemptAt[id] = now
    missingOrderSyncInFlight.add(id)

    useOrderStore
      .getState()
      .syncOrderFromDatabase(id)
      .catch((err: unknown) => {
        console.warn(
          '[DraggableTable] Failed to sync missing order for table card:',
          {
            tableId: table.id,
            orderId: id,
            error: err
          }
        )
      })
      .finally(() => {
        missingOrderSyncInFlight.delete(id)
      })
  }, [liveSession?.order_id, effectiveOrder, table.id])

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

  // O(1) lookup from precomputed map — no per-table filter/sort on every reservation poll
  const liveNextReservation = useReservationStore(
    s => (isTableType ? s.nextReservationByTableId[table.id] ?? null : null)
  )

  // Subscribe only to the specific merged table names needed, not the entire tablesById map
  const mergedTableIds = liveSession?.merged_tables ?? []
  const mergedTableNames = useFloorPlanStore(
    useShallow(s =>
      isTableType
        ? mergedTableIds
            .filter(id => id !== table.id)
            .map(id => s.tablesById[id]?.name ?? null)
        : EMPTY_MERGED_TABLE_NAMES
    )
  )

  const displayName = useMemo(() => {
    if (mergedTableIds.length > 0) {
      const otherTableNames = mergedTableNames.filter(Boolean).join(', ')
      if (otherTableNames) return `${table.name} (Merged: ${otherTableNames})`
    }
    return table.name
  }, [table.name, mergedTableNames, mergedTableIds.length])

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
    if (!enableEntryAnimation) {
      entryScale.value = 1
      entryOpacity.value = 1
      return
    }
    const delay = index * 30 // 30ms stagger per table
    const timeout = setTimeout(() => {
      entryScale.value = withSpring(1, { damping: 15, stiffness: 200 })
      entryOpacity.value = withTiming(1, { duration: 200 })
    }, delay)
    return () => clearTimeout(timeout)
  }, [enableEntryAnimation, index])

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
  const newAttention = liveSession?.needs_attention ?? false
  useEffect(() => {
    isMergedShared.value = newMerged
  }, [newMerged])
  useEffect(() => {
    attentionShared.value = newAttention
  }, [newAttention])

  // --- SYNC WITH UNDO/REDO ---
  useEffect(() => {
    translateX.value = table.x
    translateY.value = table.y
    rotation.value = table.rotation || 0
  }, [table.x, table.y, table.rotation])

  useEffect(() => {
    registerTablePosition(table.id, translateX, translateY)
    return () => unregisterTablePosition(table.id)
  }, [table.id])

  const GRID_SIZE = 5
  const MIN_WALL_LENGTH = 40

  const projectResizeDelta = useCallback(
    (translationX: number, translationY: number) => {
      'worklet'
      const angle = (rotation.value * Math.PI) / 180
      return (
        (translationX * Math.cos(angle) + translationY * Math.sin(angle)) /
        canvasScale.value
      )
    },
    [canvasScale, rotation]
  )

  const getAnchoredResizePosition = useCallback(
    (
      nextWidth: number,
      anchor: 'start' | 'end'
    ) => {
      'worklet'
      const delta = nextWidth - wallResizeStartWidth.value
      const angle = (rotation.value * Math.PI) / 180
      const cos = Math.cos(angle)
      const sin = Math.sin(angle)

      if (anchor === 'start') {
        return {
          x: wallResizeStartX.value + (delta * (cos - 1)) / 2,
          y: wallResizeStartY.value + (delta * sin) / 2
        }
      }

      return {
        x: wallResizeStartX.value - (delta * (1 + cos)) / 2,
        y: wallResizeStartY.value - (delta * sin) / 2
      }
    },
    [rotation, wallResizeStartWidth, wallResizeStartX, wallResizeStartY]
  )

  // Called on JS thread at drag end: resolve final snapped position and persist.
  const finalizeDrop = useCallback(
    (rawX: number, rawY: number, rot: number) => {
      let finalX: number
      let finalY: number

      if (hasFreePlacement) {
        finalX = rawX
        finalY = rawY
      } else if (snapsToWallCorners) {
        // Wall-like structural objects: try corner snap first, fall back to grid.
        const snap = findWallCornerSnap(
          rawX,
          rawY,
          effectiveWidth,
          effectiveHeight,
          rot,
          table.shape_id,
          table.id
        )
        finalX = snap ? snap.x : Math.round(rawX / GRID_SIZE) * GRID_SIZE
        finalY = snap ? snap.y : Math.round(rawY / GRID_SIZE) * GRID_SIZE
      } else {
        finalX = Math.round(rawX / GRID_SIZE) * GRID_SIZE
        finalY = Math.round(rawY / GRID_SIZE) * GRID_SIZE
      }

      translateX.value = finalX
      translateY.value = finalY
      updateTablePosition(table.id, finalX, finalY, rot)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [hasFreePlacement, snapsToWallCorners, effectiveWidth, effectiveHeight, table.id]
  )

  const dragGesture = Gesture.Pan()
    .enabled(isEditMode && !isLocked)
    .activateAfterLongPress(DRAG_HOLD_MS)
    .minDistance(12)
    .activeOffsetX([-12, 12])
    .activeOffsetY([-12, 12])
    .onStart(() => {
      runOnJS(saveSnapshot)()
      dragContext.value = { x: translateX.value, y: translateY.value }
    })
    .onUpdate(event => {
      // Free drag — follows finger exactly, no grid stutter
      translateX.value =
        dragContext.value.x + event.translationX / canvasScale.value
      translateY.value =
        dragContext.value.y + event.translationY / canvasScale.value
    })
    .onEnd(() => {
      // Snap to grid (or wall corner for wall-like structure objects) only on release
      runOnJS(finalizeDrop)(translateX.value, translateY.value, rotation.value)
    })

  const wallResizeRightGesture = Gesture.Pan()
    .enabled(isEditMode && isSelected && isWall && !isLocked)
    .onStart(() => {
      runOnJS(saveSnapshot)()
      wallResizeStartWidth.value = wallResizeWidth.value
      wallResizeStartX.value = translateX.value
      wallResizeStartY.value = translateY.value
    })
    .onUpdate(event => {
      const projectedDelta = projectResizeDelta(
        event.translationX,
        event.translationY
      )
      const nextWidth = Math.max(
        MIN_WALL_LENGTH,
        wallResizeStartWidth.value + projectedDelta
      )
      const anchoredPosition = getAnchoredResizePosition(nextWidth, 'start')
      wallResizeWidth.value = nextWidth
      translateX.value = anchoredPosition.x
      translateY.value = anchoredPosition.y
    })
    .onEnd(event => {
      const projectedDelta = projectResizeDelta(
        event.translationX,
        event.translationY
      )
      const nextWidth = Math.max(
        MIN_WALL_LENGTH,
        wallResizeStartWidth.value + projectedDelta
      )
      const committedWidth = Math.round(nextWidth)
      const anchoredPosition = getAnchoredResizePosition(
        committedWidth,
        'start'
      )
      wallResizeWidth.value = committedWidth
      translateX.value = anchoredPosition.x
      translateY.value = anchoredPosition.y
      runOnJS(updateTableGeometry)(table.id, {
        x: anchoredPosition.x,
        y: anchoredPosition.y,
        width: committedWidth,
        height: wallResizeHeight.value,
        rotation: rotation.value
      })
    })

  const wallResizeLeftGesture = Gesture.Pan()
    .enabled(isEditMode && isSelected && isWall && !isLocked)
    .onStart(() => {
      runOnJS(saveSnapshot)()
      wallResizeStartWidth.value = wallResizeWidth.value
      wallResizeStartX.value = translateX.value
      wallResizeStartY.value = translateY.value
    })
    .onUpdate(event => {
      const projectedDelta = projectResizeDelta(
        event.translationX,
        event.translationY
      )
      const nextWidth = Math.max(
        MIN_WALL_LENGTH,
        wallResizeStartWidth.value - projectedDelta
      )
      const anchoredPosition = getAnchoredResizePosition(nextWidth, 'end')
      wallResizeWidth.value = nextWidth
      translateX.value = anchoredPosition.x
      translateY.value = anchoredPosition.y
    })
    .onEnd(event => {
      const projectedDelta = projectResizeDelta(
        event.translationX,
        event.translationY
      )
      const nextWidth = Math.max(
        MIN_WALL_LENGTH,
        wallResizeStartWidth.value - projectedDelta
      )
      const committedWidth = Math.round(nextWidth)
      const anchoredPosition = getAnchoredResizePosition(
        committedWidth,
        'end'
      )

      wallResizeWidth.value = committedWidth
      translateX.value = anchoredPosition.x
      translateY.value = anchoredPosition.y
      runOnJS(updateTableGeometry)(table.id, {
        x: anchoredPosition.x,
        y: anchoredPosition.y,
        width: committedWidth,
        height: wallResizeHeight.value,
        rotation: rotation.value
      })
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
      const snappedRotation = RIGHT_ANGLE_ROTATION_SHAPE_IDS.has(table.shape_id)
        ? Math.round(rotation.value / 90) * 90
        : Math.round(rotation.value / 45) * 45
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
    .enabled(!isEditMode && !disableLongPress && isTableType)
    .onStart(() => {
      if (onLongPress) runOnJS(onLongPress)()
    })

  const tapGesture = Gesture.Tap()
    .enabled(isEditMode || isTableType)
    .onEnd(() => {
      if (isEditMode) runOnJS(onSelect)()
      else if (onPress) runOnJS(onPress)()
    })

  const composedGesture = isEditMode
    ? Gesture.Simultaneous(dragGesture, rotateGesture, tapGesture)
    : disableLongPress
    ? tapGesture
    : Gesture.Race(longPressGesture, tapGesture)

  const animatedStyle = useAnimatedStyle(() => ({
    position: 'absolute',
    top: 0,
    left: 0,
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { rotate: `${rotation.value}deg` },
      { scale: entryScale.value * pulseScale.value }
    ],
    opacity: entryOpacity.value
  }))

  const sizeAnimatedStyle = useAnimatedStyle(() => ({
    width: isWall ? wallResizeWidth.value : effectiveWidth,
    height: isWall ? wallResizeHeight.value : effectiveHeight
  }))

  const orderTotals = useOrderTotals(
    isTableType ? effectiveOrder?.id ?? null : null
  )
  const orderTotal = orderTotals?.total ?? 0

  const {
    reservationCountdownLabel,
    isReservedSoon,
    isOccupiedWithReservationSoon,
    isReservationUrgent
  } = useMemo(() => {
    const nextReservation = liveNextReservation
      ? {
          date: liveNextReservation.reservation_date,
          time: liveNextReservation.reservation_time
        }
      : null

    if (!nextReservation)
      return {
        reservationCountdownLabel: null,
        isReservedSoon: false,
        isOccupiedWithReservationSoon: false,
        isReservationUrgent: false
      }

    const reservationTimeMs = getReservationTimeMs(nextReservation)
    if (reservationTimeMs == null || !Number.isFinite(reservationTimeMs))
      return {
        reservationCountdownLabel: null,
        isReservedSoon: false,
        isOccupiedWithReservationSoon: false,
        isReservationUrgent: false
      }

    const diffMs = reservationTimeMs - Date.now()
    if (diffMs <= 0 || diffMs > 30 * 60 * 1000)
      return {
        reservationCountdownLabel: null,
        isReservedSoon: false,
        isOccupiedWithReservationSoon: false,
        isReservationUrgent: false
      }

    const minutesLeft = Math.max(1, Math.ceil(diffMs / 60000))
    const label = liveSession
      ? `Res in ${minutesLeft}m`
      : `Reserved in ${minutesLeft}m`
    const occupied = !!liveSession
    const urgent = minutesLeft < 10

    return {
      reservationCountdownLabel: label,
      isReservedSoon: !occupied,
      isOccupiedWithReservationSoon: occupied,
      isReservationUrgent: urgent
    }
  }, [tick, liveSession, liveNextReservation])

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
    ? colors.info
    : TABLE_STATUS_COLORS[tableStatus] || TABLE_STATUS_COLORS.available

  const textFit = useMemo(() => {
    const shapeId = table.shape_id?.toLowerCase() ?? ''
    const isCircleShape = shapeId.includes('circle')
    const isBoothShape = shapeId.includes('booth') || table.category === 'booth'
    const minDim = Math.min(effectiveWidth, effectiveHeight)
    const usableFactor = isCircleShape ? 0.76 : isBoothShape ? 0.84 : 1
    const usableMinDim = minDim * usableFactor
    const primary = Math.max(7, Math.min(12, Math.round(usableMinDim * 0.12)))
    const secondary = Math.max(6, Math.min(8, Math.round(usableMinDim * 0.085)))
    const amount = Math.max(7, Math.min(11, Math.round(usableMinDim * 0.11)))
    const compactMeta = usableMinDim < 76
    const ultraCompact = usableMinDim < 62
    const contentWidth = Math.round(
      effectiveWidth * (isCircleShape ? 0.58 : isBoothShape ? 0.72 : 0.82)
    )
    const contentHeight = Math.round(
      effectiveHeight * (isCircleShape ? 0.5 : isBoothShape ? 0.64 : 0.72)
    )
    const showSecondaryMeta =
      !ultraCompact && (!isCircleShape || usableMinDim >= 92)
    return {
      minDim,
      usableMinDim,
      isCircleShape,
      primary,
      secondary,
      amount,
      compactMeta,
      ultraCompact,
      contentWidth,
      contentHeight,
      showSecondaryMeta,
      maxLabelChars:
        usableMinDim < 62
          ? 6
          : usableMinDim < 78
          ? 9
          : usableMinDim < 95
          ? 13
          : usableMinDim < 115
          ? 18
          : 28
    }
  }, [effectiveWidth, effectiveHeight, table.shape_id, table.category])

  const tableLabel = useMemo(() => {
    const raw = (displayName || table.name || '').trim()
    if (!raw) return table.name
    if (textFit.ultraCompact) return compactTableName(raw)
    if (raw.length <= textFit.maxLabelChars) return raw
    const clipped = raw.slice(0, Math.max(6, textFit.maxLabelChars - 1)).trim()
    return `${clipped}...`
  }, [displayName, table.name, textFit.maxLabelChars, textFit.ultraCompact])

  const reservationLabel = useMemo(() => {
    if (!reservationCountdownLabel) return null
    const mins = reservationCountdownLabel.match(/(\d+)m/)?.[1]
    if (textFit.compactMeta || isOccupiedWithReservationSoon) {
      return mins ? `R ${mins}m` : 'R'
    }
    return reservationCountdownLabel
  }, [
    reservationCountdownLabel,
    textFit.compactMeta,
    isOccupiedWithReservationSoon
  ])

  const isOccupiedStatus =
    tableStatus === 'seating' ||
    tableStatus === 'seated' ||
    tableStatus === 'ordering' ||
    tableStatus === 'ordered' ||
    tableStatus === 'served' ||
    tableStatus === 'check_presented' ||
    tableStatus === 'paying' ||
    tableStatus === 'paid'

  const occupiedMetaLabel = useMemo(() => {
    const partySize = liveSession?.party_size
    const hasDuration = !!duration
    const partyLong =
      partySize != null
        ? `${partySize} ${partySize === 1 ? 'guest' : 'guests'}`
        : ''
    const partyShort = partySize != null ? `${partySize}g` : ''

    const party = textFit.showSecondaryMeta ? partyLong : partyShort

    if (hasDuration && party) return `${duration} · ${party}`
    if (hasDuration) return duration
    if (party) return party
    return ''
  }, [duration, liveSession?.party_size, textFit.showSecondaryMeta])

  return (
    <GestureDetector gesture={composedGesture}>
      <Animated.View style={animatedStyle}>
        <Animated.View style={sizeAnimatedStyle}>
          {TableComponent ? (
            <TableComponent
              darkMode={isDarkColorScheme}
              color={isTableType ? tableColor : colors.label}
              {...(isTableType && { chairColor: tableColor })}
              {...(table.shape_id === 'label-text' && { label: table.name })}
              {...(isWall && resolvedWallEdgeFlags)}
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
          {/* Selection border — absolutely positioned so it never affects layout/size */}
          {isSelected && (
            <View
              pointerEvents='none'
              style={{
                position: 'absolute',
                top: -3,
                left: -3,
                right: -3,
                bottom: -3,
                borderWidth: 2,
                borderColor: colors.info,
                borderRadius: 18
              }}
            />
          )}

          {isLocked && (
            <View
              pointerEvents='none'
              style={{
                position: 'absolute',
                top: -8,
                left: -8,
                width: 22,
                height: 22,
                borderRadius: 11,
                backgroundColor: colors.panel,
                borderWidth: 1,
                borderColor: colors.border,
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Lock size={11} color={colors.label} />
            </View>
          )}

          {isSelected && isEditMode && isWall && (
            <GestureDetector gesture={wallResizeLeftGesture}>
              <View
                style={{
                  position: 'absolute',
                  left: -10,
                  top: effectiveHeight / 2 - 12,
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: isLocked ? colors.muted : colors.info,
                  borderWidth: 2,
                  borderColor: colors.panel,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: colors.onSolid
                  }}
                />
              </View>
            </GestureDetector>
          )}

          {isSelected && isEditMode && isWall && (
            <GestureDetector gesture={wallResizeRightGesture}>
              <View
                style={{
                  position: 'absolute',
                  right: -10,
                  top: effectiveHeight / 2 - 12,
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  backgroundColor: isLocked ? colors.muted : colors.info,
                  borderWidth: 2,
                  borderColor: colors.panel,
                  alignItems: 'center',
                  justifyContent: 'center'
                }}
              >
                <View
                  style={{
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: colors.onSolid
                  }}
                />
              </View>
            </GestureDetector>
          )}

          <View
            pointerEvents='none'
            style={{
              position: 'absolute',
              left: (effectiveWidth - textFit.contentWidth) / 2,
              top: (effectiveHeight - textFit.contentHeight) / 2,
              width: textFit.contentWidth,
              height: textFit.contentHeight,
              alignItems: 'center',
              justifyContent: 'center',
              paddingHorizontal: 2,
              overflow: 'hidden'
            }}
          >
            {isTableType && (
              <Text
                style={{
                  fontSize: textFit.primary,
                  fontWeight: '700',
                  textAlign: 'center',
                  color: isDarkColorScheme ? tableColor : '#111827'
                }}
                numberOfLines={
                  textFit.isCircleShape || textFit.usableMinDim < 95 ? 1 : 2
                }
                adjustsFontSizeToFit
                minimumFontScale={0.65}
                ellipsizeMode='tail'
              >
                {tableLabel}
              </Text>
            )}

            {isTableType &&
              textFit.showSecondaryMeta &&
              !textFit.compactMeta &&
              tableStatus === 'available' &&
              !isReservedSoon && (
                <Text
                  style={{
                    color: isDarkColorScheme ? tableColor + 'AA' : '#334155',
                    fontSize: textFit.secondary,
                    fontWeight: '600'
                  }}
                  adjustsFontSizeToFit
                  minimumFontScale={0.7}
                >
                  {table.capacity ||
                    TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES]
                      ?.capacity ||
                    0}{' '}
                  SEATS
                </Text>
              )}

            {isTableType && reservationLabel && !isOccupiedWithReservationSoon && (
              <Text
                style={{
                  color: tableColor + 'CC',
                  fontSize: textFit.secondary,
                  fontWeight: '600',
                  textAlign: 'center'
                }}
                numberOfLines={1}
                adjustsFontSizeToFit
                minimumFontScale={0.7}
              >
                {reservationLabel}
              </Text>
            )}

            {isTableType && isOccupiedStatus && (
              <>
                {!effectiveOrder && liveSession?.order_id ? (
                  !!occupiedMetaLabel &&
                  !textFit.ultraCompact && (
                    <Text
                      style={{
                        color: isDarkColorScheme
                          ? tableColor + 'CC'
                          : '#334155',
                        fontSize: textFit.secondary,
                        fontWeight: '600'
                      }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.7}
                    >
                      {occupiedMetaLabel}
                    </Text>
                  )
                ) : (
                  <>
                    <Text
                      style={{
                        color: isDarkColorScheme ? '#FFFFFF' : '#111827',
                        fontSize: textFit.amount,
                        fontWeight: '700',
                        marginTop: textFit.compactMeta ? 1 : 2
                      }}
                      numberOfLines={1}
                      adjustsFontSizeToFit
                      minimumFontScale={0.75}
                    >
                      ${orderTotal.toFixed(2)}
                    </Text>
                    {!!occupiedMetaLabel && !textFit.ultraCompact && (
                      <Text
                        style={{
                          color: isDarkColorScheme
                            ? tableColor + 'CC'
                            : '#334155',
                          fontSize: textFit.secondary,
                          fontWeight: '600'
                        }}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.7}
                      >
                        {occupiedMetaLabel}
                      </Text>
                    )}
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
                backgroundColor: isDarkColorScheme
                  ? 'rgba(0,0,0,0.6)'
                  : 'rgba(255,255,255,0.9)',
                borderWidth: 1,
                borderColor: (sectionColor ?? tableColor) + '99',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Text
                style={{
                  color: isDarkColorScheme
                    ? sectionColor ?? tableColor
                    : '#111827',
                  fontSize: 8,
                  fontWeight: '700'
                }}
              >
                {serverInitials}
              </Text>
            </View>
          )}

          {/* Reservation badge */}
          {(isReservedSoon || isOccupiedWithReservationSoon) && (
            <ReservationBadge
              label={
                reservationCountdownLabel?.match(/(\d+)m/)?.[1]
                  ? `R ${reservationCountdownLabel.match(/(\d+)m/)?.[1]}m`
                  : 'R'
              }
              urgent={isReservationUrgent}
            />
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
        </Animated.View>
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
  if (
    prev.wallEdgeFlags?.hideTop !== next.wallEdgeFlags?.hideTop ||
    prev.wallEdgeFlags?.hideRight !== next.wallEdgeFlags?.hideRight ||
    prev.wallEdgeFlags?.hideBottom !== next.wallEdgeFlags?.hideBottom ||
    prev.wallEdgeFlags?.hideLeft !== next.wallEdgeFlags?.hideLeft
  ) {
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
