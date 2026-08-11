import { InteractionManager } from "react-native";

/**
 * Run `fn` once the current frame has painted and queued interactions have
 * drained — for work that is heavy on the JS thread but not urgent, kicked off
 * from a screen the operator is about to look at.
 *
 * The motivating case is the payment-success auto-print. Star receipts are
 * rasterized through Skia and PNG-encoded synchronously on the JS thread, and
 * the auto-print fires from the success view's mount effect — so without a
 * deferral the raster lands in the same tick as the mount commit and the
 * "Payment Successful" frame waits behind it.
 *
 * `requestAnimationFrame` gets us past the commit into a painted frame;
 * `runAfterInteractions` then yields to the success-view entrance animations.
 *
 * The timeout is not a nicety. `runAfterInteractions` waits on every
 * outstanding interaction handle, and a single handle leaked by an animation
 * that never settles would strand the callback forever — which for a receipt
 * means it silently never prints. Whichever path fires first wins; `fn` runs
 * exactly once.
 */
export function runAfterPaint(fn: () => void, timeoutMs = 1500): void {
  let ran = false;
  const runOnce = () => {
    if (ran) return;
    ran = true;
    try {
      fn();
    } catch (e) {
      console.warn("[runAfterPaint] callback threw:", e);
    }
  };

  const timer = setTimeout(runOnce, timeoutMs);

  requestAnimationFrame(() => {
    InteractionManager.runAfterInteractions(() => {
      clearTimeout(timer);
      runOnce();
    });
  });
}
