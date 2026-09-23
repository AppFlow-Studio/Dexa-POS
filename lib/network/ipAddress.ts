/**
 * Validates and normalizes a device IP for storage in `stations.ip_address` /
 * `stations.local_ip_address` (Postgres `inet`).
 *
 * Returns the trimmed IP string if it is a *usable* address, or `null`
 * otherwise. Callers pass the result straight to the login / heartbeat RPCs,
 * which `COALESCE(p_ip_address, <column>)` — so `null` means "keep the
 * last-known-good value" rather than clobbering a real IP with junk.
 *
 * The junk this exists to reject is `0.0.0.0`: Android's
 * `Network.getIpAddressAsync()` emits it before Wi-Fi/DHCP have settled (and it
 * is what wedged a kiosk's stored IP to `0.0.0.0` in production). The previous
 * implementation only checked the *shape* of the string, so `0.0.0.0`,
 * `999.1.1.1` and `127.0.0.1` all passed straight through.
 *
 * Rejected:
 *   - empty / whitespace
 *   - `0.0.0.0`                (IPv4 "unspecified" — DHCP not settled)
 *   - any octet > 255          (malformed)
 *   - `127.0.0.0/8`            (loopback)
 *   - `169.254.0.0/16`         (link-local — no DHCP lease)
 *   - `::` / `::1`             (IPv6 unspecified / loopback)
 *   - `fe80::/10`              (IPv6 link-local)
 */
export function sanitizeIpAddress(
  ip: string | null | undefined,
): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  if (trimmed === "") return null;

  // IPv4 — validate ranges and reject non-routable / unspecified addresses.
  const v4 = trimmed.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (v4) {
    const octets = v4.slice(1, 5).map((o) => Number(o));
    if (octets.some((o) => o > 255)) return null; // malformed
    if (octets.every((o) => o === 0)) return null; // 0.0.0.0 unspecified
    const [a, b] = octets;
    if (a === 127) return null; // loopback
    if (a === 169 && b === 254) return null; // link-local (no DHCP)
    return octets.join("."); // normalized (strips leading zeros)
  }

  // Compressed IPv6 loopback / unspecified — reject before the strict test.
  if (trimmed === "::" || trimmed === "::1") return null;

  // IPv6 — full (uncompressed) 8-group form, matching prior behavior.
  if (/^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$/.test(trimmed)) {
    const lower = trimmed.toLowerCase();
    if (lower === "0:0:0:0:0:0:0:0" || lower === "0:0:0:0:0:0:0:1") return null;
    if (lower.startsWith("fe80:")) return null; // link-local
    return trimmed;
  }

  return null;
}
