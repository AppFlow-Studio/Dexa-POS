import { mmkvStorage } from "@/lib/storage";
import {
  PrinterConfig,
  PrinterRouteRule,
  printerRowToConfig,
} from "@/types/printer";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface PrinterStoreState {
  printers: PrinterConfig[];
  routeRules: PrinterRouteRule[];
  lastFetchedAt: number | null;

  // Actions
  fetchPrinters: (locationId: string) => Promise<void>;
  setPrinters: (printers: PrinterConfig[]) => void;
  setRouteRules: (rules: PrinterRouteRule[]) => void;
  syncPrinterStatus: (
    printerId: string,
    updates: {
      isConnected?: boolean;
      lastStatus?: string;
      errorCount?: number;
      lastPrintAt?: string;
    },
  ) => Promise<void>;
  getPrinterById: (id: string) => PrinterConfig | undefined;
}

export const usePrinterStore = create<PrinterStoreState>()(
  persist(
    (set, get) => ({
      printers: [],
      routeRules: [],
      lastFetchedAt: null,

      fetchPrinters: async (locationId: string) => {
        const supabase = getOrderStoreSupabaseClient();
        if (!supabase) {
          console.warn("[PrinterStore] No Supabase client available");
          return;
        }

        try {
          const { data, error } = await supabase
            .from("printers")
            .select("*")
            .eq("location_id", locationId)
            .eq("is_active", true);

          if (error) {
            console.error("[PrinterStore] Failed to fetch printers:", error);
            return;
          }

          if (data) {
            const configs = data.map(printerRowToConfig);
            set({ printers: configs, lastFetchedAt: Date.now() });
          }
        } catch (e) {
          console.error("[PrinterStore] Error fetching printers:", e);
        }
      },

      setPrinters: (printers) => set({ printers }),

      setRouteRules: (routeRules) => set({ routeRules }),

      syncPrinterStatus: async (printerId, updates) => {
        const supabase = getOrderStoreSupabaseClient();
        if (!supabase) return;

        // Update local state
        set((state) => ({
          printers: state.printers.map((p) => {
            if (p.id !== printerId) return p;
            return {
              ...p,
              isConnected: updates.isConnected ?? p.isConnected,
              lastStatus: updates.lastStatus ?? p.lastStatus,
              errorCount: updates.errorCount ?? p.errorCount,
              lastPrintAt: updates.lastPrintAt ?? p.lastPrintAt,
              lastStatusAt: new Date().toISOString(),
            };
          }),
        }));

        // Sync to Supabase (fire-and-forget)
        try {
          const dbUpdates: Record<string, unknown> = {
            last_status_at: new Date().toISOString(),
          };
          if (updates.isConnected !== undefined)
            dbUpdates.is_connected = updates.isConnected;
          if (updates.lastStatus !== undefined)
            dbUpdates.last_status = updates.lastStatus;
          if (updates.errorCount !== undefined)
            dbUpdates.error_count = updates.errorCount;
          if (updates.lastPrintAt !== undefined)
            dbUpdates.last_print_at = updates.lastPrintAt;

          await supabase
            .from("printers")
            .update(dbUpdates)
            .eq("id", printerId);
        } catch (e) {
          console.warn("[PrinterStore] Failed to sync status to backend:", e);
        }
      },

      getPrinterById: (id) => {
        return get().printers.find((p) => p.id === id);
      },
    }),
    {
      name: "printer-store-storage",
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        printers: state.printers,
        routeRules: state.routeRules,
        lastFetchedAt: state.lastFetchedAt,
      }),
    },
  ),
);
