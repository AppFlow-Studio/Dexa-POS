import {
  ServiceChargeRule,
  useServiceChargeRulesStore,
} from "@/stores/useServiceChargeRulesStore";

export function useResolvedServiceChargeRule(
  locationId: string | null | undefined,
): ServiceChargeRule | null {
  return useServiceChargeRulesStore((state) => {
    if (!locationId) {
      const global = state.rulesByScope.__global__;
      return global && global.is_active && global.auto_apply ? global : null;
    }
    const scoped = state.rulesByScope[locationId];
    if (scoped && scoped.is_active && scoped.auto_apply) return scoped;
    const global = state.rulesByScope.__global__;
    return global && global.is_active && global.auto_apply ? global : null;
  });
}
