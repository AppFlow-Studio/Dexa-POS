import { FloorPlanObject } from '@/types/db-floor-plan-types'

/**
 * Calculates estimated wait time based on:
 * 1. Current table availability
 * 2. Average turn time from table metrics
 * 3. Party size and seating requirements
 */
export class WaitTimeCalculator {
  private tables: FloorPlanObject[]
  private DEFAULT_TURN_TIME = 60 // minutes
  private DEFAULT_BASE_WAIT = 15 // minutes

  constructor (tables: FloorPlanObject[]) {
    this.tables = tables
  }

  /**
   * Calculate waittime for a party of given size
   */
  calculateWaitTime (partySize: number, locationId?: string): number {
    const availableTables = this.getAvailableTablesForSize(partySize)
    const avgTurnTime = this.getAverageTurnTime()

    // If tables are available immediately, minimal wait (5-10 minutes for prep)
    if (availableTables.length > 0) {
      return 5 + Math.random() * 5 // 5-10 min
    }

    // Calculate based on occupied tables
    const occupiedTables = this.tables.filter(
      t => t.session && t.session.status !== 'available'
    )
    const avgSeatedTime = this.estimateAverageSeatedTime(occupiedTables)

    // Base wait = average seated time remaining + avg turn time + buffer
    const baseWait = Math.max(
      this.DEFAULT_BASE_WAIT,
      Math.round(avgSeatedTime + this.DEFAULT_TURN_TIME / 2)
    )

    // Adjust for party size (larger parties might wait longer)
    const sizeMultiplier = this.getSizeMultiplier(partySize)

    return Math.round(baseWait * sizeMultiplier)
  }

  /**
   * Get tables that can accommodate the party size
   */
  private getAvailableTablesForSize (partySize: number): FloorPlanObject[] {
    return this.tables.filter(
      t =>
        !t.session &&
        (t.category === 'table' || t.category === 'booth') &&
        (t.capacity || 0) >= partySize &&
        (t.capacity || 0) <= partySize * 2 // Don't use oversized tables
    )
  }

  /**
   * Get average turn time across all tables
   */
  private getAverageTurnTime (): number {
    let totalTurnTime = this.DEFAULT_TURN_TIME
    let count = 0

    this.tables.forEach(t => {
      if (t.default_turn_time) {
        totalTurnTime += t.default_turn_time
        count++
      }
    })

    if (count === 0) return this.DEFAULT_TURN_TIME

    return Math.round(totalTurnTime / (count + 1))
  }

  /**
   * Estimate average time remaining for occupied tables
   */
  private estimateAverageSeatedTime (occupiedTables: FloorPlanObject[]): number {
    if (occupiedTables.length === 0) return this.DEFAULT_BASE_WAIT

    let totalRemainingTime = 0

    occupiedTables.forEach(t => {
      if (t.session && t.session.seated_at) {
        const seatedMinutes = Math.floor(
          (Date.now() - new Date(t.session.seated_at).getTime()) / 60000
        )
        const avgTurnTime = t.default_turn_time || this.DEFAULT_TURN_TIME

        // Estimate remaining time (assume average stay is avg turn time + buffer)
        const remainingTime = Math.max(0, avgTurnTime - seatedMinutes)
        totalRemainingTime += remainingTime
      }
    })

    return Math.round(totalRemainingTime / occupiedTables.length)
  }

  /**
   * Adjust wait time based on party size
   * Larger parties typically wait longer for suitable tables
   */
  private getSizeMultiplier (partySize: number): number {
    if (partySize <= 2) return 0.85
    if (partySize <= 4) return 1.0
    if (partySize <= 6) return 1.15
    return 1.3
  }

  /**
   * Get table recommendations for a party size
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
