import * as Sentry from '@sentry/react-native'
import { connectionQuality } from './connectionQuality'

export class DeadlineExceededError extends Error {
  readonly opName: string
  readonly deadlineMs: number
  constructor (opName: string, deadlineMs: number) {
    super(`Deadline exceeded: ${opName} (${deadlineMs}ms)`)
    this.name = 'DeadlineExceededError'
    this.opName = opName
    this.deadlineMs = deadlineMs
  }
}

const isExempt = (opName: string): boolean =>
  opName.startsWith('_probe_') || opName === 'probe'

export interface DeadlineOptions {
  /**
   * `false` keeps this call out of the connection-quality state machine: no
   * reportSuccess, no reportTimeout, no `connection_quality.timeout`
   * breadcrumb. The deadline itself still applies and still aborts the call.
   *
   * For high-cadence background reads (floor status, session validation)
   * whose timeouts say "this read was slow", not "the station cannot sell".
   * Two reported timeouts inside 30 s flip the station to slow mode, which
   * pauses the outbox drain and stretches payment verification — a background
   * read must not be able to do that.
   */
  quality?: boolean
}

export async function withDeadline<T> (
  factory: (signal: AbortSignal) => Promise<T>,
  ms: number,
  opName: string,
  opts?: DeadlineOptions,
): Promise<T> {
  const ac = new AbortController()
  const start = Date.now()
  const reports = opts?.quality !== false && !isExempt(opName)

  let timer: ReturnType<typeof setTimeout> | null = null
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ac.abort()
      reject(new DeadlineExceededError(opName, ms))
    }, ms)
  })

  try {
    const result = await Promise.race([factory(ac.signal), deadline])
    if (reports) {
      connectionQuality.reportSuccess(opName, Date.now() - start)
    }
    return result
  } catch (err) {
    if (err instanceof DeadlineExceededError) {
      if (reports) {
        connectionQuality.reportTimeout(opName, ms)
        // Sentry breadcrumb so per-op deadline rates are searchable.
        // Probes are exempt to avoid drowning the dashboard during real outages.
        try {
          Sentry.addBreadcrumb({
            category: 'connection_quality.timeout',
            level: 'warning',
            message: `Deadline exceeded: ${opName} (${ms}ms)`,
            data: { opName, deadlineMs: ms },
          })
          const sentryAny = Sentry as any
          if (sentryAny.metrics?.distribution) {
            sentryAny.metrics.distribution(
              'connection_quality.deadline_exceeded',
              1,
              { tags: { op: opName } },
            )
          }
        } catch {
          // never let observability errors mask the real failure
        }
      }
    }
    throw err
  } finally {
    if (timer !== null) clearTimeout(timer)
  }
}
