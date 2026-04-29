import { createLazyPersistStorage } from "@/lib/storage";
import type { DiscoveredStarPrinter } from "@/services/printing/discovery/StarPrinterDiscovery";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";
import {
    PrinterConfig,
    PrinterRouteRule,
    PrinterRouteRuleV2,
    PrinterRoutingConfig,
    printerRowToConfig,
    type PrinterRole,
    type PrinterRoutingMode,
} from "@/types/printer";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { immer } from "zustand/middleware/immer";

interface PrinterStoreState {
  printers: PrinterConfig[];
  routeRules: PrinterRouteRule[];
  routingConfigs: Record<string, PrinterRoutingConfig>;
  lastFetchedAt: number | null;

  // Ephemeral discovery state (not persisted to MMKV)
  discoveredPrinters: DiscoveredStarPrinter[];
  lastScanAt: number | null;
  isScanning: boolean;

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
      printerName?: string;
      networkAddress?: string | null;
      networkPort?: number | null;
      paperWidth?: number;
      maxCharsPerLine?: number;
      printDensity?: number;
      copies?: number;
      printLogo?: boolean;
      autoPrintReceipt?: boolean;
      printOrderTickets?: boolean;
      receiptHeader?: string | null;
      receiptFooter?: string | null;
      supportsAutoCut?: boolean;
      supportsCashDrawerKick?: boolean;
      supportsBarcode?: boolean;
      supportsQrCode?: boolean;
      supportsLogo?: boolean;
      graphicsOnly?: boolean;
    },
  ) => Promise<void>;

  deletePrinter: (printerId: string) => Promise<void>;

  // Discovery actions (ephemeral)
  setDiscoveredPrinters: (printers: DiscoveredStarPrinter[]) => void;
  addDiscoveredPrinter: (printer: DiscoveredStarPrinter) => void;
  clearDiscoveredPrinters: () => void;
  setIsScanning: (scanning: boolean) => void;

  // Routing V2 actions
  fetchRoutingRules: (locationId: string) => Promise<void>;
  setRoutingMode: (
    printerId: string,
    mode: PrinterRoutingMode,
  ) => Promise<void>;
  setPrintModifiers: (printerId: string, value: boolean) => Promise<void>;
  upsertRoutingRule: (
    printerId: string,
    ruleType: PrinterRouteRuleV2["rule_type"],
    ruleValue: string,
  ) => Promise<void>;
  removeRoutingRule: (printerId: string, ruleId: string) => Promise<void>;
  bulkSetRules: (
    printerId: string,
    ruleType: PrinterRouteRuleV2["rule_type"],
    entries: { ruleValue: string; enabled: boolean }[],
  ) => Promise<void>;
  getRoutingConfig: (printerId: string) => PrinterRoutingConfig;
}

function defaultRoutingConfig(printerId: string): PrinterRoutingConfig {
  return { printerId, routingMode: "all", printModifiers: true, rules: [] };
}

