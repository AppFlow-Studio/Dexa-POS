import type {
  CreateReservationParams,
  Reservation
} from '@/types/db-floor-plan-types'

const BLOCKING_RESERVATION_STATUSES = new Set<Reservation['status']>([
  'pending',
  'confirmed',
  'reminded',
  'arrived',
  'seated'
])

const DEFAULT_RESERVATION_DURATION_MINUTES = 90

const parseReservationStart = (
  reservationDate: string,
  reservationTime: string
): Date | null => {
  if (!reservationDate || !reservationTime) return null

  const rawTime = reservationTime.trim()
  const hasDatePart = rawTime.includes('T') || rawTime.includes('-')
  const parsed = hasDatePart
    ? new Date(rawTime)
    : new Date(`${reservationDate}T${rawTime}`)

  return Number.isFinite(parsed.getTime()) ? parsed : null
}

const getReservationWindow = (
  reservationDate: string,
  reservationTime: string,
  durationMinutes?: number
): { startMs: number; endMs: number } | null => {
  const start = parseReservationStart(reservationDate, reservationTime)
  if (!start) return null

  const safeDuration =
    typeof durationMinutes === 'number' && durationMinutes > 0
      ? durationMinutes
      : DEFAULT_RESERVATION_DURATION_MINUTES

  const startMs = start.getTime()
  return {
    startMs,
    endMs: startMs + safeDuration * 60 * 1000
  }
}

const windowsOverlap = (
  a: { startMs: number; endMs: number },
  b: { startMs: number; endMs: number }
): boolean => a.startMs < b.endMs && b.startMs < a.endMs

const tableIdsOverlap = (left: string[], right: string[]): boolean => {
  if (left.length === 0 || right.length === 0) return false
  const rightSet = new Set(right)
  return left.some(id => rightSet.has(id))
}

export interface ReservationConflict {
  reservationId: string
  partyName: string
  reservationTime: string
  tableIds: string[]
}

export interface ReservationConflictWindowRequest {
  reservationDate: string
  reservationTime: string
  durationMinutes?: number
  tableIds: string[]
  ignoreReservationId?: string
}

export const findReservationTableConflictForWindow = (
  request: ReservationConflictWindowRequest,
  existingReservations: Reservation[]
): ReservationConflict | null => {
  const requestedTableIds = request.tableIds ?? []
  if (requestedTableIds.length === 0) return null

  const requestedWindow = getReservationWindow(
    request.reservationDate,
    request.reservationTime,
    request.durationMinutes
  )
  if (!requestedWindow) return null

  for (const reservation of existingReservations) {
    if (reservation.id === request.ignoreReservationId) continue
    if (!BLOCKING_RESERVATION_STATUSES.has(reservation.status)) continue

    const existingTableIds = reservation.assigned_table_ids ?? []
    if (!tableIdsOverlap(requestedTableIds, existingTableIds)) continue

    const existingDate = reservation.reservation_date ?? request.reservationDate
    const existingWindow = getReservationWindow(
      existingDate,
      reservation.reservation_time,
      reservation.duration_minutes
    )
    if (!existingWindow) continue

    if (!windowsOverlap(requestedWindow, existingWindow)) continue

    return {
      reservationId: reservation.id,
      partyName: reservation.party_name,
      reservationTime: reservation.reservation_time,
      tableIds: existingTableIds.filter(id => requestedTableIds.includes(id))
    }
  }

  return null
}

export const findReservationTableConflict = (
  params: CreateReservationParams,
  existingReservations: Reservation[]
): ReservationConflict | null => {
  return findReservationTableConflictForWindow(
    {
      reservationDate: params.p_reservation_date,
      reservationTime: params.p_reservation_time,
      durationMinutes: params.p_duration_minutes,
      tableIds: params.p_assigned_table_ids ?? []
    },
    existingReservations
  )
}
