// ============================================================
// Payment Terminal Store
// File: stores/usePaymentTerminalStore.ts
// ============================================================

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import { createMMKV } from 'react-native-mmkv';
import { DejavooService } from '@/services/payments/dejavoo';

const storage = createMMKV({ id: 'payment-terminal' });

const mmkvStorage = {
  getItem: (name: string) => storage.getString(name) ?? null,
  setItem: (name: string, value: string) => storage.set(name, value),
  removeItem: (name: string) => storage.remove(name),
};

interface PaymentTerminal {
  id: string;
  name: string;
  tpn: string;
  model?: string;
  isActive: boolean;
  isConnected: boolean;
  lastConnectionTest?: string;
  lastConnectionStatus?: 'Online' | 'Offline' | 'NotFound';
}

interface PaymentTerminalState {
  terminals: PaymentTerminal[];
  activeTerminalId: string | null;
  isTestingConnection: boolean;
  lastError: string | null;
  
  // Actions
  setTerminals: (terminals: PaymentTerminal[]) => void;
  setActiveTerminal: (terminalId: string | null) => void;
  updateTerminalStatus: (terminalId: string, status: Partial<PaymentTerminal>) => void;
  setConnectionTesting: (testing: boolean) => void;
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
      lastError: null,

      setTerminals: (terminals) => set({ terminals }),
      
      setActiveTerminal: (terminalId) => set({ activeTerminalId: terminalId }),
      
      updateTerminalStatus: (terminalId, status) => set((state) => ({
        terminals: state.terminals.map((t) =>
          t.id === terminalId ? { ...t, ...status } : t
        ),
      })),
      
      setConnectionTesting: (testing) => set({ isTestingConnection: testing }),
      
      setError: (error) => set({ lastError: error }),
      
      getActiveTerminal: () => {
        const { terminals, activeTerminalId } = get();
        return terminals.find((t) => t.id === activeTerminalId);
      },
    }),
    {
      name: 'payment-terminal-store',
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        activeTerminalId: state.activeTerminalId,
      }),
    }
  )
);