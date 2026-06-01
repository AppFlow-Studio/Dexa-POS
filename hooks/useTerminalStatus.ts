import { useSupabaseClient } from '@/hooks/useSupabaseClient';
import { DejavooSpinAPI } from '@/lib/payments/dejavoo-spin-api';
import {
  getSharedCastlesService,
  probeCastlesTerminal,
  type CastlesProbeReason,
} from '@/services/terminals/castles-service';
import { CASTLES_DEFAULT_PORT } from '@/types/castles';
import type { StationPaymentTerminal } from '@/types/station';
import NetInfo from '@react-native-community/netinfo';
import { useEffect, useRef, useState } from 'react';

/**
 * Terminal status states
 */
export type TerminalStatus = 'checking' | 'online' | 'offline' | 'not-configured';

/**
 * Discriminated reason exposed to the banner so it can render specific copy.
 * Castles-specific reasons come from CastlesProbeReason; Dejavoo path collapses
 * to 'dejavoo_offline' / 'dejavoo_not_found' / 'dejavoo_error'.
 */
export type TerminalStatusReason =
  | CastlesProbeReason
  | 'dejavoo_offline'
  | 'dejavoo_not_found'
  | 'dejavoo_error'
  | 'not_configured';

/**
 * Return type for useTerminalStatus hook
 */
export interface UseTerminalStatusReturn {
  status: TerminalStatus;
  errorMessage: string | null;
  reason: TerminalStatusReason | null;
  consecutiveFailures: number;
  isReady: boolean; // True when online and ready for payments
  recheckStatus: () => Promise<void>; // Manual recheck function (force-resets singleton + backoff)
}

/** Manual-retry backoff schedule (ms) — applied between consecutive Retry presses. */
const RETRY_BACKOFF_MS = [0, 1_000, 3_000, 8_000];

/** Number of consecutive failures before we start checking for DHCP drift. */
const DHCP_DRIFT_CHECK_THRESHOLD = 3;

/**
 * Return true when `terminalIp` is NOT on the same /24 subnet as `deviceIp`.
 * Rough but good enough: in 99% of retail setups both are on a /24 like
 * 192.168.x.0/24, and a mismatch is a strong signal that the terminal's IP
 * has drifted (DHCP reassignment) or was misconfigured.
 */
function isLikelyDifferentSubnet(
  deviceIp: string | null | undefined,
  terminalIp: string | null | undefined
): boolean {
  if (!deviceIp || !terminalIp) return false;
  const deviceParts = deviceIp.split('.');
  const terminalParts = terminalIp.split('.');
  if (deviceParts.length !== 4 || terminalParts.length !== 4) return false;
  return (
    deviceParts[0] !== terminalParts[0] ||
    deviceParts[1] !== terminalParts[1] ||
    deviceParts[2] !== terminalParts[2]
  );
}

/**
 * Hook to check terminal connectivity status proactively.
 *
 * - Checks terminal status on mount (10s cache for automatic checks)
 * - Manual `recheckStatus()` clears cache, force-disconnects any half-open
 *   Castles singleton socket, and rate-limits consecutive retries with
 *   exponential backoff (1s/3s/8s) so a stuck user can't hammer the address.
 * - Exposes a discriminated `reason` so the banner can show actionable copy
 *   per failure mode (timeout vs refused vs no IP, etc.).
 */
