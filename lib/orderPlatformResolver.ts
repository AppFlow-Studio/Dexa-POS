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
  "marketplace" | "first_party" | "generic_online" | "none";

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

export const MARKETPLACE_ONLINE_ORDER_PROVIDERS = [
  "ubereats",
  "doordash",
  "grubhub",
] as const;

export const FIRST_PARTY_ONLINE_ORDER_PROVIDERS = [
  "website",
  "app",
  "kiosk",
] as const;

export type QueryAliasProvider = Exclude<OnlineOrderProvider, "other">;

/**
 * This is the single alias vocabulary for display resolution and server-side
 * Previous Orders predicates. Query aliases are generated with every supported
 * separator and matched case-insensitively by PostgREST.
 */
const PROVIDER_WORD_GROUPS: Record<
  QueryAliasProvider,
  readonly (readonly string[])[]
> = {
  ubereats: [["uber", "eats"]],
  doordash: [["door", "dash"]],
  grubhub: [["grub", "hub"]],
  website: [["website"], ["web"]],
  app: [["app"], ["mobile", "app"]],
  kiosk: [["kiosk"]],
  orderout: [["order", "out"]],
};

const QUERY_ALIAS_SEPARATORS = ["", " ", "_", "-"] as const;

function expandProviderAliases(
  groups: readonly (readonly string[])[],
): readonly string[] {
  const aliases = new Set<string>();
  for (const words of groups) {
    for (const separator of QUERY_ALIAS_SEPARATORS) {
      aliases.add(words.join(separator));
    }
  }
  return [...aliases];
}

const PROVIDER_QUERY_ALIASES = {} as Record<
  QueryAliasProvider,
  readonly string[]
>;
const PROVIDER_BY_COMPACT_TOKEN = new Map<string, QueryAliasProvider>();

for (const provider of Object.keys(
  PROVIDER_WORD_GROUPS,
) as QueryAliasProvider[]) {
  const aliases = expandProviderAliases(PROVIDER_WORD_GROUPS[provider]);
  PROVIDER_QUERY_ALIASES[provider] = aliases;
  for (const alias of aliases) {
    PROVIDER_BY_COMPACT_TOKEN.set(compactPlatformToken(alias), provider);
  }
}

// Legacy abbreviations remain accepted by display resolution. They are not
// emitted as query aliases because persisted rows use full provider names.
PROVIDER_BY_COMPACT_TOKEN.set("grub", "grubhub");
PROVIDER_BY_COMPACT_TOKEN.set("ubereat", "ubereats");

export function getOnlineOrderProviderQueryAliases(
  provider: QueryAliasProvider,
): readonly string[] {
  return PROVIDER_QUERY_ALIASES[provider];
}

export function normalizeOnlineOrderProvider(
  raw: unknown,
): OnlineOrderProvider | null {
  const value = readNonEmptyString(raw);
  if (!value) return null;

  const key = compactPlatformToken(value);
  if (!key || key === "pos" || key === "instore") return null;

  const knownProvider = PROVIDER_BY_COMPACT_TOKEN.get(key);
  if (knownProvider) return knownProvider;
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
  const orderedSources: {
    value: unknown;
    source: NonNullable<ResolvedOrderPlatform["source"]>;
  }[] = [
    { value: input.deliveryPlatform, source: "delivery_platform" },
    {
      value: input.metadataDeliveryCompany,
      source: "metadata_delivery_company",
    },
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
    return {
      provider: null,
      kind: "none",
      label: null,
      source: "order_source",
    };
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
