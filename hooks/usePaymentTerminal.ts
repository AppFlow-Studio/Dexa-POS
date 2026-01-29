// ============================================================
// Hook for Payment Terminal Operations
// File: hooks/usePaymentTerminal.ts
// ============================================================

import { useCallback, useRef } from 'react';
import { Alert } from 'react-native';
import { useSupabaseClient } from '@/hooks/useSupabaseClient';
import { DejavooService } from '@/services/payments/dejavoo';
import { usePaymentTerminalStore } from '@/stores/usePaymentTerminalStore';
import { useOrderStore } from '@/stores/useOrderStore';

export function usePaymentTerminal() {
  const supabase = useSupabaseClient();
  const serviceRef = useRef<DejavooService | null>(null);
  
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

  // Get or create service instance
  const getService = useCallback(() => {
    if (!serviceRef.current) {
      serviceRef.current = new DejavooService(supabase);
    }
    return serviceRef.current;
  }, [supabase]);

  // Load terminals for the current station
  const loadTerminals = useCallback(async (locationId: string) => {
    try {
      const { data, error } = await supabase
        .from('payment_terminals')
        .select('*')
        .eq('location_id', locationId)
        .eq('is_active', true);

      if (error) throw error;

      const mappedTerminals = (data || []).map((t) => ({
        id: t.id,
        name: t.terminal_name,
        tpn: t.tpn,
        model: t.terminal_model,
        isActive: t.is_active,
        isConnected: t.is_connected,
        lastConnectionTest: t.last_connection_test_at,
        lastConnectionStatus: t.last_connection_status,
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
      const service = getService();
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
      // TODO: IMPLEMENT THIS
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
  }, [activeTerminalId, getService, updateTerminalStatus, setConnectionTesting, setError, supabase]);

  // Process a payment
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

    try {
      const service = getService();
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
          transactionId: result.data.TransactionId,
          authCode: result.data.AuthCode,
          cardType: result.data.CardType,
          lastFour: result.data.CardNumber.slice(-4),
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
  }, [activeTerminalId, getService]);

  // Void a transaction
  const voidPayment = useCallback(async (referenceId: string): Promise<{
    success: boolean;
    error?: string;
  }> => {
    if (!activeTerminalId) {
      return { success: false, error: 'No terminal selected' };
    }

    try {
      const service = getService();
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
  }, [activeTerminalId, getService]);

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
      const service = getService();
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
        transactionId: result.data?.TransactionId,
        error: result.error,
      };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Refund failed',
      };
    }
  }, [activeTerminalId, getService]);

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
    processPayment,
    voidPayment,
    processRefund,
    registerTerminal,
  };
}
