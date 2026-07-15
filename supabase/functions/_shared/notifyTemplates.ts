// notifyTemplates — shared, pure SMS template resolver
//
// Deno- AND jest-safe: no `serve`, no `createClient`, no Deno globals, no remote
// imports. Both edge functions (`notify-waitlist-guest`, `notify-reservation-guest`)
// import this via `../_shared/notifyTemplates.ts`, and the jest suite imports it
// directly, so the merchant-template contract has exactly one source of truth.
//
// Contract:
//   - Caller still only picks a `template_key`; the SMS body is assembled here.
//   - If the merchant saved a non-blank template for that key (in
//     `locations.pos_config.waitlist.messageTemplates[key]`, or the legacy
//     `smsTemplate` for `waitlist.tableReady`), it is interpolated with a
//     whitelist of `{tokens}` and used.
//   - Otherwise the built-in default is rendered — byte-identical to the
//     pre-existing hardcoded switch, so behavior is unchanged when unset.
//   - `custom` passes the caller-supplied message through (trim + cap), unchanged.
//   - Unknown `{tokens}` are left verbatim; output is trimmed and capped.

export const SMS_MAX_LENGTH = 500;

export type WaitlistTemplateKey =
  | "waitlist.added"
  | "waitlist.tableReady"
  | "waitlist.almostReady"
  | "waitlist.runningLate"
  | "waitlist.updateConfirmed"
  | "waitlist.cancelled";

export type ReservationTemplateKey =
  | "reservation.created"
  | "reservation.moved"
  | "reservation.timeChanged"
  | "reservation.confirmation"
  | "reservation.cancelled";

export const WAITLIST_TEMPLATE_KEYS: WaitlistTemplateKey[] = [
  "waitlist.added",
  "waitlist.tableReady",
  "waitlist.almostReady",
  "waitlist.runningLate",
  "waitlist.updateConfirmed",
  "waitlist.cancelled",
];

export const RESERVATION_TEMPLATE_KEYS: ReservationTemplateKey[] = [
  "reservation.created",
  "reservation.moved",
  "reservation.timeChanged",
  "reservation.confirmation",
  "reservation.cancelled",
];

// Tokens a merchant may use in each context. Surfaced so the editor can render a
// legend and so interpolation only ever substitutes these names.
export const WAITLIST_TOKENS = [
  "name",
  "store",
  "store_address",
  "wait",
  "party_size",
] as const;

export const RESERVATION_TOKENS = [
  "name",
  "store",
  "store_address",
  "party_size",
  "date",
  "time",
  "confirmation",
] as const;

export type WaitlistTemplateContext = {
  partyName: string;
  storeName: string;
  storeAddress: string;
  quotedWaitMinutes: number | null;
  partySize: number | null;
};

export type ReservationTemplateContext = {
  partyName: string;
  storeName: string;
  storeAddress: string;
  partySize: number | null;
  reservationDate: string;
  reservationTime: string;
  confirmationNumber: string | null;
};

/** Merchant-saved templates, read from `pos_config.waitlist`. */
export type MerchantTemplateConfig = {
  messageTemplates?: Record<string, string | null | undefined> | null;
  /** Legacy single field — treated as the `waitlist.tableReady` override. */
  smsTemplate?: string | null;
};

// ── helpers ────────────────────────────────────────────────────────────────

