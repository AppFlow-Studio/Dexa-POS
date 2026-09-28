/**
 * Toast sizing for whatever screen the app is on.
 *
 * Toasts render once at the app root, above every screen, so they can't lean
 * on the sizing the screen beneath them uses. Their width used to be a fixed
 * 380dp, which runs off the left edge of any phone in portrait, and their type
 * was Tailwind at the root UI scale, which a phone floors at 0.6 (a 9.6px
 * title). Everything here follows the scale on a panel and is bounded on a
 * phone: the card never outgrows the window and the type never drops below
 * phone-readable sizes.
 */

/** Width of the standard toast at scale 1 - its size on the baseline tablet. */
const TOAST_WIDTH = 380;
/** The compact (undo) toast's width, e.g. the KDS ticket-advance toast. */
const COMPACT_TOAST_WIDTH = 300;
/** Gap between the toast and the window edge. */
const TOAST_MARGIN = 16;
/** The toast stack's top offset on a device with no status bar or notch. */
const TOAST_MIN_TOP = 50;

export interface ToastLayout {
  /** Distance from the right edge (and, on a phone, the left one). */
  margin: number;
  top: number;
  width: number;
  compactWidth: number;
  padding: number;
  radius: number;
  /** Between the icon, the copy and the close button. */
  gap: number;
  titleSize: number;
  titleLineHeight: number;
  messageSize: number;
  messageLineHeight: number;
  messageGap: number;
  iconSize: number;
  closeSize: number;
}

export function toastLayout(
  windowWidth: number,
  scale: number,
  safeTop = 0,
): ToastLayout {
  const px = (n: number, min: number) => Math.max(min, Math.round(n * scale));
  const margin = px(TOAST_MARGIN, TOAST_MARGIN);
  const available = Math.max(0, windowWidth - margin * 2);
  return {
    margin,
    top: Math.max(TOAST_MIN_TOP, safeTop + 12),
    // Grows with the type on a large display; never narrower than the tablet
    // toast unless the window itself is.
    width: Math.min(px(TOAST_WIDTH, TOAST_WIDTH), available),
    compactWidth: Math.min(COMPACT_TOAST_WIDTH, available),
    padding: px(16, 12),
    radius: px(8, 8),
    gap: px(12, 10),
    titleSize: px(16, 15),
    titleLineHeight: px(24, 21),
    messageSize: px(14, 13),
    messageLineHeight: px(20, 18),
    messageGap: px(4, 4),
    iconSize: px(24, 20),
    closeSize: px(18, 16),
  };
}
