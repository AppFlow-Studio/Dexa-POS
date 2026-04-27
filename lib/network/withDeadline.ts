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

export async function withDeadline<T> (
  factory: (signal: AbortSignal) => Promise<T>,
  ms: number,
  opName: string,
): Promise<T> {
  const ac = new AbortController()
  const start = Date.now()

  let timer: ReturnType<typeof setTimeout> | null = null
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      ac.abort()
      reject(new DeadlineExceededError(opName, ms))
    }, ms)
  })

  try {
    const result = await Promise.race([factory(ac.signal), deadline])
    if (!isExempt(opName)) {
      connectionQuality.reportSuccess(opName, Date.now() - start)
    }
    return result
  } catch (err) {
    if (err instanceof DeadlineExceededError) {
      if (!isExempt(opName)) {
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
