import { useTableTimerTick } from '@/hooks/useTableTimerTick'
import { TABLE_SHAPES } from '@/lib/table-shapes'
import {
  registerTablePosition,
  unregisterTablePosition
} from '@/lib/tablePositionRegistry'
import { isLocalOnlyStatus } from '@/lib/tableStateMachine'
import { colors, TABLE_STATUS_COLORS } from '@/lib/theme'
import { useOrderByAnyId } from '@/stores/selectors/orderSelectors'
import { useEmployeeStore } from '@/stores/useEmployeeStore'
import { useFloorPlanStore } from '@/stores/useFloorPlanStore'
import { useLocationConfigStore } from '@/stores/useLocationConfigStore'
import { useOrderStore } from '@/stores/useOrderStore'
import { useReservationStore } from '@/stores/useReservationStore'
import { useTableSessionStore } from '@/stores/useTableSessionStore'
import { FloorPlanObject } from '@/types/db-floor-plan-types'
import { BrushCleaning } from 'lucide-react-native'
import React, { useEffect, useMemo } from 'react'
import { Text, View } from 'react-native'
import { Gesture, GestureDetector } from 'react-native-gesture-handler'
import Animated, {
  interpolateColor,
  runOnJS,
  SharedValue,
  useAnimatedReaction,
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
  const updateTablePosition = useFloorPlanStore(s => s.updateTablePosition)
  const saveSnapshot = useFloorPlanStore(s => s.saveSnapshot)
  const defaultSittingTimeMinutes = useLocationConfigStore(
    s => s.config.dining.defaultSittingTimeMinutes
  )
  const tick = useTableTimerTick()

  // Subscribe directly to live session so table color/status updates without needing
  // the floor plan store sync (matches how Sidebar's TableListItem works)
  const sessionStoreSession = useTableSessionStore(s => s.sessions[table.id])
  const liveSession = sessionStoreSession ?? table.session

  // --- COMPONENT LOOKUP ---
  const shapeDef =
    TABLE_SHAPES[table.shape_id as keyof typeof TABLE_SHAPES] ||
    TABLE_SHAPES['square-4']
  const TableComponent = shapeDef?.component

  // Type check: only table/booth categories are interactive in normal view
  const isTableType = table.category === 'table' || table.category === 'booth'

  // --- COMPUTE EFFECTIVE DIMENSIONS ---
  const effectiveWidth = table.width ?? shapeDef?.width ?? 100
  const effectiveHeight = table.height ?? shapeDef?.height ?? 100

  const effectiveOrder = useOrderByAnyId(liveSession?.order_id) ?? undefined

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

  const reservations = useReservationStore(s => s.reservations)

  const liveNextReservation = useMemo(() => {
    const nowMs = Date.now()

    return reservations
      .filter(r => {
        const epoch = getReservationTimeMs({
          date: r.reservation_date,
          time: r.reservation_time
        })

        return (
          ['pending', 'confirmed', 'reminded'].includes(r.status) &&
          (r.assigned_table_ids ?? []).includes(table.id) &&
          epoch !== null &&
          epoch > nowMs
        )
      })
      .sort((a, b) => {
        const aEpoch = getReservationTimeMs({
          date: a.reservation_date,
          time: a.reservation_time
        })
        const bEpoch = getReservationTimeMs({
          date: b.reservation_date,
          time: b.reservation_time
        })
        return (
          (aEpoch ?? Number.MAX_SAFE_INTEGER) -
          (bEpoch ?? Number.MAX_SAFE_INTEGER)
        )
      })[0]
  }, [reservations, table.id])

  // Subscribe only to the specific merged table names needed, not the entire tablesById map
  const mergedTableIds = liveSession?.merged_tables ?? []
  const mergedTableNames = useFloorPlanStore(
    useShallow(s =>
      mergedTableIds
        .filter(id => id !== table.id)
        .map(id => s.tablesById[id]?.name ?? null)
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

  const GRID_SIZE = 20

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
      // Snap to grid while dragging — object locks to nearest cell as you move
      const rawX = dragContext.value.x + event.translationX / canvasScale.value
      const rawY = dragContext.value.y + event.translationY / canvasScale.value
      translateX.value = Math.round(rawX / GRID_SIZE) * GRID_SIZE
      translateY.value = Math.round(rawY / GRID_SIZE) * GRID_SIZE
    })
    .onEnd(() => {
      // Already snapped — persist final position
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

  const animatedStyle = useAnimatedStyle(() => {
    const hasAttention = attentionShared.value
    const showStaticBorder = !hasAttention && isSelected

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
      borderColor: isSelected ? colors.info : 'transparent',
      borderRadius: 18,
      padding: showStaticBorder ? 4 : 0
    }
  })

  const orderTotal = useMemo(
    () =>
      effectiveOrder?.items?.reduce(
        (acc: number, item: any) => acc + item.price * item.quantity,
        0
      ) || 0,
    [effectiveOrder?.items]
  )

  const reservationCountdownLabel = useMemo(() => {
    if (liveSession) return null

    const nextReservation = liveNextReservation
      ? {
          date: liveNextReservation.reservation_date,
          time: liveNextReservation.reservation_time
        }
      : null

    if (!nextReservation) return null

    const reservationTimeMs = getReservationTimeMs(nextReservation)
    if (reservationTimeMs == null || !Number.isFinite(reservationTimeMs))
      return null

    const diffMs = reservationTimeMs - Date.now()
    if (diffMs <= 0 || diffMs > 30 * 60 * 1000) return null

    const minutesLeft = Math.max(1, Math.ceil(diffMs / 60000))
    return `Reserved in ${minutesLeft}m`
  }, [tick, liveSession, liveNextReservation])

  const isReservedSoon = !!reservationCountdownLabel

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
    if (!textFit.compactMeta) return reservationCountdownLabel
    const mins = reservationCountdownLabel.match(/(\d+)m/)?.[1]
    return mins ? `R ${mins}m` : 'Reserved'
  }, [reservationCountdownLabel, textFit.compactMeta])

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
                  color: tableColor
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
                    color: tableColor + 'AA',
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

            {isTableType && reservationLabel && (
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
                        color: tableColor + 'CC',
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
                        color: '#FFFFFF',
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
                          color: tableColor + 'CC',
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

          {/* Reservation badge */}
          {isReservedSoon && (
            <View
              style={{
                position: 'absolute',
                bottom: 4,
                right: 4,
                width: 14,
                height: 14,
                borderRadius: 4,
                backgroundColor: colors.info + '30',
                borderWidth: 1,
                borderColor: colors.info + '80',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <Text
                style={{ color: colors.info, fontSize: 7, fontWeight: '800' }}
              >
                R
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
