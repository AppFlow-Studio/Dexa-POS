import { toastLayout } from "@/components/ui/toastLayout";
import { computeKioskUiScale, computeUiScale } from "@/lib/uiScale";

/**
 * Toasts render at the app root over every screen - POS tablets, KDS, kiosk
 * panels from a phone to a 4K portrait display - so their size has to hold up
 * on all of them.
 */
describe("toastLayout", () => {
  it("keeps the tablet toast exactly as it was", () => {
    const l = toastLayout(1333, computeUiScale(1333, 752));
    expect(l.width).toBe(380);
    expect(l.compactWidth).toBe(300);
    expect(l.top).toBe(50);
    expect(l.margin).toBe(16);
    expect(l.titleSize).toBe(16);
    expect(l.messageSize).toBe(14);
    expect(l.padding).toBe(16);
  });

  it("fits inside a portrait phone instead of running off its left edge", () => {
    for (const width of [320, 360, 390, 412]) {
      // A phone's POS scale floors at 0.6; the kiosk's at 0.85.
      for (const scale of [computeUiScale(width, 800), 0.85]) {
        const l = toastLayout(width, scale);
        expect(l.width + l.margin * 2).toBeLessThanOrEqual(width);
        expect(l.compactWidth + l.margin * 2).toBeLessThanOrEqual(width);
      }
    }
  });

  it("keeps the type readable where the UI scale drops below 1", () => {
    const l = toastLayout(360, computeUiScale(360, 800));
    expect(l.titleSize).toBeGreaterThanOrEqual(15);
    expect(l.messageSize).toBeGreaterThanOrEqual(13);
    expect(l.iconSize).toBeGreaterThanOrEqual(20);
  });

  it("grows with the kiosk UI on a large panel", () => {
    const scale = computeKioskUiScale(1080, 1920);
    const l = toastLayout(1080, scale);
    expect(l.titleSize).toBe(Math.round(16 * scale));
    expect(l.width).toBe(Math.round(380 * scale));
    expect(l.width + l.margin * 2).toBeLessThanOrEqual(1080);
  });

  it("clears a status bar or notch", () => {
    expect(toastLayout(390, 0.85, 59).top).toBe(71);
    expect(toastLayout(390, 0.85, 24).top).toBe(50);
  });
});
