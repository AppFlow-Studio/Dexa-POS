// ============================================================
// Payment processor / terminal labels
// File: lib/processorLabels.ts
// ============================================================
// Human-facing names for terminal types + their payment processor, used by the
// active-processor selector and the blocked-action explainers so the UI can say
// "captured on ATOM (TSYS)" instead of a bare terminal_type string.
// ============================================================

/** Terminal type → display name. */
export function terminalTypeLabel(type: string | null | undefined): string {
  switch (type) {
    case "atom":
      return "ATOM (on-device)";
    case "valor":
      return "Valor";
    case "castles":
      return "Castles";
    case "dejavoo":
    case "dejavoo_spinapi":
    case "dejavoo_p18":
      return "Dejavoo";
    case "clover":
      return "Clover";
    case "square":
      return "Square";
    case "stripe_terminal":
      return "Stripe Terminal";
    case "cash_drawer":
      return "Cash";
    case "manual":
      return "Manual entry";
    default:
      return type ? type : "terminal";
  }
}

/** Terminal type → payment processor / gateway name (best-effort). */
export function processorName(type: string | null | undefined): string | null {
  switch (type) {
    case "atom":
      return "TSYS";
    case "valor":
      return "Valor";
    case "castles":
      return "Castles";
    case "dejavoo":
    case "dejavoo_spinapi":
    case "dejavoo_p18":
      return "Dejavoo";
    default:
      return null;
  }
}

/** e.g. "ATOM (on-device) · TSYS" or just "Valor" when the processor is the same. */
export function describeProcessor(type: string | null | undefined): string {
  const label = terminalTypeLabel(type);
  const proc = processorName(type);
  if (!proc || proc === label) return label;
  return `${label} · ${proc}`;
}
