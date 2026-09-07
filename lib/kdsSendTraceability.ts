import { v4 as uuidv4 } from "uuid";

export const KITCHEN_ITEMS_UNRESOLVED = "KITCHEN_ITEMS_UNRESOLVED";
export const KITCHEN_STATUS_PARTIAL_UPDATE =
  "KITCHEN_STATUS_PARTIAL_UPDATE";
export const KITCHEN_TRACE_CONTRACT_MISMATCH =
  "KITCHEN_TRACE_CONTRACT_MISMATCH";
export const KITCHEN_NO_ACTIVE_ROUTE = "KITCHEN_NO_ACTIVE_ROUTE";

// ---------------------------------------------------------------------------
// S3 — bounded optimistic kitchen-status preservation
// ---------------------------------------------------------------------------
// Local item ids whose kitchen send is genuinely in flight or queued. While an
// id is here, broadcast merges preserve the local optimistic kitchen_status.
// The marker is cleared when the send RESOLVES as rejected/skipped (the server
// wins and the line reads unsent again), when the server broadcast catches up,
// or when the offline replay confirms. Without this bound, a send that never
// succeeded left the line reading "sent" on the POS forever (S3).
const inFlightKitchenSendItemIds = new Set<string>();

/** Mark a batch of local item ids as having a kitchen send in flight/queued. */
export function markKitchenSendInFlight(itemIds: string[]): void {
  for (const id of itemIds) inFlightKitchenSendItemIds.add(id);
}

/** Clear the in-flight marker for a batch of local item ids. */
export function clearKitchenSendInFlight(itemIds: string[]): void {
  for (const id of itemIds) inFlightKitchenSendItemIds.delete(id);
}

/** True while a kitchen send for this local item id is in flight or queued. */
export function isKitchenSendInFlight(itemId: string): boolean {
  return inFlightKitchenSendItemIds.has(itemId);
}

/** Self-heal: a broadcast at/above the local status means the server caught up. */
export function clearKitchenSendInFlightIfCaughtUp(
  localKitchenStatus: string | null | undefined,
  broadcastKitchenStatus: string | null | undefined,
  itemId: string,
): void {
  const rank = (s: string | null | undefined) =>
    s === "served" ? 4 : s === "ready" ? 3 : s === "preparing" ? 2 : s === "sent" ? 1 : 0;
  if (rank(broadcastKitchenStatus) >= rank(localKitchenStatus)) {
    inFlightKitchenSendItemIds.delete(itemId);
  }
}

export type KitchenSendOrderStatus = "sent_to_kitchen" | "preparing";
export type KitchenSendItemStatus = "sent" | "preparing";

export interface KitchenSendContext {
  stationId: string | null;
  deviceId: string | null;
  staffId: string | null;
  sendIdempotencyKey: string;
  itemsIdempotencyKey: string;
}

export interface KitchenSendQueueParams {
  localOrderId: string;
  localItemIds: string[];
  stationId: string | null;
  deviceId: string | null;
  staffId: string | null;
  itemsIdempotencyKey: string;
  orderStatus: KitchenSendOrderStatus;
  itemStatus: KitchenSendItemStatus;
  resolvedItemIds?: string[];
  unresolvedLocalItemIds?: string[];
  offline_batch?: boolean;
  requeueGeneration?: number;
}

export interface KitchenMutationResult {
  updated_count?: number;
  requested_count?: number;
  kds_updated_count?: number;
  affected_order_ids?: string[];
  status?: string;
  order_id?: string;
  order_was_draft?: boolean;
  [key: string]: unknown;
}

export interface KitchenMutationError {
  code:
    | typeof KITCHEN_ITEMS_UNRESOLVED
    | typeof KITCHEN_STATUS_PARTIAL_UPDATE
    | typeof KITCHEN_TRACE_CONTRACT_MISMATCH
    | typeof KITCHEN_NO_ACTIVE_ROUTE;
  message: string;
  details: {
    orderId?: string;
    requestedCount: number;
    updatedCount: number | null;
    kdsUpdatedCount?: number | null;
    stationId?: string | null;
    deviceId?: string | null;
    replay?: boolean;
  };
  hint: string;
}

export function createKitchenSendContext(
  input: Partial<KitchenSendContext> = {},
): KitchenSendContext {
  return {
    stationId: input.stationId ?? null,
    deviceId: input.deviceId ?? null,
    staffId: input.staffId ?? null,
    sendIdempotencyKey: input.sendIdempotencyKey ?? uuidv4(),
    itemsIdempotencyKey: input.itemsIdempotencyKey ?? uuidv4(),
  };
}

