import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";
import { TaxRate } from "@/types/menu";

const makeRate = (overrides: Partial<TaxRate> = {}): TaxRate => ({
  id: "rate-1",
  location_id: "loc-1",
  name: "Standard Tax",
  percentage: 8.875,
  tax_category: "standard",
  is_active: true,
  ...overrides,
});

const store = () => useStoreSettingsStore.getState();

describe("useStoreSettingsStore setTaxRates — empty-fetch guard", () => {
  beforeEach(() => {
    // Reset to a clean tax state before each test.
    useStoreSettingsStore.setState({ taxRates: [], taxRatesMap: {} });
  });

  it("populates the map from a non-empty result", () => {
    store().setTaxRates([makeRate()]);

    expect(store().taxRatesMap.standard).toBe(8.875);
    expect(store().taxRates).toHaveLength(1);
  });

  it("PRESERVES existing rates when handed an empty result", () => {
    store().setTaxRates([makeRate()]);
    expect(store().taxRatesMap.standard).toBe(8.875);

    // Simulate a successful-but-empty sync (e.g. RLS silently filtering rows).
    store().setTaxRates([]);

    // Map must NOT be wiped — tax stays at the known-good rate.
    expect(store().taxRatesMap.standard).toBe(8.875);
    expect(store().taxRates).toHaveLength(1);
  });

  it("is a no-op (no crash) when empty result arrives with no existing rates", () => {
    store().setTaxRates([]);

    expect(store().taxRatesMap).toEqual({});
    expect(store().taxRates).toEqual([]);
  });

  it("replaces the map on a legitimate non-empty update", () => {
    store().setTaxRates([makeRate()]);

    store().setTaxRates([
      makeRate({ id: "rate-2", percentage: 7.5 }),
      makeRate({ id: "rate-3", tax_category: "alcohol", percentage: 12 }),
    ]);

    expect(store().taxRatesMap.standard).toBe(7.5);
    expect(store().taxRatesMap.alcohol).toBe(12);
    expect(store().taxRates).toHaveLength(2);
  });
});
