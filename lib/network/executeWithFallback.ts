import {
  OfflineOperation,
  queueOperation,
} from '@/services/offlineSyncService'
import { isDeadlineWrapEnabled } from './killSwitch'
import { DeadlineExceededError, withDeadline } from './withDeadline'

export interface SupabaseLikeError {
  message: string
  code?: string
  details?: string
  hint?: string
}

export interface SupabaseLikeResult<T> {
  data: T | null
  error: SupabaseLikeError | null
}

export type QueueOpDraft = Omit<
  OfflineOperation,
  'id' | 'timestamp' | 'retryCount' | 'status' | 'priority'
>

const NEVER_ABORTS_SIGNAL = ((): AbortSignal => {
  const ac = new AbortController()
  return ac.signal
})()

/**
 * Wraps a Supabase mutation with a deadline + offline-queue fallback.
 *
 * Behavior:
 * - Kill switch OFF: passes through to `primary` with a no-op signal — original synchronous behavior.
 * - Kill switch ON, primary resolves under deadline: returns Supabase result unchanged.
 * - Kill switch ON, primary exceeds deadline: aborts the in-flight call, queues the op via
 *   `buildQueueOp()`, returns `{ data: null, error: { code: 'OFFLINE_QUEUED', ... } }`.
 *
 * Callers handle `error.code === 'OFFLINE_QUEUED'` as a soft outcome (op queued, not failed).
 * Other errors propagate as-is from Supabase.
 */
export async function executeWithFallback<T> (
  primary: (signal: AbortSignal) => Promise<SupabaseLikeResult<T>>,
  deadlineMs: number,
  opName: string,
  buildQueueOp: () => QueueOpDraft | null,
): Promise<SupabaseLikeResult<T>> {
  if (!isDeadlineWrapEnabled()) {
    return primary(NEVER_ABORTS_SIGNAL)
  }

  try {
    return await withDeadline(primary, deadlineMs, opName)
  } catch (err) {
    if (err instanceof DeadlineExceededError) {
      const draft = buildQueueOp()
      if (draft) {
        try {
          await queueOperation(draft)
        } catch (qerr) {
          if (__DEV__) {
            console.warn(`[executeWithFallback] queue insert failed for ${opName}:`, qerr)
          }
        }
      }
      return {
        data: null,
        error: {
          message: `Network too slow — operation queued offline (${opName})`,
          code: 'OFFLINE_QUEUED',
        },
      }
    }
    throw err
  }
}
