export type PosAccessBlockReason =
  | "subscription_suspended"
  | "station_quota"
  | "station_inactive";

export interface PosAccessFailure {
  reason: PosAccessBlockReason;
  title: string;
  message: string;
  status?: string | null;
}

export interface PosBillingAccessStatus {
  allowed: boolean;
  failure: PosAccessFailure | null;
  status?: string | null;
  raw?: unknown;
}

const BLOCKED_BILLING_STATUSES = new Set([
  "suspended",
  "merchant_suspended",
  "subscription_suspended",
  "location_suspended",
  "subscription_canceled",
  "subscription_cancelled",
  "location_canceled",
  "location_cancelled",
  "canceled",
  "cancelled",
  "past_due",
  "past-due",
  "unpaid",
  "payment_failed",
  "payment-failed",
  "billing_suspended",
  "non_payment",
  "non-payment",
  "deactivated",
]);

const BILLING_CODE_TOKENS = [
  "subscription_suspended",
  "billing_suspended",
  "merchant_suspended",
  "location_suspended",
  "subscription_canceled",
  "subscription_cancelled",
  "location_canceled",
  "location_cancelled",
  "payment_required",
  "past_due",
  "non_payment",
  "non-payment",
  "unpaid",
];

const QUOTA_CODE_TOKENS = [
  "station_quota",
  "station_limit",
  "quota_exceeded",
  "limit_reached",
  "seat_limit",
  "device_limit",
];

const EXPLICIT_NON_BLOCKING_ACCESS_STATUSES = new Set([
  "active",
  "billing_exempt",
  "past_due_grace",
]);

function normalizeToken(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
}

function hasAnyToken(value: unknown, tokens: string[]): boolean {
  const normalized = normalizeToken(value);
  return tokens.some((token) => normalized.includes(token));
}

function readBoolean(payload: any, keys: string[]): boolean {
  if (!payload || typeof payload !== "object") return false;
  return keys.some((key) => payload[key] === true);
}

function readExplicitBoolean(payload: any, keys: string[]): boolean | null {
  if (!payload || typeof payload !== "object") return null;
  for (const key of keys) {
    if (typeof payload[key] === "boolean") return payload[key];
  }
  return null;
}

function unwrapRpcPayload(payload: unknown): Record<string, any> {
  const candidate = Array.isArray(payload) ? payload[0] : payload;
  return candidate && typeof candidate === "object"
    ? (candidate as Record<string, any>)
    : {};
}

function readFirstString(payload: any, keys: string[]): string | null {
  if (!payload || typeof payload !== "object") return null;
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

export function createBillingSuspendedFailure(
  status?: string | null,
  message?: string | null,
): PosAccessFailure {
  return {
    reason: "subscription_suspended",
    title: "Billing Suspended",
    message:
      message?.trim() ||
      "POS access is disabled because this subscription is suspended or past due. Ask DEXA HQ to restore billing, then refresh this screen.",
    status: status ?? null,
  };
}

export function createStationQuotaFailure(
  message?: string | null,
): PosAccessFailure {
  return {
    reason: "station_quota",
    title: "Station Limit Reached",
    message:
      message?.trim() ||
      "This location has reached its paid station limit. Ask DEXA HQ to add a station/device seat before activating another station.",
  };
}

export function createStationInactiveFailure(
  message?: string | null,
): PosAccessFailure {
  return {
    reason: "station_inactive",
    title: "Station Unavailable",
    message:
      message?.trim() ||
      "This station is inactive or no longer available. Refresh stations or ask DEXA HQ to restore this POS ID.",
  };
}

export function normalizeMerchantBillingAccess(
  payload: unknown,
): PosBillingAccessStatus {
  const source = unwrapRpcPayload(payload);
  const status =
    readFirstString(source, [
      "status",
      "subscription_status",
      "billing_status",
      "payment_status",
      "access_status",
      "merchant_status",
    ]) ?? null;
  const message =
    readFirstString(source, [
      "message",
      "error",
      "reason",
      "suspended_reason",
      "billing_message",
    ]) ?? null;

  if (Object.keys(source).length === 0) {
    return {
      allowed: false,
      failure: createBillingSuspendedFailure(
        null,
        "POS could not verify subscription access. Check the connection and try again.",
      ),
      status: null,
      raw: payload,
    };
  }

  // The shared access RPC is the policy boundary. Its explicit decision wins
  // over nested subscription rows (for example past_due during grace, or a
  // billing-exempt merchant whose underlying schedule remains suspended).
  const explicitAllowed = readExplicitBoolean(source, [
    "allowed",
    "access_allowed",
    "pos_access_allowed",
  ]);
  if (explicitAllowed !== null) {
    return explicitAllowed
      ? { allowed: true, failure: null, status, raw: payload }
      : {
          allowed: false,
          failure: createBillingSuspendedFailure(status, message),
          status,
          raw: payload,
        };
  }

  const blockedByStatus = BLOCKED_BILLING_STATUSES.has(normalizeToken(status));
  const blockedByFlag = readBoolean(source, [
    "is_suspended",
    "suspended",
    "access_blocked",
    "pos_access_blocked",
    "is_pos_access_blocked",
  ]);
  const blockedByExplicitAllowed =
    source.access_allowed === false || source.pos_access_allowed === false;
  const blockedBySuspendedAt = Boolean(source.suspended_at);

  if (
    blockedByStatus ||
    blockedByFlag ||
    blockedByExplicitAllowed ||
    blockedBySuspendedAt
  ) {
    return {
      allowed: false,
      failure: createBillingSuspendedFailure(status, message),
      status,
      raw: payload,
    };
  }

  return { allowed: true, failure: null, status, raw: payload };
}

export function getPosAccessFailure(input: {
  error?: string | null;
  errorCode?: string | null;
}): PosAccessFailure | null {
  if (
    EXPLICIT_NON_BLOCKING_ACCESS_STATUSES.has(normalizeToken(input.errorCode))
  ) {
    return null;
  }
  const combined = `${input.errorCode ?? ""} ${input.error ?? ""}`;

  if (hasAnyToken(combined, QUOTA_CODE_TOKENS)) {
    return createStationQuotaFailure(input.error ?? null);
  }

  if (hasAnyToken(combined, BILLING_CODE_TOKENS)) {
    return createBillingSuspendedFailure(input.errorCode ?? null, input.error);
  }

  return null;
}

