// ============================================================
// Hook for Payment Terminal Operations
// File: hooks/usePaymentTerminal.ts
// ============================================================

import { useCallback, useRef } from 'react';
import { useSupabaseClient } from '@/hooks/useSupabaseClient';
import { DejavooService } from '@/services/payments/dejavoo';
import { getSharedCastlesService } from '@/services/terminals/castles-service';
import { getOrCreateCounter } from '@/services/terminals/castles-txn-counter';
import { extractLast4 } from '@/services/terminals/castles-response-mapper';
import { CASTLES_DEFAULT_PORT, CASTLES_SOCKET_TIMEOUT_MS } from '@/types/castles';
import { getSharedValorService } from '@/services/terminals/valor-service';
import { getOrCreateValorCounter } from '@/services/terminals/valor-txn-counter';
import {
  VALOR_DEFAULT_PORT,
  VALOR_SALE_TIMEOUT_MS,
  VALOR_TEST_DEADLINE_MS,
  VALOR_TEST_OP_NAME,
} from '@/types/valor';
import { usePaymentTerminalStore } from '@/stores/usePaymentTerminalStore';
import { withDeadline, DeadlineExceededError } from '@/lib/network/withDeadline';

// Hard ceiling for an interactive "Test Connection" so the spinner can never
// spin forever. A healthy terminal responds in <2s; a wedged one will never
// respond, so 30s is a generous upper bound before we force-recover and report
// offline. Uses an exempt `_probe_` opName so terminal reachability doesn't
// pollute the global WiFi connection-quality signal.
const CASTLES_TEST_DEADLINE_MS = 30_000;
const CASTLES_TEST_OP_NAME = '_probe_terminal_test';

