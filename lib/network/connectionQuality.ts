import * as Sentry from '@sentry/react-native'
import { DEADLINES } from './deadlines'

export type Quality = 'fast' | 'degraded' | 'slow' | 'probing'

type TimeoutEvent = { ts: number; opName: string }

const TIMEOUT_WINDOW_MS = DEADLINES.timeoutWindowMs

class ConnectionQuality {
  private state: Quality = 'fast'
  private timeouts: TimeoutEvent[] = []
  private listeners = new Set<() => void>()
  private slowEnteredAt: number | null = null
  private probeTimer: ReturnType<typeof setTimeout> | null = null
  private probeBackoffMs: number = DEADLINES.probeIntervalMs
  private notifyTimer: ReturnType<typeof setTimeout> | null = null
  private forced = false
  private probeFn: (() => Promise<void>) | null = null
  private slowToFastHook: (() => void) | null = null
  private metrics = {
    slowModeEntries: 0,
    slowModeTotalMs: 0,
    deadlineExceeded: new Map<string, number>(),
  }

  get (): Quality {
    return this.state
  }

  isSlow (): boolean {
    return this.state === 'slow' || this.state === 'probing'
  }

  reportTimeout (opName: string, _deadlineMs: number): void {
    const now = Date.now()
    this.timeouts.push({ ts: now, opName })
    this.pruneTimeouts(now)
    this.metrics.deadlineExceeded.set(
      opName,
      (this.metrics.deadlineExceeded.get(opName) ?? 0) + 1,
    )
    this.evaluate(now)
  }

  reportSuccess (_opName: string, _durationMs: number): void {
    if (this.state === 'fast') return
    if (this.state === 'degraded' && this.timeouts.length === 0) {
      this.transition('fast')
    }
  }

  subscribe (listener: () => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  reset (): void {
    this.timeouts = []
    if (this.state !== 'fast') this.transition('fast')
  }

  forceSlowMode (force: boolean): void {
    this.forced = force
    if (force) {
      this.transition('slow')
    } else {
      this.reset()
    }
  }

  setProbeFn (fn: (() => Promise<void>) | null): void {
    this.probeFn = fn
  }

  setSlowToFastHook (hook: (() => void) | null): void {
    this.slowToFastHook = hook
  }

  getMetrics (): {
    state: Quality
    slowModeEntries: number
    slowModeTotalMs: number
    deadlineExceeded: Record<string, number>
  } {
    return {
      state: this.state,
      slowModeEntries: this.metrics.slowModeEntries,
      slowModeTotalMs:
        this.metrics.slowModeTotalMs +
        (this.slowEnteredAt !== null ? Date.now() - this.slowEnteredAt : 0),
      deadlineExceeded: Object.fromEntries(this.metrics.deadlineExceeded),
    }
  }

  private pruneTimeouts (now: number): void {
    this.timeouts = this.timeouts.filter(t => now - t.ts <= TIMEOUT_WINDOW_MS)
  }

  private evaluate (now: number): void {
    if (this.forced) return
    if (this.state === 'slow' || this.state === 'probing') return

    const cooldownActive =
      this.slowEnteredAt !== null &&
      now - this.slowEnteredAt < DEADLINES.slowCooldownMs
    if (cooldownActive) return

    if (this.timeouts.length >= 2) {
      this.transition('slow')
      return
    }
    if (this.timeouts.length >= 1) {
      this.transition('degraded')
    }
  }

  private transition (next: Quality): void {
    if (this.state === next) return
    const prev = this.state

    let slowDurationMs: number | null = null

    if (prev === 'slow' || prev === 'probing') {
      if (this.slowEnteredAt !== null) {
        slowDurationMs = Date.now() - this.slowEnteredAt
        this.metrics.slowModeTotalMs += slowDurationMs
        this.slowEnteredAt = null
      }
      this.stopProbeLoop()
    }

    if (next === 'slow') {
      this.metrics.slowModeEntries += 1
      this.slowEnteredAt = Date.now()
      this.probeBackoffMs = DEADLINES.probeIntervalMs
      this.startProbeLoop()
    }

    this.state = next
    this.notifyDebounced()

    // Sentry observability:
    //  - breadcrumb on every state change (helps correlate captured errors with network state)
    //  - setContext so any unrelated error captured during slow-mode is auto-tagged
    //  - measurement on slow→fast for tuning the deadlines.ts constants
    try {
      Sentry.addBreadcrumb({
        category: 'connection_quality',
        level: next === 'slow' ? 'warning' : 'info',
        message: `Connection quality: ${prev} → ${next}`,
        data: {
          prev,
          next,
          timeoutsInWindow: this.timeouts.length,
          ...(slowDurationMs !== null ? { slowDurationMs } : {}),
        },
      })
      Sentry.setContext('connection_quality', {
        state: next,
        lastTransitionAt: Date.now(),
      })
      if (slowDurationMs !== null && next === 'fast') {
        const sentryAny = Sentry as any
        if (sentryAny.metrics?.distribution) {
          sentryAny.metrics.distribution(
            'connection_quality.slow_mode_duration_ms',
            slowDurationMs,
            { unit: 'millisecond' },
          )
        }
      }
    } catch (err) {
      if (__DEV__) {
        console.warn('[connectionQuality] sentry breadcrumb error:', err)
      }
    }

    if ((prev === 'slow' || prev === 'probing') && next === 'fast') {
      try {
        this.slowToFastHook?.()
      } catch (err) {
        if (__DEV__) {
          console.warn('[connectionQuality] slowToFastHook error:', err)
        }
      }
    }
  }

  private startProbeLoop (): void {
    if (this.probeTimer !== null) return
    this.probeTimer = setTimeout(() => {
      this.probeTimer = null
      void this.runProbe()
    }, this.probeBackoffMs)
  }

  private stopProbeLoop (): void {
    if (this.probeTimer !== null) {
      clearTimeout(this.probeTimer)
      this.probeTimer = null
    }
  }

  private async runProbe (): Promise<void> {
    if (this.state !== 'slow' && this.state !== 'probing') return
    const probe = this.probeFn
    if (!probe) {
      this.scheduleNextProbe(false)
      return
    }
    this.transition('probing')
    try {
      await probe()
      this.timeouts = []
      this.transition('fast')
    } catch {
      this.transition('slow')
      this.scheduleNextProbe(false)
    }
  }

  private scheduleNextProbe (success: boolean): void {
    if (this.state !== 'slow') return
    if (success) {
      this.probeBackoffMs = DEADLINES.probeIntervalMs
    } else {
      this.probeBackoffMs = Math.min(
        this.probeBackoffMs * 2,
        DEADLINES.probeBackoffMaxMs,
      )
    }
    this.startProbeLoop()
  }

  private notifyDebounced (): void {
    if (this.notifyTimer !== null) return
    this.notifyTimer = setTimeout(() => {
      this.notifyTimer = null
      for (const l of this.listeners) {
        try {
          l()
        } catch (err) {
          if (__DEV__) {
            console.warn('[connectionQuality] listener error:', err)
          }
        }
      }
    }, DEADLINES.notifyDebounceMs)
  }
}

export const connectionQuality = new ConnectionQuality()
