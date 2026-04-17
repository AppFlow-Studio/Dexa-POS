// ============================================================
// Payment Terminal Store
// File: stores/usePaymentTerminalStore.ts
// ============================================================

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { createLazyPersistStorage } from '@/lib/storage';
import { DejavooService } from '@/services/payments/dejavoo';

interface PaymentTerminal {
  id: string;
  name: string;
  model?: string;
  terminalType?: string;
  /** Castles terminal IP address */
  ipAddress?: string;
  /** Castles terminal port */
  port?: number;
  /** Connection type: local_socket (TCP/WiFi) or usb */
  connectionType?: 'local_socket' | 'usb';
  isActive: boolean;
  isConnected: boolean;
  stationId?: string | null;
  lastConnectionTest?: string;
  lastConnectionStatus?: 'Online' | 'Offline' | 'NotFound';
  consecutiveFailures?: number;
  lastErrorMessage?: string | null;
  firmwareVersion?: string | null;
  batteryLevel?: number | null;
  healthCheckInterval?: number;
}

interface PaymentTerminalState {
  terminals: PaymentTerminal[];
  activeTerminalId: string | null;
  isTestingConnection: boolean;
  isProcessingPayment: boolean;
  lastError: string | null;

  // Actions
  setTerminals: (terminals: PaymentTerminal[]) => void;
  setActiveTerminal: (terminalId: string | null) => void;
  updateTerminalStatus: (terminalId: string, status: Partial<PaymentTerminal>) => void;
  setConnectionTesting: (testing: boolean) => void;
  setProcessingPayment: (processing: boolean) => void;
  setError: (error: string | null) => void;

  // Getters
  getActiveTerminal: () => PaymentTerminal | undefined;
}

export const usePaymentTerminalStore = create<PaymentTerminalState>()(
  persist(
    (set, get) => ({
      terminals: [],
      activeTerminalId: null,
      isTestingConnection: false,
      isProcessingPayment: false,
      lastError: null,

      setTerminals: (terminals) => set({ terminals }),

      setActiveTerminal: (terminalId) => set({ activeTerminalId: terminalId }),

      updateTerminalStatus: (terminalId, status) => set((state) => ({
        terminals: state.terminals.map((t) =>
          t.id === terminalId ? { ...t, ...status } : t
        ),
      })),

      setConnectionTesting: (testing) => set({ isTestingConnection: testing }),

      setProcessingPayment: (processing) => set({ isProcessingPayment: processing }),

      setError: (error) => set({ lastError: error }),
      
      getActiveTerminal: () => {
        const { terminals, activeTerminalId } = get();
        return terminals.find((t) => t.id === activeTerminalId);
      },
    }),
    {
      name: 'payment-terminal-store',
      storage: createLazyPersistStorage(),
      partialize: (state) => ({
        activeTerminalId: state.activeTerminalId,
      }),
    }
  )
);