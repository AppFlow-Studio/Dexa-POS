/**
 * Regression: SkiaTableLayer must not blank the entire Canvas on a re-render.
 *
 * The bug: a `return null` guard for a 0-width viewport sat ABOVE the `useRef`
 * that latched font resolution. A sidebar collapse/expand relayout emits an
 * intermediate 0-width onLayout frame (and a timed refetch re-renders through
 * it), so on that frame the early return changed the hook count → React tore
 * down and remounted the component, blanking every table.
 *
 * Fix invariants (source-asserted — the component needs the Skia native runtime
 * to render, so we assert structure rather than mounting it):
 *  1. Every `return null` bail sits AFTER all hooks (no conditional hooks).
 *  2. The viewport guard only bails before the FIRST successful mount (latched),
 *     so a later transient 0-dim keeps the last good frame.
 */
import fs from "fs";
import path from "path";

const source = fs.readFileSync(
  path.join(process.cwd(), "components", "tables", "skia", "SkiaTableLayer.tsx"),
  "utf8",
);

describe("SkiaTableLayer hook-order / blank-canvas regression", () => {
  it("latches viewport validity in a ref before any early return", () => {
    expect(source).toContain("const viewportEverValid = useRef(false)");
  });

  it("only bails before the first successful mount (transient 0-dim keeps last frame)", () => {
    expect(source).toContain(
      "if (!viewportEverValid.current && !viewportValid) return null;",
    );
  });

  it("does NOT gate the Canvas on font resolution (offline-blank regression)", () => {
    // Table shapes + structures are pure geometry and must paint without fonts;
    // only <Text> waits for the typefaces. Gating the whole Canvas on fonts blanked
    // the entire Skia floor plan offline (fonts used to be fetched over the
    // network). So there must be NO `return null` driven by fonts.
    expect(source).not.toMatch(/!fontsResolved[^;]*return null/);
    expect(source).not.toMatch(/!fontsReady[^;]*return null/);
  });

  it("has no `return null` above the last hook call (no conditional hooks)", () => {
    const lastHookIdx = Math.max(
      source.lastIndexOf("useRef("),
      source.lastIndexOf("useDerivedValue("),
      source.lastIndexOf("useState("),
      source.lastIndexOf("useEffect("),
      source.lastIndexOf("useTableDrawStore("),
    );
    const firstReturnNullIdx = source.indexOf("return null;");
    expect(firstReturnNullIdx).toBeGreaterThan(lastHookIdx);
  });
});
