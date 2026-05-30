import {
  ServiceChargeRule,
  useServiceChargeRulesStore,
} from "@/stores/useServiceChargeRulesStore";

const baseRule = (
  overrides: Partial<ServiceChargeRule> = {},
): ServiceChargeRule => ({
  id: "rule-1",
  merchant_id: "merchant-1",
  location_id: null,
  name: "Service Charge",
  rate_percent: 18,
  min_party_size: 4,
  applies_to_order_types: ["dine_in"],
  applies_on: "pre_discount",
  is_taxable: false,
  auto_apply: true,
  is_active: true,
  updated_at: "2026-05-29T00:00:00Z",
  ...overrides,
});

describe("useServiceChargeRulesStore", () => {
  beforeEach(() => {
    useServiceChargeRulesStore.setState({
      rulesByScope: {},
      isLoaded: false,
      lastFetchError: null,
    });
  });

  it("setRules keys global rule under __global__", () => {
    const rule = baseRule({ location_id: null });
    useServiceChargeRulesStore.getState().setRules([rule]);
    expect(useServiceChargeRulesStore.getState().rulesByScope.__global__).toEqual(rule);
    expect(useServiceChargeRulesStore.getState().isLoaded).toBe(true);
  });

  it("setRules keys location-scoped rule under its location_id", () => {
    const rule = baseRule({ id: "r2", location_id: "loc-1" });
    useServiceChargeRulesStore.getState().setRules([rule]);
    expect(useServiceChargeRulesStore.getState().rulesByScope["loc-1"]).toEqual(rule);
  });

  it("resolveRule prefers location-specific over global", () => {
    const global = baseRule({ id: "g", location_id: null, rate_percent: 15 });
    const local = baseRule({ id: "l", location_id: "loc-1", rate_percent: 20 });
    useServiceChargeRulesStore.getState().setRules([global, local]);
    const r = useServiceChargeRulesStore.getState().resolveRule("loc-1");
    expect(r?.id).toBe("l");
    expect(r?.rate_percent).toBe(20);
  });

  it("resolveRule falls back to global when no location-specific rule exists", () => {
    const global = baseRule({ id: "g", location_id: null });
    useServiceChargeRulesStore.getState().setRules([global]);
    expect(useServiceChargeRulesStore.getState().resolveRule("loc-1")?.id).toBe("g");
  });

  it("resolveRule returns null when only inactive rules exist", () => {
    const inactive = baseRule({ is_active: false });
    useServiceChargeRulesStore.getState().setRules([inactive]);
    expect(useServiceChargeRulesStore.getState().resolveRule(null)).toBeNull();
  });

  it("resolveRule returns null when auto_apply is false", () => {
    const manualOnly = baseRule({ auto_apply: false });
    useServiceChargeRulesStore.getState().setRules([manualOnly]);
    expect(useServiceChargeRulesStore.getState().resolveRule(null)).toBeNull();
  });

  it("resolveRule returns null when no rule exists", () => {
    expect(useServiceChargeRulesStore.getState().resolveRule("loc-x")).toBeNull();
    expect(useServiceChargeRulesStore.getState().resolveRule(null)).toBeNull();
  });

  it("upsertRule replaces a rule in the same scope", () => {
    const v1 = baseRule({ location_id: "loc-1", rate_percent: 18 });
    const v2 = { ...v1, rate_percent: 20 };
    useServiceChargeRulesStore.getState().setRules([v1]);
    useServiceChargeRulesStore.getState().upsertRule(v2);
    expect(
      useServiceChargeRulesStore.getState().rulesByScope["loc-1"].rate_percent,
    ).toBe(20);
  });

  it("deleteRule removes the matching rule by id", () => {
    const global = baseRule({ id: "g", location_id: null });
    const local = baseRule({ id: "l", location_id: "loc-1" });
    useServiceChargeRulesStore.getState().setRules([global, local]);
    useServiceChargeRulesStore.getState().deleteRule("l");
    expect(useServiceChargeRulesStore.getState().rulesByScope["loc-1"]).toBeUndefined();
    expect(useServiceChargeRulesStore.getState().rulesByScope.__global__).toBeDefined();
  });

  it("setLastFetchError populates and clears the error field", () => {
    useServiceChargeRulesStore.getState().setLastFetchError("boom");
    expect(useServiceChargeRulesStore.getState().lastFetchError).toBe("boom");
    useServiceChargeRulesStore.getState().setLastFetchError(null);
    expect(useServiceChargeRulesStore.getState().lastFetchError).toBeNull();
  });
});
