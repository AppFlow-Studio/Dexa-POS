import { isDeadlineWrapEnabled } from './killSwitch'
import { DeadlineExceededError, withDeadline } from './withDeadline'

/**
 * Wraps a Supabase RPC/select call with a deadline.
 *
 * Behavior:
 * - Kill switch OFF: passes through to `call` with a no-op signal — original
 *   synchronous behavior. Single-toggle rollback in <30s without redeploying.
 * - Kill switch ON, call resolves under deadline: returns Supabase result unchanged.
 * - Kill switch ON, call exceeds deadline: aborts in-flight call, returns
 *   `{ data: null, error: { code: 'DEADLINE_EXCEEDED', ... } }` so existing
 *   error-handling branches in callers route through their normal error path
 *   (often `queueFailedOperation`).
 *
 * Uses Supabase v2's `.abortSignal(signal)` to actually cancel the underlying
 * fetch — the call is dropped, not just the awaiter.
 */
export async function runWithDeadline<T> (
  opName: string,
  deadlineMs: number,
  call: (signal: AbortSignal) => Promise<{ data: T | null; error: any }>,
): Promise<{ data: T | null; error: any }> {
  if (!isDeadlineWrapEnabled()) {
    const ac = new AbortController()
    return call(ac.signal)
  }
  try {
    return await withDeadline(call, deadlineMs, opName)
  } catch (err) {
    if (err instanceof DeadlineExceededError) {
      return {
        data: null,
        error: {
          message: `Network too slow — ${opName} timed out after ${deadlineMs}ms`,
          code: 'DEADLINE_EXCEEDED',
          details: '',
          hint: 'Operation will retry via offline queue if upstream caller queues on error.',
        },
      }
    }
    throw err
  }
}
