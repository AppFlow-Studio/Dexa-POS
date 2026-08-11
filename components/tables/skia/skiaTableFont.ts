import {
  FontHinting,
  SkFont,
  Skia,
  SkTypeface,
} from "@shopify/react-native-skia";
import { Asset } from "expo-asset";
import * as FileSystem from "expo-file-system";

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

// Module-level load guard: the typefaces are process-wide (a bundled asset never
// changes), so load once and share. `loadPromise` dedups concurrent callers; once
// resolved, `current` holds live typefaces and callers can use them synchronously.
let loadPromise: Promise<TableTypefaces> | null = null;

const readTypefaceFromModule = async (
  mod: number,
  label: string,
): Promise<SkTypeface | null> => {
  try {
    const asset = Asset.fromModule(mod);
    // For a BUNDLED asset this resolves to the on-device file (localUri) without
    // hitting the network in a release build; in dev it caches to the local FS.
    await asset.downloadAsync();
    const uri = asset.localUri ?? asset.uri;
    if (!uri) {
      console.warn(`[skiaTableFont] ${label}: no localUri/uri after downloadAsync`);
      return null;
    }
    const base64 = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    const data = Skia.Data.fromBase64(base64);
    const tf = Skia.Typeface.MakeFreeTypeFaceFromData(data);
    if (!tf) console.warn(`[skiaTableFont] ${label}: MakeFreeTypeFaceFromData returned null`);
    return tf;
  } catch (e) {
    console.warn(`[skiaTableFont] ${label}: failed to load`, e);
    return null;
  }
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// A cold-start asset copy (APK asset → app storage on first access) or a busy JS/FS
// thread can transiently fail this load — the historical symptom was fonts silently
// missing until the user switched floor plans, which just happened to remount
// SkiaTableLayer and call loadTableTypefaces() again. Retrying internally here means
// text recovers on its own without needing an unrelated remount to give it another
// chance.
const MAX_ATTEMPTS = 4;
const RETRY_DELAY_MS = 300;

/**
 * Load the floor-plan typefaces from bundled bytes (network-free). Idempotent —
 * safe to call from every SkiaTableLayer mount; the first call does the work, the
 * rest await the same promise. On success sets the module `current` so getTableFont
 * works immediately. Retries a few times on transient failure before giving up.
 */
export const loadTableTypefaces = (): Promise<TableTypefaces> => {
  if (current.regular && current.bold) return Promise.resolve(current);
  if (loadPromise) return loadPromise;
  loadPromise = (async () => {
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const [regular, bold] = await Promise.all([
        readTypefaceFromModule(
          require("@/assets/fonts/Inter-Medium.ttf"),
          "Inter-Medium",
        ),
        readTypefaceFromModule(
          require("@/assets/fonts/Inter-Bold.ttf"),
          "Inter-Bold",
        ),
      ]);
      if (regular && bold) {
        current = { regular, bold };
        return current;
      }
      if (attempt < MAX_ATTEMPTS) {
        console.warn(
          `[skiaTableFont] load attempt ${attempt} incomplete (regular=${!!regular} bold=${!!bold}), retrying`,
        );
        await delay(RETRY_DELAY_MS * attempt);
      }
    }
    console.warn("[skiaTableFont] all load attempts failed, will retry on next call");
    // Allow a later retry (e.g. a floor switch remount calling loadTableTypefaces
    // again) instead of caching the failure forever.
    loadPromise = null;
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
  const tf = bold ? current.bold : current.regular;
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
