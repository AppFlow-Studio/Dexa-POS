/**
 * Locks in the rawIsOnline vs isOnline contract for the bad-WiFi
 * connection-quality slow-mode UI hide. If anyone refactors the hook to
 * collapse these two values, this test fails before the regression ships.
 */

let mockEffectiveIsOnline = true
let mockRawIsOnline = true

jest.mock('@/services/offlineSyncService', () => ({
  getIsOnline: jest.fn(() => mockEffectiveIsOnline),
  getRawIsOnline: jest.fn(() => mockRawIsOnline),
  subscribeOnlineStatus: jest.fn(() => () => {}),
  syncNow: jest.fn(),
  setForceOffline: jest.fn(),
  getForceOffline: jest.fn(() => false),
}))

jest.mock('@/hooks/useConnectionQuality', () => ({
  useConnectionQuality: jest.fn(() => 'fast'),
}))

jest.mock('@/stores/useOrderStore', () => ({
  useOrderStore: (selector: any) =>
    selector({ pendingSyncCount: 0 }),
}))

import { renderHook } from '@testing-library/react-native'
import { useNetworkStatus } from '@/hooks/useNetworkStatus'

describe('useNetworkStatus — rawIsOnline contract', () => {
  beforeEach(() => {
    mockEffectiveIsOnline = true
    mockRawIsOnline = true
  })

  it('exposes both isOnline and rawIsOnline fields', () => {
    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current).toHaveProperty('isOnline')
    expect(result.current).toHaveProperty('rawIsOnline')
  })

  it('both true when network is healthy', () => {
    mockEffectiveIsOnline = true
    mockRawIsOnline = true
    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current.isOnline).toBe(true)
    expect(result.current.rawIsOnline).toBe(true)
  })

  it('rawIsOnline=true and isOnline=false during slow-mode', () => {
    // Slow mode: NetInfo says online, connectionQuality says slow.
    // Routing decisions (isOnline) treat as offline; UI affordances (rawIsOnline)
    // treat as online so we don't show a scary "Offline" banner.
    mockEffectiveIsOnline = false
    mockRawIsOnline = true
    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current.isOnline).toBe(false)
    expect(result.current.rawIsOnline).toBe(true)
  })

  it('both false when NetInfo is truly offline', () => {
    mockEffectiveIsOnline = false
    mockRawIsOnline = false
    const { result } = renderHook(() => useNetworkStatus())
    expect(result.current.isOnline).toBe(false)
    expect(result.current.rawIsOnline).toBe(false)
  })
})
