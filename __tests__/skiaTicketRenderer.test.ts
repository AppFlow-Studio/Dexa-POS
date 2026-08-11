/**
 * Regression: renderTextBlocksToImage must dispose EVERY per-call native Skia
 * object (Surface, Image, and all Paint/Font) on every exit path.
 *
 * The blank-canvas bug it guards: per-call Skia objects hold GPU/EGL-backed native
 * memory that the Hermes GC never reclaims. Undisposed, they accumulate across
 * print jobs, starve the shared Skia GL context, and Android reclaims OTHER
 * on-screen Canvases (e.g. the floor plan) — the whole surface goes blank
 * mid-session and never recovers until process restart.
 *
 * Source-asserted (the real Skia objects need the native runtime; matches the
 * style of skiaTableFont.test.ts / skiaTableLayerHookOrder.test.ts).
 */
import fs from "fs";
import path from "path";

const source = fs.readFileSync(
  path.join(
    process.cwd(),
    "services",
    "printing",
    "renderers",
    "SkiaTicketRenderer.ts",
  ),
  "utf8",
);

// Isolate the renderTextBlocksToImage body so counts don't include the font-cache
// helpers above it.
const renderBody = source.slice(source.indexOf("export async function renderTextBlocksToImage"));

const count = (re: RegExp) => (renderBody.match(re) || []).length;

describe("SkiaTicketRenderer dispose invariant", () => {
  it("wraps the render body in try/finally", () => {
    expect(renderBody).toMatch(/\btry\s*\{/);
    expect(renderBody).toMatch(/\}\s*finally\s*\{/);
  });

  it("disposes the surface and image in the finally (survives every early return)", () => {
    // The image-null and png-too-small early returns sit INSIDE the try, so the
    // finally still runs and releases the surface + tracked objects.
    expect(renderBody).toMatch(/surface\.dispose\?\.\(\)/);
    expect(renderBody).toMatch(/image\?\.dispose\?\.\(\)/);
    expect(renderBody).toMatch(/for \(const d of disposables\)/);
    expect(renderBody).toMatch(/d\.dispose\?\.\(\)/);
  });

  it("tracks every per-call Skia.Paint() for disposal (no untracked paints)", () => {
    const totalPaints = count(/Skia\.Paint\(\)/g);
    const trackedPaints = count(/track\(Skia\.Paint\(\)\)/g);
    expect(totalPaints).toBeGreaterThan(0);
    expect(trackedPaints).toBe(totalPaints);
  });

  it("tracks every per-call Skia.Font() for disposal (no untracked fonts)", () => {
    const totalFonts = count(/Skia\.Font\(/g);
    const trackedFonts = count(/track\(Skia\.Font\(/g);
    expect(totalFonts).toBeGreaterThan(0);
    expect(trackedFonts).toBe(totalFonts);
  });

  it("does not dispose the module-level cached typefaces (they are reused)", () => {
    // Cached typefaces (getTypeface / loadCustomTypeface) are process-wide and must
    // NOT be disposed per call — that would dangle the shared face.
    expect(renderBody).not.toMatch(/cachedRegularTypeface\.dispose/);
    expect(renderBody).not.toMatch(/cachedBoldTypeface\.dispose/);
    expect(renderBody).not.toMatch(/cachedCustomTypeface\.dispose/);
  });
});