export function buildKitchenSendQueueParams(
  localOrderId: string,
  localItemIds: string[],
  context: KitchenSendContext,
  statuses: {
    orderStatus: KitchenSendOrderStatus;
    itemStatus: KitchenSendItemStatus;
  },
  extras: Pick<
    KitchenSendQueueParams,
    | "offline_batch"
    | "requeueGeneration"
    | "resolvedItemIds"
    | "unresolvedLocalItemIds"
  > = {},
): KitchenSendQueueParams {
  return {
    localOrderId,
    localItemIds: [...localItemIds],
    stationId: context.stationId,
    deviceId: context.deviceId,
    staffId: context.staffId,
    itemsIdempotencyKey: context.itemsIdempotencyKey,
    orderStatus: statuses.orderStatus,
    itemStatus: statuses.itemStatus,
    ...extras,
  };
}

function toCount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
}

export function validateKitchenMutationResult(
  data: unknown,
  expectedRequestedCount: number,
  context: {
    orderId?: string;
    stationId?: string | null;
    deviceId?: string | null;
    replay?: boolean;
    operation: "send" | "status";
    requireExplicitCounts?: boolean;
  },
): KitchenMutationError | null {
  const result =
    data && typeof data === "object"
      ? (data as KitchenMutationResult)
      : null;
  const requestedCount = toCount(result?.requested_count);
  const updatedCount = toCount(result?.updated_count);
  const kdsUpdatedCount = toCount(result?.kds_updated_count);

  if (
    context.requireExplicitCounts &&
    (requestedCount === null ||
      updatedCount === null ||
      (context.operation === "send" && kdsUpdatedCount === null))
  ) {
    return {
      code: KITCHEN_TRACE_CONTRACT_MISMATCH,
      message:
        "Kitchen send response is missing requested/updated row counts.",
      details: {
        orderId: context.orderId,
        requestedCount: expectedRequestedCount,
        updatedCount,
        kdsUpdatedCount,
        stationId: context.stationId,
        deviceId: context.deviceId,
        replay: context.replay,
      },
      hint: "Apply the reviewed KDS routing traceability migration before using this POS build.",
    };
  }

  // Legacy bulk-status RPCs do not expose both counts. Preserve their rollback
  // path; the composite kitchen-send RPC requires the new count contract above.
  if (requestedCount === null || updatedCount === null) return null;

  if (
    requestedCount !== expectedRequestedCount ||
    updatedCount !== requestedCount
  ) {
    const isSend = context.operation === "send";
    return {
      code: isSend
        ? KITCHEN_ITEMS_UNRESOLVED
        : KITCHEN_STATUS_PARTIAL_UPDATE,
      message: isSend
        ? `Only ${updatedCount} of ${requestedCount} kitchen items were updated.`
        : `Only ${updatedCount} of ${requestedCount} kitchen status rows were updated.`,
      details: {
        orderId: context.orderId,
        requestedCount,
        updatedCount,
        kdsUpdatedCount,
        stationId: context.stationId,
        deviceId: context.deviceId,
        replay: context.replay,
      },
      hint: isSend
        ? "Refresh the order and re-fire only the unresolved items."
        : "Refresh the KDS ticket before retrying the remaining status update.",
    };
  }

  if (
    context.operation === "send" &&
    requestedCount > 0 &&
    kdsUpdatedCount === 0
  ) {
    return {
      code: KITCHEN_NO_ACTIVE_ROUTE,
      message: "Items were updated, but no KDS destination accepted them.",
      details: {
        orderId: context.orderId,
        requestedCount,
        updatedCount,
        kdsUpdatedCount,
        stationId: context.stationId,
        deviceId: context.deviceId,
        replay: context.replay,
      },
      hint: "Check that a KDS display is active and review the order routing trace before re-firing.",
    };
  }

  return null;
}

export function isTerminalKitchenMutationError(
  error: unknown,
): error is KitchenMutationError {
  const code = (error as { code?: string } | null)?.code;
  return (
    code === KITCHEN_ITEMS_UNRESOLVED ||
    code === KITCHEN_STATUS_PARTIAL_UPDATE ||
    code === KITCHEN_TRACE_CONTRACT_MISMATCH ||
    code === KITCHEN_NO_ACTIVE_ROUTE
  );
}
