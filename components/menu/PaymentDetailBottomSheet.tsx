/**
 * Payment-detail sheet — controller half.
 *
 * The sheet is mounted *persistently* in app/(main)/_layout.tsx, so it sits in
 * the tree on every POS screen. Its body is ~6.7k lines with a ~40-hook graph;
 * keeping that mounted while closed meant the whole graph re-ran on every
 * navigation (the layout re-renders on `usePathname()`), and the module was
 * evaluated at boot whether or not anyone opened a payment detail all shift.
 *
 * This file is the only thing that stays mounted. It subscribes to exactly one
 * boolean and renders nothing until that boolean is true; the body is a
 * `React.lazy` import so its module cost is deferred to the first open.
 *
 * Unmount-on-close is deliberate. Because the sheet's own selectors already
 * short-circuit on `orderId === null`, retaining the body would buy no render
 * savings — only a faster reopen — and after the first open the module is
 * resident in the bundle registry, so reopening is a plain React mount with no
 * fetch. `overlay.open_ms.payment_detail` is the number to check against the
 * agreed budget; if its P95 regresses on the Landi rig, switch to retain by
 * keeping the body mounted and gating its subscriptions on `isOpen`.
 *
 * The `BottomSheetMethods` handle lives here rather than in the body, so the
 * ref registered by the layout stays valid while the sheet is closed.
 */

import { BottomSheetMethods } from "@/components/ui/bottomSheet";
import { useOverlayTelemetry } from "@/hooks/useOverlayTelemetry";
import { usePaymentDetailSheetStore } from "@/stores/usePaymentDetailSheetStore";
import React, { Suspense, useImperativeHandle } from "react";

const PaymentDetailBottomSheetBody = React.lazy(
  () => import("./PaymentDetailBottomSheetBody"),
);

const PaymentDetailBottomSheetController: React.ForwardRefRenderFunction<
  BottomSheetMethods,
  {}
> = (_props, ref) => {
  // The ONLY subscription this component may take. Anything else here is paid
  // on every POS screen, forever — put it in the body instead.
  const isOpen = usePaymentDetailSheetStore((s) => s.isOpen);

  const { onBodyMounted } = useOverlayTelemetry("payment_detail", isOpen);

  // Legacy handle. Callers reach the sheet through the store's `open`/`close`
  // actions; these remain only so the ref contract in (main)/_layout.tsx and
  // any older call site keep working. `close` is routed through the store so
  // it works whether or not the body is mounted.
  useImperativeHandle(
    ref,
    () =>
      ({
        snapToIndex: () => {},
        snapToPosition: () => {},
        expand: () => {},
        collapse: () => {},
        close: () => usePaymentDetailSheetStore.getState().close(),
        forceClose: () => usePaymentDetailSheetStore.getState().close(),
      }) as BottomSheetMethods,
    [],
  );

  if (!isOpen) return null;

  // `fallback={null}` is correct here rather than a spinner: the body renders
  // its own full-screen Modal with a scrim, and a bare frame of nothing looks
  // better than a flash of loader over the previous screen. After the first
  // open the module is already resolved and there is no fallback frame at all.
  return (
    <Suspense fallback={null}>
      <PaymentDetailBottomSheetBody onBodyMounted={onBodyMounted} />
    </Suspense>
  );
};

/**
 * Memo matters even though this component is now trivial: the (main) layout
 * re-renders on every navigation, and an unmemoized controller would re-render
 * with it — which is exactly the `overlay.render_closed.payment_detail` counter
 * that has to stay at zero. Its only prop is the layout's stable `useRef`.
 */
const PaymentDetailBottomSheet = React.memo(
  React.forwardRef(PaymentDetailBottomSheetController),
);
PaymentDetailBottomSheet.displayName = "PaymentDetailBottomSheet";

export default PaymentDetailBottomSheet;
