/**
 * Regression: skiaTableFont must load typefaces from BUNDLED bytes (network-free),
 * and getTableFont must not cache SkFont objects or hand out fonts on a null
 * typeface.
 *
 * The offline-blank bug: the old path (`useTypeface(require(...))` → Skia.Data
 * .fromURI) fetched the bundled TTF over HTTP from Metro in dev builds, so offline
 * the fonts never loaded and table text vanished (and, while the Canvas was gated
 * on font resolution, the whole Skia floor plan went blank). The fix loads the TTF
 * from the on-device asset via expo-asset + expo-file-system and builds the
 * SkTypeface from bytes — zero network dependency.
 *
 * Source-asserted (the real fonts need the native Skia + FS runtime; matches the
 * style of skiaTableLayerHookOrder.test.ts).
 */
import fs from "fs";
import path from "path";

const fontSource = fs.readFileSync(
  path.join(process.cwd(), "components", "tables", "skia", "skiaTableFont.ts"),
  "utf8",
);
const layerSource = fs.readFileSync(
  path.join(process.cwd(), "components", "tables", "skia", "SkiaTableLayer.tsx"),
  "utf8",
);

describe("skiaTableFont network-free loading regression", () => {
  it("loads typefaces from bundled bytes, not over the network", () => {
    // Must NOT call Skia.Data.fromURI (the HTTP-fetch path); a comment mentioning
    // it is fine. Must read the bundled asset and build from bytes/base64.
    expect(fontSource).not.toMatch(/Skia\.Data\.fromURI/);
    expect(fontSource).toContain("expo-asset");
    expect(fontSource).toContain("MakeFreeTypeFaceFromData");
    expect(fontSource).toContain("export const loadTableTypefaces");
  });

  it("SkiaTableLayer loads fonts via the network-free loader, not useTypeface", () => {
    expect(layerSource).toContain("loadTableTypefaces");
    // No useTypeface HOOK CALL or import (a comment mentioning it is fine).
    expect(layerSource).not.toMatch(/useTypeface\s*\(/);
    expect(layerSource).not.toMatch(/import[^;]*useTypeface/);
  });

  it("does not keep a module-level SkFont cache across calls", () => {
    // A cached SkFont built on a since-disposed typeface is the dead-object trap.
    // Building fresh per call keeps each SkFont's lifetime tied to the draw.
    expect(fontSource).not.toMatch(/new Map<[^>]*SkFont/);
    expect(fontSource).not.toContain("fontCache");
  });

  it("getTableFont bails to null when no live typeface is set", () => {
    // Safe degradation: skip a text node instead of building a font on a null
    // typeface (shapes/structures still paint; text waits for the load).
    expect(fontSource).toContain("if (!tf) return null;");
  });
});
