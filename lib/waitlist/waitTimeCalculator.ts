import { FloorPlanObject, WaitlistEntry } from '@/types/db-floor-plan-types'

interface TableMetric {
  table_id: string
  avg_turn_time: number
  avg_covers: number
  recent_accuracy_factor: number
}

/**
 * Status buckets:
 *
 * OPEN now       — no session | available | cleaning
 * CLOSING soon   — check_presented | paying | paid | closing   (~5 min remaining)
 * OCCUPIED       — seating | ordering | ordered | served       (estimate from seated_at)
 * UNUSABLE       — reserved | blocked | not_in_service         (skip entirely)
 */

type TableBucket = 'open' | 'closing' | 'occupied' | 'unusable'

function getBucket (table: FloorPlanObject): TableBucket {
  const status = table.session?.status
  if (!status || status === 'available' || status === 'cleaning') return 'open'
  if (status === 'check_presented' || status === 'paying' || status === 'paid' || status === 'closing') return 'closing'
  if (status === 'reserved' || status === 'blocked' || status === 'not_in_service') return 'unusable'
  // seating | ordering | ordered | served
  return 'occupied'
}

export class WaitTimeCalculator {
  private tables: FloorPlanObject[]
  private waitlist: WaitlistEntry[]
  private tableMetrics: Map<string, TableMetric>

  /** Default full dining turn if no per-table config or metrics exist */
  private DEFAULT_TURN_TIME = 60
  /** Minutes to clean + seat after a table frees up */
  private TURNOVER_BUFFER = 5

  constructor (
    tables: FloorPlanObject[],
    waitlist: WaitlistEntry[] = [],
    tableMetrics: Map<string, TableMetric> = new Map()
  ) {
    this.tables = tables
    this.waitlist = waitlist
    this.tableMetrics = tableMetrics
  }

  /**
   * Core algorithm:
   *
   * 1. Find all tables that CAN seat this party (capacity >= partySize, not unusable).
   * 2. Build a sorted "release timeline" — a list of (minutesUntilFree) for each
   *    usable table, sorted ascending.
   *    - open tables     → 0 min
   *    - closing tables  → TURNOVER_BUFFER (they're leaving now)
   *    - occupied tables → max(0, turnTime - minutesSeated) + TURNOVER_BUFFER
   * 3. Count parties in the waitlist ahead of this one that also need a similar table.
   * 4. The estimated wait = release time of the (partiesAhead + 1)th slot.
   *    If there are enough slots available before this party, wait = 0.
   */
  calculateWaitTimeEnhanced (
    partySize: number,
    queueDepth: number = 0,
    _locationId?: string
  ): {
    waitTime: number
    estimatedReadyAt: Date
    confidence: 'high' | 'medium' | 'low'
  } {
    // All tables that physically fit this party and aren't out of service
    const usableTables = this.tables.filter(t => {
      if (t.category !== 'table' && t.category !== 'booth') return false
      if (getBucket(t) === 'unusable') return false
      // Accept tables with no capacity set (assume they fit) or capacity >= partySize
      const cap = t.capacity ?? Infinity
      return cap >= partySize
    })

    if (usableTables.length === 0) {
      // No suitable tables in the venue at all
      const waitTime = this.DEFAULT_TURN_TIME
      return {
        waitTime,
        estimatedReadyAt: new Date(Date.now() + waitTime * 60_000),
        confidence: 'low',
      }
    }

    // Build release timeline — minutes until each table is ready for the next party
    const releaseTimes: number[] = usableTables
      .map(t => {
        const bucket = getBucket(t)
        if (bucket === 'open') return 0
        if (bucket === 'closing') return this.TURNOVER_BUFFER
        // occupied — estimate remaining seated time + buffer
        return this.estimateRemainingTime(t) + this.TURNOVER_BUFFER
      })
      .sort((a, b) => a - b) // ascending: soonest-free first

    // How many parties are ahead in the waitlist that also need a similar table?
    // Use the full waitlist queue position (queueDepth if provided, else count from store)
    const partiesAhead = queueDepth > 0
      ? queueDepth
      : this.waitlist.filter(w => w.status === 'waiting' || w.status === 'notified').length

    // The slot this party needs is index = partiesAhead (0-based)
    // e.g. 0 parties ahead → needs slot [0] (first free table)
    //      2 parties ahead → needs slot [2] (third free table)
    let waitTime: number
    let confidence: 'high' | 'medium' | 'low'

    if (partiesAhead < releaseTimes.length) {
      // There is a table slot for this party
      waitTime = releaseTimes[partiesAhead]
      confidence = waitTime === 0 ? 'high' : 'medium'
    } else {
      // More parties ahead than available table slots — need to project forward
      // Estimate how many full turn cycles are needed beyond the last known slot
      const avgTurnTime = this.getAverageTurnTime(usableTables)
      const lastSlotTime = releaseTimes[releaseTimes.length - 1]
      const extraParties = partiesAhead - releaseTimes.length + 1
      const extraCycles = Math.ceil(extraParties / usableTables.length)
      waitTime = lastSlotTime + extraCycles * (avgTurnTime + this.TURNOVER_BUFFER)
      confidence = 'low'
    }

    // Apply historical accuracy factor if we have metrics
    if (this.tableMetrics.size > 0) {
      waitTime = Math.round(waitTime * this.calculateAccuracyFactor())
    }

    // Round to nearest 5 for display (feels more honest than false precision)
    if (waitTime > 0) {
      waitTime = Math.ceil(waitTime / 5) * 5
    }

    return {
      waitTime,
      estimatedReadyAt: new Date(Date.now() + waitTime * 60_000),
      confidence,
    }
  }

