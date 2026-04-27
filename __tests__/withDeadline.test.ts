jest.mock('@/lib/network/connectionQuality', () => ({
  connectionQuality: {
    reportSuccess: jest.fn(),
    reportTimeout: jest.fn(),
    isSlow: jest.fn(() => false),
  },
}))

import { connectionQuality } from '@/lib/network/connectionQuality'
import { DeadlineExceededError, withDeadline } from '@/lib/network/withDeadline'

describe('withDeadline', () => {
  beforeEach(() => {
    ;(connectionQuality.reportSuccess as jest.Mock).mockClear()
    ;(connectionQuality.reportTimeout as jest.Mock).mockClear()
  })

  it('resolves under deadline and reports success', async () => {
    const result = await withDeadline(
      async () => 'ok',
      100,
      'fast_op',
    )
    expect(result).toBe('ok')
    expect(connectionQuality.reportSuccess).toHaveBeenCalledWith(
      'fast_op',
      expect.any(Number),
    )
    expect(connectionQuality.reportTimeout).not.toHaveBeenCalled()
  })

  it('rejects with DeadlineExceededError past deadline and reports timeout', async () => {
    const promise = withDeadline(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 200)),
      50,
      'slow_op',
    )
    await expect(promise).rejects.toBeInstanceOf(DeadlineExceededError)
    expect(connectionQuality.reportTimeout).toHaveBeenCalledWith('slow_op', 50)
    expect(connectionQuality.reportSuccess).not.toHaveBeenCalled()
  })

  it('aborts the in-flight call signal on timeout', async () => {
    const aborts: AbortSignal[] = []
    const promise = withDeadline(
      (signal) => {
        aborts.push(signal)
        return new Promise<string>((resolve) => setTimeout(() => resolve('late'), 200))
      },
      30,
      'aborts_op',
    )
    await expect(promise).rejects.toBeInstanceOf(DeadlineExceededError)
    expect(aborts).toHaveLength(1)
    expect(aborts[0].aborted).toBe(true)
  })

  it('does not report quality for probe (exempt) opNames', async () => {
    const promise = withDeadline(
      () => new Promise<string>((resolve) => setTimeout(() => resolve('late'), 200)),
      30,
      'probe',
    )
    await expect(promise).rejects.toBeInstanceOf(DeadlineExceededError)
    expect(connectionQuality.reportTimeout).not.toHaveBeenCalled()
  })

  it('propagates non-deadline errors without reporting timeout', async () => {
    const err = new Error('boom')
    const promise = withDeadline(
      async () => {
        throw err
      },
      100,
      'errors_op',
    )
    await expect(promise).rejects.toBe(err)
    expect(connectionQuality.reportTimeout).not.toHaveBeenCalled()
  })

  it('error includes opName and deadlineMs metadata', async () => {
    try {
      await withDeadline(
        () => new Promise<void>(() => {}),
        25,
        'meta_op',
      )
      fail('should have thrown')
    } catch (err) {
      expect(err).toBeInstanceOf(DeadlineExceededError)
      const dee = err as DeadlineExceededError
      expect(dee.opName).toBe('meta_op')
      expect(dee.deadlineMs).toBe(25)
    }
  })
})
