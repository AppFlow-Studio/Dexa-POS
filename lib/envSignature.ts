/**
 * Environment Signature
 *
 * A stable identifier for the backend environment a given build talks to. It
 * combines the Supabase project ref (parsed from the URL) with the Clerk
 * instance kind (test vs live).
 *
 * Why this exists: `selectedStore.id`, cached orders/tables, and the Clerk
 * session are all scoped to a specific Supabase project + Clerk instance, but
 * none of that is namespaced in MMKV. Running a production build on a device
 * that previously ran staging (or vice versa) therefore leaves a stale store id
 * and a stale Clerk token. Against the new backend they fail RLS and surface as
 * the cryptic PostgREST error "Cannot coerce the result to a single JSON
 * object" (PGRST116 — 0 rows). Comparing this signature across boots lets us
 * detect the switch and purge the previous environment's state.
 *
 * NOTE: this module is intentionally dependency-free (reads only process.env) so
 * it can be imported by lib/storage.ts without creating an import cycle.
 */

/** MMKV (general storage) key under which the last-seen signature is recorded. */
export const ENV_SIGNATURE_KEY = "app_env_signature";

/**
 * Compute the signature for the environment THIS build is configured for.
 * Example results: "hifouuofcaytijrkbvcy|live", "dfwqakoyittmrwbqvxgw|test".
 */
export function computeEnvSignature(): string {
  const supaUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
  // Project ref is the first subdomain label: https://<ref>.supabase.co
  const ref = supaUrl.replace(/^https?:\/\//, "").split(".")[0] || "unknown";

  const pk = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "";
  const clerkKind = pk.startsWith("pk_live")
    ? "live"
    : pk.startsWith("pk_test")
      ? "test"
      : "unknown";

  return `${ref}|${clerkKind}`;
}
