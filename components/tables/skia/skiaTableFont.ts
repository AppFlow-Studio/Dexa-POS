import {
  FontHinting,
  FontWeight,
  SkFont,
  Skia,
  SkTypeface,
} from "@shopify/react-native-skia";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system/legacy";

/**
 * Font provider for the Skia floor-plan text.
 *
 * OFFLINE-SAFE loading: typefaces are read from the BUNDLED Inter TTF bytes on
 * device, never fetched over the network. The old path (useTypeface + the Skia
 * Data URI fetch) resolved the asset to an http://<metro>/assets URL in dev builds
 * and fetched it — so offline the fonts never loaded and (because the Canvas used
 * to gate on font resolution) the whole Skia floor plan went blank. Here we use
 * expo-asset to get the local bundled file and expo-file-system to read its bytes,
 * then build the SkTypeface from base64 — zero network dependency.
 */

export interface TableTypefaces {
  regular: SkTypeface | null; // Inter-Medium (used for 400/600)
  bold: SkTypeface | null; // Inter-Bold (used for 700/800)
}

let current: TableTypefaces = { regular: null, bold: null };

// System typefaces, resolved synchronously from Skia's own font manager. These are
// the SAFETY NET: the bundled-Inter path is async and has several ways to fail on
// device (asset:// URIs that expo-file-system can't read in a release build, an
// asset that never unpacks, a FreeType parse failure). When it fails, every
// getTableFont call used to return null and NO text rendered at all — shapes but
// no labels, for the whole session. The system font manager needs no asset, no
// filesystem and no network, so we seed `current` with it on first use and let the
// nicer Inter typefaces replace it once/if they load.
let systemTried = false;
let systemFaces: TableTypefaces = { regular: null, bold: null };

const getSystemTypefaces = (): TableTypefaces => {
  if (systemTried) return systemFaces;
  systemTried = true;
  try {
    const mgr = Skia.FontMgr.System();
    // Empty family name = "give me the default family for this style", which is
    // what we want; Android/iOS default UI faces are close enough to Inter.
    systemFaces = {
      regular: mgr.matchFamilyStyle("", { weight: FontWeight.Normal }) ?? null,
      bold: mgr.matchFamilyStyle("", { weight: FontWeight.Bold }) ?? null,
    };
  } catch (e) {
    console.warn("[skiaTableFont] system font manager unavailable", e);
    systemFaces = { regular: null, bold: null };
  }
  return systemFaces;
};

// Module-level load guard: the typefaces are process-wide (a bundled asset never
// changes), so load once and share. `loadPromise` dedups concurrent callers; once
// resolved, `current` holds live typefaces and callers can use them synchronously.
let loadPromise: Promise<TableTypefaces> | null = null;
// True only when BOTH bundled Inter faces loaded; system fallbacks don't count,
// so a later mount can still retry and upgrade.
let bundledLoaded = false;

const readTypefaceFromModule = async (
  mod: number,
): Promise<SkTypeface | null> => {
  let uri: string | null = null;
  try {
    const asset = Asset.fromModule(mod);
    // For a BUNDLED asset this resolves to the on-device file (localUri) without
    // hitting the network in a release build; in dev it caches to the local FS.
    await asset.downloadAsync();
    uri = asset.localUri ?? asset.uri ?? null;
    if (!uri) {
      console.warn("[skiaTableFont] asset has no uri", mod);
      return null;
    }
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const data = Skia.Data.fromBase64(base64);
    const tf = Skia.Typeface.MakeFreeTypeFaceFromData(data);
    if (!tf) console.warn("[skiaTableFont] FreeType rejected font bytes", uri);
    return tf;
  } catch (e) {
    // Do NOT swallow: a silent null here is exactly how "no text renders at all"
    // used to be undebuggable. Most likely cause on Android release builds is an
    // `asset://` localUri that expo-file-system can't read.
    console.warn("[skiaTableFont] failed to read bundled font", uri, e);
    return null;
  }
};

