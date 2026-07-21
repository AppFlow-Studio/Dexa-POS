jest.mock('@/lib/network/connectionQuality', () => ({
  connectionQuality: {
    reportSuccess: jest.fn(),
    reportTimeout: jest.fn(),
    isSlow: jest.fn(() => false),
  },
}))

jest.mock('@/lib/network/killSwitch', () => {
  let mockKillSwitchEnabled = true
  return {
    isDeadlineWrapEnabled: jest.fn(() => mockKillSwitchEnabled),
    setDeadlineWrapEnabled: jest.fn((v: boolean) => {
      mockKillSwitchEnabled = v
    }),
    subscribeKillSwitch: jest.fn(() => () => {}),
  }
})

import { runWithDeadline } from '@/lib/network/runWithDeadline'
import {
  isDeadlineWrapEnabled,
  setDeadlineWrapEnabled,
} from '@/lib/network/killSwitch'

describe('runWithDeadline', () => {
  beforeEach(() => {
    setDeadlineWrapEnabled(true)
  })

  it('returns Supabase result when call resolves under deadline', async () => {
    const result = await runWithDeadline(
      'fast_op',
      100,
      async () => ({ data: { foo: 1 }, error: null }),
    )
    expect(result.data).toEqual({ foo: 1 })
    expect(result.error).toBeNull()
  })

  it('returns DEADLINE_EXCEEDED error when call exceeds deadline', async () => {
    const result = await runWithDeadline<string>(
      'slow_op',
      30,
      () =>
        new Promise<{ data: string | null; error: any }>((resolve) =>
          setTimeout(() => resolve({ data: 'x', error: null }), 200),
        ),
    )
    expect(result.data).toBeNull()
    expect(result.error).toBeDefined()
    expect(result.error.code).toBe('DEADLINE_EXCEEDED')
    expect(result.error.message).toContain('slow_op')
  })

  it('passes through with no signal when kill switch is OFF', async () => {
    setDeadlineWrapEnabled(false)
    let receivedSignal: AbortSignal | undefined
    const result = await runWithDeadline<string>(
      'killed_op',
      30,
      async (signal) => {
        receivedSignal = signal
        // Simulate slow call — but kill switch is off, no deadline applied
        await new Promise((r) => setTimeout(r, 100))
        return { data: 'late_but_returned', error: null }
      },
    )
    expect(result.data).toBe('late_but_returned')
    expect(result.error).toBeNull()
    // The signal was never aborted because no deadline ran
    expect(receivedSignal?.aborted).toBe(false)
  })

  it('propagates non-deadline errors', async () => {
    const err = new Error('rpc failed')
    await expect(
      runWithDeadline(
        'errors_op',
        100,
        async () => {
          throw err
        },
      ),
    ).rejects.toBe(err)
  })

  it('returns Supabase error shape unchanged on RPC error (under deadline)', async () => {
    const result = await runWithDeadline(
      'rpc_err',
      100,
      async () => ({ data: null, error: { message: 'pg error', code: '42P01' } }),
    )
    expect(result.error).toEqual({ message: 'pg error', code: '42P01' })
  })
})
