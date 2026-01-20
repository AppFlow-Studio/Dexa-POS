import { useSupabaseClient } from '@/hooks/useSupabaseClient';
import { DejavooSpinAPI } from '@/lib/payments/dejavoo-spin-api';
import type { StationPaymentTerminal } from '@/types/station';
import { useEffect, useRef, useState } from 'react';

/**
 * Terminal status states
 */
export type TerminalStatus = 'checking' | 'online' | 'offline' | 'not-configured';

/**
 * Return type for useTerminalStatus hook
 */
export interface UseTerminalStatusReturn {
  status: TerminalStatus;
  errorMessage: string | null;
  isReady: boolean; // True when online and ready for payments
  recheckStatus: () => Promise<void>; // Manual recheck function
}

/**
 * Hook to check terminal connectivity status proactively
 *
 * This hook:
 * - Checks terminal status on mount using DejavooAPI.checkStatus()
 * - Returns current status and error message
 * - Caches result for 10 seconds to avoid repeated checks
 * - Provides manual recheck function
 *
 * @param terminalId - The payment terminal ID
 * @param paymentTerminal - The payment terminal object (for fast path credentials)
 * @returns Terminal status information
 */
export function useTerminalStatus(
  terminalId: string | undefined,
  paymentTerminal: StationPaymentTerminal | null | undefined
): UseTerminalStatusReturn {
  const supabase = useSupabaseClient();
  const [status, setStatus] = useState<TerminalStatus>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const lastCheckTimeRef = useRef<number>(0);
  const CACHE_DURATION_MS = 10000; // 10 seconds

  const checkTerminalStatus = async () => {
    // Check if no terminal is configured
    if (!terminalId || !paymentTerminal) {
      setStatus('not-configured');
      setErrorMessage('No payment terminal selected');
      return;
    }

    // Check cache - avoid repeated checks within 10 seconds
    const now = Date.now();
    if (now - lastCheckTimeRef.current < CACHE_DURATION_MS) {
      return; // Use cached result
    }

    setStatus('checking');
    setErrorMessage(null);

    try {
      // Initialize Dejavoo API
      const dejavooAPI = new DejavooSpinAPI(supabase);
    
      // Load terminal credentials (fast path with local credentials)
      const loaded = await dejavooAPI.loadTerminal(terminalId, paymentTerminal);
      if (!loaded) {
        setStatus('offline');
        setErrorMessage('Failed to load terminal credentials');
        lastCheckTimeRef.current = now;
        return;
      }

      // Check terminal status
      const statusResult = await dejavooAPI.checkStatus();

      // Update last check time
      lastCheckTimeRef.current = now;

      if (statusResult.success) {
        // Map status to our enum
        switch (statusResult.status) {
          case 'Online':
            setStatus('online');
            setErrorMessage(null);
            break;
          case 'Offline':
            setStatus('offline');
            setErrorMessage('Terminal is offline. Please check device connection.');
            break;
          case 'NotFound':
            setStatus('offline');
            setErrorMessage('Terminal not found on network');
            break;
          default:
            setStatus('offline');
            setErrorMessage('Unknown terminal status');
        }
      } else {
        // Error checking status
        setStatus('offline');
        setErrorMessage(statusResult.error || 'Failed to check terminal status');
      }
    } catch (error) {
      console.error('[useTerminalStatus] Error checking terminal status:', error);
      setStatus('offline');
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to connect to terminal'
      );
      lastCheckTimeRef.current = now;
    }
  };

  // Check status on mount
  useEffect(() => {
    checkTerminalStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId]); // Only re-run if terminal ID changes

  // Manual recheck function (clears cache)
  const recheckStatus = async () => {
    lastCheckTimeRef.current = 0; // Clear cache
    await checkTerminalStatus();
  };

  return {
    status,
    errorMessage,
    isReady: status === 'online',
    recheckStatus,
  };
}
