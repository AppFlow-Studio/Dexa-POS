import { mmkvStorage } from "@/lib/storage";
import {
  PrinterConfig,
  type PrinterRole,
  type PrinterRoutingMode,
  PrinterRouteRule,
  PrinterRouteRuleV2,
  PrinterRoutingConfig,
  printerRowToConfig,
} from "@/types/printer";
import { getOrderStoreSupabaseClient } from "@/stores/useOrderStore";
import { create } from "zustand";
import { createJSONStorage, persist } from "zustand/middleware";

interface PrinterStoreState {
  printers: PrinterConfig[];
  routeRules: PrinterRouteRule[];
  routingConfigs: Record<string, PrinterRoutingConfig>;
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

  deletePrinter: (printerId: string) => Promise<void>;

  // Routing V2 actions
  fetchRoutingRules: (locationId: string) => Promise<void>;
  setRoutingMode: (printerId: string, mode: PrinterRoutingMode) => Promise<void>;
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
    (set, get) => ({
      printers: [],
      routeRules: [],
      routingConfigs: {},
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

          // 3. Remove from local state
          set((state) => {
            const { [printerId]: _, ...remainingConfigs } = state.routingConfigs;
            return {
              printers: state.printers.filter((p) => p.id !== printerId),
              routingConfigs: remainingConfigs,
            };
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
          const printers = get().printers.filter((p) => p.locationId === locationId);
          const printerIds = printers.map((p) => p.id);

          if (printerIds.length === 0) return;

          const { data, error } = await supabase
            .from("printer_routing_rules")
            .select("*")
            .in("printer_id", printerIds);

          if (error) {
            console.error("[PrinterStore] Failed to fetch routing rules:", error);
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
          if (
            routeRules.length > 0 &&
            (data ?? []).length === 0
          ) {
            console.log("[PrinterStore] Migrating legacy route rules to V2...");
            for (const rule of routeRules) {
              if (!rule.isEnabled) continue;
              const targetPrinter = printers.find((p) => p.id === rule.printerId);
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
        // Optimistic update
        set((state) => {
          const existing = state.routingConfigs[printerId] ?? defaultRoutingConfig(printerId);
          return {
            routingConfigs: {
              ...state.routingConfigs,
              [printerId]: { ...existing, routingMode: mode },
            },
            printers: state.printers.map((p) =>
              p.id === printerId ? { ...p, routingMode: mode } : p,
            ),
          };
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
        // Optimistic update
        set((state) => {
          const existing = state.routingConfigs[printerId] ?? defaultRoutingConfig(printerId);
          return {
            routingConfigs: {
              ...state.routingConfigs,
              [printerId]: { ...existing, printModifiers: value },
            },
            printers: state.printers.map((p) =>
              p.id === printerId ? { ...p, printModifiers: value } : p,
            ),
          };
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
            console.error("[PrinterStore] Failed to upsert routing rule:", error);
            return;
          }

          // Update local state
          set((state) => {
            const existing = state.routingConfigs[printerId] ?? defaultRoutingConfig(printerId);
            const newRule: PrinterRouteRuleV2 = {
              id: data.id,
              printer_id: data.printer_id,
              rule_type: data.rule_type,
              rule_value: data.rule_value,
              is_enabled: data.is_enabled,
            };
            const rules = existing.rules.filter(
              (r) => !(r.rule_type === ruleType && r.rule_value === ruleValue),
            );
            rules.push(newRule);
            return {
              routingConfigs: {
                ...state.routingConfigs,
                [printerId]: { ...existing, rules },
              },
            };
          });
        } catch (e) {
          console.error("[PrinterStore] Error upserting routing rule:", e);
        }
      },

      removeRoutingRule: async (printerId, ruleId) => {
        // Optimistic remove
        set((state) => {
          const existing = state.routingConfigs[printerId] ?? defaultRoutingConfig(printerId);
          return {
            routingConfigs: {
              ...state.routingConfigs,
              [printerId]: {
                ...existing,
                rules: existing.rules.filter((r) => r.id !== ruleId),
              },
            },
          };
        });

        const supabase = getOrderStoreSupabaseClient();
        if (!supabase) return;

        try {
          await supabase.from("printer_routing_rules").delete().eq("id", ruleId);
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
            const existing = state.routingConfigs[printerId] ?? defaultRoutingConfig(printerId);
            const rules: PrinterRouteRuleV2[] = (data ?? []).map((r: any) => ({
              id: r.id,
              printer_id: r.printer_id,
              rule_type: r.rule_type,
              rule_value: r.rule_value,
              is_enabled: r.is_enabled,
            }));
            return {
              routingConfigs: {
                ...state.routingConfigs,
                [printerId]: { ...existing, rules },
              },
            };
          });
        } catch (e) {
          console.error("[PrinterStore] Failed to bulk set rules:", e);
        }
      },

      getRoutingConfig: (printerId) => {
        return get().routingConfigs[printerId] ?? defaultRoutingConfig(printerId);
      },
    }),
    {
      name: "printer-store-storage",
      storage: createJSONStorage(() => mmkvStorage),
      partialize: (state) => ({
        printers: state.printers,
        routeRules: state.routeRules,
        routingConfigs: state.routingConfigs,
        lastFetchedAt: state.lastFetchedAt,
      }),
    },
  ),
);