export function useTerminalStatus(
  terminalId: string | undefined,
  paymentTerminal: StationPaymentTerminal | null | undefined
): UseTerminalStatusReturn {
  const supabase = useSupabaseClient();
  const [status, setStatus] = useState<TerminalStatus>('checking');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [reason, setReason] = useState<TerminalStatusReason | null>(null);
  const [consecutiveFailures, setConsecutiveFailures] = useState(0);
  const lastCheckTimeRef = useRef<number>(0);
  const nextAllowedRetryAtRef = useRef<number>(0);
  const consecutiveFailuresRef = useRef<number>(0);
  const CACHE_DURATION_MS = 10000; // 10 seconds

  /**
   * Run the probe and update state. Returns whether the terminal is online so
   * callers can track consecutive-failure counts without racing setState.
   */
  const checkTerminalStatus = async (): Promise<boolean> => {
    // Check if no terminal is configured
    if (!terminalId || !paymentTerminal) {
      setStatus('not-configured');
      setReason('not_configured');
      setErrorMessage('No payment terminal selected');
      return false;
    }

    // Check cache - avoid repeated checks within 10 seconds
    const now = Date.now();
    if (now - lastCheckTimeRef.current < CACHE_DURATION_MS) {
      return status === 'online'; // Use cached result
    }

    setStatus('checking');
    setErrorMessage(null);

    try {
      // --- Castles branch: lightweight probe ---
      if (paymentTerminal.terminal_type === 'castles') {
        const isUsb = paymentTerminal.connection_type === 'usb';

        if (isUsb) {
          // USB probe
          const probe = await probeCastlesTerminal({ connectionType: 'usb' });
          lastCheckTimeRef.current = now;
          if (probe.online) {
            setStatus('online');
            setReason('online');
            setErrorMessage(null);
            return true;
          }
          setStatus('offline');
          setReason(probe.reason);
          setErrorMessage(probe.error || 'Castles USB terminal is unreachable');
          return false;
        }

        // TCP/WiFi probe
        const host = paymentTerminal.ip_address;
        if (!host) {
          setStatus('offline');
          setReason('no_ip_configured');
          setErrorMessage('Castles terminal has no IP address configured');
          lastCheckTimeRef.current = now;
          return false;
        }
        const port = paymentTerminal.port ?? CASTLES_DEFAULT_PORT;
        const probe = await probeCastlesTerminal({ connectionType: 'local_socket', host, port });
        lastCheckTimeRef.current = now;
        if (probe.online) {
          setStatus('online');
          setReason('online');
          setErrorMessage(null);
          return true;
        }
        setStatus('offline');
        setReason(probe.reason);
        setErrorMessage(probe.error || 'Castles terminal is unreachable');
        return false;
      }

      // --- Dejavoo branch (default) ---
      // Initialize Dejavoo API
      const dejavooAPI = new DejavooSpinAPI(supabase);

      // Load terminal credentials (fast path with local credentials)
      const loaded = await dejavooAPI.loadTerminal(terminalId, paymentTerminal);
      if (!loaded) {
        setStatus('offline');
        setReason('dejavoo_error');
        setErrorMessage('Failed to load terminal credentials');
        lastCheckTimeRef.current = now;
        return false;
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
            setReason('online');
            setErrorMessage(null);
            return true;
          case 'Offline':
            setStatus('offline');
            setReason('dejavoo_offline');
            setErrorMessage('Terminal is offline. Please check device connection.');
            return false;
          case 'NotFound':
            setStatus('offline');
            setReason('dejavoo_not_found');
            setErrorMessage('Terminal not found on network');
            return false;
          default:
            setStatus('offline');
            setReason('dejavoo_error');
            setErrorMessage('Unknown terminal status');
            return false;
        }
      } else {
        // Error checking status
        setStatus('offline');
        setReason('dejavoo_error');
        setErrorMessage(statusResult.error || 'Failed to check terminal status');
        return false;
      }
    } catch (error) {
      console.error('[useTerminalStatus] Error checking terminal status:', error);
      setStatus('offline');
      setReason('unknown');
      setErrorMessage(
        error instanceof Error ? error.message : 'Failed to connect to terminal'
      );
      lastCheckTimeRef.current = now;
      return false;
    }
  };

  // Check status on mount
  useEffect(() => {
    void checkTerminalStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [terminalId]); // Only re-run if terminal ID changes

  /**
   * Manual recheck: force-disconnect any half-open Castles singleton socket,
   * clear the 10s cache, run the probe, and apply exponential backoff so
   * repeated taps on a dead address don't hammer the network. Updates the
   * consecutive-failures counter — banner copy can escalate at 3+ failures.
   */
  const recheckStatus = async () => {
    const now = Date.now();
    if (now < nextAllowedRetryAtRef.current) {
      // Still in backoff window — silently ignore. UI can disable the button
      // based on consecutiveFailures if it wants a visible cooldown.
      return;
    }

    // Drop any half-open singleton socket so the next sale starts clean.
    // Safe even if no service has been created yet — disconnect() is a no-op
    // on an unconnected service.
    if (paymentTerminal?.terminal_type === 'castles') {
      try {
        getSharedCastlesService().disconnect();
      } catch (err) {
        console.warn('[useTerminalStatus] singleton disconnect failed:', err);
      }
    }

    lastCheckTimeRef.current = 0; // Clear cache
    const online = await checkTerminalStatus();

    if (online) {
      consecutiveFailuresRef.current = 0;
      setConsecutiveFailures(0);
      nextAllowedRetryAtRef.current = 0;
    } else {
      consecutiveFailuresRef.current += 1;
      setConsecutiveFailures(consecutiveFailuresRef.current);
      const backoffIdx = Math.min(
        consecutiveFailuresRef.current,
        RETRY_BACKOFF_MS.length - 1
      );
      nextAllowedRetryAtRef.current = Date.now() + RETRY_BACKOFF_MS[backoffIdx];

      // After enough failures, sanity-check the configured terminal IP against
      // the device's own LAN IP. If they're on different /24 subnets, it's a
      // strong DHCP-drift signal and we surface a more actionable message.
      if (
        consecutiveFailuresRef.current >= DHCP_DRIFT_CHECK_THRESHOLD &&
        paymentTerminal?.terminal_type === 'castles' &&
        paymentTerminal.connection_type !== 'usb'
      ) {
        const terminalIp = paymentTerminal.ip_address;
        if (terminalIp) {
          try {
            const net = await NetInfo.fetch();
            const deviceIp = (net.details as { ipAddress?: string } | null)?.ipAddress ?? null;
            if (isLikelyDifferentSubnet(deviceIp, terminalIp)) {
              setReason('possible_dhcp_drift');
              setErrorMessage(
                `Terminal IP ${terminalIp} isn’t on this WiFi network${deviceIp ? ` (tablet is on ${deviceIp})` : ''}.`
              );
            }
          } catch (err) {
            console.warn('[useTerminalStatus] NetInfo subnet check failed:', err);
          }
        }
      }
    }
  };

  return {
    status,
    errorMessage,
    reason,
    consecutiveFailures,
    isReady: status === 'online',
    recheckStatus,
  };
}
