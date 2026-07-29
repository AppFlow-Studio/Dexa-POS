/**
 * Mount/render accounting for globally-mounted overlays (sheets, drawers,
 * panels mounted once in app/(main)/_layout.tsx and shown by store flag).
 *
 * These overlays sit in the tree on every POS screen. The number that matters
 * is how many times one re-renders while it is *closed*: that render is pure
 * waste, and during a rush it happens on every order write or navigation. The
 * target is zero — see `overlay.render_closed.<name>` in lib/telemetry/keys.
 *
 * Usage — call from the thin controller, not the heavy body:
 *
 *   const isOpen = useSomeSheetStore((s) => s.isOpen);
 *   const { onBodyMounted } = useOverlayTelemetry("payment_detail", isOpen);
 *
 * and call `onBodyMounted()` from a mount effect in the body (or via
 * `useOverlayBodyMount`) to close the open-duration span.
 */

import { overlayKeyIds } from "@/lib/telemetry/keys";
import { recordCount, recordSpan } from "@/lib/telemetry/registry";
import { useCallback, useEffect, useRef } from "react";

export interface OverlayTelemetry {
  /**
   * Call once from the overlay body's mount effect. Closes the open-duration
   * span opened when `isOpen` flipped true and counts the mount.
   */
  onBodyMounted: () => void;
}

export function useOverlayTelemetry(
  name: string,
  isOpen: boolean,
): OverlayTelemetry {
  const ids = overlayKeyIds(name);

  // Counted during render on purpose: an effect fires once per *commit*, but a
  // render that bails out early still burned the hook body, and that is
  // precisely the waste being measured. recordCount is a couple of array
  // writes and is a no-op when telemetry is off.
  recordCount(isOpen ? ids.renderOpen : ids.renderClosed);

  // Timestamp of the isOpen false->true edge, i.e. when the user's tap landed.
  const openedAtRef = useRef<number | null>(null);
  const wasOpenRef = useRef(isOpen);

  if (isOpen && !wasOpenRef.current) {
    openedAtRef.current = Date.now();
  }
  wasOpenRef.current = isOpen;

  useEffect(() => {
    if (!isOpen) openedAtRef.current = null;
  }, [isOpen]);

  const onBodyMounted = useCallback(() => {
    recordCount(ids.mount);
    const openedAt = openedAtRef.current;
    if (openedAt !== null) {
      recordSpan(ids.openMs, Date.now() - openedAt);
      openedAtRef.current = null;
    }
  }, [ids]);

  return { onBodyMounted };
}