export function usePaymentTerminal() {
  const supabase = useSupabaseClient();
  const dejavooServiceRef = useRef<DejavooService | null>(null);

  const {
    terminals,
    activeTerminalId,
    isTestingConnection,
    setTerminals,
    setActiveTerminal,
    updateTerminalStatus,
    setConnectionTesting,
    setError,
    getActiveTerminal,
  } = usePaymentTerminalStore();

  // Get or create Dejavoo service instance
  const getDejavooService = useCallback(() => {
    if (!dejavooServiceRef.current) {
      dejavooServiceRef.current = new DejavooService(supabase);
    }
    return dejavooServiceRef.current;
  }, [supabase]);

  const getCastlesService = useCallback(() => getSharedCastlesService(), []);
  const getValorService = useCallback(() => getSharedValorService(), []);

  // Load terminals for the current station
  const loadTerminals = useCallback(async (locationId: string) => {
    try {
      const { data, error } = await supabase
        .from('payment_terminals')
        .select('*')
        .eq('location_id', locationId);

      if (error) throw error;

      const mappedTerminals = (data || []).map((t: any) => ({
        id: t.id,
        name: t.terminal_name,
        model: t.terminal_model,
        terminalType: t.terminal_type,
        ipAddress: t.terminal_type === 'valor' ? t.valor_ip_address : t.local_ip_address,
        port: t.terminal_type === 'valor' ? t.valor_port : t.local_port,
        cancelPort: t.valor_cancel_port,
        epi: t.valor_epi,
        connectionType: t.connection_type === 'usb' ? 'usb' as const : 'local_socket' as const,
        isActive: t.is_active,
        isConnected: t.is_connected,
        stationId: t.station_id,
        lastConnectionTest: t.last_connection_test_at,
        lastConnectionStatus: t.last_connection_status,
        serialNumber: t.serial_number,
      }));

      setTerminals(mappedTerminals);

      // Auto-select first terminal if none selected
      if (!activeTerminalId && mappedTerminals.length > 0) {
        setActiveTerminal(mappedTerminals[0].id);
      }
    } catch (err) {
      console.error('[usePaymentTerminal] Failed to load terminals:', err);
      setError(err instanceof Error ? err.message : 'Failed to load terminals');
    }
  }, [supabase, activeTerminalId, setTerminals, setActiveTerminal, setError]);

  // Test connection to active terminal
  const testConnection = useCallback(async (terminalId?: string): Promise<boolean> => {
    const targetId = terminalId || activeTerminalId;
    if (!targetId) {
      setError('No terminal selected');
      return false;
    }

    setConnectionTesting(true);
    setError(null);

    try {
      const terminal = terminals.find((t) => t.id === targetId);

      // Castles: connect + getData to verify terminal is responsive
      if (terminal?.terminalType === 'castles') {
        const service = getCastlesService();
        const isUsb = terminal.connectionType === 'usb';
        const host = terminal.ipAddress;
        if (!isUsb && !host) throw new Error('Castles terminal IP address not configured');

        // Defensive resume: the singleton may be in the suspended state
        // (set by AppState background handler). resume() is a no-op when not
        // suspended, so always safe to call before an explicit connect.
        if (service.isSuspended()) {
          service.resume();
        }

        const config = {
          connectionType: isUsb ? ('usb' as const) : ('local_socket' as const),
          host: isUsb ? undefined : host,
          port: isUsb ? undefined : (terminal.port ?? CASTLES_DEFAULT_PORT),
          timeout: CASTLES_SOCKET_TIMEOUT_MS,
          terminalId: targetId,
        };

        // The whole connect → reset → getData chain runs through the Castles
        // command mutex. If a prior op left the mutex wedged, these awaits would
        // queue forever and the spinner would never clear. Bound the chain with
        // a hard deadline; on timeout, force-recover (suspend tears the transport
        // down regardless of mutex state, releasing the stuck lock) so the
        // terminal becomes usable again and we report a clean offline state.
        let result: Awaited<ReturnType<typeof service.getTerminalData>>;
        try {
          result = await withDeadline(
            async () => {
              // 1. Establish / reuse connection (TCP or USB)
              await service.connect(config);
              await service.resetTerminalState();

              // 2. Initialize counter and send getData command
              const counter = getOrCreateCounter({ terminalId: targetId, supabaseClient: supabase });
              if (!counter.isInitialized) await counter.initialize();
              return service.getTerminalData(counter.next());
            },
            CASTLES_TEST_DEADLINE_MS,
            CASTLES_TEST_OP_NAME,
          );
        } catch (deadlineErr) {
          if (deadlineErr instanceof DeadlineExceededError) {
            console.warn('[usePaymentTerminal] Terminal test deadline exceeded — force-recovering service');
            try { await service.suspend(); } catch { /* best-effort */ }
            service.resume(config);
            updateTerminalStatus(targetId, {
              isConnected: false,
              lastConnectionStatus: 'Offline',
              lastConnectionTest: new Date().toISOString(),
            });
            setError('Terminal not responding — check that it is powered on and on the same network.');
            return false;
          }
          throw deadlineErr;
        }

        if (result.success) {
          // 3a. Success — update store + DB with firmware info
          updateTerminalStatus(targetId, {
            isConnected: true,
            lastConnectionStatus: 'Online',
            lastConnectionTest: new Date().toISOString(),
          });

          try {
            await supabase.rpc('update_terminal_health', {
              p_terminal_id: targetId,
              p_is_connected: true,
              p_status: 'Online',
              p_firmware_version: result.data?.infAppVersion ?? null,
              p_consecutive_failures: 0,
            });
          } catch (dbErr) {
            console.warn('[usePaymentTerminal] Castles DB health update failed:', dbErr);
          }

          // Write serial number if the terminal reported one
          if (result.data?.infSN) {
            supabase
              .from('payment_terminals')
              .update({ serial_number: result.data.infSN })
              .eq('id', targetId)
              .then(({ error }) => {
                if (error) console.warn('[usePaymentTerminal] Serial number update failed:', error);
              });
          }

          return true;
        } else {
          // 3b. getData failed — terminal not responsive
          const errMsg = result.error || 'Terminal did not respond to getData';
          updateTerminalStatus(targetId, {
            isConnected: false,
            lastConnectionStatus: 'Offline',
            lastConnectionTest: new Date().toISOString(),
          });

          try {
            await supabase.rpc('update_terminal_health', {
              p_terminal_id: targetId,
              p_is_connected: false,
              p_status: 'Offline',
              p_last_error_message: errMsg,
            });
          } catch (dbErr) {
            console.warn('[usePaymentTerminal] Castles DB health update failed:', dbErr);
          }

          setError(errMsg);
          return false;
        }
      }

      // Valor: connect + TERMINAL_QUERY (TRAN_MODE 96) to verify responsiveness
      if (terminal?.terminalType === 'valor') {
        const service = getValorService();
        const isUsb = terminal.connectionType === 'usb';
        const host = terminal.ipAddress;
        if (!isUsb && !host) throw new Error('Valor terminal IP address not configured');

        if (service.isSuspended()) service.resume();

        const config = {
          connectionType: isUsb ? ('usb' as const) : ('local_socket' as const),
          host: isUsb ? undefined : host,
          port: isUsb ? undefined : (terminal.port ?? VALOR_DEFAULT_PORT),
          cancelPort: terminal.cancelPort,
          epi: terminal.epi,
          timeout: VALOR_SALE_TIMEOUT_MS,
          terminalId: targetId,
        };

        let qResult: Awaited<ReturnType<typeof service.terminalQuery>>;
        try {
          qResult = await withDeadline(
            async () => {
              await service.connect(config);
              return service.terminalQuery();
            },
            VALOR_TEST_DEADLINE_MS,
            VALOR_TEST_OP_NAME,
          );
        } catch (deadlineErr) {
          if (deadlineErr instanceof DeadlineExceededError) {
            try { await service.suspend(); } catch { /* best-effort */ }
            service.resume(config);
            updateTerminalStatus(targetId, {
              isConnected: false,
              lastConnectionStatus: 'Offline',
              lastConnectionTest: new Date().toISOString(),
            });
            setError('Terminal not responding — check that it is powered on and on the same network.');
            return false;
          }
          throw deadlineErr;
        }

        updateTerminalStatus(targetId, {
          isConnected: qResult.success,
          lastConnectionStatus: qResult.success ? 'Online' : 'Offline',
          lastConnectionTest: new Date().toISOString(),
        });

        try {
          await supabase.rpc('update_terminal_health', {
            p_terminal_id: targetId,
            p_is_connected: qResult.success,
            p_status: qResult.success ? 'Online' : 'Offline',
            p_firmware_version: qResult.data?.appVersion ?? null,
            p_consecutive_failures: qResult.success ? 0 : undefined,
          });
        } catch (dbErr) {
          console.warn('[usePaymentTerminal] Valor DB health update failed:', dbErr);
        }

        if (qResult.success && qResult.data?.serialNumber) {
          supabase
            .from('payment_terminals')
            .update({ serial_number: qResult.data.serialNumber })
            .eq('id', targetId)
            .then(({ error }) => {
              if (error) console.warn('[usePaymentTerminal] Valor serial update failed:', error);
            });
        }

        if (!qResult.success) setError(qResult.error || 'Terminal did not respond to query');
        return qResult.success;
      }

      // Dejavoo: existing path
      const service = getDejavooService();
      const loaded = await service.loadCredentials(targetId);

      if (!loaded) {
        throw new Error('Failed to load terminal credentials');
      }

      const result = await service.checkTerminalStatus();

      // Update local state
      updateTerminalStatus(targetId, {
        isConnected: result.status === 'Online',
        lastConnectionStatus: result.status,
        lastConnectionTest: new Date().toISOString(),
      });

      // Update database
      await supabase.rpc('update_terminal_status', {
        p_terminal_id: targetId,
        p_status: result.status,
        p_is_connected: result.status === 'Online',
      });

      if (result.status !== 'Online') {
        setError(result.error || `Terminal is ${result.status}`);
      }

      return result.status === 'Online';
    } catch (err) {
      console.error('[usePaymentTerminal] Connection test failed:', err);
      setError(err instanceof Error ? err.message : 'Connection test failed');

      updateTerminalStatus(targetId, {
        isConnected: false,
        lastConnectionStatus: 'Offline',
        lastConnectionTest: new Date().toISOString(),
      });

      return false;
    } finally {
      setConnectionTesting(false);
    }
  }, [activeTerminalId, terminals, getDejavooService, getCastlesService, getValorService, updateTerminalStatus, setConnectionTesting, setError, supabase]);

  // ============================================================
  // CASTLES SALE
  // ============================================================

  const processCastlesSale = useCallback(async (params: {
    orderId: string;
    amount: number;
    tipAmount?: number;
    terminal: { id: string; ipAddress?: string; port?: number; connectionType?: 'local_socket' | 'usb' };
  }): Promise<{
    success: boolean;
    transactionId?: string;
    authCode?: string;
    cardType?: string;
    lastFour?: string;
    error?: string;
  }> => {
    const service = getCastlesService();
    const isUsb = params.terminal.connectionType === 'usb';
    const host = params.terminal.ipAddress;

    if (!isUsb && !host) {
      return { success: false, error: 'Castles terminal IP address not configured' };
    }

    // Connect if not already connected
    if (!service.isConnected()) {
      try {
        await service.connect({
          connectionType: isUsb ? 'usb' : 'local_socket',
          host: isUsb ? undefined : host,
          port: isUsb ? undefined : (params.terminal.port ?? CASTLES_DEFAULT_PORT),
          timeout: CASTLES_SOCKET_TIMEOUT_MS,
          terminalId: params.terminal.id,
        });
        await service.resetTerminalState();

        // Update store on successful connection
        updateTerminalStatus(params.terminal.id, {
          isConnected: true,
          lastConnectionStatus: 'Online',
          lastConnectionTest: new Date().toISOString(),
          consecutiveFailures: 0,
          lastErrorMessage: null,
        });
      } catch (err) {
        // Update store on connection failure
        updateTerminalStatus(params.terminal.id, {
          isConnected: false,
          lastConnectionStatus: 'Offline',
          lastConnectionTest: new Date().toISOString(),
          lastErrorMessage: err instanceof Error ? err.message : String(err),
        });

        return {
          success: false,
          error: `Failed to connect to Castles terminal: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    // Initialize counter and get next txnPosTxnId
    const counter = getOrCreateCounter({
      terminalId: params.terminal.id,
      supabaseClient: supabase,
    });
    if (!counter.isInitialized) await counter.initialize();
    const referenceId = counter.next();

    const result = await service.processSale({
      amount: params.amount,
      tipAmount: params.tipAmount,
      referenceId,
    });

    if (result.success && result.raw) {
      return {
        success: true,
        transactionId: result.raw.txnRrn ?? result.raw.txnRRN ?? referenceId,
        authCode: result.raw.txnApprovalCode,
        cardType: result.raw.txnCardBrand ?? result.raw.txnCardType ?? '',
        lastFour: extractLast4(result.raw.txnMaskedCardNum ?? result.raw.txnCardMaskedPan ?? ''),
      };
    }

    return {
      success: false,
      error: result.error || 'Payment failed',
    };
  }, [getCastlesService, updateTerminalStatus]);

  // ============================================================
  // VALOR SALE
  // ============================================================

  const processValorSale = useCallback(async (params: {
    orderId: string;
    amount: number;
    tipAmount?: number;
    terminal: { id: string; ipAddress?: string; port?: number; cancelPort?: number; epi?: string; connectionType?: 'local_socket' | 'usb' };
  }): Promise<{
    success: boolean;
    transactionId?: string;
    authCode?: string;
    cardType?: string;
    lastFour?: string;
    error?: string;
    terminalResponse?: Record<string, unknown>;
    partial?: boolean;
    indeterminate?: boolean;
  }> => {
    const service = getValorService();
    const isUsb = params.terminal.connectionType === 'usb';
    const host = params.terminal.ipAddress;
    if (!isUsb && !host) {
      return { success: false, error: 'Valor terminal IP address not configured' };
    }

    if (!service.isConnected()) {
      try {
        await service.connect({
          connectionType: isUsb ? 'usb' : 'local_socket',
          host: isUsb ? undefined : host,
          port: isUsb ? undefined : (params.terminal.port ?? VALOR_DEFAULT_PORT),
          cancelPort: params.terminal.cancelPort,
          epi: params.terminal.epi,
          timeout: VALOR_SALE_TIMEOUT_MS,
          terminalId: params.terminal.id,
        });
        updateTerminalStatus(params.terminal.id, {
          isConnected: true,
          lastConnectionStatus: 'Online',
          lastConnectionTest: new Date().toISOString(),
          consecutiveFailures: 0,
          lastErrorMessage: null,
        });
      } catch (err) {
        updateTerminalStatus(params.terminal.id, {
          isConnected: false,
          lastConnectionStatus: 'Offline',
          lastConnectionTest: new Date().toISOString(),
          lastErrorMessage: err instanceof Error ? err.message : String(err),
        });
        return { success: false, error: `Failed to connect to Valor terminal: ${err instanceof Error ? err.message : String(err)}` };
      }
    }

    const counter = getOrCreateValorCounter({ terminalId: params.terminal.id, supabaseClient: supabase });
    if (!counter.isInitialized) await counter.initialize();
    const referenceId = counter.next();

    // Valor amounts are integer cents.
    const result = await service.processSale({
      amount: Math.round((params.amount + Number.EPSILON) * 100),
      tipAmount: params.tipAmount ? Math.round((params.tipAmount + Number.EPSILON) * 100) : undefined,
      referenceId,
    });

    const valorTx = result.terminalResponse?.valor_transaction as Record<string, string> | undefined;
    if (result.success) {
      return {
        success: true,
        transactionId: result.tranNo ?? valorTx?.tranNo ?? referenceId,
        authCode: valorTx?.approvalCode,
        cardType: valorTx?.cardType,
        lastFour: valorTx?.cardLast4,
        terminalResponse: result.terminalResponse,
        partial: result.partial,
      };
    }
    return { success: false, error: result.error || 'Payment failed', indeterminate: result.indeterminate };
  }, [getValorService, updateTerminalStatus, supabase]);

  // ============================================================
  // PROCESS PAYMENT (dispatches based on terminalType)
  // ============================================================

  const processPayment = useCallback(async (params: {
    orderId: string;
    amount: number;
    tipAmount?: number;
    taxAmount?: number;
    paymentIndex?: number;
  }): Promise<{
    success: boolean;
    transactionId?: string;
    authCode?: string;
    cardType?: string;
    lastFour?: string;
    error?: string;
  }> => {
    if (!activeTerminalId) {
      return { success: false, error: 'No terminal selected' };
    }

    const terminal = terminals.find((t) => t.id === activeTerminalId);

    // ---- Castles path ----
    if (terminal?.terminalType === 'castles') {
      return processCastlesSale({
        orderId: params.orderId,
        amount: params.amount,
        tipAmount: params.tipAmount,
        terminal: {
          id: activeTerminalId,
          ipAddress: terminal.ipAddress,
          port: terminal.port,
          connectionType: terminal.connectionType,
        },
      });
    }

    // ---- Valor path ----
    if (terminal?.terminalType === 'valor') {
      return processValorSale({
        orderId: params.orderId,
        amount: params.amount,
        tipAmount: params.tipAmount,
        terminal: {
          id: activeTerminalId,
          ipAddress: terminal.ipAddress,
          port: terminal.port,
          cancelPort: terminal.cancelPort,
          epi: terminal.epi,
          connectionType: terminal.connectionType,
        },
      });
    }

    // ---- Dejavoo path (existing) ----
    try {
      const service = getDejavooService();
      const loaded = await service.loadCredentials(activeTerminalId);

      if (!loaded) {
        return { success: false, error: 'Failed to load terminal credentials' };
      }

      const referenceId = DejavooService.generateReferenceId(
        params.orderId,
        params.paymentIndex
      );

      const result = await service.processSale({
        amount: params.amount,
        tipAmount: params.tipAmount,
        taxAmount: params.taxAmount,
        referenceId,
        invoiceNumber: params.orderId.substring(0, 20),
      });

      if (result.success && result.data) {
        return {
          success: true,
          transactionId: result.data.TransactionNumber,
          authCode: result.data.AuthCode,
          cardType: result.data.CardData.CardType,
          lastFour: result.data.CardData.Last4,
        };
      } else {
        return {
          success: false,
          error: result.error || 'Payment failed',
        };
      }
    } catch (err) {
      console.error('[usePaymentTerminal] Payment failed:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Payment failed',
      };
    }
  }, [activeTerminalId, terminals, getDejavooService, processCastlesSale, processValorSale]);

  // Void a transaction
  const voidPayment = useCallback(async (referenceId: string): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!activeTerminalId) {
      return { success: false, error: 'No terminal selected' };
    }

    try {
      const service = getDejavooService();
      await service.loadCredentials(activeTerminalId);

      const result = await service.voidTransaction({ referenceId });
      return {
        success: result.success,
        error: result.error,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Void failed',
      };
    }
  }, [activeTerminalId, getDejavooService]);

  // Process a refund
  const processRefund = useCallback(async (params: {
    amount: number;
    originalReferenceId?: string;
  }): Promise<{
    success: boolean;
    transactionId?: string;
    error?: string;
  }> => {
    if (!activeTerminalId) {
      return { success: false, error: 'No terminal selected' };
    }

    try {
      const service = getDejavooService();
      await service.loadCredentials(activeTerminalId);

      const referenceId = DejavooService.generateReferenceId(
        `refund_${Date.now()}`,
        0
      );

      const result = await service.processRefund({
        amount: params.amount,
        referenceId,
        originalReferenceId: params.originalReferenceId,
      });

      return {
        success: result.success,
        transactionId: result.data?.TransactionNumber,
        error: result.error,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Refund failed',
      };
    }
  }, [activeTerminalId, getDejavooService]);

  // Register a new terminal
  const registerTerminal = useCallback(async (params: {
    locationId: string;
    merchantId: string;
    stationId?: string;
    terminalName: string;
    tpn: string;
    authKey: string;
    terminalModel?: string;
    environment?: 'sandbox' | 'production';
  }): Promise<{
    success: boolean;
    terminalId?: string;
    error?: string;
  }> => {
    try {
      const { data, error } = await supabase.rpc('register_payment_terminal', {
        p_merchant_id: params.merchantId,
        p_location_id: params.locationId,
        p_station_id: params.stationId,
        p_terminal_name: params.terminalName,
        p_tpn: params.tpn,
        p_auth_key: params.authKey,
        p_terminal_model: params.terminalModel,
        p_api_environment: params.environment || 'sandbox',
      });

      if (error) throw error;

      if (data?.success) {
        // Reload terminals
        await loadTerminals(params.locationId);

        return {
          success: true,
          terminalId: data.terminal_id,
        };
      } else {
        return {
          success: false,
          error: data?.error || 'Registration failed',
        };
      }
    } catch (err) {
      console.error('[usePaymentTerminal] Registration failed:', err);
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Registration failed',
      };
    }
  }, [supabase, loadTerminals]);

  /**
   * Test connection using provided config overrides (not from store/DB).
   * Used by edit form to verify new settings before saving.
   */
  const testConnectionWithConfig = useCallback(async (params: {
    terminalId: string;
    terminalType: 'castles' | 'dejavoo' | 'valor';
    ipAddress?: string;
    port?: number;
    cancelPort?: number;
    epi?: string;
    tpn?: string;
    authKey?: string;
  }): Promise<{ success: boolean; error?: string; serialNumber?: string }> => {
    try {
      if (params.terminalType === 'valor') {
        const host = params.ipAddress;
        if (!host) return { success: false, error: 'IP address is required' };

        const service = getValorService();
        const config = {
          connectionType: 'local_socket' as const,
          host,
          port: params.port ?? VALOR_DEFAULT_PORT,
          cancelPort: params.cancelPort,
          epi: params.epi,
          timeout: VALOR_SALE_TIMEOUT_MS,
          terminalId: params.terminalId,
        };
        let qResult: Awaited<ReturnType<typeof service.terminalQuery>>;
        try {
          qResult = await withDeadline(
            async () => {
              await service.connect(config);
              return service.terminalQuery();
            },
            VALOR_TEST_DEADLINE_MS,
            VALOR_TEST_OP_NAME,
          );
        } catch (deadlineErr) {
          if (deadlineErr instanceof DeadlineExceededError) {
            try { await service.suspend(); } catch { /* best-effort */ }
            service.resume(config);
            return { success: false, error: 'Terminal not responding — check power and network.' };
          }
          throw deadlineErr;
        }
        return qResult.success
          ? { success: true, serialNumber: qResult.data?.serialNumber ?? undefined }
          : { success: false, error: qResult.error || 'Terminal did not respond' };
      }

      if (params.terminalType === 'castles') {
        const host = params.ipAddress;
        if (!host) return { success: false, error: 'IP address is required' };

        const service = getCastlesService();
        // testConnectionWithConfig is the "Test" button on the edit form's
        // TCP path — USB has its own wizard flow (CastlesUsbSetupSheet). Be
        // explicit about local_socket so the factory doesn't rely on its
        // default and so future readers see the intent.
        const config = {
          connectionType: 'local_socket' as const,
          host,
          port: params.port ?? CASTLES_DEFAULT_PORT,
          timeout: CASTLES_SOCKET_TIMEOUT_MS,
          terminalId: params.terminalId,
        };

        // Bound the mutex-serialized connect → reset → getData chain so the
        // "Test" button can never hang forever. On deadline, force-recover the
        // wedged service (see testConnection for rationale) and report offline.
        let result: Awaited<ReturnType<typeof service.getTerminalData>>;
        try {
          result = await withDeadline(
            async () => {
              await service.connect(config);
              await service.resetTerminalState();
              const counter = getOrCreateCounter({ terminalId: params.terminalId, supabaseClient: supabase });
              if (!counter.isInitialized) await counter.initialize();
              return service.getTerminalData(counter.next());
            },
            CASTLES_TEST_DEADLINE_MS,
            CASTLES_TEST_OP_NAME,
          );
        } catch (deadlineErr) {
          if (deadlineErr instanceof DeadlineExceededError) {
            console.warn('[usePaymentTerminal] Terminal test (config) deadline exceeded — force-recovering service');
            try { await service.suspend(); } catch { /* best-effort */ }
            service.resume(config);
            return { success: false, error: 'Terminal not responding — check power and network.' };
          }
          throw deadlineErr;
        }

        return result.success
          ? { success: true, serialNumber: result.data?.infSN ?? undefined }
          : { success: false, error: result.error || 'Terminal did not respond' };
      }

      // Dejavoo path
      const service = getDejavooService();

      if (params.authKey) {
        // Test with provided credentials
        service.setCredentials({
          authKey: params.authKey,
          registerId: params.tpn || '',
          environment: 'production', // Will be overridden by baseUrl if set
          baseUrl: '', // loadCredentials will restore proper url
        });

        const result = await service.checkTerminalStatus();

        // Restore DB credentials so next payment uses correct creds
        await service.loadCredentials(params.terminalId);

        return result.status === 'Online'
          ? { success: true }
          : { success: false, error: result.error || `Terminal is ${result.status}` };
      } else {
        // No new auth key — use existing DB credentials
        const loaded = await service.loadCredentials(params.terminalId);
        if (!loaded) return { success: false, error: 'Failed to load terminal credentials' };

        const result = await service.checkTerminalStatus();
        return result.status === 'Online'
          ? { success: true }
          : { success: false, error: result.error || `Terminal is ${result.status}` };
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Connection test failed',
      };
    }
  }, [getCastlesService, getValorService, getDejavooService, supabase]);

  /**
   * Run TCP diagnostic against the Castles terminal.
   * Tests raw connectivity + tries multiple delimiter formats.
   * Results are logged to console and returned.
   */
  const diagnoseCastlesConnection = useCallback(async (terminalId?: string) => {
    const targetId = terminalId || activeTerminalId;
    if (!targetId) return { tcpConnected: false, dataReceived: false, error: 'No terminal selected', log: [] };

    const terminal = terminals.find((t) => t.id === targetId);
    if (!terminal || terminal.terminalType !== 'castles') {
      return { tcpConnected: false, dataReceived: false, error: 'Not a Castles terminal', log: [] };
    }

    const host = terminal.ipAddress;
    if (!host) return { tcpConnected: false, dataReceived: false, error: 'No IP configured', log: [] };

    const service = getCastlesService();
    return service.diagnoseTcpConnection({
      host,
      port: terminal.port ?? CASTLES_DEFAULT_PORT,
      timeout: CASTLES_SOCKET_TIMEOUT_MS,
      terminalId: targetId,
    });
  }, [activeTerminalId, terminals, getCastlesService]);

  return {
    // State
    terminals,
    activeTerminalId,
    activeTerminal: getActiveTerminal(),
    isTestingConnection,

    // Actions
    loadTerminals,
    setActiveTerminal,
    testConnection,
    testConnectionWithConfig,
    diagnoseCastlesConnection,
    processPayment,
    voidPayment,
    processRefund,
    registerTerminal,
  };
}
