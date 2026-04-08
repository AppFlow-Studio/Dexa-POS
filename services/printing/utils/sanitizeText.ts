/**
 * sanitizeText.ts
 *
 * Shared text sanitization for all print paths.
 * Replaces Unicode characters that thermal printers render
 * as boxes/squares with safe ASCII equivalents.
 */

const PRINT_REPLACEMENTS: [RegExp, string][] = [
  [/[\u00A0\u2009\u200A\u202F\u205F\u3000]/g, " "], // Unicode spaces
  [/[\u200B\u200C\u200D\uFEFF]/g, ""], // Zero-width chars
  [/[\u2018\u2019\u201A\u2032]/g, "'"], // Smart single quotes
  [/[\u201C\u201D\u201E\u2033]/g, '"'], // Smart double quotes
  [/[\u2013\u2014\u2015\u2212]/g, "-"], // Unicode dashes
  [/\u2026/g, "..."], // Ellipsis
  [/[\u2022\u2023\u25E6]/g, "*"], // Bullets
  [/\u00D7/g, "x"], // Multiplication sign
];

/**
 * Replace Unicode characters that thermal printers can't render
 * with safe ASCII equivalents.
 */
export function sanitizeForPrint(text: string): string {
  if (!text) return text;
  let result = text;
  for (const [pattern, replacement] of PRINT_REPLACEMENTS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

/**
 * Format a Date to a safe time string for thermal printers.
 * `toLocaleTimeString()` may insert U+202F (Narrow No-Break Space)
 * or other exotic spaces that render as square/box characters.
 */
export function safeTimeString(date: Date): string {
  return date
    .toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    })
    .replace(/[\u00A0\u202F\u2009\u200A]/g, " ");
}