function isNonBlank(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

/** Whitelist substitution. Unknown `{tokens}` are left verbatim. */
export function interpolate(
  template: string,
  tokens: Record<string, string>,
): string {
  let out = template;
  for (const [key, value] of Object.entries(tokens)) {
    out = out.split(`{${key}}`).join(value ?? "");
  }
  return out.trim().slice(0, SMS_MAX_LENGTH);
}

function waitClause(quotedWaitMinutes: number | null): string {
  return quotedWaitMinutes != null && quotedWaitMinutes > 0
    ? `in ${quotedWaitMinutes} min`
    : "soon";
}

function waitlistTokens(
  ctx: WaitlistTemplateContext,
): Record<string, string> {
  return {
    name: ctx.partyName,
    store: ctx.storeName,
    store_address: ctx.storeAddress,
    wait: waitClause(ctx.quotedWaitMinutes),
    party_size: ctx.partySize != null ? String(ctx.partySize) : "",
  };
}

function reservationTokens(
  ctx: ReservationTemplateContext,
): Record<string, string> {
  return {
    name: ctx.partyName,
    store: ctx.storeName,
    store_address: ctx.storeAddress,
    party_size: ctx.partySize != null ? String(ctx.partySize) : "",
    date: ctx.reservationDate,
    time: ctx.reservationTime,
    confirmation: ctx.confirmationNumber ?? "",
  };
}

// ── built-in defaults (byte-identical to the prior hardcoded switch) ─────────

export function renderWaitlistDefault(
  key: WaitlistTemplateKey,
  ctx: WaitlistTemplateContext,
): string | null {
  const { partyName, storeName, storeAddress, quotedWaitMinutes } = ctx;
  const addressClause = storeAddress ? ` (${storeAddress})` : "";
  const wait = waitClause(quotedWaitMinutes);

  switch (key) {
    case "waitlist.added":
      return `Hi ${partyName}, you're on the waitlist at ${storeName}${addressClause}. Your seat should be ready ${wait}. We'll text you when it's ready.`;
    case "waitlist.tableReady":
      return `Hi ${partyName}! Your table at ${storeName} is ready. Please check in with the host within 10 minutes.`;
    case "waitlist.almostReady":
      return `Hi ${partyName}! Your table at ${storeName} will be ready in about 5 minutes. Please head back to the host stand.`;
    case "waitlist.runningLate":
      return `Hi ${partyName}, we're running a few more minutes behind at ${storeName}. Thanks for your patience — we'll have your table ready soon.`;
    case "waitlist.updateConfirmed":
      return `Hi ${partyName}, just a quick update on your wait at ${storeName}. We'll have your table ready as soon as possible.`;
    case "waitlist.cancelled":
      return `Hi ${partyName}, you've been removed from the waitlist at ${storeName}. Please contact us if this was a mistake.`;
    default:
      return null;
  }
}

export function renderReservationDefault(
  key: ReservationTemplateKey,
  ctx: ReservationTemplateContext,
): string | null {
  const {
    partyName,
    storeName,
    storeAddress,
    partySize,
    reservationDate,
    reservationTime,
    confirmationNumber,
  } = ctx;
  const addressClause = storeAddress ? ` (${storeAddress})` : "";
  const partyClause = partySize ? ` for ${partySize}` : "";
  const confClause = confirmationNumber
    ? ` Confirmation #${confirmationNumber}.`
    : "";

  switch (key) {
    case "reservation.created":
      return `Hi ${partyName}, your reservation at ${storeName}${addressClause}${partyClause} is confirmed for ${reservationDate} at ${reservationTime}.${confClause} Reply to this message if you need to make changes.`;
    case "reservation.moved":
      return `Hi ${partyName}, your reservation at ${storeName} has been moved to ${reservationDate} at ${reservationTime}. Reply to this message to confirm.`;
    case "reservation.timeChanged":
      return `Hi ${partyName}, your reservation time at ${storeName} on ${reservationDate} has changed to ${reservationTime}. Reply to this message to confirm.`;
    case "reservation.confirmation":
      return `Hi ${partyName}, this is ${storeName} confirming your reservation on ${reservationDate} at ${reservationTime}. See you soon!`;
    case "reservation.cancelled":
      return `Hi ${partyName}, your reservation at ${storeName} on ${reservationDate} at ${reservationTime} has been cancelled. Reply or call us if you'd like to rebook.`;
    default:
      return null;
  }
}

// ── merchant-template lookup ─────────────────────────────────────────────────

function pickWaitlistTemplate(
  key: string,
  config: MerchantTemplateConfig | null | undefined,
): string | null {
  const fromMap = config?.messageTemplates?.[key];
  if (isNonBlank(fromMap)) return fromMap;
  // Legacy single field is the table-ready override.
  if (key === "waitlist.tableReady" && isNonBlank(config?.smsTemplate)) {
    return config!.smsTemplate as string;
  }
  return null;
}

function pickReservationTemplate(
  key: string,
  config: MerchantTemplateConfig | null | undefined,
): string | null {
  const fromMap = config?.messageTemplates?.[key];
  return isNonBlank(fromMap) ? fromMap : null;
}

function customMessageOrNull(customMessage?: string | null): string | null {
  return isNonBlank(customMessage)
    ? customMessage.trim().slice(0, SMS_MAX_LENGTH)
    : null;
}

// ── public resolvers ─────────────────────────────────────────────────────────

/**
 * Resolve the final waitlist SMS body. Returns null for an unknown template_key
 * with no merchant override (caller maps that to a `bad_template` response) and
 * for a blank `custom` message.
 */
export function resolveWaitlistMessage(
  templateKey: string,
  ctx: WaitlistTemplateContext,
  config: MerchantTemplateConfig | null | undefined,
  customMessage?: string | null,
): string | null {
  if (templateKey === "custom") return customMessageOrNull(customMessage);

  const isKnown = (WAITLIST_TEMPLATE_KEYS as string[]).includes(templateKey);
  if (!isKnown) return null;

  const merchant = pickWaitlistTemplate(templateKey, config);
  if (merchant) return interpolate(merchant, waitlistTokens(ctx));

  return renderWaitlistDefault(templateKey as WaitlistTemplateKey, ctx);
}

export function resolveReservationMessage(
  templateKey: string,
  ctx: ReservationTemplateContext,
  config: MerchantTemplateConfig | null | undefined,
  customMessage?: string | null,
): string | null {
  if (templateKey === "custom") return customMessageOrNull(customMessage);

  const isKnown = (RESERVATION_TEMPLATE_KEYS as string[]).includes(templateKey);
  if (!isKnown) return null;

  const merchant = pickReservationTemplate(templateKey, config);
  if (merchant) return interpolate(merchant, reservationTokens(ctx));

  return renderReservationDefault(templateKey as ReservationTemplateKey, ctx);
}
