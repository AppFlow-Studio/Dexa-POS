export type OnlineOrderProvider =
  | "orderout"
  | "doordash"
  | "ubereats"
  | "grubhub"
  | "website"
  | "app"
  | "other"
  | "kiosk";

export type OrderPlatformBadgeKind =
  | "marketplace"
  | "first_party"
  | "generic_online"
  | "none";

export interface ResolveOrderPlatformInput {
  deliveryPlatform?: unknown;
  metadataDeliveryCompany?: unknown;
  onlineOrderDeliveryCompany?: unknown;
  onlineOrderProvider?: unknown;
  orderSource?: unknown;
}

export interface ResolvedOrderPlatform {
  provider: OnlineOrderProvider | null;
  kind: OrderPlatformBadgeKind;
  label: string | null;
  source:
    | "delivery_platform"
    | "metadata_delivery_company"
    | "online_order_delivery_company"
    | "online_order_provider"
    | "order_source"
    | null;
}

const MARKETPLACE_LABELS: Partial<Record<OnlineOrderProvider, string>> = {
  doordash: "DoorDash",
  grubhub: "Grubhub",
  ubereats: "Uber Eats",
};

const FIRST_PARTY_LABELS: Partial<Record<OnlineOrderProvider, string>> = {
  website: "Website",
  app: "App",
  kiosk: "Kiosk",
};

function readNonEmptyString(raw: unknown): string | null {
  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function compactPlatformToken(raw: string): string {
  return raw.toLowerCase().replace(/[\s_-]+/g, "");
}

export function normalizeOnlineOrderProvider(
  raw: unknown,
): OnlineOrderProvider | null {
  const value = readNonEmptyString(raw);
  if (!value) return null;

  const key = compactPlatformToken(value);
  if (!key || key === "pos" || key === "instore") return null;

  if (key === "grubhub" || key === "grub") return "grubhub";
  if (key === "ubereats" || key === "ubereat") return "ubereats";
  if (key === "doordash") return "doordash";
  if (key === "website" || key === "web") return "website";
  if (key === "app" || key === "mobileapp") return "app";
  if (key === "orderout") return "orderout";
  if (key === "kiosk") return "kiosk";
  if (
    key === "other" ||
    key === "online" ||
    key === "postmates" ||
    key === "foodpanda"
  ) {
    return "other";
  }

  return "other";
}

function resolveProvider(
  provider: OnlineOrderProvider | null,
  source: ResolvedOrderPlatform["source"],
): ResolvedOrderPlatform | null {
  if (!provider) return null;

  const marketplaceLabel = MARKETPLACE_LABELS[provider];
  if (marketplaceLabel) {
    return { provider, kind: "marketplace", label: marketplaceLabel, source };
  }

  const firstPartyLabel = FIRST_PARTY_LABELS[provider];
  if (firstPartyLabel) {
    return { provider, kind: "first_party", label: firstPartyLabel, source };
  }

  return { provider, kind: "generic_online", label: "Online", source };
}

export function resolveOrderPlatformLogo(
  input: ResolveOrderPlatformInput,
): ResolvedOrderPlatform {
  const orderedSources: Array<{
    value: unknown;
    source: NonNullable<ResolvedOrderPlatform["source"]>;
  }> = [
    { value: input.deliveryPlatform, source: "delivery_platform" },
    { value: input.metadataDeliveryCompany, source: "metadata_delivery_company" },
    {
      value: input.onlineOrderDeliveryCompany,
      source: "online_order_delivery_company",
    },
    { value: input.onlineOrderProvider, source: "online_order_provider" },
  ];

  for (const candidate of orderedSources) {
    if (!readNonEmptyString(candidate.value)) continue;
    const resolved = resolveProvider(
      normalizeOnlineOrderProvider(candidate.value),
      candidate.source,
    );
    if (resolved) return resolved;
  }

  const orderSource = readNonEmptyString(input.orderSource);
  if (!orderSource) {
    return { provider: null, kind: "none", label: null, source: null };
  }

  const sourceKey = compactPlatformToken(orderSource);
  if (sourceKey === "pos" || sourceKey === "instore") {
    return { provider: null, kind: "none", label: null, source: "order_source" };
  }

  if (sourceKey === "online") {
    return {
      provider: "other",
      kind: "generic_online",
      label: "Online",
      source: "order_source",
    };
  }

  const sourceProvider = normalizeOnlineOrderProvider(orderSource);
  if (sourceProvider) {
    const resolved = resolveProvider(sourceProvider, "order_source");
    if (resolved) return resolved;
  }

  return { provider: null, kind: "none", label: null, source: "order_source" };
}
