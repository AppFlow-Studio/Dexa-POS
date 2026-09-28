/**
 * Money for kiosk chrome that has to hold a fixed width.
 *
 * `toFixed(2)` alone renders a large basket as "1234.56", which both reads
 * badly at arm's length and is the case that makes a header pill jump width
 * mid-order. Grouped thousands plus a reserved width (see the cart pill) keeps
 * the pill still from $0.01 to $1,234.56.
 */
export function kioskMoney(amount: number): string {
  const safe = Number.isFinite(amount) ? amount : 0;
  const [whole, cents] = Math.abs(safe).toFixed(2).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${safe < 0 ? "-" : ""}$${grouped}.${cents}`;
}
