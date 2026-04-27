/**
 * Locks in the contract that NetworkStatusBadge stays hidden during
 * connection-quality slow-mode (rawIsOnline=true, isOnline=false). Slow-mode
 * is silent background queueing; surfacing it as "Offline" would scare
 * operators on flaky-but-connected WiFi.
 */

let mockNetworkStatus = {
  isOnline: true,
  rawIsOnline: true,
  pendingSyncCount: 0,
  quality: 'fast' as 'fast' | 'degraded' | 'slow' | 'probing',
  syncNow: jest.fn(),
}

jest.mock('@/hooks/useNetworkStatus', () => ({
  useNetworkStatus: () => mockNetworkStatus,
  useForceOfflineToggle: () => ({ forceOffline: false, toggleForceOffline: jest.fn() }),
}))

jest.mock('lucide-react-native', () => ({
  WifiOff: 'WifiOff',
}))

jest.mock('@/lib/theme', () => ({
  colors: { danger: '#ef4444' },
}))

import React from 'react'
import { render } from '@testing-library/react-native'
import { NetworkStatusBadge } from '@/components/NetworkStatusBadge'

describe('NetworkStatusBadge — slow-mode is invisible', () => {
  beforeEach(() => {
    mockNetworkStatus = {
      isOnline: true,
      rawIsOnline: true,
      pendingSyncCount: 0,
      quality: 'fast',
      syncNow: jest.fn(),
    }
  })

  it('renders nothing when network is healthy', () => {
    const { toJSON } = render(<NetworkStatusBadge />)
    expect(toJSON()).toBeNull()
  })

  it('renders nothing during connection-quality slow-mode (rawIsOnline=true)', () => {
    // Slow mode: effective isOnline=false, but raw NetInfo still online.
    // Badge MUST stay hidden — silent background queueing.
    mockNetworkStatus = {
      isOnline: false,
      rawIsOnline: true,
      pendingSyncCount: 3,
      quality: 'slow',
      syncNow: jest.fn(),
    }
    const { toJSON } = render(<NetworkStatusBadge />)
    expect(toJSON()).toBeNull()
  })

  it('renders the offline pill when truly offline (rawIsOnline=false)', () => {
    mockNetworkStatus = {
      isOnline: false,
      rawIsOnline: false,
      pendingSyncCount: 2,
      quality: 'fast',
      syncNow: jest.fn(),
    }
    const { getByText } = render(<NetworkStatusBadge />)
    expect(getByText(/Offline/)).toBeTruthy()
    expect(getByText(/2 pending/)).toBeTruthy()
  })

  it('shows "Offline" without count when no pending syncs', () => {
    mockNetworkStatus = {
      isOnline: false,
      rawIsOnline: false,
      pendingSyncCount: 0,
      quality: 'fast',
      syncNow: jest.fn(),
    }
    const { getByText, queryByText } = render(<NetworkStatusBadge />)
    expect(getByText(/Offline/)).toBeTruthy()
    expect(queryByText(/pending/)).toBeNull()
  })
})
