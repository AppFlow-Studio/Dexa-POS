/** "Table 12" / "T12" / "12" → "12"; "Patio A" → "PA". Fits the 48dp tile. */
export function tableTileLabel(name: string): string {
  const trailing = name.match(/(\d+)\s*$/);
  if (trailing?.[1]) return trailing[1];
  const words = name.trim().split(/\s+/).filter(Boolean);
  const label = words.length > 1
    ? words.map((w) => w[0]).join("")
    : name.trim().slice(0, 2);
  return label.toUpperCase();
}

/** Row title: bare numbers get the word back; merged tables join as "21 + 22". */
export function tableTitle(name: string, mergedNames: readonly string[]): string {
  if (mergedNames.length > 0) {
    const labels = [name, ...mergedNames].map(tableTileLabel);
    return `Tables ${labels.join(" + ")}`;
  }
  const trimmed = name.trim();
  return /^\d+$/.test(trimmed) ? `Table ${trimmed}` : trimmed;
}
