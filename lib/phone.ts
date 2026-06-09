// Strips all non-digit characters and drops the US country-code prefix when present.
export function normalizeUsPhoneDigits(input?: string | null): string {
  const digits = (input ?? "").replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    return digits.slice(1);
  }
  return digits.slice(0, 10);
}

// Progressively formats a US 10-digit phone number as the user types:
//   ""        -> ""
//   "5"       -> "(5"
//   "555"     -> "(555"
//   "5551"    -> "(555) 1"
//   "555123"  -> "(555) 123"
//   "5551234" -> "(555) 123-4"
//   "5551234567" -> "(555) 123-4567"
export function formatUsPhone(input: string): string {
  const digits = normalizeUsPhoneDigits(input);
  if (digits.length === 0) return "";
  if (digits.length <= 3) return `(${digits}`;
  if (digits.length <= 6) return `(${digits.slice(0, 3)}) ${digits.slice(3)}`;
  return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
}
