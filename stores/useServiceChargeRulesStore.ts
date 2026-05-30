import { createLazyPersistStorage } from "@/lib/storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";

export interface ServiceChargeRule {
  id: string;
  merchant_id: string;
  location_id: string | null;
  name: string;
  rate_percent: number;
  min_party_size: number;
  applies_to_order_types: string[];
  applies_on: "pre_discount" | "post_discount";
  is_taxable: boolean;
  auto_apply: boolean;
  is_active: boolean;
  updated_at: string;
}

export const GLOBAL_SCOPE_KEY = "__global__";

interface ServiceChargeRulesState {
  rulesByScope: Record<string, ServiceChargeRule>;
  isLoaded: boolean;
  lastFetchError: string | null;
  setRules: (rules: ServiceChargeRule[]) => void;
  upsertRule: (rule: ServiceChargeRule) => void;
  deleteRule: (ruleId: string) => void;
  setLastFetchError: (err: string | null) => void;
  resolveRule: (locationId: string | null | undefined) => ServiceChargeRule | null;
}

const scopeKey = (locationId: string | null | undefined) =>
  locationId ?? GLOBAL_SCOPE_KEY;

const isResolvable = (rule: ServiceChargeRule) =>
  rule.is_active && rule.auto_apply;

export const useServiceChargeRulesStore = create<ServiceChargeRulesState>()(
  persist(
    (set, get) => ({
      rulesByScope: {},
      isLoaded: false,
      lastFetchError: null,

      setRules: (rules) => {
        const next: Record<string, ServiceChargeRule> = {};
        for (const rule of rules) {
          next[scopeKey(rule.location_id)] = rule;
        }
        set({ rulesByScope: next, isLoaded: true, lastFetchError: null });
      },

      upsertRule: (rule) => {
        set((state) => ({
          rulesByScope: {
            ...state.rulesByScope,
            [scopeKey(rule.location_id)]: rule,
          },
        }));
      },

      deleteRule: (ruleId) => {
        set((state) => {
          const next = { ...state.rulesByScope };
          for (const key of Object.keys(next)) {
            if (next[key].id === ruleId) delete next[key];
          }
          return { rulesByScope: next };
        });
      },

      setLastFetchError: (err) => set({ lastFetchError: err }),

      resolveRule: (locationId) => {
        const map = get().rulesByScope;
        if (locationId) {
          const scoped = map[locationId];
          if (scoped && isResolvable(scoped)) return scoped;
        }
        const global = map[GLOBAL_SCOPE_KEY];
        if (global && isResolvable(global)) return global;
        return null;
      },
    }),
    {
      name: "service-charge-rules-storage",
      storage: createLazyPersistStorage(),
      version: 1,
      partialize: (state) => ({
        rulesByScope: state.rulesByScope,
      }) as ServiceChargeRulesState,
    },
  ),
);