  calculateWaitTime (partySize: number, queueDepth: number = 0): number {
    return this.calculateWaitTimeEnhanced(partySize, queueDepth).waitTime
  }

  // ── Private helpers ──────────────────────────────────────────

  /**
   * Minutes remaining in the current session for an occupied table.
   * Uses per-table metrics > per-table config > global default.
   */
  private estimateRemainingTime (table: FloorPlanObject): number {
    if (!table.session?.seated_at) return this.DEFAULT_TURN_TIME / 2

    const seatedMinutes = Math.floor(
      (Date.now() - new Date(table.session.seated_at).getTime()) / 60_000
    )
    const metric = this.tableMetrics.get(table.id)
    const turnTime = metric?.avg_turn_time ?? table.default_turn_time ?? this.DEFAULT_TURN_TIME

    return Math.max(0, turnTime - seatedMinutes)
  }

  private getAverageTurnTime (tables: FloorPlanObject[]): number {
    // Prefer table_metrics average
    if (this.tableMetrics.size > 0) {
      const vals = Array.from(this.tableMetrics.values()).map(m => m.avg_turn_time)
      if (vals.length > 0) return Math.round(vals.reduce((a, b) => a + b, 0) / vals.length)
    }
    // Fall back to per-table config
    const configured = tables.map(t => t.default_turn_time).filter((v): v is number => v != null)
    if (configured.length > 0) return Math.round(configured.reduce((a, b) => a + b, 0) / configured.length)
    return this.DEFAULT_TURN_TIME
  }

  private calculateAccuracyFactor (): number {
    const factors = Array.from(this.tableMetrics.values()).map(m => m.recent_accuracy_factor)
    if (factors.length === 0) return 1.0
    const avg = factors.reduce((a, b) => a + b, 0) / factors.length
    return Math.max(0.8, Math.min(1.2, avg))
  }

  getRecommendedTables (partySize: number): FloorPlanObject[] {
    return this.tables
      .filter(t => {
        if (t.category !== 'table' && t.category !== 'booth') return false
        if (getBucket(t) !== 'open') return false
        const cap = t.capacity ?? Infinity
        return cap >= partySize
      })
      .sort((a, b) => (a.capacity ?? 999) - (b.capacity ?? 999))
  }
}

export default WaitTimeCalculator
