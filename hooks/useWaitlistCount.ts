import { useWaitlistStore } from '@/stores/useWaitlistStore'
import { useMemo } from 'react'

/**
 * Hook to get the count of parties waiting
 * Useful for displaying badge on navigation tabs
 */
export const useWaitlistCount = (): number => {
  const waitlist = useWaitlistStore(s => s.waitlist)

  const count = useMemo(
    () => waitlist.filter(e => e.status === 'waiting').length,
    [waitlist]
  )

  return count
}

export default useWaitlistCount
