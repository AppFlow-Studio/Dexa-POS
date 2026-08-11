// services/printing/utils/tempImageCleanup.ts
//
// Lifecycle for the PNGs the Star raster path writes into the cache directory.
//
// Star printing is 100% raster (StarXpandRenderer forces graphics mode), so
// every receipt and kitchen ticket writes one PNG per ~1200px chunk — typically
// 3–4 files per receipt — plus one per logo node. The Star SDK reads those files
// by URI during `printer.print(commands)`, so they cannot be deleted at render
// time; before this module nothing deleted them at all and the cache directory
// grew for the life of the install.
//
// Two mechanisms, deliberately layered:
//   1. `deleteTempImages` — the normal path. The driver unlinks the exact files
//      it rendered once the SDK has consumed them (success or failure).
//   2. `sweepOrphanTempImages` — the safety net for files whose driver call was
//      killed mid-print (process death, force-release of a stuck drain). Runs
//      when a drain goes idle, throttled so it costs nothing during a rush.
//
// Files are aged by the timestamp embedded in their name rather than a
// `getInfoAsync` per file — one native call for the whole sweep instead of N.

import * as FileSystem from "expo-file-system";

/** Rendered ticket/receipt chunks (SkiaTicketRenderer). */
export const TEMP_IMAGE_PREFIX = "star-ticket-";
/** Rendered logo nodes (StarXpandRenderer). */
export const TEMP_LOGO_PREFIX = "receipt-logo-";

const PREFIXES = [TEMP_IMAGE_PREFIX, TEMP_LOGO_PREFIX];

/** Orphans older than this are fair game — comfortably past any in-flight print
 *  (Star open timeout 12s + print 30s + the 13.5s in-use backoff ladder). */
const ORPHAN_MAX_AGE_MS = 10 * 60 * 1000;
/** Don't re-walk the cache directory more often than this. */
const SWEEP_MIN_INTERVAL_MS = 5 * 60 * 1000;

/** Monotonic suffix so two renders inside one millisecond can't collide. */
let tempImageSeq = 0;
export function nextTempImageSeq(): number {
  return tempImageSeq++;
}

let lastSweepAt = 0;
let sweepInFlight = false;

/**
 * Delete temp images the caller rendered, after the printer SDK has consumed
 * them. Never throws — a failed unlink is picked up by the orphan sweep.
 */
export async function deleteTempImages(uris: readonly string[]): Promise<void> {
  if (uris.length === 0) return;
  await Promise.all(
    uris.map(async (uri) => {
      try {
        await FileSystem.deleteAsync(uri, { idempotent: true });
      } catch (e) {
        console.warn("[tempImageCleanup] Failed to delete", uri, e);
      }
    }),
  );
}

/**
 * Delete stale rendered images left behind by prints that never reached their
 * cleanup (crash, force-released drain). Throttled and re-entrancy guarded;
 * safe to call on every idle transition. Returns the number of files deleted.
 */
export async function sweepOrphanTempImages(
  maxAgeMs: number = ORPHAN_MAX_AGE_MS,
): Promise<number> {
  const now = Date.now();
  if (sweepInFlight || now - lastSweepAt < SWEEP_MIN_INTERVAL_MS) return 0;
  sweepInFlight = true;
  lastSweepAt = now;

  try {
    const dir = FileSystem.cacheDirectory;
    if (!dir) return 0;

    const names = await FileSystem.readDirectoryAsync(dir);
    const stale = names.filter((name) => {
      const createdAt = parseTempImageTimestamp(name);
      return createdAt !== null && now - createdAt > maxAgeMs;
    });
    if (stale.length === 0) return 0;

    await deleteTempImages(stale.map((name) => `${dir}${name}`));
    console.log(`[tempImageCleanup] Swept ${stale.length} orphan print images`);
    return stale.length;
  } catch (e) {
    console.warn("[tempImageCleanup] Orphan sweep failed:", e);
    return 0;
  } finally {
    sweepInFlight = false;
  }
}

/**
 * Epoch ms encoded in a rendered-image filename, or null if the name isn't one
 * of ours. Only files we recognise are ever deleted — the cache directory is
 * shared with expo-asset, image caches, and anything else in the app.
 */
function parseTempImageTimestamp(name: string): number | null {
  if (!name.endsWith(".png")) return null;
  const prefix = PREFIXES.find((p) => name.startsWith(p));
  if (!prefix) return null;
  // `<prefix><epochMs>[-<seq>].png`
  const rest = name.slice(prefix.length, -".png".length);
  const digits = rest.split("-")[0];
  if (!/^\d+$/.test(digits)) return null;
  const ts = Number(digits);
  return Number.isFinite(ts) && ts > 0 ? ts : null;
}
