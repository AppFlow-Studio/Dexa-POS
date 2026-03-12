import { FloorPlanObject, WaitlistEntry } from '@/types/db-floor-plan-types'

/**
 * Represents table metrics for wait time calculation
 */
interface TableMetric {
  table_id: string
  avg_turn_time: number
  avg_covers: number
  recent_accuracy_factor: number // 0.8 to 1.2 based on historical accuracy
}

/**
 * Enhanced wait time calculator based on real operational data:
 * 1. Tables about to free up (check_presented or paid status)
 * 2. Average turn time from table_metrics per table
 * 3. Parties ahead in queue with similar size requirements
 * 4. Historical accuracy data to improve future estimates
 */
export class WaitTimeCalculator {
  private tables: FloorPlanObject[]
  private waitlist: WaitlistEntry[]
  private tableMetrics: Map<string, TableMetric>
  private DEFAULT_TURN_TIME = 60 // minutes
  private DEFAULT_BASE_WAIT = 15 // minutes

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
   * Calculate wait time for a party of given size with enhanced logic.
   * @param partySize  number of guests
   * @param queueDepth number of parties already waiting ahead (default 0)
   * @param locationId for future table_metrics lookup
   * @returns { waitTime: number, estimatedReadyAt: Date, confidence: 'high'|'medium'|'low' }
   */
  calculateWaitTimeEnhanced (
    partySize: number,
    queueDepth: number = 0,
    locationId?: string
  ): {
    waitTime: number
    estimatedReadyAt: Date
    confidence: 'high' | 'medium' | 'low'
  } {
    const suitableTables = this.getSuitableTablesForSize(partySize)

    // Separate tables by status
    const availableTables = suitableTables.filter(t => !t.session)
    const aboutToFreeUpTables = suitableTables.filter(
      t =>
        t.session &&
        (t.session.status === 'check_presented' || t.session.status === 'paid')
    )
    const occupiedOtherTables = suitableTables.filter(
      t =>
        t.session &&
        t.session.status !== 'check_presented' &&
        t.session.status !== 'paid'
    )

    // Count parties ahead with similar size (±2 people)
    const partiesAheadSimilarSize = this.waitlist.filter(
      w =>
        w.status === 'waiting' &&
        w.party_size >= partySize - 2 &&
        w.party_size <= partySize + 2
    ).length

    const totalWaitingAhead = this.waitlist.filter(
      w => w.status === 'waiting'
    ).length

    // Calculate wait time based on availability
    let waitTime: number
    let confidence: 'high' | 'medium' | 'low' = 'medium'

    if (availableTables.length > queueDepth) {
      // Tables available now
      waitTime = 5 // Just prep time
      confidence = 'high'
    } else if (
      availableTables.length === 0 &&
      aboutToFreeUpTables.length === 0 &&
      occupiedOtherTables.length === 0
    ) {
      // No suitable tables at all
      waitTime =
        this.DEFAULT_BASE_WAIT + totalWaitingAhead * this.DEFAULT_TURN_TIME
      confidence = 'low'
    } else if (aboutToFreeUpTables.length > 0) {
      // Tables about to free up — much shorter wait
      const timeToFreeUp = this.calculateTimeToFreeTables(aboutToFreeUpTables)
      const partiesAbsorbedByAboutToFree = Math.min(
        aboutToFreeUpTables.length,
        queueDepth - availableTables.length
      )
      const partiesStillAhead = Math.max(
        0,
        queueDepth - availableTables.length - partiesAbsorbedByAboutToFree
      )

      const additionalTurns = Math.ceil(
        partiesStillAhead / Math.max(1, suitableTables.length)
      )
      const avgTurnTime = this.getAverageTurnTime(suitableTables)

      waitTime = timeToFreeUp + additionalTurns * avgTurnTime
      confidence = 'high'
    } else {
      // Only other occupied tables — standard queue calculation
      const avgTurnTime = this.getAverageTurnTime(suitableTables)
      const partiesAbsorbedByAvailable = availableTables.length
      const partiesStillAhead = queueDepth - partiesAbsorbedByAvailable

      const slotIndex =
        partiesStillAhead % Math.max(1, occupiedOtherTables.length)
      const remainingOnNext = this.estimateRemainingTime(
        occupiedOtherTables[slotIndex]
      )
      const cyclesNeeded = Math.floor(
        partiesStillAhead / Math.max(1, occupiedOtherTables.length)
      )

      waitTime = remainingOnNext + cyclesNeeded * avgTurnTime
      confidence = 'medium'
    }

    // Apply party size multiplier (larger parties typically need longer to order/eat)
    waitTime = Math.round(
      Math.max(this.DEFAULT_BASE_WAIT, waitTime) *
        this.getSizeMultiplier(partySize)
    )

    // Apply historical accuracy factor if available
    if (this.tableMetrics.size > 0) {
      const accuracyFactor = this.calculateAccuracyFactor()
      waitTime = Math.round(waitTime * accuracyFactor)
    }

    // Calculate estimated ready time
    const now = new Date()
    const estimatedReadyAt = new Date(now.getTime() + waitTime * 60000)

    return { waitTime, estimatedReadyAt, confidence }
  }

