import * as FileSystem from 'expo-file-system'

const IMAGE_DIR = `${FileSystem.documentDirectory}menu-images/`

async function ensureDir () {
  const info = await FileSystem.getInfoAsync(IMAGE_DIR)
  if (!info.exists) {
    await FileSystem.makeDirectoryAsync(IMAGE_DIR, { intermediates: true })
  }
}

/**
 * Given a raw value from the DB `image` column:
 * - If it's a base64 blob (>200 chars, no "://"), write it to the filesystem
 *   and return a file:// URI so the JS heap never holds the pixel data.
 * - If it's already a URI (http/file), return as-is.
 * - Otherwise (short placeholder key), return as-is.
 */
export async function resolveMenuImage (
  itemId: string,
  raw: string | undefined | null
): Promise<string | undefined> {
  if (!raw) return undefined

  // Already a URI — no conversion needed
  if (raw.includes('://')) return raw

  // Short placeholder key — not an image blob
  if (raw.length <= 200) return raw

  // Base64 blob — write to filesystem
  const filename = `${itemId}.jpg`
  const path = IMAGE_DIR + filename

  try {
    await ensureDir()
    const info = await FileSystem.getInfoAsync(path)
    if (!info.exists) {
      await FileSystem.writeAsStringAsync(path, raw, {
        encoding: FileSystem.EncodingType.Base64,
      })
    }
    return path
  } catch {
    // If filesystem write fails, fall back to inline base64 rather than breaking the UI
    return `data:image/jpeg;base64,${raw}`
  }
}

/**
 * Delete cached image for a specific item (call when item is deleted or image updated).
 */
export async function evictMenuImage (itemId: string): Promise<void> {
  const path = IMAGE_DIR + `${itemId}.jpg`
  try {
    const info = await FileSystem.getInfoAsync(path)
    if (info.exists) await FileSystem.deleteAsync(path, { idempotent: true })
  } catch {}
}

/**
 * Clear entire menu image cache (call on sign-out or store switch).
 */
export async function clearMenuImageCache (): Promise<void> {
  try {
    const info = await FileSystem.getInfoAsync(IMAGE_DIR)
    if (info.exists) {
      await FileSystem.deleteAsync(IMAGE_DIR, { idempotent: true })
    }
  } catch {}
}
