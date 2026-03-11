import { FloorPlanObject } from '@/types/db-floor-plan-types'

/**
 * Calculates estimated wait time based on:
 * 1. Current table availability for party size
 * 2. Time remaining on occupied suitable tables (sorted soonest first)
 * 3. Queue depth — how many parties are already ahead
 * 4. Party size multiplier
 */
export class WaitTimeCalculator {
  private tables: FloorPlanObject[]
  private DEFAULT_TURN_TIME = 60 // minutes
  private DEFAULT_BASE_WAIT = 15 // minutes

  constructor (tables: FloorPlanObject[]) {
    this.tables = tables
  }

  /**
   * Calculate wait time for a party of given size.
   * @param partySize  number of guests
   * @param queueDepth number of parties already waiting ahead (default 0)
   */
  calculateWaitTime (partySize: number, queueDepth: number = 0): number {
    const suitableTables = this.getSuitableTablesForSize(partySize)
    const availableTables = suitableTables.filter(t => !t.session)
    const avgTurnTime = this.getAverageTurnTime()

    // Tables currently occupied that could serve this party, sorted by soonest free
    const occupiedSuitable = suitableTables
      .filter(t => t.session)
      .map(t => ({ table: t, remaining: this.estimateRemainingTime(t) }))
      .sort((a, b) => a.remaining - b.remaining)

    const tableCount = availableTables.length + occupiedSuitable.length

    // No suitable tables at all — fall back to generic wait
    if (tableCount === 0) {
      const baseWait = this.DEFAULT_BASE_WAIT + queueDepth * avgTurnTime
      return Math.round(baseWait * this.getSizeMultiplier(partySize))
    }

    // Available tables — first queueDepth parties take them, check if any left for us
    if (availableTables.length > queueDepth) {
      return 5 // table ready now, just prep time
    }

    // How many parties have taken available tables already
    const partiesAbsorbedByAvailable = availableTables.length
    const partiesStillAhead = queueDepth - partiesAbsorbedByAvailable

    // Which occupied table slot will open for us (round-robin through occupied tables)
    const slotIndex = partiesStillAhead % Math.max(1, occupiedSuitable.length)
    const cyclesNeeded = Math.floor(partiesStillAhead / Math.max(1, occupiedSuitable.length))

    const soonestRemaining = occupiedSuitable[slotIndex]?.remaining ?? this.DEFAULT_BASE_WAIT
    const waitTime = soonestRemaining + cyclesNeeded * avgTurnTime

    return Math.round(Math.max(this.DEFAULT_BASE_WAIT, waitTime) * this.getSizeMultiplier(partySize))
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
   * Average turn time using only configured table values; falls back to default.
   */
  private getAverageTurnTime (): number {
    const configured = this.tables
      .map(t => t.default_turn_time)
      .filter((v): v is number => !!v)

    if (configured.length === 0) return this.DEFAULT_TURN_TIME
    return Math.round(configured.reduce((a, b) => a + b, 0) / configured.length)
  }

  /**
   * Estimate minutes remaining in the current session for a single table.
   */
  private estimateRemainingTime (table: FloorPlanObject): number {
    if (!table.session?.seated_at) return this.DEFAULT_BASE_WAIT

    const seatedMinutes = Math.floor(
      (Date.now() - new Date(table.session.seated_at).getTime()) / 60000
    )
    const turnTime = table.default_turn_time || this.DEFAULT_TURN_TIME
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
