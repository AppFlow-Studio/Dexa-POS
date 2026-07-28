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

  it("falls back to the system font manager when the bundled font is unavailable", () => {
    // The "no text renders AT ALL" bug: if the bundled-Inter read fails on device
    // (asset:// uri, unpack failure, FreeType reject), getTableFont returned null
    // forever and every Text call site skipped. The system font manager needs no
    // asset, no filesystem and no network, so it must back-stop the Inter path.
    expect(fontSource).toContain("Skia.FontMgr.System()");
    expect(fontSource).toContain("getSystemTypefaces");
    // ...and getTableFont must consult it before giving up.
    const body = fontSource.slice(fontSource.indexOf("export const getTableFont"));
    expect(body).toMatch(/getSystemTypefaces\(\)[\s\S]*if \(!tf\) return null;/);
  });

  it("only short-circuits the loader once the real bundled faces are in place", () => {
    // Otherwise a system fallback stored in `current` would permanently block the
    // retry that upgrades to Inter.
    expect(fontSource).toContain("if (bundledLoaded) return Promise.resolve(current);");
  });

  it("does not silently swallow bundled-font read failures", () => {
    expect(fontSource).not.toMatch(/\}\s*catch\s*\{\s*return null;\s*\}/);
  });
});
