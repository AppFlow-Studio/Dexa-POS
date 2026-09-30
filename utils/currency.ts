// Built once. Constructing an Intl.NumberFormat is expensive on Hermes/Android
// (it goes through native ICU), and this runs for every price on screen: a grid
// of item cards rebuilt the formatter dozens of times per render.
const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
});

export function formatCurrency(amount: number | undefined | null): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return "$0.00";
  }
  return USD.format(amount);
}
