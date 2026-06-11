/**
 * Interaction-latency instrumentation (Perf Roadmap Phase 0).
 *
 * Thin wrapper around Sentry custom spans so hot-path latency lands in the
 * Performance dashboard as standalone transactions (op: `pos.interaction`):
 *
 *   pos.add_to_cart         tap → cart row committed + painted
 *   pos.open_modifier_sheet tap → modifier sidebar painted
 *   pos.send_to_kitchen     tap → optimistic local ack painted
 *   pos.open_payment        tap → payment sheet state committed + painted
 *   pos.boot_to_order       PIN success → order screen fully interactive
 *   pos.queue_flush         offline sync queue flush duration
 *
 * Tap→paint spans should end via `endAfterPaint()` (double-rAF after the
 * state commit, so the measured window includes the frame the change painted
 * in). Sampling follows the global `tracesSampleRate` from Sentry.init.
 *
 * In __DEV__ every ended span also logs `[perf] <name>: <ms>ms` so latency is
 * visible on-device without the Sentry dashboard.
 */
import * as Sentry from "@sentry/react-native";

type PerfAttributeValue = string | number | boolean;
export type PerfAttributes = Record<string, PerfAttributeValue>;

export interface InteractionHandle {
  /** Attach/override attributes before the span ends. */
  setAttributes: (attrs: PerfAttributes) => void;
  /** End the span immediately. */
  end: (attrs?: PerfAttributes) => void;
  /**
   * End the span after the next painted frame (double requestAnimationFrame).
   * Call this right after the state commit that produces the visual feedback.
   */
  endAfterPaint: (attrs?: PerfAttributes) => void;
  /** End the span flagged `cancelled: true` (filter these out in dashboards). */
  cancel: () => void;
}

const NOOP_HANDLE: InteractionHandle = {
  setAttributes: () => {},
  end: () => {},
  endAfterPaint: () => {},
  cancel: () => {},
};

const nowMs = (): number =>
  typeof performance !== "undefined" && typeof performance.now === "function"
    ? performance.now()
    : Date.now();

/**
 * Start a standalone interaction span. Never throws; returns a no-op handle
 * if Sentry is unavailable. Handles are single-use — the first end/cancel
 * wins, later calls are ignored (safe with multiple exit paths).
 */
export function startInteraction(
  name: string,
  attributes?: PerfAttributes,
): InteractionHandle {
  let span: Sentry.Span | undefined;
  try {
    span = Sentry.startInactiveSpan({
      name,
      op: "pos.interaction",
      forceTransaction: true,
      attributes,
    });
  } catch {
    return NOOP_HANDLE;
  }
  if (!span) return NOOP_HANDLE;

  const startedAt = nowMs();
  let ended = false;
  const pendingAttrs: PerfAttributes = {};

  const applyAttrs = (attrs?: PerfAttributes) => {
    const merged = { ...pendingAttrs, ...attrs };
    for (const [key, value] of Object.entries(merged)) {
      try {
        span!.setAttribute(key, value);
      } catch {}
    }
  };

  const finish = (attrs?: PerfAttributes) => {
    if (ended) return;
    ended = true;
    applyAttrs(attrs);
    try {
      span!.end();
    } catch {}
    if (__DEV__) {
      console.log(`[perf] ${name}: ${Math.round(nowMs() - startedAt)}ms`);
    }
  };

  return {
    setAttributes: (attrs) => {
      Object.assign(pendingAttrs, attrs);
    },
    end: finish,
    endAfterPaint: (attrs) => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => finish(attrs));
      });
    },
    cancel: () => finish({ cancelled: true }),
  };
}

// ----------------------------------------------------------------------------
// Cross-screen marks (e.g. pos.boot_to_order spans PIN login → order screen).
// markEnd is a no-op when no matching mark exists, so the end site can live on
// a screen that mounts for many reasons besides the measured flow.
// ----------------------------------------------------------------------------

const marks = new Map<string, { handle: InteractionHandle; startedAtMs: number }>();

/** Marks older than this are discarded as cancelled instead of reported. */
const MARK_TTL_MS = 120_000;

export function markStart(name: string, attributes?: PerfAttributes): void {
  const stale = marks.get(name);
  if (stale) stale.handle.cancel();
  marks.set(name, {
    handle: startInteraction(name, attributes),
    startedAtMs: Date.now(),
  });
}

export function markEnd(name: string, attributes?: PerfAttributes): void {
  const mark = marks.get(name);
  if (!mark) return;
  marks.delete(name);
  if (Date.now() - mark.startedAtMs > MARK_TTL_MS) {
    mark.handle.cancel();
    return;
  }
  mark.handle.endAfterPaint(attributes);
}

export function markCancel(name: string): void {
  const mark = marks.get(name);
  if (!mark) return;
  marks.delete(name);
  mark.handle.cancel();
}
