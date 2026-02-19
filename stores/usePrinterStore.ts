import { mmkvStorage } from "@/lib/storage";
import {
  PrinterConfig,
  type PrinterRole,
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
  updatePrinterConfig: (
    printerId: string,
    updates: {
      printerRole?: PrinterRole;
      isDefaultReceipt?: boolean;
      isDefaultKitchen?: boolean;
      isActive?: boolean;
    },
  ) => Promise<void>;
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
            .eq("location_id", locationId);

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

      updatePrinterConfig: async (printerId, updates) => {
        const supabase = getOrderStoreSupabaseClient();
        if (!supabase) {
          console.warn("[PrinterStore] No Supabase client available");
          return;
        }

        const printer = get().printers.find((p) => p.id === printerId);
        if (!printer) {
          console.warn("[PrinterStore] Printer not found:", printerId);
          return;
        }

        try {
          // If setting as default receipt, clear other defaults at same location
          if (updates.isDefaultReceipt === true) {
            await supabase
              .from("printers")
              .update({ is_default_receipt: false })
              .eq("location_id", printer.locationId)
              .neq("id", printerId);
          }

          // If setting as default kitchen, clear other defaults at same location
          if (updates.isDefaultKitchen === true) {
            await supabase
              .from("printers")
              .update({ is_default_kitchen: false })
              .eq("location_id", printer.locationId)
              .neq("id", printerId);
          }

          // Map camelCase to snake_case DB columns
          const dbUpdates: Record<string, unknown> = {};
          if (updates.printerRole !== undefined) dbUpdates.printer_role = updates.printerRole;
          if (updates.isDefaultReceipt !== undefined) dbUpdates.is_default_receipt = updates.isDefaultReceipt;
          if (updates.isDefaultKitchen !== undefined) dbUpdates.is_default_kitchen = updates.isDefaultKitchen;
          if (updates.isActive !== undefined) dbUpdates.is_active = updates.isActive;

          await supabase
            .from("printers")
            .update(dbUpdates)
            .eq("id", printerId);

          // Optimistic local update
          set((state) => ({
            printers: state.printers.map((p) => {
              if (p.id !== printerId) {
                // Clear default flags on other printers if we just claimed them
                let updated = p;
                if (updates.isDefaultReceipt === true && p.locationId === printer.locationId) {
                  updated = { ...updated, isDefaultReceipt: false };
                }
                if (updates.isDefaultKitchen === true && p.locationId === printer.locationId) {
                  updated = { ...updated, isDefaultKitchen: false };
                }
                return updated;
              }
              return {
                ...p,
                ...(updates.printerRole !== undefined && { printerRole: updates.printerRole }),
                ...(updates.isDefaultReceipt !== undefined && { isDefaultReceipt: updates.isDefaultReceipt }),
                ...(updates.isDefaultKitchen !== undefined && { isDefaultKitchen: updates.isDefaultKitchen }),
                ...(updates.isActive !== undefined && { isActive: updates.isActive }),
              };
            }),
          }));
        } catch (e) {
          console.error("[PrinterStore] Failed to update printer config:", e);
          throw e;
        }
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
