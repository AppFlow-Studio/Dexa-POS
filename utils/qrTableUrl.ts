/**
 * QR table URL builder — mirrors DexaPOS-Website `app/sites/lib/store-url.ts`.
 * The printed QR must encode exactly the same guest URL the dashboard produces:
 *   {custom_domain | https://{slug}.{ROOT_DOMAIN}}/t/{token}
 */

// Must match the website's NEXT_PUBLIC_ROOT_DOMAIN in production.
export const QR_ROOT_DOMAIN = "dexaposai.com";

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