  /**
   * Backward compatible method for existing code
   */
  calculateWaitTime (partySize: number, queueDepth: number = 0): number {
    const { waitTime } = this.calculateWaitTimeEnhanced(partySize, queueDepth)
    return waitTime
  }

  /**
   * Calculate how long until about-to-free tables are ready
   */
  private calculateTimeToFreeTables (tables: FloorPlanObject[]): number {
    let minTime = Infinity

    for (const table of tables) {
      if (!table.session?.seated_at) continue

      const seatedMinutes = Math.floor(
        (Date.now() - new Date(table.session.seated_at).getTime()) / 60000
      )
      const turnTime = table.default_turn_time || this.DEFAULT_TURN_TIME
      const remaining = Math.max(0, turnTime - seatedMinutes)

      minTime = Math.min(minTime, remaining)
    }

    return minTime === Infinity ? this.DEFAULT_BASE_WAIT : Math.ceil(minTime)
  }

  /**
   * All tables (available or occupied) that fit the party size.
   */
  private getSuitableTablesForSize (partySize: number): FloorPlanObject[] {
    return this.tables.filter(
      t =>
        (t.category === 'table' || t.category === 'booth') &&
        (t.capacity || 0) >= partySize &&
        (t.capacity || 0) <= partySize * 2
    )
  }

  /**
   * Average turn time using table metrics, configured values, or default.
   */
  private getAverageTurnTime (tables?: FloorPlanObject[]): number {
    const tablesToCheck = tables || this.tables

    // First, try to get average from table_metrics
    const metricsAvg = this.getAverageTurnTimeFromMetrics()
    if (metricsAvg > 0) return metricsAvg

    // Fall back to configured table values
    const configured = tablesToCheck
      .map(t => t.default_turn_time)
      .filter((v): v is number => !!v)

    if (configured.length === 0) return this.DEFAULT_TURN_TIME
    return Math.round(configured.reduce((a, b) => a + b, 0) / configured.length)
  }

  /**
   * Get average turn time from table_metrics map
   */
  private getAverageTurnTimeFromMetrics (): number {
    if (this.tableMetrics.size === 0) return 0

    const avgTurns = Array.from(this.tableMetrics.values()).map(
      m => m.avg_turn_time
    )
    if (avgTurns.length === 0) return 0

    return Math.round(avgTurns.reduce((a, b) => a + b, 0) / avgTurns.length)
  }

  /**
   * Calculate accuracy factor based on historical quoted vs actual wait times
   */
  private calculateAccuracyFactor (): number {
    if (this.tableMetrics.size === 0) return 1.0

    const factors = Array.from(this.tableMetrics.values()).map(
      m => m.recent_accuracy_factor
    )
    if (factors.length === 0) return 1.0

    const avgFactor = factors.reduce((a, b) => a + b, 0) / factors.length

    // Clamp between 0.8 and 1.2 to avoid extreme adjustments
    return Math.max(0.8, Math.min(1.2, avgFactor))
  }

  /**
   * Estimate minutes remaining in the current session for a single table.
   */
  private estimateRemainingTime (table: FloorPlanObject): number {
    if (!table.session?.seated_at) return this.DEFAULT_BASE_WAIT

    const seatedMinutes = Math.floor(
      (Date.now() - new Date(table.session.seated_at).getTime()) / 60000
    )

    // Check if we have specific metrics for this table
    const tableMetric = this.tableMetrics.get(table.id)
    const turnTime =
      tableMetric?.avg_turn_time ||
      table.default_turn_time ||
      this.DEFAULT_TURN_TIME

    return Math.max(0, turnTime - seatedMinutes)
  }

  /**
   * Larger parties wait longer for suitable tables.
   */
  private getSizeMultiplier (partySize: number): number {
    if (partySize <= 2) return 0.85
    if (partySize <= 4) return 1.0
    if (partySize <= 6) return 1.15
    return 1.3
  }

  /**
   * Get available table recommendations for a party size.
   */
  getRecommendedTables (partySize: number): FloorPlanObject[] {
    return this.tables
      .filter(
        t =>
          !t.session &&
          (t.category === 'table' || t.category === 'booth') &&
          (t.capacity || 0) >= partySize &&
          (t.capacity || 0) <= partySize * 2
      )
      .sort((a, b) => (a.capacity || 0) - (b.capacity || 0))
  }
}

export default WaitTimeCalculator
