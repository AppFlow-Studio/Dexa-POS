/**
 * Side effect: SEND_TO_KITCHEN
 *
 * After the store optimistically transitions the session to "ordered", this
 * effect performs the traceable composite kitchen send. Failures retain the
 * original station/device/idempotency context in the offline queue.
 */

import { getDeviceId } from "@/lib/deviceId";
import {
  buildKitchenSendQueueParams,
  createKitchenSendContext,
  isTerminalKitchenMutationError,
  type KitchenSendContext,
} from "@/lib/kdsSendTraceability";
import {
  getKitchenSentStatus,
  getOrderSentStatus,
} from "@/lib/kitchenStatusUtils";
import type { SideEffectContext } from "@/lib/sessionSideEffects";
import { toastService } from "@/lib/toastService";
import { queueFailedOperation } from "@/services/offlineSyncInit";
import { OrderService } from "@/services/orderService";
import { useEmployeeStore } from "@/stores/useEmployeeStore";
import {
  getOrderStoreSupabaseClient,
  useOrderStore,
} from "@/stores/useOrderStore";
import { useStoreSettingsStore } from "@/stores/useStoreSettingsStore";

function createCurrentContext(): KitchenSendContext {
  return createKitchenSendContext({
    stationId:
      useStoreSettingsStore.getState().selectedStation?.id ?? null,
    deviceId: getDeviceId(),
    staffId:
      useEmployeeStore.getState().getEffectiveCreatorStaffId() ?? null,
  });
}

async function queueKitchenSend(
  localOrderId: string,
  localItemIds: string[],
  context: KitchenSendContext,
  offlineBatch = false,
  resolvedItemIds?: string[],
): Promise<void> {
  await queueFailedOperation(
    "send_to_kitchen",
    buildKitchenSendQueueParams(
      localOrderId,
      localItemIds,
      context,
      {
        orderStatus: getOrderSentStatus(),
        itemStatus: getKitchenSentStatus(),
      },
      {
        ...(offlineBatch ? { offline_batch: true } : {}),
        ...(resolvedItemIds
          ? { resolvedItemIds, unresolvedLocalItemIds: [] }
          : {}),
      },
    ),
    localOrderId,
    undefined,
    undefined,
    { idempotencyKey: context.sendIdempotencyKey },
  );
}

export async function sendToKitchenEffect(
  ctx: SideEffectContext,
): Promise<void> {
  if (ctx.action.type !== "SEND_TO_KITCHEN") return;

  const { itemIds, orderId } = ctx.action;
  let { dbItemIds, dbOrderId } = ctx.action;
  const supabase = getOrderStoreSupabaseClient();

  if (!supabase) {
    if (itemIds.length > 0) {
      await queueKitchenSend(
        orderId,
        itemIds,
        createCurrentContext(),
        true,
      );
    }
    return;
  }

  // Item creation and quantity writes must settle before the routing trigger
  // sees the fired rows. Late IDs are captured from the fresh order below.
  await useOrderStore.getState().waitForPendingSyncs(orderId, { maxMs: 800 });

  const freshOrder = useOrderStore.getState().ordersById[orderId];
  if (freshOrder) dbOrderId = freshOrder.db_order_id ?? dbOrderId;

  if (!dbOrderId) {
    if (itemIds.length > 0) {
      await queueKitchenSend(
        orderId,
        itemIds,
        createCurrentContext(),
        true,
      );
    }
    return;
  }

  const sentLocalIds = new Set(itemIds);
  const freshSentItems = (freshOrder?.items ?? []).filter(
    (item) => sentLocalIds.has(item.id) && !!item.db_order_item_id,
  );
  dbItemIds = freshSentItems
    .map((item) => item.db_order_item_id!)
    .filter(Boolean);

  const stragglerIds = (freshOrder?.items ?? [])
    .filter((item) => sentLocalIds.has(item.id) && !item.db_order_item_id)
    .map((item) => item.id);
  if (stragglerIds.length > 0) {
    await queueKitchenSend(
      orderId,
      stragglerIds,
      createCurrentContext(),
      true,
    );
  }

  if (dbItemIds.length === 0) return;

  const resolvedLocalItemIds = freshSentItems.map((item) => item.id);
  const sendContext = createCurrentContext();
  try {
    const result = await OrderService.sendOrderToKitchen(
      supabase,
      dbOrderId,
      dbItemIds,
      getOrderSentStatus(),
      getKitchenSentStatus(),
      {
        staffId: sendContext.staffId,
        stationId: sendContext.stationId,
        deviceId: sendContext.deviceId,
        idempotencyKey: sendContext.sendIdempotencyKey,
        itemsIdempotencyKey: sendContext.itemsIdempotencyKey,
      },
    );

    if (!result.error) return;

    if (isTerminalKitchenMutationError(result.error)) {
      toastService.show({
        title: "Kitchen send incomplete",
        message: result.error.hint,
        type: "warning",
        duration: 7000,
      });
      return;
    }

    await queueKitchenSend(
      orderId,
      resolvedLocalItemIds,
      sendContext,
      false,
      dbItemIds,
    );
  } catch (error) {
    console.error("[sendToKitchenEffect] Kitchen send failed:", error);
    await queueKitchenSend(
      orderId,
      resolvedLocalItemIds,
      sendContext,
      false,
      dbItemIds,
    );
  }
}