export const usePrinterStore = create<PrinterStoreState>()(
  persist(
    immer((set, get) => ({
      printers: [],
      routeRules: [],
      routingConfigs: {},
      lastFetchedAt: null,
      discoveredPrinters: [],
      lastScanAt: null,
      isScanning: false,

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
            // Also fetch routing rules
            get().fetchRoutingRules(locationId);
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

        // Update local state (mutative via Immer)
        set((state) => {
          const p = state.printers.find((pr) => pr.id === printerId);
          if (!p) return;
          if (updates.isConnected !== undefined)
            p.isConnected = updates.isConnected;
          if (updates.lastStatus !== undefined)
            p.lastStatus = updates.lastStatus;
          if (updates.errorCount !== undefined)
            p.errorCount = updates.errorCount;
          if (updates.lastPrintAt !== undefined)
            p.lastPrintAt = updates.lastPrintAt;
          p.lastStatusAt = new Date().toISOString();
        });

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

          await supabase.from("printers").update(dbUpdates).eq("id", printerId);
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
          // If setting as default receipt, clear other defaults at same station (max 1 receipt printer)
          if (updates.isDefaultReceipt === true && printer.stationId) {
            await supabase
              .from("printers")
              .update({ is_default_receipt: false })
              .eq("station_id", printer.stationId)
              .neq("id", printerId);
          }

          // isDefaultKitchen: multiple kitchen printers allowed — no clearing

          // Map camelCase to snake_case DB columns
          const dbUpdates: Record<string, unknown> = {};
          if (updates.printerRole !== undefined)
            dbUpdates.printer_role = updates.printerRole;
          if (updates.isDefaultReceipt !== undefined)
            dbUpdates.is_default_receipt = updates.isDefaultReceipt;
          if (updates.isDefaultKitchen !== undefined)
            dbUpdates.is_default_kitchen = updates.isDefaultKitchen;
          if (updates.isActive !== undefined)
            dbUpdates.is_active = updates.isActive;
          if (updates.printerName !== undefined)
            dbUpdates.printer_name = updates.printerName;
          if (updates.networkAddress !== undefined)
            dbUpdates.network_address = updates.networkAddress;
          if (updates.networkPort !== undefined)
            dbUpdates.network_port = updates.networkPort;
          if (updates.paperWidth !== undefined)
            dbUpdates.paper_width = updates.paperWidth;
          if (updates.maxCharsPerLine !== undefined)
            dbUpdates.max_chars_per_line = updates.maxCharsPerLine;
          if (updates.printDensity !== undefined)
            dbUpdates.print_density = updates.printDensity;
          if (updates.copies !== undefined) dbUpdates.copies = updates.copies;
          if (updates.printLogo !== undefined)
            dbUpdates.print_logo = updates.printLogo;
          if (updates.autoPrintReceipt !== undefined)
            dbUpdates.auto_print_receipt = updates.autoPrintReceipt;
          if (updates.printOrderTickets !== undefined)
            dbUpdates.print_order_tickets = updates.printOrderTickets;
          if (updates.receiptHeader !== undefined)
            dbUpdates.receipt_header = updates.receiptHeader;
          if (updates.receiptFooter !== undefined)
            dbUpdates.receipt_footer = updates.receiptFooter;
          if (updates.supportsAutoCut !== undefined)
            dbUpdates.supports_auto_cut = updates.supportsAutoCut;
          if (updates.supportsCashDrawerKick !== undefined)
            dbUpdates.supports_cash_drawer_kick =
              updates.supportsCashDrawerKick;
          if (updates.supportsBarcode !== undefined)
            dbUpdates.supports_barcode = updates.supportsBarcode;
          if (updates.supportsQrCode !== undefined)
            dbUpdates.supports_qr_code = updates.supportsQrCode;
          if (updates.supportsLogo !== undefined)
            dbUpdates.supports_logo = updates.supportsLogo;
          if (updates.graphicsOnly !== undefined) {
            const existingMeta =
              get().printers.find((p) => p.id === printerId)?.metadata ?? {};
            dbUpdates.metadata = {
              ...existingMeta,
              graphicsOnly: updates.graphicsOnly,
            };
          }

          await supabase.from("printers").update(dbUpdates).eq("id", printerId);

          // Optimistic local update (mutative via Immer)
          set((state) => {
            for (const p of state.printers) {
              if (p.id === printerId) {
                // Apply all provided updates directly
                if (updates.printerRole !== undefined)
                  p.printerRole = updates.printerRole;
                if (updates.isDefaultReceipt !== undefined)
                  p.isDefaultReceipt = updates.isDefaultReceipt;
                if (updates.isDefaultKitchen !== undefined)
                  p.isDefaultKitchen = updates.isDefaultKitchen;
                if (updates.isActive !== undefined)
                  p.isActive = updates.isActive;
                if (updates.printerName !== undefined)
                  p.printerName = updates.printerName;
                if (updates.networkAddress !== undefined)
                  p.networkAddress = updates.networkAddress;
                if (updates.networkPort !== undefined)
                  p.networkPort = updates.networkPort;
                if (updates.paperWidth !== undefined)
                  p.paperWidth = updates.paperWidth;
                if (updates.maxCharsPerLine !== undefined)
                  p.maxCharsPerLine = updates.maxCharsPerLine;
                if (updates.printDensity !== undefined)
                  p.printDensity = updates.printDensity;
                if (updates.copies !== undefined) p.copies = updates.copies;
                if (updates.printLogo !== undefined)
                  p.printLogo = updates.printLogo;
                if (updates.autoPrintReceipt !== undefined)
                  p.autoPrintReceipt = updates.autoPrintReceipt;
                if (updates.printOrderTickets !== undefined)
                  p.printOrderTickets = updates.printOrderTickets;
                if (updates.receiptHeader !== undefined)
                  p.receiptHeader = updates.receiptHeader;
                if (updates.receiptFooter !== undefined)
                  p.receiptFooter = updates.receiptFooter;
                if (updates.supportsAutoCut !== undefined)
                  p.supportsAutoCut = updates.supportsAutoCut;
                if (updates.supportsCashDrawerKick !== undefined)
                  p.supportsCashDrawerKick = updates.supportsCashDrawerKick;
                if (updates.supportsBarcode !== undefined)
                  p.supportsBarcode = updates.supportsBarcode;
                if (updates.supportsQrCode !== undefined)
                  p.supportsQrCode = updates.supportsQrCode;
                if (updates.supportsLogo !== undefined)
                  p.supportsLogo = updates.supportsLogo;
                if (updates.graphicsOnly !== undefined)
                  p.graphicsOnly = updates.graphicsOnly;
              } else {
                // Clear default receipt on other printers at same station (max 1 receipt printer)
                if (
                  updates.isDefaultReceipt === true &&
                  printer.stationId &&
                  p.stationId === printer.stationId
                ) {
                  p.isDefaultReceipt = false;
                }
                // isDefaultKitchen: multiple allowed — no clearing
              }
            }
          });
        } catch (e) {
          console.error("[PrinterStore] Failed to update printer config:", e);
          throw e;
        }
      },

      // Discovery actions (ephemeral — not persisted)
      setDiscoveredPrinters: (printers) =>
        set({ discoveredPrinters: printers, lastScanAt: Date.now() }),
      addDiscoveredPrinter: (printer) =>
        set((state) => {
          // Deduplicate by IP
          if (
            state.discoveredPrinters.some(
              (p) => p.ipAddress === printer.ipAddress,
            )
          ) {
            return state;
          }
          return { discoveredPrinters: [...state.discoveredPrinters, printer] };
        }),
      clearDiscoveredPrinters: () =>
        set({ discoveredPrinters: [], lastScanAt: null }),
      setIsScanning: (scanning) => set({ isScanning: scanning }),

      deletePrinter: async (printerId: string) => {
        const supabase = getOrderStoreSupabaseClient();
        if (!supabase) {
          console.warn("[PrinterStore] No Supabase client available");
          return;
        }

        try {
          // 1. Delete routing rules for this printer
          await supabase
            .from("printer_routing_rules")
            .delete()
            .eq("printer_id", printerId);

          // 2. Delete the printer row
          const { error } = await supabase
            .from("printers")
            .delete()
            .eq("id", printerId);

          if (error) {
            console.error("[PrinterStore] Failed to delete printer:", error);
            throw error;
          }

          // 3. Remove from local state (mutative via Immer)
          set((state) => {
            state.printers = state.printers.filter((p) => p.id !== printerId);
            delete state.routingConfigs[printerId];
          });
        } catch (e) {
          console.error("[PrinterStore] Error deleting printer:", e);
          throw e;
        }
      },

      // ====================================================================
      // ROUTING V2
      // ====================================================================

      fetchRoutingRules: async (locationId: string) => {
        const supabase = getOrderStoreSupabaseClient();
        if (!supabase) return;

        try {
          // Get all printer IDs for this location
          const printers = get().printers.filter(
            (p) => p.locationId === locationId,
          );
          const printerIds = printers.map((p) => p.id);

          if (printerIds.length === 0) return;

          const { data, error } = await supabase
            .from("printer_routing_rules")
            .select("*")
            .in("printer_id", printerIds);

          if (error) {
            console.error(
              "[PrinterStore] Failed to fetch routing rules:",
              error,
            );
            return;
          }

          // Build routingConfigs from printers + rules
          const configs: Record<string, PrinterRoutingConfig> = {};
          for (const printer of printers) {
            const printerRules: PrinterRouteRuleV2[] = (data ?? [])
              .filter((r: any) => r.printer_id === printer.id)
              .map((r: any) => ({
                id: r.id,
                printer_id: r.printer_id,
                rule_type: r.rule_type,
                rule_value: r.rule_value,
                is_enabled: r.is_enabled,
              }));

            configs[printer.id] = {
              printerId: printer.id,
              routingMode: printer.routingMode,
              printModifiers: printer.printModifiers,
              rules: printerRules,
            };
          }

          set({ routingConfigs: configs });

          // Legacy migration: if routingConfigs are all empty but legacy routeRules exist
          const { routeRules } = get();
          if (routeRules.length > 0 && (data ?? []).length === 0) {
            console.log("[PrinterStore] Migrating legacy route rules to V2...");
            for (const rule of routeRules) {
              if (!rule.isEnabled) continue;
              const targetPrinter = printers.find(
                (p) => p.id === rule.printerId,
              );
              if (!targetPrinter) continue;

              try {
                await supabase.from("printer_routing_rules").upsert(
                  {
                    printer_id: rule.printerId,
                    rule_type: "category",
                    rule_value: rule.categoryName,
                    is_enabled: true,
                  },
                  { onConflict: "printer_id,rule_type,rule_value" },
                );
              } catch {
                // Best-effort migration
              }
            }
            // Re-fetch after migration
            set({ routeRules: [] });
            get().fetchRoutingRules(locationId);
          }
        } catch (e) {
          console.error("[PrinterStore] Error fetching routing rules:", e);
        }
      },

      setRoutingMode: async (printerId, mode) => {
        // Optimistic update (mutative via Immer)
        set((state) => {
          if (!state.routingConfigs[printerId]) {
            state.routingConfigs[printerId] = defaultRoutingConfig(printerId);
          }
          state.routingConfigs[printerId].routingMode = mode;
          const p = state.printers.find((pr) => pr.id === printerId);
          if (p) p.routingMode = mode;
        });

        const supabase = getOrderStoreSupabaseClient();
        if (!supabase) return;

        try {
          await supabase
            .from("printers")
            .update({ routing_mode: mode })
            .eq("id", printerId);
        } catch (e) {
          console.error("[PrinterStore] Failed to set routing mode:", e);
        }
      },

      setPrintModifiers: async (printerId, value) => {
        // Optimistic update (mutative via Immer)
        set((state) => {
          if (!state.routingConfigs[printerId]) {
            state.routingConfigs[printerId] = defaultRoutingConfig(printerId);
          }
          state.routingConfigs[printerId].printModifiers = value;
          const p = state.printers.find((pr) => pr.id === printerId);
          if (p) p.printModifiers = value;
        });

        const supabase = getOrderStoreSupabaseClient();
        if (!supabase) return;

        try {
          await supabase
            .from("printers")
            .update({ print_modifiers: value })
            .eq("id", printerId);
        } catch (e) {
          console.error("[PrinterStore] Failed to set print modifiers:", e);
        }
      },

      upsertRoutingRule: async (printerId, ruleType, ruleValue) => {
        const supabase = getOrderStoreSupabaseClient();
        if (!supabase) return;

        try {
          const { data, error } = await supabase
            .from("printer_routing_rules")
            .upsert(
              {
                printer_id: printerId,
                rule_type: ruleType,
                rule_value: ruleValue,
                is_enabled: true,
              },
              { onConflict: "printer_id,rule_type,rule_value" },
            )
            .select()
            .single();

          if (error) {
            console.error(
              "[PrinterStore] Failed to upsert routing rule:",
              error,
            );
            return;
          }

          // Update local state (mutative via Immer)
          set((state) => {
            if (!state.routingConfigs[printerId]) {
              state.routingConfigs[printerId] = defaultRoutingConfig(printerId);
            }
            const config = state.routingConfigs[printerId];
            config.rules = config.rules.filter(
              (r) => !(r.rule_type === ruleType && r.rule_value === ruleValue),
            );
            config.rules.push({
              id: data.id,
              printer_id: data.printer_id,
              rule_type: data.rule_type,
              rule_value: data.rule_value,
              is_enabled: data.is_enabled,
            });
          });
        } catch (e) {
          console.error("[PrinterStore] Error upserting routing rule:", e);
        }
      },

      removeRoutingRule: async (printerId, ruleId) => {
        // Optimistic remove (mutative via Immer)
        set((state) => {
          const config = state.routingConfigs[printerId];
          if (config) {
            config.rules = config.rules.filter((r) => r.id !== ruleId);
          }
        });

        const supabase = getOrderStoreSupabaseClient();
        if (!supabase) return;

        try {
          await supabase
            .from("printer_routing_rules")
            .delete()
            .eq("id", ruleId);
        } catch (e) {
          console.error("[PrinterStore] Failed to remove routing rule:", e);
        }
      },

      bulkSetRules: async (printerId, ruleType, entries) => {
        const supabase = getOrderStoreSupabaseClient();
        if (!supabase) return;

        try {
          const toUpsert = entries.filter((e) => e.enabled);
          const toRemove = entries.filter((e) => !e.enabled);

          // Upsert enabled rules
          if (toUpsert.length > 0) {
            await supabase.from("printer_routing_rules").upsert(
              toUpsert.map((e) => ({
                printer_id: printerId,
                rule_type: ruleType,
                rule_value: e.ruleValue,
                is_enabled: true,
              })),
              { onConflict: "printer_id,rule_type,rule_value" },
            );
          }

          // Remove disabled rules
          if (toRemove.length > 0) {
            await supabase
              .from("printer_routing_rules")
              .delete()
              .eq("printer_id", printerId)
              .eq("rule_type", ruleType)
              .in(
                "rule_value",
                toRemove.map((e) => e.ruleValue),
              );
          }

          // Re-fetch to get accurate state
          const { data } = await supabase
            .from("printer_routing_rules")
            .select("*")
            .eq("printer_id", printerId);

          set((state) => {
            if (!state.routingConfigs[printerId]) {
              state.routingConfigs[printerId] = defaultRoutingConfig(printerId);
            }
            state.routingConfigs[printerId].rules = (data ?? []).map(
              (r: any) => ({
                id: r.id,
                printer_id: r.printer_id,
                rule_type: r.rule_type,
                rule_value: r.rule_value,
                is_enabled: r.is_enabled,
              }),
            );
          });
        } catch (e) {
          console.error("[PrinterStore] Failed to bulk set rules:", e);
        }
      },

      getRoutingConfig: (printerId) => {
        return (
          get().routingConfigs[printerId] ?? defaultRoutingConfig(printerId)
        );
      },
    })),
    {
      name: "printer-store-storage",
      storage: createLazyPersistStorage(),
      version: 1,
      migrate: (persistedState) => persistedState as any,
      partialize: (state) => ({
        printers: state.printers,
        routeRules: state.routeRules,
        routingConfigs: state.routingConfigs,
        lastFetchedAt: state.lastFetchedAt,
        // discoveredPrinters, lastScanAt, isScanning are intentionally excluded (ephemeral)
      }),
    },
  ),
);
