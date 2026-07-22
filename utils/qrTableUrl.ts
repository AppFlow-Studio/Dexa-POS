/**
 * QR table URL builder — mirrors DexaPOS-Website `app/sites/lib/store-url.ts`.
 * The printed QR must encode exactly the same guest URL the dashboard produces:
 *   {custom_domain | https://{slug}.{ROOT_DOMAIN}}/t/{token}
 */

// Must match the website's NEXT_PUBLIC_ROOT_DOMAIN in production.
export const QR_ROOT_DOMAIN = "dexaposai.com";

/**
 * Staging/dev override. When set (e.g. "http://192.168.1.20:3000" or a tunnel
 * URL for a dev server pointed at staging Supabase), guest URLs are built in
 * the path form `{base}/sites/{slug}/t/{token}` instead of the production
 * subdomain form — the site's proxy only rewrites subdomains, the /sites path
 * route works everywhere. Leave unset in production builds.
 */
const QR_STORE_BASE_URL_OVERRIDE = (
  process.env.EXPO_PUBLIC_QR_STORE_BASE_URL || ""
).trim();

function normalizeBaseUrl(input: string): string {
  return input.replace(/\/+$/, "");
}

export function buildStoreUrl(input: {
  slug?: string | null;
  customDomain?: string | null;
}): string {
  const customDomain = (input.customDomain || "").trim();
  if (customDomain) {
    if (/^https?:\/\//i.test(customDomain)) {
      return customDomain;
    }
    return `https://${customDomain}`;
  }

  const slug = (input.slug || "").trim();
  if (!slug) return "";

  if (QR_STORE_BASE_URL_OVERRIDE) {
    return `${normalizeBaseUrl(QR_STORE_BASE_URL_OVERRIDE)}/sites/${slug}`;
  }

  return `https://${slug}.${QR_ROOT_DOMAIN}`;
}

export function buildQrTableUrl(input: {
  slug?: string | null;
  customDomain?: string | null;
  token?: string | null;
}): string {
  const token = (input.token || "").trim();
  if (!token) return "";

  const baseUrl = buildStoreUrl({
    slug: input.slug,
    customDomain: input.customDomain,
  });
  if (!baseUrl) return "";

  return `${normalizeBaseUrl(baseUrl)}/t/${encodeURIComponent(token)}`;
}