/**
 * Load the floor-plan typefaces from bundled bytes (network-free). Idempotent —
 * safe to call from every SkiaTableLayer mount; the first call does the work, the
 * rest await the same promise. On success sets the module `current` so getTableFont
 * works immediately.
 */
export const loadTableTypefaces = (): Promise<TableTypefaces> => {
  // Only short-circuit once the real bundled faces are in place — `current` may
  // hold system fallbacks from an earlier failed attempt, which we still want to
  // upgrade on a later mount.
  if (bundledLoaded) return Promise.resolve(current);
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    const [regular, bold] = await Promise.all([
      readTypefaceFromModule(require("@/assets/fonts/Inter-Medium.ttf")),
      readTypefaceFromModule(require("@/assets/fonts/Inter-Bold.ttf")),
    ]);
    // Fall back per-slot: a partial success (e.g. only Inter-Bold read) still
    // beats losing all text, and the system face covers the missing slot.
    const sys = regular && bold ? null : getSystemTypefaces();
    current = {
      regular: regular ?? sys?.regular ?? null,
      bold: bold ?? sys?.bold ?? null,
    };
    bundledLoaded = !!regular && !!bold;
    // If either failed (shouldn't for a bundled asset), allow a later retry.
    if (!bundledLoaded) loadPromise = null;
    return current;
  })();
  return loadPromise;
};

/** Called by SkiaTableLayer once the typefaces resolve. */
export const setTableTypefaces = (tf: TableTypefaces) => {
  current = tf;
};

// NOTE (typeface lifetime): with the bundled-bytes loader above, the SkTypeface
// objects are owned by THIS module (built from Skia.Data we hold), NOT by a
// per-component `useTypeface` hook. So they are NOT auto-disposed when a
// SkiaTableLayer instance unmounts — they're process-wide and safe to reuse across
// floor switches / skia-mode toggles / remounts. There is deliberately no
// clear-on-unmount anymore: doing so would drop live, still-valid typefaces and
// force a needless reload. (The old clearTableTypefaces existed because
// useTypeface-owned typefaces WERE disposed on unmount and left `current` dangling.)

// IMPORTANT: build a fresh SkFont per call, no module-level cache. rn-skia 2.x
// auto-disposes native objects tied to the component/node that created them; a
// cached SkFont built from a typeface loaded by a since-unmounted SkiaTableLayer
// (e.g. a floor switch) can go dead while the Map still hands it out, silently
// killing the Skia render loop for the rest of the app session (see the identical
// bug fixed for the SVG cache in SkiaStructure.tsx). Skia.Font() is µs-cheap.
export const getTableFont = (
  size: number,
  weight: "400" | "600" | "700" | "800",
): SkFont | null => {
  const bold = weight === "700" || weight === "800";
  let tf = bold ? current.bold : current.regular;
  if (!tf) {
    // Bundled Inter hasn't landed (or failed). Draw with the system face rather
    // than returning null — every Text call site skips on null, so returning null
    // here means no labels at all on the floor plan.
    const sys = getSystemTypefaces();
    tf = bold ? sys.bold ?? sys.regular : sys.regular ?? sys.bold;
  }
  if (!tf) return null;

  const px = Math.max(1, Math.round(size));
  const font = Skia.Font(tf, px);
  // Grid-fit hinting snaps each glyph's outline (and advance width) to the
  // pixel grid independently at this exact integer size, which is what reads
  // as uneven letter spacing across a word. Disabling hinting + enabling
  // linear (unhinted) metrics keeps glyph advances float-precise/consistent.
  font.setHinting(FontHinting.None);
  font.setLinearMetrics(true);
  return font;
};

export const measureWidth = (font: SkFont, text: string): number => {
  try {
    return font.getTextWidth(text);
  } catch {
    return text.length * font.getSize() * 0.55;
  }
};
