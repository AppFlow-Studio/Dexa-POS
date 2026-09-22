import { logError } from "@/lib/logError";
import { colors } from "@/lib/theme";
import { toastService } from "@/lib/toastService";
import { useLocationConfigStore } from "@/stores/useLocationConfigStore";
import { useOrderStore } from "@/stores/useOrderStore";
import { Send } from "lucide-react-native";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { payBlockedReason } from "../../lib/payments";
import { isTableCheck, sendToKitchen, unsentItems, type SendOutcome } from "../../lib/sendCourse";
import { StickyActionBar } from "../../primitives";

function report(outcome: SendOutcome, what: string) {
  switch (outcome) {
    case "sent":
      toastService.show({ title: `${what} sent`, message: `${what} has been sent for preparation.`, type: "success" });
      return;
    case "queued":
      toastService.show({
        title: `${what} queued`,
        message: `${what} will reach the kitchen when the connection recovers.`,
        type: "warning",
      });
      return;
    case "empty":
      toastService.show({ title: "Nothing to send", message: "Everything on this check has been sent.", type: "warning" });
      return;
    case "failed":
      toastService.show({ title: "Send failed", message: "The kitchen did not get it. Try again.", type: "error" });
  }
}

/**
 * The artifact's `.bb` on screen 5 / S3: a tonal, label-width **Pay**
 * (`.btn.tonal.fit`) beside the primary **Send** (`.btn`). "Send course N"
 * names the lowest unsent course on a coursed table check; every other check
 * sends everything unsent.
 *
 * Pay's disabled state is computed, not assumed. `CheckPage` gates only on
 * ownership, so a closed or fully paid check still renders this footer —
 * without the `payBlockedReason` check the button would open the pay route
 * and die there instead (`docs/features/handheld/wave4-plan.md`, trap 1).
 */
export function CheckFooter({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  // A string, not an object: a selector returning a fresh object re-renders
  // the footer on every store broadcast.
  const payBlocked = useOrderStore((s) =>
    payBlockedReason(s.ordersById[orderId], s.currentStationId),
  );
  const coursing = useLocationConfigStore((s) => s.config.dining.enableCoursing);
  const course = useOrderStore((s) => {
    const order = s.ordersById[orderId];
    if (!order) return null;
    const pending = unsentItems(order, null);
    if (pending.length === 0) return null;
    if (!coursing || !isTableCheck(order)) return 0;
    return Math.min(...pending.map((i) => i.courseNumber ?? 1));
  });

  const send = useCallback(async () => {
    if (course === null) return;
    setBusy(true);
    const what = course > 0 ? `Course ${course}` : "Order";
    try {
      report(await sendToKitchen(orderId, course > 0 ? course : null), what);
    } catch (e) {
      logError("order", "Handheld send failed", e);
      report("failed", what);
    } finally {
      setBusy(false);
    }
  }, [orderId, course]);

  const pay = useCallback(() => {
    // Re-read at tap time rather than trusting the subscribed value: the
    // check can flip to another station between render and tap, and every
    // other handheld write helper re-asserts the same way.
    const s = useOrderStore.getState();
    const blocked = payBlockedReason(s.ordersById[orderId], s.currentStationId);
    if (blocked) {
      toastService.show({ title: "Payment blocked", message: blocked, type: "warning" });
      return;
    }
    router.push({ pathname: "/handheld/pay/[orderId]", params: { orderId } });
  }, [orderId, router]);

  const label = busy ? "Sending…" : course ? `Send course ${course}` : "Send to kitchen";
  return (
    <StickyActionBar
      actions={[
        {
          label: "Pay",
          onPress: pay,
          variant: "tonal",
          fit: true,
          disabled: payBlocked !== null,
        },
        {
          label,
          onPress: () => void send(),
          disabled: busy || course === null,
          icon: <Send size={20} color={busy || course === null ? colors.muted : colors.onSolid} strokeWidth={2} />,
        },
      ]}
    />
  );
}
