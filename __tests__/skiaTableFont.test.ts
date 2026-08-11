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
const tableSource = fs.readFileSync(
  path.join(process.cwd(), "components", "tables", "skia", "SkiaTable.tsx"),
  "utf8",
);
const contentSource = fs.readFileSync(
  path.join(process.cwd(), "components", "tables", "skia", "SkiaTableContent.tsx"),
  "utf8",
);
const structureSource = fs.readFileSync(
  path.join(process.cwd(), "components", "tables", "skia", "SkiaStructure.tsx"),
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

/**
 * Regression: "only some tables have text until I switch floor plans".
 *
 * getTableFont() reads module-level typefaces, so when the async load finishes it
 * changes NO React prop. SkiaTable / SkiaTableContent / SkiaStructure are all
 * React.memo, so a re-render of SkiaTableLayer alone bails out on every child and
 * their already-computed textless output (every text node returned null while the
 * fonts were loading) is kept forever. Only tables whose draw data happened to
 * change after the load — or a full remount, i.e. a floor switch — got text.
 *
 * The fix is to thread `fontsReady` down as a real prop so memo is invalidated.
 * These tests assert the prop is actually PASSED, not merely referenced.
 */
describe("fonts-ready must invalidate the memoized Skia children", () => {
  it("SkiaTableLayer passes fontsReady down to both memoized children", () => {
    expect(layerSource).toMatch(/fontsReady=\{fontsReady\}/);
    // Both consumers of getTableFont must receive it: tables and structures.
    const passes = layerSource.match(/fontsReady=\{fontsReady\}/g) ?? [];
    expect(passes.length).toBeGreaterThanOrEqual(2);
    // `void fontsReady` was the broken no-op: it re-rendered only the layer.
    expect(layerSource).not.toMatch(/void\s+fontsReady/);
  });

  it("SkiaTable forwards fontsReady to SkiaTableContent", () => {
    expect(tableSource).toMatch(/fontsReady:\s*boolean/);
    expect(tableSource).toMatch(/fontsReady=\{fontsReady\}/);
  });

  it("memoized font consumers declare a fontsReady prop", () => {
    // Without the prop in the signature, memo has nothing to compare and the
    // textless render sticks.
    expect(contentSource).toMatch(/fontsReady:\s*boolean/);
    expect(structureSource).toMatch(/fontsReady:\s*boolean/);
  });
});
